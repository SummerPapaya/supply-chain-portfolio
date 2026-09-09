// Offline regression checks. These do not replace visual browser inspection.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id, {innerHTML: '', value: '', listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, scrollIntoView() {}, focus() {}});
  return elements.get(id);
};
let exportedBlob;
const document = {documentElement: {}, getElementById: element,
  querySelector: element, querySelectorAll: () => [], body: {appendChild() {}},
  createElement: () => ({click() {}, remove() {}})};
const context = vm.createContext({document, window: {innerWidth: 1280, addEventListener() {}},
  setTimeout: () => 1, clearTimeout() {}, Blob,
  URL: {createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; }, revokeObjectURL() {}}, assert});
const run = code => vm.runInContext(code, context);
run(script);
let combinations = 0;
for (const market of ['cn', 'world']) for (const period of ['Q1', 'Q2', 'H1'])
for (const lang of ['zh', 'en', 'bi']) for (const sector of ['chips','ev','commerce','cold','ai','grid','storage','robot']) {
  run(`market='${market}';period='${period}';lang='${lang}';diagnosticSector='${sector}';render();`);
  const output = element('report').innerHTML;
  assert.equal((output.match(/<article class="sector-panel/g) || []).length, 8);
  assert.equal((output.match(/id="diagnostic-sector"/g) || []).length, 1);
  assert(!output.includes('NaN') && !output.includes('undefined'));
  assert(output.includes('class="unavailable"'));
  assert(output.includes(`data-window="${period}"`));
  if(period==='Q1')assert(!output.includes('class="period-change"'));
  combinations++;
}
run(`
  assert(rows.every(r=>Number.isFinite(r.value)));
  assert(rows.every(r=>(r.inputs||[r.source]).every(id=>sources[id])));
  const get=(m,s,k)=>researchMetrics.find(x=>x.m===m&&x.s===s&&x.k===k);
  assert.equal(get('cn','robot','scale').values.Q2,537689-237554);
  assert.equal(get('world','ai','scale').values.H1,30876+35802);
  assert.equal(get('world','ai','cash').values.H1,46679+55441);
  assert.equal(get('world','grid','scale').values.Q1,6597-3637);
  assert.equal(get('world','robot','cash').values.H1,596); // stock, not sum
  assert.equal(get('cn','ai','scale').values.Q2,get('cn','ai','scale').values.H1);
  assert.equal(get('cn','grid','growth').values.Q2,null);
  assert.equal(metricType(get('cn','ai','scale')),'stock');
  assert.equal(metricType(get('world','robot','cash')),'stock');
  assert.equal(metricType(get('world','grid','profit')),'ratio');
  assert.equal(metricType(get('cn','robot','growth')),'growth');
  market='cn';period='Q2';lang='en';render();
  assert(document.getElementById('report').innerHTML.includes('data-delta-unit="pp"'));
  assert(document.getElementById('report').innerHTML.includes('percentage points'));
  market='world';period='H1';
  assert(windowKpis('').includes('H1 actual unverified'));
  assert(!windowKpis('').includes('3.2'));
  market='world';period='Q2';lang='en';render();
`);
element('report').listeners.change({target: {id: 'diagnostic-sector', value: 'grid'}});
assert(element('dimensions').outerHTML.includes('18.4'));
element('period').listeners.change({target: {value: 'Q1'}});
assert(element('report').innerHTML.includes('value="grid" selected'));
element('csv').onclick();
(async () => {
  const bytes = new Uint8Array(await exportedBlob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0,3)), [239,187,191]);
  const csv = await exportedBlob.text();
  assert(csv.includes('Microsoft') && csv.includes('source_url'));
  assert(!csv.includes('"null"') && !csv.includes('"undefined"'));
  console.log(JSON.stringify({combinations, sources:run('Object.keys(sources).length'),
    records:run('rows.length'), eventHandlers:'pass', exportGeneration:'pass',
    visualInspection:'not tested by this script'}));
})();
