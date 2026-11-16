// 自查补充回归：JSON 导入缺 pos / age_buckets 兜底、真实单位成本口径、
// 成本率联动、MOQ/包装批量联动、按周现货可用率空值
// 前置：本地 8765 静态服务 + 9333 调试端口 Chrome；用法 node scripts/verify_audit.mjs
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JSONF = '/tmp/icw-audit-import.json';
const weeks = Array.from({ length: 52 }, (_, i) => {
  const d = new Date(new Date('2026-11-09T00:00:00').getTime() - (52 - i) * 7 * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
});
const sku = {
  id: 'J-01', desc: '审计测试品', category: '测试 / QA', warehouse: 'DC-01', supplier: 'SUP-01',
  abc: 'A', lifecycle: 'ACTIVE', unit_price: 10, unit_cost: 7.77,
  weekly: Array.from({ length: 52 }, (_, i) => 20 + (i % 7)), weekly_oh: new Array(52).fill(120),
  weekly_revenue: new Array(52).fill(200),
  on_hand: 100, reserved: 0, quarantine: 0, blocked: 0,
  batches: [{ id: 'J-01-B1', date: '2026-10-01', qty: 100, cost: 7.77, age_days: 39 }],
  lead_days: 14, lead_sd_days: 3, tail_bias: 1, real_volume: 1000, weeks_with_demand: 52,
};
const meta = {
  source: '审计测试 · 用户 JSON', source_url: '—', doi: '—', license: '用户自有数据', publisher: '—',
  description: '用于验证缺 pos / 缺 params.age_buckets / 真实单位成本的导入链路。',
  raw_period: [weeks[0], '2026-11-09'], raw_rows: 1, clean_rows: 1, snapshot_date: '2026-11-09',
  weeks, sku_count: 1, po_count: 0, generated_at: '2026-11-14 11:00',
  real_fields: ['导入的 SKU 与库存快照'], derived_fields: ['无'], notes: ['审计测试'],
};
// 故意不提供 pos / params / weekly_inventory_value
fs.writeFileSync(JSONF, JSON.stringify({ meta, skus: [sku] }), 'utf8');

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200));
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG ' + m.params.entry.text.slice(0, 150));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.value ?? ('THREW ' + (r.exceptionDetails?.exception?.description || '').slice(0, 200)); };
const setNative = (sel, val) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
const click = async sel => {
  const r = JSON.parse(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'null';
    e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height});})()`));
  if (!r || !r.w) return false;
  const x = Math.round(r.x + Math.min(r.w / 2, 50)), y = Math.round(r.y + r.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Network.enable'); await send('DOM.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?audit=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .card')`)) break; }

const report = {};
const root = await send('DOM.getDocument', { depth: 1 });
const fi = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#fileInput' });
await send('DOM.setFileInputFiles', { files: [JSONF], nodeId: fi.nodeId });
await sleep(1000);
report.jsonImport = JSON.parse(await ev(`JSON.stringify({
  sku:document.querySelector('#topSku')?.textContent,
  toast:document.querySelector('#toast')?.textContent,
  source:document.querySelector('#topSource')?.textContent,
  overviewText:document.querySelector('#view')?.innerText?.slice(0,400),
  hOverflow:document.documentElement.scrollWidth>window.innerWidth
})`));
// 库存金额应为 100 × 7.77 = £777（真实单位成本生效，而非 10 × 0.55 = £550）
report.jsonImport.unitCostApplied = /777/.test(report.jsonImport.overviewText || '');
await click('.nav-item[data-view="metrics"]'); await sleep(350);
report.jsonImport.instockRateNA = /按周现货可用率/.test(await ev(`document.querySelector('#view')?.innerText||''`)) &&
  /—/.test(await ev(`document.querySelector('#view')?.innerText||''`));

// 回到演示数据
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?audit2=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .card')`)) break; }
await click('.nav-item[data-view="guide"]'); await sleep(400);
const readEo = () => ev(`(()=>{const t=[...document.querySelectorAll('#view .impact > div')]
  .find(d=>d.querySelector('.i-label')?.textContent.includes('E&O'));return t?.querySelector('.i-value')?.textContent||'';})()`);
report.paramLinkage = { controls: JSON.parse(await ev(`JSON.stringify(['cost_basis','moq','pack','cost_rate'].map(k=>!!document.querySelector('[data-param="'+k+'"]')))`)) };
const eo0 = await readEo();
await setNative('[data-param="cost_rate"]', '0.75'); await sleep(450);
const eo1 = await readEo();
report.paramLinkage.estimatedCostRate = { before: eo0, after: eo1, changed: eo0 !== eo1 };
await setNative('[data-param="cost_basis"]', 'supplied'); await sleep(450);
const eo2 = await readEo();
await setNative('[data-param="cost_rate"]', '0.40'); await sleep(450);
const eo3 = await readEo();
report.paramLinkage.suppliedIgnoresCostRate = { afterSwitch: eo2, afterRateChange: eo3, unchanged: eo2 === eo3 };
// MOQ 联动：切回演示参数后比较抽屉可下单量
await setNative('[data-param="cost_basis"]', 'estimated'); await sleep(300);
await click('.nav-item[data-view="inventory"]'); await sleep(350);
await click('#view table.tbl tbody tr'); await sleep(450);
const q1 = await ev(`(()=>{const g=[...document.querySelectorAll('#drawer .metric-grid > div')]
  .find(d=>d.textContent.includes('可下单补货量'));return g?.querySelector('.m-value')?.textContent||'';})()`);
await click('#drawer [data-close]'); await sleep(200);
await click('.nav-item[data-view="guide"]'); await sleep(350);
await setNative('[data-param="pack"]', '100'); await sleep(450);
await click('.nav-item[data-view="inventory"]'); await sleep(350);
await click('#view table.tbl tbody tr'); await sleep(450);
const q2 = await ev(`(()=>{const g=[...document.querySelectorAll('#drawer .metric-grid > div')]
  .find(d=>d.textContent.includes('可下单补货量'));return g?.querySelector('.m-value')?.textContent||'';})()`);
report.paramLinkage.batchAffectsOrderQty = { before: q1, after: q2, changed: q1 !== q2 };
report.errors = errors;
console.log(JSON.stringify(report, null, 2));
const ok = report.jsonImport.sku === '1' && /导入成功/.test(report.jsonImport.toast || '') &&
  report.jsonImport.unitCostApplied && report.jsonImport.instockRateNA &&
  report.paramLinkage.controls.every(Boolean) && report.paramLinkage.estimatedCostRate.changed &&
  report.paramLinkage.suppliedIgnoresCostRate.unchanged && report.paramLinkage.batchAffectsOrderQty.changed &&
  errors.length === 0;
console.log(ok ? '\nAUDIT VERIFY: PASS' : '\nAUDIT VERIFY: FAIL');
ws.close();
