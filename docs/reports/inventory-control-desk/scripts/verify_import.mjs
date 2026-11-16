// 端到端验证：自有 CSV 导入 → 全链路重算 → 恢复演示数据 → 预警处置闭环留痕
import fs from 'node:fs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CSV = '/tmp/icw-import-test.csv';

// 1) 构造一份真实可用的最小业务数据（3 SKU / 52 周需求）
const head = ['sku', 'description', 'category', 'warehouse', 'supplier', 'unit_price', 'lead_days', 'lead_sd_days',
  'on_hand', 'reserved', 'quarantine', 'blocked', 'avg_inventory_qty', 'lifecycle'];
for (let i = 1; i <= 52; i++) head.push('w' + i);
const rows = [
  ['SKU-T01', '测试品 A / Test Item A', '测试类 / QA', 'DC-01', 'SUP-01', 12.5, 14, 3, 620, 30, 0, 0, 600, 'ACTIVE'],
  ['SKU-T02', '测试品 B / Test Item B', '测试类 / QA', 'DC-02', 'SUP-02', 8, 21, 5, 140, 0, 0, 0, 200, 'ACTIVE'],
  ['SKU-T03', '测试品 C / 停售', '测试类 / QA', 'DC-01', 'SUP-01', 30, 28, 7, 900, 0, 0, 0, 900, 'PHASE_OUT'],
].map((r, ri) => r.concat(Array.from({ length: 52 }, (_, i) =>
  ri === 2 ? (i > 40 ? 0 : 4 + (i % 5)) : 20 + ((i * 7 + ri * 11) % 23))));
const meta = ['# 库存控制工作台 · 导入测试', '# snapshot_date=2026-11-09'];
fs.writeFileSync(CSV, '\ufeff' + meta.concat([head.join(',')]).concat(rows.map(r => r.join(','))).join('\r\n'), 'utf8');

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails?.exception?.description || '').slice(0, 250));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('CONSOLE: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result?.value ?? ('THREW ' + (r.exceptionDetails?.exception?.description || '').slice(0, 250)); };
const clickSel = async (sel, nth = 0) => {
  const rect = JSON.parse(await ev(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}];if(!e)return 'null';
    e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height});})()`));
  if (!rect || !rect.w) return false;
  const x = Math.round(rect.x + Math.min(rect.w / 2, 50)), y = Math.round(rect.y + rect.h / 2);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: Math.max(0, y - 25), button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return true;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('DOM.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1200, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/?imp=' + Math.random() });
for (let i = 0; i < 40; i++) { await sleep(250); if (await ev(`!!document.querySelector('#view .card')`)) break; }

const out = {};
out.before = JSON.parse(await ev(`JSON.stringify({sku:document.querySelector('#topSku').textContent,po:document.querySelector('#badgePo').textContent})`));

// 2) 通过 CDP 把本地 CSV 挂到 <input type=file> 上，走真实 FileReader 链路
const root = await send('DOM.getDocument', { depth: 1 });
const fi = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#fileInput' });
await send('DOM.setFileInputFiles', { files: [CSV], nodeId: fi.nodeId });
await sleep(900);
out.afterImport = JSON.parse(await ev(`(()=>JSON.stringify({
  sku:document.querySelector('#topSku').textContent,
  source:document.querySelector('#topSource').textContent,
  snapshot:document.querySelector('#topSnapshot').textContent,
  toast:document.querySelector('#toast').textContent,
  resultCount:document.querySelector('#resultCount').textContent,
  kpi:document.querySelector('#view .kpi .k-value')?.textContent,
  rows:document.querySelectorAll('#view table.tbl tbody tr').length
}))()`));
// 各视图在导入数据下是否都能渲染
out.importViews = {};
for (const v of ['inventory', 'alerts', 'transit', 'aging', 'excess', 'metrics']) {
  await clickSel(`.nav-item[data-view="${v}"]`); await sleep(280);
  out.importViews[v] = JSON.parse(await ev(`(()=>JSON.stringify({
    count:document.querySelector('#resultCount').textContent,
    chars:document.querySelector('#view').innerText.length,
    bad:['undefined','NaN','[object Object]','Infinity'].filter(k=>document.querySelector('#view').innerText.includes(k)),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }))()`));
}
// 3) 恢复演示数据
await clickSel('.nav-item[data-view="guide"]'); await sleep(300);
await clickSel('[data-do="restore"]'); await sleep(450);
out.afterRestore = JSON.parse(await ev(`(()=>JSON.stringify({
  sku:document.querySelector('#topSku').textContent,
  source:document.querySelector('#topSource').textContent,
  toast:document.querySelector('#toast').textContent
}))()`));

// 4) 预警处置闭环：处置 → 填经办人 → 确认 → 本地留痕 → 状态变化
await clickSel('.nav-item[data-view="alerts"]'); await sleep(350);
const handledBefore = await ev(`document.querySelectorAll('#view .kpi')[3]?.querySelector('.k-value')?.textContent`);
await clickSel('[data-edit-alert]'); await sleep(300);
out.ackForm = await ev(`(()=>JSON.stringify({owner:!!document.querySelector('#ackOwner'),reason:!!document.querySelector('#ackReason'),note:!!document.querySelector('#ackNote')}))()`);
await ev(`(()=>{const e=document.querySelector('#ackOwner');e.value='张伟 / SC-014';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
await clickSel('[data-ack="ACK"]'); await sleep(400);
out.afterAck = JSON.parse(await ev(`(()=>JSON.stringify({
  handled:document.querySelectorAll('#view .kpi')[3]?.querySelector('.k-value')?.textContent,
  stored:Object.keys(JSON.parse(localStorage.getItem('icw_alert_actions')||'{}')).length,
  sample:JSON.stringify(Object.values(JSON.parse(localStorage.getItem('icw_alert_actions')||'{}'))[0]||{}),
  confirmed:(document.querySelector('#view').innerText||'').includes('已确认')
}))()`));
out.handledBefore = handledBefore;
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
ws.close();
