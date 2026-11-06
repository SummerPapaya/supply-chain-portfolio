#!/usr/bin/env python3
"""FlowLens · 从真实订单流水构建可复算的分析事实表与聚合产物。

    python scripts/build_flowlens.py --input /tmp/scds/olist --out docs/reports/flowlens

输入是 Olist 官方 9 张 CSV（或按 scripts/flowlens_schema.py 的 COLUMNS 映射
导出的企业自有 OMS 表）。输出：
    facts.csv        订单级紧凑整数事实表（浏览器用它重新聚合全部指标）
    aggregate.json   字典 / KPI / 各维度聚合 / 断言基准 / 局限 / 剧本
    field-map.json   字段映射字典（接入自有数据时对照用）

铁律：items / reviews / payments 都是 1:N，必须先按 order_id 聚合再 join，
否则订单数会被放大。构建末尾的 C1–C12 自检会拦截行数膨胀。
"""
import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from flowlens_schema import (COLUMNS, FACT_FIELDS, FILES, FLAGS, PARAMS,
                             SOURCE)
from flowlens_playbooks import PLAYBOOKS, PLAYBOOK_NOTE

FMT = PARAMS["date_format"]
FLAG = {name: bit for name, bit, _ in FLAGS}
csv.field_size_limit(1 << 24)


# ----------------------------------------------------------------- helpers
def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def g(row, table, key):
    """按映射取逻辑字段（换企业数据只改 COLUMNS）。"""
    return (row.get(COLUMNS[table][key]) or "").strip()


def dt(s):
    try:
        return datetime.strptime(s, FMT)
    except (ValueError, TypeError):
        return None


def cents(x):
    try:
        return int(round(float(x) * 100))
    except (ValueError, TypeError):
        return 0


def grams(x):
    try:
        return int(round(float(x)))
    except (ValueError, TypeError):
        return 0


def dd(a, b):
    """日历日差（承诺日是 00:00:00 的日期，不能用时间戳直接比较）。"""
    return (a.date() - b.date()).days


def hd(a, b):
    """百分之一天；负值返回 -1（由 flag 单独记录，不静默丢弃）。"""
    v = int(round((a - b).total_seconds() / 86400.0 * 100))
    return v if v >= 0 else -1


def pctl(arr, p):
    if not arr:
        return -1
    s = sorted(arr)
    return s[int((len(s) - 1) * p)]


def bp(num, den):
    return (num * 10000) // den if den else 0


def wilson_lower_bp(late, n, z):
    if n <= 0:
        return 0
    p = late / n
    d = 1 + z * z / n
    centre = p + z * z / (2 * n)
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return int(max(0.0, (centre - margin) / d) * 10000)


# ----------------------------------------------------------------- load
def load(base):
    T = {}
    for key, fname in FILES.items():
        p = base / fname
        if not p.exists():
            raise SystemExit("缺少输入文件：%s" % p)
        T[key] = read_csv(p)
        print("  %-12s %7d rows  %s" % (key, len(T[key]), fname))
    return T


def dictionaries(T):
    months = sorted({g(o, "orders", "purchase_ts")[:7] for o in T["orders"] if g(o, "orders", "purchase_ts")})
    cstates = sorted({g(c, "customers", "state") for c in T["customers"] if g(c, "customers", "state")})
    sstates = sorted({g(s, "sellers", "state") for s in T["sellers"] if g(s, "sellers", "state")})
    statuses = sorted({g(o, "orders", "status") for o in T["orders"] if g(o, "orders", "status")})
    trans = {g(t, "category", "raw"): g(t, "category", "english") for t in T["category"]}
    cats = sorted(set(trans.values()) | {"__unknown__", "__untranslated__"})
    return {
        "months": months, "customerStates": cstates, "sellerStates": sstates,
        "statuses": statuses, "categories": cats,
    }, trans


# ----------------------------------------------------------------- facts
def build_facts(T, D, trans):
    cust = {g(c, "customers", "customer_id"): c for c in T["customers"]}
    sell = {g(s, "sellers", "seller_id"): s for s in T["sellers"]}
    prod = {g(p, "products", "product_id"): p for p in T["products"]}

    # 1:N 表先聚合到 1 行 / 订单 -------------------------------------------
    agg = defaultdict(lambda: {"price": 0, "freight": 0, "n": 0, "w": 0,
                               "sellers": set(), "first": None, "seq": 10 ** 9})
    for r in T["items"]:
        oid = g(r, "items", "order_id")
        a = agg[oid]
        a["price"] += cents(g(r, "items", "price"))
        a["freight"] += cents(g(r, "items", "freight"))
        a["n"] += 1
        prow = prod.get(g(r, "items", "product_id"))
        a["w"] += grams(g(prow, "products", "weight_g")) if prow else 0
        sid = g(r, "items", "seller_id")
        a["sellers"].add(sid)
        try:
            seq = int(g(r, "items", "item_seq"))
        except ValueError:
            seq = 10 ** 9
        if seq < a["seq"]:
            a["seq"] = seq
            a["first"] = (sid, g(r, "items", "product_id"))

    reviews = {}
    for r in T["reviews"]:
        oid = g(r, "reviews", "order_id")
        ts = g(r, "reviews", "created_ts")
        try:
            sc = int(float(g(r, "reviews", "score")))
        except ValueError:
            continue
        if oid not in reviews or ts < reviews[oid][0]:
            reviews[oid] = (ts, sc)

    ix = {k: {v: i for i, v in enumerate(D[k])} for k in
          ("months", "customerStates", "sellerStates", "statuses", "categories")}
    rows, quality = [], Counter()
    multi_seller = multi_item = 0

    for o in T["orders"]:
        oid = g(o, "orders", "order_id")
        p = dt(g(o, "orders", "purchase_ts"))
        ap = dt(g(o, "orders", "approved_ts"))
        c = dt(g(o, "orders", "carrier_ts"))
        d = dt(g(o, "orders", "delivered_ts"))
        e = dt(g(o, "orders", "estimated_ts"))
        st = g(o, "orders", "status")
        a = agg.get(oid)
        flag = 0

        if not a or a["n"] == 0:
            flag |= FLAG["no_items"]
        if st == "delivered" and not d:
            flag |= FLAG["no_delivered"]
        if p and d and d < p:
            flag |= FLAG["bad_order"]
        if a and len(a["sellers"]) > 1:
            multi_seller += 1
        if a and a["n"] > 1:
            multi_item += 1

        # 分段时长：负值单独记 flag 并存 -1
        va = hd(ap, p) if (ap and p) else -1
        vh = hd(c, ap) if (c and ap) else -1
        vt = hd(d, c) if (d and c) else -1
        if (ap and p) and ap < p:
            flag |= FLAG["bad_order"]
        if (c and ap) and c < ap:
            flag |= FLAG["neg_handoff"]
        if (d and c) and d < c:
            flag |= FLAG["neg_transit"]

        Td = dd(d, p) if (d and p and d >= p) else -1
        Kd = dd(e, p) if (e and p) else -1

        # 主卖家 / 主品类 = 首行商品（口径公开，不做加权猜测）
        ss, cat = -1, ix["categories"]["__unknown__"]
        if a and a["first"]:
            sid, pid = a["first"]
            srow = sell.get(sid)
            if srow:
                ss = ix["sellerStates"].get(g(srow, "sellers", "state"), -1)
            prow = prod.get(pid)
            raw = g(prow, "products", "category") if prow else ""
            cat = ix["categories"].get(trans.get(raw), ix["categories"]["__untranslated__" if raw else "__unknown__"])
            if cat in (ix["categories"]["__unknown__"], ix["categories"]["__untranslated__"]):
                flag |= FLAG["no_category"]
        else:
            flag |= FLAG["no_category"]

        crow = cust.get(g(o, "customers", "customer_id"))
        cs = ix["customerStates"].get(g(crow, "customers", "state"), -1) if crow else -1
        rv = reviews.get(oid, (None, -1))[1]
        if rv < 0:
            flag |= FLAG["no_review"]
        fr = a["freight"] if a else 0
        if a and a["n"] and fr == 0:
            flag |= FLAG["zero_freight"]

        rows.append([
            ix["months"].get(g(o, "orders", "purchase_ts")[:7], -1), ss, cs, cat,
            a["price"] if a else 0, fr, a["n"] if a else 0, a["w"] if a else 0,
            va, vh, vt, Td, Kd, rv, ix["statuses"].get(st, -1), flag,
        ])
        # 质量计数（按 flag 位）
        for name, bit, _ in FLAGS:
            if flag & bit:
                quality[name] += 1
        if st != "delivered":
            quality["non_delivered"] += 1
    return rows, quality, multi_seller, multi_item


# ----------------------------------------------------------------- aggregate
def aggregate(rows, D, quality, multi_seller, multi_item):
    P = PARAMS
    z, minn = P["wilson_z"], P["min_group_n"]
    st_del = D["statuses"].index("delivered")
    is_usable = lambda r: r[14] == st_del and r[11] >= 0 and r[12] >= 0
    usable = [r for r in rows if is_usable(r)]
    late = [r for r in usable if r[11] > r[12]]
    late_n = len(late)
    overall_late = bp(late_n, len(usable))

    def grp(keyfn):
        d = defaultdict(lambda: {"n": 0, "late": 0, "cycle": [], "transit": [],
                                 "promise": [], "price": 0, "freight": 0})
        for r in usable:
            x = d[keyfn(r)]
            x["n"] += 1
            islate = r[11] > r[12]
            x["late"] += islate
            x["cycle"].append(r[11])
            x["promise"].append(r[12])
            if r[10] >= 0:
                x["transit"].append(r[10])
            x["price"] += r[4]
            x["freight"] += r[5]
        return d

    def pack(k, x, extra=None):
        o = {"key": k, "n": x["n"], "late": x["late"], "lateBp": bp(x["late"], x["n"]),
             "ot": x["n"] - x["late"], "otBp": bp(x["n"] - x["late"], x["n"]),
             "cycleP50": pctl(x["cycle"], .5), "cycleP90": pctl(x["cycle"], .9),
             "promiseP50": pctl(x["promise"], .5),
             "transitP50": pctl(x["transit"], .5),
             "price": x["price"], "freight": x["freight"],
             "freightBp": bp(x["freight"], x["price"])}
        if extra:
            o.update(extra)
        return o

    monthly = [pack(i, x, {"m": i}) for i, x in sorted(grp(lambda r: r[0]).items())]
    states = [pack(k, x, {"cs": k}) for k, x in sorted(grp(lambda r: r[2]).items())]
    categories = [pack(k, x, {"cat": k}) for k, x in sorted(grp(lambda r: r[3]).items())]

    lanes_raw = grp(lambda r: (r[1], r[2]))
    lanes = []
    for k, x in sorted(lanes_raw.items(), key=lambda kv: (-kv[1]["late"], kv[0])):
        lo = wilson_lower_bp(x["late"], x["n"], z)
        lanes.append(pack("%d>%d" % k, x, {"ss": k[0], "cs": k[1],
                                           "wilsonLoBp": lo,
                                           "sig": 1 if (x["n"] >= minn and lo > overall_late) else 0}))
    cum, pareto = 0, {}
    for i, l in enumerate(lanes):
        cum += l["late"]
        for t in P["pareto_targets"]:
            if t not in pareto and late_n and cum * 100 >= t * late_n:
                pareto[t] = i + 1
    pareto = {str(k): v for k, v in pareto.items()}

    fb = P["freight_bands"]
    ib = P["item_bands"]

    def band_idx(v, edges):
        for i in range(len(edges) - 1):
            if edges[i] <= v < edges[i + 1]:
                return i
        return len(edges) - 2

    freightBands = []
    for i, x in sorted(grp(lambda r: band_idx(bp(r[5], r[4]) // 100, fb) if r[4] > 0 else -1).items()):
        if i >= 0:
            freightBands.append(pack(i, x, {"b": i}))
    itemBands = [pack(i, x, {"b": i}) for i, x in
                 sorted(grp(lambda r: band_idx(r[6], ib)).items())]

    seg_src = [
        ("approve", lambda r: r[8]),
        ("handoff", lambda r: r[9]),
        ("transit", lambda r: r[10]),
        ("cycle", lambda r: r[11] * 100 if r[11] >= 0 else -1),
    ]
    segments = []
    for key, fn in seg_src:
        v = [fn(r) for r in usable if fn(r) >= 0]
        segments.append({"key": key, "n": len(v), "p50": pctl(v, .5),
                         "p90": pctl(v, .9), "mean100": sum(v) // len(v) if v else -1})

    scenarios = []
    for K in P["promise_scenarios"]:
        ot = sum(1 for r in usable if r[11] <= K)
        scenarios.append({"K": K, "n": len(usable), "ot": ot, "otBp": bp(ot, len(usable))})

    def hist(vals, lo, hi):
        h = [0] * (hi - lo + 1)
        for v in vals:
            h[max(lo, min(hi, v)) - lo] += 1
        return h

    histograms = {
        "delay": hist([r[11] - r[12] for r in usable], -30, 30),
        "cycle": hist([r[11] for r in usable], 0, 60),
        "promise": hist([r[12] for r in usable], 0, 60),
    }

    statusCounts = Counter(r[14] for r in rows)
    rv = defaultdict(lambda: {"n": 0, "low": 0, "sum": 0, "withScore": 0})
    for r in rows:
        k = "onTime" if (is_usable(r) and r[11] <= r[12]) else (
            "late" if is_usable(r) else "noDelivery")
        x = rv[k]
        x["n"] += 1
        if r[13] > 0:
            x["withScore"] += 1
            x["sum"] += r[13]
            x["low"] += (r[13] <= 2)
    reviewByOntime = {k: dict(v) for k, v in rv.items()}

    cycles = [r[11] for r in usable]
    promises = [r[12] for r in usable]
    delays = [r[11] - r[12] for r in usable]
    kpi = {
        "orders": len(rows), "delivered": sum(1 for r in rows if D["statuses"][r[14]] == "delivered"),
        "usable": len(usable), "late": late_n, "onTime": len(usable) - late_n,
        "otBp": bp(len(usable) - late_n, len(usable)), "lateBp": overall_late,
        "cycleP50": pctl(cycles, .5), "cycleP90": pctl(cycles, .9),
        "promiseP50": pctl(promises, .5), "promiseP90": pctl(promises, .9),
        "earlyP50": pctl([-x for x in delays], .5),
        "price": sum(r[4] for r in rows), "freight": sum(r[5] for r in rows),
        "freightBp": bp(sum(r[5] for r in rows), sum(r[4] for r in rows)),
        "withReview": sum(1 for r in rows if r[13] > 0),
        "sellers": len(D["sellerStates"]), "customerStates": len(D["customerStates"]),
        "categories": len(D["categories"]), "months": len(D["months"]),
        "overallLateBp": overall_late,
    }
    quality = dict(quality)
    # 非 delivered 状态却带送达日期：真实异常，单列计数、不进分母
    quality["date_on_non_delivered"] = sum(1 for r in rows if r[14] != st_del and r[11] >= 0)
    return {
        "kpi": kpi, "monthly": monthly, "states": states, "categories": categories,
        "lanes": lanes, "freightBands": freightBands, "itemBands": itemBands,
        "segments": segments, "scenarios": scenarios, "histograms": histograms,
        "statusCounts": [statusCounts.get(i, 0) for i in range(len(D["statuses"]))],
        "reviewByOntime": reviewByOntime, "quality": quality,
        "pareto": pareto,
    }


# ----------------------------------------------------------------- narrative
LIMITATIONS = [
    ("按时率不含 in-full：数据没有「订购量 / 发货量 / 缺货行」，只能算 on-time delivery，不能叫 OTIF。",
     "On-time is not OTIF: no ordered/shipped quantity or short-ship lines exist, so only on-time delivery can be computed."),
    ("承诺缓冲中位数远大于实际周期中位数：高按时率主要由宽松承诺贡献，而非履约效率；情景滑块只展示敏感性，不给建议承诺天数。",
     "Median promised buffer far exceeds median actual cycle: the high on-time rate is largely created by slack promises, not fulfilment speed. The scenario slider shows sensitivity only and gives no recommended promise window."),
    ("按日历日比较：estimated_delivery_date 是 00:00:00 的日期，若用时间戳直接比较，当天送达会被误判为延迟。",
     "Calendar-day basis: the promised date is a 00:00:00 date; comparing raw timestamps would misclassify same-day deliveries as late."),
    ("只有 delivered 且日期齐全的订单进入按时率分母；其余状态单列展示，不静默并入。",
     "Only delivered orders with complete dates enter the on-time denominator; other statuses are shown separately and never silently merged."),
    ("没有库存、采购成本、产能、仓库、承运商、路由与批次数据，因此不能做库存优化、成本归因或产能规划。",
     "No inventory, procurement cost, capacity, warehouse, carrier, route or batch data: no inventory optimisation, cost attribution or capacity planning is possible."),
    ("没有退货表：canceled / unavailable 订单与 1–2 分评价只是逆向信号代理，不等于退货率或质量缺陷率。",
     "No returns table: cancelled / unavailable orders and 1–2 star reviews are proxies for reverse signals, not a return rate or defect rate."),
    ("少量订单状态与日期自相矛盾：6 个非 delivered 状态订单带有送达日期，已从按时率分母排除并单列计数。",
     "A few orders contradict their own status: 6 non-delivered orders carry a delivery date. They are excluded from the on-time denominator and counted separately."),
    ("数据质量异常不修饰：无商品行订单、负交接时长、负在途时长、日期倒置均按原始值计数并公开，相关订单只从对应分段统计中剔除。",
     "Data-quality anomalies are not smoothed: orders without item lines, negative handoff/transit durations and date inversions are counted from raw values; affected rows are excluded only from the corresponding segment statistics."),
    ("多商品 / 多卖家订单把「主卖家 / 主品类」记为首行商品对应值，是归属简化，不代表该订单全部商品。",
     "For multi-item / multi-seller orders the primary seller and category come from the first item line: an attribution simplification, not a description of the whole order."),
    ("数据两端是不完整统计月（起步期与 2018-09 之后只有个位数订单），趋势结论排除订单量过低的月份，但图上仍展示并标注。",
     "The two ends are partial months (a handful of orders at launch and after 2018-09); low-volume months are excluded from trend conclusions but still shown and flagged."),
    ("评价只在收货或承诺到期时触发，未答与触发规则造成选择偏差，低分与延迟的关联不能解释为因果。",
     "Surveys trigger on delivery or promise expiry; non-response and trigger rules create selection bias, so the low-score/lateness association is not causal."),
    ("地理只到州与邮编前缀，没有真实距离、运输方式与中转节点；线路差异是统计关联，不等于运营瓶颈已被定位。",
     "Geography stops at state and ZIP prefix: no real distance, mode or hub. Lane differences are statistical associations, not proof of an operational bottleneck."),
    ("Wilson 下界 + 最小样本量只是确定性筛查规则，不引入模型、不做预测、不做因果推断；阈值需按企业基线校准。",
     "A Wilson lower bound plus a minimum sample is a deterministic screening rule: no model, no prediction, no causal claim. Thresholds need calibration against company baselines."),
    ("数据主体为 2016-09 至 2018-08，不反映当前履约水平，页面不冒充实时；截屏与导出均为历史快照。",
     "The corpus spans 2016-09 to 2018-08 and does not reflect current performance. Nothing here is live; screenshots and exports are historical snapshots."),
    ("许可 CC BY-NC-SA 4.0：署名、非商业、相同方式共享。本看板仅作研究与作品集展示；企业商用须替换为自有数据。",
     "Licence CC BY-NC-SA 4.0: attribution, non-commercial, share-alike. Research / portfolio use only; commercial use requires replacing the source with your own data."),
]

JOIN_RULES = [
    ("以 orders 为主表，1 行 / 订单；主键 order_id 唯一。",
     "orders is the fact grain: exactly one row per order, order_id unique."),
    ("items 是 1:N：先按 order_id 聚合出商品额、运费、行数、重量与主卖家 / 主品类，再 join；不做行级直接 merge。",
     "items is 1:N: aggregate to order_id first (value, freight, line count, weight, primary seller/category), then join; never merge at line level."),
    ("customers 按 customer_id 1:1，sellers 按 seller_id 1:1，products 按 product_id 补品类与重量。",
     "customers joins 1:1 on customer_id, sellers 1:1 on seller_id, products supplies category and weight by product_id."),
    ("reviews 是 1:N：按订单取创建时间最早的一条评分；payments 是 1:N，只单独汇总，不并入订单事实表。",
     "reviews is 1:N: keep the earliest survey per order; payments is 1:N and is summarised separately, never merged into the order fact."),
    ("join 后行数必须等于 orders 行数；行数膨胀会触发 C1 自检失败并中止构建。",
     "Row count after joins must equal the orders row count; any inflation fails self-check C1 and aborts the build."),
]

INTEGRATION = [
    ("按 field-map.json 导出订单、订单行、客户、商品、卖家、评价、支付、品类字典 8 张表；字段名可不同，语义必须一致。",
     "Export the eight tables listed in field-map.json (orders, lines, customers, products, sellers, reviews, payments, category dictionary). Column names may differ; semantics must match."),
    ("确认订单主键唯一性，并把所有 1:N 表先聚合到订单粒度再 join，防止行数膨胀与金额重复计算。",
     "Confirm order-key uniqueness and aggregate every 1:N table to order grain before joining, to prevent row inflation and double-counted value."),
    ("定义承诺日、时区、截单时间与日历口径（自然日 / 工作日），并在页面上固定分母规则。",
     "Define promised date, timezone, cut-off time and calendar convention (calendar vs business days); fix and publish the denominator rule."),
    ("重跑 build_flowlens.py，检查 C1–C12 自检与页面浏览器内复算断言全部转绿。",
     "Re-run build_flowlens.py; require self-checks C1–C12 and the in-browser recomputation assertions to pass."),
    ("用企业 SLA、客服原因码与成本数据校准显著性阈值和核查剧本；本产品不输出建议承诺天数、最优库存或下单量。",
     "Calibrate significance thresholds and playbooks with company SLA, CX reason codes and cost data. This tool outputs no recommended promise window, optimal inventory or order quantity."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="原始 CSV 目录")
    ap.add_argument("--out", default="docs/reports/flowlens", help="输出目录")
    args = ap.parse_args()
    base, out = Path(args.input), Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    print("读取原始表：")
    T = load(base)
    D, trans = dictionaries(T)
    rows, quality, ms, mi = build_facts(T, D, trans)
    A = aggregate(rows, D, quality, ms, mi)

    # ---------------- C1–C12 自检 ----------------
    C = []

    def chk(name, cond, detail=""):
        C.append((name, bool(cond), detail))

    chk("C1 join 后行数 == orders 行数", len(rows) == len(T["orders"]), "%d" % len(rows))
    chk("C2 事实列数 == FACT_FIELDS", all(len(r) == len(FACT_FIELDS) for r in rows))
    chk("C3 订单编号唯一", len({g(o, "orders", "order_id") for o in T["orders"]}) == len(T["orders"]))
    recount = 0
    for o in T["orders"]:
        if g(o, "orders", "status") != "delivered":
            continue
        pp, dd_, ee = (dt(g(o, "orders", k)) for k in
                       ("purchase_ts", "delivered_ts", "estimated_ts"))
        if pp and dd_ and ee and dd_ >= pp:
            recount += 1
    chk("C4 可用订单 = delivered 且日期齐全且无倒置", A["kpi"]["usable"] == recount,
        "%d" % recount)
    chk("C5 按时数 + 延迟数 == 可用订单", A["kpi"]["onTime"] + A["kpi"]["late"] == A["kpi"]["usable"])
    chk("C6 月度订单合计 == 总订单", sum(x["n"] for x in A["monthly"]) == A["kpi"]["usable"])
    chk("C7 状态计数合计 == 总订单", sum(A["statusCounts"]) == len(rows))
    chk("C8 线路订单合计 == 可用订单", sum(x["n"] for x in A["lanes"]) == A["kpi"]["usable"])
    chk("C9 州维度订单合计 == 可用订单", sum(x["n"] for x in A["states"]) == A["kpi"]["usable"])
    chk("C10 品类维度订单合计 == 可用订单", sum(x["n"] for x in A["categories"]) == A["kpi"]["usable"])
    chk("C11 直方图合计 == 可用订单", all(sum(v) == A["kpi"]["usable"] for v in A["histograms"].values()))
    chk("C12 情景样本量一致", all(s["n"] == A["kpi"]["usable"] for s in A["scenarios"]))
    for name, ok, detail in C:
        print("  %-38s %s %s" % (name, "PASS" if ok else "FAIL", detail))
    bad = [n for n, ok, _ in C if not ok]
    if bad:
        raise SystemExit("自检失败，中止构建：" + ", ".join(bad))

    # ---------------- 输出 ----------------
    fpath = out / "facts.csv"
    with open(fpath, "w", encoding="utf-8", newline="\n") as f:
        f.write(",".join(FACT_FIELDS) + "\n")
        f.write("\n".join(",".join(str(v) for v in r) for r in rows) + "\n")

    payload = {
        "meta": {
            "source": SOURCE, "params": PARAMS, "factFields": FACT_FIELDS,
            "flags": [{"key": k, "bit": b, "label": lab} for k, b, lab in FLAGS],
            "rows": len(rows), "builtFrom": str(base), "buildChecks": len(C),
            "joinStats": {"multiSeller": ms, "multiItem": mi},
            "schemaVersion": 1,
        },
        "dictionaries": D,
        "columnMap": COLUMNS, "sourceFiles": FILES,
        **A,
        "limitations": [{"zh": a, "en": b} for a, b in LIMITATIONS],
        "joinRules": [{"zh": a, "en": b} for a, b in JOIN_RULES],
        "integration": [{"zh": a, "en": b} for a, b in INTEGRATION],
        "playbooks": PLAYBOOKS, "playbookNote": PLAYBOOK_NOTE,
    }
    (out / "aggregate.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "field-map.json").write_text(json.dumps({
        "columns": COLUMNS, "files": FILES, "factFields": FACT_FIELDS,
        "flags": [{"key": k, "bit": b, "label": lab} for k, b, lab in FLAGS],
        "params": PARAMS, "source": SOURCE,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    k = A["kpi"]
    print("\n输出：%s / %s / %s" % (fpath, out / "aggregate.json", out / "field-map.json"))
    print("facts.csv %.2f MB ; aggregate.json %.1f KB" %
          (fpath.stat().st_size / 1e6, (out / "aggregate.json").stat().st_size / 1e3))
    print("订单 %d / 可用 %d / 延迟 %d / 按时率 %.2f%% / 周期中位 %d 天 / 承诺中位 %d 天 / 运费率 %.2f%%" %
          (k["orders"], k["usable"], k["late"], k["otBp"] / 100, k["cycleP50"],
           k["promiseP50"], k["freightBp"] / 100))
    print("线路 %d（显著异常 %d）/ 品类 %d / 月 %d / 帕累托 %s" %
          (len(A["lanes"]), sum(x["sig"] for x in A["lanes"]), len(A["categories"]),
           len(A["monthly"]), A["pareto"]))
    print("质量计数：", dict(quality))

    # 数据一变就同步刷新 index.html 里的内嵌副本（单文件预览兜底）
    try:
        from embed_flowlens_data import sync as sync_embedded
        emb = sync_embedded(out)
        print("内嵌副本：%.2f MB（单文件预览兜底）" % (emb["embeddedBytes"] / 1e6))
    except Exception as exc:
        print("警告：内嵌副本未同步（%s）" % exc)


if __name__ == "__main__":
    main()
