# -*- coding: utf-8 -*-
"""
按 ee6be6d 标准生成本周供应链雷达（2026-09-05）。
标准：权威来源 · 交叉验证 · 来源可溯 · 中英双语
  - 四栏固定顺序：重点新闻 → 热门议题 → 研究瞭望 → 应用风向
  - verified: true 仅用于 >=2 家独立媒体佐证的条目；单源条目一律 false
  - 重点新闻英文锚点优先用原始出处（Al Jazeera / Drewry / CBP / 官方公告）
同步写入 docs/radar-data.json 与 docs/index.html 的 embeddedRadar 内嵌快照。
"""
import json, re, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
UPDATED = "2026-09-05T20:40:00+08:00"

def KN(title_zh, title_en, desc_zh, desc_en, sources, verified):
    return {"title": {"zh": title_zh, "en": title_en},
            "desc": {"zh": desc_zh, "en": desc_en},
            "sources": sources, "verified": verified}

def S(label, url):
    return {"label": label, "url": url}

# ── 1. 重点新闻 Key News ────────────────────────────────────────────────
key_news = [
    KN(
        "霍尔木兹「数据战」：美方称日均 40 艘，船舶追踪数据只有个位数",
        "Hormuz data war: US says 40 ships a day, ship-tracking data counts single digits",
        """
美伊对海峡控制权的说法持续打架。两名美国官员称，周二有 40 艘商船载着约 1800 万桶原油在美军护航下通过海峡，创战时新高；特朗普称美军每晚协助约 30 艘船通行，财长贝森特称日均至少 1000 万桶、周二达 1500 万—1700 万桶。但船舶追踪数据并不支持这一说法：Kpler 记录周一 5 艘、周二 11 艘、周三 6 艘，10 日均值 13 艘；劳氏日报情报（Lloyd's List Intelligence）8 月 26 日至 9 月 1 日均值约 12 艘，并提示因暗船识别滞后数据可能不完整；PortWatch 显示 8 月 30 日仅 6 艘通行，而战前日均约 85 艘，3 月以来总体均值降至 7 艘。联合海事信息中心（JMIC）9 月 1 日警报把海峡风险定级为严重，并称仍存在漂流或未标注水雷的风险。
""".strip(),
        """
Washington and Tehran keep issuing competing claims over who controls the strait. Two US officials said 40 commercial ships carrying some 18m barrels of oil transited under US escort on Tuesday, a wartime record; Trump said the Navy helps about 30 ships through every night, and Treasury Secretary Bessent put daily volumes at least 10m barrels, rising to 15m-17m on Tuesday. Ship-tracking data tells a different story: Kpler logged five vessels on Monday, 11 on Tuesday and six on Wednesday, a 10-day average of 13; Lloyd's List Intelligence recorded roughly 12 transits a day from Aug 26 to Sep 1 while cautioning that dark transits may be undercounted; PortWatch showed just six transits on Aug 30 against a pre-war baseline of about 85 a day, with the overall average down to seven since March. The Joint Maritime Information Center's Sep 1 advisory rated Hormuz risk as severe and warned of continued risk from drifting or uncharted mines.
""".strip(),
        [
            S("Al Jazeera（Kpler / Lloyd's List / PortWatch）↗",
              "https://www.aljazeera.com/news/2026/9/3/how-much-oil-is-going-through-hormuz-how-data-doesnt-match-us-claims"),
            S("Maritime News（JMIC 警报 / 通行量）↗",
              "https://www.maritimenews.com/strait-hormuz/hormuz-transits-slump-war-risk-costs"),
        ], True),

    KN(
        "伊朗扩大「违规船只」黑名单至 57 艘，两艘油轮被指触雷起火",
        "Iran widens vessel blacklist to 57 as two tankers reportedly hit mines",
        """
9 月 2 日，伊朗波斯湾海峡管理局更新违规船只名单，新增 11 艘油轮与散货船，总数增至 57 艘；上榜船舶若未经德黑兰批准通行，可能面临罚款、扣押或货物没收，与其进行船对船转运的船舶也可能被列入名单。同日，伊朗伊斯兰革命卫队（IRGC）称两艘油轮在美军怂恿下撤离船员、将船只交由美方人员控制以通过非法航线，驶入雷区后触雷爆炸并燃烧；IRGC 表示已就布雷航道发出警告，并将对不按其合法航线航行的航运公司实施额外惩罚。美国中央司令部则公开否认有船只在海峡触雷。双方说法互相矛盾，事件仍有争议。
""".strip(),
        """
On Sep 2 Iran's Persian Gulf Strait Authority updated its list of non-compliant vessels, adding 11 tankers and commodity carriers for a total of 57; listed ships face fines, confiscation or detention if they attempt the strait without Tehran's approval, as may vessels conducting ship-to-ship transfers with them. The same day the IRGC said two oil tankers, at US instigation, had disembarked their crews and handed the ships to US personnel to use an illegal route, striking mines and catching fire; it said it had warned about mined channels and would impose extra penalties on operators ignoring its designated lanes. US CENTCOM publicly denied that any vessel had struck a mine. The two accounts conflict and the incident remains disputed.
""".strip(),
        [
            S("中国经济网（新华社 / 伊朗革命卫队声明）↗",
              "http://m.ce.cn/yidong/202609/t20260903_3191188.shtml"),
            S("新华社 / 环球时报 ↗",
              "https://www.toutiao.com/article/7680888413033071130/"),
            S("Al Jazeera（双方说法对照）↗",
              "https://www.aljazeera.com/news/2026/9/3/how-much-oil-is-going-through-hormuz-how-data-doesnt-match-us-claims"),
        ], True),

    KN(
        "SCFI 创 25 个月新高、美东首破万美元，全球滞港运力超疫情峰值",
        "SCFI hits 25-month high, US East Coast tops $10k as stranded capacity beats COVID peak",
        """
上海出口集装箱运价指数（SCFI）最新报 3509.53 点，周涨 2.9%，连续第五周上行，创近 25 个月新高，较伊朗冲突爆发以来累计上涨 156%。美东运价突破 1 万美元/FEU（约 10046 美元），为 2022 年以来首次，周涨 3.6%；美西约 6940 美元/FEU，周涨 2.6%。德鲁里（Drewry）世界集装箱指数小幅回落 1% 至 4473 美元/FEU，其中上海—纽约 9333 美元、上海—洛杉矶 6818 美元。供应端同步收紧：Linerlytica 数据显示全球逾 430 万 TEU 船舶滞留待泊，已超过 2022 年疫情时期 400 万 TEU 的峰值，占全球船队 12.6%。欧线则因部分船公司恢复苏伊士运河通行、运力投放增加而下挫，上海—欧洲跌 4.4% 至 2716 美元/TEU，地中海跌 5.6% 至 3557 美元/TEU；波斯湾航线受地缘局势推动上涨 7.1%，南美以 11% 涨幅领跑。
""".strip(),
        """
The Shanghai Containerized Freight Index closed at 3,509.53 points, up 2.9% on the week — a fifth straight gain and a 25-month high, some 156% above where it stood when the Iran war began. US East Coast rates broke through $10,000/FEU (about $10,046) for the first time since 2022, up 3.6% weekly, with the West Coast around $6,940/FEU, up 2.6%. Drewry's World Container Index eased 1% to $4,473/FEU, with Shanghai-New York at $9,333 and Shanghai-Los Angeles at $6,818. Supply is tightening at the same time: Linerlytica counted more than 4.3m TEU waiting to berth globally, above the 4.0m TEU peak recorded during the 2022 pandemic and equal to 12.6% of the fleet. Europe went the other way as carriers resumed Suez routings and added capacity — Shanghai-Europe fell 4.4% to $2,716/TEU and the Mediterranean 5.6% to $3,557/TEU — while the Persian Gulf lane rose 7.1% on geopolitics and South America led gains with +11%.
""".strip(),
        [
            S("Drewry / Shipping Gazette（WCI 各航线）↗",
              "https://shippingazette.com/news/9260900000048"),
            S("Linerlytica（Hellenic Shipping News）↗",
              "https://www.hellenicshippingnews.com/asia-us-container-rates-edge-higher-remain-elevated-on-congestion-at-east-asian-ports"),
            S("大数跨境（SCFI 3509.53 点）↗",
              "https://www.10100.com/article/150012729"),
        ], True),

    KN(
        "加拿大对美反制关税 9 月 8 日生效，覆盖 276 亿美元商品",
        "Canada's retaliatory tariffs take effect Sept 8, covering $27.6bn of US goods",
        """
加拿大宣布自 9 月 8 日零时 1 分起，对约 276 亿美元美国原产商品加征 15%、25%、50% 三档附加税，覆盖钢铝、乳制品及原料、家电、农机、纸浆纸品、塑料、电子与消费品等，以等额等率回应美国 8 月 22 日依 338 条款对同额加拿大商品加征的最高 50% 关税。普华永道提示三个要点：一是即使商品符合 CUSMA 优惠待遇仍需缴纳附加税，CUSMA 身份不构成豁免；二是已在途货物可豁免，但在途的认定口径、所需证据与会计处理尚未明确，进口商应留存装运与离港的同期记录；三是附加税由加拿大进口记录方缴纳，并可能推高进口环节 GST。加拿大同步推出 75 亿加元的新增及扩容支持计划。
""".strip(),
        """
Effective 12:01 a.m. on Sept 8, Canada will impose surtaxes of 15%, 25% and 50% on roughly $27.6bn of US-origin goods — steel and aluminium, dairy products and ingredients, appliances, agricultural equipment, pulp and paper, plastics, electronics and consumer goods — a dollar-for-dollar, rate-for-rate response to US Section 338 tariffs of up to 50% on an equal value of Canadian goods imposed on Aug 22. PwC flags three points: CUSMA preferential treatment does not exempt a product from the surtax; in-transit goods are carved out, but the meaning of in transit, the evidence required and the accounting process are still unconfirmed, so importers should keep contemporaneous shipment and departure records; and the surtax is payable by the Canadian importer of record and may increase GST at importation. Ottawa paired the move with C$7.5bn of new and enhanced support.
""".strip(),
        [
            S("PwC Canada（税则与合规要点）↗",
              "https://www.pwc.com/ca/en/services/tax/publications/tax-insights/canada-imposes-surtaxes-us-imports-sep-2026.html"),
            S("加拿大财政部 / Expeditors 贸易行动时间线 ↗",
              "https://info.expeditors.com/global-trade-actions-timeline"),
            S("PMMI 跨境贸易更新（谈判进展）↗",
              "https://www.pmmi.org/blog/cross-border-trade-updates-79"),
        ], True),
]

# ── 2. 热门议题 Hot Topics ──────────────────────────────────────────────
hot_topics = [
    KN(
        "巴拿马运河再砍配额叠加亚洲港口拥堵，运力被两头挤压",
        "Panama Canal slot cuts plus Asian port congestion squeeze capacity from both ends",
        """
巴拿马运河因水位持续偏低进一步收紧通行：每日过境配额由 36 艘降至 34 艘（9 月 3 日生效），并将于 9 月 15 日进一步降至 32 艘；新巴拿马型船闸吃水限制收紧至 48 英尺，10 月 1 日起再降至 47.5 英尺，通行效率下降、等候时间与过境成本上升，成为美东运价高位运行的重要支撑。与此同时，台风扰动导致东亚主要枢纽港压港加剧，莱茵河低水位持续干扰内陆疏运，可用船舶持续紧缺。德鲁里数据显示下周计划空班航次由本周 7 班降至 4 班，运力供给小幅回升，机构预判后续运价波动或有所收窄，但结构性紧张短期难解。
""".strip(),
        """
Low water is forcing fresh Panama Canal restrictions: daily transit slots fell from 36 to 34 on Sept 3 and will drop to 32 on Sept 15, while Neopanamax draft limits tightened to 48 feet and fall to 47.5 feet on Oct 1 — lower throughput, longer waits and higher transit costs, a key prop under elevated US East Coast rates. At the same time, typhoon-driven berth delays at major East Asian hubs and persistently low Rhine water levels are disrupting inland feeders, keeping available tonnage scarce. Drewry counts four blank sailings planned for next week, down from seven this week, a modest capacity increase that leads it to expect less volatile rates — though the structural tightness will not clear quickly.
""".strip(),
        [
            S("Drewry / Shipping Gazette（运河配额与吃水）↗",
              "https://shippingazette.com/news/9260900000048"),
            S("Linerlytica（Hellenic Shipping News，430 万 TEU 滞港）↗",
              "https://www.hellenicshippingnews.com/asia-us-container-rates-edge-higher-remain-elevated-on-congestion-at-east-asian-ports"),
            S("维运网 / 同花顺（集运周报）↗",
              "https://m.10jqka.com.cn/20260901/c679488162.shtml"),
        ], True),

    KN(
        "美国 232 条款无人机关税 9 月 3 日生效，最高税率达 100%",
        "US Section 232 drone tariffs take effect Sept 3 at rates up to 100%",
        """
根据 8 月 13 日总统公告，美国自 9 月 3 日起对进口无人机系统（UAS）及零部件加征 232 条款关税：特定无人机、自动停靠站与关键零部件税率最高 100%，其他覆盖机型 25%；更多 UAS 零部件将于 2027 年 2 月起纳入 25% 税率，商务部可随市场情况扩大范围。9 月 2 日，美国海关与边境保护局（CBP）通过货物系统信息服务（CSMS）发布实施指引。官方表述的立法意图是强化本土制造能力、降低对外供应链依赖。同期在途的还有 8 月 6 日公告的多晶硅最低进口价格（MIP）机制与 15% 从价税（12 月 4 日起适用），显示 232 条款正从钢铝等传统品类向无人机、光伏材料等新兴制造领域扩散 —— 对相关行业的 BOM 成本与产地布局构成实质影响。
""".strip(),
        """
Under an Aug 13 presidential proclamation, the US began imposing Section 232 duties on imported unmanned aircraft systems and components from Sept 3: up to 100% on specified drones, docking stations and critical components, and 25% on other covered drones, with further UAS components added at 25% from February 2027 and scope expandable by the Commerce Department. CBP issued implementation guidance through its Cargo Systems Messaging Service on Sept 2. The stated intent is to strengthen US manufacturing and reduce reliance on foreign supply chains. It follows the Aug 6 Section 232 measures establishing minimum import prices for polysilicon plus a 15% ad valorem duty from Dec 4 — evidence that Section 232 is spreading from steel and aluminium into newer manufacturing such as drones and solar materials, with real consequences for bill-of-materials costs and footprint decisions.
""".strip(),
        [
            S("Expeditors 全球贸易行动时间线（汇编 CBP CSMS 与总统公告）↗",
              "https://info.expeditors.com/global-trade-actions-timeline"),
        ], False),

    KN(
        "CBP 拟大幅提高进口披露要求，合规重心从一批货转向整条链",
        "CBP floats sweeping import disclosures, shifting compliance from shipment to whole chain",
        """
9 月 2 日，美国海关与边境保护局（CBP）发布《提升进口披露以加强供应链可视性》预立法公告（ANPRM，91 FR 56408，案卷号 USCBP-2026-1058），就 64 项问题征求意见，截止 12 月 1 日，涉及 19 CFR 第 141、142、143、163 部分。拟议方向包括：要求进口商取得、留存或提交出口商向外国海关申报的单证（出口报关单、商业发票、装箱单、原产地证、出口许可与运输单据）；扩大披露制造商、生产商、卖方、出口商、承运人、电商平台与最终收货人，并以境外税务识别号或全球商业标识（如 DUNS、GLN、LEI）取代沿用已久的制造商识别码（MID）；运用 AI 与溯源技术识别非法转运、虚假原产地，并对账境外出口记录与美国申报数据；将 CTPAT 要求扩展至溯源技术、网络安全与数据完整性。该公告不即刻设定义务，但意味着合规模式可能从申报一批货转向验证货物背后的参与方、单证与生产历史，采购、寻源、IT 与供应商管理职能都将被卷入。
""".strip(),
        """
On Sept 2 CBP published an Advance Notice of Proposed Rulemaking titled Heightened Import Disclosures for Supply Chain Visibility (91 FR 56408, docket USCBP-2026-1058), posing 64 questions with comments due Dec 1 and touching 19 CFR Parts 141, 142, 143 and 163. Ideas under review include requiring importers to obtain, retain or submit documents filed with foreign customs authorities — export declarations, commercial invoices, packing lists, certificates of origin, export licences and transport records; broadening disclosure of manufacturers, producers, sellers, exporters, shippers, online marketplaces and ultimate delivery recipients, with foreign tax identifiers or Global Business Identifiers such as DUNS, GLN and LEI replacing the long-standing Manufacturer Identification Code; using AI and tracing technology to catch illegal transshipment and false origin claims and to reconcile foreign export records against US entry data; and extending CTPAT to tracing technology, cybersecurity and data integrity. The ANPRM imposes no immediate obligations, but signals a shift from reporting a shipment to verifying the parties, records and production history behind it — pulling procurement, sourcing, IT and supplier management into customs compliance.
""".strip(),
        [
            S("CBP 官方公告 ↗",
              "https://cbp.gov/newsroom/national-media-release/cbp-announces-advance-notice-proposed-rulemaking-enhance-supply"),
            S("Federal Register（91 FR 56408）↗",
              "https://thefederalregister.org/documents/2026-17926/heightened-import-disclosures-for-supply-chain-visibility"),
            S("Kelley Drye 客户通告（64 项问题拆解）↗",
              "https://www.kelleydrye.com/viewpoints/client-advisories/cbp-explores-sweeping-new-disclosure-requirements-importers-may-face-expanded-reporting-traceability-and-foreign-export-documentation-obligations"),
        ], True),
]

# ── 3. 研究瞭望 Research ────────────────────────────────────────────────
research = [
    KN(
        "生成式 AI 已进七成供应链组织，但仅 23% 有正式 AI 战略",
        "Generative AI is in 72% of supply chain organisations — but only 23% have a formal AI strategy",
        """
Vserve《2026 年供应链 AI 现状报告》援引 Gartner 数据：72% 的供应链组织已在部署生成式 AI，但同时仅有 23% 制定了正式的 AI 战略。德勤研究亦显示，85% 的企业在过去 12 个月增加了 AI 投入、91% 计划继续加码，而企业通常需要 2—4 年才能从 AI 实施中获得可观回报。报告据此提出四项规模化前提：提升数据质量、明确业务用例、打通系统与流程、建立结果度量，并指出按项目零散推进 AI 存在明显风险。其核心结论是：采纳速度本身不创造价值，价值产生于 AI 与每天发生决策的运营流程之间的连接，以及从一条 AI 建议走到一个实际运营动作的能力。
""".strip(),
        """
Vserve's State of AI in Supply Chain Report 2026 cites Gartner finding that 72% of supply chain organisations have deployed generative AI, yet only 23% have a formal AI strategy. Deloitte research similarly found 85% of firms increased AI investment over the past 12 months and 91% plan to increase it further, while meaningful ROI typically takes two to four years. The report sets out four prerequisites for scaling: better data quality, clearly defined business cases, connected systems and processes, and outcome measurement — warning of the risk in pursuing AI project by project. Its core conclusion is that adoption alone creates no business value; value appears where AI is connected to the operational processes where decisions are made every day, and where an organisation can move from an AI recommendation to an actual operational action.
""".strip(),
        [
            S("Vserve《2026 供应链 AI 现状报告》（CXOToday）↗",
              "https://cxotoday.com/ai/vserve-report-ai-drives-supply-chain-growth-as-91-plan-investment-hikes"),
        ], False),

    KN(
        "AI 的回报集中在可量化环节：库存降 20—30%，判断型任务仍难替代",
        "AI pays off where work is measurable: inventory down 20-30%, judgement tasks still resist",
        """
麦肯锡关于分销运营的研究显示，AI 的收益集中在规则明确、结果可量化的流程：库存降低 20—30%、物流成本降低 5—20%、采购支出降低 5—15%。一个典型案例是某家拥有逾 1 万辆车的末端运营商，以约 200 万美元投入部署 AI 虚拟调度员，实现年节省 3000 万—3500 万美元，约 15 倍回报。但同一研究指出，AI 在异常处理、报关等依赖判断与模糊情境的环节仍明显力有不逮。Bain 旗下 Proxima 对美国、英国、澳大利亚、新加坡、德国 500 余名营收超 5 亿美元企业 CEO 的调查给出了互补视角：51% 的 CEO 认为 AI 已在供应商风险监控上产生可衡量价值，而主要障碍依次是数据质量（38%）、技能缺口（30%）与 ROI 不清（29%）。
""".strip(),
        """
McKinsey's research on AI in distribution operations finds the gains concentrate in repeatable, rules-based workflows where outcomes are quantifiable: inventory down 20-30%, logistics costs down 5-20%, procurement spend down 5-15%. One cited case is a last-mile operator with more than 10,000 vehicles that invested about $2m in AI-powered virtual dispatcher agents and now saves $30m-$35m a year, roughly 15 times the outlay. The same analysis notes AI still falls short in judgement-intensive work such as exception handling and customs brokerage. A complementary view comes from Proxima, part of Bain, which surveyed more than 500 CEOs at companies with over $500m in revenue across the US, UK, Australia, Singapore and Germany: 51% said AI is delivering measurable value in supplier risk monitoring, with the main barriers being data quality (38%), lack of skills (30%) and unclear ROI (29%).
""".strip(),
        [
            S("Inbound Logistics（麦肯锡 / Proxima 数据）↗",
              "https://news.yrules.com/en/archives/29455"),
        ], False),

    KN(
        "代理式 AI 进入供应链：29% 制造商已部署或试点，六类代理分层落地",
        "Agentic AI enters the supply chain: 29% of manufacturers deploying, six agent types mapped",
        """
一份代理式 AI 与 API 管理报告显示，29% 的制造商已部署或正在试点代理式 AI，27% 处于概念验证阶段，另有 42% 正在评估或计划部署 —— 超过一半已进入实质性探索阶段，采用正从探索走向执行。报告将供应链场景中的代理式 AI 归为六类，形成从执行到协调的分层架构：任务代理（采购单变更、审批加速、收货处理）、商业代理（合同审查、风险评估、价值分析）、供应代理（采购服务台、供应商风险评估、商品咨询）、编排代理（库存咨询、采购单工作流、场景与网络规划）、交付代理（装载优化、货运管理、退货协调）、规划代理（需求与供应规划、订单优先级、延期订单管理）。报告指出其价值集中在四个方向：企业知识管理、供应链风险与工作流实时响应、端到端流程自动化、供应商与合作伙伴协同。
""".strip(),
        """
A report on agentic AI and API management finds 29% of manufacturers have deployed or are piloting agentic AI, 27% are at proof of concept and a further 42% are evaluating or planning deployment — more than half now past the exploration stage, with adoption moving from exploration into execution. It groups supply chain agentic AI into six types forming a layered architecture: task agents (purchase order changes, approval acceleration, goods receipt), commercial agents (contract review, risk assessment, value analysis), supply agents (procurement helpdesk, supplier risk assessment, commodity advisory), orchestration agents (inventory advisory, PO workflows, scenario and network planning), delivery agents (load optimisation, freight management, returns coordination) and planning agents (demand and supply planning, order prioritisation, backorder management). Value clusters in four directions: enterprise knowledge management, real-time supply chain risk and workflow response, end-to-end process automation, and supplier and partner collaboration.
""".strip(),
        [
            S("代理式 AI 与 API 管理报告（三个皮匠）↗",
              "https://www.sgpjbg.com/info/b79f297b6ac6ed47bf4c43cbe6475c38.html"),
        ], False),
]

# ── 4. 应用风向 Apps & Adoption ─────────────────────────────────────────
apps = [
    KN(
        "CJ 物流在韩国首次将人形机器人投入实际运营，从演示走向产线",
        "CJ Logistics puts humanoid robots into live operations, a first in South Korea",
        """
9 月 3 日，CJ 物流宣布在京畿道龙仁市阳智的 Olive Young 物流中心部署两台双臂人形机器人，在真实订单的包装线上向纸箱内放入缓冲材料，随后由员工放入商品并发运 —— 这是韩国首例人形机器人进入实际物流运营。相比 2025 年下半年在军浦履约中心的可行性验证（当时由人远程操作并记录视频供机器人反复学习），此次直接进入处理客户订单的作业流程。机器人采用 ROBOTIS 的半人形平台 AI Worker（7 自由度双臂、灵巧手 16—20 自由度、轮式全向底盘），现场作业数据将持续回流训练 CJ 自研的机器人基础模型（RFM）；合作方包括 ROBOTIS（硬件）、Aidin Robotics（机器人手）与 RLWRLD/RealWorld AI（基础模型）。CJ 计划逐步将应用从放置缓冲材料扩展至拣选、分拣、检验与包装，长期目标是单台机器人可连续执行多个物流环节的通用型物流人形机器人。
""".strip(),
        """
On Sept 3 CJ Logistics said it had deployed two dual-arm humanoid robots at the Olive Young distribution centre in Yangji, Yongin, inserting cushioning material into cartons on a live packaging line before staff place the ordered products and ship them — the first case of humanoid robots working in a live logistics operation in South Korea. Unlike the feasibility test at its Gunpo fulfilment centre in late 2025, where a human teleoperated the robots and the recorded footage was used for learning, the robots now sit inside a workflow handling real customer orders. They run ROBOTIS' AI Worker semi-humanoid platform — 7-DOF dual arms, 16-20 DoF dexterous hands and a swerve-drive mobile base — with operational data fed back to train CJ's in-house Robot Foundation Model. Partners include ROBOTIS on hardware, Aidin Robotics on robotic hands and RLWRLD (RealWorld AI) on the RFM. CJ plans to extend the robots from cushioning to picking, sorting, inspection and packing, with a long-term goal of a general-purpose logistics humanoid handling several processes in sequence.
""".strip(),
        [
            S("Seoul Economic Daily ↗",
              "https://en.sedaily.com/finance/2026/09/03/cj-logistics-deploys-humanoid-robots-at-warehouse-in-korean"),
            S("Herald Business ↗",
              "https://biz.heraldcorp.com/article/10861045"),
            S("Maeil Business（Pulse）↗",
              "https://pulse.mk.co.kr/news/english/12144528"),
            S("Humanoids Daily（ROBOTIS AI Worker 规格）↗",
              "https://www.humanoidsdaily.com/news/cj-logistics-puts-robotis-dual-arm-ai-worker-on-live-olive-young-fulfillment-lines"),
        ], True),

    KN(
        "香港首个攀爬机器人仓投用：利用率提升 1.5 倍，人工效率提升 50%",
        "Hong Kong's first climbing-robot warehouse lifts utilisation 1.5x and labour efficiency 50%",
        """
9 月 4 日，阿里巴巴旗下菜鸟位于香港 eHub（数字物流中枢）的攀爬机器人仓库投入使用。新库区用于小件零售商品的存储与拣选，由四向穿梭机器人立体存储库与攀爬机器人拣选库组成；因仓内无需预留人工与叉车通道，实现高密度存储，仓库整体利用率提升 1.5 倍，人工工作效率提升 50% —— 在香港高企的仓租环境下相当于直接压低单位仓租成本。库内 56 台攀爬机器人地面运行速度达每秒 4 米，10 秒可爬升至 5 层楼高的货架，由 AI 负责任务规划与机器人调度执行，菜鸟称已具备同时调度上千台机器人的能力。荷兰、西班牙与广东东莞的攀爬机器人仓也在陆续交付，该产品已在电子、服饰、电商零售行业落地；菜鸟海外供应链网络覆盖 18 个国家和地区的 70 多个海外仓。
""".strip(),
        """
On Sept 4 Cainiao, the logistics arm of Alibaba, brought its first climbing-robot warehouse in Hong Kong into service at its eHub digital logistics hub. The new zone handles storage and picking of small retail items, combining a four-way shuttle high-bay store with a climbing-robot picking area. Because no aisles are reserved for people or forklifts, storage density rises sharply: overall warehouse utilisation is up 1.5 times and labour efficiency by 50% — in effect a direct cut to Hong Kong's steep unit rental cost. The 56 climbing robots run at 4 metres per second on the floor and can climb a five-storey rack in 10 seconds, with AI handling overall task planning and robot dispatch; Cainiao says it can orchestrate more than a thousand robots simultaneously. Climbing-robot warehouses in the Netherlands, Spain and Dongguan are being delivered in sequence, and the product has landed in electronics, apparel and e-commerce retail. Cainiao's overseas supply chain network covers more than 70 warehouses across 18 countries and regions.
""".strip(),
        [
            S("新京报贝壳财经 ↗",
              "https://www.toutiao.com/article/7681573223648985663/"),
            S("证券时报（行业半年报数据）↗",
              "https://www.toutiao.com/article/7681967301234639400/"),
            S("中国邮政快递报（新浪财经）↗",
              "https://finance.sina.cn/2026-09-04/detail-iniqsenu1257421.d.html"),
            S("观点网 ↗",
              "https://news.qq.com/rain/a/20260904A0AW0E00"),
        ], True),

    KN(
        "中国物流 AI 跨过演示期：无人车规模化运营，智能仓进入标准化阶段",
        "China's logistics AI moves past the demo stage: delivery robots at scale, smart warehouses standardised",
        """
行业观察显示，2026 年物流 AI 已告别通用大模型通吃全场景的思路，转向场景专属、设备定制与精准赋能。末端配送方面，顺丰在全国 150 余城投放 3200 余台无人配送车，依托全域 AI 调度系统接入城市实时交通数据，可动态规划路线、自主避让人车，车辆故障停运率下降 40%，年节省数亿元运维与运力损耗成本；分拣环节，圆通全网分拣中心搭载 AI 视觉后，仅需三分之一人力即可完成百万级日单量；仓储环节，接入 AI 智能体后 AGV、机械臂与分拣设备可自主分析订单数据，动态调整高周转商品库位与拣选路径，并依据 72 小时订单预测提前排布作业计划。伴随国家发展和改革委员会公布的《无人仓通用技术要求》等 14 项行业新标准落地，智能仓储正式进入标准化 AI 赋能阶段。
""".strip(),
        """
Industry observers note that logistics AI in 2026 has moved away from the idea that one general-purpose model can serve every scenario, towards scenario-specific and device-level deployment. On last-mile delivery, SF Express has put more than 3,200 autonomous delivery vehicles into 150-plus cities, with a city-wide AI dispatch system ingesting live traffic data to plan routes dynamically and yield to people and vehicles; vehicle downtime from faults has fallen 40%, saving hundreds of millions of yuan a year in maintenance and capacity loss. In sorting, AI vision lets YTO's network of sorting centres handle million-parcel daily volumes with only a third of the previous headcount. In warehousing, AI agents let AGVs, robotic arms and sorters analyse order data autonomously, adjust slotting for fast-moving SKUs and pick paths, and pre-plan work against 72-hour order forecasts. With 14 new industry standards taking effect, including the NDRC's General Technical Requirements for Unmanned Warehouses, smart warehousing has entered a standardised phase of AI enablement.
""".strip(),
        [
            S("新浪看点（物流 AI 综述）↗",
              "https://k.sina.cn/article_5952915720_162d2490806704s3fa.html"),
        ], False),
]

data = {
    "updatedAt": UPDATED,
    "columns": [
        {"cat": {"zh": "重点新闻", "en": "Key News"}, "color": "#e05656", "items": key_news},
        {"cat": {"zh": "热门议题", "en": "Hot Topics"}, "color": "#f0a13a", "items": hot_topics},
        {"cat": {"zh": "研究瞭望", "en": "Research"}, "color": "#5b8cff", "items": research},
        {"cat": {"zh": "应用风向", "en": "Apps & Adoption"}, "color": "#35c2b0", "items": apps},
    ],
}

# ── 写出 radar-data.json ────────────────────────────────────────────────
out = ROOT / "docs" / "radar-data.json"
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ── 同步 index.html 内嵌快照 ────────────────────────────────────────────
html_path = ROOT / "docs" / "index.html"
html = html_path.read_text(encoding="utf-8")
block = json.dumps(data, ensure_ascii=False, indent=2)
pattern = re.compile(
    r'(<script id="embeddedRadar" type="application/json">)(.*?)(</script>)', re.S)
if not pattern.search(html):
    sys.exit("ERROR: embeddedRadar 块未找到，未做替换")
html2 = pattern.sub(lambda m: m.group(1) + "\n" + block + "\n" + m.group(3), html, count=1)
html_path.write_text(html2, encoding="utf-8")

total = sum(len(c["items"]) for c in data["columns"])
ver = sum(1 for c in data["columns"] for i in c["items"] if i["verified"])
srcs = {s["label"] for c in data["columns"] for i in c["items"] for s in i["sources"]}
print(f"OK  updatedAt={UPDATED}")
print(f"    条目 {total} 条 / verified {ver} 条 / 来源标签 {len(srcs)} 个")
for c in data["columns"]:
    print(f"    - {c['cat']['en']:<18} {len(c['items'])} 条")
print(f"    已写入 {out} 并同步 {html_path}")
