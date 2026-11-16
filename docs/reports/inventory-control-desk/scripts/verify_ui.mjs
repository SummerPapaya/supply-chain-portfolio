// 真实浏览器交互验证：CDP 驱动本机 Chrome，覆盖全视图、筛选、参数联动、抽屉、导出
// 用法：node scripts/verify_ui.mjs [outDir]
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/icw-verify';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pending = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').slice(0, 400));
  } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
    errors.push('CONSOLE ' + m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG: ' + m.params.entry.text.slice(0, 200) + ' @ ' + (m.params.entry.url || '').slice(-80));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__THREW__:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 300);
  return r.result.value;
};
const shot = async (file, clip) => {
  const p = { format: 'png', captureBeyondViewport: false };
  if (clip) p.clip = { ...clip, scale: 1 };
  const s = await send('Page.captureScreenshot', p);
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
};
const clickSel = async (sel, nth = 0) => {
  const rect = JSON.parse(await evaluate(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];if(!e)return 'null';
    e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));
  if (!rect || rect.w === 0) return false;
  const x = Math.round(rect.x + Math.min(rect.w / 2, 60)), y = Math.round(rect.y + rect.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: Math.max(0, y - 30), button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};
const setNative = (sel, val) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
// 关键：子资源（app.js / styles.css）会被 Chrome 缓存，导致验证跑在旧代码上却毫无报错
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4, button: 'none', buttons: 0 });

await send('Page.navigate', { url: BASE + '?r=' + Math.random() });
for (let i = 0; i < 40; i++) {
  await sleep(250);
  const ok = await evaluate(`!!document.querySelector('#view .kpi, #view .card') && document.querySelector('#topSku')?.textContent !== '—'`);
  if (ok === true) break;
}

const report = { views: [], errors, checks: {} };
report.checks.topbar = await evaluate(`(()=>JSON.stringify({
  snapshot: document.querySelector('#topSnapshot')?.textContent,
  source: document.querySelector('#topSource')?.textContent,
  sku: document.querySelector('#topSku')?.textContent,
  csl: document.querySelector('#topCsl')?.textContent,
  foot: document.querySelector('#footPeriod')?.textContent,
  title: document.title
}))()`);

const views = ['overview', 'alerts', 'inventory', 'purchase', 'transit', 'aging', 'excess', 'metrics', 'segment', 'supplier', 'guide', 'evidence'];
for (const v of views) {
  await clickSel(`.nav-item[data-view="${v}"]`);
  await sleep(420);
  const info = JSON.parse(await evaluate(`(()=>{
    const root=document.querySelector('#view');
    if(!root) return '{}';
    const cards=root.querySelectorAll('.card').length;
    const tables=root.querySelectorAll('table.tbl').length;
    const rows=root.querySelectorAll('table.tbl tbody tr').length;
    const kpis=root.querySelectorAll('.kpi').length;
    const svgs=root.querySelectorAll('svg').length;
    const txt=(root.innerText||'');
    const bad=['undefined','NaN','[object Object]','Infinity','null'].filter(k=>txt.includes(k));
    const de=document.documentElement;
    return JSON.stringify({cards,tables,rows,kpis,svgs,
      chars:txt.length, title:document.querySelector('#pageTitle')?.textContent,
      count:document.querySelector('#resultCount')?.textContent,
      bad, hOverflow:de.scrollWidth-de.clientWidth,
      offenders:[...root.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+3 && getComputedStyle(e).overflowX==='visible').slice(0,4).map(e=>e.className||e.tagName)
    });})()`));
  await shot(`${OUT}/view-${v}.png`);
  report.views.push({ view: v, ...info });
}

// 交互：检索（品名 / SKU / PO 号）
const DJ = JSON.parse(fs.readFileSync(new URL('../assets/dataset.json', import.meta.url), 'utf8'));
const poId = DJ.pos.find(p => p.status !== 'CLOSED')?.id || DJ.pos[0].id;
await clickSel('.nav-item[data-view="inventory"]'); await sleep(300);
await setNative('#fSearch', 'CAKESTAND'); await sleep(400);
report.checks.searchDesc = await evaluate(`(()=>JSON.stringify({count:document.querySelector('#resultCount')?.textContent,
  rows:document.querySelectorAll('#view table.tbl tbody tr').length,
  first:document.querySelector('#view table.tbl tbody tr')?.innerText?.slice(0,90)}))()`);
await clickSel('.nav-item[data-view="purchase"]'); await sleep(300);
await setNative('#fSearch', poId); await sleep(400);
report.checks.searchPo = { poId, ...JSON.parse(await evaluate(`(()=>JSON.stringify({
  count:document.querySelector('#resultCount')?.textContent,
  rows:document.querySelectorAll('#view table.tbl tbody tr').length,
  first:document.querySelector('#view table.tbl tbody tr')?.innerText?.slice(0,100)
}))()`)) };
await setNative('#fSearch', ''); await sleep(250);
await clickSel('.nav-item[data-view="inventory"]'); await sleep(300);

// 交互：服务水平联动（95% -> 99.5%），应重算 SS/ROP
const before = await evaluate(`(()=>{const e=[...document.querySelectorAll('#view table.tbl tbody tr')][0];return e?e.innerText.slice(0,200):'';})()`);
await setNative('#fCsl', '0.995'); await sleep(500);
const after = await evaluate(`(()=>{const e=[...document.querySelectorAll('#view table.tbl tbody tr')][0];return e?e.innerText.slice(0,200):'';})()`);
report.checks.cslLinkage = { before, after, changed: before !== after, z: await evaluate(`document.querySelector('#topCsl')?.textContent`) };
await setNative('#fCsl', '0.95'); await sleep(300);

// 交互：排序（比较整列前 6 行，避免首行巧合）
const ci = await evaluate(`document.querySelectorAll('#view table.tbl thead [data-sort]')[2]?.cellIndex`);
const readCol = (i) => evaluate(`[...document.querySelectorAll('#view table.tbl tbody tr')].slice(0,6).map(r=>r.cells[${i}]?.innerText).join(' | ')`);
const sortBefore = await readCol(ci);
await clickSel('#view table.tbl thead [data-sort]', 2); await sleep(350);
const sortAfter = await readCol(ci);
report.checks.sort = { colIndex: ci, before: sortBefore, after: sortAfter,
  changed: sortBefore !== sortAfter,
  arrow: await evaluate(`document.querySelector('#view table.tbl thead .arrow')?.textContent || ''`) };

// 交互：SKU 下钻抽屉
await clickSel('#view table.tbl tbody tr', 0); await sleep(450);
report.checks.drawer = await evaluate(`(()=>{const d=document.querySelector('#drawer');return JSON.stringify({
  open:d?.classList.contains('show'), chars:d?.innerText?.length,
  head:d?.querySelector('h2')?.textContent,
  hasCalc:(d?.innerText||'').includes('指标代入过程') && (d?.innerText||'').includes('ROP'),
  sections:d?.querySelectorAll('.drawer-section').length,
  svgs:d?.querySelectorAll('svg').length
});})()`);
await shot(`${OUT}/drawer.png`);
await clickSel('#scrim'); await sleep(300);
report.checks.drawerClosed = await evaluate(`!document.querySelector('#drawer')?.classList.contains('show')`);

// 交互：参数与口径（右上角按钮切换视图）+ 滑块联动重算
await clickSel('#btnParams'); await sleep(450);
report.checks.paramsPanel = await evaluate(`(()=>{const v=document.querySelector('#view');return JSON.stringify({
  view:document.querySelector('#pageTitle')?.textContent, chars:v?.innerText?.length,
  params:v?.querySelectorAll('[data-param]').length,
  hasDict:(v?.innerText||'').includes('指标公式字典'),
  hasSource:(v?.innerText||'').includes('archive.ics.uci.edu')
});})()`);
await shot(`${OUT}/params.png`);
const impactBefore = await evaluate(`document.querySelector('#impactBox')?.innerText.slice(0,220)`);
const slider = await evaluate(`(()=>{const e=document.querySelector('#view input[type=range][data-param="cost_rate"]');
  return e?JSON.stringify({key:e.dataset.param,min:e.min,max:e.max,step:e.step,val:e.value}):'null';})()`);
await evaluate(`(()=>{const e=document.querySelector('#view input[type=range][data-param="cost_rate"]');if(!e)return false;
  const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  const nv=Math.min(Number(e.max),Number(e.value)+Number(e.step)*3);
  s.call(e,String(nv));e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
await sleep(450);
const impactAfter = await evaluate(`document.querySelector('#impactBox')?.innerText.slice(0,220)`);
report.checks.paramLinkage = { slider, before: impactBefore, after: impactAfter, changed: impactBefore !== impactAfter };
await clickSel('#btnResetParams'); await sleep(350);
report.checks.paramReset = await evaluate(`document.querySelector('#toast')?.textContent || ''`);
// guide 页横向溢出精确定位
report.checks.guideOverflow = await evaluate(`(()=>{const de=document.documentElement;
  const top=[...document.querySelectorAll('#view *')].map(e=>({tag:e.tagName,
    cls:(typeof e.className==='string'?e.className:'').slice(0,55),sw:e.scrollWidth,cw:e.clientWidth,
    right:Math.round(e.getBoundingClientRect().right),ov:getComputedStyle(e).overflowX}))
    .filter(x=>x.sw>x.cw+3&&x.ov==='visible').sort((a,b)=>(b.sw-b.cw)-(a.sw-a.cw)).slice(0,8);
  return JSON.stringify({hOverflow:de.scrollWidth-de.clientWidth,top});})()`);

// 业务口径专项：真双轴、交期偏差方向、抽屉网格无空格
await clickSel('.nav-item[data-view="metrics"]'); await sleep(350);
report.checks.dualAxis = await evaluate(`(()=>{const t=[...document.querySelectorAll('#view .chart .ax-r')].map(e=>e.textContent);
  return JSON.stringify({count:t.length,labels:t,hasLegend:(document.querySelector('#view').innerText||'').includes('右轴')});})()`);
await clickSel('.nav-item[data-view="transit"]'); await sleep(350);
report.checks.variance = await evaluate(`(()=>{const th=[...document.querySelectorAll('#view table.tbl thead th')];
  const i=th.findIndex(x=>x.innerText.includes('交期偏差'));
  const vals=[...document.querySelectorAll('#view table.tbl tbody tr')].slice(0,6).map(r=>r.cells[i]?.innerText.trim());
  const sample=window.INV_DATA.pos.filter(p=>p.status!=='CLOSED').slice(0,2).map(p=>({id:p.id,promise:p.promise_date,eta:p.eta}));
  return JSON.stringify({colIndex:i,vals,sample});})()`);
await clickSel('.nav-item[data-view="inventory"]'); await sleep(300);
await clickSel('#view table.tbl tbody tr', 0); await sleep(350);
report.checks.metricGrid = await evaluate(`(()=>{const g=document.querySelector('#drawer .metric-grid');
  return JSON.stringify({cells:g?.children.length,cols:g?getComputedStyle(g).gridTemplateColumns:'',
    last:g?.lastElementChild?.innerText});})()`);
await clickSel('#scrim'); await sleep(200);

// 交互：导出 / 模板按钮（只验证点击不报错）
await clickSel('.nav-item[data-view="inventory"]'); await sleep(300);
for (const [sel, name] of [['#btnExport', 'export'], ['#btnTemplate', 'template']]) {
  const errBefore = errors.length;
  await clickSel(sel); await sleep(350);
  report.checks[name] = await evaluate(`document.querySelector('#toast')?.textContent || ''`).then(t => ({ toast: t, newErrors: errors.slice(errBefore) }));
}

// 交互：预警中心筛选严重度
await clickSel('.nav-item[data-view="alerts"]'); await sleep(350);
const sevOpts = await evaluate(`JSON.stringify([...document.querySelectorAll('#fSeverity option')].map(o=>({v:o.value,t:o.textContent})))`);
report.checks.sevOptions = sevOpts;
await clickSel('.nav-item[data-view="overview"]'); await sleep(350);

// 全页渲染质量：设备像素比 2 的局部放大检查
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 2, mobile: false });
await sleep(300);
await shot(`${OUT}/overview-2x.png`, { x: 190, y: 100, width: 1000, height: 620 });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });

// 窄屏（笔记本 1366）
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(300);
report.checks.narrow = await evaluate(`(()=>{const de=document.documentElement;return JSON.stringify({
  hOverflow:de.scrollWidth-de.clientWidth, filterH:Math.round(document.querySelector('#filterbar')?.getBoundingClientRect().height||0)
});})()`);
await shot(`${OUT}/overview-1366.png`);

report.errors = errors;
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
