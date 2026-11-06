"""FlowLens · 业务核查剧本（中英双语）。

由供应链专家团按「履约交付」与「数据可信度」两组分工拟定，统一转写为
四列结构：信号 / 核查动作 / 触发条件 / 换用企业数据所需字段。
产品只展示这一份统一转写版；全局边界说明在 PLAYBOOK_NOTE，不逐条重复。
"""

PLAYBOOK_NOTE = {
    "zh": "本清单只给「查哪张表、问哪个角色、核哪个字段」与触发口径，不给建议承诺天数、最优库存、下单量或降本结论；法规与 SLA 适用范围以企业官方最新文本为准。",
    "en": "This list states only which table to check, which role to ask, which field to reconcile, and the trigger rule. It gives no recommended promise window, optimal inventory, order quantity or savings claim; SLA scope follows the company's current official text.",
}

PLAYBOOKS = [
    {
        "id": "D1", "group": "deliver",
        "signal": {"zh": "某「卖家州 → 客户州」线路按时率显著低于总体，且样本量达到下限", "en": "A seller-state → customer-state lane has an on-time rate significantly below the overall rate with an adequate sample"},
        "action": {"zh": "在《运输台账》按起运州 + 目的州筛出该线路的在途运单，核对「卖家发货截止日 shipping_limit_date / 承运交接时间 / 到港与派送节点 / 承诺送达日」；由承运与区域调度确认是否共用中转、周末作业安排", "en": "Filter the lane in the transport ledger and reconcile seller shipping-limit date / carrier handoff / hub and last-mile nodes / promised date; ask the carrier and regional dispatch about shared hubs and weekend operations"},
        "trigger": {"zh": "延迟率 Wilson 95% 下界 > 总体延迟率，且线路订单数 ≥100", "en": "Wilson 95% lower bound of the late rate exceeds the overall late rate and lane volume ≥100"},
        "fields": {"zh": "运单号、起运州、目的州、交接时间、中转节点、派送时间、承诺日、确认人", "en": "Shipment ID, origin state, destination state, handoff time, hub, last-mile timestamp, promised date, approver"},
    },
    {
        "id": "D2", "group": "deliver",
        "signal": {"zh": "某品类的延迟订单在帕累托累计中占据靠前位置", "en": "A product category ranks high in the cumulative Pareto of late orders"},
        "action": {"zh": "在《商品主数据》核对该品类的重量、体积与包装要求，与《出库记录》的实际交接时长比对；由仓管确认是否需单独分拣或加固", "en": "Check weight, dimensions and packaging requirements in the product master against actual handoff time in the outbound log; ask the warehouse whether separate sorting or reinforcement applies"},
        "trigger": {"zh": "该品类延迟订单数进入累计前 50% 的品类集合", "en": "The category falls inside the set contributing the first 50% of late orders"},
        "fields": {"zh": "SKU、品类、重量、体积、包装码、出库时间、交接时间、确认人", "en": "SKU, category, weight, dimensions, packaging code, pick time, handoff time, approver"},
    },
    {
        "id": "D3", "group": "deliver",
        "signal": {"zh": "在途时长 P90 明显高于整体 P90 的线路或品类", "en": "A lane or category shows a P90 transit time well above the overall P90"},
        "action": {"zh": "在《承运交接表》核交承运日期与签收日期的字段来源是否一致；由物流分析按承运商分层统计异常率、核时效规则表版本，确认是否混入周末、节假日或异常补录", "en": "Verify that carrier handoff and proof-of-delivery dates come from the same source in the handoff table; ask logistics analytics to stratify anomalies by carrier, check the SLA-rule version, and confirm weekends, holidays or backfilled records"},
        "trigger": {"zh": "分组 P90 ≥ 整体 P90 × 1.5 且样本量 ≥100", "en": "Group P90 ≥ 1.5 × overall P90 with volume ≥100"},
        "fields": {"zh": "运单号、交承运时间、签收时间、日历标记、录单来源、录入人、确认日期", "en": "Shipment ID, carrier handoff, POD time, calendar flag, capture source, data-entry user, approval date"},
    },
    {
        "id": "D4", "group": "deliver",
        "signal": {"zh": "运费率（运费 / 商品额）落在高位分带且延迟率同步偏高", "en": "A high freight-to-price band also shows an elevated late rate"},
        "action": {"zh": "在《运费结算表》核计费重、费率与附加费项，与《订单行》的商品额比对；由结算确认是否存在按距离或重量分档的计费规则差异", "en": "Reconcile chargeable weight, rate and surcharge lines in the freight settlement table against item value in the order lines; ask settlement whether distance/weight pricing tiers differ"},
        "trigger": {"zh": "该运费率分带延迟率 > 总体延迟率且订单数 ≥100", "en": "Band late rate exceeds the overall late rate with volume ≥100"},
        "fields": {"zh": "订单号、商品额、运费额、计费重、费率、附加费、结算单号、确认人", "en": "Order ID, item value, freight value, chargeable weight, rate, surcharges, settlement ID, approver"},
    },
    {
        "id": "D5", "group": "deliver",
        "signal": {"zh": "承诺缓冲（承诺日 − 下单日）与实际总周期差距在各分组间不一致", "en": "The gap between promised buffer and actual cycle time varies across groups"},
        "action": {"zh": "在《承诺规则配置表》核各线路的承诺天数模板与生效版本；由计划员确认是否沿用同一套日历口径，不做规则改动、只登记差异", "en": "Check the promise-day template and its effective version per lane in the promise-rule config; ask planning whether one calendar convention is used. Register differences only, do not change the rule"},
        "trigger": {"zh": "分组承诺缓冲中位数与整体中位数相差 ≥3 天", "en": "Group median promise buffer differs from the overall median by ≥3 days"},
        "fields": {"zh": "线路、承诺天数、规则版本、生效日、日历口径、下单日、承诺日、登记人", "en": "Lane, promise days, rule version, effective date, calendar convention, purchase date, promised date, recorder"},
    },
    {
        "id": "D6", "group": "deliver",
        "signal": {"zh": "低分评价集中在延迟送达的订单上", "en": "Low review scores cluster on late-delivered orders"},
        "action": {"zh": "在《评价表》按订单号关联送达状态，核对评价触发时间与送达时间；由客服确认低分原因码是否可区分「时效」与「商品」", "en": "Join reviews to delivery status by order ID and compare survey trigger time with delivery time; ask customer service whether reason codes separate timeliness from product issues"},
        "trigger": {"zh": "延迟订单的 1–2 分占比高于按时订单", "en": "Share of 1–2 star scores is higher among late orders than on-time orders"},
        "fields": {"zh": "订单号、送达日、承诺日、评价分、评价触发日、原因码、确认人", "en": "Order ID, delivery date, promised date, review score, survey trigger date, reason code, approver"},
    },
    {
        "id": "Q1", "group": "quality",
        "signal": {"zh": "订单主表中存在无商品行的订单", "en": "Orders exist with no item lines"},
        "action": {"zh": "在《订单主表》按订单号左关联《订单行》，筛出未命中行；由订单管理员核状态与创建来源，确认是取消、缺货还是 ETL 丢行，不直接归因", "en": "Left-join the order header to order lines and isolate unmatched IDs; ask the order administrator to check status and capture source, distinguishing cancellation, stock-out and ETL loss without assuming a cause"},
        "trigger": {"zh": "未命中行数 > 0 即列入核查", "en": "Any unmatched row enters the check"},
        "fields": {"zh": "订单号、订单状态、创建时间、来源系统、商品行数、ETL 批次号、确认人", "en": "Order ID, status, created time, source system, line count, ETL batch ID, approver"},
    },
    {
        "id": "Q2", "group": "quality",
        "signal": {"zh": "交承运时间早于审批时间，形成负的交接时长", "en": "Carrier handoff precedes approval, producing a negative handoff duration"},
        "action": {"zh": "在《订单事件表》按订单号拉出审批与交接两条事件，核对时间戳字段来源、时区与状态机日志；由数据治理确认是否为补录、状态回填或时区错位，不改写原始值", "en": "Pull approval and handoff events by order ID against timestamp source, timezone and the state-machine log; ask data governance about backfill, status rewrite or timezone drift. Do not overwrite raw values"},
        "trigger": {"zh": "负时长记录数 > 0 且占已送达订单比例超过预设核查线", "en": "Negative-duration records exist and exceed the configured review threshold"},
        "fields": {"zh": "订单号、事件类型、事件时间、时区、来源系统、录单人、批次号、确认人", "en": "Order ID, event type, event time, timezone, source system, entry user, batch ID, approver"},
    },
    {
        "id": "Q3", "group": "quality",
        "signal": {"zh": "已送达订单缺送达日期，或送达时间早于下单时间", "en": "Delivered orders lack a delivery date or the delivery timestamp precedes purchase"},
        "action": {"zh": "在《签收记录》按订单号核实签时间、签收凭证时间与状态变更日志；由客服核签收凭证、履约专员确认是签收未回传还是状态误置", "en": "Check actual delivery time, POD evidence time and the status-change log by order ID; ask customer service for the POD evidence and fulfilment whether it was not returned or the status was mis-set"},
        "trigger": {"zh": "日期缺失或倒置记录数 > 0；这些订单不进入按时率分母", "en": "Any missing/inverted date; these orders are excluded from the on-time denominator"},
        "fields": {"zh": "订单号、下单时间、签收时间、状态变更时间、签收人、来源系统、确认人", "en": "Order ID, purchase time, POD time, status-change time, receiver, source system, approver"},
    },
    {
        "id": "Q4", "group": "quality",
        "signal": {"zh": "首尾月份订单量只有个位数，形成不完整统计月", "en": "The first and last months contain only a handful of orders"},
        "action": {"zh": "在《数据字典》核抽取起止时间、快照/分区日与订单创建时间的过滤条件；由数据治理确认是导出的边界截断还是业务本身未上线", "en": "Check extraction window, snapshot/partition date and purchase-time filter in the data dictionary; ask data governance whether the boundary is an export cut-off or a pre-launch period"},
        "trigger": {"zh": "月订单量 < 100 的月份在趋势结论中排除，但仍展示并标注", "en": "Months below 100 orders are excluded from trend conclusions but still shown and flagged"},
        "fields": {"zh": "月份、订单数、抽取起始时间、抽取结束时间、过滤条件、批次号、确认人", "en": "Month, order count, extraction start/end, filter condition, batch ID, approver"},
    },
    {
        "id": "Q5", "group": "quality",
        "signal": {"zh": "非 delivered 状态订单没有送达日期，无法进入按时率分母", "en": "Non-delivered orders have no delivery date and cannot enter the on-time denominator"},
        "action": {"zh": "在《订单状态表》按状态分组核数量、最后一次状态变更时间与计费状态、取消/退款标记；由履约专员确认在途、取消、不可用各状态是否应单列，不并入按时率", "en": "Group order status and check counts, last status-change time, billing status and cancellation/refund flags; ask fulfilment to keep in-transit, cancelled and unavailable states separate from the on-time rate"},
        "trigger": {"zh": "分母口径须在页面固定并公开，状态分组不得静默合并", "en": "Denominator definition must be fixed and published; status groups must not be silently merged"},
        "fields": {"zh": "订单号、状态、状态变更时间、取消原因码、承诺日、确认人", "en": "Order ID, status, status-change time, cancellation reason, promised date, approver"},
    },
    {
        "id": "Q6", "group": "quality",
        "signal": {"zh": "评价只在收货或承诺到期时触发，覆盖并非随机样本", "en": "Surveys trigger on delivery or promise expiry, so coverage is not a random sample"},
        "action": {"zh": "在《问卷发放表》核发放规则、触发条件与未答订单清单；由客服分析确认低分与延迟的关联是否受发放机制影响，不下因果结论", "en": "Check distribution rule, trigger condition and non-response list in the survey log; ask CX analytics whether the low-score/lateness association is affected by the trigger. No causal claim"},
        "trigger": {"zh": "评价覆盖率与低分占比须与分母口径一起展示", "en": "Survey coverage and low-score share must be shown alongside the denominator definition"},
        "fields": {"zh": "订单号、发放时间、触发条件、回收时间、评价分、送达状态、确认人", "en": "Order ID, send time, trigger condition, response time, review score, delivery status, approver"},
    },
]
