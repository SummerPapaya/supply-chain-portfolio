// Q3 is a calendar-quarter window. Missing observations are null, never zero.
// New evidence checked on 2026-10-18; the historical H1 edition keeps its own date.
const Q3_VERIFIED = '2026-10-18';
const q3Sources = {
  QL7: {title:pair('7月全国物流业景气指数','July national logistics prosperity index'),publisher:'湖南省政府转载人民日报 → CFLP',date:'2026-08-07',url:'https://hunan.gov.cn/hnszf/hnyw/ywtj/202608/t20260807_34041463.html',note:pair('正文核验；全国指数，不是湖南省指数。','Body checked; national index, not a provincial observation.')},
  QL8: {title:pair('8月全国物流业景气指数','August national logistics prosperity index'),publisher:'人民日报海外版 → CFLP',date:'2026-09-07',url:'https://paper.people.com.cn/rmrbhwb/pad/content/202609/07/content_30179535.html',note:pair('正文核验；月度扩散指数，非业务量增速。','Body checked; monthly diffusion index, not volume growth.')},
  QL9: {title:pair('9月全国物流业景气指数','September national logistics prosperity index'),publisher:'人民日报海外版 → CFLP',date:'2026-10-14',url:'https://paper.people.com.cn/rmrbhwb/pc/content/202610/14/content_30185594.html',note:pair('正文核验；9月观察、10月发布，不是Q3累计增速。','Body checked; September observation released in October, not Q3 cumulative growth.')},
  QPMI: {title:pair('9月中国采购经理指数运行情况','September China purchasing managers indices'),publisher:'国家统计局 / NBS',date:'2026-09-30',url:'https://www.stats.gov.cn/sj/zxfb/202609/t20260930_1965449.html',note:pair('表1、表2核验7—9月序列；季调扩散指数，以50为临界点。','Tables 1 and 2 checked for July–September; seasonally adjusted diffusion indices, threshold 50.')},
  QC8: {title:pair('1—8月全国社会物流总额','January–August national social logistics'),publisher:'国家发展改革委 / NDRC',date:'2026-10-12',url:'https://www.ndrc.gov.cn/xwdt/ztzl/shwltj/qgsj/202610/t20261012_1408117.html',note:pair('正文核验；1—8月累计，仅作跨期背景。','Body checked; January–August cumulative, cross-period context only.')},
  QN8: {title:pair('8月规模以上工业生产','August industrial production'),publisher:'国家统计局 / NBS',date:'2026-09-15',url:'https://www.stats.gov.cn/sj/zxfbhjd/202609/t20260915_1965308.html',note:pair('产品表核验；8月单月与1—8月累计分列，未取得9月产品表。','Product table checked; August and January–August are separate; September product table not obtained.')},
  QV6: {title:pair('6月汽车工业经济运行情况','June automotive industry activity'),publisher:'工业和信息化部 → CAAM / MIIT',date:'2026-07-09',url:'https://www.miit.gov.cn/jgsj/zbys/qcgy/art/2026/art_1ff554c909a142cdb56b188a9a9a7f2f.html',note:pair('正文第三节核验H1新能源汽车出口235.5万辆；与原版V2交叉一致。','Section 3 checks H1 NEV exports of 2.355m; agrees with historical source V2.')},
  QV9: {title:pair('9月汽车工业经济运行情况','September automotive industry activity'),publisher:'工业和信息化部 → CAAM / MIIT',date:'2026-10-12',url:'https://www.miit.gov.cn/gxsj/tjfx/zbgy/qc/art/2026/art_8a878aeeb8a34a5b88975c5bbe94f7bf.html',note:pair('正文第三节核验1—9月出口400.6万辆；Q3由同口径累计流量差分。','Section 3 checks January–September exports of 4.006m; Q3 is a difference of matching cumulative flows.')},
  QE8: {title:pair('1—8月邮政行业运行情况','January–August postal industry activity'),publisher:'交通运输部转载国家邮政局 / MOT → SPB',date:'2026-10-13',url:'https://www.mot.gov.cn/shuju/tongjishuju/youzheng/202610/t20261013_4225799.html',note:pair('正文核验8月与累计件量、收入、地区份额；不以品牌CR8代替区域CR3。','Body checks August/cumulative parcels, revenue and regional shares; brand CR8 is not geographic CR3.')},
  QPOWER: {title:pair('8月用电量与负荷','August electricity use and load'),publisher:'国家能源局电力可靠性管理和工程质量监督中心 / NEA',date:'2026-09-20',url:'https://prpq.nea.gov.cn/jnyw/14599.html',note:pair('正文核验互联网数据服务用电；需求侧线索，非AI专用电量或算力规模。','Body checks internet data-services electricity; demand-side evidence, not AI-only use or computing capacity.')},
  A7: {title:pair('7月航空货运需求增长3.9%','Air Cargo Demand Grows 3.9% in July'),publisher:'IATA',date:'2026-08-31',url:'https://www.iata.org/en/pressroom/2026-releases/08-31-air-cargo-demand-grows-july',note:pair('正文核验总市场月同比；不与季度累计同比混用。','Total-market monthly YoY checked in body; not a cumulative quarterly rate.')},
  A8: {title:pair('8月航空货运需求增长4.4%','Air Cargo Demand Grows 4.4% in August'),publisher:'IATA',date:'2026-09-29',url:'https://www.iata.org/en/pressroom/2026-releases/09-29-air-cargo-demand-grows-august/',note:pair('总市场表与航线表核验；9月与Q3累计值未纳入。','Total-market and route tables checked; September and Q3 cumulative values not included.')},
  QB8: {title:pair('1—8月欧盟新车注册','January–August EU new-car registrations'),publisher:'ACEA',date:'2026-09-24',url:'https://www.acea.auto/pc-registrations/new-car-registrations-5-3-in-august-2026-year-to-date-battery-electric-21-7-market-share/',note:pair('正文核验BEV注册1,641,333辆、累计份额21.7%；不是Q3值。','Body checks 1,641,333 BEV registrations and 21.7% YTD share; not Q3 observations.')},
  QT3: {title:pair('特斯拉Q3产量、交付及储能部署','Tesla Q3 production, deliveries and deployments'),publisher:'Tesla IR',date:'2026-10-02',url:'https://ir.tesla.com/press-release/tesla-third-quarter-2026-production-deliveries-and-deployments',note:pair('原始公告核验Q3储能部署13.7GWh；利润及现金流未披露。','Original release checks Q3 storage deployment of 13.7 GWh; profit and cash flow not yet released.')},
  QTCHECK: {title:pair('特斯拉Q3运营公告SEC副本','SEC copy of Tesla Q3 operating release'),publisher:'SEC / Tesla Exhibit 99.1',date:'2026-10-02',url:'https://www.sec.gov/Archives/edgar/data/1318605/000162828026064366/exhibit991111111.htm',note:pair('与QT3交叉一致；同一企业公告的副本，不是独立统计样本。','Agrees with QT3; duplicate of the same company release, not an independent sample.')},
  QBCAL: {title:pair('ACEA 2026统计发布日历','ACEA 2026 statistics release calendar'),publisher:'ACEA',date:'持续更新 / Live calendar',url:'https://www.acea.auto/press-release-calendar/',note:pair('核验日历列示9月乘用车数据计划10月22日发布；未来日期不作为已发布结果。','Calendar lists September passenger-car data for October 22; a scheduled release is not an actual result.')},
  QMCAL: {title:pair('微软FY2027 Q1业绩发布日期','Microsoft FY2027 Q1 earnings date'),publisher:'Microsoft',date:'2026-10-07',url:'https://news.microsoft.com/source/2026/10/07/microsoft-announces-quarterly-earnings-release-date-69/',note:pair('自然年2026 Q3对应FY2027 Q1；计划10月28日发布。','Calendar Q3 2026 corresponds to FY2027 Q1; scheduled for October 28.')},
  QGCAL: {title:pair('GE Vernova Q3业绩发布日期','GE Vernova Q3 earnings date'),publisher:'GE Vernova',date:'2026-10-13',url:'https://www.gevernova.com/news/press-releases/ge-vernova-announce-third-quarter-2026-financial-results-october-28',note:pair('计划10月28日发布；非已披露季度业绩。','Scheduled for October 28; not released quarterly results.')},
  QACAL: {title:pair('AutoStore财务日历','AutoStore financial calendar'),publisher:'AutoStore',date:'持续更新 / Live calendar',url:'https://www.autostoresystem.com/investors',note:pair('官网日历：Q3报告计划11月5日发布；最新实际报告仍为Q2。','Company calendar: Q3 report scheduled for November 5; latest actual report is Q2.')},
  QLCAL: {title:pair('Lineage Q3业绩发布日期','Lineage Q3 earnings date'),publisher:'Lineage',date:'2026-10-07',url:'https://ir.onelineage.com/press-releases/news-details/2026/Lineage-to-Report-Third-Quarter-2026-Financial-Results-on-November-9-2026/default.aspx',note:pair('计划11月9日发布，11月10日业绩电话会；不补写Q3占用率。','Results scheduled for November 9, call November 10; no inferred Q3 occupancy.')},
  QMAERSK: {title:pair('马士基Q3报告发布日期','Maersk Q3 report release date'),publisher:'A.P. Moller – Maersk',date:'2026-09-22',url:'https://investor.maersk.com/events/event-details/interim-report-3rd-quarter-2026',note:pair('官网活动页计划11月5日发布；Q2运价案例不延用为Q3表现。','Company event page schedules November 5; Q2 freight-rate performance is not reused as Q3 evidence.')},
  QSEMI: {title:pair('SEMI材料统计发布目录','SEMI materials release archive'),publisher:'SEMI',date:'持续更新 / Live archive',url:'https://www.semi.org/en/products-services/market-data/materials-article-archive',note:pair('核验目录最新2026季度硅片出货为Q2；本版Q3留空，不宣称统计不存在。','Latest 2026 quarterly wafer shipment release located is Q2; Q3 stays blank, not a claim that no statistics exist.')}
};
for (const s of Object.values(q3Sources)) s.verified = Q3_VERIFIED;
Object.assign(sources, q3Sources);

function q3Add(m,p,name,value,unit,ids,note,options={}) {
  add(m,p,name,value,unit,ids[0],options.status||'reported',note);
  const row=rows[rows.length-1];
  Object.assign(row,{inputs:ids,verified:Q3_VERIFIED,...options});
  if(p==='Q3')Object.assign(row,{start:'2026-07-01',end:'2026-09-30'});
  else if(/^2026-0[7-9]$/.test(p))Object.assign(row,{start:p+'-01',end:p+(p==='2026-09'?'-30':'-31')});
  return row;
}
const q3MonthlyNote=pair('月度观察；不是季度累计值。','Monthly observation; not a quarterly cumulative value.');
const q3ContextNote=pair('1—8月累计，仅作跨期背景，不能当作Q3。','January–August cumulative; cross-period context, not Q3.');
const q3Context={contextFor:'Q3',start:'2026-01-01',end:'2026-08-31'};
const q3Lpi=[50.4,50.9,51.5];
const q3Pmi=[49.2,49.8,50.1],q3Orders=[48.5,50.6,50.5];
const q3Purchase=[53.2,56.6,60.8],q3Selling=[47.8,50.4,54.0];
q3Lpi.forEach((v,i)=>q3Add('cn','2026-0'+(i+7),pair('中国物流业景气指数','China logistics prosperity index'),v,pair('指数点','index points'),['QL'+(i+7)],q3MonthlyNote));
for(const [name,series] of [[pair('中国制造业PMI','China manufacturing PMI'),q3Pmi],[pair('制造业新订单指数','Manufacturing new-orders index'),q3Orders],[pair('制造业原材料购进价格指数','Manufacturing input-price index'),q3Purchase],[pair('制造业出厂价格指数','Manufacturing output-price index'),q3Selling]])
  series.forEach((v,i)=>q3Add('cn','2026-0'+(i+7),name,v,pair('指数点','index points'),['QPMI'],pair('季调月度扩散指数；50为临界点，不是价格涨幅或利润率。','Seasonally adjusted monthly diffusion index; threshold 50, not price growth or margin.')));
q3Add('cn','2026-01/08',pair('社会物流总额','Total value of social logistics'),243.6,pair('万亿元','CNY trillion'),['QC8'],q3ContextNote,q3Context);
q3Add('cn','2026-01/08',pair('社会物流总额同比','Social logistics YoY'),4.9,'%',['QC8'],q3ContextNote,q3Context);
const q3Nev=q3Add('cn','Q3',pair('中国新能源汽车出口量','China NEV exports'),Number((400.6-235.5).toFixed(1)),pair('万辆','10,000 vehicles'),['QV9','QV6'],pair('Q3≈400.6−235.5=165.1万辆；同为中汽协统计，由1—9月减去H1累计。两次发布的修订、四舍五入可能影响差额；不是同比差分。','Q3≈400.6−235.5=165.1 (10,000 vehicles). Matching CAAM cumulative counts: January–September minus H1. Revisions and rounding across releases may affect the difference; not subtraction of growth rates.'),{status:'derived'});
q3Add('cn','2026-01/09',pair('中国新能源汽车出口量','China NEV exports'),400.6,pair('万辆','10,000 vehicles'),['QV9'],pair('1—9月累计，含H1；用于Q3差分输入，非Q3读数。','January–September cumulative, includes H1; input to the Q3 calculation, not Q3 itself.'),{contextFor:'Q3',start:'2026-01-01',end:'2026-09-30'});
const q3Chip=q3Add('cn','2026-08',pair('中国规上工业集成电路产量','China IC output: above-designated-size firms'),529,pair('亿块','100 million units'),['QN8'],q3MonthlyNote);
q3Add('cn','2026-08',pair('中国规上工业集成电路产量同比','China IC output YoY'),20.6,'%',['QN8'],q3MonthlyNote);
const q3Robot=q3Add('cn','2026-08',pair('中国规上工业机器人产量','China industrial robot output'),96174,pair('套','units'),['QN8'],q3MonthlyNote);
q3Add('cn','2026-08',pair('中国规上工业机器人产量同比','China industrial robot output YoY'),34.6,'%',['QN8'],q3MonthlyNote);
const q3Parcel=q3Add('cn','2026-08',pair('中国快递业务量','China express parcel volume'),166,pair('亿件','100 million parcels'),['QE8'],q3MonthlyNote);
q3Add('cn','2026-08',pair('中国快递业务量同比','China express parcel volume YoY'),2.7,'%',['QE8'],q3MonthlyNote);
const q3ParcelRevenue=q3Add('cn','2026-08',pair('中国快递业务收入','China express parcel revenue'),1271.5,pair('亿元','CNY 100 million'),['QE8'],q3MonthlyNote);
q3Add('cn','2026-01/08',pair('中国快递业务量','China express parcel volume'),1340.6,pair('亿件','100 million parcels'),['QE8'],q3ContextNote,q3Context);
q3Add('cn','2026-01/08',pair('中国快递业务收入','China express parcel revenue'),10289.2,pair('亿元','CNY 100 million'),['QE8'],q3ContextNote,q3Context);
const q3Power=q3Add('cn','2026-08',pair('互联网数据服务用电量','Internet data-services electricity use'),102,pair('亿千瓦时','100 million kWh'),['QPOWER'],pair('8月单月；需求侧线索，不是AI专用电量、算力规模或利用率。','August only; demand-side evidence, not AI-only electricity, computing capacity or utilization.'));
q3Add('cn','2026-08',pair('互联网数据服务用电同比','Internet data-services electricity YoY'),37.9,'%',['QPOWER'],q3Power.note);
[[3.9,1.7],[4.4,-0.1]].forEach((values,i)=>values.forEach((v,j)=>q3Add('world','2026-0'+(i+7),j?pair('全球航空货运运力 ACTK','Global air cargo capacity ACTK'):pair('全球航空货运需求 CTK','Global air cargo demand CTK'),v,'%',['A'+(i+7)],q3MonthlyNote)));
q3Add('world','2026-08',pair('全球航空货运载运率','Global air cargo load factor'),46,'%',['A8'],pair('8月总市场载运率；不是季度均值。','August total-market load factor; not a quarterly mean.'));
const q3Eu=q3Add('world','2026-01/08',pair('欧盟纯电动车新车注册量','EU new BEV registrations'),1641333,pair('辆','vehicles'),['QB8'],q3ContextNote,q3Context);
q3Add('world','2026-01/08',pair('欧盟纯电动车注册份额','EU BEV registration share'),21.7,'%',['QB8'],q3ContextNote,q3Context);
const q3Tesla=q3Add('world','Q3',pair('特斯拉储能产品部署量','Tesla energy storage deployments'),13.7,pair('GWh','GWh'),['QT3','QTCHECK'],pair('企业全球部署量，非行业装机总量；运营公告与SEC副本一致。部署量不证明利润或现金流。','Company global deployment, not industry installation; operating release agrees with its SEC copy. Deployment does not establish profit or cash flow.'),{status:'case'});

const q3Coverage={
  cn:{
    chips:{state:'partial',note:pair('仅核验8月产品表；本版未取得完整7—9月产量。','August product table verified; a complete July–September output series was not obtained.'),evidence:[q3Chip],ids:['QN8']},
    ev:{state:'complete',note:q3Nev.note,evidence:[],ids:['QV9','QV6']},
    commerce:{state:'partial',note:pair('8月件量及收入可用；1—8月累计单列背景，Q3全季留空。','August volume and revenue available; January–August totals are context, with full Q3 blank.'),evidence:[q3Parcel,q3ParcelRevenue],ids:['QE8']},
    cold:{state:'gap',note:pair('未取得同口径Q3新能源冷藏车销量占比；不沿用H1占比。','No verified matching Q3 new-energy refrigerated-truck sales share; H1 is not carried forward.'),evidence:[],ids:[]},
    ai:{state:'partial',note:pair('9月底FP16算力存量未核验。8月互联网数据服务用电仅作不同口径的补充证据。','September-end FP16 computing stock unverified. August data-services electricity is supplementary evidence on a different basis.'),evidence:[q3Power],ids:['QPOWER']},
    grid:{state:'gap',note:pair('未取得同口径Q3重点项目投资增速。后续需把投资、设备订单、验收收入分别跟踪。','Matching Q3 key-project investment growth not verified. Track investment, equipment orders and accepted revenue separately.'),evidence:[],ids:[]},
    storage:{state:'gap',note:pair('未取得同口径Q3重点项目投资增速；不以锂电池总出口或企业部署替代全国新型储能规模。','Matching Q3 key-project investment growth not verified; battery exports or company deployment do not substitute for national new-type storage scale.'),evidence:[],ids:[]},
    robot:{state:'partial',note:pair('8月产量可用，9月产品表尚未纳入；不将单月同比34.6%标作Q3同比。','August output available; September product table not included. The 34.6% monthly growth is not Q3 growth.'),evidence:[q3Robot],ids:['QN8']}
  },
  world:{
    chips:{state:'gap',note:pair('核验SEMI目录最新同口径季度数据为Q2；Q3硅片出货面积留空。','Latest matching quarterly wafer-shipment release located in the SEMI archive is Q2; Q3 area stays blank.'),evidence:[],ids:['QSEMI']},
    ev:{state:'partial',note:pair('仅有1—8月累计注册量。ACEA日历列示9月数据计划10月22日发布，当前不填Q3。','Only January–August cumulative registrations are available. ACEA schedules September data for October 22; Q3 remains blank.'),evidence:[q3Eu],ids:['QB8','QBCAL']},
    commerce:{state:'gap',note:pair('本版未取得美国人口普查局Q3零售电商估计；保持原非季调美元口径，留空。','US Census Q3 retail e-commerce estimate not obtained; retain the existing non-seasonally adjusted USD basis and leave blank.'),evidence:[],ids:[]},
    cold:{state:'scheduled',note:pair('Lineage计划11月9日发布Q3财报；同库物理占用率暂缺。','Lineage schedules Q3 results for November 9; same-warehouse physical occupancy unavailable.'),evidence:[],ids:['QLCAL']},
    ai:{state:'scheduled',note:pair('微软自然年Q3对应FY2027 Q1，计划10月28日披露。保留集团现金购建物业设备口径，不用指引代替实际支出。','Microsoft calendar Q3 is FY2027 Q1, scheduled for October 28. Retain group cash property/equipment additions; guidance is not actual spending.'),evidence:[],ids:['QMCAL']},
    grid:{state:'scheduled',note:pair('GE Vernova计划10月28日披露Q3；电气化分部收入与利润率留空。','GE Vernova schedules Q3 results for October 28; Electrification revenue and margin remain blank.'),evidence:[],ids:['QGCAL']},
    storage:{state:'complete',note:q3Tesla.note,evidence:[],ids:['QT3','QTCHECK']},
    robot:{state:'scheduled',note:pair('AutoStore计划11月5日披露Q3；营业收入、毛利率与期末订单均留空。','AutoStore schedules Q3 results for November 5; revenue, gross margin and ending backlog remain blank.'),evidence:[],ids:['QACAL']}
  }
};
const q3States={complete:pair('全季已核验','Full quarter verified'),partial:pair('部分期间 / 补充证据','Partial period / supporting evidence'),scheduled:pair('已确认待披露','Scheduled, not yet released'),gap:pair('同口径数据未核验','Matching data unverified')};
function q3State(key){return `<span class="coverage-badge state-${key}">${t(q3States[key])}</span>`;}
function q3Evidence(row){return `<div class="evidence-reading" data-observation-period="${row.period}" data-role="${row.contextFor?'cross-period-context':'subperiod'}"><div class="meta">${row.contextFor?t(pair('跨期背景 · 1—8月累计','Cross-period context · Jan–Aug cumulative')):t(pair('季度内单月 · 2026年8月','Month within quarter · August 2026'))}</div><h4>${t(row.name)}</h4><strong>${vizNum(row.value)}</strong> ${typeof row.unit==='string'?esc(row.unit):t(row.unit)}<div class="meta">${t(row.note)} ${ref(row.inputs)}</div></div>`;}
function q3Primary(id){
  const classic=sectorSeries[market].find(s=>s.id===id);
  const expanded=availableMetric(id,'scale')||availableMetric(id,'growth');
  const result=classic?{name:classic.metric,unit:classic.unit,values:classic.values,ids:classic.ids,type:id==='cold'?'ratio':'flow'}:{name:expanded.name,unit:expanded.unit,values:expanded.values,ids:expanded.ids,type:metricType(expanded)};
  const row=market==='cn'&&id==='ev'?q3Nev:market==='world'&&id==='storage'?q3Tesla:null;
  return {...result,values:{...result.values,Q3:row?.value??null},ids:{...result.ids,Q3:row?.inputs||[]},row};
}
function q3CanCompare(x){
  return Boolean(x.row&&x.row.period==='Q3'&&!x.row.contextFor&&
    x.row.start==='2026-07-01'&&x.row.end==='2026-09-30'&&
    Number.isFinite(x.values.Q2)&&Number.isFinite(x.values.Q3)&&
    x.ids.Q2?.length&&x.ids.Q3?.length&&
    [...x.ids.Q2,...x.ids.Q3].every(id=>sources[id]));
}
function q3QuarterReading(id){
  const x=q3Primary(id),v=x.values.Q3,finite=Number.isFinite(v),stock=['stock','stockGrowth'].includes(x.type),rate=['growth','stockGrowth','ratio'].includes(x.type);
  if(!finite)return `<p class="q3-quarter-unavailable meta">${t(pair('完整Q3主指标：—；本版未核验可比全季数据，暂不进行季度比较。','Full-Q3 primary metric: —; matching full-quarter data unverified, so no quarter comparison is shown.'))}</p>`;
  const basis=x.type==='stockGrowth'?pair('9月30日存量同比','September 30 stock YoY'):stock?pair('9月30日期末存量','September 30 ending stock'):x.type==='growth'?pair('本季度同比','Quarterly YoY'):x.type==='ratio'?pair('本季度期间比率','Quarterly period ratio'):pair('7—9月发生额','July–September flow');
  const quarters=['Q2','Q3'],max=x.type==='ratio'?100:Math.max(1,...quarters.map(p=>Math.abs(x.values[p]||0)))*1.1;
  let body=`<div class="reading-main" data-type="${x.type}" data-period="Q3"><div class="period-label">2026 Q3 · ${t(basis)}</div><div class="value ${finite?'':'unavailable'}">${finite?vizNum(v):'—'}</div><div class="unit">${t(x.unit)}</div><div class="meta">${finite?status(x.row.status)+' '+ref(x.ids.Q3):t(pair('未核验完整Q3同口径数据','No verified matching full-Q3 observation'))}</div></div>`;
  if(q3CanCompare(x)){
    body+=`<div class="quarter-comparison" data-comparison="Q2-Q3"><div class="meta">${t(stock?pair('季度期末对照 · Q2 → Q3','Quarter-end comparison · Q2 → Q3'):pair('完整同口径季度对照 · Q2 → Q3','Matching full-quarter comparison · Q2 → Q3'))}</div>${quarters.map(p=>`<div class="quarter-row ${p==='Q3'?'active':''}" data-quarter="${p}"><span>${p}</span><div class="quarter-track"><i style="width:${Math.abs(x.values[p])/max*100}%"></i></div><b>${vizNum(x.values[p])}</b></div>`).join('')}<p class="comparison-note">${t(pair('两期均为完整季度、相同指标与单位。Q2沿用历史版已核验值；比较未做季节调整。','Both observations cover full quarters with the same metric and units. Q2 retains the verified historical value; comparisons are not seasonally adjusted.'))} ${ref(x.ids.Q2)}</p></div>`;
    const delta=Number((v-x.values.Q2).toFixed(6));
    body+=`<p class="period-change" data-delta-unit="${rate?'pp':'absolute'}">${t(rate?pair('Q3较Q2变化','Q3 minus Q2'):pair('Q3较Q2绝对变化','Absolute Q3 minus Q2'))}<strong>${delta>0?'+':''}${vizNum(delta)}</strong>${t(rate?pair('个百分点','percentage points'):x.unit)}</p>`;
  }
  return vizFrame(x.name,t(basis),body,t(q3Coverage[market][id].note)+' '+ref(q3Coverage[market][id].ids),'PERIOD');
}
function q3SectorBlock(){
  const names=[...sectorSeries[market].map(s=>[s.id,s.name]),...Object.entries(researchNames)];
  const full=names.filter(([id])=>Number.isFinite(q3Primary(id).values.Q3));
  const partial=names.filter(([id])=>!Number.isFinite(q3Primary(id).values.Q3)&&q3Coverage[market][id].evidence.length);
  const pending=names.filter(([id])=>!Number.isFinite(q3Primary(id).values.Q3)&&!q3Coverage[market][id].evidence.length);
  const analysis=id=>researchWatch[id].view||sectorSeries[market].find(s=>s.id===id).analysis;
  return `<p class="sector-toolbar">${t(pair('阶段性观察按证据覆盖程度展开：完整季度才对照Q2—Q3；单月或累计数据保持实际期间；尚无新证据的产业收为简短观察清单。八个产业及三层诊断均保留。','This interim view follows evidence coverage: compare Q2–Q3 only for matching full quarters; monthly and cumulative evidence retains its actual period; sectors without new evidence use a concise watchlist. All eight sectors and the three-layer diagnostic are retained.'))}</p>
    <div class="sector-group"><span>01</span><h3>${t(pair('完整季度读数','Full-quarter observations'))}</h3></div>
    <div class="q3-complete-grid">${full.map(([id,name])=>`<article class="sector-panel q3-complete-panel ${sectorTone(id)}" data-sector="${id}" data-coverage="complete"><div class="eyebrow">${t(name)}</div>${q3State(q3Coverage[market][id].state)}${q3QuarterReading(id)}<p class="sector-analysis">${t(analysis(id))}</p></article>`).join('')}</div>
    ${partial.length?`<div class="sector-group"><span>02</span><h3>${t(pair('已披露月份与补充线索','Disclosed periods and supporting signals'))}</h3></div><div class="q3-evidence-grid">${partial.map(([id,name])=>{
      const c=q3Coverage[market][id];
      return `<article class="sector-observation ${sectorTone(id)}" data-sector="${id}" data-coverage="partial"><h3>${t(name)}</h3>${q3State(c.state)}${c.evidence.map(q3Evidence).join('')}<p class="meta">${t(c.note)} ${ref(c.ids)}</p><p class="sector-analysis">${t(analysis(id))}</p></article>`;
    }).join('')}</div>`:''}
    <div class="sector-group"><span>03</span><h3>${t(pair('待披露与后续观察清单','Pending disclosures and watchlist'))}</h3></div>
    <div class="q3-watchlist">${pending.map(([id,name])=>{
      const c=q3Coverage[market][id];
      return `<article class="q3-watch-item ${sectorTone(id)}" data-sector="${id}" data-coverage="${c.state}"><div><h4>${t(name)}</h4>${q3State(c.state)}</div><div><p>${t(c.note)} ${ref(c.ids)}</p><details><summary>${t(pair('后续经营观察','Operating priorities'))}</summary><p>${t(analysis(id))}</p></details></div></article>`;
    }).join('')}</div>${dimensionBlock()}`;
}
function q3LineChart(title,series,options={}){
  const W=560,H=292,left=48,right=26,top=26,bottom=224,all=series.flatMap(s=>s.values.filter(Number.isFinite));
  const min=options.min??Math.floor(Math.min(0,...all)),max=options.max??Math.ceil(Math.max(1,...all)+1),x=i=>left+i*(W-left-right)/2,y=v=>bottom-(v-min)/(max-min)*(bottom-top);
  const ticks=options.ticks||[min,0,max].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
  let marks=ticks.map(v=>vizLine(left,y(v),W-right,y(v),v===(options.threshold??0)?VIZ.MUT:VIZ.GRID,v===(options.threshold??0)?1:.6)+vizText(left-9,y(v)+4,v,'end')).join('');
  if(options.missingSeptember)marks+=`<rect x="${x(2)-44}" y="${top}" width="68" height="${bottom-top}" fill="#f1f3f7" rx="5"/>${lang!=='en'?`<text x="${x(2)-10}" y="${top+55}" text-anchor="middle" font-size="11" fill="${VIZ.MUT}">待披露</text>`:''}${lang!=='zh'?`<text x="${x(2)-10}" y="${top+(lang==='bi'?72:55)}" text-anchor="middle" font-size="11" fill="${VIZ.MUT}">Pending</text>`:''}`;
  for(const s of series){let segment=[];
    const flush=()=>{if(segment.length>1)marks+=`<polyline points="${segment.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" ${s.dash?'stroke-dasharray="6 4"':''}/>`;segment=[];};
    s.values.forEach((v,i)=>{if(!Number.isFinite(v)){flush();return;}segment.push(x(i)+','+y(v));});flush();
    s.values.forEach((v,i)=>{if(!Number.isFinite(v))return;const others=series.filter(other=>other!==s).map(other=>other.values[i]).filter(Number.isFinite),above=!others.length||v>=Math.max(...others);marks+=`<g role="img" aria-label="${esc(plain(s.name)+' '+(i+7)+'/2026: '+v)}"><circle cx="${x(i)}" cy="${y(v)}" r="4" fill="white" stroke="${s.color}" stroke-width="2.5"><title>${esc(plain(s.name)+' '+v)}</title></circle>${vizText(x(i)+(i===2?-8:8),y(v)+(above?-13:22),vizNum(v),i===2?'end':'start',12,750)}</g>`;});
  }
  marks+=[7,8,9].map((m,i)=>vizText(x(i),250,String(m))).join('');
  const legend=`<div class="line-legend">${series.map(s=>`<span><i ${s.dash?'class="dash"':''} style="${s.dash?'border-color':'background'}:${s.color}"></i>${t(s.name)}</span>`).join('')}</div>`;
  return vizFrame(title,t(options.subtitle||pair('2026年7—9月 · 月度观察','July–September 2026 · Monthly observations')),legend+`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(plain(title))}"><title>${esc(series.map(s=>plain(s.name)+': '+s.values.map(v=>v??'unavailable').join(', ')).join('; '))}</title>${marks}${vizText(W/2,280,plain(pair('月份','Month')))}</svg>`,t(options.note||q3MonthlyNote)+' '+ref(options.ids||[]),'LINE');
}
function q3PriceChart(){
  const body=[7,8,9].map((m,i)=>`<div class="price-month"><span>${m}${t(pair('月',' / 2026'))}</span><div><div class="price-pair"><i class="purchase"></i>${t(pair('购进价格','Input prices'))}<b>${q3Purchase[i]}</b></div><div class="price-pair"><i class="selling"></i>${t(pair('出厂价格','Output prices'))}<b>${q3Selling[i].toFixed(1)}</b></div></div></div>`).join('');
  return vizFrame(pair('成本传导：两个价格扩散指数','Cost transmission: two price diffusion indices'),t(pair('制造业 · 季调月度指数 · 50为临界点','Manufacturing · Seasonally adjusted monthly indices · Threshold 50')),body,t(pair('两个指数分别描述涨价企业的扩散程度，不能相减为利润率，也不是投入品与产品的价格水平。','Each index describes the breadth of price increases; their difference is not a margin, nor are they input/output price levels.'))+' '+ref(['QPMI']),'READING');
}
function q3Guide(){return `<div class="window-guide" data-window="Q3"><div><h3>${t(pair('阶段性观察 · 2026 Q3','Interim observations · 2026 Q3'))}</h3><p>${t(pair('目标覆盖7—9月，实际披露尚不完整。仅完整且同口径的季度数据对照Q2—Q3；单月和跨期累计另列。H1仍为默认复盘窗口。','The target period is July–September; disclosure is incomplete. Only matching full-quarter data is compared across Q2–Q3; monthly and cross-period cumulative observations stay separate. H1 remains the default review.'))}</p></div><div class="calendar calendar-q3"><span>Q1 · ${t(pair('1—3月','Jan–Mar'))}</span><span>Q2 · ${t(pair('4—6月','Apr–Jun'))}</span><span class="on">Q3 · ${t(pair('7—9月','Jul–Sep'))}</span><span class="semester">H1 = Q1 + Q2 · ${t(pair('默认复盘 · 不含Q3','Default review · Excludes Q3'))}</span></div></div>`;}
function q3Availability(){
  const c=Object.values(q3Coverage[market]),full=c.filter(x=>x.state==='complete').length,partial=c.filter(x=>x.state==='partial').length;
  return `<div class="disclosure-strip"><div><b>${t(pair('数据披露进度','Disclosure progress'))}</b><span>${t(pair('截至2026年10月18日；统计期与发布日期分开','As of October 18, 2026; observation and release dates are separate'))}</span></div><div><strong>${full}/8</strong>${t(pair('产业主指标覆盖完整Q3','Sector primary metrics cover full Q3'))}</div><div><strong>${partial}</strong>${t(pair('产业有部分期间或补充证据','Sectors have partial-period or supporting evidence'))}</div><div><strong>—</strong>${t(pair('其余指标按披露状态留空','Other metrics remain blank by disclosure status'))}</div></div>`;
}
function q3Ledger(){
  const visible=rows.filter(inWindow),main=visible.filter(r=>!r.contextFor),context=visible.filter(r=>r.contextFor);
  const table=list=>`<div class="table-wrap"><table><thead><tr>${[pair('指标','Metric'),pair('统计期','Period'),pair('数值 / 单位','Value / unit'),pair('性质与口径','Status and definition'),pair('来源','Source')].map(n=>`<th>${t(n)}</th>`).join('')}</tr></thead><tbody>${list.map(r=>`<tr><td>${t(r.name)}</td><td>${esc(r.period)}</td><td>${vizNum(r.value)} ${typeof r.unit==='string'?esc(r.unit):t(r.unit)}</td><td>${status(r.status)}<br>${t(r.note)}</td><td>${ref(r.inputs)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<details id="ledger"><summary>${t(pair('Q3及季度内月度数据台账','Q3 and within-quarter monthly ledger'))} · ${main.length}</summary>${table(main)}</details><details id="context-ledger"><summary>${t(pair('跨期累计背景 · 不属于完整Q3','Cross-period cumulative context · Not full Q3'))} · ${context.length}</summary>${table(context)}</details>`;
}
function q3SourceBlock(){return `<p>${t(pair('Q3新增来源于2026年10月18日逐项核对发布机构、统计期、单位及正文表格。Q1／Q2／H1保留2026年9月6日版的核验日期；本次没有重新核验全部历史来源。','New Q3 evidence was checked on October 18, 2026 for publisher, period, unit and body tables. Q1/Q2/H1 retain the September 6 edition verification date; all historical sources were not rechecked.'))}</p><div class="note">${t(pair('Q3=7—9月，H1=1—6月，1—9月累计不是Q3。只有同口径累计流量才作差分，保留原数与公式；存量不相减冒充发生额，比率不平均，月同比不平均成季度同比。缺口不导出为0。CSV标明所选窗口、观察期间、跨期背景及核验日期。','Q3=July–September; H1=January–June; January–September cumulative is not Q3. Only matching cumulative flows are differenced, preserving inputs and formula. Stocks do not masquerade as flows; ratios and monthly YoY are not averaged into quarter results. Gaps are not exported as zero. CSV identifies the selected window, observation period, cross-period context and verification date.'))}</div>${q3Ledger()}<details id="coverage-ledger"><summary>${t(pair('查看八产业主指标缺口与披露依据','Inspect eight-sector primary-metric gaps and disclosure evidence'))}</summary><div class="coverage-list">${Object.entries(q3Coverage[market]).map(([id,c])=>`<article>${q3State(c.state)}<h4>${t(sectorSeries[market].find(s=>s.id===id)?.name||researchNames[id])}</h4><p>${t(c.note)} ${ref(c.ids)}</p></article>`).join('')}</div></details><h3>${t(pair('本次核验来源目录','Sources checked for this update'))}</h3><div class="source-list">${Object.entries(q3Sources).map(([id,s])=>`<article class="source"><b>${id}</b> · ${esc(s.publisher)} · ${esc(s.date)}<br><a href="${s.url}" target="_blank" rel="noopener noreferrer">${t(s.title)} ↗</a><div class="meta">${t(s.note)}</div></article>`).join('')}</div>`;}
function renderQ3(){
  document.documentElement.lang=lang==='en'?'en':'zh-CN';
  for(const [id,text] of [['market-label',pair('市场视角','MARKET')],['period-label',pair('时间窗口','PERIOD')],['lang-label',pair('语言','LANGUAGE')],['csv',pair('下载数据 CSV','Export data CSV')],['print',pair('打印 / PDF','Print / PDF')]])document.getElementById(id).textContent=plain(text);
  document.querySelector('#market option[value="cn"]').textContent=plain(pair('中国国内','China'));
  document.querySelector('#market option[value="world"]').textContent=plain(pair('国际市场','International'));
  const cn=market==='cn',title=cn?pair('物流景气回升，增长兑现仍需分产业观察','Logistics sentiment improves; outcomes vary by sector'):pair('航空需求继续增长，季度全貌等待披露','Air demand grows; the full quarter awaits disclosure');
  const summary=cn?pair('7—9月物流业景气指数逐月上行；新能源汽车出口已有全季流量。工业产品和快递目前仅纳入部分月份，宏观物流规模不填入未经核验的Q3值。','The logistics prosperity index rose across July–September; NEV exports have a full-quarter flow. Industrial output and parcels cover only disclosed months, with no unverified Q3 macro logistics total.'):pair('7、8月航空货运需求同比增长，8月运力同比收缩。特斯拉已公布全季储能部署；主要企业财务与9月货运、注册数据按披露进度保留缺口。','Air cargo demand grew YoY in July and August, while August capacity contracted. Tesla has reported full-quarter storage deployment; company financials and September freight/registration figures remain subject to release availability.');
  let html=`<div class="hero"><div><div class="eyebrow">2026 Q3 · ${t(pair('供应链行业研究 · 阶段性观察','SUPPLY CHAIN RESEARCH · INTERIM OBSERVATIONS'))}</div><h1>${t(title)}</h1><p>${t(summary)} ${ref(cn?['QL7','QL8','QL9','QV9']:['A7','A8','QT3'])}</p></div><aside><div class="tag">${t(pair('Q3阶段性观察 · 披露尚不完整','Q3 interim observations · Incomplete disclosure'))}</div><p>${t(pair('中国国内与国际市场 · 中英双语','China and international markets · Bilingual'))}</p><div class="meta">2026.07.01 — 09.30<br>${t(pair('Q3新增来源核验：2026年10月18日','Q3 new-source verification: October 18, 2026'))}<br>${t(pair('含期后披露；截至核验日可得的固定预览','Includes later releases; fixed preview of evidence available by the verification date'))}</div></aside></div>`;
  html+=`<nav>${[['overview','行业综述','Overview'],['performance','市场表现','Performance'],['sectors','重点细分产业','Sector focus'],['dimensions','经营与风险','Operations & risk'],['news','行业动态','Developments'],['topics','热门议题','Key issues'],['trends','行业趋势','Outlook'],['sources','来源与方法','Sources & method']].map(([id,zh,en])=>`<a href="#${id}">${t(pair(zh,en))}</a>`).join('')}</nav><p class="live" aria-live="polite">${t(cn?pair('当前视图：中国国内 · Q3阶段性观察 · 2026.07.01—09.30','Current view: China · Q3 interim observations · 2026.07.01–09.30'):pair('当前视图：国际市场 · Q3阶段性观察 · 2026.07.01—09.30','Current view: International · Q3 interim observations · 2026.07.01–09.30'))}</p>`;
  html+=q3Guide()+q3Availability();
  html+=`<div class="kpis">${cn?
    metric(pair('9月物流业景气指数','September logistics prosperity index'),51.5,pair('指数点','index points'),pair('9月单月 · 50为临界点','September only · Threshold 50'),['QL9'])+metric(q3Nev.name,q3Nev.value,q3Nev.unit,pair('完整Q3 · 累计流量差分','Full Q3 · Difference of cumulative flows'),['QV9','QV6'])+metric(pair('Q3社会物流总额','Q3 total social logistics'),'—',pair('万亿元','CNY trillion'),pair('全季同口径值未核验','Matching full-quarter value unverified'),[]):
    metric(pair('8月航空货运需求同比','August air cargo demand YoY'),4.4,'%',pair('8月单月 · 不是Q3累计同比','August only · Not Q3 cumulative YoY'),['A8'])+metric(q3Tesla.name,13.7,q3Tesla.unit,pair('完整Q3 · 企业案例','Full Q3 · Company case'),['QT3'])+metric(pair('Q3航空需求累计同比','Q3 cumulative air cargo demand YoY'),'—','%',pair('9月及季度累计值未核验','September and quarterly cumulative value unverified'),[])}</div>`;
  html+=section('01','overview',pair('行业综述','Industry overview'),`<div class="grid"><p>${t(cn?pair('先用月度景气判断方向，再用行业流量判断规模。物流业景气指数与制造业PMI的调查范围不同，不能互相替代；各产业的实物流量、资金和利润仍可能出现分化。','Use monthly sentiment for direction and sector flows for scale. Logistics prosperity and manufacturing PMI survey different populations and are not substitutes; physical flows, cash and profit can still diverge.'):pair('需求、运力、载运率与财务收益是不同层次。航空货运月度恢复并不等于全球贸易或所有运输方式的Q3表现；企业储能部署也不能扩展为行业规模。','Demand, capacity, load factor and financial returns are different measures. Monthly air cargo does not establish Q3 outcomes for global trade or every transport mode; company storage deployment is not an industry total.'))}</p><div class="note">${t(pair('本页按实际覆盖期阅读。7—8月不是完整Q3；1—8月和1—9月累计只能作跨期背景或计算输入。所有“—”表示本报告未取得已核验的同口径观察值。','Read every observation by its actual period. July–August is not full Q3; January–August and January–September totals are cross-period context or calculation inputs. Every dash means this report lacks a verified matching observation.'))}</div></div>`);
  const charts=cn?
    q3LineChart(pair('物流景气：季度内逐月回升','Logistics sentiment: improvement within the quarter'),[{name:pair('物流业景气指数','Logistics prosperity index'),values:q3Lpi,color:VIZ.TEAL}],{min:49,max:52,ticks:[49,50,51,52],threshold:50,ids:['QL7','QL8','QL9'],note:pair('三个月均高于50临界点。扩散指数反映景气，不是物流业务量增速；不将三个月平均称为Q3累计增长。','All three months exceed 50. A diffusion index measures sentiment, not logistics volume growth; a three-month average is not Q3 cumulative growth.')})+
    q3LineChart(pair('制造业：订单先于规模判断','Manufacturing: orders inform the scale assessment'),[{name:pair('制造业PMI','Manufacturing PMI'),values:q3Pmi,color:VIZ.BLUE},{name:pair('新订单指数','New-orders index'),values:q3Orders,color:VIZ.ORANGE,dash:true}],{min:48,max:52,ticks:[48,49,50,51,52],threshold:50,ids:['QPMI'],note:pair('季调扩散指数；9月PMI回到50以上，但月度指数不等于Q3工业增加值增速。','Seasonally adjusted diffusion indices; September PMI returned above 50, but monthly indices do not measure Q3 industrial value-added growth.')}):
    q3LineChart(pair('航空货运：已披露月份与9月缺口','Air cargo: disclosed months and the September gap'),[{name:pair('需求CTK同比','Demand CTK YoY'),values:[3.9,4.4,null],color:VIZ.BLUE},{name:pair('运力ACTK同比','Capacity ACTK YoY'),values:[1.7,-0.1,null],color:VIZ.ORANGE,dash:true}],{min:-1,max:6,ticks:[-1,0,2,4,6],missingSeptember:true,ids:['A7','A8'],note:pair('7—8月月同比；9月明确留空。两个月同比不平均为Q3同比，不补画9月趋势线。','July–August monthly YoY; September is explicitly missing. Two monthly rates are not averaged into Q3 growth, and no September trend is extrapolated.')})+
    `<div class="signal-card"><div class="eyebrow">${t(pair('8月供需信号 · 非季度指标','August demand / supply · Not quarterly'))}</div><h3>${t(pair('需求扩张，运力收缩','Demand expands while capacity contracts'))}</h3><div class="signal-pair"><div><span>CTK YoY</span><strong>+4.4%</strong></div><div><span>ACTK YoY</span><strong>−0.1%</strong></div></div><p>${t(pair('8月总市场载运率为46.0%。分析关注舱位可得性、燃油附加费与交付波动，不能仅由载运率推导运价或利润。','August total-market load factor was 46.0%. Monitor available lift, fuel surcharges and delivery variability; load factor alone does not establish freight rates or profit.'))} ${ref(['A8'])}</p><div class="note">${t(pair('马士基Q3报告计划11月5日发布；本页不把Q2量价表现当作Q3。','Maersk Q3 report is scheduled for November 5; Q2 volume and rates are not reused as Q3 results.'))} ${ref(['QMAERSK'])}</div></div>`;
  html+=section('02','performance',pair('市场表现','Market performance'),`<div class="grid">${charts}</div>${cn?`<details class="context-only"><summary>${t(pair('跨期背景：1—8月社会物流规模','Cross-period context: January–August logistics scale'))}</summary><p>${t(pair('1—8月社会物流总额243.6万亿元、可比价格同比4.9%。包含H1且缺少9月，不能标作Q3规模或Q3同比。','January–August social logistics totalled CNY 243.6 trillion, +4.9% YoY at comparable prices. It includes H1 and excludes September; neither figure is a Q3 observation.'))} ${ref(['QC8'])}</p></details>`:''}`);
  html+=section('03','sectors',pair('重点细分产业','Sector focus'),q3SectorBlock());
  const news=cn?[
    ['2026.07—09',pair('物流景气逐月上行','Logistics sentiment rises month by month'),pair('物流业景气指数连续三个月高于50；该判断只涉及扩散指数，不替代物流总量统计。','The logistics prosperity index exceeded 50 in all three months; this diffusion-index observation does not substitute for logistics totals.'),['QL7','QL8','QL9']],
    ['2026 Q3 · 2026.10.12',pair('新能源汽车出口形成完整季度读数','NEV exports yield a full-quarter reading'),pair('1—9月与H1出口累计差分得到Q3约165.1万辆；已在台账保留两个原始来源。','January–September minus H1 exports gives approximately 1.651m vehicles in Q3; both source inputs are retained in the ledger.'),['QV9','QV6']],
    ['2026.08 · 2026.09.20',pair('数据服务用电提供需求侧线索','Data-services electricity offers demand-side evidence'),pair('8月互联网数据服务用电同比增长37.9%；范围包含非AI业务，不外推为AI算力利用率。','August internet data-services electricity grew 37.9% YoY; its scope includes non-AI services and does not establish AI capacity utilization.'),['QPOWER']]
  ]:[
    ['2026.07—08',pair('航空需求保持同比增长','Air demand continues to grow YoY'),pair('两个月总市场CTK均增长；9月尚未纳入，因此不形成Q3累计结论。','Total-market CTK grew in both months; September is not included, so no Q3 cumulative conclusion is made.'),['A7','A8']],
    ['2026 Q3 · 2026.10.02',pair('储能运营量先于财务披露','Storage operating volumes precede financials'),pair('特斯拉Q3部署13.7GWh；财务结果计划10月21日公布，部署量不能证明利润。','Tesla deployed 13.7 GWh in Q3; financial results are scheduled for October 21, so deployment does not establish profit.'),['QT3']],
    ['2026.09.24',pair('欧洲电动车注册只覆盖前8月','EU electric registrations cover eight months'),pair('ACEA当前可核验为1—8月BEV注册1,641,333辆；9月计划10月22日发布。','The verified ACEA observation is 1,641,333 BEV registrations in January–August; September is scheduled for October 22.'),['QB8','QBCAL']]
  ];
  html+=section('04','news',pair('行业动态','Industry developments'),`<div class="facts">${news.map(a=>fact(...a)).join('')}</div>`);
  const topics=cn?[
    [pair('01 / 需求与成本','01 / Demand and costs'),pair('9月制造业购进价格指数60.8、出厂价格指数54.0。分析需核对合同调价和成本传导，两指数差值不代表毛利。','September input/output price indices were 60.8 and 54.0. Examine contract repricing and cost transmission; the index gap is not gross margin.'),['QPMI']],
    [pair('02 / 出口履约','02 / Export execution'),pair('以完整Q3新能源汽车出口流量安排船期与备件；目的国集中度缺少同口径分布时继续留空。','Use full-Q3 NEV export flows to assess sailings and spare parts; destination concentration remains blank without matching geographic data.'),['QV9','QV6']],
    [pair('03 / 周转与资金','03 / Turnover and cash'),pair('景气改善和月度产量上升仍需订单验收、库存天数与回款支持；不能由生产量替代现金回收效率。','Better sentiment and monthly output still require acceptance, inventory days and collections evidence; production is not cash-conversion efficiency.'),['QL9','QN8']]
  ]:[
    [pair('01 / 供需与价格','01 / Supply, demand and pricing'),pair('8月航空需求与运力分化。观察实际舱位和总到岸成本，不把单月供需差外推为季度运价。','August demand and capacity diverged. Assess available lift and landed cost without turning one-month conditions into quarterly freight rates.'),['A8']],
    [pair('02 / 运营与收益','02 / Operations and returns'),pair('储能部署先行、财务后到；先核对项目交付，再核对成本、质保与经营现金流。','Storage deployment precedes financial reporting; verify delivery, then costs, warranties and operating cash flow.'),['QT3']],
    [pair('03 / 地区风险','03 / Geographic risk'),pair('航线增长差异不等于产能或供应商集中度。区域CR3仍需完整地区分布与同口径分母。','Differences in route growth are not capacity or supplier concentration. Geographic CR3 still requires a complete distribution and matching denominator.'),['A8']]
  ];
  html+=section('05','topics',pair('热门议题','Key industry issues'),`<p class="meta">${t(pair('基于已核验资料的编辑归纳，非热搜排名或统计评分。','Editorial themes from verified evidence, not search rankings or statistical scores.'))}</p><div class="topics">${topics.map(([name,body,ids])=>`<article class="topic"><h3>${t(name)}</h3><p>${t(body)}</p>${ref(ids)}</article>`).join('')}</div>${cn?q3PriceChart():''}`);
  const trends=cn?[
    [pair('从景气到交付','From sentiment to delivery'),pair('分析观察：确认新订单能否转化为排产、验收与回款，避免把景气回升直接解读为利润改善。','Analyst priority: follow new orders into production, acceptance and collection; improved sentiment does not itself establish better profit.')],
    [pair('算力与电力协同','Compute and power coordination'),pair('分析观察：将设备到货、供电条件与可计费负载一起跟踪；互联网数据服务电量保持独立口径。','Analyst priority: track equipment arrival, power availability and billable load together; keep data-services electricity on its own basis.')],
    [pair('补齐季度证据','Complete quarter evidence'),pair('后续优先核验9月工业产品表、Q3物流累计数据及细分经营指标；新增数据需保留修订版本。','Next verification priorities are September industrial products, Q3 logistics totals and sector operating metrics, with revision versions retained.')]
  ]:[
    [pair('财报窗口','Financial release window'),pair('已确认计划：微软与GE Vernova为10月28日，AutoStore为11月5日。披露后再补实际资本支出、分部利润和订单。','Confirmed schedules: Microsoft and GE Vernova on October 28, AutoStore on November 5. Add actual capex, segment profit and orders after release.')],
    [pair('验证旺季运力','Verify peak-season lift'),pair('分析观察：结合9月货运与航线实际可用运力评估供需，现有两个月数据不足以确定整个Q3。','Analyst priority: assess September cargo and usable route capacity; two disclosed months do not establish the whole quarter.')],
    [pair('保留地理分母','Retain geographic denominators'),pair('分析观察：产品、地区划分、时间与计量单位一致后才计算集中度；未知不表示低风险。','Analyst priority: compute concentration only after product, geography, time and units match; unknown does not mean low risk.')]
  ];
  html+=section('06','trends',pair('行业趋势与观察清单','Outlook and monitoring priorities'),`<div class="tag warn">${t(pair('前瞻分析与已确认发布计划 · 非实际结果','Forward-looking analysis and confirmed schedules · Not actual outcomes'))}</div>${trends.map(([name,body],i)=>`<div class="trend"><h3>${t(name)}</h3><div>${t(body)} ${!cn&&i===0?ref(['QMCAL','QGCAL','QACAL']):''}</div></div>`).join('')}`);
  html+=section('07','sources',pair('来源验证与数据方法','Source verification and methodology'),q3SourceBlock());
  html+=`<footer>SC / INTELLIGENCE · 2026 Q3 · ${t(pair('阶段性观察','Interim observations'))}<br>${t(pair('仅用于个人学习，非商业用途。原创内容采用CC BY-NC 4.0；第三方材料保留各自权利。正文、图表与切换可离线使用，来源链接需联网。','For personal learning and noncommercial use. Original content is CC BY-NC 4.0; third-party rights remain with their owners. Content, charts and filters work offline; source links require internet.'))}</footer>`;
  return html;
}
function syncPeriodLabels(){
  document.querySelector('#period option[value="H1"]').textContent='2026 H1 · '+(lang==='bi'?'半年复盘 / Review':plain(pair('半年复盘','Half-year review')));
  document.querySelector('#period option[value="Q3"]').textContent='2026 Q3 · '+(lang==='bi'?'阶段性观察 / Interim':plain(pair('阶段性观察','Interim observations')));
}
function q3Entry(){
  if(period!=='H1')return '';
  return `<aside class="q3-entry"><div><span class="tag warn">${t(pair('延伸阅读','Further reading'))}</span><strong>${t(pair('Q3阶段性观察','Q3 interim observations'))}</strong><p>${t(pair('已纳入部分新披露证据；季度数据仍不完整，有完整同口径数据才进行Q2—Q3比较。','Newly disclosed evidence is included; quarter coverage remains incomplete. Q2–Q3 comparisons require matching full-quarter data.'))}</p></div><button type="button" data-open-q3>${t(pair('查看阶段性观察 →','View interim observations →'))}</button></aside>`;
}
document.getElementById('report').addEventListener('click',e=>{
  if(!e.target.closest?.('[data-open-q3]'))return;
  period='Q3';document.getElementById('period').value=period;render();
  window.scrollTo?.({top:0,behavior:'auto'});
});
