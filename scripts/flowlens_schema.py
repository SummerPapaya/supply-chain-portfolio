"""FlowLens · 字段映射与分析参数的单一事实来源。

换用企业自有 ERP / WMS / OMS 数据时，只需：
  1. 把导出表按 FILES 里列出的文件名放进 --input 目录；
  2. 修改下面的 COLUMNS 映射（逻辑字段名 -> 你方 CSV 的真实列名）；
  3. 保持每个逻辑字段的语义与 TYPE 一致，重跑 build_flowlens.py。
页面「方法与局限」会把这份映射原样摊开，口径不藏在代码里。
"""

# ---------------------------------------------------------------- 文件
FILES = {
    "orders": "olist_orders_dataset.csv",
    "items": "olist_order_items_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "products": "olist_products_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "reviews": "olist_order_reviews_dataset.csv",
    "payments": "olist_order_payments_dataset.csv",
    "category": "product_category_name_translation.csv",
}

# ---------------------------------------------------------------- 字段映射
COLUMNS = {
    "orders": {
        "order_id": "order_id",
        "customer_id": "customer_id",
        "status": "order_status",
        "purchase_ts": "order_purchase_timestamp",
        "approved_ts": "order_approved_at",
        "carrier_ts": "order_delivered_carrier_date",
        "delivered_ts": "order_delivered_customer_date",
        "estimated_ts": "order_estimated_delivery_date",
    },
    "items": {
        "order_id": "order_id",
        "item_seq": "order_item_id",
        "product_id": "product_id",
        "seller_id": "seller_id",
        "shipping_limit_ts": "shipping_limit_date",
        "price": "price",
        "freight": "freight_value",
    },
    "customers": {
        "customer_id": "customer_id",
        "unique_id": "customer_unique_id",
        "zip": "customer_zip_code_prefix",
        "city": "customer_city",
        "state": "customer_state",
    },
    "products": {
        "product_id": "product_id",
        "category": "product_category_name",
        "weight_g": "product_weight_g",
    },
    "sellers": {
        "seller_id": "seller_id",
        "zip": "seller_zip_code_prefix",
        "city": "seller_city",
        "state": "seller_state",
    },
    "reviews": {
        "order_id": "order_id",
        "score": "review_score",
        "created_ts": "review_creation_date",
    },
    "payments": {
        "order_id": "order_id",
        "type": "payment_type",
        "value": "payment_value",
    },
    "category": {
        "raw": "product_category_name",
        "english": "product_category_name_english",
    },
}

# ---------------------------------------------------------------- 分析参数
PARAMS = {
    # 时段：日历日比较（承诺日是 00:00:00 的日期，不能用时间戳直接比）
    "date_format": "%Y-%m-%d %H:%M:%S",
    "calendar_day_basis": True,
    # 显著异常筛查：Wilson 95% 置信下界 > 总体延迟率，且样本量下限
    "wilson_z": 1.96,
    "min_group_n": 100,
    # 帕累托：累计延迟订单占比的目标线
    "pareto_targets": [50, 80],
    # 情景承诺天数（what-if），仅为敏感性展示，不构成建议承诺天数
    "promise_scenarios": [7, 10, 12, 15, 18, 21, 24, 28],
    # 首尾残月：订单量低于该值不参与趋势结论（仍展示，标注）
    "partial_month_min_orders": 100,
    # 运费率分带（freight / price，%）
    "freight_bands": [0, 5, 10, 15, 20, 30, 10 ** 9],
    # 订单行数分带
    "item_bands": [1, 2, 3, 5, 10 ** 9],
}

# ---------------------------------------------------------------- 事实表列
# 紧凑整数行；-1 表示不可得。顺序即 facts.csv 的列顺序。
FACT_FIELDS = [
    "m",        # 月份索引（对应 dictionaries.months）
    "ss",       # 主卖家州索引
    "cs",       # 客户州索引
    "cat",      # 主品类索引（英文）
    "price",    # 商品价格合计（分）
    "freight",  # 运费合计（分）
    "n",        # 订单行数
    "w",        # 商品重量合计（克）
    "a",        # purchase -> approved（百分之一天，-1 = 缺失/为负）
    "h",        # approved -> carrier 交接（百分之一天）
    "t",        # carrier -> customer 在途（百分之一天）
    "T",        # 总周期：送达日 - 下单日（日历日）
    "K",        # 承诺缓冲：承诺日 - 下单日（日历日）
    "rv",       # 评价分 1..5，-1 = 无评价
    "st",       # 订单状态索引
    "flag",     # 数据质量位掩码
]

# flag 位（可叠加）
FLAGS = [
    ("no_items", 1, "订单无商品行 / has no item lines"),
    ("no_delivered", 2, "已送达但缺送达日期 / delivered with missing delivery date"),
    ("bad_order", 4, "日期倒置 / date inversion"),
    ("neg_handoff", 8, "交接时长为负 / negative handoff duration"),
    ("neg_transit", 16, "在途时长为负 / negative transit duration"),
    ("no_category", 32, "品类缺失或未翻译 / missing or untranslated category"),
    ("no_review", 64, "无评价 / no review"),
    ("zero_freight", 128, "运费为零 / zero freight"),
]

SOURCE = {
    "name_zh": "Olist 巴西电商公开数据集（Brazilian E-Commerce Public Dataset by Olist）",
    "name_en": "Brazilian E-Commerce Public Dataset by Olist",
    "publisher": "Olist / Kaggle",
    "dataset_url": "https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce",
    "license": "CC BY-NC-SA 4.0",
    "license_url": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "note_zh": "真实匿名商业订单流水；署名、非商业使用、相同方式共享。本看板仅作研究与作品集展示，衍生聚合数据同样遵循该许可；企业商用须替换为自有数据。",
    "note_en": "Real anonymised commercial order records; attribution, non-commercial and share-alike apply. This dashboard is research / portfolio use only; derived aggregates carry the same licence. Replace with your own data for commercial use.",
}
