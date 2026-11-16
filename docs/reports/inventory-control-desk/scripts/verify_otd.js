#!/usr/bin/env node
/* 供应商实测 OTD 滚动更新 L / σ_L · 数据层 + 引擎层专项断言
 * 运行：node scripts/verify_otd.js
 */
const fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '../assets/engine.js'));
const E = global.Engine;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/dataset.json'), 'utf8'));
const snap = data.meta.snapshot_date;

let checks = 0, errors = [];
const assert = (cond, msg) => { checks++; if (!cond) errors.push(msg); };
const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-6 : eps);
const sumSS = r => r.skus.reduce((a, s) => a + s.m.ss, 0);
const finite = v => v === null || (isFinite(v) && v >= 0);

console.log('=== 数据层：交付实测证据链 ===');
const D = data.deliveries || [];
const posById = {}; data.pos.forEach(p => { posById[p.id] = p; });
assert(D.length > 0, '交付实测记录为空');
assert(D.length === data.pos.filter(p => p.status === 'CLOSED').length,
  '交付记录数应等于已结案 PO 数：' + D.length);
D.forEach(d => {
  const p = posById[d.po_id];
  assert(!!p, `交付记录查不到对应 PO：${d.po_id}`);
  if (!p) return;
  assert(p.status === 'CLOSED', `交付记录对应的 PO 未结案：${d.po_id}`);
  assert(p.sku === d.sku && p.supplier === d.supplier, `交付记录与 PO 主数据不一致：${d.po_id}`);
  assert(p.order_date === d.order_date && p.promise_date === d.promise_date && p.eta === d.eta,
    `交付记录日期与 PO 不一致：${d.po_id}`);
  assert(p.qty === d.qty && d.qty_received === d.qty, `交付数量不闭合：${d.po_id}`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(d.receipt_date) && d.receipt_date < snap,
    `实收日期非法或晚于快照：${d.po_id} ${d.receipt_date}`);
  assert(E.daysBetween(d.order_date, d.receipt_date) > 0, `实测提前期非正：${d.po_id}`);
});
const sups = Array.from(new Set(D.map(d => d.supplier))).sort();
assert(sups.length === 8, '供应商数量应为 8：' + sups.length);
sups.forEach(s => assert(D.filter(d => d.supplier === s).length >= 6, `${s} 交付样本过少`));
assert(new Set(data.params.suppliers.map(x => x.otd)).size > 3, '演示 OTD 目标缺少区分度');

console.log('=== 引擎层：事实增强与滚动统计 ===');
const Rc = E.compute(data, {});
assert(Rc.params.lead_source === 'contract', '默认应为契约模式');
assert(near(sumSS(Rc), 65090, 1), '契约基线 SS 合计回归失败：' + sumSS(Rc));
Rc.skus.forEach(s => {
  assert(s.m.leadSource === 'contract' && near(s.m.leadDays, s.lead_days) && near(s.m.leadSdDays, s.lead_sd_days),
    `契约模式 L/σ 未取主数据：${s.id}`);
  assert(near(s.m.ssDelta, 0) && near(s.m.ss, s.m.ssContract), `契约模式 ΔSS 应为 0：${s.id}`);
});
const lt = Rc.leadTimes;
assert(lt.rows.length === sups.length, '供应商统计行数不闭合');
assert(lt.deliveries.length === D.length, '引擎交付记录数不闭合');
assert(lt.summary.deliveries === D.length, 'summary 交付数不闭合');
lt.deliveries.forEach(d => {
  assert(d.leadActualDays === E.daysBetween(d.order_date, d.receipt_date), `实测 L 计算错误：${d.po_id}`);
  assert(d.delayDays === E.daysBetween(d.eta, d.receipt_date), `ETA 延迟计算错误：${d.po_id}`);
  assert(d.delayContractDays === E.daysBetween(d.promise_date, d.receipt_date), `合同延迟计算错误：${d.po_id}`);
  assert(d.onTime === (d.delayDays <= 0) && d.onTimeContract === (d.delayContractDays <= 0),
    `准时判定错误：${d.po_id}`);
});
// 滚动窗口单调性：窗口越长，纳入样本只增不减
const counts = [2, 4, 8, 13, 26, 52].map(w => E.compute(data, { otd_window_weeks: w }).leadTimes.summary.inWindow);
counts.forEach((c, i) => { if (i) assert(c >= counts[i - 1], `滚动窗口样本数非单调：${counts}`); });
assert(counts[0] < counts[counts.length - 1], '滚动窗口未产生差异');
const R26 = E.compute(data, { otd_window_weeks: 26 });
const expectedStart = (() => {
  const d = new Date(snap + 'T00:00:00'); d.setDate(d.getDate() - 26 * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
assert(R26.leadTimes.summary.windowStart === expectedStart,
  `窗口起点计算错误：${R26.leadTimes.summary.windowStart} vs ${expectedStart}`);

console.log('=== 三种取值口径 ===');
const modes = ['contract', 'rolling', 'blend'];
const R = {};
modes.forEach(m => { R[m] = E.compute(data, { lead_source: m }); });
R.rolling.leadTimes.rows.forEach(r => {
  assert(r.n > 0 && r.weight === 1, `rolling 样本达标时 w 应为 1：${r.id} n=${r.n} w=${r.weight}`);
  assert(r.fallback === 'none', `rolling 不应回退：${r.id} ${r.fallback}`);
  assert(r.effL >= r.contractL * 0.4 - 1e-9 && r.effL <= r.contractL * 2.5 + 1e-9, `实测 L 越界：${r.id}`);
  assert(r.effSd >= 0 && r.effSd <= r.effL + 1e-9, `生效 σ 越界：${r.id}`);
  assert(finite(r.obsL) && finite(r.obsSd) && finite(r.sigmaTail), `实测统计量非法：${r.id}`);
  assert(r.otdRate >= 0 && r.otdRate <= 1 && r.otdContractRate >= 0 && r.otdContractRate <= 1, `OTD 越界：${r.id}`);
});
R.blend.leadTimes.rows.forEach(r => assert(r.weight > 0 && r.weight < 1, `blend 权重应严格收缩：${r.id} ${r.weight}`));
assert(R.contract.leadTimes.rows.every(r => r.weight === 0), 'contract 模式权重应恒为 0');
assert(R.rolling.leadTimes.summary.ssDelta > 0 || R.blend.leadTimes.summary.ssDelta !== 0, '切换口径未联动 SS');
modes.forEach(m => {
  const r = R[m];
  assert(r.skus.every(s => isFinite(s.m.ss) && s.m.ss >= 0 && s.m.rop >= s.m.dbar * s.m.L - 0.001),
    `${m} 模式 SS/ROP 非法`);
  assert(near(r.leadTimes.summary.ssCurrent, sumSS(r), 0.01), `${m} 模式供应商 SS 汇总不闭合`);
  assert(near(r.skus.reduce((a, s) => a + s.m.ssDelta, 0), r.leadTimes.summary.ssDelta, 0.01),
    `${m} 模式 ΔSS 归因不闭合`);
  assert(near(r.leadTimes.summary.ssValueCurrent - r.leadTimes.summary.ssValueContract,
    r.leadTimes.summary.ssValueDelta, 0.01), `${m} 模式 SS 金额归因不闭合`);
});
assert(R.rolling.skus.some(s => s.m.leadSource === 'rolling' && Math.abs(s.m.ssDelta) > 0.01),
  'rolling 模式应真正改变 SKU 的 SS');
assert(R.rolling.kpis.replenishSku !== R.contract.kpis.replenishSku ||
  Math.abs(R.rolling.kpis.eoValue - R.contract.kpis.eoValue) > 0.01, '口径切换未联动预警或 E&O');

console.log('=== 右尾保护 / OTD 基准 / 宽限 / 样本门控 ===');
const noTail = E.compute(data, { lead_source: 'rolling', otd_tail: 0 });
R.rolling.leadTimes.rows.forEach((r, i) => {
  const t = noTail.leadTimes.rows[i];
  assert(r.sigmaUsed >= t.sigmaUsed - 1e-9, `右尾保护未抬高 σ：${r.id}`);
  assert(r.effSd >= t.effSd - 1e-9, `右尾保护未传导到生效 σ：${r.id}`);
});
const basisEta = E.compute(data, { otd_basis: 'eta' }), basisCon = E.compute(data, { otd_basis: 'contract' });
basisEta.leadTimes.rows.forEach((r, i) => {
  assert(near(r.otdBasisRate, r.otdRate), `ETA 基准取值错误：${r.id}`);
  assert(near(basisCon.leadTimes.rows[i].otdBasisRate, r.otdContractRate), `合同基准取值错误：${r.id}`);
});
assert(basisEta.leadTimes.summary.otdRate > basisCon.leadTimes.summary.otdRate + 0.2,
  '两种 OTD 口径应存在显著差异（承诺日早于确认 ETA）');
[0, 1, 3, 7].forEach((g, i, arr) => {
  if (i) assert(E.compute(data, { otd_grace_days: g }).leadTimes.summary.otdRate >=
    E.compute(data, { otd_grace_days: arr[i - 1] }).leadTimes.summary.otdRate - 1e-9,
    '宽限天数增大后 OTD 不应下降');
});
const thin = E.compute(data, { lead_source: 'rolling', otd_window_weeks: 2, otd_min_samples: 12 });
assert(thin.leadTimes.summary.fallbackCount > 0, '短窗口未触发样本不足回退');
thin.leadTimes.rows.forEach(r => {
  assert(r.weight >= 0 && r.weight <= 1, `短窗口权重越界：${r.id} ${r.weight}`);
  assert(r.fallback === 'no_deliveries' ? r.weight === 0 : true, `无交付却给了权重：${r.id}`);
  assert(r.effL >= r.contractL * 0.4 - 1e-9 && r.effL <= r.contractL * 2.5 + 1e-9, `回退时 L 越界：${r.id}`);
});
const priorBig = E.compute(data, { lead_source: 'blend', otd_prior_strength: 40 });
const priorSmall = E.compute(data, { lead_source: 'blend', otd_prior_strength: 1 });
priorBig.leadTimes.rows.forEach((r, i) => assert(r.weight < priorSmall.leadTimes.rows[i].weight,
  `先验强度增大未降低实测权重：${r.id}`));

console.log('=== 兜底 / 非法参数 / 组合策略 ===');
const bad = E.compute(data, {
  lead_source: 'bogus', otd_basis: 'bogus', otd_window_weeks: -5, otd_min_samples: 999,
  otd_prior_strength: 0, otd_grace_days: -9, otd_tail: 'x',
});
assert(bad.params.lead_source === 'contract' && bad.params.otd_basis === 'eta', '非法枚举未回退');
assert(bad.params.otd_window_weeks >= 1 && bad.params.otd_prior_strength >= 1 && bad.params.otd_grace_days >= 0,
  '非法数值未钳制');
assert(bad.skus.every(s => isFinite(s.m.ss) && isFinite(s.m.rop)), '非法参数产生 NaN');
const noDel = JSON.parse(JSON.stringify(data)); delete noDel.deliveries;
let importOk = true;
try {
  const ri = E.compute(noDel, { lead_source: 'rolling' });
  importOk = ri.leadTimes.summary.deliveries === 0 &&
    ri.leadTimes.rows.every(r => r.fallback === 'no_deliveries' && r.weight === 0) &&
    ri.skus.every(s => s.m.leadSource === 'contract' && near(s.m.ssDelta, 0));
} catch (e) { importOk = false; }
assert(importOk, '无交付记录的导入数据未安全回退契约值');
const combo = E.compute(data, { lead_source: 'rolling', segment_csl: 'matrix' });
assert(combo.kpis.segmentSummary.empiricalCount > 0 && combo.skus.every(s => isFinite(s.m.ss)),
  '差异化矩阵 + 实测交期组合失效');
combo.skus.filter(s => s.m.ssModel === 'empirical').forEach(s =>
  assert(near(s.m.rop, s.m.qLtd, 0.001), `组合模式下经验分位 ROP 不闭合：${s.id}`));
const lf = E.compute(data, { lead_source: 'rolling', lead_factor: 2 });
assert(lf.skus[0].m.L >= R.rolling.skus[0].m.L * 2 - 1, 'lead_factor 未作用于实测交期');

console.log('\n=== 断言 ===');
console.log(errors.length ? errors.slice(0, 25).join('\n') : '全部通过 (' + checks + ' 项检查)');

const sm = R.rolling.leadTimes.summary;
console.log('\n=== 业务摘要（rolling / 26 周） ===');
console.log('窗口 / 交付样本        ', sm.windowStart, '~', sm.windowEnd, '·', sm.inWindow, '/', sm.deliveries, '笔');
console.log('OTD ETA / 合同 / 平均延迟', E.pct(sm.otdEtaRate, 1), '/', E.pct(sm.otdContractRate, 1), '/', E.dec(sm.avgDelay, 2), '天');
console.log('SS 契约 / 实测 / Δ      ', E.qty(sm.ssContract), '/', E.qty(sm.ssCurrent), '/', E.qty(sm.ssDelta),
  '件 (' + E.pct(sm.ssDelta / sm.ssContract, 1) + ')');
console.log('SS 资金 Δ / 风险供应商  ', E.money(sm.ssValueDelta), '/', sm.riskCount);
console.log('供应商明细：');
R.rolling.leadTimes.rows.forEach(r => console.log(' ', r.id,
  'n=' + String(r.n).padStart(2), 'OTD=' + E.pct(r.otdRate, 1).padStart(6),
  'L ' + r.contractL + '→' + E.dec(r.effL, 1), 'σ ' + r.contractSd + '→' + E.dec(r.effSd, 2),
  'ΔSS=' + E.qty(r.ssDelta).padStart(6), r.risks.join(',') || '—'));
process.exit(errors.length ? 1 : 0);
