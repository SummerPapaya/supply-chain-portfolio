# -*- coding: utf-8 -*-
"""供应链雷达周更脚本（2026-10-12）

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

UPDATED_AT = "2026-10-12T17:20:00+08:00"

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
        "德国港口无限期罢工风险解除：ver.di 接受 3.4% 涨薪方案，覆盖六港约 11,000 人，但拥堵与莱茵河枯水未解",
        "German port strike risk recedes: ver.di accepts a 3.4% pay deal covering about 11,000 workers at six ports — congestion and low Rhine water remain",
        "10 月 6 日，ver.di 联邦劳资委员会宣布接受德国海港企业中央协会（ZDS）的最新要约，汉堡、不来梅、不来梅哈芬、埃姆登、布拉克与威廉港六个海港的无限期罢工因此暂时解除，覆盖约 11,000 名受集体协议约束的工人。此前 9 月超过 5,500 人参加的会员投票中 64.7% 反对同一份 12 个月方案，8 月与 9 月已先后发生 24 小时与 48 小时警告性罢工，汉堡等主要集装箱码头作业一度受阻。方案条款：小时工资上调 3.4%（追溯至 8 月 1 日，期限 12 个月）、休假补贴增加 200 欧元、集装箱高吞吐岗位（“A 类公司”）年度津贴自 2027 年 1 月 1 日起增加 416 欧元至 4,800 欧元；谈判自 7 月 22 日启动、经四轮谈成，ver.di 最初诉求为 8.2% 或至少每小时加 2.50 欧元。两条边界必须同时标出：一是雇主方（ZDS）仍需正式批准，程序尚未走完；二是罢工警报解除不等于拥堵解除——据德迅（Kuehne + Nagel）口径，不来梅哈芬堆场利用率仍达 90%、汉堡 80%–85%、威廉港 65%；同时莱茵河考布（Kaub）水位 8 月降至 6 厘米、为 1880 年有记录以来最低，马士基已告知客户驳船运输“可能不再具备运营可行性”，Contargo 报告安特卫普平均等泊 36 小时、鹿特丹 56 小时。",
        "On Oct 6 ver.di’s federal collective bargaining commission announced it had accepted the latest offer from the Central Association of German Seaport Operators (ZDS), averting — for now — indefinite strikes at Hamburg, Bremen, Bremerhaven, Emden, Brake and Wilhelmshaven, covering roughly 11,000 workers bound by the collective agreement. The decision follows a September membership consultation of more than 5,500 workers in which 64.7% rejected the same 12-month offer, after 24-hour and 48-hour warning strikes in August and September that slowed or halted handling at several terminals. Terms: hourly wages up 3.4%, backdated to Aug 1 over a 12-month term; holiday pay up €200; and an extra €416 from Jan 1, 2027 for staff at high-throughput container operations (“A-companies”), taking the annual allowance to €4,800. Talks opened on July 22 and closed on the fourth round; ver.di had opened at 8.2% or at least €2.50 more per hour. Two caveats belong in the same paragraph: ZDS still has to formally approve, so the process is not finished; and no strike does not mean no congestion. Per Kuehne + Nagel, yard utilisation is 90% at Bremerhaven, 80–85% at Hamburg and 65% at Wilhelmshaven, while the Rhine gauge at Kaub fell to 6cm in August — the lowest since records began in 1880 — with Maersk telling customers that barge transport may cease to be operationally feasible and Contargo reporting average waits of 36 hours at Antwerp and 56 hours at Rotterdam.",
        [
            S("WorldCargo News（ver.di 接受要约、六港名单）", "https://www.worldcargonews.com/news/2026/10/union-members-accept-offer-strike-at-german-ports-averted/"),
            S("Ports Europe（3.4% 涨薪与 11,000 人覆盖范围）", "https://www.portseurope.com/german-seaport-employers-and-ver-di-agree-3-4-pay-rise-for-11000-port-workers/"),
            S("Container News（64.7% 反对票与 75% 罢工门槛）", "https://container-news.com/german-port-union-accepts-wage-offer-indefinite-strikes-averted"),
            S("The Loadstar（堆场利用率与莱茵河水位）", "https://theloadstar.com/german-port-strikes-averted-but-low-rhine-still-delaying-barge-cargo"),
            S("LOGISTIK HEUTE / dpa（劳资双方表态）", "http://logistik-heute.de/en/news/sea-freight-verdi-and-zds-agree-tariffs-employees-six-seaports-287352.html"),
        ],
        True,
    ),
    IT(
        "苏伊士回摆扩至联盟级：Premier Alliance 两条亚欧线改道，马士基与赫伯罗特再挪四条线，Drewry 称每箱位仅省 43 美元",
        "Suez return goes alliance-wide: Premier Alliance reroutes two Asia–Europe loops, Maersk and Hapag-Lloyd shift four more — Drewry puts the saving at just $43 per slot",
        "10 月 6—8 日运河回摆明显加速。Premier Alliance（ONE / HMM / 阳明）宣布把 FE1（东南亚—北欧）与 IOX/INX（印度次大陆—北欧）两条线改回苏伊士，往返航程分别由 13 周缩短至 11 周与 10 周，8,110 TEU 的 ONE Continuity 计划 10 月 17 日自林查班启航。马士基与赫伯罗特的 Gemini 合作亦宣布将 AE5、AE11、AE12、ME2 四条此前绕好望角的航线改回运河；MSC 的 Jade 服务已返回曼德海峡—红海—苏伊士并加挂沙特阿卜杜拉国王港。苏伊士运河管理局口径：2025/26 财年运河收入 46.7 亿美元（+23%）、船舶通行量 +10%、货物吨位 +22%；2026 年 1—8 月集装箱船净吨位 7,210 万吨，较上年同期 4,670 万吨增长 54.2%。Drewry 10 月 8 日报告给出关键的“反直觉”测算：24,000 TEU 船走苏伊士相对好望角，往返航程由 29,711 海里降至 21,878 海里、124 天降至 97 天，每航次省约 100 万美元——摊到箱位只有 43 美元/TEU；而 0.3% 船值的战争险（按 2.25 亿美元船价）两次穿越即增加 135 万美元，1% 则达 450 万美元，足以吞掉全部节省。回摆因此主要不是成本驱动，而是航程、船舶利用率与竞争压力驱动。方向上也并非对称：9 月亚欧主干（西行）仅 13%–25% 运力走红海，回程（东行）为 25%–47%，地中海—亚洲达 57%。",
        "The swing back to the canal accelerated sharply on Oct 6–8. The Premier Alliance (ONE, HMM, Yang Ming) said it will restore two Asia–North Europe services — FE1 (Southeast Asia–North Europe) and IOX/INX (Indian Subcontinent–North Europe) — to Suez routing, cutting round-voyage times from 13 weeks to 11 and 10 weeks respectively, with the 8,110 TEU ONE Continuity scheduled to sail from Laem Chabang on Oct 17. Maersk and Hapag-Lloyd’s Gemini Cooperation separately said four services previously routed via the Cape of Good Hope — AE5, AE11, AE12 and ME2 — would return to the canal, while MSC has brought its Jade service back through Bab el-Mandeb, the Red Sea and Suez with a call at King Abdullah Port. Suez Canal Authority figures: FY2025/26 canal revenue of $4.67bn (+23%), transits +10% and cargo tonnage +22%, with container-ship net tonnage of 72.1m tonnes in Jan–Aug 2026 against 46.7m a year earlier (+54.2%). Drewry’s Oct 8 report supplies the counter-intuitive arithmetic: for a 24,000 TEU ship, Suez versus the Cape cuts the round voyage from 29,711 to 21,878 nautical miles and from 124 to 97 days, saving about $1m per voyage — just $43 per container slot. A war-risk premium of 0.3% of hull value (on a $225m ship) adds $1.35m for two transits and 1% adds $4.5m, more than wiping out the saving. The return is therefore driven by transit time, vessel utilisation and competitive pressure rather than voyage cost, and it is asymmetric: in September only 13–25% of Asia–Europe headhaul capacity used the Red Sea, against 25–47% on backhaul and 57% on Mediterranean–Asia.",
        [
            S("Maritime News（Premier Alliance 与 Gemini 航线改道）", "https://www.maritimenews.com/suez-canal/suez-canal-container-services-return"),
            S("Breakbulk News（Drewry 每箱位 43 美元测算）", "https://breakbulk.news/container-lines-return-to-suez-despite-43-per-slot-saving-as-drewry-warns-of-red-sea-risks"),
            S("Shipping Gazette（东西行运力占比与净吨位）", "https://www.shippingazette.com/news/9261000000019"),
            S("HighQ Logistics（引 The Loadstar 的货主影响分析）", "https://www.highqlogistics.com/posts/suez-canal-return-2026-shippers"),
            S("Maritime News（运河收入与通行量数据）", "https://www.maritimenews.com/suez-canal/suez-canal-traffic-recovery-gains-momentum"),
        ],
        True,
    ),
    IT(
        "霍尔木兹袭击创冲突以来单周新高：9/28—10/5 至少 12 起油轮与气体船遇袭，VLCC TD3C 日租金冲上约 140 万美元",
        "Hormuz attacks hit a conflict-high week: at least 12 tanker and gas-carrier incidents Sept 28–Oct 5, with VLCC TD3C earnings near $1.4m a day",
        "多家海事安全与行业口径一致指向同一趋势：9 月 28 日至 10 月 5 日，UKMTO 在霍尔木兹海峡记录了至少 12 起（部分口径为 16 起）涉及油轮、LNG 与 LPG 船的遇袭报告，IMO 同期核实至少 10 起，为 2 月 28 日美以对伊朗军事行动以来单周最高；截至 10 月 8 日，IMO 累计核实至少 97 起商船遇袭、造成 24 名海员死亡。运价与人力成本同步失控：波罗的海交易所口径 TD3C（中东—中国）VLCC 日租金升至约 140 万美元，TD34（阿曼湾—中国）约 91.3 万美元，TD15（西非—中国）往返 TCE 约 76.3 万美元、TD22（美湾—中国）约 63.8 万美元；Poten & Partners 10 月 2 日《Tanker Opinion》称中东—亚洲 VLCC 日收益达 130 万美元，约为年初约 3 万美元的 43 倍，海运费占原油到岸成本的比例由 1 月的 3% 升至 27%。穿越海峡的油轮船长月薪被抬到 10 万美元、每次穿越另加 5 万美元奖金（常态月薪约 1.5 万美元），战争险保费达船值的 6%–10%（一艘 VLCC 进波斯湾可能高达 2,000 万美元）。Signal Ocean 数据显示，尽管风险飙升，全球逾 40% 的 VLCC 仍在波斯湾或距其数日航程内。需要并列标注的双方说法：伊朗革命卫队称海峡“处于伊朗军队控制之下”、战备持续加强；美方则称伊朗海上石油出口已被有效中和——两侧口径均未获独立核实。",
        "Maritime-security and industry sources converge: between Sept 28 and Oct 5, UKMTO logged at least 12 (some counts say 16) incidents involving tankers, LNG and LPG carriers in the Strait of Hormuz, with the IMO confirming at least 10 over the same window — the highest single-week tally since the US–Israeli military action against Iran began on Feb 28. As of Oct 8 the IMO had verified at least 97 attacks on merchant vessels, with 24 seafarers killed. Rates and crewing costs moved with it: Baltic Exchange data put TD3C (Middle East–China) VLCC earnings at about $1.4m a day and TD34 (Gulf of Oman–China) around $912,660, with TD15 (West Africa–China) round-trip TCE near $763,031 and TD22 (US Gulf–China) about $637,675. Poten & Partners’ Oct 2 Tanker Opinion put Middle East–Asia VLCC earnings at $1.3m a day, roughly 43 times January’s ~$30,000, lifting freight from 3% to 27% of the delivered cost of crude. Masters transiting Hormuz are being offered $100,000 a month plus a $50,000 bonus per transit against a normal ~$15,000, and war-risk premiums run at 6–10% of hull value — up to $20m for a VLCC entering the Gulf. Signal Ocean data shows that even so, more than 40% of the world’s VLCCs are in or within days of the Persian Gulf. Both sides’ claims should be recorded side by side: Iran’s IRGC says the strait is under the control of Iranian forces with defences strengthening, while Washington says Iranian seaborne oil exports have been effectively neutralised. Neither claim is independently verified.",
        [
            S("航运界（UKMTO / IMO / 波罗的海交易所口径）", "https://www.163.com/dy/article/L8QHLDU2051985LJ.html"),
            S("Green Worldwide（引 Reuters 的 12 起事故统计）", "https://www.greenworldwide.com/freight-market-update-week-41-2026"),
            S("Hamer Intelligence（UKMTO 10 月 5 日油轮遇袭）", "https://hamerintel.com/data/alerts/26144"),
            S("Squawk News（Poten & Partners 日租金测算）", "https://squawknews.com/news/458089-tanker-rates-hit-1-3m-a-day-as-9-shipping-stocks-double-in-2026"),
            S("财联社 / 央视新闻（UKMTO 年度警告计数与伊方表态）", "http://www.cailianpress.com/subject/11408"),
        ],
        True,
    ),
    IT(
        "运价分化加剧：SCFI 微涨 0.05% 结束两周连跌、欧地终结 13 周跌势，Drewry WCI 却续跌 2% 至 4,351 美元",
        "Rates diverge: SCFI inches up 0.05% to end a two-week slide and Europe/Med snap a 13-week losing run, while Drewry’s WCI falls another 2% to $4,351",
        "上海航运交易所 10 月 9 日数据：SCFI 综合指数报 3,664.11 点，较上期涨 1.81 点（+0.05%），结束此前连续两周下跌；分航线看，远东—欧洲 2,274 美元/TEU 周涨 3.4%、远东—地中海 3,002 美元/TEU 周涨 0.2%，两者同时终结连续 13 周下跌；远东—美西 7,584 美元/FEU 微涨 0.08%、远东—美东 10,524 美元/FEU 微跌 0.04%；CCFI 综合指数报 1,912.38 点，周跌 0.6%。同期 Drewry 世界集装箱运价指数（WCI）10 月 8 日报 4,351 美元/FEU，周跌 2%（上海—洛杉矶 7,624 美元跌 3%、上海—纽约 10,220 美元跌 2%），统计口径与 SCFI 不同、不可直接比较。区域内运价是另一番景象：Drewry 亚洲区域内指数在连涨六周创下疫情后新高后，于 10 月 9 日回落 1% 至 1,503 美元/FEU，但仍同比高出 209%，上海—杰贝阿里仍高达 8,662 美元。供给端：Drewry 统计第 42—46 周主要东西干线空班 34 班 / 计划 713 班（约 5%），其中一半集中在亚洲—北欧与地中海；上海与宁波平均等泊分别约 3 天与 2.5 天。业内提示国庆后单周数据参考意义有限，美线已近阶段高位、10 月下旬存在回调压力。",
        "Shanghai Shipping Exchange data for Oct 9: the SCFI composite stood at 3,664.11, up 1.81 points (+0.05%) to end two straight weekly declines. By lane, Far East–Europe rose 3.4% to $2,274/TEU and Far East–Mediterranean 0.2% to $3,002/TEU, both snapping 13 consecutive weekly falls; Far East–US West Coast edged up 0.08% to $7,584/FEU while Far East–US East Coast slipped 0.04% to $10,524/FEU. The CCFI composite was 1,912.38, down 0.6% on the week. Drewry’s World Container Index read $4,351/FEU on Oct 8, down 2% (Shanghai–Los Angeles $7,624, −3%; Shanghai–New York $10,220, −2%) — a different methodology that should not be compared number-for-number with the SCFI. Intra-Asia tells another story: Drewry’s intra-Asia index fell 1% to $1,503/FEU on Oct 9 after six straight weekly rises to a post-Covid high, yet remains 209% above a year earlier, with Shanghai–Jebel Ali still at $8,662. On supply, Drewry counts 34 blank sailings out of 713 planned on the main east–west trades in weeks 42–46 (about 5%), half of them on Asia–North Europe and the Mediterranean, with average waits of about three days in Shanghai and 2.5 in Ningbo. Industry sources caution that the first post-holiday week carries limited signal and that transpacific rates sit near a cyclical high with downside risk later in October.",
        [
            S("网易 / 领航国际（SCFI 分航线与 WCI 对照）", "https://dy.163.com/article/L9222CNS0556109M.html"),
            S("中财网 CFi（SCFI 连涨与 BDTI 联动）", "https://www.cfi.cn/p20261009002133.html"),
            S("Magellan Logistics（WCI、亚洲区域内指数与空班）", "https://www.magellanlogistics.com.au/freight-market-update-october-2026"),
            S("WFH SG（10 月 1—8 日市场综述）", "https://www.wfhsg.com/ocean-freight-market-update-october-2026.html"),
        ],
        True,
    ),
]

# ---------------- 热门议题 / Hot Topics ----------------
HOT_TOPICS = [
    IT(
        "班轮准班率跌至 49.9%：Sea-Intelligence 称创 2022 年 9 月以来最低，亚洲区域仅 32.3%、中国 23.9%",
        "Liner schedule reliability falls to 49.9% — Sea-Intelligence’s lowest since Sept 2022, with Asia at 32.3% and China at 23.9%",
        "Sea-Intelligence 全球班轮绩效（GLP）报告第 181 期（8 月数据，9 月 29 日发布）：全球准班率环比再降 5.9 个百分点至 49.9%，为 2022 年 9 月以来最低，且为连续第二个月下滑；晚到船平均延误环比增加 0.60 天至 6.81 天，为 2022 年 3 月以来最长，同比多 1.92 天。13 家主要船公司中马士基以 67.3% 居首、赫伯罗特 61.5%、MSC 55.2%、达飞 50.6%，万海 23.2% 垫底；8 月无一家船公司环比改善（ONE 跌幅最小 -3.5 个百分点，PIL 最大 -10.1 个百分点），同比亦全线恶化（12 家出现两位数降幅，PIL 同比 -31.1 个百分点）。联盟层面，Gemini 7—8 月合计 77.8% 最高、MSC 70.1%、海洋联盟 48.3%、Premier Alliance 43.2%。区域分化更极端：亚洲区域准班率 32.3%、中国仅 23.9%，上海与宁波当月尤其低。方法论边界必须说明：Xeneta 同期（9 月 17 日发布的 8 月记分卡）给出的全球准点率为 29%，与 Sea-Intelligence 的 49.9% 相差悬殊，两者口径不同，应“同一家机构跨月比较”而非跨机构对比；此外准班率统计的是“船是否按公布船期到港”，不等于空班计数（Drewry 10 月 2 日口径为第 41—45 周 710 班中 39 班空班，取消率约 5%）。",
        "Sea-Intelligence’s Global Liner Performance report issue 181 (August data, published Sept 29) puts global schedule reliability at 49.9%, down 5.9 percentage points month-on-month for a second consecutive decline and the lowest reading since September 2022. The average delay for late arrivals rose 0.60 days to 6.81 days, the worst since March 2022 and 1.92 days higher year on year. Among the top 13 carriers, Maersk led at 67.3%, followed by Hapag-Lloyd at 61.5%, MSC at 55.2% and CMA CGM at 50.6%, with Wan Hai last at 23.2%. No carrier improved month-on-month (ONE fell least at 3.5 points, PIL most at 10.1) and all 13 worsened year on year, twelve by double digits, with PIL down 31.1 points. By alliance, Gemini was highest over July–August at 77.8%, then MSC at 70.1%, Ocean Alliance at 48.3% and Premier Alliance at 43.2%. Regionally the split is starker: Asia at 32.3% and China at just 23.9%, with Shanghai and Ningbo particularly weak. The methodology caveat matters: Xeneta’s August scorecard (published Sept 17) put global on-time arrivals at 29% against Sea-Intelligence’s 49.9% — different methods, so compare within one provider across months, not between providers. Reliability also asks whether a vessel arrived on its published schedule; it is not a count of cancellations (Drewry’s Oct 2 tracker shows 39 blank sailings out of 710 planned in weeks 41–45, about 5%).",
        [
            S("World Ports Organization（Sea-Intelligence GLP 第 181 期）", "https://www.worldports.org/global-shipping-schedule-reliability-continues-to-plummet-in-august"),
            S("Phaata（GLP 181 船司与联盟分项）", "https://phaata.com/en/logistics-market/sea-intelligence-global-schedule-reliability-falls-to-lowest-level-since-2022-62432.html"),
            S("Green Worldwide（亚洲区域 32.3% / 中国 23.9%）", "https://www.greenworldwide.com/freight-market-update-week-41-2026"),
            S("CargoLinked（Xeneta 29% 口径与 Drewry 空班口径对比）", "https://cargolinked.com/guides/blank-sailings-and-void-sailings-explained"),
            S("中文供应链评论（对货主的安全库存含义）", "https://www.cpm-scm.com/supply-chain-review/article-1503-zh.html"),
        ],
        True,
    ),
    IT(
        "CBP 拟重构 2,500 美元以下进口规则：申报提前到“到港日或之前”、新增第 13 类邮件报关、全面加担保",
        "CBP proposes to rebuild the sub-$2,500 import regime: filing pulled forward to arrival, a new mail entry type 13, and bonds across the board",
        "美国海关与边境保护局（CBP）10 月 8 日在《联邦公报》发布《低价值货物》（Low-Value Shipments）拟议规则（第 91 卷第 194 期，文件号 2026-20650，卷宗 USCBP-2026-0298，RIN 1685-AA38），拟修订 19 CFR 第 113、128、141、143、145 部分，评论截止 12 月 7 日、尚未设定生效日。四项变化对供应链最直接：①申报时点由现行“到港后 15 天内”收紧为“到港日或之前”，且取消 Type 11 纸面申报选项、全面电子化；②新增“第 13 类非正式邮件报关”，要求提供发货人信息与包裹追踪号（S-10 条码），承运人须在内向舱单申报追踪号，到港 15 天未报关的邮件将被视为“自愿放弃”并可退回或销毁；③所有 Type 11 / Type 13 申报须提交基本进口与报关担保（单次或连续担保），违约赔偿金取货值与 1,000 美元孰高，限制/禁止类商品及酒类按货值三倍与 1,000 美元孰高；④收货人若非货物所有人或购买人（如货代、承运人、邮政运营商），须委托持牌报关行担任登记进口商。对卖家有一处利好：取消 HTSUS 第 99 章第三、四分章商品适用简易报关的 250 美元货值上限，使适用第 232 条等措施、价值不超过 2,500 美元的商品也可走简易报关（关税照征）。背景是 de minimis 免税已中止、Type 86 报关终止，货量正大量转入非正式报关通道；CBP 同时拟扩大“须正式报关”的适用情形，可按进口商、生产商、销售商或商品类别批量要求。",
        "On Oct 8 US Customs and Border Protection published a proposed rule on Low-Value Shipments in the Federal Register (Vol. 91 No. 194, FR Doc 2026-20650, docket USCBP-2026-0298, RIN 1685-AA38), amending 19 CFR parts 113, 128, 141, 143 and 145. Comments close Dec 7; no effective date has been set. Four changes bite hardest on supply chains. First, timing: entry must be filed on or before the date of importation instead of within 15 days after arrival, and Type 11 filings — currently allowed on paper — would have to be electronic. Second, a new informal mail entry type 13 requires shipper/sender identity and a package tracking number (S-10 barcode), with carriers submitting that number on the inward manifest; mail articles unentered after 15 days would be deemed voluntarily abandoned and may be destroyed or returned. Third, all Type 11 and Type 13 entries would need a basic importation and entry bond (single transaction or continuous), with liquidated damages the greater of merchandise value or $1,000, rising to three times value or $1,000 for restricted, prohibited or alcoholic goods. Fourth, where the consignee is not the owner or purchaser — a forwarder, carrier or postal operator — a licensed customs broker must act as importer of record. One provision helps: the $250 cap on informal entry for goods in HTSUS Chapter 99 subchapters III and IV would be removed, letting products valued up to $2,500 that carry Section 232 or similar duties use informal entry (the duty still applies). The context is that de minimis is suspended and Entry Type 86 has ended, pushing volume into the informal entry channel; CBP also proposes to widen the cases in which it can require formal entry by importer, manufacturer, seller or product category rather than shipment by shipment.",
        [
            S("Federal Register / govinfo（拟议规则原始文本）", "https://www.govinfo.gov/content/pkg/FR-2026-10-08/html/2026-20650.htm"),
            S("International Trade Today（条款逐条拆解）", "https://internationaltradetoday.com/article/2026/10/07/cbp-proposes-new-informal-entry-procedures-formalization-of-entry-type-13-2610070005"),
            S("EcomCrew（对跨境电商的操作影响）", "https://www.ecomcrew.com/cbp-wants-bonds-on-your-low-value-imports"),
            S("宁波市贸促会（中文条款要点与赔偿金口径）", "http://www.ccpitnb.org/art/2026/10/9/art_5590_639006.html"),
        ],
        True,
    ),
    IT(
        "FCC 26-50 于 10 月 13 日生效：设备授权由“整机审核”穿透到芯片，Covered List 实体的逻辑承载组件一律拒批",
        "FCC 26-50 takes effect Oct 13: equipment authorisation drills from the finished device down to the chip, denying any logic-bearing part from a Covered List entity",
        "美国联邦通信委员会《第三次报告与命令》（ET Docket 21-232，FCC 26-50，联邦公报文件号 2026-18535，91 FR 57798）于 2026 年 9 月 11 日刊登、10 月 13 日生效，关闭了 FCC 所称的“组件漏洞”（component part loophole）：若某设备因某 Covered List 实体制造整机而被禁止，那么该实体仅制造其中关键内部组件时，设备同样不再获得新的设备授权。规则只对“逻辑承载硬件组件”生效——即以数字技术产生或使用超过 9,000 次/秒时序脉冲、或以射频能量执行运算/存储/数据传输的物理部件，实际覆盖主芯片、处理器、Wi-Fi / 蓝牙 / 蜂窝模组、MCU、光模块与已贴装电路板；外壳、紧固件、电阻、线缆与普通电芯不在范围内，软件与固件本次明确排除（配套的进一步征询已于 9 月 21 日结束、尚未采纳，征询中还提出 HBOM / SBOM 披露与白牌管理）。三条边界：①规则是前瞻性的，已获授权的存量设备继续有效；②生效日在审的申请豁免，除非后续修改中更换逻辑承载组件；③对 Covered List 实体的任何修改或许可变更须走完整认证，供应商符合性声明（SDoC）通道关闭。同一命令还把线上平台的 FCC ID 展示义务排到 2027 年 3 月 1 日与 6 月 1 日，并按平台是否持有货权区分核验强度；二手设备与未达高销量门槛的第三方卖家获豁免。实务影响面覆盖所有需 FCC 认证的无线电子产品：路由器、智能家居、蓝牙设备、可穿戴、无人机、蜂窝产品、POS、对讲机、安防设备、工业 / 医疗 / 车载电子。",
        "The FCC’s Third Report and Order (ET Docket 21-232, FCC 26-50, FR Doc 2026-18535, published at 91 FR 57798 on Sept 11, 2026) takes effect Oct 13 and closes what the Commission calls the component part loophole: if a device would be barred because a Covered List entity built the whole product, it also cannot obtain new equipment authorisation when that entity made only a key internal component. The prohibition applies to “logic-bearing” hardware components — physical parts that generate or use timing pulses above 9,000 per second using digital techniques, or that use RF energy for computation, storage or data transfer — which in practice captures main chips, processors, Wi-Fi/Bluetooth/cellular modules, MCUs, optical transceivers and populated boards. Housings, fasteners, resistors, wiring and plain battery cells are outside scope, and software and firmware are explicitly excluded this time; the companion consultation, which closed on Sept 21, had floated including them along with HBOM/SBOM disclosure and white-labelling rules. Three boundaries matter: the rule is prospective, so existing authorisations remain valid; applications pending on the effective date are exempt unless later amended to change a logic-bearing component; and any modification or permissive change by a Covered List entity requires full certification, with the supplier’s declaration of conformity route closed. The same order schedules online-marketplace FCC ID display duties for March 1 and June 1, 2027, with verification depth varying by whether the platform holds title or inventory, and exempts used devices and third-party sellers below the high-volume threshold. The practical scope is every FCC-authorised wireless product: routers, smart-home devices, Bluetooth gear, wearables, drones, cellular products, POS terminals, two-way radios, security equipment, and industrial, medical and automotive electronics.",
        [
            S("Spilma（FCC 26-50 与 91 FR 57798 条款解析）", "https://www.spilma.com/en/actualites/fcc-covered-list-components"),
            S("Drone U（联邦公报文件号与生效日）", "https://www.thedroneu.com/blog/fcc-dji-autel-parts-ban-october-13"),
            S("江苏省贸促会（中文合规提示与受影响品类）", "https://www.ccpitjs.org/art/2026/10/8/art_279_82498.html"),
            S("美中报道（新规前后对比与品类清单）", "https://www.uschinews.com/static/content/JDHT/MGWX/2026-10-03/1556029314531725312.html"),
        ],
        True,
    ),
    IT(
        "英国拟对华电动车加征最高 45% 关税：现税率 10%，方案尚未批准，欧盟“欧洲制造”规则是主要推手",
        "UK weighs tariffs of up to 45% on Chinese EVs against a 10% baseline — not approved, with the EU’s “Made in Europe” rule the main driver",
        "据《泰晤士报》10 月 4—5 日报道，英国商业大臣乔纳森·雷诺兹（Jonathan Reynolds）已授权官员拟定对中国进口电动汽车加征关税的备选方案，幅度对标欧盟、最高 45%，理由是中国制造商“以受补贴的低价车涌入英国市场”；英国目前对中国电动车仅征收 10% 基础关税，欧盟自 2024 年起最高 45%、美国为 100%。双方口径必须并列：英国政府发言人向路透社表示“尚未对中国电动车加征额外关税”，并称最终是否加税按英国自身利益判断、而非自动跟随欧盟，官方同时强调正与产业界密切沟通。真正的外部推手是欧盟《工业加速法案》中的“欧洲制造”规则——该提案对经公共采购、拍卖或补贴渠道购买的产品设定本地含量与低碳门槛（公共采购的电动车须在欧盟组装、除电池外 70% 零部件须为欧盟制造），涉及钢铁、铝、水泥、电动车、电池、太阳能、风能、氢能与核能等行业；欧盟已警告若英国不提高对华汽车关税、英国车企可能被排除在该框架之外，而约六成英国汽车出口销往欧盟。代价同样明确：BYD、Jaecoo、奇瑞、Omoda、长安、吉利等中国品牌 9 月合计已占英国新电动车销量逾 20%，加税将推高终端售价、放缓英国电动化转型，并可能招致中方反制，捷豹路虎（JLR）等对华出口规模较大的英国企业首当其冲；支持方则主张加税可为日产等在英设厂的车企创造空间。",
        "The Times reported on Oct 4–5 that UK Business Secretary Jonathan Reynolds has authorised officials to draw up options for tariffs on Chinese imported electric vehicles, benchmarked on the EU’s level of up to 45%, on grounds that Chinese makers are dumping subsidised cars into the UK. Britain currently applies a 10% baseline tariff on Chinese EVs, against up to 45% in the EU since 2024 and 100% in the US. Both accounts should be recorded: a UK government spokesperson told Reuters that no additional tariff on Chinese EVs has been imposed, that any decision will be judged on UK interests rather than automatically following the EU, and that the government is engaging closely with industry. The real external driver is the Made in Europe strand of the EU’s Industrial Accelerator Act, which sets local-content and low-carbon thresholds for goods bought through public procurement, auctions or subsidies — public-procurement EVs must be assembled in the EU with 70% of parts excluding batteries EU-made — across steel, aluminium, cement, EVs, batteries, solar, wind, hydrogen and nuclear. Brussels has warned that UK carmakers could be excluded unless Britain raises its tariffs on Chinese cars, and about 60% of UK car exports go to the EU. The costs are equally clear: BYD, Jaecoo, Chery, Omoda, Changan and Geely together took more than 20% of UK new EV sales in September, so tariffs would raise retail prices, slow the UK’s EV transition and risk Chinese retaliation hitting China-exposed British firms such as Jaguar Land Rover; proponents argue tariffs would give room to UK-based producers such as Nissan.",
        [
            S("SBS 中文（引《泰晤士报》与《金融时报》）", "https://www.sbs.com.au/language/chinese/zh-hans/podcast-episode/uk-considers-following-eu-with-tariffs-of-up-to-45-on-chinese-evs/mutboz1oh"),
            S("山东财经网（综合《泰晤士报》10 月 5 日报道与欧盟施压逻辑）", "https://www.sdenews.cn/html/2026/10/06/527083.shtml"),
            S("sindonews / RCTI+（引 The Times 与路透社政府回应）", "https://www.rctiplus.com/news/detail/sindonews/5486787/siasat-inggris-hadang-ekspansi-mobil-listrik-china--siap-tiru-tarif-45-persen-eropa"),
        ],
        True,
    ),
]

# ---------------- 研究瞭望 / Research ----------------
RESEARCH = [
    IT(
        "Drewry 复盘“苏伊士悖论”：每箱位只省 43 美元，回摆靠航程而非成本；基准情形 2027 年 2 月恢复到八成",
        "Drewry unpacks the Suez paradox: only $43 saved per slot, transit time not cost drives the return, with 80% recovery by Feb 2027",
        "Drewry Maritime Research 10 月 8 日报告把“为什么要回摆”拆成可核验的账：24,000 TEU 船走苏伊士的往返航程为 21,878 海里 / 97 天，绕好望角为 29,711 海里 / 124 天，即少走 7,833 海里、省 27 天；估算运营成本由 1,800 万美元降至 1,700 万美元（约 -6%），折合每航次省约 100 万美元、每箱位仅 43 美元。这个数字小到不足以解释回摆，因此 Drewry 把动因归到三处：更短航程带来的船舶周转与利用率、航期可靠性，以及“对手用了更短航期、你不用就吃亏”的竞争压力。反方向的成本同样被量化：战争险按船值 2.25 亿美元计，0.3% 费率两次穿越加 135 万美元、1% 加 450 万美元；运河费 15% 折扣两程省约 36.5 万美元、25% 折扣省约 60 万美元——折扣远不足以对冲战争险，且上述测算未含 SCA 的酌情折扣。基于此 Drewry 更新基准情形：自 2026 年 7—8 月起渐进恢复，2027 年 2 月苏伊士集装箱通行量达到绕行前水平的 80%，并在此后维持在该水平附近（承运人保留绕行选项）。运力侧的判断更值得注意：BIMCO 预测 2027 年船队运力增长 9%，若全面回归苏伊士航线，船舶需求可能比可用运力低约 10%——即回摆本身会加剧运价下行压力。Drewry 同时提示，胡塞武装在也门红海沿岸的底层威胁并未消失，一次成功袭击即可造成人员伤亡、货损、船舶长时间停租与声誉损失，当前回摆应视为“谨慎的运营调整”而非安全形势正常化的证据。",
        "Drewry Maritime Research’s Oct 8 report turns “why return?” into checkable arithmetic: a 24,000 TEU ship sailing via Suez covers 21,878 nautical miles in 97 days versus 29,711 nautical miles in 124 days via the Cape — 7,833 nautical miles and 27 days less. Estimated operating costs fall from $18m to $17m per round voyage (about −6%), or roughly $1m a voyage, which is only $43 per container slot. That is too small to explain the shift, so Drewry attributes it to three things: vessel turnaround and utilisation from shorter voyages, schedule reliability, and competitive pressure when a rival offers shorter transit at comparable rates. The offsetting costs are quantified too: on a $225m hull, a 0.3% war-risk premium adds $1.35m for two transits and 1% adds $4.5m, while canal discounts save about $365,000 at 15% and $600,000 at 25% across two transits — nowhere near enough to offset insurance, and the calculation excludes discretionary Suez Canal Authority discounts. On that basis Drewry updates its base case: a gradual recovery from July–August 2026 with Suez container transits reaching 80% of pre-diversion levels by February 2027 and holding around that level thereafter, as carriers retain the Cape option. The capacity side matters more: BIMCO forecasts fleet capacity growth of 9% in 2027 and estimates that a full return to Suez could leave vessel demand about 10% below available capacity — meaning the return itself adds downward pressure on rates. Drewry also warns that the underlying Houthi threat along Yemen’s Red Sea coast has not disappeared: a successful attack could bring casualties, cargo loss, prolonged off-hire and reputational damage, so the current return is a cautious operational adjustment rather than evidence that the Red Sea is secure.",
        [
            S("Breakbulk News（Drewry 10 月 8 日报告全文要点）", "https://breakbulk.news/container-lines-return-to-suez-despite-43-per-slot-saving-as-drewry-warns-of-red-sea-risks"),
            S("Maritime News（Drewry 通行量恢复预测）", "https://www.maritimenews.com/suez-canal/suez-canal-traffic-recovery-gains-momentum"),
            S("Magellan Logistics（BIMCO 2027 运力增长与供需缺口）", "https://www.magellanlogistics.com.au/freight-market-update-october-2026"),
            S("WFH SG（航程与运力背景数据）", "https://www.wfhsg.com/ocean-freight-market-update-october-2026.html"),
        ],
        True,
    ),
    IT(
        "Gartner：63% 采购高管预期 AI 显著提效，但仅 25% 做过岗位重设计——“岗位混乱”风险被点名",
        "Gartner: 63% of procurement leaders expect AI to lift performance, but only 25% have redesigned roles — “job chaos” flagged",
        "Gartner 10 月 8 日发布的两项调查结论直指采购职能的组织缺口：63% 的高级采购负责人预期 AI 将在未来三年显著改善采购绩效，但只有 25% 已因 AI 实施而实际开展岗位与职责重设计。Gartner 供应链实践高级总监分析师 Fareen Mehrzai 的判断是“职能层面的 AI 落地本质上是一场岗位重设计挑战”：AI 正在掏空标准化、中等技能的工作，同时重塑职责、流程与所需技能；若不及早重设计，组织将面临人才错配、士气下降与竞争力削弱——Gartner 称之为“job chaos”（岗位混乱）。数据来自两项 2026 年 4 月完成的调查：2026 年 Gartner 首席采购官调查（213 名高级采购负责人）与 2026 年 Gartner C-Suite AI 调查（1,303 名跨职能部门受访者，其中 134 名采购负责人）。Gartner 给出三条动作：与员工一起审计岗位、划分哪些职责留给人、哪些交给 AI；系统性建设 AI 难以替代的人类能力（创造力、影响力、敏捷性、伦理判断）；建立“劳动力沙箱”让员工安全地测试 AI 工具与流程，并把失败实验视作发展的一部分，且强调重设计不是一次性动作。与之呼应的市场预测同样来自 Gartner：带 Agentic AI 能力的 SCM 软件支出将从 2025 年不足 20 亿美元增至 2030 年 530 亿美元，采用这些功能的企业比例由 5% 升至 60%；Gartner 同时提醒企业侧部署会滞后于厂商供给，瓶颈在数据管理、运营管理、劳动力准备度与网络化程度，而非算法。另一组可作对照的独立数据（McKinsey 对分销运营的复盘）：库存可降 20%–30%、物流成本可降 5%–20%、采购支出可降 5%–15%，但受访分销商中不足十分之一有明确优先级路线图、仅约三成具备把试点推过首次部署的内部人才。",
        "Gartner’s Oct 8 release points at an organisational gap in procurement: 63% of senior procurement leaders expect AI to significantly improve procurement performance over the next three years, yet only 25% have undertaken job and role redesign as a direct result of AI implementation. Fareen Mehrzai, Senior Director Analyst in Gartner’s Supply Chain practice, argues that successful AI implementation at the functional level is fundamentally a role redesign challenge: AI is hollowing out standardised, middle-skilled work while reshaping responsibilities, workflows and required skills, and organisations that delay risk talent mismatches, lower morale and weaker competitiveness — what Gartner calls job chaos. The findings come from two surveys concluded in April 2026: the 2026 Gartner Chief Procurement Officer Survey (213 senior procurement leaders) and the 2026 Gartner C-Suite AI Survey (1,303 respondents across functions, including 134 procurement leaders). Gartner’s three actions: audit roles with employees and decide which responsibilities stay human and which shift to AI; build enduring human capabilities AI cannot readily replicate — creativity, influence, agility, ethical judgment; and create a workforce sandbox where employees can safely test AI tools and workflows, treating failed experiments as part of development, with redesign framed as continuous rather than one-off. The market forecast is from the same house: spending on SCM software with agentic AI capabilities grows from under $2bn in 2025 to $53bn by 2030, with adoption by enterprises using SCM software rising from 5% to 60%. Gartner also expects enterprise deployment to lag what vendors can already offer, because data management, operations management, workforce readiness and network-centricity have to catch up first — the constraint is not the algorithm. A useful independent counterpoint comes from McKinsey’s review of distribution operations: inventory reductions of 20–30%, logistics cost reductions of 5–20% and procurement spend reductions of 5–15% are achievable, but fewer than one in ten distributors surveyed have a road map prioritising which use case to pursue first and only about three in ten say they have the internal talent to take a pilot past its first deployment.",
        [
            S("Gartner 官方新闻稿（2026-10-08 调查结论）", "https://gtnr.it/4j73Pml"),
            S("Innover Digital（Gartner 2026 供应链技术趋势与 Agentic AI 支出预测）", "https://www.innoverdigital.com/physical-ai-in-supply-chains-how-agentic-ai-is-driving-autonomous-operations"),
            S("The Center for Global Enterprise（McKinsey 收益区间与落地率对照）", "https://www.thecge.net/managing-ai-supply-chains-same-technology-different-outcomes"),
        ],
        True,
    ),
    IT(
        "WorldACD：9 月全球空运吨量同比 +9%、运价同比 +25%，但运力同比仅 +4%、海湾方向较冲突前仍低 17%",
        "WorldACD: September air cargo tonnages +9% YoY and rates +25%, yet capacity is only +4% and Gulf capacity stays 17% below pre-conflict",
        "WorldACD Market Data 9 月数据给出“量价齐升但运力没跟上”的组合：全球计费吨量环比 +3%、同比 +9%，各主要始发区域全线增长——亚太与北美各 +10%、中东及南亚（MESA）+9%、欧洲与非洲各 +8%、中南美 +5%。运价端，9 月全球平均全市场运价环比 +1%、同比 +25%；第 39 周（9 月 21—27 日）全球平均运价环比 +2%、同比 +27%，亚太始发至美国同比 +38%、至欧洲 +25%；中东及南亚始发运价同比 +52%，为各区域最高。运力是瓶颈：截至 9 月底第 40 周全球运力同比约 +4%（货机 +7%、客机腹舱 +2%），但与 2 月底美伊冲突前相比，全球仅 +2%、MESA 方向约 -10%、海湾方向约 -17%，南亚基本持平（-1%）。结构上还有一条被低估的分化：自 7 月 1 日欧盟取消低值进口免税以来，中国（尤其香港与华南）至欧洲的电商货量显著下滑，第 39 周亚太始发至欧洲吨量同比 -8%，而亚太始发至美国同比 +14%——货流正在向北美集中。Q3 整体：吨量环比 +3%、同比 +6%，平均运价环比 -7%（基数极高）、同比 +24%。1—9 月累计吨量同比 +5%、平均运价同比 +22%。合约侧也在变短：据 Xeneta 数据（经物流周报引述），2026 年三季度新签空运合约中三个月期短约占 60%（二季度为 47%），十二个月期长约占比由 40% 降至 25%。",
        "WorldACD Market Data’s September figures show volumes and rates rising together while capacity lags: global chargeable weight rose 3% month-on-month and 9% year-on-year, with growth across every main origin region — Asia Pacific and North America at +10% each, Middle East & South Asia (MESA) +9%, Europe and Africa +8% each, and Central & South America +5%. On rates, average worldwide full-market rates were up 1% month-on-month and 25% year-on-year in September; in week 39 (Sept 21–27) global average rates rose 2% week-on-week and 27% year-on-year, with Asia Pacific origins to the US up 38% and to Europe up 25%, while MESA-origin rates were the most inflated at +52%. Capacity is the binding constraint: by week 40 global capacity was about 4% higher year on year (freighter +7%, bellyhold +2%), but against late February before the US–Iran conflict global capacity is only about 2% up, with MESA down around 10% and Gulf capacity down about 17%, while South Asia is roughly flat at −1%. One structural split is underappreciated: since the EU removed its de minimis exemption on 1 July, e-commerce volumes from China — especially Hong Kong and southern China — to Europe have fallen sharply, with Asia Pacific–Europe tonnages down 8% year-on-year in week 39 while Asia Pacific–US was up 14%; flows are concentrating on North America. For Q3 overall, tonnages rose 3% versus Q2 and 6% year on year, while average rates fell 7% quarter-on-quarter from an elevated base but were still 24% higher year on year. January–September: tonnages +5% and average rates +22% year on year. Contracting is also shortening: per Xeneta data cited in a logistics weekly, roughly 60% of new air cargo contracts signed in Q3 2026 were three-month deals (47% in Q2), while twelve-month agreements fell from 40% to 25%.",
        [
            S("Asian Aviation（WorldACD 9 月吨量与运价）", "https://asianaviation.com/posts/worldacd-asia-and-north-america-drive-9-yoy-air-cargo-tonnage-growth-in-september"),
            S("CargoTalk GCC（MESA 吨量与 +52% 运价）", "https://www.cargotalkgcc.com/post/mesa-air-cargo-tonnage-climbs-9"),
            S("民航信息每日汇编（WorldACD 第 39 周周度数据）", "https://www.toutiao.com/a7694680319462474274"),
            S("箱策云（Xeneta 合约短期化与航线运价）", "https://www.toutiao.com/article/7694841563695890959/"),
        ],
        True,
    ),
]

# ---------------- 应用风向 / Apps & Adoption ----------------
APPS = [
    IT(
        "时尚退货进真仓：Sereact 双臂机器人在德国 Greven 与波兰 Świebodzin 上线，Cortex 主打“没见过的商品”",
        "Fashion returns go live: Sereact’s dual-arm robots start at Greven and Świebodzin, with Cortex built for items it has never seen",
        "10 月 7 日，Sereact、Zalando 与 CEVA Logistics 宣布 AI 驱动的自动化退货处理在德国 Greven 与波兰 Świebodzin 两个履约中心进入实际运营——由 Sereact 的 Physical AI 平台 Cortex 驱动的双臂机器人自主抓取、识别与分拣退回的时尚商品，官方称无需逐 SKU 训练或预设商品库。以 RaaS（机器人即服务）模式交付，被定义为三方在欧洲规模化退货自动化的首个运营里程碑；Zalando 已于 7 月作为战略投资方加入 Sereact 的 B 轮，使该轮总额达 1.16 亿美元，公司口径称 Cortex 已在欧洲运行 200 余套系统、累计逾 10 亿次生产拣选。技术上值得注意的一点是双臂协同：一只臂固定或稳定包裹，另一只完成开箱、扫码定位或折叠，Cortex 被描述为视觉—语言—动作模型，还要能区分包装物与垃圾（CEO Ralf Gulde 举例“退回来最离奇的东西是一袋土豆”）；公司称其数据来自真实车间而非实验室，从单臂仓内拣放起步、覆盖从食品杂货到金属件，再延伸到汽车配套与退货处理。人力侧口径是：机器人承接高重复动作、降低体力负荷，员工转向工位监督、异常处理与质检。但必须如实标出证据边界：发布方与合作伙伴均未披露机器人台数、单位小时吞吐、错误率或相对人工基线的单件成本改善，产能与“技能升级”表述属合作方自述、尚无独立测算；Zalando 另有 Erfurt 物流中心的关闭计划（涉及逾 3,000 人），德媒报道未将其与自动化挂钩。",
        "On Oct 7 Sereact, Zalando and CEVA Logistics said AI-powered automated returns processing had entered live operations at two fulfilment facilities — Greven in Germany and Świebodzin in Poland — with dual-arm robots running Sereact’s physical AI platform Cortex autonomously grasping, identifying and sorting returned fashion items. The companies say the system handles previously unseen objects without article-specific training or predetermined SKU sets. Delivered under a robotics-as-a-service model, it is framed as the first operational milestone of a broader European returns-automation programme; Zalando joined Sereact’s Series B as a strategic investor in July, taking the round to $116m, and the company reports more than 200 Cortex systems running in Europe with over one billion production picks. Technically the dual-arm coordination is the point: one arm holds or stabilises the parcel while the other opens it, positions an item for scanning or folds it. Cortex is described as a vision-language-action model that must also distinguish packaging from waste — CEO Ralf Gulde cites a bag of potatoes as the strangest item returned — and the company says its data comes from the shop floor rather than the lab, starting with single-arm warehouse pick-and-place across groceries to metal parts before extending to automotive kitting and returns. On labour, the framing is that robots take highly repetitive handling to cut physical strain while staff move to station supervision, exception management and quality control. The evidence boundary should be stated plainly: neither the release nor partner summaries disclose robot counts, units per hour, error rates or cost-per-return versus the manual baseline, and both throughput and upskilling claims are company-reported with no independent measurement. Separately, Zalando had planned to close its Erfurt logistics centre by September, affecting more than 3,000 workers per the works council — a report that did not link the closure to automation.",
        [
            S("Automated Warehouse（含 CEO 原始专访引述）", "https://www.automatedwarehouseonline.com/ceva-logistics-deploys-sereact-robots-zalando-returns-europe"),
            S("RobotsBeat（双臂技术架构与证据边界）", "https://robotsbeat.com/zalando-sereact-ceva-robots-fashion-returns"),
            S("The Next Web（独立背景与 Erfurt 关闭）", "https://thenextweb.com/news/sereact-zalando-ceva-robots-fashion-returns-germany-poland"),
            S("GlobeNewswire / Yahoo Finance（官方发布原文）", "https://finance.yahoo.com/technology/ai/articles/sereact-zalando-ceva-logistics-start-060000572.html"),
        ],
        True,
    ),
    IT(
        "中国铁路 10 月 10 日启用新货物列车运行图：城际班列 151 列、多式联运 237 列、大宗直达 423 列，中欧班列图定线路 96 条",
        "China’s railways switch to a new freight timetable on Oct 10: 151 intercity, 237 intermodal and 423 bulk direct trains, with 96 China–Europe scheduled lines",
        "据中国国家铁路集团消息，全国铁路自 10 月 10 日 18 时起实行新的货物列车运行图，中国铁路物流产品体系进一步优化：城际班列安排最高时速 160 公里特快 8 列、120 公里快速 58 列、80 公里普快 85 列，服务城市群间电商、快递与民生物资的快速集散；多式联运班列安排 120 公里快速 101 列、80 公里普快 136 列，继续开行京津冀、长三角、粤港澳大湾区、成渝等主要经济区域间的快捷物流示范班列并实行网上公开订舱，同时增开西安国际港至芜湖东、黄塘至乔司、赣州国际港至苏州西等方向快速多式联运 14 列，以及保定至黄岛、集宁至南仓、大保当至曹妃甸等方向普快多式联运 17 列，并动态优化西部陆海新通道海铁联运班列开行方案；大宗货物直达安排跨铁路局集团公司列车 423 列，对电煤、粮食、春耕化肥等国计民生重点物资实行运力倾斜、优先保障；中欧中亚班列安排中欧班列图定线路 96 条，重点优化回程线路，新增经阿拉山口口岸入境至陕西榆林、经二连口岸入境至山东济南 2 条回程线路。通道侧同步给出量化进展：据中国铁路南宁局集团，截至 10 月 6 日 2026 年西部陆海新通道铁海联运班列集装箱运输量突破 100 万标箱，其中重庆发往钦州港下水货物班列 12 万标箱、同比 +31.7%（汽车配件、工程机械、轮胎等工业品外运量增幅达 95%），钦州港上水发往重庆的工业原料班列 5.3 万标箱、同比 +28.7%（石英砂、锂辉石、锌精矿等工矿原料运量同比激增近 3 倍）；四季度调图后该通道图定班列运行线增至 54 条，新增 2 条固定班列线路，钦防铁路、钦港铁路增建二线工程进入收尾阶段。",
        "China State Railway Group said the national railway switched to a new freight train timetable from 18:00 on Oct 10, further optimising its rail logistics product system. Intercity trains: 8 express services at up to 160 km/h, 58 fast services at 120 km/h and 85 regular services at 80 km/h, moving e-commerce, express and household goods between city clusters on fixed schedules. Intermodal container trains: 101 fast services at 120 km/h and 136 regular services at 80 km/h, continuing demonstration services between the Beijing–Tianjin–Hebei region, the Yangtze River Delta, the Guangdong–Hong Kong–Macao Greater Bay Area and the Chengdu–Chongqing region with online public booking; 14 new fast intermodal services (Xi’an International Port–Wuhu East, Huangtang–Qiaosi, Ganzhou International Port–Suzhou West and others) and 17 new regular intermodal services (Baoding–Huangdao, Jining–Nancang, Dabaodang–Caofeidian and others), with the rail–sea intermodal plan for the New International Land-Sea Trade Corridor adjusted dynamically. Bulk direct trains: 423 cross-administration services, with capacity prioritised for thermal coal, grain and spring-ploughing fertiliser. For China–Europe and Central Asia services, 96 scheduled China–Europe lines are planned with inbound return routes optimised, adding two new return lines via Alashankou to Yulin in Shaanxi and via Erenhot to Jinan in Shandong. The corridor side provides quantified progress: China Railway Nanning Group said that as of Oct 6, 2026, container volume on the New International Land-Sea Trade Corridor’s rail–sea intermodal trains passed 1m TEU, with 120,000 TEU of Chongqing-to-Qinzhou seaborne cargo trains (+31.7% year on year; outbound industrial goods such as auto parts, construction machinery and tyres up 95%) and 53,000 TEU of Qinzhou-to-Chongqing industrial raw-material trains (+28.7%, with quartz sand, spodumene and zinc concentrate volumes up nearly threefold). After the Q4 timetable change the corridor’s scheduled lines rise to 54 with two new fixed services, and the second-track projects on the Qinzhou–Fangchenggang and Qinzhou–Port railways are in their final stage.",
        [
            S("人民日报（全国铁路新货物列车运行图）", "https://www.toutiao.com/article/7694874091681776162/"),
            S("新华社 / 人民网（西部陆海新通道破 100 万标箱）", "https://finance.people.com.cn/BIG5/n1/2026/1006/c1004-40809953.html"),
        ],
        True,
    ),
    IT(
        "中国自动化码头 60 座：自动化集装箱码头 30 座占全球 27%，单机效率超 60 自然箱/小时，国际集装箱船平均在港 1.7 天",
        "China has 60 automated terminals: 30 automated container berths, 27% of the global total, with crane rates above 60 boxes/hour and 1.7-day average port time",
        "据《人民日报》10 月 8 日报道，全国已建成投运自动化码头 60 座，其中自动化集装箱码头 30 座、占全球总量 27%；上海港与山东青岛港自动化码头最快单机作业效率超过每小时 60 个自然箱，沿海主要港口国际集装箱船舶平均在港时间 1.7 天。国庆假期的实测数据给出产能侧佐证：10 月 1—3 日上海国际航运中心洋山深水港四期自动化码头累计作业超 7.9 万标准箱、同比增长 18.7%，预计 7 天假期累计超 18 万标准箱；广西钦州港自动化集装箱码头保持 24 小时连续作业，10 月 1—7 日吞吐量预计达 4.5 万标准箱；大连集装箱码头承担东北地区 98% 以上的外贸集装箱运输量，今年新开通 5 条外贸航线，海洋联盟欧洲航线“东方瑞典”轮在不到 20 小时的停靠窗口内完成近 4,900 标准箱装卸，假期总装卸量预计同比增长约 20%。宏观面上，今年前 8 个月我国货物贸易进出口总值同比增长 17.6%，完成港口货物吞吐量 120.6 亿吨、其中外贸吞吐量同比增长 2.8%。在建项目仍在加码：上海港第三座自动化码头（小洋山北作业区）5 台自动化岸桥已全部到位，将迭代升级上港自主研发的新一代自动化码头智慧运营管理系统；钦州港同步建设 5 个 5,000 吨级江海联运自动化集装箱泊位，平陆运河江船可与海船并靠、实现“水水中转、直卸直装”。需要提示的口径边界：60 座为“已建成投运”的累计口径，其中自动化集装箱码头 30 座 / 占全球 27% 与 2025 年公开发布的口径一致，跨年度比较时应避免把累计数误读为年度增量。",
        "The People’s Daily reported on Oct 8 that China has 60 automated terminals in operation, including 30 automated container terminals — 27% of the global total. The fastest single-crane rates at Shanghai Port and Qingdao Port exceed 60 boxes per hour, and the average time in port for international container ships at major coastal ports is 1.7 days. National Day holiday volumes provide capacity-side evidence: from Oct 1–3 the automated Phase IV terminal at Yangshan Deep-Water Port handled more than 79,000 TEU, up 18.7% year on year, with over 180,000 TEU expected across the seven days; Qinzhou Port’s automated container terminal in Guangxi ran 24 hours a day with about 45,000 TEU expected over Oct 1–7; and Dalian Container Terminal, which handles over 98% of Northeast China’s foreign-trade containers and added five new international services this year, completed nearly 4,900 TEU within a sub-20-hour window for the Ocean Alliance vessel Orient Sweden, with holiday throughput expected to rise about 20%. At the macro level, goods trade rose 17.6% year on year in the first eight months, with port cargo throughput of 12.06bn tonnes including foreign-trade throughput up 2.8%. Projects under construction continue: five automated quay cranes are in place at Shanghai Port’s third automated terminal in the North Yangshan area, which will upgrade the operator’s in-house automated terminal management system, while Qinzhou is building five 5,000-tonne river–sea automated container berths where river vessels from the Pinglu Canal can berth alongside sea-going ships for direct water-to-water transfer without landing or warehousing. One caveat on the counting: 60 is a cumulative built-and-operating figure, and the 30 automated container terminals at 27% of the global total matches the formulation published in 2025, so the cumulative count should not be read as annual growth.",
        [
            S("人民网财经 / 人民日报（自动化码头 60 座与国庆作业数据）", "https://finance.people.com.cn/BIG5/n1/2026/1008/c1004-40810277.html"),
            S("奋斗杂志社（自动化集装箱码头与单机效率口径）", "https://fdz.fendoui.org.cn/detailArticle/28632595_71601_fdzzs.html"),
        ],
        True,
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
