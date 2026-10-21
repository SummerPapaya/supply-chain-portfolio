// Editorial layer: evidence, interpretation and monitoring remain distinct.
// No new industry observations are inferred by this presentation layer.
const spotCheckedSources=['C1','C2','A6','D1','GE1','QV9','QT3'];
function periodBounds(row){
  if(row.start&&row.end)return [row.start,row.end];
  const windows={Q1:['2026-01-01','2026-03-31'],Q2:['2026-04-01','2026-06-30'],H1:['2026-01-01','2026-06-30'],Q3:['2026-07-01','2026-09-30']};
  if(windows[row.period])return windows[row.period];
  if(/^2026-\d{2}-\d{2}$/.test(row.period))return [row.period,row.period];
  if(/^2026-\d{2}$/.test(row.period)){const month=Number(row.period.slice(5));return [row.period+'-01',row.period+'-'+new Date(2026,month,0).getDate()];}
  return ['',''];
}
function recordScope(row){return (row.inputs||[row.source]).some(id=>/^(MC[12]|GE1|TS[12]|AS[12]|L1|M1|QT3|QTCHECK)$/.test(id))?'company-or-segment-case':'industry-or-regional-statistic';}
const briefs={
  cn:{
    H1:[
      [pair('需求扩张，季度节奏放缓','Demand expands; the quarterly pace eases'),pair('H1社会物流同比5.1%；Q1为6.2%，Q2为4.4%。','H1 social logistics grew 5.1% YoY; Q1 was 6.2%, Q2 4.4%.'),pair('配置运力时区分持续订单与前置备货。','Distinguish recurring orders from early stocking when allocating capacity.'),pair('客户订单、分行业出货与仓配负荷','Customer orders, sector shipments and fulfillment loads'),['C1']],
      [pair('成本改善，不能直接推导利润','Macro cost improvement does not establish profit'),pair('H1物流费用/GDP为13.9%；物流收入为7.2万亿元。','H1 logistics costs/GDP were 13.9%; logistics revenue was CNY 7.2tn.'),pair('宏观费用率与企业毛利的分母不同，需独立判断。','Macro cost ratios and company margins have different denominators.'),pair('单票贡献、应收回款与库存天数','Contribution per shipment, collections and inventory days'),['C2']],
      [pair('设备扩张与经营兑现分开看','Separate equipment expansion from operating returns'),pair('6月底智能算力2185 EFLOPS（FP16）。','June-end intelligent computing capacity was 2,185 EFLOPS (FP16).'),pair('这是存量规模；不能据此推断设备利用率或投资回报。','This is a capacity stock, not equipment utilization or investment return.'),pair('通电投运、可计费负载与验收周期','Energization, billable load and acceptance cycles'),['D1']]
    ],
    Q1:[
      [pair('增长反映物流需求','Growth measures logistics demand'),pair('Q1社会物流总额同比增长6.2%。','Q1 social logistics grew 6.2% YoY.'),pair('不外推为供应链软件或采购服务收入增速。','Do not extrapolate it into software or procurement-service revenue growth.'),pair('订单行业与履约方式','Customer sectors and fulfillment modes'),['C1']],
      [pair('用实物流量跟踪细分产业','Track sectors with physical flows'),pair('Q1集成电路产量1272亿块。','Q1 IC output was 127.2bn units.'),pair('器件数量不代表芯片价值，也不等于晶圆面积。','Device counts are neither chip value nor wafer area.'),pair('产品组合、良率与客户库存','Product mix, yield and customer inventories'),['N1']],
      [pair('资金效率保持独立判断','Assess cash efficiency separately'),pair('本版未核验季度物流收入与费用完整序列。','A complete quarterly logistics revenue/cost series is unverified.'),pair('季度缺口留空，半年累计不替代本季。','Quarter gaps stay blank; H1 totals do not substitute for Q1.'),pair('应收余额、同期收入与营业成本','Receivables, matching revenue and cost of sales'),[]]
    ],
    Q2:[
      [pair('正增长中的节奏变化','The pace changes within positive growth'),pair('Q2物流同比4.4%，较Q1低1.8个百分点。','Q2 logistics grew 4.4% YoY, 1.8 points below Q1.'),pair('这是同比增速变化，不是物流总量环比下降。','This is a change in YoY growth, not a QoQ decline in volume.'),pair('持续订单与可调整运力','Recurring orders and adjustable capacity'),['C1']],
      [pair('跨境交付需求可用流量观察','Use flows to assess cross-border delivery'),pair('Q2新能源汽车出口约140.1万辆，由累计量差分。','Q2 NEV exports were about 1.401m, differenced from cumulative counts.'),pair('差分保留两次发布的修订与舍入风险。','The difference retains revision and rounding risk across releases.'),pair('船期、目的港库存与海外备件','Sailings, destination inventory and overseas spares'),['V1','V2']],
      [pair('季度收入与利润不补值','Do not fill quarterly revenue or profit gaps'),pair('季度物流收入及宏观费用率未纳入核验序列。','Quarterly logistics revenue and macro cost ratios are not verified.'),pair('H1累计与本季度经营不能互换。','H1 cumulative figures and quarterly operations are not interchangeable.'),pair('单票成本与项目验收回款','Cost per shipment and project acceptance-to-cash'),[]]
    ],
    Q3:[
      [pair('景气信号完整，规模统计仍有缺口','Sentiment is observed; scale coverage is incomplete'),pair('7—9月物流业景气指数为50.4、50.9、51.5。','July–September logistics indices were 50.4, 50.9 and 51.5.'),pair('月度扩散指数不替代Q3物流总量或累计同比。','Monthly diffusion indices do not substitute for Q3 totals or cumulative growth.'),pair('9月产品表与物流总量披露','September product tables and logistics totals'),['QL7','QL8','QL9']],
      [pair('完整流量才进行季度对照','Compare quarters only with full-period flows'),pair('Q3新能源汽车出口约165.1万辆，由1—9月减H1。','Q3 NEV exports were about 1.651m: Jan–Sep minus H1.'),pair('同口径Q2—Q3对照可用于交付节奏分析，不能推导利润。','Matching Q2–Q3 flows inform delivery planning, not profit.'),pair('目的港周转与经销网络回款','Port turnover and dealer collections'),['QV9','QV6']],
      [pair('补充证据保留实际期间','Supporting evidence retains its actual period'),pair('本版工业机器人、快递与数据服务用电证据仅覆盖已披露月份。','Robot, parcel and data-services electricity evidence covers disclosed months only.'),pair('单月与跨期累计均不升级为全季结论。','Neither monthly nor cross-period cumulative data becomes a full-quarter conclusion.'),pair('同范围季度实值与修订记录','Matching quarterly actuals and revisions'),['QN8','QE8','QPOWER']]
    ]
  },
  world:{
    H1:[
      [pair('需求增长快于运力','Demand growth outpaces capacity'),pair('H1航空CTK同比4.9%，ACTK同比2.1%。','H1 air cargo CTK grew 4.9% YoY; ACTK 2.1%.'),pair('两个增速之差不等于运价涨幅或利润率。','The growth-rate gap is not a freight-rate increase or a profit margin.'),pair('实际舱位、交付波动与燃油附加费','Available lift, delivery variability and fuel surcharges'),['A6']],
      [pair('季度与月度给出不同信息','Quarterly and monthly readings differ'),pair('3月CTK同比−4.8%，6月为+8.5%。','March CTK was −4.8% YoY; June was +8.5%.'),pair('半年汇总会掩盖月度冲击，路由需保留弹性。','Half-year totals can mask monthly shocks; retain routing flexibility.'),pair('关键枢纽运行与替代航线可用性','Hub operations and usable alternative lanes'),['A3','A6']],
      [pair('案例能解释机制，不能定义全球市场','Cases explain mechanisms, not the global market'),pair('GE电气化H1收入65.97亿美元，报告同比65%。','GE Electrification H1 revenue was USD 6.597bn, +65% reported.'),pair('含并购影响；分部收入不是全球电网装备市场规模。','Acquisitions affect reported growth; segment revenue is not global grid-market size.'),pair('有机增速、交付能力与验收条件','Organic growth, delivery capacity and acceptance terms'),['GE1']]
    ],
    Q1:[
      [pair('季度正增长不意味着每月增长','Quarter growth does not imply growth every month'),pair('Q1航空需求同比3.3%，3月单月−4.8%。','Q1 air demand grew 3.3% YoY, while March fell 4.8%.'),pair('采购与交付方案应检查月度转折。','Check monthly turning points in procurement and delivery plans.'),pair('枢纽连接与订单波动','Hub connectivity and order volatility'),['A3']],
      [pair('贸易量与贸易额分开','Separate trade volume and value'),pair('Q1世界货物贸易量同比3.2%，含机构估算。','Q1 world merchandise volume grew 3.2% YoY, including estimates.'),pair('不能当作美元贸易额增速或H1实际结果。','This is neither USD trade-value growth nor an H1 outcome.'),pair('统计修订与区域实物流量','Revisions and regional physical flows'),['W1']],
      [pair('企业财年先映射自然季度','Map fiscal periods to calendar quarters'),pair('微软FY2026 Q3对应自然年2026 Q1。','Microsoft FY2026 Q3 maps to calendar Q1 2026.'),pair('资本开支按三个月现金流口径读取，不用财年累计替代。','Read three-month cash capex rather than fiscal-year cumulative totals.'),pair('现金购建设备与非现金租赁分列','Cash equipment additions versus non-cash leases'),['MC1']]
    ],
    Q2:[
      [pair('月度需求恢复增长','Monthly demand returns to growth'),pair('4—6月CTK同比为4.0%、6.0%、8.5%。','April–June CTK YoY was 4.0%, 6.0% and 8.5%.'),pair('三个月同比不能简单平均为Q2累计同比。','Do not average monthly YoY into a quarterly cumulative rate.'),pair('季度累计实值与历史修订','Quarterly cumulative actuals and revisions'),['A4','A5','A6']],
      [pair('量价关系限定在承运人案例','Volume and pricing remain a carrier case'),pair('马士基Ocean Q2装载量同比4.1%，平均装载运价同比22%。','Maersk Ocean Q2 volume grew 4.1%; average loaded rates 22%.'),pair('不能外推所有航线，也不等于每位货主的成本涨幅。','Do not extrapolate to every lane or every shipper’s cost increase.'),pair('具体航线报价与合同覆盖','Lane-specific quotes and contract coverage'),['M1']],
      [pair('部署量与利润分别核验','Verify deployment and profit separately'),pair('特斯拉Q2储能部署13.5GWh。','Tesla deployed 13.5 GWh of storage in Q2.'),pair('企业部署不是行业装机总量，也不证明收益。','Company deployment is neither industry installation nor proof of returns.'),pair('验收、质保与经营现金流','Acceptance, warranty and operating cash flow'),['TS2']]
    ],
    Q3:[
      [pair('目前只有两个月航空数据','Only two air-cargo months are included'),pair('7、8月CTK同比3.9%、4.4%；9月未纳入。','July and August CTK grew 3.9% and 4.4%; September is not included.'),pair('保留9月缺口，不补画季度趋势。','Keep the September gap without extrapolating the quarter.'),pair('9月CTK与完整季度累计值','September CTK and full-quarter cumulative values'),['A7','A8']],
      [pair('储能已有完整季度运营量','Storage has a full-quarter operating observation'),pair('特斯拉Q3部署13.7GWh，Q2为13.5GWh。','Tesla deployed 13.7 GWh in Q3 versus 13.5 GWh in Q2.'),pair('比较的是同一企业部署量，财务收益仍需另证。','This compares one company’s deployment; financial returns need separate evidence.'),pair('成本、质保与现金回款','Costs, warranties and collections'),['QT3','TS2']],
      [pair('计划披露不等于已披露','Scheduled releases are not reported results'),pair('微软、GE Vernova和AutoStore的Q3实际值在本版留空。','Microsoft, GE Vernova and AutoStore Q3 actuals remain blank in this edition.'),pair('保留原指标和披露状态，避免以指引或Q2补值。','Retain metric definitions and release status without filling gaps from guidance or Q2.'),pair('正式季报与同口径分部数据','Formal quarter reports and matching segment data'),['QMCAL','QGCAL','QACAL']]
    ]
  }
};
function decisionBrief(){
  const items=briefs[market][period];
  return `<section class="decision-brief" aria-labelledby="brief-title"><div class="brief-heading"><span class="eyebrow">${t(pair('EXECUTIVE BRIEF / 阅读提要','EXECUTIVE BRIEF'))}</span><h2 id="brief-title">${t(period==='Q3'?pair('三条阶段性判断','Three interim takeaways'):pair('本窗口的三条结论','Three takeaways for this window'))}</h2><p>${t(pair('先读事实，再看分析含义与后续验证。','Read the evidence, its implication and the next check.'))}</p></div><div class="brief-grid">${items.map(([title,evidence,implication,watch,ids],i)=>`<article class="brief-item"><span class="brief-number">0${i+1}</span><h3>${t(title)}</h3><p class="brief-evidence"><b>${t(pair('事实','Evidence'))}</b>${t(evidence)} ${ref(ids)}</p><p><b>${t(pair('判断','Interpretation'))}</b>${t(implication)}</p><div class="brief-watch"><span>${t(pair('继续观察','Next check'))}</span>${t(watch)}</div></article>`).join('')}</div></section>`;
}
function evidenceScope(id){
  if(market==='world'&&['cold','ai','grid','storage','robot'].includes(id))return pair('企业／分部案例','Company / segment case');
  if(market==='cn'&&['grid','storage'].includes(id))return pair('投资线索 · 非设备规模','Investment signal · Not equipment scale');
  if(market==='cn'&&id==='ai')return pair('期末存量 · FP16','Ending stock · FP16');
  if(id==='ev')return market==='cn'?pair('中国出口流量','China export flow'):pair('欧盟终端注册','EU end-market registrations');
  return pair('行业／区域统计','Industry / regional statistic');
}
function editorialEvidenceMap(){
  const list=[...sectorSeries[market].map(s=>({id:s.id,name:s.name,metric:s.metric,value:s.values[period],unit:s.unit})),...Object.entries(researchNames).map(([id,name])=>{const x=availableMetric(id,'scale')||availableMetric(id,'growth');return {id,name,metric:x.name,value:x.values[period],unit:x.unit};})];
  if(period==='Q3')for(const x of list)x.value=q3Primary(x.id).values.Q3;
  const ready=list.filter(x=>Number.isFinite(x.value)).length;
  return `<details class="evidence-map"><summary><span>${t(pair('八产业证据速览','Eight-sector evidence map'))}</span><span>${ready}/8 ${t(pair('主指标可读','primary readings available'))}</span></summary><p class="meta">${t(pair('按各自产出、投资、存量或企业案例口径呈现，不作跨产业排名；覆盖数不是行业评分。','Each metric retains its output, investment, stock or company scope. There is no cross-sector ranking; coverage is not an industry score.'))}</p><div class="evidence-map-grid">${list.map(x=>`<div><span>${t(x.name)}</span><small class="map-metric">${t(x.metric)}</small><b>${Number.isFinite(x.value)?vizNum(x.value):'—'}</b><small>${t(x.unit)}</small><em>${t(evidenceScope(x.id))}</em></div>`).join('')}</div></details>`;
}
function verificationNote(){return `<div class="verification-note"><div><span class="evidence-dot"></span><b>${t(pair('可追溯，而非独立审计','Traceable, not independently audited'))}</b><p>${t(pair('H1原版核验：2026-09-06；Q3新增证据核验：2026-10-18。2026-10-19抽查7项来源，未重审全部60项。','Original H1 check: 2026-09-06; new Q3 evidence: 2026-10-18. Seven source documents were spot-checked on 2026-10-19; not all 60 were re-audited.'))}</p></div><details><summary>${t(pair('抽查范围与数据边界','Spot-check scope and coverage limits'))}</summary><p>${t(pair('抽查中国宏观物流、H1航空累计、算力存量、GE分部收入、Q3新能源汽车出口累计及特斯拉部署公告。未来发布计划不作为实际结果；未核验的周转天数与区域CR3继续留空。','Checks cover China macro logistics, H1 air cargo cumulative data, computing stock, GE segment revenue, cumulative NEV exports and Tesla deployment. Scheduled releases are not actuals; unverified turnover days and geographic CR3 remain blank.'))} ${ref(spotCheckedSources)}</p></details></div>`;}
function collapseSourceCatalogue(html){
  const start=html.indexOf('<div class="source-list">');
  if(start<0)return html;
  const heading=html.lastIndexOf('<h3>',start),tags=/<div\b[^>]*>|<\/div>/g;
  tags.lastIndex=start;let depth=0,end=start,tag;
  while((tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:1;if(depth===0){end=tags.lastIndex;break;}}
  if(end===start||heading<0)return html;
  return html.slice(0,heading)+'<details class="source-catalogue"><summary>'+t(pair('展开来源目录与核验说明','Expand source directory and verification notes'))+'</summary>'+html.slice(start,end)+'</details>'+html.slice(end);
}
function applyEditorial(html){
  const report=document.getElementById('report');
  html=html.replace(/<nav>/,'<nav class="chapter-nav" aria-label="'+esc(plain(pair('报告章节','Report chapters')))+'">');
  html=html.replace(/(<section class="section" id="overview">)/,decisionBrief()+'$1');
  html=html.replace(/(<section class="section" id="sectors">)/,editorialEvidenceMap()+'$1');
  html=html.replace(/(<section class="section" id="sources">)/,verificationNote()+'$1');
  // Collapse directory density, retaining every source and direct original link.
  html=collapseSourceCatalogue(html);
  const ids=[...sectorSeries[market].map(s=>s.id),...Object.keys(researchNames)];let n=0;
  if(period!=='Q3')html=html.replace(/(<article class="sector-panel[^\"]*">)(<div class="eyebrow">[^]*?<\/div>)/g,(_,article,heading)=>{const id=ids[n++];return article.replace('>',' data-sector="'+id+'">')+heading+'<span class="scope-tag">'+t(evidenceScope(id))+'</span>';});
  report.innerHTML=html;
  document.documentElement.setAttribute?.('data-language',lang);
  report.setAttribute?.('aria-label',plain(pair('供应链行业报告正文','Supply-chain report content')));
  document.querySelector('.skip-link').textContent=plain(pair('跳至报告正文','Skip to report'));
  if(lang==='bi'){
    document.getElementById('csv').textContent='导出 CSV / Export';
    document.getElementById('print').textContent='打印 / PDF';
  }
}
// One render path and one report DOM write after all data and helpers are ready.
function render(){applyEditorial(renderWindow());}
document.getElementById('period').value=period;
render();
