#!/usr/bin/env node
/* 指标引擎断言与数据集分布自检：node scripts/verify_engine.js */
const fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '../assets/engine.js'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/dataset.json'), 'utf8'));
const E = global.Engine;
const R = E.compute(data, {});

let errors = [], checks = 0;
const assert = (cond, msg) => { checks++; if (!cond) errors.push(msg); };

// z 值表单调性与常量
const zs = E.Z_TABLE;
assert(zs['0.90'] < zs['0.95'] && zs['0.95'] < zs['0.99'], 'z 表非单调');
assert(Math.abs(zs['0.975'] - 1.96) < 1e-6, 'z(97.5%) 常量错误');
// z 取值：数值/字符串入参、表内档位、自定义档位三段逼近、单调性
assert(Math.abs(E.zFor(0.9) - 1.2816) < 1e-9, 'zFor(0.9) 应命中 Z_TABLE["0.90"]');
assert(Math.abs(E.zFor('0.90') - 1.2816) < 1e-9, 'zFor("0.90") 应命中查表');
[0.85, 0.90, 0.93, 0.95, 0.97, 0.975, 0.98, 0.99, 0.995, 0.999].forEach((c, i, arr) => {
  const z = E.zFor(c);
  assert(isFinite(z) && z > 0, `zFor(${c}) 非正或非有限：${z}`);
  if (i) assert(z > E.zFor(arr[i - 1]), `z 非单调：${c}`);
});
assert(Math.abs(E.zFor(0.97) - 1.8808) < 0.002, '自定义 97% 档 z 值偏离标准值');
assert(Math.abs(E.zFor(0.98) - 2.0537) < 0.002, '自定义 98% 档 z 值偏离标准值');
assert(Math.abs(E.zFor(0.5)) < 1e-9, 'z(50%) 应为 0');
assert(Math.abs(E.zFor(0.02) + 2.0537) < 0.002, '低尾档 z 值偏离标准值');
// CSL 90% 的 SS 必须为正且小于 95%（此前 90% 档查表失败会得到负 SS）
const R90 = E.compute(data, { csl: 0.90 });
const ss = r => r.skus.reduce((a, s) => a + s.m.ss, 0);
assert(ss(R90) > 0 && ss(R90) < ss(R), `CSL 90% 的 SS 合计异常：${ss(R90)} vs ${ss(R)}`);

R.skus.forEach(s => {
  const m = s.m;
  assert(m.obsolete + m.excess <= m.onHand + 0.001, `E&O 超过现货：${s.id}`);
  assert(m.eoValue <= m.onHandValue + 0.001, `E&O 金额超过库存金额：${s.id}`);
  assert(m.available + s.reserved + s.quarantine + s.blocked === m.onHand, `状态桶不闭合：${s.id}`);
  assert(m.ss >= 0 && isFinite(m.ss), `SS 非法：${s.id}`);
  assert(m.rop >= m.dbar * m.L - 0.001, `ROP 低于提前期需求：${s.id}`);
  assert(m.maxTarget >= m.rop - 0.001, `目标上限低于 ROP：${s.id}`);
  if (m.dbar === 0) assert(m.wos === null, `零需求 WOS 应为 null：${s.id}`);
  const bucketSum = m.ageBuckets.reduce((a, b) => a + b.qty, 0);
  assert(bucketSum === m.onHand, `库龄分桶与现货不等：${s.id} ${bucketSum} vs ${m.onHand}`);
});

// 自查修复项回归：售罄率 / 缺货日期 / 预警同口径 / E&O 三口径 / 可执行补货量 / 导入兜底
R.skus.forEach(s => {
  const m = s.m;
  assert(m.sellThrough === null || (m.sellThrough >= 0 && m.sellThrough <= 1), `售罄率越界：${s.id} ${m.sellThrough}`);
  assert(m.grossEoValue + 1e-6 >= m.eoValue, `净敞口大于毛敞口：${s.id}`);
  assert(Math.abs(m.grossEoValue - m.provisionValue - m.eoValue) < 0.01, `E&O 三口径不闭合：${s.id}`);
  assert(m.suggestQty === 0 || (m.suggestQty >= m.moq && m.suggestQty % m.packSize === 0), `可下单量未按批量取整：${s.id}`);
  if (m.stockoutDate) {
    const local = new Date(new Date(data.meta.snapshot_date + 'T00:00:00').getTime() + m.stockoutIdx * 7 * 86400000);
    const iso = local.getFullYear() + '-' + String(local.getMonth() + 1).padStart(2, '0') + '-' + String(local.getDate()).padStart(2, '0');
    assert(m.stockoutDate === iso, `缺货日期时区偏移：${s.id} ${m.stockoutDate} vs ${iso}`);
  }
});
R.alerts.filter(a => a.rule === 'STOCKOUT').forEach(a => {
  const s = R.skus.find(x => x.id === a.sku);
  assert(a.current === Math.round(s.m.minPaInLead), `缺货预警当前值与触发口径不一致：${a.sku}`);
});
assert(R.alerts.filter(a => a.rule === 'BUFFER').length === R.skus.filter(s => s.m.tags.includes('BUFFER')).length,
  'BUFFER 预警与 SKU 标签不一致');
assert(Math.abs(R.kpis.grossEoValue - R.kpis.provisionValue - R.kpis.eoValue) < 0.01, 'KPI E&O 三口径不闭合');
// 导入场景：无 age_buckets / 无 pos / 无缺货历史
const imported = JSON.parse(JSON.stringify(data));
delete imported.params.age_buckets; imported.pos = [];
imported.skus = imported.skus.slice(0, 3).map(s => { delete s.stockout_weeks; return s; });
let importOk = true;
try { const ri = E.compute(imported, {}); importOk = ri.kpis.instockWeekRate === null && ri.skus[0].m.ageBuckets.length > 0; }
catch (e) { importOk = false; }
assert(importOk, '导入场景兜底失败（age_buckets / pos / 缺货历史）');
// 真实单位成本口径
const costTest = JSON.parse(JSON.stringify(data));
costTest.skus = [JSON.parse(JSON.stringify(data.skus[0]))];
costTest.skus[0].unit_cost = 99; costTest.pos = [];
assert(Math.abs(E.compute(costTest, { cost_basis: 'supplied' }).skus[0].m.unitCost - 99) < 1e-9, 'supplied 成本口径未生效');
assert(E.compute(costTest, { cost_basis: 'estimated' }).skus[0].m.unitCost < 99, 'estimated 成本口径未生效');
// 非法参数不得产生 Infinity
assert(E.compute(data, { horizon_weeks: 0 }).skus.every(s => isFinite(s.m.minPa)), 'horizon_weeks=0 产生 Infinity');
assert(E.compute(data, { lead_factor: -1 }).skus.every(s => s.m.ss >= 0), '负提前期系数产生非法 SS');

// ---------------------------------------------------------------- ABC×XYZ 差异化服务水平
const SEG = E.SEGMENT_KEYS;
const RM = E.compute(data, { segment_csl: 'matrix' });
const sumSS = r => r.skus.reduce((a, s) => a + s.m.ss, 0);

// 1. 分类字段完整性与守恒（默认全局模式）
assert(SEG.length === 9 && new Set(SEG).size === 9, '九宫格 key 不唯一');
R.skus.forEach(s => {
  const m = s.m;
  assert(['A', 'B', 'C'].includes(m.abc) && ['X', 'Y', 'Z'].includes(m.xyz), `分类非法：${s.id} ${m.abc}${m.xyz}`);
  assert(m.segment === m.abc + m.xyz, `策略格与分类不一致：${s.id}`);
  assert(Math.abs(m.cslEff - R.params.csl) < 1e-12, `默认模式 CSL 应统一：${s.id}`);
  assert(m.ssModel === 'normal', `默认模式不应启用经验分位：${s.id}`);
  assert(m.cv === null || m.cv >= 0, `CV 非法：${s.id}`);
  assert(m.zeroRate >= 0 && m.zeroRate <= 1, `零需求周占比越界：${s.id}`);
  assert(m.ssNormal >= 0 && isFinite(m.ssNormal), `正态对照 SS 非法：${s.id}`);
  if (m.xyz === 'X') assert(m.cv !== null && m.cv <= R.params.xyz_cv_x && m.zeroRate <= R.params.xyz_zero_x, `X 类判定错误：${s.id}`);
  if (m.xyz === 'Y') assert(m.cv !== null && m.cv <= R.params.xyz_cv_y && m.zeroRate <= R.params.xyz_zero_y, `Y 类判定错误：${s.id}`);
});
assert(R.kpis.segments.reduce((a, x) => a + x.skus, 0) === R.skus.length, '九宫格 SKU 数不守恒');
assert(Math.abs(R.kpis.segments.reduce((a, x) => a + x.ss, 0) - R.kpis.segmentSummary.ssTotal) < 0.01, '九宫格 SS 与汇总不闭合');
assert(Math.abs(R.kpis.segments.reduce((a, x) => a + x.onHandValue, 0) - R.kpis.inventoryValue) < 0.01, '九宫格库存额与汇总不闭合');
// 2. 默认模式必须完全兼容既有交付数值
assert(Math.abs(sumSS(R) - 65090) < 1, `默认 SS 合计回归：${sumSS(R)}`);
assert(Math.abs(R.skus.find(s => s.id === '22423').m.ss - 391.74) < 1, 'SKU 22423 的 SS 偏离历史基线');
assert(R.kpis.segmentSummary.mode === 'global', '默认策略模式应为 global');

// 3. 差异化模式：矩阵 CSL、单调性、经验分位模型
RM.skus.forEach(s => {
  const m = s.m;
  assert(Math.abs(m.cslEff - RM.params.csl_matrix[m.segment]) < 1e-12, `矩阵 CSL 未生效：${s.id}`);
  assert(Math.abs(m.z - E.zFor(m.cslEff)) < 1e-9, `z 与生效 CSL 不一致：${s.id}`);
  assert(m.ss >= 0 && isFinite(m.ss) && m.rop >= m.dbar * m.L - 0.001, `差异化 SS/ROP 非法：${s.id}`);
  if (m.ssModel === 'empirical') {
    assert(m.qLtd !== null && isFinite(m.qLtd), `经验分位数缺失：${s.id}`);
    assert(Math.abs(m.rop - m.qLtd) < 0.001, `经验分位口径下 ROP 应等于 Q_LTD：${s.id}`);
  } else {
    assert(Math.abs(m.ss - m.ssNormal) < 1e-9, `非经验分位模型 SS 应等于正态对照：${s.id}`);
  }
});
assert(RM.kpis.segmentSummary.empiricalCount > 0, '差异化模式未启用任何经验分位 SKU');
assert(RM.kpis.segmentSummary.empiricalCount + RM.kpis.segmentSummary.fallbackCount ===
  RM.skus.filter(s => s.m.xyz === 'Z' && s.m.dbar > 0).length, 'Z 类模型计数不闭合');
const hi = E.compute(data, { segment_csl: 'matrix', csl_matrix: Object.fromEntries(SEG.map(k => [k, 0.995])) });
const lo = E.compute(data, { segment_csl: 'matrix', csl_matrix: Object.fromEntries(SEG.map(k => [k, 0.85])) });
assert(sumSS(hi) > sumSS(RM) && sumSS(RM) > sumSS(lo), 'CSL 矩阵档位与 SS 非单调');
assert(R.kpis.segmentSummary.empiricalCount === 0 && RM.alerts.length >= R.alerts.length - 1, '策略切换未联动预警');

// 4. 经验分位卷积函数：常数需求 / 零需求 / 分位数单调
assert(Math.abs(E.quantileLtd(new Array(26).fill(10), 2, 0.95, 64) - 20) < 0.001, '常数需求的 LTD 分位数应为 20 件');
assert(E.quantileLtd(new Array(26).fill(0), 3, 0.99, 64) === 0, '全零需求的 LTD 分位数应为 0');
[0.85, 0.9, 0.95, 0.99].forEach((c, i, a) => {
  if (i) assert(E.quantileLtd(data.skus[0].weekly.slice(-26), 3, c, 64) >=
    E.quantileLtd(data.skus[0].weekly.slice(-26), 3, a[i - 1], 64), 'LTD 分位数非单调');
});

// 5. 分类基于全量 SKU：supplied 模式下子集分类不变；computed 模式有兜底
const subset = Object.assign({}, data, { skus: data.skus.slice(0, 5), pos: [] });
const subR = E.compute(subset, {});
subset.skus.forEach((s, i) => assert(subR.skus[i].m.abc === s.abc, `子集改变了主数据 ABC：${s.id}`));
const noAbc = JSON.parse(JSON.stringify(data));
noAbc.skus.forEach(s => { delete s.abc; });
const compR = E.compute(noAbc, {});
assert(compR.kpis.segmentSummary.abcSource === 'computed', '缺 ABC 主数据未回退帕累托重算');
assert(new Set(compR.skus.map(s => s.m.abc)).size === 3, 'computed 模式未产出 A/B/C 三档');
// 6. 非法矩阵参数必须被钳制，不得产生 NaN / Infinity
const bad = E.compute(data, { segment_csl: 'matrix', csl_matrix: { AX: 5, BY: -1 }, xyz_cv_x: 99 });
assert(bad.skus.every(s => isFinite(s.m.ss) && s.m.cslEff > 0 && s.m.cslEff < 1), '非法矩阵参数未被钳制');
assert(E.compute(data, { segment_csl: 'bogus' }).kpis.segmentSummary.mode === 'global', '非法策略模式未回退');

console.log('=== 断言 ===');
console.log(errors.length ? errors.slice(0, 20).join('\n') : '全部通过 (' + checks + ' 项检查)');

const K = R.kpis;
console.log('\n=== KPI 摘要 ===');
console.log('SKU 数 / PO 数          ', K.skuCount, '/', K.poCount);
console.log('库存金额 / 可用金额      ', E.money(K.inventoryValue), '/', E.money(K.availableValue), E.pct(K.availableRate));
console.log('在途量 / 在途金额        ', E.qty(K.inTransit), '/', E.money(K.inTransitValue));
console.log('未清 PO / 金额 / 逾期    ', K.openPoCount, '/', E.money(K.openPoValue), '/', K.overduePoCount);
console.log('缺货风险 / 补货 / 超储 / 呆滞 SKU', K.stockoutSku, '/', K.replenishSku, '/', K.overstockSku, '/', K.staleSku);
console.log('加权 WOS / 年化周转 / DIO', E.dec(K.wosWeighted), '/', E.dec(K.turnoverAnnual), '/', E.dec(K.dio, 0));
console.log('动销率 / E&O 占比 / 平均库龄', E.pct(K.activeRate), '/', E.pct(K.eoRatio), '/', E.dec(K.avgAge, 0) + '天');
console.log('回放期 CSL 观测           ', E.pct(K.cslObserved));

const cnt = (arr, f) => arr.reduce((o, x) => (o[f(x)] = (o[f(x)] || 0) + 1, o), {});
console.log('\n=== 预警规则分布 ===', cnt(R.alerts, a => a.rule));
console.log('=== 严重度分布 ===', cnt(R.alerts, a => a.severity));
console.log('=== PO 状态分布 ===', cnt(R.pos, p => p.status));
const ages = R.skus.flatMap(s => s.batches.map(b => b.age_days));
console.log('=== 批次库龄 ===', 'n=' + ages.length,
  'min=' + Math.min(...ages), 'max=' + Math.max(...ages),
  '>90d=' + ages.filter(a => a > 90).length, '>180d=' + ages.filter(a => a > 180).length);
console.log('=== 品类 ===', K.byCategory.map(c => c.category.split(' / ')[0] + ':' + c.skus).join(' | '));
console.log('=== 标签分布 ===', cnt(R.skus.flatMap(s => s.m.tags), t => t));
console.log('=== 参数联动 ===');
const R2 = E.compute(data, { csl: 0.99 });
console.log('CSL 95%→99%：SS 合计', E.qty(R.skus.reduce((a, s) => a + s.m.ss, 0)), '→',
  E.qty(R2.skus.reduce((a, s) => a + s.m.ss, 0)), '| ROP 触发', K.replenishSku, '→', R2.kpis.replenishSku,
  '| 冗余金额', E.money(K.eoValue), '→', E.money(R2.kpis.eoValue));
process.exit(errors.length ? 1 : 0);
