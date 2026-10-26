#!/usr/bin/env python3
# scripts/build_wordcloud.py
# 聚合全部"本周供应链雷达"内容，提取中英关键词。
# 改进（2026-10-27）：
#  - 中文用 jieba.posseg 仅保留核心实词（名词 / 专名 / 动名词 / 英文 token），剔除动词、副词、介词等无实义词；
#  - 以「每一期雷达 = 一个文档」计算 TF-IDF：跨期高频但每期都出现的泛词被 IDF 降权，
#    只在少数几期突出的核心事件词被放大 → 词更准确、更聚焦；
#  - 停用词 / 主题词 denylist 持续扩充（见 scripts/stopwords_*.txt）。
# 输出 docs/wordcloud-data.json（词云页面通过同源 fetch 读取，不再内联 index.html）。
# 每周与雷达更新一同运行即可自动并入新一期。
import json, re, glob, pathlib, datetime, math
from collections import defaultdict
import jieba
import jieba.posseg as pseg

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ARCHIVE = DOCS / "radar-archive"
RADAR = DOCS / "radar-data.json"
DATA_OUT = DOCS / "wordcloud-data.json"
SW_ZH = ROOT / "scripts" / "stopwords_zh.txt"
SW_EN = ROOT / "scripts" / "stopwords_en.txt"

TOP_N = 80  # 每语言保留前 N 个关键词

# 中文仅保留这些词性的「核心实词」；其余（动词 v、形容词 a、副词 d、
# 代词 r、介词 p、连词 c、助词 u、数词 m、量词 q 等）一律剔除。
ZH_POS_KEEP = {
    "n",   # 名词
    "nr",  # 人名
    "ns",  # 地名
    "nt",  # 机构名
    "nz",  # 其他专名
    "nl",  # 名词性惯用语
    "ng",  # 名词语素
    "vn",  # 动名词
    "l",   # 惯用语
    "eng", # 中文文本里的英文 token（AI / GPT / US …）
}

PUNCT = set("，。、；：！？（）《》【】“”‘’%0123456789.,:;!?()[]\"")

def load_sw(p):
    if not p.exists():
        return set()
    out = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line)
    return out

SW_ZH = load_sw(SW_ZH)
SW_EN = load_sw(SW_EN)
# 领域降权 / 主题词：每期都出现、信息量低
DENY = {"supply", "chain", "chains", "supplychain", "logistics", "logistic",
        "供应链", "物流", "链条"}

EN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]*")

def tok_zh(text):
    out = []
    for w, flag in pseg.cut(text):
        w = w.strip()
        if len(w) < 2:
            continue
        if w in SW_ZH or w in DENY:
            continue
        if flag not in ZH_POS_KEEP:
            continue
        if all(ch in PUNCT for ch in w):
            continue
        out.append(w)
    return out

def tok_en(text):
    out = []
    for w in EN_RE.findall(text.lower()):
        if w in SW_EN or w in DENY:
            continue
        if len(w) < 2:
            continue
        out.append(w)
    return out

# global[lang][word] = {total: 出现的新闻条数, df: 出现的期数, cats, items}
global_idx = {
    "zh": defaultdict(lambda: {"total": 0, "df": 0, "cats": defaultdict(int), "items": []}),
    "en": defaultdict(lambda: {"total": 0, "df": 0, "cats": defaultdict(int), "items": []}),
}

files = [RADAR] + sorted(ARCHIVE.glob("*.json"))
N_PERIODS = 0
for f in files:
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        continue
    if "columns" not in d:
        continue
    N_PERIODS += 1
    date = (d.get("updatedAt") or "")[:10]
    period_set = {"zh": set(), "en": set()}
    for col in d["columns"]:
        cat = col.get("color", "#888")
        for it in col.get("items", []):
            zh = (it.get("title", {}).get("zh", "") + " " + it.get("desc", {}).get("zh", ""))
            en = (it.get("title", {}).get("en", "") + " " + it.get("desc", {}).get("en", ""))
            ref = {
                "date": date,
                "cat": cat,
                "titleZh": it.get("title", {}).get("zh", ""),
                "titleEn": it.get("title", {}).get("en", ""),
                "url": (it.get("sources", [{}])[0].get("url", "")) if it.get("sources") else "",
            }
            for t in set(tok_zh(zh)):
                a = global_idx["zh"][t]
                a["total"] += 1
                a["cats"][cat] += 1
                if len(a["items"]) < 10:
                    a["items"].append(ref)
                period_set["zh"].add(t)
            for t in set(tok_en(en)):
                a = global_idx["en"][t]
                a["total"] += 1
                a["cats"][cat] += 1
                if len(a["items"]) < 10:
                    a["items"].append(ref)
                period_set["en"].add(t)
    for lang in ("zh", "en"):
        for t in period_set[lang]:
            global_idx[lang][t]["df"] += 1

def merge_plurals(lang):
    """英文复数去重：若 'rates' 与 'rate' 同时存在，把复数并入单数后删除复数，
    避免同一实词被单/复数拆分稀释权重。'us'→'u' 之类不会触发（u 不在词表）。"""
    g = global_idx[lang]
    for p in list(g.keys()):
        if len(p) > 3 and p.endswith("s") and not p.endswith("ss"):
            s = p[:-1]
            if s in g and s != p:
                for k in ("total", "df"):
                    g[s][k] += g[p][k]
                for c, n in g[p]["cats"].items():
                    g[s]["cats"][c] += n
                seen = {i.get("url") for i in g[s]["items"]}
                for i in g[p]["items"]:
                    if i.get("url") not in seen and len(g[s]["items"]) < 10:
                        g[s]["items"].append(i); seen.add(i.get("url"))
                del g[p]

for lang in ("zh", "en"):
    merge_plurals(lang)

def idf(df, N):
    # 平滑 IDF：跨期都出现的词 df→N，IDF→1（不放大）；只在一两期出现的词 IDF 高
    return math.log((N + 1) / (df + 1)) + 1

def build(lang):
    g = global_idx[lang]
    scored = []
    for t, a in g.items():
        if a["total"] < 2:        # 至少被 2 条新闻提到，避免偶发噪声
            continue
        score = a["total"] * idf(a["df"], N_PERIODS)
        scored.append((t, score, a))
    scored.sort(key=lambda x: -x[1])
    top = scored[:TOP_N]
    if not top:
        return []
    scores = [s for _, s, _ in top]
    maxs, mins = max(scores), min(scores)
    out = []
    for t, score, a in top:
        dom = max(a["cats"].items(), key=lambda kv: kv[1])[0] if a["cats"] else "#888"
        size = 14 + int(50 * (score - mins) / (maxs - mins)) if maxs > mins else 32
        out.append({
            "text": t,
            "size": size,
            "cat": dom,
            "count": a["total"],
            "tfidf": round(score, 2),
            "items": a["items"],
        })
    return out

result = {
    "updatedAt": datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds"),
    "periods": N_PERIODS,
    "zh": build("zh"),
    "en": build("en"),
}

DATA_OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

print("OK periods=%d  zh=%d en=%d  -> %s" % (N_PERIODS, len(result["zh"]), len(result["en"]), DATA_OUT))
print("TOP zh:", ", ".join("%s(%.1f)" % (t["text"], t["tfidf"]) for t in result["zh"][:18]))
print("TOP en:", ", ".join("%s(%.1f)" % (t["text"], t["tfidf"]) for t in result["en"][:18]))
