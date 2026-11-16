// 安全库存专项验证：z 值表 / 自定义 CSL / 90% 档位 / 抽屉公式代入 / 参数口径
// 用法：node scripts/verify_ss.mjs [outDir]
// 前置：本地 8765 静态服务 + 9333 调试端口 Chrome
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/icw-ss';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no Chrome page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return '__THREW__:' + (r.exceptionDetails.exception?.description || '').slice(0, 250);
  return r.result.value;
};
const shot = async (f) => {
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
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?ss=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .card')`)) break; }

const report = {};
report.zValues = JSON.parse(await ev(`JSON.stringify([0.9,0.93,0.95,0.97,0.975,0.98,0.99,0.995,0.999].map(c=>[c,+Engine.zFor(c).toFixed(4)]))`));
report.monotonic = report.zValues.every((v, i, a) => i === 0 || v[1] > a[i - 1][1]);
report.csl90InTable = report.zValues[0][1] === 1.2816;

await click('.nav-item[data-view="inventory"]'); await sleep(350);
const ssCol = await ev(`[...document.querySelectorAll('#view table.tbl thead th')].findIndex(t=>t.innerText.trim()==='SS')`);
const readFirst = `(()=>{const r=document.querySelector('#view table.tbl tbody tr');if(!r)return null;
  return JSON.stringify({sku:r.cells[0]?.innerText.trim(),ss:r.cells[${ssCol}]?.innerText.trim()});})()`;
const at95 = JSON.parse(await ev(readFirst));
await setNative('#fCsl', '0.90'); await sleep(400);
const at90 = JSON.parse(await ev(readFirst));
report.tableSS = { colIndex: ssCol, csl95: at95, csl90: at90 };
report.tableSS.positiveAt90 = parseFloat((at90?.ss || '').replace(/,/g, '')) > 0;
report.tableSS.smallerAt90 = parseFloat((at90?.ss || '').replace(/,/g, '')) < parseFloat((at95?.ss || '').replace(/,/g, ''));

// 打开 SKU 抽屉，核对「指标代入过程」的公式与数值
await click('#view table.tbl tbody tr', 0); await sleep(450);
const formula = await ev(`document.querySelector('#drawer .formula')?.innerText || ''`);
report.drawer = {
  shown: await ev(`!!document.querySelector('#drawer').classList.contains('show')`),
  hasZ: /z\s*=\s*1\.2816/.test(formula),
  hasCsl: /CSL\s*90/.test(formula),
  hasSsFormula: /√\(L·σ_d² \+ d̄²·σ_L²\)/.test(formula),
  ssLine: (formula.match(/SS\s*=.*/) || [''])[0].slice(0, 110),
  ropLine: (formula.match(/ROP\s*=.*/) || [''])[0].slice(0, 80),
};
// 用引擎独立复算抽屉里那个 SKU，验证 UI 显示值 == 计算值
const ss90num = parseFloat((at90?.ss || '0').replace(/,/g, '')) || 0;
report.drawer.matchesEngine = JSON.parse(await ev(`(()=>{
  const id=${JSON.stringify(at90?.sku || '')};
  const r=Engine.compute(window.INV_DATA,{csl:0.90});
  const s=r.skus.find(x=>x.id===id); if(!s)return 'false';
  return JSON.stringify(Math.round(s.m.ss)===${ss90num});})()`));
await shot(`${OUT}/drawer-csl90.png`);

// 恢复默认并核对 95% 档 SS 回升
await click('#drawer [data-close]'); await sleep(250);
await setNative('#fCsl', '0.95'); await sleep(400);
report.restored = JSON.parse(await ev(readFirst));
await click('.nav-item[data-view="metrics"]'); await sleep(350);
report.dict = await ev(`(()=>{const t=[...document.querySelectorAll('#view .dict-table tbody tr')]
  .find(r=>r.cells[0]?.innerText.includes('安全库存'));return t?t.innerText.replace(/\\n/g,' | '):'MISSING';})()`);
await click('.nav-item[data-view="guide"]'); await sleep(350);
report.guide = JSON.parse(await ev(`JSON.stringify({
  hasCslParam:/服务水平 CSL/.test(document.querySelector('#view')?.innerText||''),
  hasImpact:/安全库存合计/.test(document.querySelector('#view')?.innerText||''),
  hOverflow:document.documentElement.scrollWidth>window.innerWidth
})`));
await shot(`${OUT}/guide.png`);
report.errors = errors;

console.log(JSON.stringify(report, null, 2));
const ok = report.monotonic && report.csl90InTable && report.tableSS.positiveAt90 &&
  report.tableSS.smallerAt90 && report.drawer.shown && report.drawer.hasZ &&
  report.drawer.hasSsFormula && report.drawer.matchesEngine === true && errors.length === 0;
console.log(ok ? '\nSS VERIFY: PASS' : '\nSS VERIFY: FAIL');
ws.close();
process.exit(ok ? 0 : 1);
