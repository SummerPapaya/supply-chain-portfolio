#!/usr/bin/env python3
# scripts/build_chainscope.py
# ChainScope 端到端供应链战略信号台 —— 数据构建。
#
# 唯一数据源：docs/radar-data.json（当前期）+ docs/radar-archive/2026-*.json（历史期）。
# 不读取任何外部接口、不引入任何其他数据集（本站红线：禁止跨数据源传值）。
#
# 产出 docs/reports/chainscope/signal-data.json，页面通过同源 fetch 读取。
# 每次雷达周更后重跑本脚本即可并期；脚本不做任何人工数值填充，
# 所有指标均由「条目 / 来源链接数 / 核验标记 / 规则命中」推导，浏览器内可逐项复算。
#
# 运行：python3 scripts/build_chainscope.py

import json
import pathlib
import re
import datetime
from collections import Counter, defaultdict

from chainscope_rules import (
    STAGES, ENABLE, STAGE_TERMS, RISKS, RISK_TERMS, CATS,
    DESC_MIN_HITS, DESC_CHARS,
)
from chainscope_playbooks import PLAYBOOKS, PLAYBOOK_NOTE

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ARCHIVE = DOCS / "radar-archive"
RADAR = DOCS / "radar-data.json"
OUT = DOCS / "reports" / "chainscope" / "signal-data.json"

BASELINE_WINDOW = 4          # 异动检测：前 4 期滚动基线
ANOMALY_TOP = 8              # 异动榜保留条数

STAGE_KEYS = [s["key"] for s in STAGES]
RISK_KEYS = [r["key"] for r in RISKS]
DIM_KEYS = STAGE_KEYS + [ENABLE["key"]] + RISK_KEYS

# 预编译英文词边界正则（中文走子串）
_EN_RE = {}
for group, terms in {**STAGE_TERMS, **{("risk_" + k): v for k, v in RISK_TERMS.items()}}.items():
    _EN_RE[group] = [
        (t, re.compile(r"(?<![a-z0-9])" + re.escape(t.lower()) + r"(?![a-z0-9])"))
        for t in terms["en"]
    ]


def hits_in(zh_text, en_text, terms, group):
    """返回 (中文命中词, 英文命中词)。中文子串、英文词边界，均大小写不敏感。"""
    zl, el = zh_text.lower(), en_text.lower()
    hz = [t for t in terms["zh"] if t.lower() in zl]
    he = [pat for pat, rx in _EN_RE[group] if rx.search(el)]
    return hz, he


def classify(item):
    """给一条雷达新闻打 SCOR 环节 + 风险类型标签，并保留全部命中词供页面复核。"""
    tzh = item.get("title", {}).get("zh", "") or ""
    ten = item.get("title", {}).get("en", "") or ""
    dzh = (item.get("desc", {}).get("zh", "") or "")[:DESC_CHARS]
    den = (item.get("desc", {}).get("en", "") or "")[:DESC_CHARS * 2]

    stages, risks, enable, all_hits = [], [], False, {}

    for key in STAGE_KEYS + [ENABLE["key"]]:
        terms = STAGE_TERMS[key]
        hz_t, he_t = hits_in(tzh, ten, terms, key)
        hz_d, he_d = hits_in(dzh, den, terms, key)
        hit_title = bool(hz_t or he_t)
        hit_desc = len(set(hz_d)) + len(set(he_d)) >= DESC_MIN_HITS
        if not (hit_title or hit_desc):
            continue
        merged = []
        for w in hz_t + hz_d + he_t + he_d:
            if w not in merged:
                merged.append(w)
        all_hits[key] = merged[:10]
        if key == ENABLE["key"]:
            enable = True
        else:
            stages.append(key)

    for key in RISK_KEYS:
        g = "risk_" + key
        terms = RISK_TERMS[key]
        hz_t, he_t = hits_in(tzh, ten, terms, g)
        hz_d, he_d = hits_in(dzh, den, terms, g)
        hit_title = bool(hz_t or he_t)
        hit_desc = len(set(hz_d)) + len(set(he_d)) >= DESC_MIN_HITS
        if not (hit_title or hit_desc):
            continue
        merged = []
        for w in hz_t + hz_d + he_t + he_d:
            if w not in merged:
                merged.append(w)
        all_hits["risk_" + key] = merged[:10]
        risks.append(key)

    return stages, risks, enable, all_hits


def load_periods():
    """读当前期 + 全部归档；按日期排序；同一天以当前期为准。"""
    out = {}
    for f in sorted(ARCHIVE.glob("2026-*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if "columns" not in d:
            continue
        date = (d.get("updatedAt") or "")[:10] or f.stem
        out[date] = d
    cur = json.loads(RADAR.read_text(encoding="utf-8"))
    cur_date = (cur.get("updatedAt") or "")[:10]
    out[cur_date] = cur
    return [(k, out[k]) for k in sorted(out)]


def blank_dim(keys):
    return {k: {"n": 0, "w": 0} for k in keys}


WINDOW_NOTE = {
    "zh": "统计主口径为雷达「期」(issue)，异动基线固定为前 4 期。行动剧本触发条件中的「滚动 4 周 / 连续 2 期」属企业内部模板，默认按自然周理解；期长、起止日与信号计数单位须由企业按自身 ERP 日历校准后方可使用（待校准项）。",
    "en": "The primary counting unit is a Radar issue; the anomaly baseline is fixed at the previous 4 issues. References to a rolling 4-week window or 2 consecutive periods inside playbooks are internal templates, interpreted as calendar weeks by default; period length, boundaries and signal-count units must be calibrated against the company's own ERP calendar before use (pending calibration).",
}

# 局限是一等交付物：默认展开、不提供收起，页面从本清单逐条渲染。
CAVEATS = [
    {
        "zh": "数据源是编辑筛选的新闻，不是企业运营流水。环节「暴露度」反映报道覆盖密度，不等于企业实际风险大小，不可直接用于风险排序或资源分配。",
        "en": "The source is editorially curated news, not operational transactions. Stage exposure measures coverage density, not the size of a company's real risk, and must not be used to rank risks or allocate resources.",
    },
    {
        "zh": "语料存在主题偏置：航运、运价与中东航路占比高，Deliver 段信号天然密集；Return 段稀疏是语料性质，不代表该环节无风险。",
        "en": "The corpus is topic-biased: shipping, rates and Middle East lanes dominate, so Deliver is naturally dense. Sparse Return coverage is a property of the corpus, not evidence that the stage is risk-free.",
    },
    {
        "zh": "规则词典是人工编辑口径，不是行业分类标准。一条信号可同时命中多个环节与风险，各分项计数之和大于总条数，不可相加求总或当作占比分母。",
        "en": "The lexicon is an editorial convention, not an industry taxonomy. One signal may hit several stages and risks, so subtotals exceed the signal count and must not be summed or used as a percentage denominator.",
    },
    {
        "zh": "词典匹配不做语义理解：否定句、反讽、历史回顾与假设句都可能被计入。每条信号的命中词在本页可展开复核，分类器结论需人工抽查。",
        "en": "Lexicon matching has no semantic understanding: negations, irony, historical retrospectives and hypotheticals may all be counted. Hit terms are expandable on every signal, so classifier output needs human spot-checks.",
    },
    {
        "zh": "异动检测只有 14 期样本、基线仅 4 期；小样本下总体标准差不稳定，z 值只作筛查提示，不是统计显著性检验，也不构成趋势预测。",
        "en": "Anomaly detection has only 14 issues and a 4-issue baseline. Population SD is unstable at this sample size; z-scores are screening hints, not significance tests or trend forecasts.",
    },
    {
        "zh": "早期若干期存在跨期重复标题（见元数据「重复条数」）。默认保留原始编辑口径不去重；页面提供「排除跨期重复」开关，切换后所有统计随之改变，两种口径不可混用。",
        "en": "Some early issues repeat titles across periods (see the duplicate count in metadata). The default keeps the original editorial basis without deduplication; an Exclude cross-period duplicates switch changes every statistic, so the two bases must not be mixed.",
    },
    {
        "zh": "加权口径 w = 来源链接数 + 核验标记(0/1)，只是「可追溯性代理」，不是风险概率、影响权重或置信度。默认统计使用不加权条数 n。",
        "en": "The weighted metric w = number of source links + verification flag (0/1) is only a traceability proxy, not a risk probability, impact weight or confidence score. The default basis is the unweighted count n.",
    },
    {
        "zh": "行动剧本是核查清单，不是决策指令：不出最优库存、不出建议下单量，不承诺任何降本、时效或提升数值；触发条件为相对量模板，须由企业按自身基线校准。",
        "en": "Playbooks are verification checklists, not decision instructions: no optimal inventory, no suggested order quantity, and no promised savings, lead-time or uplift figures. Triggers are relative templates requiring calibration against the company's own baseline.",
    },
    {
        "zh": "三项业务落地前提（产品内已明示为「待企业校准」，不涉及用户确认）：① 企业 ERP 表名与字段映射须由企业侧定义；② 「滚动 4 周 / 连续 2 期」的日历口径按企业 ERP 日历校准；③ 本产品没有企业实测数据，任何效果类表述均未经业务验证。",
        "en": "Three prerequisites for business rollout (labelled in-product as pending enterprise calibration, not pending user confirmation): (1) ERP table names and field mapping are defined by the company; (2) the calendar convention for rolling 4 weeks / 2 consecutive periods is calibrated to the company's ERP calendar; (3) no enterprise field data exists here, so no impact claim has been validated in practice.",
    },
    {
        "zh": "数据边界：纯静态快照，不冒充实时；页面零外部请求、无 LLM、无密钥。换用企业真实 ERP / WMS 数据后，规则词典、异动基线与全部断言需整组重写。",
        "en": "Data boundary: a purely static snapshot, never presented as live. The page makes zero external requests, uses no LLM and needs no keys. Swapping in real ERP/WMS data requires rewriting the lexicon, anomaly baseline and every assertion as a set.",
    },
    {
        "zh": "涉及法规、认证与准入的条目，适用范围与时效以官方最新文本为准，本页不做绝对化合规承诺。",
        "en": "For regulatory, certification and admission items, scope and validity follow the latest official texts. This page makes no absolute compliance promises.",
    },
]


# ---------------------------------------------------------------- 口径核查
# 「Deliver 段为何远高于其他段」的可复算量化证据。数字一律由词典与语料推导，
# 不手写结论值：词典宽度、等宽裁剪、独占/共现、命中来源、分期覆盖。
def _item_texts(item):
    return (
        (item.get("title", {}).get("zh", "") or "").lower(),
        (item.get("title", {}).get("en", "") or "").lower(),
        (item.get("desc", {}).get("zh", "") or "")[:DESC_CHARS].lower(),
        (item.get("desc", {}).get("en", "") or "")[:DESC_CHARS * 2].lower(),
    )


def zh_hit(item, terms):
    """只用中文词表判定命中：标题 1 词即计，描述需 >= DESC_MIN_HITS 个不同词。"""
    tz, _, dz, _ = _item_texts(item)
    if any(t.lower() in tz for t in terms):
        return True
    return len({t for t in terms if t.lower() in dz}) >= DESC_MIN_HITS


def hit_origin(item, key):
    """按正式分类同一套规则，区分标题命中与仅描述命中。"""
    tz, te, dz, de = _item_texts(item)
    terms = STAGE_TERMS[key]
    hz_t, he_t = hits_in(tz, te, terms, key)
    hz_d, he_d = hits_in(dz, de, terms, key)
    return bool(hz_t or he_t), (len(set(hz_d)) + len(set(he_d)) >= DESC_MIN_HITS)


def build_bias_audit(items, signals, stage_summary, periods, caveat_count):
    stage_n = {s["key"]: s["n"] for s in stage_summary}
    lexicon = {}
    for key in STAGE_KEYS:
        t = STAGE_TERMS[key]
        total = len(t["zh"]) + len(t["en"])
        lexicon[key] = {"zh": len(t["zh"]), "en": len(t["en"]), "total": total,
                        "n": stage_n[key], "perWord": round(stage_n[key] / total, 3)}

    width = len(STAGE_TERMS["make"]["zh"])
    full_zh = {k: sum(1 for it in items if zh_hit(it, STAGE_TERMS[k]["zh"])) for k in STAGE_KEYS}
    deliver_zh = STAGE_TERMS["deliver"]["zh"]
    trim_points = sorted(set([10, 20, width, 21, 41, len(deliver_zh)]))
    equal_width = {
        "width": width,
        "fullZh": full_zh,
        "trimCurve": [{"terms": n, "hits": sum(1 for it in items if zh_hit(it, deliver_zh[:n]))}
                      for n in trim_points],
        "deliverTrim": sum(1 for it in items if zh_hit(it, deliver_zh[:width])),
        "makeFull": full_zh["make"],
        "scope": {
            "zh": "统一只用中文词表，沿用「标题 1 词 / 描述 ≥%d 个不同词、只取前 %d 字」的同一套规则。" % (DESC_MIN_HITS, DESC_CHARS),
            "en": "Chinese-only lexicons, using the same rule: one title hit, or at least %d distinct terms within the first %d characters of the description." % (DESC_MIN_HITS, DESC_CHARS),
        },
    }

    deliv = [s for s in signals if "deliver" in s["st"]]
    exclusive = sum(1 for s in deliv if len(s["st"]) == 1)
    cooccur = defaultdict(int)
    for s in deliv:
        for k in s["st"]:
            if k != "deliver":
                cooccur[k] += 1
    label_counts = Counter(len(s["st"]) for s in signals)
    stage_total = sum(stage_n.values())
    overlap = {
        "total": len(deliv), "exclusive": exclusive, "shared": len(deliv) - exclusive,
        "stageTotal": stage_total, "signals": len(signals),
        "avgLabels": round(stage_total / len(signals), 3),
        "cooccur": dict(cooccur),
        "labelCounts": {str(k): v for k, v in sorted(label_counts.items())},
    }

    origins = [hit_origin(it, "deliver") for it in items]
    title_hits = sum(1 for i, s in enumerate(signals) if "deliver" in s["st"] and origins[i][0])
    origin = {"title": title_hits, "descOnly": len(deliv) - title_hits}

    shares = []
    for p in periods:
        n = p["total"]
        shares.append(round(100.0 * p["byStage"]["deliver"]["n"] / n, 1) if n else 0.0)
    period_cov = {
        "total": len(periods),
        "atLeast60": sum(1 for x in shares if x >= 60),
        "atLeast90": sum(1 for x in shares if x >= 90),
        "maxShare": max(shares) if shares else 0,
        "shares": shares,
    }

    return {
        "lexicon": lexicon,
        "equalWidth": equal_width,
        "overlap": overlap,
        "origin": origin,
        "periods": period_cov,
        "caveatCount": caveat_count,
        "recompute": {
            "zh": "词典宽度、独占/共现、命中来源与分期覆盖均由信号明细与规则词典在浏览器内逐项复算；等宽裁剪需描述全文，仅在构建期计算，页面不复算该组。",
            "en": "Lexicon width, exclusive/shared counts, hit origin and per-issue coverage are recomputed in-browser from signal details and the lexicon. Equal-width trimming needs full descriptions, so it is build-time only and is not recomputed in the browser.",
        },
    }


def bias_caveats(a):
    """由核查数字生成 3 条量化局限，周更重跑后数字自动跟着变。"""
    lx, ew, ov = a["lexicon"], a["equalWidth"], a["overlap"]
    d, w = lx["deliver"], ew["width"]
    return [
        {
            "zh": "规则词典宽度不等：交付 %d 词（中文 %d / 英文 %d），计划 %d、采购 %d、生产 %d、逆向 %d。词表越宽越容易命中，五段命中数不是同口径的环节重要性排序。"
                  % (d["total"], d["zh"], d["en"], lx["plan"]["total"], lx["source"]["total"],
                     lx["make"]["total"], lx["return"]["total"]),
            "en": "Lexicons are uneven: Deliver has %d terms (%d Chinese / %d English) versus Plan %d, Source %d, Make %d and Return %d. Wider lexicons hit more often, so stage counts are not a like-for-like ranking of stage importance."
                  % (d["total"], d["zh"], d["en"], lx["plan"]["total"], lx["source"]["total"],
                     lx["make"]["total"], lx["return"]["total"]),
        },
        {
            "zh": "等宽对照（只用中文词表，沿用标题 1 词 / 描述 ≥%d 词的规则）：把交付词表裁到与生产相同的 %d 词，仍命中 %d 条，生产用全量 %d 词命中 %d 条；每词产出交付 %.2f 条、生产 %.2f 条。语料的航运 / 运价 / 航路偏置是主因，词典宽度只是放大项。该对照在构建期计算，页面信号明细不含描述全文，不在浏览器内复算。"
                  % (DESC_MIN_HITS, w, ew["deliverTrim"], w, ew["makeFull"],
                     d["perWord"], lx["make"]["perWord"]),
            "en": "Equal-width check (Chinese-only lexicons, same one-title-hit / ≥%d-description-terms rule): trimming Deliver to Make’s %d terms still yields %d hits, while Make’s full %d terms yield %d. Per-term yield is %.2f for Deliver and %.2f for Make. The shipping/rates/lanes bias of the corpus is the main driver; lexicon width only amplifies it. This check is build-time only because signal details omit full descriptions."
                  % (DESC_MIN_HITS, w, ew["deliverTrim"], w, ew["makeFull"],
                     d["perWord"], lx["make"]["perWord"]),
        },
        {
            "zh": "交付 %d 条中 %d 条仅命中该段、%d 条与其他段共现；五段合计 %d 次命中落在 %d 条信号上，平均每条 %.2f 段。%d 是覆盖条数，不是独占分类，不可读作企业风险分布。"
                  % (ov["total"], ov["exclusive"], ov["shared"], ov["stageTotal"],
                     ov["signals"], ov["avgLabels"], ov["total"]),
            "en": "Of Deliver’s %d hits, %d hit that stage alone and %d co-occur with another stage; the five stages total %d hits across %d signals, %.2f stages per signal. %d is a coverage count, not an exclusive classification, and must not be read as an enterprise risk distribution."
                  % (ov["total"], ov["exclusive"], ov["shared"], ov["stageTotal"],
                     ov["signals"], ov["avgLabels"], ov["total"]),
        },
    ]


def main():
    periods_raw = load_periods()
    signals, periods, items_all = [], [], []
    seen_titles = set()
    dup_count = 0
    total_sources = 0
    total_verified = 0
    unclassified = 0
    rule_hit_count = defaultdict(int)

    for date, doc in periods_raw:
        p = {
            "date": date, "total": 0, "sources": 0, "verified": 0, "dup": 0,
            "byStage": blank_dim(STAGE_KEYS),
            "byRisk": blank_dim(RISK_KEYS),
            "byCat": blank_dim([c["key"] for c in CATS.values()]),
            "enable": 0, "unclassified": 0,
        }
        for col in doc.get("columns", []):
            cat = CATS.get(col.get("color"), {"key": "other"})
            ck = cat["key"]
            for idx, it in enumerate(col.get("items", [])):
                items_all.append(it)
                tzh = (it.get("title", {}).get("zh", "") or "").strip()
                ten = (it.get("title", {}).get("en", "") or "").strip()
                srcs = it.get("sources", []) or []
                verified = bool(it.get("verified"))
                nsrc = len(srcs)
                w = nsrc + (1 if verified else 0)   # 加权口径：来源链接数 + 核验标记
                dup = tzh in seen_titles
                seen_titles.add(tzh)
                if dup:
                    dup_count += 1

                stages, risks, enable, all_hits = classify(it)
                if not stages:
                    unclassified += 1
                for k in stages + risks + (["enable"] if enable else []):
                    rule_hit_count[k] += 1

                sig = {
                    "id": "%s-%d" % (date, len(signals)),
                    "date": date,
                    "cat": ck,
                    "color": col.get("color", "#888"),
                    "t": {"zh": tzh, "en": ten},
                    "url": (srcs[0].get("url", "") if srcs else ""),
                    "ns": nsrc,
                    "v": 1 if verified else 0,
                    "w": w,
                    "dup": 1 if dup else 0,
                    "st": stages,
                    "rk": risks,
                    "en": 1 if enable else 0,
                    "hits": all_hits,
                }
                signals.append(sig)

                p["total"] += 1
                p["sources"] += nsrc
                p["verified"] += 1 if verified else 0
                p["dup"] += 1 if dup else 0
                p["enable"] += 1 if enable else 0
                p["unclassified"] += 0 if stages else 1
                for k in stages:
                    p["byStage"][k]["n"] += 1
                    p["byStage"][k]["w"] += w
                for k in risks:
                    p["byRisk"][k]["n"] += 1
                    p["byRisk"][k]["w"] += w
                p["byCat"][ck]["n"] += 1
                p["byCat"][ck]["w"] += w
                total_sources += nsrc
                total_verified += 1 if verified else 0
        periods.append(p)

    # ---- 环节 / 风险汇总 + 14 期趋势 ----
    stage_summary = []
    for s in STAGES:
        k = s["key"]
        trend = [p["byStage"][k]["n"] for p in periods]
        wt = [p["byStage"][k]["w"] for p in periods]
        stage_summary.append({**s, "n": sum(trend), "w": sum(wt),
                              "trend": trend, "wtrend": wt})
    risk_summary = []
    for r in RISKS:
        k = r["key"]
        trend = [p["byRisk"][k]["n"] for p in periods]
        wt = [p["byRisk"][k]["w"] for p in periods]
        risk_summary.append({**r, "n": sum(trend), "w": sum(wt),
                             "trend": trend, "wtrend": wt})
    enable_trend = [p["enable"] for p in periods]

    # ---- 异动检测：最新期 vs 前 N 期滚动基线（默认「按条数」口径）----
    anomalies = []
    if len(periods) >= BASELINE_WINDOW + 1:
        cur = periods[-1]
        base = periods[-BASELINE_WINDOW - 1:-1]
        for dim, keys, label in (("stage", STAGE_KEYS, dict((s["key"], s) for s in STAGES)),
                                 ("risk", RISK_KEYS, dict((r["key"], r) for r in RISKS))):
            for k in keys:
                series = [p["byStage" if dim == "stage" else "byRisk"][k]["n"] for p in base]
                mean = sum(series) / len(series)
                var = sum((x - mean) ** 2 for x in series) / len(series)
                sd = var ** 0.5
                now = cur["byStage" if dim == "stage" else "byRisk"][k]["n"]
                ratio = (now / mean) if mean > 0 else None
                z = ((now - mean) / sd) if sd > 0 else 0.0
                anomalies.append({
                    "dim": dim, "key": k,
                    "zh": label[k]["zh"], "en": label[k]["en"],
                    "color": label[k]["color"],
                    "now": now, "mean": round(mean, 2),
                    "sd": round(sd, 2), "z": round(z, 2),
                    "ratio": round(ratio, 2) if ratio is not None else None,
                    "dir": "up" if now > mean else ("down" if now < mean else "flat"),
                    "series": series,
                })
        anomalies.sort(key=lambda a: abs(a["z"]), reverse=True)
        anomalies = anomalies[:ANOMALY_TOP]

    meta = {
        "generatedAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "source": {
            "zh": "本站「本周供应链雷达」当前期 + 全部历史归档（radar-data.json / radar-archive/*.json）",
            "en": "This site's weekly Supply Chain Radar — current issue plus full archive",
        },
        "periods": len(periods),
        "from": periods[0]["date"],
        "to": periods[-1]["date"],
        "signals": len(signals),
        "sources": total_sources,
        "verified": total_verified,
        "duplicates": dup_count,
        "unclassified": unclassified,
        "enableTotal": sum(enable_trend),
        "weightRule": {
            "zh": "加权口径 w = 该条来源链接数 + 核验标记(0/1)；默认「按条数」口径 n 不加权",
            "en": "Weighted w = number of source links + verification flag (0/1); default count n is unweighted",
        },
        "baselineWindow": BASELINE_WINDOW,
        "algorithm": {
            "zh": "确定性词典匹配（中文子串 / 英文词边界）+ 前 %d 期滚动基线的均值与总体标准差；无模型、无 LLM、无外部请求" % BASELINE_WINDOW,
            "en": "Deterministic lexicon matching (zh substring / en word boundary) plus mean & population SD over the previous %d issues; no model, no LLM, no external request" % BASELINE_WINDOW,
        },
        "descMinHits": DESC_MIN_HITS,
        "descChars": DESC_CHARS,
    }

    audit = build_bias_audit(items_all, signals, stage_summary, periods, len(CAVEATS) + 3)
    caveats = CAVEATS + bias_caveats(audit)

    payload = {
        "meta": meta,
        "stages": stage_summary,
        "enable": {**ENABLE, "n": sum(enable_trend), "trend": enable_trend},
        "risks": risk_summary,
        "cats": [{"key": v["key"], "zh": v["zh"], "en": v["en"], "color": k} for k, v in CATS.items()],
        "periods": periods,
        "signals": signals,
        "anomalies": anomalies,
        "rules": {
            "stages": STAGE_TERMS,
            "risks": {("risk_" + k): v for k, v in RISK_TERMS.items()},
        },
        "playbooks": PLAYBOOKS,
        "playbookNote": PLAYBOOK_NOTE,
        "windowNote": WINDOW_NOTE,
        "biasAudit": audit,
        "caveats": caveats,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("WROTE", OUT, "%.1f KB" % (OUT.stat().st_size / 1024))
    print("periods=%d signals=%d sources=%d verified=%d dup=%d unclassified=%d enable=%d anomalies=%d"
          % (meta["periods"], meta["signals"], meta["sources"], meta["verified"],
             meta["duplicates"], meta["unclassified"], meta["enableTotal"], len(anomalies)))
    print("stage totals:", [(s["key"], s["n"]) for s in stage_summary])
    print("bias audit: lexicon=%s equalWidth=%d vs %d overlap=%d=%d+%d caveats=%d"
          % ({k: v["total"] for k, v in audit["lexicon"].items()},
             audit["equalWidth"]["deliverTrim"], audit["equalWidth"]["makeFull"],
             audit["overlap"]["total"], audit["overlap"]["exclusive"],
             audit["overlap"]["shared"], len(caveats)))
    print("risk totals :", [(r["key"], r["n"]) for r in risk_summary])
    print("top anomalies:", [(a["key"], a["now"], a["mean"], a["z"]) for a in anomalies[:5]])


if __name__ == "__main__":
    main()
