#!/usr/bin/env python3
# scripts/chainscope_rules.py
# ChainScope 端到端供应链战略信号台 —— 标注规则的单一事实来源。
#
# 设计原则（与本站产品红线一致）：
#  1. 只用「可审计的确定性词典匹配」，不引入 LLM / 模型推理；每条信号的命中词写进
#     signal-data.json，页面上可点开逐条核对「为什么被打上这个标签」。
#  2. 环节与风险是两套正交维度，允许一条信号同时命中多个标签——现实中的
#     「霍尔木兹袭船」本来就同时冲击 Source（能源/原料）与 Deliver（航线）。
#  3. 词典是编辑口径，不是行业分类标准。修改本文件即改变全部统计，
#     页面「方法与局限」区会自动展示当前生效的词典全文，便于复核与质疑。
#  4. 严禁在此写入任何数值型结论（风险概率、金额、建议下单量）。
#
# 匹配规则：中文按子串、英文按词边界；title 命中即计，desc 需命中 >= DESC_MIN_HITS
# 个不同词才计（描述里常顺带提及大量背景词，避免噪声放大）。

DESC_MIN_HITS = 2
DESC_CHARS = 600          # 只取描述前 600 字参与匹配，控制长尾噪声

# ---------------------------------------------------------------- SCOR 主链
# SCOR (Supply Chain Operations Reference) 的五个一级流程：Plan / Source / Make /
# Deliver / Return；Enable 是横切使能层，不计入主链流程条，单独作为「数字化使能覆盖度」。
STAGES = [
    {"key": "plan",    "zh": "计划",   "en": "Plan",    "color": "#5b6ab0",
     "zhDesc": "需求与供应的平衡、网络与产能规划、情景与预案",
     "enDesc": "Demand/supply balancing, network & capacity planning, scenarios"},
    {"key": "source",  "zh": "采购",   "en": "Source",  "color": "#b07a2c",
     "zhDesc": "寻源、关税与原产地、供应商结构与准入、贸易合规",
     "enDesc": "Sourcing, tariffs & origin, supplier base and准入, trade compliance"},
    {"key": "make",    "zh": "生产",   "en": "Make",    "color": "#2f7d6a",
     "zhDesc": "产能与产线、制造执行、区域化布局与生产中断",
     "enDesc": "Capacity & lines, manufacturing execution, footprint, production disruption"},
    {"key": "deliver", "zh": "交付",   "en": "Deliver", "color": "#2b5d78",
     "zhDesc": "运输与仓储、港口与航路、运价与准班、履约与末端",
     "enDesc": "Transport & warehousing, ports & lanes, rates & reliability, fulfilment"},
    {"key": "return",  "zh": "逆向",   "en": "Return",  "color": "#9a5a76",
     "zhDesc": "退货、返修、回收与逆向仓作业",
     "enDesc": "Returns, repair, recovery and reverse-warehouse operations"},
]
ENABLE = {"key": "enable", "zh": "数字化使能", "en": "Digital Enablement", "color": "#7a52a8",
          "zhDesc": "AI / 自动化 / 数字孪生 / 数据平台等横切能力（不计入主链五段）",
          "enDesc": "Cross-cutting AI / automation / digital-twin / data-platform capability"}

STAGE_TERMS = {
    "plan": {
        "zh": ["需求预测", "预测", "排产", "产能规划", "库存策略", "网络规划", "选址",
               "情景", "规划", "十五五", "基线", "补货", "S&OP", "计划", "战略",
               "重构", "布局", "预案", "供需平衡", "重设计", "工作流"],
        "en": ["forecast", "forecasting", "demand planning", "planning", "s&op",
               "network design", "footprint", "scenario", "capacity planning",
               "inventory strategy", "replan", "workflow redesign", "contingency"],
    },
    "source": {
        "zh": ["关税", "加征", "反制", "301", "232", "贸易救济", "配额", "出口管制",
               "制裁", "黑名单", "供应商", "采购", "寻源", "招标", "破产",
               "订单转移", "订单转向", "熔炼地", "原产地", "披露", "CBP", "USTR",
               "芯片短缺", "稀土", "多晶硅", "无人机", "FCC", "合规", "报关",
               "申报", "降税", "休战", "贸易战", "对等", "反垄断", "收购",
               "整零协同", "港口费", "磋商", "采购高管", "低值豁免"],
        "en": ["tariff", "duty", "duties", "sanction", "export control", "sourcing",
               "procurement", "supplier", "vendor", "quota", "origin", "cbp", "ustr",
               "fcc", "antidumping", "trade remedy", "chip shortage", "insolvency",
               "bankruptcy", "antitrust", "customs", "declaration", "trade war",
               "truce", "reshoring", "de minimis", "trade deal"],
    },
    "make": {
        "zh": ["制造", "产能", "产线", "工厂", "投产", "生产", "组装", "晶圆",
               "电池", "区域制造", "机器人工厂", "具身", "智能制造", "产业链",
               "生产基地", "整零", "高速柔性", "流水线", "量产", "在制"],
        "en": ["manufacturing", "factory", "plant", "production", "assembly",
               "semiconductor", "fab", "capacity", "production line", "industrial robot",
               "fabrication", "assembly line"],
    },
    "deliver": {
        "zh": ["海运", "运价", "运费", "航线", "运河", "海峡", "港口", "码头",
               "罢工", "空运", "班轮", "准班率", "集装箱", "油轮", "VLCC",
               "滞港", "拥堵", "停航", "空班", "履约", "配送", "仓储", "仓库",
               "WMS", "分拣", "铁路", "班列", "多式联运", "在途", "船队",
               "苏伊士", "红海", "巴拿马", "霍尔木兹", "黑海", "曼德海峡",
               "亚丁湾", "SCFI", "WCI", "Drewry", "BDI", "FAK", "通行", "吃水",
               "等泊", "货量", "吨量", "件量", "快递", "在港", "中欧班列",
               "联运", "船公司", "承运人", "附加费", "日租金", "现货", "空箱",
               "堆场", "驳船", "干线", "末端", "无人车", "无人机配送",
               "在途库存", "ETA", "追踪", "回摆", "复航", "泊位", "陆桥",
               "通道", "货代", "航运", "集运", "码头工人", "货主", "班轮公司"],
        "en": ["maritime", "shipping", "freight", "lane", "canal", "strait", "port",
               "terminal", "strike", "air cargo", "liner", "schedule reliability",
               "container", "tanker", "vlcc", "congestion", "blank sailing",
               "fulfilment", "fulfillment", "delivery", "warehouse", "warehousing",
               "wms", "sorting", "rail", "multimodal", "in-transit", "fleet",
               "suez", "red sea", "panama", "hormuz", "black sea", "transit",
               "draft", "berth", "carrier", "surcharge", "spot rate", "charter",
               "intermodal", "eta", "tracking", "shipment", "vessel", "shipping line"],
    },
    "return": {
        "zh": ["退货", "逆向", "回收", "返修", "售后", "退款", "退回", "循环包装",
               "退货仓", "二次销售"],
        "en": ["returns", "reverse logistics", "recommerce", "refund",
               "reverse supply chain", "return robot", "return flow"],
    },
    "enable": {
        "zh": ["AI", "人工智能", "代理式", "智能体", "数字孪生", "自动化", "机器人",
               "算法", "模型", "平台", "软件", "系统", "渗透率", "数字化", "编排",
               "生成式", "大模型", "数据", "智能仓", "WMS", "物理 AI", "具身",
               "人机", "技术趋势", "魔力象限", "MCP", "智能体场景", "代理权限",
               "采用率", "规模化", "试点", "无人化", "预测模型", "数据战"],
        "en": ["ai", "agentic", "digital twin", "automation", "robot", "orchestration",
               "generative", "llm", "platform", "software", "adoption",
               "machine learning", "agent", "digitalisation", "digitalization",
               "wms", "humanoid", "gartner", "mckinsey", "ai agent", "copilot"],
    },
}

# ---------------------------------------------------------------- 风险维度
RISKS = [
    {"key": "geo",     "zh": "地缘与安全",   "en": "Geopolitics & Security", "color": "#b3453f"},
    {"key": "flow",    "zh": "通道与连续性", "en": "Lanes & Continuity",     "color": "#2b5d78"},
    {"key": "cost",    "zh": "运价与成本",   "en": "Rates & Cost",           "color": "#b07a2c"},
    {"key": "trade",   "zh": "关税与合规",   "en": "Tariff & Compliance",    "color": "#8a52a8"},
    {"key": "demand",  "zh": "需求与库存",   "en": "Demand & Inventory",     "color": "#2f7d6a"},
    {"key": "digital", "zh": "数字化与 AI",  "en": "Digital & AI",           "color": "#5b6ab0"},
]

RISK_TERMS = {
    "geo": {
        "zh": ["霍尔木兹", "红海", "苏伊士", "黑海", "曼德海峡", "亚丁湾", "袭船",
               "袭击", "遇袭", "劫持", "水雷", "触雷", "导弹", "冲突", "战争",
               "禁航", "实弹", "地缘", "制裁", "经济战", "投射物", "巡逻机",
               "北约", "吸附式", "武装人员", "海峡", "战事", "伊朗", "胡塞",
               "俄乌", "船员", "袭扰", "清除水雷", "商船连遭"],
        "en": ["hormuz", "red sea", "suez", "black sea", "bab el-mandeb", "attack",
               "hijack", "mine", "missile", "conflict", "war", "sanction",
               "geopolitical", "strait", "militia", "drone attack", "tanker attack",
               "naval", "blockade"],
    },
    "flow": {
        "zh": ["运河", "通行量", "配额", "吃水", "干旱", "停航", "空班", "运力",
               "拥堵", "滞港", "准班率", "罢工", "港口", "码头", "台风",
               "低水位", "枯水", "积压", "等泊", "堆场", "空箱", "中断",
               "系统中断", "网络攻击", "破产", "反垄断", "替代运力", "改道",
               "回摆", "复航", "放宽", "解除", "陆桥", "通道", "班列", "联运",
               "航次取消", "削减运力", "有效运力", "订单簿", "船队", "联合行动",
               "停点鼠标", "无人车", "自动化码头", "履约中心", "缺货"],
        "en": ["canal", "transit", "quota", "draft", "drought", "blank sailing",
               "capacity", "congestion", "berth", "strike", "port", "terminal",
               "typhoon", "low water", "schedule reliability", "backlog", "outage",
               "cyberattack", "bankruptcy", "antitrust", "rerouting", "reopen",
               "rail", "multimodal", "shipment delay", "disruption"],
    },
    "cost": {
        "zh": ["运价", "运费", "附加费", "日租金", "指数", "WCI", "SCFI", "BDI",
               "ClarkSea", "涨价", "费率", "现货", "FAK", "回落", "新高",
               "成本", "价格", "价差", "保费", "战争险", "处理费", "插队费",
               "拍卖", "竞拍", "通行费", "万美元", "降本", "节省", "收益",
               "运输费", "连涨", "连跌", "反弹", "上调", "跌至", "涨至",
               "美元/公斤", "美元/FEU", "美元/天", "同比", "环比"],
        "en": ["freight rate", "spot rate", "surcharge", "charter rate", "index",
               "wci", "scfi", "bdi", "fak", "cost", "price", "premium", "war risk",
               "fee", "savings", "rate", "billion", "million", "percent"],
    },
    "trade": {
        "zh": ["关税", "加征", "反制", "301", "232", "USTR", "CBP", "FCC",
               "出口管制", "原产地", "熔炼地", "配额", "贸易救济", "清单",
               "申报", "披露", "包裹", "低值豁免", "降税", "休战", "贸易战",
               "对等", "反垄断审查", "制裁", "黑名单", "钢铁新规", "电动车",
               "多晶硅", "无人机", "港口费", "冻结", "延期", "磋商", "共识",
               "调查", "豁免", "征", "税", "合规", "报关", "进口"],
        "en": ["tariff", "duty", "antidumping", "countervailing", "section 301",
               "section 232", "ustr", "cbp", "fcc", "export control", "origin",
               "quota", "trade remedy", "customs", "declaration", "de minimis",
               "truce", "trade war", "sanction", "investigation", "compliance",
               "import rule"],
    },
    "demand": {
        "zh": ["需求", "销量", "吨量", "货量", "订单", "库存", "缺货", "旺季",
               "件量", "寄递量", "业务量", "销售额", "出货", "渗透率", "市占率",
               "在售", "消费", "在手订单", "增长", "连降", "价涨量跌", "量跌",
               "疲软", "兑现", "提前", "破", "累计开行", "货值"],
        "en": ["demand", "volume", "tonnage", "inventory", "stockout", "peak season",
               "orders", "sales", "shipment", "growth", "year on year", "yoy",
               "decline", "bookings", "throughput"],
    },
    "digital": {
        "zh": ["AI", "人工智能", "代理式", "智能体", "数字孪生", "自动化", "机器人",
               "算法", "模型", "平台", "软件", "系统", "渗透率", "数字化", "编排",
               "生成式", "大模型", "数据", "智能仓", "WMS", "物理 AI", "具身",
               "人机", "技术趋势", "魔力象限", "MCP", "无人化", "采用率",
               "规模化", "试点", "落地", "调查", "Gartner", "McKinsey", "MHI",
               "DHL", "报告", "指数", "追踪"],
        "en": ["ai", "agentic", "digital twin", "automation", "robot", "orchestration",
               "generative", "llm", "platform", "software", "adoption",
               "machine learning", "agent", "digital", "wms", "humanoid", "survey",
               "gartner", "mckinsey", "report"],
    },
}

CATS = {
    "#e05656": {"key": "key",   "zh": "重点新闻", "en": "Key News"},
    "#f0a13a": {"key": "hot",   "zh": "热门议题", "en": "Hot Topics"},
    "#5b8cff": {"key": "watch", "zh": "研究瞭望", "en": "Research Watch"},
    "#35c2b0": {"key": "apply", "zh": "应用风向", "en": "Application Trends"},
}
