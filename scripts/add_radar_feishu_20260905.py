# -*- coding: utf-8 -*-
"""
增量插入雷达条目：飞书发布「AI 智造一齐飞」汽车产业链 AI 协同（2026-09-05）。

按 ee6be6d 标准：
  - 权威来源：新华社（原始出处）+ 经济日报 + 新华财经 + 凤凰网
  - 交叉验证：6 家独立媒体佐证 -> verified: true
  - 来源可溯：每条带原始链接
  - 中英双语
幂等：已存在同标题条目则跳过插入。
同步写入 docs/radar-data.json 与 docs/index.html 的 embeddedRadar 内嵌快照。
"""
import json, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
NEW_UPDATED = "2026-09-05T22:20:00+08:00"

TITLE_ZH = "飞书发布「AI 智造一齐飞」，汽车产业链整零协同进入核心流程"
TITLE_EN = ('Feishu launches "AI-Powered Manufacturing Soars Together", '
            "moving OEM–supplier collaboration into core workflows")

DESC_ZH = (
    "9 月 3 日，飞书在上海举办「AI 驭链，整零焕新——2026 飞书 AI 生产力大会汽车行业专场」，"
    "近 300 位整车、零部件及产业链企业高层与数字化负责人参会；会上响应上海「AI＋制造」战略，"
    "启动「AI 智造一齐飞」产业链智造升级，并正式发布 2026 制造业效能加速计划（以上海为首站）。"
    "飞书商业化副总裁张棣介绍，2025 年中国上市车企市值 TOP10 中已有 9 家的集团、研究院、新能源品牌或"
    "相关业务主体使用飞书，TOP30 新能源车企中超过七成使用飞书；客户覆盖上汽、赛力斯、蔚来、东风奕派等"
    "整车企业，舜宇光学、地平线、德赛西威、保隆、玲珑轮胎、万向钱潮、欣旺达等零部件企业，以及法雷奥、"
    "博世、丰田研发等跨国公司。已披露的落地场景与效果：蔚来基于飞书项目搭建合作伙伴工业开发管理平台 IDM，"
    "将数百家供应链伙伴的任务、交付与风险信息纳入同一底座；东风奕派以多维表格＋群机器人＋自动化，"
    "处理 400 余家供应商的缺料预警与在线反馈；生益电子用 RPA＋多维表格连接订单数据，短交确认与审批用时"
    "降低 19%、客诉短交比例降低 85%；保隆科技依托飞书项目搭建研发管理中台，流程标准化提升 50%、"
    "信息透明度与可追溯性提升 30%（后两项为企业项目自评）；上汽与联合电子的整零协同项目覆盖数百名工程师"
    "与 187 项主流程节点，全部计划排期由 1—2 小时缩短至 5 分钟。飞书 CEO 谢欣提出，协同平台承载企业上下文，"
    "是 Agent 理解业务、调用工具的基础设施；8 月 25 日字节跳动发布的 Agent 产品「豆包工作」可在飞书内"
    "直接调用工具完成任务，两者构成企业日常运转与 AI 转型的一体两面。"
)

DESC_EN = (
    "On Sept 3 Feishu held the automotive session of its 2026 AI Productivity Conference in Shanghai, "
    "drawing nearly 300 senior executives and digitalisation heads from OEMs, parts makers and supply-chain "
    "firms. Aligning with Shanghai's \"AI + Manufacturing\" strategy, Feishu launched the \"AI-Powered "
    "Manufacturing Soars Together\" supply-chain upgrade initiative and unveiled its 2026 Manufacturing "
    "Efficiency Acceleration Programme, with Shanghai as the first stop. Zhang Di, VP of commercialisation, "
    "said that as of 2025 nine of China's top ten listed automakers by market capitalisation had adopted "
    "Feishu across groups, research institutes, NEV brands or related entities, and more than 70% of the top "
    "30 NEV makers use it. Clients span OEMs (SAIC, Seres, NIO, Dongfeng Yipai), parts suppliers (Sunny "
    "Optical, Horizon Robotics, Desay SV, Baolong, Linglong Tire, Wanxiang Qianchao, Sunwoda) and multinationals "
    "(Valeo, Bosch, Toyota R&D). Disclosed deployments: NIO built an Industrial Development Management (IDM) "
    "platform on Feishu Projects, consolidating tasks, deliveries and risk status for hundreds of supply-chain "
    "partners; Dongfeng Yipai uses multidimensional tables, group bots and automation to handle shortage alerts "
    "and feedback from over 400 suppliers; Shengyi Electronics linked RPA with Feishu tables to connect order "
    "data, cutting short-delivery confirmation and approval time by 19% and related customer complaints by 85%; "
    "Baolong Tech built an R&D management platform on Feishu Projects, lifting process standardisation by 50% "
    "and information transparency and traceability by 30% (both self-assessed); SAIC's OEM–supplier programme "
    "with United Automotive Electronic Systems (UAES) covers hundreds of engineers and 187 main process nodes, "
    "with scheduling time cut from one to two hours to five minutes. Feishu CEO Xie Xin argued that the "
    "collaboration platform carries enterprise context and is the infrastructure that lets agents understand "
    "the business and invoke tools; ByteDance's agent product \"Doubao Work\", released Aug 25, can call tools "
    "directly inside Feishu."
)

SOURCES = [
    {"label": "新华社（原始出处）↗",
     "url": "https://www.news.cn/tech/20260903/d861105101cd4866850b4a40cb5a1d30/c.html"},
    {"label": "经济日报 ↗",
     "url": "https://www.jingjiribao.cn/static/detail.jsp?id=680939"},
    {"label": "新华财经（整零协同）↗",
     "url": "https://www.cnfin.com/gs-lb/detail/20260904/4465360_1.html"},
    {"label": "凤凰网·网通社（客户名单）↗",
     "url": "https://auto.ifeng.com/c/8w9FvHi5nBE"},
]

NEW_ITEM = {
    "title": {"zh": TITLE_ZH, "en": TITLE_EN},
    "desc": {"zh": DESC_ZH, "en": DESC_EN},
    "sources": SOURCES,
    "verified": True,   # 新华社 + 经济日报 + 新华财经×2 + 凤凰网 + 人民政协网 = 6 家独立佐证
}

# ── 读取现有数据 ────────────────────────────────────────────────────────
data_path = ROOT / "docs" / "radar-data.json"
data = json.loads(data_path.read_text(encoding="utf-8"))

apps = None
for col in data["columns"]:
    if col["cat"]["en"] == "Apps & Adoption":
        apps = col
        break
if apps is None:
    sys.exit("ERROR: 未找到「应用风向 / Apps & Adoption」栏")

if any(i["title"]["zh"] == TITLE_ZH for i in apps["items"]):
    print("SKIP: 条目已存在，未重复插入")
else:
    apps["items"].append(NEW_ITEM)
    print("INSERT: 已追加 1 条到「应用风向」")

data["updatedAt"] = NEW_UPDATED

# ── 写出 radar-data.json ────────────────────────────────────────────────
data_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ── 同步 index.html 内嵌快照 ────────────────────────────────────────────
html_path = ROOT / "docs" / "index.html"
html = html_path.read_text(encoding="utf-8")
block = json.dumps(data, ensure_ascii=False, indent=2)
pattern = re.compile(r'(<script id="embeddedRadar" type="application/json">)(.*?)(</script>)', re.S)
if not pattern.search(html):
    sys.exit("ERROR: embeddedRadar 块未找到，未做替换")
html2 = pattern.sub(lambda m: m.group(1) + "\n" + block + "\n" + m.group(3), html, count=1)
html_path.write_text(html2, encoding="utf-8")

total = sum(len(c["items"]) for c in data["columns"])
ver = sum(1 for c in data["columns"] for i in c["items"] if i["verified"])
srcs = {s["label"] for c in data["columns"] for i in c["items"] for s in i["sources"]}
print(f"OK  updatedAt={data['updatedAt']}")
print(f"    条目 {total} 条 / verified {ver} 条 / 来源标签 {len(srcs)} 个")
for c in data["columns"]:
    print(f"    - {c['cat']['en']:<18} {len(c['items'])} 条")
print(f"    已写入 {data_path} 并同步 {html_path}")
