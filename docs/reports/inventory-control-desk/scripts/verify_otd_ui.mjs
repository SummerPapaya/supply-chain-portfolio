// 供应商交期视图 · 真实浏览器交互验证（CDP 驱动本机 Chrome）
// 前置：静态服务 127.0.0.1:8765 + Chrome 调试端口 127.0.0.1:9333
// 用法：node scripts/verify_otd_ui.mjs [outDir]
import fs from 'node:fs';
const OUT = process.argv[2] || '/tmp/icw-verify';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8765/';
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
    errors.push('EXCEPTION ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 300));
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('CONSOLE ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 250));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG ' + m.params.entry.text.slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__THREW__:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 300);
  return r.result.value;
};
const shot = async file => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
};
const clickSel = async (sel, nth = 0) => {
  const rect = JSON.parse(await evaluate(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];if(!e)return 'null';
    e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));
  if (!rect || rect.w === 0) return false;
  const x = Math.round(rect.x + Math.min(rect.w / 2, 60)), y = Math.round(rect.y + rect.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};
const setNative = (sel, val) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
const snapshot = () => evaluate(`(()=>{const v=document.querySelector('#view');const de=document.documentElement;
  const t=v.innerText||'';return JSON.stringify({
    title:document.querySelector('#pageTitle')?.textContent,
    count:document.querySelector('#resultCount')?.textContent,
    cards:v.querySelectorAll('.card').length,tables:v.querySelectorAll('table.tbl').length,
    kpis:v.querySelectorAll('.kpi').length,rows:v.querySelectorAll('table.tbl tbody tr').length,
    detailRows:v.querySelectorAll('[data-tablekey="deliveryDetail"] tbody tr').length,
    activeMode:document.querySelector('#view .seg [data-ltmode].active')?.dataset.ltmode||'',
    ssKpi:v.querySelectorAll('.kpi')[3]?.querySelector('.k-value')?.textContent||'',
    otdKpi:v.querySelectorAll('.kpi')[2]?.querySelector('.k-value')?.textContent||'',
    effFirst:v.querySelector('#view table.tbl')?.innerText.slice(0,160)||'',
    bad:['undefined','NaN','[object Object]','Infinity'].filter(k=>t.includes(k)),
    hOverflow:de.scrollWidth-de.clientWidth,
    offenders:[...v.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+3&&getComputedStyle(e).overflowX==='visible').slice(0,4).map(e=>e.className||e.tagName)
  });})()`);

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '?r=' + Math.random() });
for (let i = 0; i < 40; i++) {
  await sleep(250);
  if (await evaluate(`!!document.querySelector('#view .kpi') && document.querySelector('#topSku')?.textContent!=='—'`) === true) break;
}

const report = { errors, steps: [] };
const step = (name, data) => report.steps.push({ name, ...data });

// 1. 供应商视图默认态
await clickSel('.nav-item[data-view="supplier"]'); await sleep(500);
const s0 = JSON.parse(await snapshot());
step('default', s0);
await shot(`${OUT}/otd-contract.png`);

// 2. 切换实测滚动
await clickSel('#view .seg [data-ltmode="rolling"]'); await sleep(550);
const s1 = JSON.parse(await snapshot());
step('rolling', s1);
await shot(`${OUT}/otd-rolling.png`);

// 3. OTD 判定基准切换
const basisOk = await setNative('#view select[data-param="otd_basis"]', 'contract');
await sleep(500);
const s2 = JSON.parse(await snapshot());
step('basis-contract', { basisOk, ...s2 });

// 4. 滚动窗口缩短
const winOk = await setNative('#view input[type="range"][data-param="otd_window_weeks"]', '4');
await sleep(500);
const s3 = JSON.parse(await snapshot());
step('window-4w', { winOk, ...s3 });

// 5. 供应商下钻
await setNative('#view select[data-param="otd_basis"]', 'eta'); await sleep(400);
await setNative('#view input[type="range"][data-param="otd_window_weeks"]', '26'); await sleep(400);
const beforeDrill = JSON.parse(await snapshot()).detailRows;
await clickSel('#view [data-ltsupplier="SUP-06"]'); await sleep(500);
const s4 = JSON.parse(await snapshot());
step('drill-SUP-06', { beforeDrill, ...s4 });
await shot(`${OUT}/otd-drill.png`);

// 6. 抽屉中的交期依据
await clickSel('.nav-item[data-view="inventory"]'); await sleep(400);
await clickSel('#view table.tbl tbody tr', 0); await sleep(500);
const drawer = await evaluate(`(()=>{const d=document.querySelector('#drawer');const t=d.innerText||'';
  return JSON.stringify({show:d.classList.contains('show'),hasProv:t.includes('供应商交期依据'),
    hasEffL:t.includes('生效提前期 L'),hasOtd:t.includes('供应商 OTD'),
    hasTrace:t.includes('L / σ_L 来源'),bad:['undefined','NaN','Infinity'].filter(k=>t.includes(k))});})()`);
step('drawer', JSON.parse(drawer));
await shot(`${OUT}/otd-drawer.png`);
await evaluate(`document.querySelector('#scrim').click()`);

// 7. 窄屏 1366 溢出
await clickSel('.nav-item[data-view="supplier"]'); await sleep(400);
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(450);
const s5 = JSON.parse(await snapshot());
step('1366', s5);
await shot(`${OUT}/otd-1366.png`);

// 判定
const checks = {
  viewLoaded: s0.title === '供应商交期与 OTD' && s0.tables >= 3 && s0.kpis === 4,
  defaultContract: s0.activeMode === 'contract' && /0\.0%|—/.test(s0.ssKpi),
  rollingApplies: s1.activeMode === 'rolling' && s1.ssKpi !== s0.ssKpi && /\+/.test(s1.ssKpi),
  basisSwitches: basisOk === true && s2.otdKpi !== s1.otdKpi,
  windowChanges: winOk === true && s3.count !== s1.count,
  drillFilters: s4.detailRows > 0 && s4.detailRows < beforeDrill,
  drawerProvenance: JSON.parse(drawer).hasProv && JSON.parse(drawer).hasEffL && JSON.parse(drawer).hasOtd,
  noOverflow: [s0, s1, s2, s3, s4, s5].every(x => x.hOverflow <= 1 && x.offenders.length === 0 && x.bad.length === 0),
  narrowOverflow: s5.hOverflow <= 1 && s5.offenders.length === 0,
  noConsoleErrors: errors.length === 0,
};
report.checks = checks;
report.ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
