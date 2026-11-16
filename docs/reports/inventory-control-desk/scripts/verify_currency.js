// 金额币种数据层声明 · 引擎专项验证（纯 Node，不依赖浏览器）
// 用法：node scripts/verify_currency.js
global.window = global;
require('../assets/engine.js');
const fs = require('node:fs');
const path = require('node:path');
const E = global.Engine;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/dataset.json'), 'utf8'));

let checks = 0;
function assert(cond, msg) { checks++; if (!cond) throw new Error('[FAIL] ' + msg); }
function near(a, b, eps = 1e-9) { return Math.abs(a - b) <= eps; }
const clone = o => JSON.parse(JSON.stringify(o));
const sumSS = R => R.skus.reduce((a, s) => a + s.m.ss, 0);

/* ------------------------------------------------ 1. 币种表与别名归一 */
const codes = Object.keys(E.CURRENCIES);
assert(codes.length >= 6, '币种表应至少覆盖 6 种常见币种');
codes.forEach(c => {
  const v = E.CURRENCIES[c];
  assert(/^[A-Z]{3}$/.test(c), `币种 code 应为 ISO 4217 三位大写：${c}`);
  assert(typeof v.symbol === 'string' && v.symbol.length > 0, `${c} 缺符号`);
  assert(typeof v.name === 'string' && v.name.length > 0, `${c} 缺中文名`);
  assert(E.normalizeCurrency(c) === c, `${c} 归一后应不变`);
});
[
  ['£', 'GBP'], ['sterling', 'GBP'], [' gbp ', 'GBP'], ['POUND', 'GBP'],
  ['¥', 'CNY'], ['￥', 'CNY'], ['RMB', 'CNY'], ['cny', 'CNY'],
  ['$', 'USD'], ['US$', 'USD'], ['usd', 'USD'], ['€', 'EUR'],
  ['JPY', 'JPY'], ['HK$', 'HKD'], ['S$', 'SGD'],
  ['', 'GBP'], [null, 'GBP'], [undefined, 'GBP'], [123, 'GBP'],
  ['BOGUS', 'GBP'], ['XXX', 'GBP'], [undefined, 'GBP'],
].forEach(([raw, want]) => assert(E.normalizeCurrency(raw) === want,
  `别名归一错误：${String(raw)} → ${E.normalizeCurrency(raw)}，期望 ${want}`));

/* ------------------------------------------------ 2. 数据层声明存在且唯一 */
assert(data.meta.currency === 'GBP', '演示数据集 meta.currency 应声明 GBP');
assert(/sterling/i.test(data.meta.currency_note || ''), 'currency_note 应给出 UCI 官方 sterling 依据');
assert(data.params.currency === undefined, '演示数据集 params 不应重复声明 currency，避免遮住 meta');
assert(data.meta.notes.some(x => /meta\.currency|currency=/.test(x)), 'notes 应说明导入时如何声明币种');

/* ------------------------------------------------ 3. 默认行为与既有数值不变 */
const base = E.compute(data, {});
assert(base.params.currency === 'GBP', '默认 compute 应为 GBP');
assert(E.currentCurrency() === 'GBP', '默认当前币种应为 GBP');
assert(E.currencySymbol() === '£', '默认符号应为 £');
assert(E.money(12345) === '£12.3k', `默认金额格式被改写：${E.money(12345)}`);
assert(near(sumSS(base), 65090, 1), `默认 SS 合计回归：${sumSS(base)}`);
const baseKpis = ['inventoryValue', 'eoValue', 'grossEoValue', 'cogs', 'openPoValue', 'inTransitValue', 'avgInvValue']
  .map(k => base.kpis[k]);
baseKpis.forEach(v => assert(isFinite(v) && v >= 0, '基线 KPI 金额非法'));

/* ------------------------------------------------ 4. 币种只影响展示，不参与计算 */
['CNY', 'USD', 'EUR', 'JPY', 'HKD', 'SGD'].forEach(code => {
  const R = E.compute(data, { currency: code });
  assert(R.params.currency === code, `${code} 未生效`);
  assert(E.currentCurrency() === code, `${code} 未同步到引擎当前币种`);
  assert(E.currencySymbol() === E.CURRENCIES[code].symbol, `${code} 符号错误`);
  assert(near(sumSS(R), sumSS(base)), `${code} 改变了 SS 合计`);
  baseKpis.forEach((v, i) => assert(near(R.kpis[['inventoryValue', 'eoValue', 'grossEoValue', 'cogs', 'openPoValue', 'inTransitValue', 'avgInvValue'][i]], v),
    `${code} 改变了金额型 KPI`));
  // 指标对象逐字段对比：币种不得渗入任何计算字段
  assert(JSON.stringify(R.skus.map(s => s.m)) === JSON.stringify(base.skus.map(s => s.m)),
    `${code} 改变了 SKU 指标对象`);
  assert(R.alerts.length === base.alerts.length, `${code} 改变了预警条数`);
  assert(E.money(12345).startsWith(E.CURRENCIES[code].symbol), `${code} 金额符号未生效`);
});

/* ------------------------------------------------ 5. 优先级：cfg > data.params > meta > 默认 */
const dMeta = clone(data); dMeta.meta.currency = 'USD';
assert(E.compute(dMeta, {}).params.currency === 'USD', 'meta.currency 应作为数据层声明生效');
const dParams = clone(dMeta); dParams.params.currency = 'EUR';
assert(E.compute(dParams, {}).params.currency === 'EUR', 'params.currency 应优先于 meta');
assert(E.compute(dParams, { currency: 'CNY' }).params.currency === 'CNY', '显式 cfg 应优先于 params');
const dNone = clone(data); delete dNone.meta.currency; dNone.meta.currency_note = undefined;
assert(E.compute(dNone, {}).params.currency === 'GBP', '数据集未声明时应回退 GBP');
E.compute(dNone, { currency: 'BOGUS' });
assert(E.compute(dNone, { currency: 'BOGUS' }).params.currency === 'GBP', '非法 code 应回退 GBP 而非抛错');
assert(E.compute(dNone, { currency: null }).params.currency === 'GBP', 'null currency 应回退 GBP');

/* ------------------------------------------------ 6. 引擎内部生成的金额说明同步币种 */
const alertMoney = R => R.alerts.filter(a => /呆滞金额|E&O 金额|未清/.test(a.note || '')).map(a => a.note);
const gbpNotes = alertMoney(E.compute(data, { currency: 'GBP' }));
const cnyNotes = alertMoney(E.compute(data, { currency: 'CNY' }));
assert(gbpNotes.length > 0, '应存在引擎内生成的金额说明用于验证');
assert(gbpNotes.every(t => t.includes('£') && !t.includes('¥')), 'GBP 预警说明币种不一致');
assert(cnyNotes.every(t => t.includes('¥') && !t.includes('£')), 'CNY 预警说明仍是 £');
assert(cnyNotes.length === gbpNotes.length, '切换币种不应改变预警条数');

/* ------------------------------------------------ 7. money 的显式覆盖与 compute 复位 */
E.setCurrency('CNY');
assert(E.money(1000, 'USD') === '$1,000', 'money 显式传 ISO code 应覆盖');
assert(E.money(1000, '€') === '€1,000', 'money 显式传符号应覆盖');
assert(E.money(1000, 'CNY') === '¥1,000', 'money 显式传 CNY 应为 ¥');
assert(E.money(1000, 0) === '¥1,000', 'money 传 0 应回落到当前币种（不传符号）');
assert(E.money(null) === '—' && E.money(Infinity) === '—', 'money 空值应显示 —');
E.setCurrency('EUR');
assert(E.money(1000) === '€1,000', 'setCurrency 应生效');
E.compute(data, {});
assert(E.currentCurrency() === 'GBP' && E.money(1000) === '£1,000', 'compute 应把当前币种复位为结果币种');

/* ------------------------------------------------ 8. 导入形态：最小 JSON 只声明 meta.currency */
const mini = {
  meta: { source: 'test', source_url: '—', license: '—', doi: '—', description: '—',
    currency: 'CNY', raw_period: ['2024-01-01', '2024-12-31'], snapshot_date: '2024-12-30',
    weeks: Array.from({ length: 52 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 1 + i * 7));
      return d.toISOString().slice(0, 10);
    }),
    sku_count: 1, po_count: 0, generated_at: '—', real_fields: [], derived_fields: [], notes: [] },
  params: {},
  skus: [{ id: 'T1', desc: 'test', unit_price: 10, unit_cost: 6, weekly: new Array(52).fill(4),
    weekly_oh: new Array(52).fill(40), on_hand: 40, reserved: 0, quarantine: 0, blocked: 0,
    batches: [{ id: 'B1', date: '2024-12-01', qty: 40, cost: 6 }],
    lead_days: 14, lead_sd_days: 3, supplier: 'SUP-01', category: 'X / Y', warehouse: 'DC-01', abc: 'A' }],
  pos: [], deliveries: [], weekly_inventory_value: new Array(52).fill(0),
};
const miniR = E.compute(mini, {});
assert(miniR.params.currency === 'CNY', '导入 JSON 仅声明 meta.currency 时应生效');
assert(E.money(1000).startsWith('¥'), '导入数据后金额符号应为 ¥');
assert(miniR.skus.length === 1 && isFinite(miniR.skus[0].m.ss), '最小数据集应能正常计算');
const miniCfg = E.compute(mini, { currency: 'USD' });
assert(miniCfg.params.currency === 'USD', '导入后仍应允许会话内覆盖币种');

/* ------------------------------------------------ 9. 导出元信息所需字段齐备 */
const info = E.currencyInfo('CNY');
assert(info && info.symbol === '¥' && info.name === '人民币', 'currencyInfo 应提供符号与中文名');
assert(typeof base.meta.currency === 'string' && typeof base.params.currency === 'string',
  'compute 结果必须同时携带 meta.currency 与 params.currency 供导出使用');

console.log(`[CURRENCY VERIFY] 全部通过（${checks} 项检查）`);
console.log('  默认 GBP · SS 合计 ' + sumSS(base).toFixed(2) + ' 件 · 库存金额 ' + base.kpis.inventoryValue.toFixed(2) + ' 未变');
console.log('  优先级 cfg > params > meta > GBP；切换币种不改变任何指标数值；预警说明同步币种');
