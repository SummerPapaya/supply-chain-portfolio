#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
库存管理供应链工作台 · 数据加工管线
------------------------------------------------
真实数据源：UCI Machine Learning Repository - Online Retail (id=352)
  URL     : https://archive.ics.uci.edu/dataset/352/online+retail
  DOI     : 10.24432/C5BW33
  License : CC BY 4.0
  说明     : 英国某无实体店礼品批发电商 2010-12-01 ~ 2011-12-09 全量真实交易 (541,909 行)

本脚本做两件事：
  A. 从真实交易中提取「商品主数据」与「周度真实需求序列」（真实字段）
  B. 以连续检查 (s,Q) 补货策略回放真实需求，推导「库存台账 / PO / 在途 / 批次」（推导字段）
所有推导字段在 meta.derived_fields 中显式登记，界面「口径与来源」页同步展示。

用法：python3 scripts/build_data.py <path-to-xlsx> [out-dir]
"""
import sys, os, json, math, hashlib
from datetime import datetime, timedelta, date
from collections import defaultdict, Counter
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")

# ---------------------------------------------------------------- 证据指纹
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def js_safe(o):
    """把 2.0 这类整数值浮点统一成 int，使 Python/JS 的 JSON 序列化逐字节一致。"""
    if isinstance(o, float) and o.is_integer():
        return int(o)
    if isinstance(o, dict):
        return {k: js_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [js_safe(v) for v in o]
    return o


def canonical_bytes(o):
    """与 app.js canonical() 严格对齐：key 排序、无多余空白、非 ASCII 不转义。"""
    return json.dumps(js_safe(o), sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")

# ---------------------------------------------------------------- 参数（演示基线，界面可调）
BASELINE = {
    "csl": 0.95,                 # 周期服务水平
    "z_table": {"0.90": 1.2816, "0.95": 1.6449, "0.975": 1.9600, "0.99": 2.3263, "0.995": 2.5758},
    "cost_rate": 0.55,           # 单位成本 / 单位售价：数据集仅有售价，按成本率估算，界面可调
    "review_period_weeks": 1,    # 周期性检查间隔 P
    "target_cover_weeks": 4,     # 目标上限覆盖周数
    "demand_window_weeks": 26,   # 需求统计窗口
    "turnover_window_weeks": 26, # 周转统计窗口
    "active_window_weeks": 4,    # 动销判定窗口
    "stale_days": 180,           # 呆滞库龄阈值
    "stale_no_move_weeks": 13,   # 连续无动销周数
    "wos_min": 2.0, "wos_max": 16.0,
    "turnover_min": 3.0,
    "eo_ratio_max": 0.15,
    "moq": 24, "pack": 12,
    # 供应商交期实测（OTD 滚动）：默认 contract，保证既有 SS/ROP 结论可复现
    "lead_source": "contract",        # contract | rolling | blend
    "otd_basis": "eta",               # eta（确认 ETA 口径）| contract（合同承诺口径）
    "otd_window_weeks": 26,           # 滚动窗口：以快照日回溯 N 周的实收记录
    "otd_min_samples": 6,             # 完全采信实测所需的最少交付笔数
    "otd_prior_strength": 6,          # 收缩先验强度：w = n / (n + prior)
    "otd_grace_days": 0,              # 准时判定宽限天数
    "otd_tail": 1,                    # 右尾保护：用 P90 反推等效 σ，捕捉长延迟
    "otd_target": 0.90,              # 供应商 OTD 目标线，仅用于风险标记
    "otd_drift_pct": 0.20,            # 实测 L 相对契约 L 的漂移预警线
    "warehouses": ["LON-DC1", "LON-DC2", "MAN-DC3"],
    "suppliers": [
        {"id": "SUP-01", "lead_days": 14, "lead_sd_days": 3, "otd": 0.94},
        {"id": "SUP-02", "lead_days": 21, "lead_sd_days": 5, "otd": 0.89},
        {"id": "SUP-03", "lead_days": 21, "lead_sd_days": 4, "otd": 0.92},
        {"id": "SUP-04", "lead_days": 28, "lead_sd_days": 6, "otd": 0.86},
        {"id": "SUP-05", "lead_days": 14, "lead_sd_days": 3, "otd": 0.96},
        {"id": "SUP-06", "lead_days": 35, "lead_sd_days": 7, "otd": 0.81},
        {"id": "SUP-07", "lead_days": 21, "lead_sd_days": 4, "otd": 0.91},
        {"id": "SUP-08", "lead_days": 28, "lead_sd_days": 5, "otd": 0.88},
    ],
    "age_buckets": [
        {"id": "A0", "label": "0–30 天", "lo": 0, "hi": 31},
        {"id": "A1", "label": "31–60 天", "lo": 31, "hi": 61},
        {"id": "A2", "label": "61–90 天", "lo": 61, "hi": 91},
        {"id": "A3", "label": "91–180 天", "lo": 91, "hi": 181},
        {"id": "A4", "label": ">180 天", "lo": 181, "hi": 100000},
    ],
}

CATEGORY_RULES = [
    ("家居照明 / Lighting", ["T-LIGHT", "LANTERN", "CANDLE", "LIGHT ", "LIGHTS", "LAMP", "TEALIGHT"]),
    ("餐厨 / Kitchen", ["MUG", " CUP", "TEA ", "COFFEE", "PLATE", "BOWL", "JUG", "GLASS", "BOTTLE",
                     "CAKE", "BAKING", "KITCHEN", "APRON", "OVEN", "TRAY", "CUTLERY", "SPOON", "NAPKIN"]),
    ("袋包 / Bags", ["BAG", "SHOPPER", "TOTE", "PURSE", "LUGGAGE", "BACKPACK"]),
    ("文具纸品 / Stationery", ["CARD", "NOTE", "PAPER", " PEN", "PENCIL", "STICKER", "WRAP", " TAG",
                          "CHALK", "ENVELOPE", "BOOK", "JOURNAL", "STAMP"]),
    ("玩具游戏 / Toys", ["TOY", "GAME", "DOLL", "PUZZLE", "BALL", "SKITTLES", "PLAY ", "KIDS",
                      "CHILDREN", "CRAYON", "BUBBLE", "SPINNING TOP"]),
    ("饰品 / Jewellery", ["NECKLACE", "BRACELET", "EARRING", " RING", "JEWEL", "BEAD", "BROOCH",
                       "HAIR", "CLIP", "PENDANT", "CHARM", "TIARA"]),
    ("季节装饰 / Seasonal", ["CHRISTMAS", "PARTY", "DECORATION", "BAUBLE", "BUNTING", "FLAG",
                         "ORNAMENT", "ADVENT", "EASTER", "HALLOWEEN", "WREATH"]),
    ("收纳 / Storage", ["BOX", " TIN", "JAR", "STORAGE", "DRAWER", "SHELF", "BASKET", "HOLDER", "CHEST"]),
    ("家居装饰 / Home Decor", ["HEART", "HANGING", "SIGN", "FRAME", "MIRROR", "CUSHION", "DOORSTOP",
                           "CLOCK", "VASE", "CERAMIC", "WALL", "PHOTO"]),
]
DEFAULT_CAT = "其他 / Other"

NON_PRODUCT = {"POST", "DOT", "M", "C2", "BANK CHARGES", "AMAZONFEE", "SAMPLES", "D", "CRUK",
               "PADS", "B", "BANK CHARGE", "DCGS0003", "DCGSSBOY", "DCGSSGIRL", "GIFT", "S",
               "TEST001", "TEST002", "m", "C3", "DOTS"}


def classify(desc):
    u = " " + desc.upper().strip() + " "
    for name, kws in CATEGORY_RULES:
        for kw in kws:
            if kw in u:
                return name
    return DEFAULT_CAT


def stable_hash(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:8], 16)


def monday(d):
    return d - timedelta(days=d.weekday())


# ------------------------------------------------ 供应商交付实测（SRM 签收口径）
def make_delivery(po, sup, snapshot):
    """为一笔已到货 PO 生成交付实测记录。

    演示样本按供应商的 OTD 目标 + 确定性伪随机生成，可复现、无外部依赖。
    只记录事实日期，OTD / 提前期 / 延迟等判定一律由 engine.js 计算（单一计算源）。
    receipt_date 为供应商交付签收日（SRM），与库存回放按周到账的批次上架日
    分属不同粒度；该差异在界面「口径与来源」页显式披露。
    """
    eta = date.fromisoformat(po["eta"])
    otd = sup["otd"]
    # 用 PO 号做稳定哈希：同一 SKU 的订单数很少，线性同余会让 OTD 分布失真
    u = (stable_hash(po["id"] + "#otd") % 10000) / 10000.0
    r = stable_hash(po["id"] + "#delay")
    span = max(2, int(round(sup["lead_sd_days"] * (1 + (1 - otd) * 4))))
    if u < otd:
        delay = -(r % 3)                          # 提前 0~2 天到货
    else:
        delay = 1 + ((r >> 5) % span)             # 右偏长尾延迟
    room = (snapshot - eta).days - 1              # 实收必须早于快照日
    if delay > room:
        delay = max(-2, room)
    receipt = eta + timedelta(days=delay)
    return {
        "po_id": po["id"], "sku": po["sku"], "supplier": po["supplier"],
        "order_date": po["order_date"], "promise_date": po["promise_date"],
        "eta": po["eta"], "receipt_date": receipt.isoformat(),
        "qty": po["qty"], "qty_received": po["qty"],
    }


# ---------------------------------------------------------------- A. 读取真实交易
def load_real(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    print(f"[load] sheets={wb.sheetnames}")
    header = None
    tx = []
    for sname in wb.sheetnames:
        ws = wb[sname]
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                header = [str(x).strip() if x is not None else "" for x in row]
                print(f"[load] sheet={sname} header={header}")
                continue
            if not row or len(row) < 6:
                continue
            try:
                inv, code, desc, qty, dt, price = row[0], row[1], row[2], row[3], row[4], row[5]
            except Exception:
                continue
            if inv is None or code is None or dt is None:
                continue
            inv = str(inv)
            code = str(code).strip()
            if inv.upper().startswith("C"):            # 取消单
                continue
            if code in NON_PRODUCT or code.isalpha() and len(code) > 2 and code not in ("GIFT",):
                # 非商品费用码（POST/DOT/M 等）
                if not any(ch.isdigit() for ch in code):
                    continue
            try:
                qty = int(qty); price = float(price)
            except (TypeError, ValueError):
                continue
            if qty <= 0 or price <= 0 or not desc:
                continue
            if not isinstance(dt, (datetime, date)):
                continue
            d = dt.date() if isinstance(dt, datetime) else dt
            tx.append((code, str(desc).strip(), qty, price, d))
    wb.close()
    print(f"[load] valid real transactions = {len(tx):,}")
    return tx


def build_real_master(tx):
    dates = [t[4] for t in tx]
    dmin, dmax = min(dates), max(dates)
    first_mon = monday(dmin)
    last_mon = monday(dmax)
    # 最后一个完整周（排除数据末尾的不完整周）
    end_mon = last_mon - timedelta(days=7)
    all_mondays = []
    m = first_mon
    while m <= end_mon:
        all_mondays.append(m)
        m += timedelta(days=7)
    weeks = all_mondays[-52:]
    windex = {w: i for i, w in enumerate(weeks)}
    snapshot = weeks[-1] + timedelta(days=7)   # 最后完整周结束后的周一
    print(f"[weeks] {weeks[0]} .. {weeks[-1]}  n={len(weeks)}  snapshot={snapshot}")

    sku = {}
    for code, desc, qty, price, d in tx:
        wi = windex.get(monday(d))
        if wi is None:
            continue
        rec = sku.get(code)
        if rec is None:
            rec = {"id": code, "desc": Counter(), "weekly": [0.0] * len(weeks),
                   "revenue": [0.0] * len(weeks), "price_num": 0.0, "price_den": 0.0,
                   "recent_price_num": 0.0, "recent_price_den": 0.0}
            sku[code] = rec
        rec["desc"][desc] += 1
        rec["weekly"][wi] += qty
        rec["revenue"][wi] += qty * price
        rec["price_num"] += qty * price; rec["price_den"] += qty
        if wi >= len(weeks) - 13:
            rec["recent_price_num"] += qty * price; rec["recent_price_den"] += qty
    print(f"[master] distinct product codes = {len(sku):,}")
    return sku, weeks, snapshot, (dmin, dmax)


def pick_skus(sku, weeks):
    n = len(weeks)
    active, tail = [], []
    for code, r in sku.items():
        nz = sum(1 for v in r["weekly"] if v > 0)
        total = sum(r["weekly"])
        vol = sum(r["revenue"])
        if not r["desc"] or r["price_den"] <= 0:
            continue
        r["nz"] = nz; r["total"] = total; r["vol"] = vol
        r["recent"] = sum(r["weekly"][-13:])
        if nz >= 26 and total >= 200:
            active.append((code, r))
        elif 2 <= nz <= 20 and total >= 12:
            tail.append((code, r))
    active.sort(key=lambda x: -x[1]["vol"])
    tail.sort(key=lambda x: stable_hash(x[0]))
    chosen = active[:88] + tail[:32]
    print(f"[pick] active pool={len(active)} tail pool={len(tail)} chosen={len(chosen)}")
    return chosen


# ---------------------------------------------------------------- B. 回放推导库存台账
def simulate(chosen, sku, weeks, snapshot):
    P = BASELINE["review_period_weeks"]
    z = BASELINE["z_table"]["0.95"]
    cr = BASELINE["cost_rate"]
    win = BASELINE["demand_window_weeks"]
    cover = BASELINE["target_cover_weeks"]
    moq, pack = BASELINE["moq"], BASELINE["pack"]
    suppliers = BASELINE["suppliers"]
    whs = BASELINE["warehouses"]
    n = len(weeks)
    def week_date(t):
        """允许 t >= n：快照之后的真实日历日期，不截断"""
        return weeks[0] + timedelta(days=7 * t)

    out_skus, out_pos, out_batches, out_deliveries = [], [], [], []
    weekly_inv_value = [0.0] * n

    for idx, (code, r) in enumerate(chosen):
        h = stable_hash(code)
        desc = r["desc"].most_common(1)[0][0]
        price = (r["recent_price_num"] / r["recent_price_den"]) if r["recent_price_den"] else (r["price_num"] / r["price_den"])
        price = round(max(0.35, min(price, 60.0)), 2)
        unit_cost = round(price * cr, 2)
        cat = classify(desc)
        sup_idx = h % len(suppliers)
        sup = suppliers[sup_idx]
        wh = whs[(h >> 5) % len(whs)]
        L_days = sup["lead_days"]; Lsd_days = sup["lead_sd_days"]
        L = max(1, math.ceil(L_days / 7))
        Lsd = Lsd_days / 7
        # 需求统计：最近 win 周真实需求
        dw = r["weekly"][-win:]
        dbar = sum(dw) / len(dw)
        var = sum((v - dbar) ** 2 for v in dw) / max(1, len(dw) - 1)
        sd = math.sqrt(var)
        ss = z * math.sqrt(L * sd * sd + dbar * dbar * Lsd * Lsd)
        rop = dbar * L + ss
        target = dbar * (L + P) + ss + cover * dbar
        target = max(target, moq)

        # 长尾 / 换季 SKU 的历史积压：现实中的呆滞与冗余样本
        is_tail = r["nz"] <= 20
        tail_bias = 1.0
        if is_tail:
            tail_bias = [2.1, 2.8, 3.6, 4.4][(h >> 4) % 4]
        phase_out = is_tail and (h % 5 == 0)   # 停售/淘汰品：整 SKU 计入 Obsolete

        batches = []      # 批次层是库龄判定的唯一粒度
        pos = []          # 采购订单行
        on_order = []     # 未到货 {eta_w, qty, po}
        init_qty = int(math.ceil(target * tail_bias / pack) * pack)
        if is_tail:
            # 历史分批入库：避免"单一新批次稀释库龄"，让库龄分桶有真实层次
            mix = [(n - 46, 0.42), (n - 30, 0.34), (n - 13, 0.24)]
            for j, (w0, frac) in enumerate(mix):
                q = int(round(init_qty * frac / pack) * pack)
                if q > 0:
                    batches.append({"id": f"{code}-B{j}",
                                    "date": week_date(w0).isoformat(), "qty": q, "cost": unit_cost})
        else:
            batches.append({"id": f"{code}-B0", "date": week_date(n - 6).isoformat(),
                            "qty": init_qty, "cost": unit_cost})
        on_hand = sum(b["qty"] for b in batches)
        po_seq = 0
        stockout_weeks = 0
        weekly_oh = [0.0] * n

        for t in range(n):
            # 1) 到货
            arriving = [o for o in on_order if o["eta_w"] == t]
            for o in arriving:
                bq = o["qty"]
                batches.append({"id": f"{code}-B{len(batches)}",
                                "date": weeks[t].isoformat(), "qty": bq, "cost": unit_cost})
                on_hand += bq
                o["po"]["received_qty"] += bq
                o["po"]["status"] = "CLOSED"
                out_deliveries.append(o["delivery"])
            on_order = [o for o in on_order if o["eta_w"] > t]

            # 2) 真实需求消耗（FIFO）
            need = r["weekly"][t]
            remain = need
            for b in batches:
                if remain <= 0:
                    break
                take = min(b["qty"], remain)
                b["qty"] -= take; remain -= take; on_hand -= take
            if remain > 0:
                stockout_weeks += 1
            batches = [b for b in batches if b["qty"] > 0.5]

            # 3) 库存位置与补货决策
            ip = on_hand + sum(o["qty"] for o in on_order)
            if ip <= rop and t < n - 1:
                q = max(moq, math.ceil((target - ip) / pack) * pack)
                po_seq += 1
                eta = t + L
                order_date = week_date(t) + timedelta(days=1)
                eta_date = week_date(eta) + timedelta(days=4)
                # 供应商交期偏差：部分订单承诺交期早于实际 ETA，形成真实比例的逾期
                delay_bucket = (h + po_seq) % 4
                promise = eta_date - timedelta(days=delay_bucket * 6)
                ship_date = order_date + timedelta(days=3 + ((h + po_seq) % 4) * 5)
                po = {
                    "id": f"PO-{code}-{po_seq:02d}", "sku": code, "supplier": sup["id"],
                    "warehouse": wh, "qty": q, "unit_cost": unit_cost,
                    "order_date": order_date.isoformat(), "promise_date": promise.isoformat(),
                    "eta": eta_date.isoformat(), "ship_date": ship_date.isoformat(),
                    "lane": f"LANE-{wh[-3:]}-{sup['id'][-2:]}",
                    "carrier": f"CAR-{(h + po_seq) % 4 + 1:02d}",
                    "order_week": t, "eta_week": eta,
                    "received_qty": 0, "status": "OPEN", "lead_days": L_days,
                }
                pos.append(po)
                on_order.append({"eta_w": eta, "qty": q, "po": po,
                                 "delivery": make_delivery(po, sup, snapshot)})
            weekly_oh[t] = on_hand
            weekly_inv_value[t] += on_hand * unit_cost

        # 期末：未到货订单按「承诺交期 / 发运日 / 快照日」拆成互斥状态
        for o in on_order:
            po = o["po"]
            ship = date.fromisoformat(po["ship_date"])
            promise = date.fromisoformat(po["promise_date"])
            if promise < snapshot:
                po["status"] = "OVERDUE"; po["shipped_qty"] = po["qty"]
            elif ship > snapshot:
                po["status"] = "NOT_SHIPPED"; po["shipped_qty"] = 0
            else:
                po["status"] = "IN_TRANSIT"; po["shipped_qty"] = po["qty"]
            po["received_qty"] = 0

        # 精简 PO：只保留最近 14 周开具的单据
        pos = [p for p in pos if p["order_week"] >= n - 14]

        # 状态桶：预留 / 待检（演示配置，按稳定 hash 生成，不改变总数）
        oh = sum(b["qty"] for b in batches)
        reserved = int(min(oh * 0.12, max(0, (h % 17))))
        quarantine = int(min(oh - reserved, (h >> 9) % 11)) if oh > 20 else 0
        blocked = int(min(max(0, oh - reserved - quarantine), (h >> 13) % 7)) if oh > 40 else 0

        # 库龄 >180 的批次占比（长尾 SKU 天然更老）
        batch_out = []
        for b in batches:
            age = (snapshot - date.fromisoformat(b["date"])).days
            batch_out.append({"id": b["id"], "date": b["date"], "qty": int(round(b["qty"])),
                              "cost": b["cost"], "age_days": age})
        batch_out.sort(key=lambda x: x["date"])

        out_skus.append({
            "id": code, "desc": desc, "category": cat, "warehouse": wh, "supplier": sup["id"],
            "abc": None, "lifecycle": "PHASE_OUT" if phase_out else "ACTIVE",
            "unit_price": price, "unit_cost": unit_cost,
            "weekly": [round(v, 1) for v in r["weekly"]],
            "weekly_oh": [int(round(v)) for v in weekly_oh],
            "weekly_revenue": [round(v, 2) for v in r["revenue"]],
            "on_hand": int(round(oh)), "reserved": reserved, "quarantine": quarantine, "blocked": blocked,
            "batches": batch_out, "lead_days": L_days, "lead_sd_days": Lsd_days,
            "stockout_weeks": stockout_weeks, "tail_bias": tail_bias,
            "real_volume": round(r["vol"], 2), "weeks_with_demand": r["nz"],
        })
        out_pos.extend(pos)

    # ABC 分级：按真实销售额
    by_vol = sorted(out_skus, key=lambda s: -s["real_volume"])
    for i, s in enumerate(by_vol):
        q = i / max(1, len(by_vol))
        s["abc"] = "A" if q < 0.2 else ("B" if q < 0.5 else "C")

    # 交付记录与可见 PO 台账一一对应，避免下钻时出现「有签收、查不到单据」
    keep_po = {p["id"] for p in out_pos}
    out_deliveries = [d for d in out_deliveries if d["po_id"] in keep_po]
    out_deliveries.sort(key=lambda d: (d["receipt_date"], d["po_id"]))
    return out_skus, out_pos, out_deliveries, weekly_inv_value


# ---------------------------------------------------------------- 输出
def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "Online Retail.xlsx")
    if not os.path.exists(src):
        print(f"[error] source not found: {src}"); sys.exit(1)
    tx = load_real(src)
    sku, weeks, snapshot, (dmin, dmax) = build_real_master(tx)
    chosen = pick_skus(sku, weeks)
    skus, pos, deliveries, weekly_inv_value = simulate(chosen, sku, weeks, snapshot)

    meta = {
        "source": "UCI Machine Learning Repository · Online Retail (id=352)",
        "source_url": "https://archive.ics.uci.edu/dataset/352/online+retail",
        "doi": "10.24432/C5BW33",
        "license": "CC BY 4.0",
        "currency": "GBP",
        "currency_note": "UCI 官方变量表定义 UnitPrice 的 Units = sterling（英镑）。原表无 Currency 列，38 个国家的客户统一以 GBP 计价；工作台全部金额沿用该币种，成本额 = 数量 × 估算单位成本，不做汇率换算。",
        "publisher": "Daqing Chen, London South Bank University (2015)",
        "description": "英国某无实体店礼品批发电商的全量真实交易记录，客户以批发商为主，主营礼品与家居小件。",
        "raw_period": [dmin.isoformat(), dmax.isoformat()],
        "raw_rows": 541909,
        "clean_rows": len(tx),
        "snapshot_date": snapshot.isoformat(),
        "weeks": [w.isoformat() for w in weeks],
        "sku_count": len(skus),
        "po_count": len(pos),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "real_fields": [
            "SKU 编码 StockCode、品名 Description、交易数量 Quantity、成交单价 UnitPrice（单位：sterling / GBP 英镑）、交易日期 InvoiceDate",
            "由上述真实交易聚合的周度需求序列、周度销售额、商品销售金额与 ABC 分级（金额均为 GBP；销售额口径与库存成本口径不可相加）",
        ],
        "derived_fields": [
            "单位成本 = 真实成交单价 × 成本率（数据集仅含售价，成本率为可调演示参数）",
            "品类 / 仓库 / 供应商代号 SUP-01..08 / 提前期 / 提前期标准差：演示主数据配置，非真实供应商名称",
            "On-hand、状态桶（预留/待检/冻结）、批次、采购订单、在途：以连续检查 (s,Q) 策略回放真实周需求推导",
            "长尾 SKU 按历史分批入库、换季停售（PHASE_OUT）与供应商交期偏差建模，用于产生呆滞 / 冗余 / 逾期样本",
            "承运商、线路均为中性代号（CAR-xx / LANE-xx），不代表任何真实企业",
            "供应商交付实测记录 deliveries：按各供应商 OTD 目标 + 确定性伪随机生成的签收日（SRM 口径），与 PO 一一对应；",
            "  含下单日 / 合同承诺日 / 确认 ETA / 实收日。所有 OTD、延迟、实测提前期的判定与滚动统计均由 engine.js 完成，不在数据中预置结论",
            "  库存回放按到货周结算（WMS 周粒度），与交付签收日可能相差数日；实际接入时分别取收货单与上架单时间戳",
            "凡演示配置项均可在「参数与口径」页调整，调整后重算建议值，不改写已生成的库存台账（point-in-time）",
        ],
        "notes": [
            "本工作台的库存事实是「按公开真实需求回放生成的演示台账」，不是任何企业的真实库存记录。",
            "接入实际业务时，用「导入数据」替换 SKU 主数据、库存快照、批次与 PO 即可，指标引擎口径不变。",
            "金额币种由 meta.currency（ISO 4217）声明；导入自有数据时用 JSON 的 meta.currency 或 CSV 注释行 # currency=CNY 指定，工作台不做汇率换算，同一份数据的金额必须已是同一币种。",
        ],
    }
    dataset = {
        "meta": meta,
        "params": BASELINE,
        "skus": skus,
        "pos": pos,
        "deliveries": deliveries,
        "weekly_inventory_value": [round(v, 2) for v in weekly_inv_value],
    }
    # 三类指纹彼此分离：源文件证明「用的是哪一份真实数据」，数据集指纹可由浏览器当场复算，
    # 规则指纹把 engine.js 的计算口径钉死；改了引擎却不重跑构建，验证脚本会报错。
    engine_path = os.path.join(ROOT, "assets", "engine.js")
    ds_bytes = canonical_bytes(dataset)
    dataset["meta"]["evidence"] = {
        "source_file": os.path.relpath(src, ROOT),
        "source_sha256": sha256_file(src),
        "dataset_sha256": hashlib.sha256(ds_bytes).hexdigest(),
        "dataset_bytes": len(ds_bytes),
        "rule_file": "assets/engine.js",
        "rule_sha256": sha256_file(engine_path),
        "rule_version": "ICW-ENGINE-2026.11.14",
        "hash_algorithm": "SHA-256",
        "hash_scope": "dataset 规范化 JSON（排除 meta.evidence；key 排序、整数值浮点归一为 int、非 ASCII 不转义）",
        "recompute_hint": "浏览器端删除 meta.evidence 后按 canonical() 序列化并取 SHA-256，应与 dataset_sha256 一致",
    }
    os.makedirs(OUT, exist_ok=True)
    jp = os.path.join(OUT, "dataset.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "dataset.js"), "w", encoding="utf-8") as f:
        f.write("window.INV_DATA = ")
        json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"[out] {jp}  {os.path.getsize(jp)/1024:.1f} KB")
    print(f"[out] skus={len(skus)} pos={len(pos)} deliveries={len(deliveries)} batches={sum(len(s['batches']) for s in skus)}")
    by_sup = defaultdict(list)
    for x in deliveries:
        by_sup[x["supplier"]].append(x)
    for sid in sorted(by_sup):
        g = by_sup[sid]
        late = sum(1 for x in g if x["receipt_date"] > x["eta"])
        print(f"[otd] {sid}: n={len(g):2d}  on-time(ETA)={1 - late / len(g):.1%}")
    onh = [s["on_hand"] for s in skus]
    print(f"[check] on_hand total={sum(onh):,} min={min(onh)} max={max(onh)} zero={sum(1 for v in onh if v==0)}")


if __name__ == "__main__":
    main()
