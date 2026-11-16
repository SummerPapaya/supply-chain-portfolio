// 证据指纹与数据契约 · 构建产物专项验证（纯 Node）
// 用法：node scripts/verify_evidence.js
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(ROOT, p));
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

let checks = 0;
function assert(cond, msg) { checks++; if (!cond) throw new Error('[FAIL] ' + msg); }
function canonical(o) {
  if (o === null || o === undefined) return 'null';
  if (typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

const data = JSON.parse(rd('assets/dataset.json'));
const ev = data.meta.evidence;
assert(!!ev, 'dataset.meta.evidence 缺失');

/* 1. 字段齐备与格式 */
['source_file', 'source_sha256', 'dataset_sha256', 'dataset_bytes', 'rule_file', 'rule_sha256',
  'rule_version', 'hash_algorithm', 'hash_scope', 'recompute_hint'].forEach(k =>
  assert(typeof ev[k] === 'string' || typeof ev[k] === 'number', `evidence.${k} 缺失`));
[ev.source_sha256, ev.dataset_sha256, ev.rule_sha256].forEach(h =>
  assert(/^[0-9a-f]{64}$/.test(h), `指纹应为 64 位小写 hex：${h}`));
assert(ev.hash_algorithm === 'SHA-256', '哈希算法声明应为 SHA-256');
assert(/^ICW-ENGINE-/.test(ev.rule_version), '规则版本应有语义前缀');
assert(ev.source_file.endsWith('.xlsx'), '源文件应为 UCI 原始 xlsx');

/* 2. 源文件指纹与实际文件一致 */
const srcPath = path.join(ROOT, ev.source_file);
assert(fs.existsSync(srcPath), `源文件不存在：${ev.source_file}`);
assert(sha(rd(ev.source_file)) === ev.source_sha256, '源文件 SHA-256 与实际不符（换了数据没重跑构建？）');

/* 3. 引擎规则指纹与实际文件一致 —— 改了 engine.js 必须重跑 build_data.py */
assert(sha(rd('assets/engine.js')) === ev.rule_sha256,
  'engine.js 已变更但 meta.evidence.rule_sha256 未更新；请重跑 python3 scripts/build_data.py');

/* 4. 数据集指纹可复算：排除 meta.evidence 后规范化 JSON */
const copy = JSON.parse(JSON.stringify(data));
delete copy.meta.evidence;
const buf = Buffer.from(canonical(copy), 'utf8');
assert(sha(buf) === ev.dataset_sha256, 'dataset_sha256 与规范化 JSON 复算不一致');
assert(buf.length === ev.dataset_bytes, `规范化字节数不符：${buf.length} vs ${ev.dataset_bytes}`);
assert(ev.dataset_bytes > 100000, '规范化数据集不应为空壳');

/* 5. dataset.js 与 dataset.json 严格等价（浏览器实际加载的是 .js） */
const sandbox = { window: {} };
vm.runInNewContext(rd('assets/dataset.js').toString('utf8'), sandbox);
assert(JSON.stringify(sandbox.window.INV_DATA) === JSON.stringify(data),
  'dataset.js 与 dataset.json 内容不一致');
const jsCopy = JSON.parse(JSON.stringify(sandbox.window.INV_DATA));
delete jsCopy.meta.evidence;
assert(sha(Buffer.from(canonical(jsCopy), 'utf8')) === ev.dataset_sha256,
  '浏览器加载的 dataset.js 复算指纹不一致');

/* 6. 业务数据仍与真实来源一致 */
assert(data.meta.raw_rows === 541909, '原始行数应为 UCI 官方 541,909');
assert(data.meta.clean_rows > 500000 && data.meta.clean_rows < data.meta.raw_rows, '清洗后行数异常');
assert(data.meta.currency === 'GBP', '演示数据币种声明应为 GBP');
assert(data.meta.doi === '10.24432/C5BW33', 'DOI 应为 UCI 352');
assert(data.meta.license === 'CC BY 4.0', '许可证应为 CC BY 4.0');
assert(Array.isArray(data.skus) && data.skus.length > 0, 'SKU 为空');
assert(Array.isArray(data.pos) && data.pos.length > 0, 'PO 台账为空');
assert(Array.isArray(data.deliveries) && data.deliveries.length > 0, '交付签收记录为空');
assert(data.meta.weeks.length === 52, '建模周期应为 52 周');
assert(data.params.currency === undefined, 'params 不应重复声明 currency（应唯一来自 meta）');

/* 7. 前端契约：证据视图、红线、验证清单都已接上 */
const app = rd('assets/app.js').toString('utf8');
const html = rd('index.html').toString('utf8');
const css = rd('assets/styles.css').toString('utf8');
assert(/evidence:\s*\{[^}]*fn:\s*renderEvidence/.test(app), 'VIEWS 未注册 evidence');
assert(html.includes('data-view="evidence"'), 'index.html 缺少 evidence 导航');
assert(html.includes('id="badgeEvidence"'), 'index.html 缺少 badgeEvidence');
assert(/function renderEvidence\(\)/.test(app), '缺少 renderEvidence');
assert(/function exportEvidence\(\)/.test(app), '缺少 exportEvidence');
assert(/function canonical\(o\)/.test(app) && /crypto\.subtle\.digest/.test(app), '缺少浏览器端指纹复算');
assert(/const RED_LINES = \[/.test(app), '缺少红线声明');
assert(/const VERIFY_SCRIPTS = \[/.test(app), '缺少复现脚本清单');
assert(/data-do="recheckEvidence"/.test(app) && /data-do="exportEvidence"/.test(app), '缺少复算/导出按钮');
assert(/\.ev-limit\s*\{/.test(css), '缺少局限清单样式');
assert(/默认展开|不提供收起/.test(app), '局限清单应明确声明默认展开且不可收起');

/* 8. 所有声明的验证脚本都存在 */
const scripts = [...app.matchAll(/\['(verify_[^']+\.(?:js|mjs))'/g)].map(m => m[1]);
assert(scripts.length >= 10, `验证脚本清单过少：${scripts.length}`);
scripts.forEach(s => assert(fs.existsSync(path.join(ROOT, 'scripts', s)), `清单里的脚本不存在：${s}`));

console.log(`[EVIDENCE VERIFY] 全部通过（${checks} 项检查）`);
console.log(`  源文件 ${ev.source_file} · ${ev.source_sha256.slice(0, 12)}`);
console.log(`  数据集 ${ev.dataset_bytes} 字节 · ${ev.dataset_sha256.slice(0, 12)}（Node 复算一致）`);
console.log(`  规则   ${ev.rule_version} · engine.js ${ev.rule_sha256.slice(0, 12)}`);
console.log(`  清单   ${scripts.length} 套验证脚本均存在`);
