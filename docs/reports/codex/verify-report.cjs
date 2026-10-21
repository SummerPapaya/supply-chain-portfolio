// Offline regression checks. These do not replace visual browser inspection.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(`${__dirname}/index.html`, 'utf8');
assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?\s*>/);
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const q3Script = fs.readFileSync(`${__dirname}/q3-report.js`, 'utf8');
const editorialScript = fs.readFileSync(`${__dirname}/editorial.js`, 'utf8');
const functionNames = [...[script, q3Script, editorialScript].join('\n').matchAll(/^function ([\w$]+)\(/gm)].map(match => match[1]);
assert.equal(new Set(functionNames).size, functionNames.length, 'Report functions must have one implementation');
const elements = new Map();
let reportWrites = 0;
const element = id => {
  if (!elements.has(id)) {
    let content = '';
    elements.set(id, {value: '', listeners: {},
      get innerHTML() { return content; },
      set innerHTML(value) { content = value; if (id === 'report') reportWrites++; },
      addEventListener(type, fn) { this.listeners[type] = fn; }, scrollIntoView() {}, focus() {}});
  }
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
run(q3Script);
run(editorialScript);
assert.equal(reportWrites, 1, 'Initial report should be rendered only once');
assert.equal(run('period'),'H1');
assert.equal(element('period').value,'H1');
assert(element('report').innerHTML.includes('data-window="H1"'));
assert(element('report').innerHTML.includes('data-open-q3'));
element('report').listeners.click({target:{closest:()=>({})}});
assert.equal(run('period'),'Q3');
assert.equal(element('period').value,'Q3');
element('period').listeners.change({target:{value:'H1'}});
assert.equal(run('period'),'H1');
let combinations = 0;
for (const market of ['cn', 'world']) for (const period of ['Q1', 'Q2', 'H1', 'Q3'])
for (const lang of ['zh', 'en', 'bi']) for (const sector of ['chips','ev','commerce','cold','ai','grid','storage','robot']) {
  const writesBeforeRender = reportWrites;
  run(`market='${market}';period='${period}';lang='${lang}';diagnosticSector='${sector}';render();`);
  assert.equal(reportWrites, writesBeforeRender + 1, 'Each view should use one report DOM write');
  const output = element('report').innerHTML;
  for (const anchor of output.matchAll(/<a\b[^>]*href="https?:[^>]*>/g)) {
    assert.match(anchor[0], /rel="(?=[^"]*\bnoopener\b)(?=[^"]*\bnoreferrer\b)[^"]*"/);
  }
  if(period==='Q3'){
    assert.equal((output.match(/data-sector="/g)||[]).length,8);
    assert.equal((output.match(/data-comparison="Q2-Q3"/g)||[]).length,1);
    assert(!output.includes('quarter-row empty'));
  }else assert.equal((output.match(/<article class="sector-panel/g) || []).length, 8);
  assert.equal((output.match(/id="diagnostic-sector"/g) || []).length, 1);
  assert(!output.includes('NaN') && !output.includes('undefined'));
  assert(output.includes('class="unavailable"'));
  assert(output.includes(`data-window="${period}"`));
  assert.equal((output.match(/class="brief-item"/g)||[]).length,3);
  assert.equal((output.match(/class="source-catalogue"/g)||[]).length,1);
  assert.equal((output.match(/<section class="section"/g)||[]).length,7);
  assert.equal((output.match(/<nav /g)||[]).length,1);
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
  assert.equal(q3Nev.value,165.1);
  assert.equal(q3Tesla.value,13.7);
  market='cn';
  assert.equal(q3Primary('storage').values.Q3,null);
  assert.equal(q3Context.end,'2026-08-31');
  assert(Object.values(q3Sources).every(s=>s.verified==='2026-10-18'));
  assert.deepEqual(Array.from(periodBounds({period:'H1'})),['2026-01-01','2026-06-30']);
  assert.deepEqual(Array.from(periodBounds({period:'2026-08'})),['2026-08-01','2026-08-31']);
  assert.deepEqual(Array.from(periodBounds({period:'2026-06-05'})),['2026-06-05','2026-06-05']);
  assert(barChart(pair('zero test','zero test'),[[pair('zero','zero'),0]],'').includes('width:0%'));
  assert.equal(recordScope({source:'GE1'}),'company-or-segment-case');
  assert.equal(recordScope({source:'C1'}),'industry-or-regional-statistic');
  market='cn';period='Q3';lang='en';render();
  assert(rows.filter(inWindow).every(r=>r.period==='Q3'||/^2026-0[7-9]$/.test(r.period)||r.contextFor==='Q3'));
  assert(!inWindow({market:'cn',period:'H1'}));
  assert(!inWindow({market:'cn',period:'2026-06-30'}));
  assert(!inWindow({market:'cn',period:'2026-01/08'}));
  assert(inWindow(rows.find(r=>r.contextFor==='Q3')));
  assert(q3QuarterReading('ev').includes('165.1'));
  assert(q3QuarterReading('chips').includes('Full-Q3 primary metric'));
  assert(!q3QuarterReading('chips').includes('quarter-comparison'));
  assert(q3CanCompare(q3Primary('ev')));
  const incomplete=q3Primary('ev');
  incomplete.values.Q2=null;
  assert(!q3CanCompare(incomplete));
  const partial=q3Primary('ev');
  partial.row={...partial.row,end:'2026-08-31'};
  assert(!q3CanCompare(partial));
  const contextOnly=q3Primary('ev');
  contextOnly.row={...contextOnly.row,contextFor:'Q3'};
  assert(!q3CanCompare(contextOnly));
  market='world';period='Q3';render();
  assert.equal(q3Primary('storage').values.Q3,13.7);
  assert(q3QuarterReading('storage').includes('>+0.2</strong>'));
  assert(!q3QuarterReading('ai').includes('class="period-change"'));
  assert(!q3QuarterReading('ai').includes('quarter-comparison'));
  assert(q3QuarterReading('storage').includes('data-quarter="Q2"'));
  assert(!q3QuarterReading('storage').includes('data-quarter="Q1"'));
  assert(document.getElementById('report').innerHTML.includes('September gap'));
  assert(!rows.some(r=>r.period==='Q3'&&r.name[1]==='Global air cargo demand CTK'));
  market='world';period='H1';
  assert(!inWindow(rows.find(r=>r.period==='2026-08'&&r.market==='world')));
  assert(!inWindow(rows.find(r=>r.contextFor==='Q3'&&r.market==='world')));
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
  assert(csv.includes('observation_scope')&&csv.includes('company-or-segment-case'));
  assert(csv.includes('"2026-01-01","2026-03-31"'));
  assert(!csv.includes('"null"') && !csv.includes('"undefined"'));
  run(`market='cn';period='Q3';`);
  element('csv').onclick();
  const q3csv=await exportedBlob.text();
  assert(q3csv.includes('"Q3","中国新能源汽车出口量"'));
  assert(q3csv.includes('"165.1"')&&q3csv.includes('"2026-10-18"'));
  assert(q3csv.includes('"cross-period-context","2026-01-01","2026-08-31"'));
  assert(q3csv.includes('"selected-window","2026-07-01","2026-09-30"'));
  console.log(JSON.stringify({combinations, sources:run('Object.keys(sources).length'),
    records:run('rows.length'), eventHandlers:'pass', exportGeneration:'pass', singleWriteRendering:'pass',
    visualInspection:'not tested by this script'}));
})();
