#!/usr/bin/env python3
# scripts/build_wordcloud_network.py
# 聚合「全部」往期雷达原文，生成共现网络词云数据（带语境 / network 关系）。
#
# 关系定义（InfraNodus「带语境词云」思路）：
#   节点 = 关键词（大小 = TF-IDF 影响力，颜色 = 栏目四色）
#   边   = 两词出现在「同一篇雷达资讯」中共现一次，边权 = 共现次数
#   剪枝 = MIN_EDGE 阈值 + 每节点只保留两端都认定的 top-MAX_DEG 最强边（避免毛线团）
#          + 反孤岛救援：剪后仍孤立的词补回其权重最高的一条原始共现边（高频词不该没关联词）
#
# 为什么重扫原文而不复用 wordcloud-data.json 的 items：
#   build_wordcloud.py 里每个词的 items 只保留前 10 条（len(items)<10），
#   用它算共现会系统性低估边权。本脚本直接遍历 docs/radar-data.json +
#   docs/radar-archive/*.json，逐篇 tokenize，在「全量数据」上算真实共现。
#
# 前置：scripts/build_wordcloud.py（提供词表 / TF-IDF 权重 / 栏目色）
# 分词规则（词性白名单 / 停用词 / 英文复数归并）与 build_wordcloud.py 共用
#   scripts/wc_tokenize.py —— 要加减停用词改 scripts/stopwords_*.txt 即可，两处同时生效。
# 输出：docs/wordcloud-network.json
# 每周与雷达更新一同运行即可自动并入新一期。
import json, pathlib, datetime, itertools
from collections import defaultdict

from wc_tokenize import (  # 与 build_wordcloud.py 共用同一套分词规则
    tok_zh as _tok_zh, tok_en as _tok_en, canon_en, load_stopwords,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ARCHIVE = DOCS / "radar-archive"
RADAR = DOCS / "radar-data.json"
WC_DATA = DOCS / "wordcloud-data.json"
NET_OUT = DOCS / "wordcloud-network.json"

TOP = 48        # 取词表里前 N 个高影响力词构图（2026-10-27 由 40 上调，画面更饱满灵动）
MIN_EDGE = 2    # 共现次数阈值（>= 才连线）
MAX_DEG = 7     # 每节点最多保留的最强共现边数
RESCUE = True   # 反孤岛：孤立词补回最强原始共现边（weight>=1）

SW_ZH, SW_EN = load_stopwords()

def tok_zh(text):
    return _tok_zh(text, SW_ZH)

def tok_en(text):
    return _tok_en(text, SW_EN)

# ---------- 1. 从 wordcloud-data.json 取权威词表 ----------
if not WC_DATA.exists():
    raise SystemExit("请先运行 scripts/build_wordcloud.py 生成 %s" % WC_DATA.name)
wc = json.loads(WC_DATA.read_text(encoding="utf-8"))
N_PERIODS = wc.get("periods", 0)

# 节点字段只带前端真正用到的：tfidf(字号) / count(资讯条数) / cat(着色)。
# size 是 build_wordcloud 给「词云字体」算的，网络图按 tfidf 自己算字号，不重复携带。
vocab = {}      # lang -> {word: {tfidf,count,cat}}
order = {}      # lang -> [word]（按 TF-IDF 降序，已截断到 TOP）
for lang in ("zh", "en"):
    words = wc.get(lang, [])[:TOP]
    vocab[lang] = {w["text"]: {k: w[k] for k in ("tfidf", "count", "cat")} for w in words}
    order[lang] = [w["text"] for w in words]

# ---------- 2. 全量重扫雷达原文，统计共现 ----------
files = [RADAR] + sorted(ARCHIVE.glob("*.json"))
pair_w = {"zh": defaultdict(int), "en": defaultdict(int)}
scanned_files = 0

for f in files:
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        continue
    if "columns" not in d:
        continue
    scanned_files += 1
    for col in d.get("columns", []):
        for it in col.get("items", []):
            zh_txt = (it.get("title", {}).get("zh", "") + " " + it.get("desc", {}).get("zh", ""))
            en_txt = (it.get("title", {}).get("en", "") + " " + it.get("desc", {}).get("en", ""))
            for lang, txt in (("zh", zh_txt), ("en", en_txt)):
                v = vocab[lang]
                if lang == "zh":
                    present = set(tok_zh(txt)) & set(v)
                else:
                    present = {c for c in (canon_en(t, v) for t in set(tok_en(txt))) if c}
                if len(present) < 2:
                    continue
                for a, b in itertools.combinations(sorted(present), 2):
                    pair_w[lang][(a, b)] += 1

# ---------- 3. 剪枝：阈值 + 两端都保留的最强边（AND） ----------
def build_net(lang):
    words = order[lang]
    adj = defaultdict(list)
    for (a, b), w in pair_w[lang].items():
        if w < MIN_EDGE or a not in vocab[lang] or b not in vocab[lang]:
            continue
        adj[a].append((b, w)); adj[b].append((a, w))
    keep = set()
    for n in adj:
        for nb, w in sorted(adj[n], key=lambda x: -x[1])[:MAX_DEG]:
            keep.add((n, nb, w))
    links = [{"source": a, "target": b, "weight": w}
             for (a, b), w in pair_w[lang].items()
             if w >= MIN_EDGE and (a, b, w) in keep and (b, a, w) in keep
             and a in vocab[lang] and b in vocab[lang]]
    linked = {l["source"] for l in links} | {l["target"] for l in links}
    # ---- 反孤岛救援 pass ----
    # 阈值 + 双向 top-N 剪枝会误伤「每期搭档都不同」的词（如「方向」17 条资讯、
    # 但零个词对共现 >= 2）。对剪后仍孤立的词，补回它权重最高的一条原始共现边
    # （weight >= 1，对端须在词表内），保证高频词至少有 1 条关联。
    rescued = []
    if RESCUE:
        for w in words:
            if w in linked:
                continue
            best_wt, best_nb = 0, None
            for (a, b), wt in pair_w[lang].items():
                if a == w and b in vocab[lang]:
                    pass
                elif b == w and a in vocab[lang]:
                    b = a
                else:
                    continue
                if wt > best_wt:
                    best_wt, best_nb = wt, b
            if best_nb:
                links.append({"source": w, "target": best_nb, "weight": best_wt})
                linked.add(w); linked.add(best_nb)
                rescued.append(w)
    # 边按「权重降序 + 词面」定序：pair_w 是 dict，直接输出会随哈希顺序漂移（同 build_wordcloud）。
    links.sort(key=lambda l: (-l["weight"], l["source"], l["target"]))
    # 保留全部 TOP 词作为节点（无连线的词仍显示，只是不画边），
    # 兼顾「词云要看全」与「网络看关系」两件事。
    nodes = [{"text": w, **vocab[lang][w]} for w in words]
    isolated = [w for w in words if w not in linked]
    return {"nodes": nodes, "links": links, "isolated": isolated, "rescued": rescued}

result = {
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"),
    "periods": N_PERIODS,
    "params": {"top": TOP, "min_edge": MIN_EDGE, "max_deg": MAX_DEG, "rescue": RESCUE},
    "zh": build_net("zh"),
    "en": build_net("en"),
}
NET_OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

print("OK periods=%d files=%d -> %s" % (N_PERIODS, scanned_files, NET_OUT.name))
for lang in ("zh", "en"):
    n, l = len(result[lang]["nodes"]), len(result[lang]["links"])
    iso = result[lang]["isolated"]
    rsc = result[lang]["rescued"]
    top = sorted(result[lang]["nodes"], key=lambda x: -x["tfidf"])[:6]
    print("  %s: nodes=%d links=%d rescued=%d%s isolated=%d%s | top=%s" %
          (lang, n, l, len(rsc), (" (%s)" % ",".join(rsc) if rsc else ""),
           len(iso), (" (%s)" % ",".join(iso) if iso else ""),
           ", ".join("%s(%.0f)" % (t["text"], t["tfidf"]) for t in top)) or "")
