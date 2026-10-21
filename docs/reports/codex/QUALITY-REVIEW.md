# 质量复核与迭代 / Quality review and iteration

Review date: 2026-10-19.

本记录采用事先明确的八项维度，对个人学习型、可追溯的双语行业报告做作者自评。分数是内部编辑与实现验收判断，不是独立审计、用户测试或客观质量认证。目标是加权综合分超过9/10；未以删除数据覆盖维度、填补缺数或提高评分来绕过问题。

These are author-assigned editorial and implementation scores, not an independent audit, user study or quality certification. The target is a weighted overall score above 9/10. Evidence gaps remain visible and the coverage dimension remains in the total.

## 评分依据 / Scoring rubric

- 来源与可追溯性（20%）：8.0 → 9.3。统计值保留来源、性质和公式；新增关键文档抽查说明，来源链接具备机构、标题和日期提示。未声称所有来源均重新核验。
- 数据覆盖与边界（10%）：7.0 → 7.5。Q3全季证据、月度证据和待披露状态分开；缺少周转及区域分布的指标仍留空。有限的覆盖度仍是主要扣分。
- 分析结构与可执行性（15%）：6.8 → 9.1。八个市场／窗口组合分别提供三条阅读提要，逐条区分事实、分析判断与后续观察，保留引用。
- 时间与指标口径（15%）：8.7 → 9.5。默认H1；Q3为阶段性观察；完整同口径数据才比较Q2—Q3。CSV补齐历史窗口起止日期，并分别标识公司案例、子期间和跨期背景。
- UI层级与双语阅读（15%）：6.9 → 9.3。缩小重复标题、提前关键指标、压缩筛选条，来源目录渐进展开；双语主次清楚，保留完整语言模式。
- 图表与证据表达（10%）：7.7 → 9.2。八产业速览列明各自指标、单位、范围；不作跨产业排名。取消零值条形的最小可见宽度；缺数不插值。
- 移动端与基础可访问性（10%）：7.4 → 9.2。检查360／390像素布局、键盘跳转、控件名称、语言状态及减少动效。该项不是WCAG全量认证。
- 验证与交付（5%）：8.0 → 9.4。离线192种组合与浏览器24种组合，覆盖公式、导出、来源、语义、交互及打印控件。未把打印控件通过写成PDF逐页验收。

加权结果：7.570 → 9.105，按一位小数呈现为 **7.6 → 9.1 / 10**。各项分数为自评，权重和残余限制均在此公开。

Weighted result: 7.570 → 9.105, displayed as **7.6 → 9.1 / 10**. Individual scores are self-assessments, with weights and residual limits disclosed here.

## 两轮迭代 / Two review passes

第一轮：补阅读提要与证据速览；明确企业／分部案例和投资、存量口径；重设标题、间距和控件；将长来源目录折叠；补CSV日期范围及案例范围列；检查翻译并修复half-year拼写。

第二轮：视觉检查发现指标速览需补具体名称、关键指标应早于时间说明、手机导出按钮偏长；随后补齐这些内容。浏览器检查发现窄屏媒体规则使打印控件重新出现；增加打印规则后复验通过。保留缺数及版本日期。

Pass 1 added evidence–interpretation–watchpoint briefs, an evidence map, explicit source scopes, a clearer visual hierarchy, progressive source disclosure, and CSV date/scope metadata. Pass 2 corrected metric labels, reading order and compact mobile controls, and fixed a print-control regression caused by narrow-screen CSS.

## 关键文档抽查 / Key-document spot checks

2026-10-19核对以下七项文档的对应正文／表格，不将同一上游统计的多个报道视为独立样本。原H1核验日期2026-09-06和Q3新增证据日期2026-10-18均保留；本次抽查不是60项来源的全面重审。

Seven documents were checked against their bodies/tables on 2026-10-19. Repeated reporting of the same underlying statistics does not create independent samples. The original edition dates remain; these checks are not a full re-audit of 60 sources.

- C1：[新华社H1物流运行分析](https://www.news.cn/20260729/7e743f86fb3149398ffef3aa0e0a35b1/c.html)：总额、同比与季度节奏。
- C2：[新华社H1物流总量与运输业务](https://www.xinhuanet.com/20260729/55c1c5f8d804489aa263e22c4816e7d7/c.html)：收入、费用/GDP及业务量。
- A6：[IATA June 2026 analysis](https://www.iata.org/en/iata-repository/publications/economic-reports/air-cargo-market-analysis-june-2026/)：第一页总市场表的H1 YTD列，区分月同比；不采用载运率变动正文／表格歧义项。
- D1：[工信部H1数字产业运行](https://www.miit.gov.cn/xwfb/gxdt/sjdt/art/2026/art_cc4b160e38094e8cbf2131dc322a9d43.html)：FP16算力为存量；上架率不是GPU利用率。
- GE1：[GE Vernova Q2 SEC release](https://www.sec.gov/Archives/edgar/data/1996810/000199681026000147/gevpressrelease2q26.htm)：Electrification分部收入、期间与报告增速，区分有机口径。
- QV9：[工信部9月汽车运行](https://www.miit.gov.cn/gxsj/tjfx/zbgy/qc/art/2026/art_8a878aeeb8a34a5b88975c5bbe94f7bf.html)：前三季度新能源汽车出口累计，作为Q3流量差分的一项输入。
- QT3：[Tesla Q3 operating release](https://ir.tesla.com/press-release/tesla-third-quarter-2026-production-deliveries-and-deployments)：季度储能部署；财务结果的计划披露不作为实际盈利。

## 验收与残余限制 / Acceptance and remaining limits

- 192种离线组合：来源引用、数值、日期映射、公式、缺数、案例范围与CSV生成。
- 24种浏览器组合：两个市场、四个窗口、三种语言；八项经营诊断切换保留。
- 核验H1默认入口、Q3跳转与完整季度比较条件；检查提要、来源目录、键盘跳转、控件可识别名称、手机横向溢出与打印控件。
- 原始统计修订、季度披露滞后和企业案例的代表性仍影响报告；本版不填补未取得的周转天数、同口径利润及区域CR3。
- 未开展独立统计审计、外部读者可用性研究、全量WCAG测试或PDF逐页版式审阅。不能将本次9.1自评分理解为这些工作已完成。

No independent statistical audit, external reader study, full WCAG evaluation or page-by-page PDF review was performed. The 9.1 author score does not imply otherwise.
