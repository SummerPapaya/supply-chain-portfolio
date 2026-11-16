// 证据与局限视图 · 真实浏览器交互验证（CDP 驱动本机 Chrome）
// 前置：静态服务 127.0.0.1:8765 + Chrome 调试端口 127.0.0.1:9333
// 用法：node scripts/verify_evidence_ui.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
const OUT = process.argv[2] || '/tmp/icw-verify';
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(new URL('..', import.meta.url).pathname);
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/dataset.json'), 'utf8'));
const DECLARED = DATA.meta.evidence.dataset_sha256;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
const nav = async v => { await clickSel(`.nav-item[data-view="${v}"]`); await sleep(280); };
const setSelect = (sel, val) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
const viewText = () => ev(`document.querySelector('#view')?.innerText || ''`);
const overflow = () => ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
const checks = {};
function ck(name, cond, detail) { checks[name] = { ok: !!cond, detail }; if (!cond) console.error('  ✗ ' + name, detail || ''); }

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Network.enable'); await send('DOM.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
try { await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT }); } catch (_) { /* 新版 CDP 可忽略 */ }
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
const hook = `(()=>{window.__blobs=[];const o=URL.createObjectURL.bind(URL);
  URL.createObjectURL=function(b){window.__blobs.push(b);return o(b);};return true;})()`;
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?ev=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .kpi')`)) break; }
await ev(hook);

/* ------------------------------------------------ 1. 导航与视图结构 */
ck('共 12 个视图导航', (await ev(`document.querySelectorAll('.nav-item').length`)) === 12);
await nav('evidence');
ck('页面标题为证据与局限', (await ev(`document.querySelector('#pageTitle').textContent`)) === '证据与局限');
ck('4 张指纹 KPI', (await ev(`document.querySelectorAll('#view .kpi').length`)) === 4);
const kpiTxt = await viewText();
ck('KPI 显示 12 位短指纹', (kpiTxt.match(/[0-9a-f]{12}/g) || []).length >= 3, (kpiTxt.match(/[0-9a-f]{12}/g) || []).slice(0, 4));
ck('数据契约含源文件与币种', /Online Retail\.xlsx/.test(kpiTxt) && /GBP/.test(kpiTxt));
ck('显示规则版本 ICW-ENGINE', /ICW-ENGINE-/.test(kpiTxt));

/* ------------------------------------------------ 2. 局限一等交付物 */
const limitCount = await ev(`document.querySelectorAll('#view .ev-limit').length`);
ck('局限条数 ≥ 12', limitCount >= 12, limitCount);
ck('每条都有已量化事实', (await ev(`[...document.querySelectorAll('#view .ev-limit')].every(x=>x.querySelector('.ev-fact')?.innerText.includes('已量化事实'))`)) === true);
ck('每条都有具体下一步', (await ev(`[...document.querySelectorAll('#view .ev-limit')].every(x=>x.querySelector('.ev-next')?.innerText.includes('具体下一步'))`)) === true);
ck('事实含量化数字', (await ev(`[...document.querySelectorAll('#view .ev-fact')].filter(x=>/\\d/.test(x.innerText)).length`)) >= 12);
ck('默认展开且无收起控件', (await ev(`document.querySelectorAll('#view details, [data-do="collapseLimits"]').length`)) === 0 && /不提供收起/.test(await viewText()));
ck('红线 4 条', (await ev(`document.querySelectorAll('#view .ev-red li').length`)) === 4);
ck('复现脚本表 12 行', (await ev(`[...document.querySelectorAll('#view table.tbl tbody tr')].filter(r=>/verify_/.test(r.innerText)).length`)) === 12);
ck('红线含「不是采购单」', /不是采购单|不生成采购单/.test(await viewText()));

/* ------------------------------------------------ 3. 浏览器当场复算指纹 */
await ev(`document.querySelector('[data-do="recheckEvidence"]').click()`);
await sleep(700);
const checkCls = await ev(`document.querySelector('#evCheckState').className`);
const checkTxt = await ev(`document.querySelector('#evCheckState').textContent`);
ck('复算结果标为一致', /ok/.test(checkCls) && /一致/.test(checkTxt), checkTxt.slice(0, 140));
const full = await ev(`document.querySelector('#evDatasetFull').textContent`);
const declared = await ev(`document.querySelector('#evDatasetDeclared').textContent`);
ck('复算值与构建期声明相同', full === declared && full === DECLARED, { full: full.slice(0, 16), declared: declared.slice(0, 16) });
ck('指纹为 64 位 hex', /^[0-9a-f]{64}$/.test(full));
ck('情景指纹已生成', /^[0-9a-f]{64}$/.test(String(await ev(`document.querySelector('#evScenarioFull').textContent`))));
ck('字节数与声明一致', String(await ev(`document.querySelector('#evDatasetBytes').textContent`))
  .replace(/,/g, '').includes(String(DATA.meta.evidence.dataset_bytes)));

/* ------------------------------------------------ 4. 情景指纹随参数变化 */
const scen0 = await ev(`document.querySelector('#evScenarioKpi').textContent`);
await setSelect('#fCsl', '0.99');
await sleep(600);
const scen1 = await ev(`document.querySelector('#evScenarioKpi').textContent`);
ck('改 CSL 后情景指纹变化', scen0 !== scen1 && /^[0-9a-f]{12}$/.test(scen1), { before: scen0, after: scen1 });
await setSelect('#fCsl', '0.95');
await sleep(600);
ck('恢复默认 CSL 后指纹回到原值', (await ev(`document.querySelector('#evScenarioKpi').textContent`)) === scen0);

/* ------------------------------------------------ 5. 导出待复核证据清单 */
await ev(`window.__blobs=[]`);
await ev(`document.querySelector('[data-do="exportEvidence"]').click()`);
await sleep(350);
const csv = String(await ev(`window.__blobs.length ? window.__blobs[window.__blobs.length-1].text() : ''`));
ck('证据清单已导出', csv.length > 1500, csv.slice(0, 90));
ck('含源文件 SHA-256', csv.includes(DATA.meta.evidence.source_sha256));
ck('含数据集声明与复算值', csv.includes(DATA.meta.evidence.dataset_sha256) && csv.includes(DECLARED));
ck('含 MATCH 结论', /dataset_hash_match,MATCH/.test(csv));
ck('含规则版本与引擎指纹', csv.includes(DATA.meta.evidence.rule_version) && csv.includes(DATA.meta.evidence.rule_sha256));
ck('含情景指纹与币种', /scenario_sha256,[0-9a-f]{64}/.test(csv) && /currency,GBP/.test(csv));
ck('导出局限全部条目', (csv.match(/\d\d,(观测销量|库存台账|单位成本|CSL|经验分位数|供应商 OTD|交付签收|可见 PO|单仓|PA\(t\)|动销|预警处置|补货量|未做大数据量)/g) || []).length >= 12);
ck('导出红线声明', /R1,/.test(csv) && /R4,/.test(csv));
ck('导出声明不是采购单', /不是采购单/.test(csv));

/* ------------------------------------------------ 6. 12 视图 × 2 宽度零溢出 */
const views = ['overview', 'alerts', 'inventory', 'purchase', 'transit', 'aging', 'excess',
  'metrics', 'segment', 'supplier', 'guide', 'evidence'];
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
ck('12 视图 × 2 宽度零溢出、无脏值', bad.length === 0, bad.slice(0, 6));
ck('零控制台错误', errors.length === 0, errors.slice(0, 4));

/* ------------------------------------------------ 7. file:// 直开下指纹仍可复算 */
await send('Page.navigate', { url: 'file://' + path.join(ROOT, 'index.html') + '?evfile=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .kpi')`)) break; }
const fileState = JSON.parse(await ev(`(()=>{document.querySelector('.nav-item[data-view="evidence"]').click();
  return JSON.stringify({secure:window.isSecureContext,subtle:!!(window.crypto&&window.crypto.subtle),
    sku:document.querySelector('#topSku').textContent,cur:window.Engine.currentCurrency()});})()`));
await sleep(700);
const fileCheck = await ev(`document.querySelector('#evCheckState')?.textContent || ''`);
ck('file:// 直开可用且币种正确', fileState.sku === '120' && fileState.cur === 'GBP', fileState);
ck('file:// 下指纹复算一致或明确降级', /一致/.test(fileCheck) || /不提供 Web Crypto/.test(fileCheck), fileCheck.slice(0, 120));

/* ------------------------------------------------ 收尾 */
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await ev(`(()=>{localStorage.removeItem('icw_alert_actions');return 1})()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?evreset=' + Math.random() });
ws.close();

const total = Object.keys(checks).length;
const failed = Object.entries(checks).filter(([, v]) => !v.ok);
fs.writeFileSync(path.join(OUT, 'evidence-ui-result.json'), JSON.stringify({ ok: failed.length === 0, total, checks, errors }, null, 2));
console.log(JSON.stringify({ ok: failed.length === 0, total, passed: total - failed.length,
  failed: failed.map(([k, v]) => ({ name: k, detail: v.detail })), errors: errors.slice(0, 5) }, null, 2));
if (failed.length || errors.length) process.exit(1);
