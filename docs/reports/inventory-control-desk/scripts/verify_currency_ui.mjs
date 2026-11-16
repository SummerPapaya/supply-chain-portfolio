// 金额币种数据层声明 · 浏览器交互验证（CDP 驱动本机 Chrome）
// 前置：静态服务 127.0.0.1:8765 + Chrome 调试端口 127.0.0.1:9333
// 用法：node scripts/verify_currency_ui.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2] || '/tmp/icw-verify';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(new URL('..', import.meta.url).pathname);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 构造导入用测试数据：JSON 只改 meta.currency，CSV 用注释行声明币种 */
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/dataset.json'), 'utf8'));
const usd = JSON.parse(JSON.stringify(base));
usd.meta.currency = 'USD'; usd.meta.currency_note = '导入测试：USD';
const JSON_FILE = path.join(OUT, 'currency-usd.json');
fs.writeFileSync(JSON_FILE, JSON.stringify(usd), 'utf8');

const head = ['sku', 'description', 'category', 'warehouse', 'supplier', 'unit_price', 'lead_days', 'lead_sd_days',
  'on_hand', 'reserved', 'quarantine', 'blocked', 'avg_inventory_qty', 'lifecycle'];
for (let i = 1; i <= 52; i++) head.push('w' + i);
const rows = [
  ['SKU-C01', '币种测试品 A', '测试类 / QA', 'DC-01', 'SUP-01', 12.5, 14, 3, 620, 30, 0, 0, 600, 'ACTIVE'],
  ['SKU-C02', '币种测试品 B', '测试类 / QA', 'DC-02', 'SUP-02', 8, 21, 5, 140, 0, 0, 0, 200, 'ACTIVE'],
].map((r, ri) => r.concat(Array.from({ length: 52 }, (_, i) => 20 + ((i * 7 + ri * 11) % 23))));
const CSV_FILE = path.join(OUT, 'currency-eur.csv');
fs.writeFileSync(CSV_FILE, '\ufeff' + [
  '# 库存控制工作台 · 币种导入测试',
  '# currency=EUR',
  '# snapshot_date=2026-11-09',
  head.join(','),
].concat(rows.map(r => r.join(','))).join('\r\n'), 'utf8');

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 250));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('CONSOLE ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG ' + m.params.entry.text.slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__THREW__:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 250);
  return r.result?.value;
};
const clickSel = async (sel, nth = 0) => {
  const rect = JSON.parse(await ev(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];if(!e)return 'null';
    e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));
  if (!rect || !rect.w) return false;
  const x = Math.round(rect.x + Math.min(rect.w / 2, 50)), y = Math.round(rect.y + rect.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};
const nav = async v => { await clickSel(`.nav-item[data-view="${v}"]`); await sleep(260); };
const setSelect = (sel, val) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
const kpiMoney = () => ev(`document.querySelector('#view .kpi .k-value')?.textContent || ''`);
const viewText = () => ev(`document.querySelector('#view')?.innerText || ''`);
const overflow = () => ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
const checks = {};
function ck(name, cond, detail) { checks[name] = { ok: !!cond, detail }; if (!cond) console.error('  ✗ ' + name, detail || ''); }

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Network.enable'); await send('DOM.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }); } catch (_) { /* 新版 CDP 可忽略 */ }
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
// 捕获下载内容：download() 通过 URL.createObjectURL(blob) 生成文件
const hook = `(()=>{window.__blobs=[];const o=URL.createObjectURL.bind(URL);
  URL.createObjectURL=function(b){window.__blobs.push(b);return o(b);};return true;})()`;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?cur=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .kpi')`)) break; }
await ev(hook);

/* ------------------------------------------------ 1. 默认 GBP */
const k0 = await kpiMoney();
ck('默认 KPI 显示 £', k0.includes('£') && !k0.includes('¥'), k0);
ck('数据源 meta.currency=GBP', await ev(`window.INV_DATA.meta.currency`) === 'GBP');
ck('引擎当前币种 GBP', await ev(`window.Engine.currentCurrency()`) === 'GBP');

await nav('guide');
const sel0 = await ev(`document.querySelector('[data-param="currency"]')?.value`);
ck('参数页存在币种下拉且默认 GBP', sel0 === 'GBP', sel0);
ck('参数页提供全部币种选项', (await ev(`document.querySelectorAll('[data-param="currency"] option').length`)) >= 6);
const guideTxt = await viewText();
ck('数据源卡标注 GBP (£)', /GBP\s*\(£\)/.test(guideTxt));
ck('公式字典含金额币种口径', /金额币种/.test(guideTxt) && /meta\.currency/.test(guideTxt));
ck('导入说明含 # currency=', /currency=CNY/.test(guideTxt));

/* ------------------------------------------------ 2. 切换 CNY，全站符号联动 */
ck('切换控件可用', await setSelect('[data-param="currency"]', 'CNY'));
await sleep(400);
ck('会话参数已切 CNY', await ev(`window.Engine.currentCurrency()`) === 'CNY');
const guideCNY = await viewText();
ck('参数页当前生效参数显示 CNY', /"CNY"|CNY/.test(guideCNY));
ck('切换后 guide 视图无 £ 残留金额', !/£\s?\d/.test(guideCNY), (guideCNY.match(/£\s?\d+\S*/g) || []).slice(0, 3));

await nav('overview');
const k1 = await kpiMoney();
ck('总览 KPI 显示 ¥', k1.includes('¥') && !k1.includes('£'), k1);
ck('切币种不改变 KPI 数值', (() => {
  const a = (k0.match(/[\d,.]+/) || [])[0], b = (k1.match(/[\d,.]+/) || [])[0];
  return a && b && a === b;
})(), { before: k0, after: k1 });

await nav('inventory');
ck('库存台账金额随币种显示 ¥', /¥\s?[\d,.]+/.test(await viewText()) && !/£\s?[\d,.]+/.test(await viewText()));
await nav('purchase');
ck('采购订单单位成本列带币种', (await viewText()).includes('单位成本 / ¥'));

/* ------------------------------------------------ 3. 导出 CSV 元数据带币种 */
await ev(`window.__blobs=[]`);
await ev(`document.querySelector('#btnExport').click()`);
await sleep(300);
const exported = String(await ev(`window.__blobs.length ? window.__blobs[window.__blobs.length-1].text() : ''`));
ck('导出文件已生成', exported.length > 100, exported.slice(0, 80));
ck('导出元数据含 金额币种: CNY (¥)', /金额币种:\s*CNY\s*\(¥\)/.test(exported));
ck('导出元数据含币种声明来源', /币种声明:.*meta\.currency/.test(exported));
ck('导出元数据不含 GBP 误标', !/金额币种:\s*GBP/.test(exported));

/* ------------------------------------------------ 4. CSV 模板带当前币种 */
await nav('guide');
await ev(`window.__blobs=[]`);
await ev(`document.querySelector('[data-do="template"]').click()`);
await sleep(300);
const tpl = String(await ev(`window.__blobs.length ? window.__blobs[window.__blobs.length-1].text() : ''`));
ck('CSV 模板含 # currency=CNY', /#\s*币种:\s*currency=CNY/.test(tpl), tpl.slice(0, 120));
ck('CSV 模板说明不做汇率换算', /不做汇率换算/.test(tpl));

/* ------------------------------------------------ 4b. SKU 抽屉金额口径 */
await nav('inventory');
ck('打开 SKU 抽屉', await clickSel('#view table.tbl tbody tr[data-sku]'));
await sleep(300);
const drawerTxt = await ev(`document.querySelector('#drawer')?.innerText || ''`);
ck('抽屉单位成本显示 ¥', /单位成本[\s\S]{0,30}¥/.test(drawerTxt) && !/单位成本[\s\S]{0,30}£/.test(drawerTxt),
  (drawerTxt.match(/单位成本.{0,30}/) || [])[0]);
ck('抽屉消耗金额公式带 ¥', /单位成本 ¥/.test(drawerTxt));
await ev(`(()=>{document.querySelector('#scrim')?.click();document.querySelector('#drawer [data-close]')?.click();return true})()`);
await sleep(250);

/* ------------------------------------------------ 5. 导入 JSON（meta.currency=USD）覆盖会话 CNY */
const root = await send('DOM.getDocument', { depth: 1 });
const fi = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#fileInput' });
await send('DOM.setFileInputFiles', { files: [JSON_FILE], nodeId: fi.nodeId });
await sleep(1100);
ck('JSON 导入成功', /导入成功/.test(String(await ev(`document.querySelector('#toast').textContent`))));
ck('币种随 JSON 数据走（USD）', await ev(`window.Engine.currentCurrency()`) === 'USD');
await nav('guide');
ck('JSON 导入后参数页币种为 USD', await ev(`document.querySelector('[data-param="currency"]')?.value`) === 'USD');
await nav('overview');
ck('USD KPI 显示 $', (await kpiMoney()).includes('$') && !(await kpiMoney()).includes('£'), await kpiMoney());

/* ------------------------------------------------ 6. 导入 CSV（# currency=EUR） */
await nav('guide');
await send('DOM.setFileInputFiles', { files: [CSV_FILE], nodeId: fi.nodeId });
await sleep(1100);
ck('CSV 导入成功', /导入成功/.test(String(await ev(`document.querySelector('#toast').textContent`))));
ck('币种随 CSV 注释行走（EUR）', await ev(`window.Engine.currentCurrency()`) === 'EUR');
ck('CSV 导入后参数页币种为 EUR', await ev(`document.querySelector('[data-param="currency"]')?.value`) === 'EUR');
await nav('overview');
ck('EUR KPI 显示 €', (await kpiMoney()).includes('€'), await kpiMoney());

/* ------------------------------------------------ 7. 恢复演示数据回 GBP */
await nav('guide');
await clickSel('[data-do="restore"]');
await sleep(600);
ck('恢复后币种回到 GBP', await ev(`window.Engine.currentCurrency()`) === 'GBP');
ck('恢复后参数控件回 GBP', await ev(`document.querySelector('[data-param="currency"]')?.value`) === 'GBP');
await nav('overview');
ck('恢复后 KPI 回到 £', (await kpiMoney()).includes('£'), await kpiMoney());

/* ------------------------------------------------ 8. 全视图零溢出（含 1366 窄屏） */
const views = ['overview', 'alerts', 'inventory', 'purchase', 'transit', 'aging', 'excess', 'metrics', 'segment', 'supplier', 'guide', 'evidence'];
const bad = [];
for (const width of [1680, 1366]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1100, deviceScaleFactor: 1, mobile: false });
  for (const v of views) {
    await nav(v);
    const o = await overflow();
    const txt = await viewText();
    if (o > 0 || /undefined|NaN|Infinity|\[object Object\]/.test(txt)) bad.push(`${width}/${v}/overflow=${o}`);
  }
}
ck('11 视图 × 2 宽度零溢出、无脏值', bad.length === 0, bad.slice(0, 6));
ck('零控制台错误', errors.length === 0, errors.slice(0, 4));

/* ------------------------------------------------ 收尾：恢复现场 */
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await ev(`(()=>{localStorage.removeItem('icw_alert_actions');return 1})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?cur=reset' });
ws.close();

const total = Object.keys(checks).length;
const failed = Object.entries(checks).filter(([, v]) => !v.ok);
fs.writeFileSync(path.join(OUT, 'currency-ui-result.json'), JSON.stringify({ ok: failed.length === 0, total, checks, errors }, null, 2));
console.log(JSON.stringify({ ok: failed.length === 0, total, passed: total - failed.length,
  failed: failed.map(([k, v]) => ({ name: k, detail: v.detail })), errors: errors.slice(0, 5) }, null, 2));
if (failed.length || errors.length) process.exit(1);
