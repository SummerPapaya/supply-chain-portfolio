// 品牌资产栅格化 · 走 CDP
//
// 为什么不用 `chrome --screenshot=...` 一次性模式：本机 macOS 13 上该模式会
// 卡死（CVDisplayLink 报错并且永不落盘），只有常驻实例 + 调试协议这条路走得通。
//
// 前置：python3 scripts/build_brand_assets.py gen
//      python3 -m http.server 8770（工作目录 .workbuddy/tmp/brand）
//      Chrome --headless=new --no-sandbox --remote-debugging-port=9333
//
// 用法：node scripts/rasterize_brand.mjs

import { writeFileSync } from 'node:fs';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const BASE = process.env.BRAND_BASE || 'http://127.0.0.1:8770';
const OUT = process.env.BRAND_OUT || new URL('../.workbuddy/tmp/brand/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (async () => {
  // Chrome 常驻实例可能刚起也可能尚未就绪，轮询等一下就绪
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    try {
      const r = await fetch(`${CDP}/json/list`);
      if (r.ok) return await r.json();
    } catch { /* 端口还没起来，继续等 */ }
    await sleep(700);
  }
  throw new Error(`等待 CDP ${CDP} 超时`);
})();
const page = targets.find((t) => t.type === 'page');
if (!page) throw new Error('没有可用的 page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending.set(mid, { resolve: res });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

async function waitForSvg(timeoutMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evaluate(`!!document.querySelector('svg')`)) return true;
    await sleep(120);
  }
  throw new Error('等待 SVG 渲染超时');
}

async function shoot(url, sizes, { transparent = true, name = (n) => `icon-${n}` } = {}) {
  await send('Emulation.setDefaultBackgroundColorOverride', {
    color: transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 255, g: 255, b: 255, a: 1 },
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: sizes[0], height: sizes[0], deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(600);
  await waitForSvg();
  for (const n of sizes) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: n, height: n, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(220);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!r.result?.data) throw new Error(`截图失败 @${n}: ${JSON.stringify(r)}`);
    const file = `${OUT}${name(n)}.png`;
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log(`  ✓ ${name(n)}.png  ${n}×${n}`);
  }
}

console.log('普通图标（圆角纸片，透明外角）');
await shoot(`${BASE}/icon.html?src=favicon-source.svg`, [16, 32, 48]);

console.log('满幅图标（iOS / Android 遮罩安全）');
await shoot(`${BASE}/icon.html?src=icon-bleed-source.svg`, [180, 192, 512]);

console.log('链接预览卡');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 247, g: 246, b: 242, a: 1 } });
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/ogcard.html` });
await sleep(900);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(`${OUT}og-cover.png`, Buffer.from(shot.result.data, 'base64'));
console.log('  ✓ og-cover.png  1200×630');

ws.close();
process.exit(0);
