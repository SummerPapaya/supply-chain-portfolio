# -*- coding: utf-8 -*-
"""供应链雷达周更脚本（2026-09-15）

标准：ee6be6d —— 权威来源 / 交叉验证 / 来源可溯 / 中英双语
- 四栏固定顺序：重点新闻 → 热门议题 → 研究瞭望 → 应用风向
- verified=True 仅用于 ≥2 家独立媒体佐证的条目
- 同步两处：docs/radar-data.json 与 docs/index.html 内嵌 <script id="embeddedRadar">
幂等：整份重建，重复执行结果一致。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
JSON_PATH = DOCS / "radar-data.json"
HTML_PATH = DOCS / "index.html"

UPDATED_AT = "2026-09-15T00:45:00+08:00"

COLORS = ["#e05656", "#f0a13a", "#5b8cff", "#35c2b0"]


def S(label, url):
    return {"label": label, "url": url}


def IT(zh_t, en_t, zh_d, en_d, sources, verified):
    return {
        "title": {"zh": zh_t, "en": en_t},
        "desc": {"zh": zh_d, "en": en_d},
        "sources": sources,
        "verified": verified,
    }


# ---------------- 重点新闻 / Key News ----------------
KEY_NEWS = [
    IT(
        "霍尔木兹再传遇袭、沙特东西管道关停，中东能源「双出口」同时承压",
        "Hormuz hit again and Saudi East-West pipeline shut: both Gulf exit routes under pressure",
        "9 月 13 日，英国海上贸易行动办公室（UKMTO）通报：一艘商船在通过霍尔木兹海峡期间被不明投射物击中，船员状况、损毁程度与环境影响一度不明，随后通报称船上起火；同日伊朗官员称一艘伊朗商船在格什姆岛附近海域被击中，造成 1 死 3 伤。9 月 10 日，沙特因无人机袭击预防性关停东西输油管道——这条 1200 公里、日输 400 万至 500 万桶的管线是霍尔木兹受阻半年来中东原油外运的主通道，约占全球供应 4%—5%，沙特外交部称无人机来自伊拉克，应伊拉克总理请求暂未还击。价格端：布伦特原油 9 月 9 日收于每桶 101.21 美元，为 7 月 24 日以来首次站上 100 美元，WTI 约 96 美元；美国柴油零售均价创历史新高。流量端：Kpler 数据显示霍尔木兹日过境量已降至个位数，10 日均值约 15 艘，而战前日均约 125—178 艘；Rystad 估算海峡原油流量已从 8 月底的 800 万—900 万桶/日降至 200 万桶/日以下。",
        "On Sept 13 the UK Maritime Trade Operations (UKMTO) reported that a vessel transiting the Strait of Hormuz had been struck by an unknown projectile, with crew condition, damage and environmental impact initially unknown; a follow-up update reported a fire on board. The same day, Iranian officials said an Iranian commercial vessel was hit off Qeshm island, killing one and wounding three. On Sept 10 Saudi Arabia temporarily closed its 1,200-km East-West pipeline as a precaution after a drone attack — the conduit has been the main outlet for Middle East crude for the past six months while Hormuz has been largely shut, moving 4–5 million bpd, or 4–5% of global supply; the foreign ministry said the drone came from Iraq and it held off retaliation at Baghdad's request. On prices: Brent settled at $101.21 a barrel on Sept 9, its first close above $100 since July 24, with WTI around $96, and US retail diesel hit a record high. On flows: Kpler data show Hormuz transits down to single digits a day against a 10-day average of about 15 and a pre-war norm of roughly 125–178 vessels daily; Rystad estimates strait crude flows have fallen below 2m bpd from 8–9m bpd in late August.",
        [
            S("新华社 / 中国日报（管道袭击与胡塞攻势）", "https://www.chinadailyasia.com/article/639481"),
            S("Reuters（UKMTO 遇袭与沙特管线）", "https://www.thestar.com.my/news/world/2026/09/13/new-report-of-attack-on-strait-of-hormuz-shipping-fans-fears-of-threats-to-oil-supplies"),
            S("TASS（UKMTO 通报原文）", "https://tass.com/emergencies/2186865"),
            S("Anadolu / Bernama（霍尔木兹过境量）", "https://www.bernama.com/en/world/news.php?id=2606655"),
            S("Arab News（Kpler 过境数据）", "https://www.arabnews.com/middle-east/hormuz-shipping-traffic-falls-to-single-digits-data-shows-3001310"),
            S("Daily Sabah（布伦特破 100 美元）", "https://www.dailysabah.com/business/energy/oil-breaches-100-on-fresh-middle-east-flare-up/amp"),
        ],
        True,
    ),
    IT(
        "胡塞武装拿下曼德海峡佩里姆岛，也门整条红海海岸易手",
        "Houthis seize Perim Island as Yemen's entire Red Sea coast changes hands",
        "胡塞武装 9 月 10 日攻占红海港口城市穆哈（Mocha），9 月 11 日又登上位于曼德海峡正中、把狭窄水道一分为二的佩里姆岛（又称马永岛）——此前一夜政府军已撤离，同时控制祖盖尔岛与大、小哈尼什岛。法新社引也门军方官员称，西海岸原政府控制区「全部陷落」，政府军退至亚丁以西约 90 公里的霍尔欧迈拉。胡塞发言人叶海亚·萨雷亚称，9 月 3 日以来的攻势已夺取约 5400 平方公里，并称除沙特船只外国际航行安全——这与该组织 7 月 20 日宣布的沙特航运禁令并存，其「击落 9 架战机」等战果未获独立核实。沙特王储穆罕默德·本·萨勒曼 9 月 10 日两次致电特朗普请求美军打击胡塞，美方目前拒绝直接介入、仅提供情报与目标支持。联合国安理会已就也门局势召开紧急会议，联合国特使呼吁各方克制；国际移民组织称冲突已致近 2 万人流离失所。曼德海峡与霍尔木兹合计承载逾四分之一的海运原油与石油贸易，近三分之一全球集装箱运力经红海通行。",
        "Houthi forces captured the Red Sea port city of Mocha on Sept 10 and on Sept 11 landed on Perim Island (also known as Mayyun), which sits at the heart of the Bab al-Mandab Strait and splits the narrow waterway into two shipping channels, after government troops withdrew overnight; they also took Zuqar and the Greater and Lesser Hanish islands. AFP quoted a Yemeni military official saying all previously government-held territory on the western coast \"has fallen\", with forces pulling back to Khor Omeira about 90 km west of Aden. Houthi spokesman Yahya Sarea said the offensive launched on Sept 3 had seized about 5,400 sq km and insisted international navigation was safe except for Saudi vessels — consistent with the Saudi shipping ban the group declared on July 20; claims such as downing nine aircraft were not independently verified. Saudi Crown Prince Mohammed bin Salman called US President Donald Trump twice on Sept 10 to urge strikes on the Houthis; Washington has so far limited support to intelligence and targeting rather than direct intervention. The UN Security Council held an emergency session on Yemen and the Special Envoy urged restraint, while the IOM reported nearly 20,000 people displaced. Hormuz and Bab al-Mandab together carry more than a quarter of seaborne crude and petroleum trade, and nearly a third of global container traffic passes through the Red Sea.",
        [
            S("新华社（胡塞控制曼德海峡地区）", "https://www.chinadailyasia.com/article/639481"),
            S("CGTN（佩里姆岛与红海航线）", "https://news.cgtn.com/news/2026-09-12/Houthis-seize-Perim-Island-tightening-grip-on-Bab-al-Mandab-Strait-1Qn4p1IIpyw/p.html"),
            S("Reuters（四名也门政府消息人士）", "https://www.jpost.com/middle-east/article-908223"),
            S("AFP / Euronews（整个西海岸陷落）", "https://www.euronews.com/2026/09/12/houthis-seize-yemeni-island-in-bab-el-mandeb-taking-control-of-the-strait"),
            S("Reuters（沙特求援与美方回应）", "https://www.thestar.com.my/news/world/2026/09/13/new-report-of-attack-on-strait-of-hormuz-shipping-fans-fears-of-threats-to-oil-supplies"),
        ],
        True,
    ),
    IT(
        "美加贸易战再升级：9 月 15 日起约百品类加征 50%，联邦采购除名 500 亿美元",
        "US–Canada trade war escalates: 50% tariffs on ~100 lines from Sept 15, $50bn dropped from federal procurement",
        "9 月 8 日，特朗普依据《1930 年关税法》第 338 条签署 5 份公告：自 9 月 15 日起，对约 100 个品类的加拿大产品加征 50% 从价关税，新增覆盖部分乳制品、纸及纸板、铝制品、部分机动车与船艇、家具床垫、摩托艇、高尔夫球车等，同时把食盐、水泥、精炼铅等移出清单；自 9 月 29 日起禁止进口部分加拿大酒精饮料、乳清与摩托车等 60 余种产品。关键点在于，338 条款关税无论产品是否符合美墨加协定（CUSMA）优惠待遇均适用，并叠加 1962 年《贸易扩展法》232 条款关税。同日特朗普指示总务管理局（GSA）与 USTR 采取一切必要措施，把约 500 亿美元的加拿大原产产品移出 GSA 多项授予计划（MAS），直至加方对美国农民和企业「恢复充分公平的互惠」。同日生效的加拿大反制关税覆盖约 200 亿美元、700 多种美国商品，税率 15%—50%；卡尼称加拿大「不寻求升级」，但将新建港口、矿山与能源基础设施，并在五大洲推进 20 多项贸易与防务协议，以降低对美依赖（目前逾七成加拿大出口流向美国）。",
        "On Sept 8 President Trump signed five proclamations under Section 338 of the Tariff Act of 1930. From Sept 15, roughly 100 categories of Canadian goods face an additional 50% ad valorem tariff — newly covering certain dairy, paper and paperboard, aluminium products, some motor vehicles and boats, furniture and mattresses, motorboats and golf carts — while rock salt, cement and refined lead are removed from the list. From Sept 29 the US will ban imports of certain Canadian alcoholic beverages, whey products and motorcycles, covering more than 60 products. Critically, Section 338 duties apply to covered Canadian goods regardless of whether they qualify for preferential treatment under the US–Mexico–Canada Agreement, and stack on top of Section 232 tariffs. The same day Trump directed the General Services Administration and the USTR to remove about $50bn of Canadian-origin products from GSA Multiple Award Schedules until Canada restores \"full and fair reciprocity\". Canada's retaliatory tariffs on roughly $20bn of US goods across 700-plus product lines, at 15%–50%, took effect the same day; Prime Minister Mark Carney said Canada does not seek escalation but will build new ports, mines and energy infrastructure and pursue more than 20 trade and defence agreements across five continents, with over 70% of Canadian exports currently going to the US.",
        [
            S("China Daily Asia（公告与 338 条款要点）", "https://www.chinadailyasia.com/article/639270"),
            S("浙江省贸促会（公告附件清单解读）", "https://www.ccpitzj.gov.cn/col/col1229557691/art/2026/art_9fd7ff3635b04470b330dd21d66ffaf5.html"),
            S("AFP（禁令与 50% 关税清单）", "https://news.laodong.vn/the-gioi/my-cam-do-uong-co-con-tu-canada-ap-thue-50-nhieu-hang-hoa-1763683.ldo"),
            S("参考消息 / 法新社（联邦采购禁令）", "https://www.toutiao.com/article/7684171801077580307/"),
        ],
        True,
    ),
    IT(
        "SCFI 连涨六周、美东运价破 10479 美元，全球滞港运力已超疫情峰值",
        "SCFI extends sixth weekly gain with US East Coast above $10,479 as port congestion passes the pandemic peak",
        "9 月 11 日，上海出口集装箱运价指数（SCFI）报 3662.18 点，较上期上涨 2.0%，为连续第六周上涨；上海—美西 7339 美元/FEU（+1.3%）、上海—美东 10479 美元/FEU（+1.5%）；欧洲线与地中海线继续回落，分别报 2545 美元/TEU（-3.7%）与 3299 美元/TEU（-4.2%）；波斯湾线因中东局势紧张升至 6311 美元/TEU（+2.9%）。德鲁里世界集装箱指数（WCI）9 月 10 日稳定在 4476 美元/FEU，连续第二周持平，但内部走势分化：上海—洛杉矶涨 2% 至 7352 美元、上海—纽约涨 1% 至 9726 美元，上海—鹿特丹跌 2% 至 3997 美元、上海—热那亚跌 3% 至 4216 美元。拥堵侧，Linerlytica 统计全球滞港运力已超 430 万 TEU，绝对量超过 2022 年疫情峰值 400 万 TEU（占现有船队 12.6%，低于 2022 年的 15.7%）；7 月全球船期可靠度降至 56.4%，为 2026 年最低，上海准班率仅 21%；上海平均等泊时间由第 35 周的 94 小时改善至第 36 周的 64 小时。",
        "On Sept 11 the Shanghai Containerized Freight Index (SCFI) rose 2.0% to 3,662.18 points, a sixth consecutive weekly gain: Shanghai–US West Coast 7,339/FEU (+1.3%) and Shanghai–US East Coast 10,479/FEU (+1.5%), while Europe and Mediterranean lanes kept sliding to 2,545/TEU (-3.7%) and 3,299/TEU (-4.2%); the Persian Gulf lane rose 2.9% to 6,311/TEU on renewed Middle East tension. Drewry's World Container Index held at $4,476 per 40ft on Sept 10 for a second straight week, though the headline masked a split: Shanghai–Los Angeles +2% to $7,352 and Shanghai–New York +1% to $9,726, against Shanghai–Rotterdam -2% to $3,997 and Shanghai–Genoa -3% to $4,216. On congestion, Linerlytica counts more than 4.3m TEU of capacity stuck at ports worldwide — above the 4.0m TEU pandemic peak in absolute terms, though 12.6% of the (now larger) fleet versus 15.7% in 2022; global schedule reliability fell to 56.4% in July, the lowest of 2026, with Shanghai on-time arrivals at just 21%, while average Shanghai berth wait improved from 94 hours in Week 35 to 64 hours in Week 36.",
        [
            S("Container News（SCFI / CCFI / Drewry）", "https://container-news.com/transpacific-freight-rates-climb-as-europe-extends-decline"),
            S("上海航运交易所数据（经航运界）", "https://www.163.com/dy/article/L6KIKO0C051985LJ.html"),
            S("Linerlytica（滞港与船期可靠度）", "https://navilinkglobal.com/news/global-port-congestion-has-passed-the-pandemic-peak-and-chinas-golden-week-could-make-it-worse-not-better"),
            S("Drewry（WCI 与停航统计）", "https://www.spiderlogisticsinc.cn/blog/hormuz-escalation-golden-week-blank-sailings-sep-11-2026"),
        ],
        True,
    ),
]

# ---------------- 热门议题 / Hot Topics ----------------
HOT_TOPICS = [
    IT(
        "黄金周停航潮叠加巴拿马运河再砍配额，有效运力两头受压",
        "Golden Week blank sailings compound Panama Canal quota cuts, squeezing effective capacity from both ends",
        "德鲁里（Drewry）统计，跨太平洋航线下周已公布 8 个停航（本周 7 个），亚欧线 3 个（本周 1 个）；10 月 1—8 日中国国庆黄金周前后的第 37—41 周，主要东西干线预计共取消 47 个航次，约占计划运力的 6%。基础设施侧，巴拿马运河自 9 月起进一步削减每日船舶通行配额并继续执行吃水限制，增加美东与美湾航线的船期延误风险，并已开征运河附加费。承运人同步加收旺季附加费：ONE 自 9 月 11 日起对远东—美西征收 1450 美元/20 尺、2000 美元/40 尺；MSC 自 9 月 12 日起对远东—美东加收 149/297 美元。货主侧提示也趋于一致：马士基建议客户考虑把第四季度到港的货物提前至黄金周前发运，并指出季节性天气正在造成亚洲主要港口拥堵；德迅指出始运港积压货量仍在持续释放，即便进入传统淡季，在积压货量尚未消化与有效运力受限的双重作用下，舱位利用率仍将维持高位。",
        "Drewry counted eight announced blank sailings on the transpacific for the following week (up from seven) and three on Asia–Europe (up from one); across weeks 37–41 around China's Oct 1–8 Golden Week, 47 sailings are expected to be cancelled on the main east–west trades, about 6% of scheduled departures. On the infrastructure side, the Panama Canal further cut daily transit slots from September and kept draft restrictions in place, raising schedule-delay risk on US East Coast and Gulf lanes, with a canal surcharge now applied. Carriers added peak-season surcharges: ONE from Sept 11 at $1,450 per 20ft and $2,000 per 40ft on Far East–US West Coast, and MSC from Sept 12 at $149/297 on Far East–US East Coast. Shipper guidance has converged: Maersk is urging customers to consider shipping Q4-arrival cargo ahead of Golden Week and warns seasonal weather is congesting major Asian ports, while Kuehne+Nagel notes the backlog at origin ports is still being released, so vessel utilisation should stay high through the normally slack holiday period.",
        [
            S("Drewry（停航与附加费统计）", "https://container-news.com/transpacific-freight-rates-climb-as-europe-extends-decline"),
            S("马士基 / 德迅市场动态（运河配额与拥堵）", "https://www.163.com/dy/article/L6KIKO0C051985LJ.html"),
            S("Linerlytica（黄金周取消航次）", "https://navilinkglobal.com/news/global-port-congestion-has-passed-the-pandemic-peak-and-chinas-golden-week-could-make-it-worse-not-better"),
            S("ONE / MSC 附加费汇总", "https://www.spiderlogisticsinc.cn/blog/hormuz-escalation-golden-week-blank-sailings-sep-11-2026"),
        ],
        True,
    ),
    IT(
        "战争险把海湾航线推向「不可投保」：单船附加成本可达 2000 万美元",
        "War-risk cover pushes Gulf routes toward \"uninsurable\": up to $20m in added cost per cargo",
        "阿联酋国家石油公司（ENOC）董事 Paul Bradshaw 在 APPEC 会议上称，目前一船原油经霍尔木兹海峡运输的附加成本可达 1000 万至 2000 万美元：货险最高可达货值的 5%—6%，战争险（战前几乎为零）可达货值的 10%，部分市场参与者甚至选择在无足额保险的情况下航行。承保条件同步收紧：伦敦与斯堪的纳维亚承保人已要求进入波斯湾、阿曼湾与南红海的航次提前 7 天通知，部分欧洲保赔协会对无武装海军护航的船舶发出有条件撤保通知；按 Region Alert 汇总，战争险附加费相当于每桶原油 7—8 美元，另有报道称部分单航次附加费已达船舶价值的 1.5%（较基线上涨约 340%）。后果是多家欧洲与东亚油轮运营商已暂停科威特、伊拉克与沙特北部港口的即期租船，海湾过境降至个位数/日，阿曼湾的船对船转运与护航编队成为维持出口的主要方式。伊朗方面称针对霍尔木兹附近 10 艘船只实施打击，以回应美方击沉 5 艘伊朗油轮；路透与 UKMTO 证实多艘商船受损（含载约 200 万桶伊拉克燃料油的 New Andros），但伊方「全部命中」的说法未获独立核实。",
        "Paul Bradshaw, a director at Emirates National Oil Company (ENOC), told the APPEC conference that moving an oil cargo through Hormuz can now add $10m–$20m in cost: cargo insurance can reach 5%–6% of cargo value and the war-risk premium — effectively zero before the war — can hit 10% of cargo value, with some participants even sailing without full cover. Underwriting terms have tightened in parallel: London and Scandinavian underwriters now require seven days' advance notice for voyages into the Persian Gulf, Gulf of Oman and southern Red Sea, and several European P&I clubs have issued conditional cancellation notices for vessels lacking armed naval escort; Region Alert puts the war-risk surcharge at $7–8 per barrel, while other reporting cites single-voyage surcharges of 1.5% of hull value, up roughly 340% from baseline. The consequence: several European and East Asian tanker operators have suspended spot fixtures out of Kuwaiti, Iraqi and northern Saudi ports, transits have fallen to single digits a day, and ship-to-ship transfers plus escorted convoys in the Gulf of Oman have become the main way to keep exports moving. Iran said it targeted ten vessels near Hormuz in response to the US sinking five Iranian tankers; Reuters and UKMTO confirmed damage to several merchant ships — including the New Andros carrying about 2m barrels of Iraqi fuel oil — but Iran's claim of hitting all ten was not independently verified.",
        [
            S("Reuters（ENOC：单船 1000—2000 万美元）", "https://signalb4noise.com/en/hormuz-uninsurable-risk-trade-system-september-10-2026"),
            S("Region Alert（每桶 7—8 美元与承保条件）", "https://regionalert.com/blog/archive/hormuz/2026-09-09.html"),
            S("Marsh / WTW 保费数据汇总", "https://www.spiderlogisticsinc.cn/blog/hormuz-escalation-golden-week-blank-sailings-sep-11-2026"),
            S("Reuters（New Andros 与商船遇袭）", "https://www.dailysabah.com/business/energy/oil-breaches-100-on-fresh-middle-east-flare-up/amp"),
        ],
        True,
    ),
    IT(
        "对华贸易救济进入密集期：一周内墨、印、韩、泰多起措施落地",
        "Trade remedies against China hit a busy stretch: Mexico, India, Korea and Thailand act within one week",
        "据中国贸促会系统经贸预警汇编（9 月上中旬）：墨西哥 9 月 9 日对原产于中国的有色浮法玻璃（厚度 2—19 毫米）初裁征收 0.11917 美元/千克临时反倾销税，9 月 8 日对 10—20 英寸两轮儿童自行车期间复审终裁提至 57.19 美元/辆（原 13.12），9 月 7 日对 PVC 涂塑布初裁 0.7334 美元/千克，9 月 4 日对成品及半成品铝条杆型材终裁 1.58 美元/千克、对涉华空心异型材终裁 1.93 美元/千克（美国 1.72）；印度 9 月 1 日对草铵膦及其盐类作出反吸收终裁，反倾销税由 2998 提至 5004 美元/吨；韩国 8 月 20 日对固体氢氧化钠初裁，中国大陆企业 3.66%—22.21%、其他生产商 17.58%，台湾地区台塑 38.89%；泰国 9 月 3 日对热镀锌冷轧板卷发起第一次反倾销日落复审，8 月 19 日对铝挤压材发起新出口商复审（保证金 21.94%）；美国 9 月 1 日对中马泰聚乙烯零售包装袋发起第四次反倾销日落复审，ITC 同步启动双反日落复审产业损害调查；阿根廷 9 月 4 日对发动机用冷却液泵启动第三次日落复审并合并情势变迁复审。上述措施多自公告次日起生效，覆盖化工、建材、金属与消费品多个环节。注：本条信息来源为中国贸促会各地分会经贸预警汇编（同源体系），未获第二家独立媒体交叉印证，故未标记为已核验。",
        "According to trade-remedy alerts compiled by the China Council for the Promotion of International Trade (CCPIT) network in early-to-mid September: on Sept 9 Mexico imposed a provisional anti-dumping duty of $0.11917/kg on Chinese tinted float glass (2–19 mm); on Sept 8 it set a final interim-review duty of $57.19 per unit on 10–20 inch children's bicycles (up from $13.12); on Sept 7 a provisional $0.7334/kg on PVC-coated fabric; and on Sept 4 a definitive $1.58/kg on finished and semi-finished aluminium bars and profiles plus $1.93/kg (US: $1.72) on hollow profiles. On Sept 1 India issued a final anti-absorption ruling on glufosinate and its salts, raising the duty from $2,998 to $5,004 per tonne. On Aug 20 Korea preliminarily set anti-dumping duties on solid sodium hydroxide at 3.66%–22.21% for mainland Chinese producers, 17.58% for others, and 38.89% for Taiwan's Formosa Plastics. On Sept 3 Thailand initiated its first sunset review of hot-dip galvanised cold-rolled steel coil, and on Aug 19 a new-exporter review on aluminium extrusions (21.94% deposit). On Sept 1 the US launched a fourth sunset review of polyethylene retail carrier bags from China, Malaysia and Thailand, with the ITC opening an injury investigation. On Sept 4 Argentina began a third sunset review merged with a changed-circumstances review on engine coolant/water pumps. Most measures take effect the day after publication and span chemicals, building materials, metals and consumer goods. Note: this item draws on CCPIT provincial alert bulletins (a single source system) with no second independent outlet for cross-check, so it is not marked verified.",
        [
            S("中国贸促会北京市分会（9 月 14 日经贸预警）", "https://ccpitbj.org/web/static/articles/catalog_40fcc0367c729df20181af772a5807eb/article_ff8080819f35eae501a09f103b340822/ff8080819f35eae501a09f103b340822.html"),
            S("中国贸促会北京市分会（9 月 11 日经贸预警）", "https://www.ccpitbj.org/web/static/articles/catalog_40fcc0367c729df20181af772a5807eb/article_ff8080819f35eae501a09e8a23b707f0/ff8080819f35eae501a09e8a23b707f0.html"),
            S("中国贸促会内蒙古分会（2026 年第 35 期）", "http://www.ccpitnmg.org.cn/mc_ssjmxx/ssjmzlm/202609/t20260911_451756.html"),
        ],
        False,
    ),
]

# ---------------- 研究瞭望 / Research ----------------
RESEARCH = [
    IT(
        "McKinsey《State of AI 2026》：九成企业已在用 AI，仅 37% 说它改善了利润",
        "McKinsey State of AI 2026: ~90% of firms use AI, but only 37% report EBIT gains",
        "麦肯锡 2026 年 5—6 月对 97 个国家 1719 名受访者的线上调查显示（36% 来自年收入超 10 亿美元的企业）：近九成受访者称其公司已在至少一个业务职能中常态化使用 AI，44% 已在全企业范围内规模化部署 AI；但只有 37% 表示 AI 对企业息税前利润（EBIT）产生了正向贡献。分职能看，供应链与制造进入「规模化阶段」的比例在各职能中处于末位——即便在先进制造业，供应链/制造职能的规模化比例也仅约 14%，明显低于 IT、知识管理与软件工程。麦肯锡同时指出，真正看到收益的企业更可能是重构了工作流，而不是把 AI 叠加在既有流程之上； chatbot 仍是最常见的应用形态。对供应链团队的含义很直接：先在高用量环节（需求计划或支出分析）证明回报，再谈代理式扩张，否则规模化越快、失望越大。",
        "McKinsey's online survey of 1,719 participants across 97 nations (fielded May–June 2026; 36% from companies with over $1bn annual revenue) finds that nearly nine in ten say their company is regularly using AI in at least one function and 44% are scaling AI across the enterprise — yet only 37% say AI has contributed positively to earnings before interest and taxes. Broken down by function, supply chain and manufacturing sit at the bottom of the table for reaching the scaling phase: even in advanced manufacturing, supply chain/manufacturing functions reach only about 14%, well below IT, knowledge management and software engineering. McKinsey also finds that organisations seeing gains are more likely to have redesigned workflows rather than bolted AI onto existing processes, with chatbots remaining the most common application. The read-through for supply chain teams is direct: prove returns in a high-volume function such as demand planning or spend analysis before scaling agentic ambitions.",
        [
            S("McKinsey（The state of AI）", "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai"),
            S("Supply Chain Digital（引 McKinsey 2026 全球调研）", "https://supplychaindigital.com/articles/why-supply-chains-need-people-and-ai-to-create-value"),
            S("Supply Chain & Logistics（报告数据解读）", "https://supplychainandlogistics.org/2026/09/05/ai-use-growing-but-cost"),
        ],
        True,
    ),
    IT(
        "Gartner：83% 供应链组织走「增量式」AI 路线，代理式 SCM 支出五年冲 530 亿美元",
        "Gartner: 83% of supply chain organisations take an incremental AI path; agentic SCM spend to reach $53bn by 2030",
        "Gartner 对 140 位资深供应链领导者的调查显示：83% 的组织是把 AI 增量式地应用到具体用例、或逐步嵌入既有流程，而非对流程做彻底重构——这与「推倒重来」式的数字化叙事形成对照。组织同时正向预测式 AI 迁移，目标是「在中断发生之前就消除它」，让系统在偏差出现时自动重新调整。市场侧，Gartner 预测带代理式 AI 功能的供应链管理软件支出将从 2025 年不足 20 亿美元增长到 2030 年的 530 亿美元，企业采用率由 5% 升至 60%。另一项被反复引用的判断是：采购因合同密集、非结构化数据多、流程最依赖人工，通常是供应链各职能中 AI 采用最慢的一环——德勤在 Procurement LIVE 2026（9 月 8—9 日，伦敦威斯敏斯特）上给出的数字是 92% 的首席采购官已在评估或试点代理式 AI；会上共识是「代理式 AI 已从试点项目变成董事会任务」。",
        "A Gartner survey of 140 senior supply chain leaders finds that 83% of organisations apply AI incrementally to specific use cases or gradually scale it into existing processes rather than executing a total overhaul — a contrast with the \"rip and replace\" digital narrative. Organisations are also shifting toward predictive AI, aiming to eliminate disruptions before they occur so systems self-correct when deviations appear. On the market side, Gartner forecasts spending on SCM software with agentic AI features will grow from under $2bn in 2025 to $53bn by 2030, with enterprise adoption rising from 5% to 60%. A related and oft-cited point: procurement is usually the slowest supply chain function to adopt AI because it is the most manual, contract-heavy and built on unstructured data — Deloitte told Procurement LIVE 2026 (Sept 8–9, Westminster) that 92% of chief procurement officers are now assessing or piloting agentic AI, where the panel consensus was that agentic AI has moved from pilot project to boardroom mandate.",
        [
            S("Supply Chain Digital（Gartner：140 位供应链领导者）", "https://supplychaindigital.com/articles/why-supply-chains-need-people-and-ai-to-create-value"),
            S("Gartner 预测与 Deloitte CPO 数据", "https://ai.growthgear.com.au/ai-tools/best-ai-tools-for-supply-chain-management"),
            S("FreightWaves 白皮书（整合 Gartner / McKinsey）", "https://pro.edgex.exchange/zh-TW/news/article/supply-chain-ai-readiness-gap"),
        ],
        True,
    ),
    IT(
        "竞争优势不在 AI 本身，而在「再委派」：把数据活交给 AI，把判断留给人",
        "The edge isn't AI itself, it's redelegation: give data-heavy work to AI, keep judgment with people",
        "Aras 首席技术官 Rob McAveney 提出一个对供应链尤其贴切的观点：供应链与采购团队的大部分时间并非用于决策，而是用于「为决策准备信息」——解读供应商数据、核对格式、发现不一致、与既有数据合并。典型场景是收到供应商更新的技术数据包（TDP）：表格格式、命名规范与 BOM 标准往往与内部不一致，必须先由人翻译映射，乘以供应商数量与修订频次后，占据大量工时。所谓「再委派」（redelegation），是刻意重构工作流：让 AI 承担数据密集、可重复的步骤（AI 代理解析供应商结构、抽取数据并映射到目标 schema），人负责确认结果、运用判断并承担问责——代理不能自行发布结果，这正是流程保持可治理、可审计的关键。理由很直接：AI 技术本身会持续普及并变得人人可得，难以成为持久护城河，真正形成差异的是围绕技术重构工作的方式；贝恩估算某全球银行单一代理式采购部署在全面推广后最高可节省 1.8 亿美元。",
        "Aras CTO Rob McAveney advances a view that fits supply chains particularly well: most of what supply chain and sourcing teams do each day isn't decision-making but preparing the information needed to decide — interpreting supplier data, reconciling formats, checking inconsistencies and merging updates with existing data. The canonical example is receiving an updated technical data package (TDP) from a supplier, where spreadsheet formats, naming conventions and BOM standards differ from internal ones, so someone must translate and map before anyone can act; multiplied across suppliers and revisions, this consumes a large share of the team's time. \"Redelegation\" is the deliberate redesign of workflows so AI takes the data-intensive, repetitive steps — an AI agent parses the supplier's structure, extracts the data and maps it to the desired schema — while people confirm results, apply judgment and retain accountability; critically, the agent cannot publish results on its own, which is what keeps the process governed and auditable rather than merely automated. The logic is straightforward: the underlying technology will keep improving and become broadly available, so the durable differentiator is how work is redesigned around it. Bain estimates a single agentic procurement deployment at a global bank could save up to $180m at full scale.",
        [
            S("The Supply Chain Xchange（Aras CTO 署名文章，9 月 2 日）", "https://www.thescxchange.com/tech-infrastructure/technology/the-competitive-advantage-isn-t-ai-it-s-redelegation"),
            S("Deloitte / Bain 数据（Procurement LIVE 2026）", "https://ai.growthgear.com.au/ai-tools/best-ai-tools-for-supply-chain-management"),
        ],
        True,
    ),
]

# ---------------- 应用风向 / Apps & Adoption ----------------
APPS = [
    IT(
        "京东物流「超脑+狼族」五款新品齐发，具身机器人进入物流全链路规模化",
        "JD Logistics unveils five new \"Wolf\" robots as embodied AI scales across the full logistics chain",
        "9 月 9 日 JDD 京东全球科技探索者大会上，京东物流「超脑+狼族」机器人应用军团全阵容亮相：「超脑」大模型负责供应链复杂场景下的智能决策与协同调度，「狼族」已在仓储、分拣、配送等环节落地「九狼」（9 款产品、11 款机器人），本次发布 5 款新品。仓储环节的「仓狼」是行业首个仓内复杂场景移动拣选机器人——传统仓库自动化改造通常需停产 6 个月，「仓狼」实现 2 周极速部署、无需改造现有仓库，集智能拣选、巡检盘点、自主建图于一体，商品拣选准确率 99.9%、整仓商品覆盖率超 85%、综合 UPH 达 80 件，已常态化作业。冷链环节的低温版「智狼」是行业首个 -20℃ 料箱货到人方案，借助 WOS 全局智控、主动除霜与 100% 无接触供电解决低温停机难题，存储能力提升 100%、作业效率提升 200%、单均降本 10%。此外还有行业首个全流程一体化智能无人药房「母狼」健康版、L4 级「独狼」第六代智能配送车、「飞狼」L05 无人机与「异狼」具身灵巧臂。配套投入上，京东物流计划五年内采购 300 万台机器人、100 万台无人车与 10 万架无人机，京东云两年内采集超 1000 万小时真实场景视频数据，五年内布局 80 个 RoboBase 机器人产业基地。",
        "At the JD Discovery (JDD) conference on Sept 9, JD Logistics unveiled the full line-up of its \"Super Brain + Wolf Pack\" robot corps: the \"Super Brain\" large model handles intelligent decision-making and coordinated scheduling in complex supply chain scenarios, while the \"Wolf Pack\" has deployed \"nine wolves\" (9 products, 11 robots) across warehousing, sorting and delivery, five of them new at this event. In warehousing, \"Canglang\" is described as the industry's first mobile picking robot for complex in-warehouse scenarios: where conventional automation retrofits can take six months of downtime, it promises deployment in two weeks with no warehouse modification, combining picking, inventory patrol and autonomous mapping, with 99.9% picking accuracy, over 85% SKU coverage and a composite UPH of 80 items, already in regular operation. For cold chain, the low-temperature \"Zhilan\" is the industry's first -20°C tote goods-to-person solution, using a global WOS control system, active defrosting and 100% contactless power to overcome low-temperature failures, lifting storage capacity 100% and operating efficiency 200% while cutting unit cost 10%. The launch also included \"Mulang\" Health (the industry's first fully integrated unmanned pharmacy), the L4 \"Dulang\" sixth-generation delivery van, the \"Feilang\" L05 drone and the \"Yilang\" dexterous arm. On commitments: JD Logistics plans to procure 3m robots, 1m unmanned vehicles and 100,000 drones over five years; JD Cloud will collect over 10m hours of real-world video data within two years; and 80 RoboBase robot industry bases will be built nationwide over five years.",
        [
            S("人民政协网（京东物流具身机器人）", "https://www.rmzxw.com.cn/c/2026-09-09/3972850.shtml"),
            S("中国物流与采购杂志（产品与运行数据）", "https://www.toutiao.com/article/7683417131207115304/"),
            S("三湘都市报（五款新品）", "https://www.toutiao.com/article/7683499724724290086/"),
            S("云栖网（物理 AI 战略与 RoboBase）", "https://www.yunthe.com/jing-dong-wu-li-ai-quan-jing-zhan-lyue-luo-di-lang-zu-ji-qi"),
        ],
        True,
    ),
    IT(
        "机器人开始「真干活」：在 80 厘米窄通道的真实药房里自主接单拣药",
        "Robots start doing real work: filling orders in a real pharmacy with 80cm aisles",
        "2026 Inclusion·外滩大会（9 月 9—12 日，上海）以「共创 AI 新经济」为主题，300 余家参展企业、1.5 万平方米主题科技展区，其中 40 余家具身智能厂商集中亮相；与往年强调跑跳等运动能力不同，今年展区更强调机器人在产业和生活里「真干活」。蚂蚁灵波与上海国大药房打造的「机器人智慧药房」已在国大药房零售门店真实落地：机器人「接单」后自主移动到货架、识别并夹取目标药品、送至取药窗口，夜间值班时辅助药剂师进行药品分拣，门店无需做任何改造。真实环境的难点在于药盒尺寸相近、包装密集、货架最窄通道仅约 80 厘米，且存在透明包装、反光、随机摆放等大量视觉干扰。同一套机器人大脑还能驱动不同形态机器人在多场景作业——在物流仓库分拣随机包裹、在工业场景完成零部件上下料，呈现「一脑多机」走向千行百业；擎朗智能人形机器人已进入酒店做迎宾、配送与洗衣等长程式任务。",
        "The 2026 Inclusion·Bund Conference (Sept 9–12, Shanghai), themed \"Co-creating the AI new economy\", gathered more than 300 exhibitors across a 15,000 sq m technology exhibition, including over 40 embodied-AI vendors. Unlike previous years that showcased running and jumping, this year's emphasis was on robots doing real work in industry and daily life. The \"smart robot pharmacy\" built by Ant Lingbo and Shanghai Guoda Pharmacy is already live in retail stores: after receiving an order the robot navigates to the shelf, identifies and grips the target medicine, delivers it to the pickup window, and assists pharmacists with night-time sorting — with no store modification required. The difficulty in real settings is that medicine boxes are similar in size and densely packed, the narrowest aisles are about 80 cm wide, and there is heavy visual noise from transparent packaging, reflections and random placement. The same robot brain can drive different form factors across scenarios — sorting random parcels in logistics warehouses, loading and unloading parts in industrial settings — an example of \"one brain, many machines\" spreading across industries; Qinglang's humanoid robots have also entered hotels for greeting, delivery and laundry tasks.",
        [
            S("新华社（9 月 10 日，外滩大会现场）", "https://www.xiancn.com/content/2026-09/10/content_7516114.htm"),
        ],
        False,
    ),
    IT(
        "末端配送规模化：中通 3500 台无人车跑在 260 多个城市，日均运送 870 万件",
        "Last-mile at scale: ZTO runs 3,500 autonomous vans across 260+ cities, 8.7m parcels a day",
        "2026 年中国国际服务贸易交易会（9 月 9—13 日，北京首钢园）运输服务专题展上，中通快递展出的无人快递车可装载近千件包裹，行驶全程可通过手机 App 控制。据中通快递公共事务管理中心相关负责人介绍，中通已有超 3500 台无人配送车在全国 260 多个城市投用，每天运送包裹超 870 万件，成为末端配送的重要运力补充。同期，美团展示了面向个人、商家与企业组织的 AI 智能体：面向餐饮商家的 AI 经营助手「智能掌柜」把顾客评价按菜品、服务、环境归类，转化为结构化经营反馈并给出针对性建议。德勤中国轮值副首席执行官孟晓凡指出，本届服贸会展出的中国服务案例中，以 AI、大模型、智能体为核心技术的案例占比近四成，「AI 正从点状应用走向平台化、体系化，围绕 AI 重构流程、组织和价值创造，成为企业实现转型的关键」。",
        "At the transport services exhibition of the 2026 China International Fair for Trade in Services (Sept 9–13, Shougang Park, Beijing), ZTO Express showed an autonomous delivery van that can carry close to 1,000 parcels and be controlled via a mobile app throughout the route. According to ZTO's public affairs centre, the company has more than 3,500 autonomous delivery vehicles in service across 260-plus cities nationwide, moving over 8.7m parcels a day and becoming a significant supplement to last-mile capacity. Meituan showed AI agents for consumers, merchants and enterprise organisations: its merchant-facing assistant \"Smart Shopkeeper\" classifies customer reviews by dish, service and environment, converting them into structured operating feedback with targeted recommendations. Meng Xiaofan, rotating deputy CEO of Deloitte China, noted that close to 40% of the Chinese service cases exhibited at this year's fair are built around AI, large models and AI agents, adding that \"AI is moving from point applications to platform-based, systematic deployment, and re-engineering process, organisation and value creation around AI has become key to enterprise transformation.\"",
        [
            S("新华社（9 月 12 日，服贸会现场）", "https://www.toutiao.com/article/7684806642688524810/"),
            S("人民网（9 月 11 日，运输服务专题展）", "https://bj.people.com.cn/n2/2026/0911/c14540-41693320.html"),
        ],
        True,
    ),
    IT(
        "快递业「AI 降本」进入财报兑现期：上半年收入增速首超件量增速",
        "Express delivery's AI-driven cost cuts show up in earnings: revenue growth outpaces volume for the first time",
        "上半年我国快递业务量突破千亿件、同比增长 5%，业务收入超 7700 亿元、同比增长 7.3%，半年期业务收入增速首次超过业务量增速，行业长期「以价换量」的格局出现反转。盈利侧，顺丰完成件量同比增长 0.2%、扣非归母净利润同比增长 9.3%；圆通、申通件量分别增长 9.5%、15.8%；圆通、韵达、申通上半年归母净利润增幅均超 70%。成本侧，中通单票分拣及运输成本合计下降 4 分钱；圆通单票运输成本 0.36 元、单票中心操作成本 0.26 元，两项均同比下降 1 分钱；韵达单票费用同比下降 7.46%，分拣、运输、客服、风险防控四项费用同比减少超 1 亿元。国家邮政局发展研究中心高级工程师喻饶认为，利润集体高增更多来源于前期数字化投入的阶段性兑现，AI 技术在全流程加快应用，尤其是无人机、无人车的大规模落地，正在成为行业降本增效的重要引擎。落地场景包括：京东物流在四川资中启动国内规模最大的无人机进村配送网络，覆盖 131 个建制村、最快 7 分钟飞抵山村；广州邮区中心江高邮件处理中心 8 台人形机器人与分拣员并肩供件，效率达每小时 800 件；深圳龙华顺丰转运中心近 200 台无人车夜间往返周边 5 个末端网点，行驶超 300 条线路，单日快件处理峰值达 9 万件。",
        "In the first half of the year China's express delivery volume passed 100bn parcels (+5% YoY) while revenue exceeded RMB 770bn (+7.3%), the first time half-year revenue growth outpaced volume growth — a reversal of the industry's long-standing trade of price for volume. On profits: SF Express volume grew just 0.2% but recurring net profit rose 9.3%; YTO and STO volumes grew 9.5% and 15.8%; and YTO, Yunda and STO all reported net profit growth above 70%. On costs: ZTO cut combined per-parcel sorting and transport cost by 4 fen; YTO's per-parcel transport cost reached RMB 0.36 and hub handling RMB 0.26, each down 1 fen; Yunda's per-parcel expense fell 7.46%, with sorting, transport, customer service and risk control costs down over RMB 100m combined. Yu Rao, a senior engineer at the State Post Bureau's Development Research Centre, argues the broad profit surge largely reflects the staged payoff of earlier digital investment, with AI now applied across the full process — especially large-scale deployment of drones and unmanned vehicles — becoming a key engine of cost reduction. Examples: JD Logistics launched the country's largest drone-to-village network in Zizhong, Sichuan, covering 131 administrative villages with the fastest delivery in 7 minutes; at Guangzhou's Jianggao mail processing centre, eight humanoid robots work alongside sorters at 800 parcels per hour; and at SF's Shengli transfer hub in Shenzhen's Longhua district, nearly 200 unmanned vehicles run night loops to five nearby outlets across 300-plus routes, peaking at 90,000 parcels a day.",
        [
            S("人民日报（产经视野：快递转型升级）", "https://www.toutiao.com/article/7683412161560838710/"),
        ],
        False,
    ),
]

DATA = {
    "updatedAt": UPDATED_AT,
    "columns": [
        {"cat": {"zh": "重点新闻", "en": "Key News"}, "color": COLORS[0], "items": KEY_NEWS},
        {"cat": {"zh": "热门议题", "en": "Hot Topics"}, "color": COLORS[1], "items": HOT_TOPICS},
        {"cat": {"zh": "研究瞭望", "en": "Research"}, "color": COLORS[2], "items": RESEARCH},
        {"cat": {"zh": "应用风向", "en": "Apps & Adoption"}, "color": COLORS[3], "items": APPS},
    ],
}


def main():
    payload = json.dumps(DATA, ensure_ascii=False, indent=2)

    # 1) 写 JSON
    JSON_PATH.write_text(payload + "\n", encoding="utf-8")

    # 2) 同步 index.html 内嵌快照
    html = HTML_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r'(<script id="embeddedRadar" type="application/json">)(.*?)(</script>)',
        re.S,
    )
    if not pattern.search(html):
        raise SystemExit("未找到 embeddedRadar 块，请检查 index.html")
    html2, n = pattern.subn(lambda m: m.group(1) + "\n" + payload + "\n" + m.group(3), html, count=1)
    HTML_PATH.write_text(html2, encoding="utf-8")

    total = sum(len(c["items"]) for c in DATA["columns"])
    verified = sum(1 for c in DATA["columns"] for i in c["items"] if i["verified"])
    srcs = {s["label"] for c in DATA["columns"] for i in c["items"] for s in i["sources"]}
    print(f"written: {JSON_PATH}")
    print(f"synced : {HTML_PATH} (replaced {n} block)")
    print(f"updatedAt: {UPDATED_AT}")
    print(f"items: {total} | verified: {verified} | source labels: {len(srcs)}")


if __name__ == "__main__":
    main()
