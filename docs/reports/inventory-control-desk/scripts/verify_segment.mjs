// ABC×XYZ 差异化服务水平专项验证：矩阵切换 / 九宫格下钻 / CSL 编辑联动 / 经验分位公式 / 分级筛选
// 用法：node scripts/verify_segment.mjs [outDir]
// 前置：本地 8765 静态服务 + 9333 调试端口 Chrome
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/icw-segment';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('no Chrome page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 200));
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push('LOG ' + m.params.entry.text.slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__THREW__:' + (r.exceptionDetails.exception?.description || '').slice(0, 250);
  return r.result.value;
};
const shot = async f => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(f, Buffer.from(s.data, 'base64'));
};
const setNative = (sel, val) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;
  e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
const click = async (sel, nth = 0) => {
  const r = JSON.parse(await ev(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if(!e)return 'null';e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();
    return JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height});})()`));
  if (!r || !r.w) return false;
  const x = Math.round(r.x + Math.min(r.w / 2, 60)), y = Math.round(r.y + r.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?seg=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .card')`)) break; }

const report = { checks: {} };
const j = async x => JSON.parse(await ev(x));
const goto = async v => { await click(`.nav-item[data-view="${v}"]`); await sleep(420); };

// 1. 默认全局模式：九宫格展示预设值、矩阵编辑器 9 档、对比表完整
await goto('segment');
report.checks.defaultView = await j(`JSON.stringify({
  view:document.querySelector('#pageTitle')?.textContent,
  cells:document.querySelectorAll('.seg-cell').length,
  selects:document.querySelectorAll('[data-seg]').length,
  cmpRows:document.querySelectorAll('.cmp-table tbody tr').length,
  detailRows:document.querySelectorAll('#view table.tbl tbody tr').length,
  topbar:document.querySelector('#topCsl')?.textContent,
  presetDistinct:new Set([...document.querySelectorAll('.seg-csl')].map(e=>e.textContent)).size,
  showEffective:[...document.querySelectorAll('.seg-cell')].filter(e=>e.innerText.includes('当前生效')).length,
  cslLabel:document.querySelector('#fCslLabel')?.textContent,
  cslInactive:document.querySelector('#fCslWrap')?.classList.contains('policy-inactive'),
  hOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
})`);
await shot(`${OUT}/segment-global.png`);

// 2. 九宫格下钻：点击 CZ 格 → 明细只留 CZ SKU
await click('.seg-cell[data-segfilter="CZ"]'); await sleep(380);
report.checks.drilldown = await j(`JSON.stringify({
  count:document.querySelector('#resultCount')?.textContent,
  rows:document.querySelectorAll('#view table.tbl:last-of-type tbody tr').length,
  active:document.querySelector('.seg-cell.active')?.dataset.segfilter,
  segments:[...document.querySelectorAll('#view table.tbl tbody tr')].slice(0,50)
    .map(r=>[...r.cells].map(c=>c.innerText.trim())).filter(c=>c[2]==='CZ').length
})`);
await shot(`${OUT}/segment-drilldown.png`);
await click('[data-segfilter=""]'); await sleep(320);
report.checks.drillCleared = await ev(`!document.querySelector('.seg-cell.active')`);

// 3. 切换到差异化矩阵：顶栏、生效 CSL 分布、KPI
await click('[data-mode="matrix"]'); await sleep(480);
report.checks.matrixMode = await j(`JSON.stringify({
  topbar:document.querySelector('#topCsl')?.textContent,
  modeActive:document.querySelector('[data-mode="matrix"]')?.classList.contains('active'),
  effectiveDistinct:new Set([...document.querySelectorAll('.seg-csl')].map(e=>e.textContent)).size,
  empiricalKpi:[...document.querySelectorAll('#view .kpi')].find(k=>k.innerText.includes('经验分位'))?.innerText.replace(/\\n/g,' | '),
  compareRow:document.querySelector('.cmp-table tbody tr')?.innerText.replace(/\\n/g,' | '),
  noGlobalNote:![...document.querySelectorAll('.seg-cell')].some(e=>e.innerText.includes('当前生效')),
  cslLabel:document.querySelector('#fCslLabel')?.textContent,
  cslInactive:document.querySelector('#fCslWrap')?.classList.contains('policy-inactive'),
  hOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
})`);
await shot(`${OUT}/segment-matrix.png`);

// 4. 矩阵档位编辑联动：AX 从 99% 改到 85%，表格里该 AX SKU 的 CSL 与 SS 都要下降
const axSku = await j(`(()=>{const r=Engine.compute(window.INV_DATA,{segment_csl:'matrix'});
  const s=r.skus.find(x=>x.m.segment==='AX');return JSON.stringify({id:s.id,ss:Math.round(s.m.ss),csl:s.m.cslEff});})()`);
report.checks.axBefore = axSku;
await setNative('#fSearch', axSku.id); await sleep(400);
const readAx = `(()=>{const r=[...document.querySelectorAll('#view table.tbl tbody tr')].find(x=>x.cells[0]?.innerText.trim()===${JSON.stringify(axSku.id)});
  return r?JSON.stringify({csl:r.cells[6]?.innerText.trim(),ss:r.cells[8]?.innerText.trim(),model:r.cells[7]?.innerText.trim()}):'null';})()`;
const axUiBefore = JSON.parse(await ev(readAx));
await setNative('[data-seg="AX"]', '0.85'); await sleep(480);
const axUiAfter = JSON.parse(await ev(readAx));
report.checks.axEditor = await j(`JSON.stringify({
  value:document.querySelector('[data-seg="AX"]')?.value,
  toast:document.querySelector('#toast')?.textContent,
  preset:document.querySelector('.seg-cell[data-segfilter="AX"] .seg-csl')?.textContent
})`);
report.checks.axSS = {
  before: axUiBefore, after: axUiAfter,
  cslChanged: axUiBefore?.csl !== axUiAfter?.csl,
  decreased: parseFloat((axUiAfter?.ss || '0').replace(/,/g, '')) < parseFloat((axUiBefore?.ss || '0').replace(/,/g, '')),
};
await click('#btnMatrixReset'); await sleep(380);
report.checks.matrixReset = await ev(`document.querySelector('[data-seg="AX"]')?.value`);
await setNative('#fSearch', ''); await sleep(300);

// 5. Z 类 SKU 抽屉必须显示经验分位公式，且 ROP == Q_LTD
await goto('inventory');
await setNative('#fAbc', 'xyz:Z'); await sleep(420);
report.checks.zFilter = await j(`JSON.stringify({
  count:document.querySelector('#resultCount')?.textContent,
  rows:document.querySelectorAll('#view table.tbl tbody tr').length,
  firstSeg:(()=>{const r=document.querySelector('#view table.tbl tbody tr');return r?r.cells[4].innerText.trim()+r.cells[5].innerText.trim():''})(),
  cslSample:document.querySelector('#view table.tbl tbody tr')?.cells[13]?.innerText.trim()
})`);
await click('#view table.tbl tbody tr', 0); await sleep(460);
const dr = await ev(`document.querySelector('#drawer')?.innerText || ''`);
report.checks.drawer = {
  open: await ev(`document.querySelector('#drawer')?.classList.contains('show')`),
  hasSegmentRationale: dr.includes('分类与服务水平依据'),
  hasQltd: /Q_LTD/.test(dr),
  hasNormalCompare: /正态式对照/.test(dr),
  hasZTag: /XYZ Z/.test(dr),
  hasLeadProv: dr.includes('供应商交期依据'),   // 供应商交期轮新增的交期溯源区
  cells: await ev(`document.querySelectorAll('#drawer .metric-grid > div').length`),
  formulaLine: (dr.match(/SS\s*=\s*Q_LTD[^\n]*/) || [''])[0].slice(0, 120),
};
await shot(`${OUT}/drawer-empirical.png`);
await click('#drawer [data-close]'); await sleep(250);
await setNative('#fAbc', ''); await sleep(300);

// 6. 参数页模式下拉联动 + 恢复全局
await goto('guide');
await setNative('[data-param="segment_csl"]', 'global'); await sleep(420);
report.checks.guideMode = await j(`JSON.stringify({
  value:document.querySelector('[data-param="segment_csl"]')?.value,
  topbar:document.querySelector('#topCsl')?.textContent,
  banner:document.querySelector('#view .callout')?.innerText.slice(0,120)
})`);
report.checks.export = { toast: await ev(`(()=>{document.querySelector('#btnExport').click();return document.querySelector('#toast')?.textContent})()`) };
await sleep(250);
report.checks.finalOverflow = await ev(`document.documentElement.scrollWidth-document.documentElement.clientWidth`);
report.errors = errors;

console.log(JSON.stringify(report, null, 2));
const c = report.checks;
const ok = c.defaultView.cells === 9 && c.defaultView.selects === 9 && c.defaultView.topbar === '95.0%' &&
  c.defaultView.presetDistinct > 1 && c.defaultView.showEffective === 9 && c.defaultView.hOverflow === 0 &&
  c.defaultView.cslLabel === '服务水平 CSL' && c.defaultView.cslInactive === false &&
  c.matrixMode.cslLabel === '对照基线 CSL' && c.matrixMode.cslInactive === true &&
  c.drilldown.active === 'CZ' && c.drillCleared === true &&
  c.matrixMode.topbar.startsWith('ABC×XYZ') && c.matrixMode.modeActive && c.matrixMode.noGlobalNote &&
  c.axEditor.value === '0.85' && c.axSS.cslChanged && c.axSS.decreased && c.matrixReset === '0.99' &&
  c.drawer.open && c.drawer.hasSegmentRationale && c.drawer.hasQltd && c.drawer.hasNormalCompare &&
  c.drawer.cells === 25 && c.drawer.hasLeadProv && c.guideMode.value === 'global' && c.finalOverflow === 0 && errors.length === 0;
console.log(ok ? '\nSEGMENT VERIFY: PASS' : '\nSEGMENT VERIFY: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
