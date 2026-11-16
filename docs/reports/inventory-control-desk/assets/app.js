/* =============================================================================
 * 库存控制工作台 · 应用层
 * 依赖：engine.js（唯一计算源）、dataset.js（数据快照）
 * 约定：UI 不自行计算业务指标；所有 KPI / 表格数值取自 Engine.
 * ========================================================================== */
(function () {
  'use strict';
  const E = window.Engine;
  let DATA = window.INV_DATA;
  const M = E.money, P = E.pct, Q = E.qty, D = E.dec;
  // 金额符号一律取自引擎的当前生效币种（由 dataset.meta.currency / params.currency 决定），UI 不写死
  const CS = () => E.currencySymbol();
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortNum = v => v === null || v === undefined || !isFinite(v) ? '—' :
    Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' :
    Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : (Math.round(v * 10) / 10).toLocaleString('en-US');
  const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tsLocal = (withSec) => { // 审计留痕 / 导出元数据必须用本地时间，不能截 UTC 的 toISOString()
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return isoLocal(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + (withSec ? ':' + p(d.getSeconds()) : '');
  };
  const dateAdd = (iso, days) => isoLocal(new Date(new Date(iso + 'T00:00:00').getTime() + days * 86400000));

  const SEV = { critical: '严重', high: '高', medium: '中', low: '低' };
  const SEV_COLOR = { critical: '#b42318', high: '#a76100', medium: '#2c6ecb', low: '#8a929c' };
  const PO_STATUS = {
    CLOSED: ['已结案', 'low'], IN_TRANSIT: ['在途', 'medium'],
    OVERDUE: ['逾期', 'critical'], NOT_SHIPPED: ['未发运', 'low'], OPEN: ['开立', 'low'],
  };
  const REASON_CODES = ['需求波动', '供应商交期延迟', '计划/促销调整', '数据异常待核', '已知风险并接受', '替代料切换'];
  const C = { ink: '#1d4e79', blue: '#2c6ecb', red: '#b42318', amber: '#a76100', green: '#15734b', grey: '#9aa3ad', violet: '#5c4b8a' };

  const State = {
    view: 'overview', cfg: {}, cfgDefault: {}, result: null,
    filters: { q: '', category: '', warehouse: '', supplier: '', abc: '', status: '', severity: '' },
    sort: {}, page: {}, pageSize: 25, exports: {},
    actions: loadActions(), expandAlert: null, drawerSku: null, chartMode: 'value',
    segmentFilter: '', supplierFocus: '',
    evidence: null, evidenceKey: '', dataToken: 0, evidenceCheckedAt: '',
  };

  function loadActions() {
    try { return JSON.parse(localStorage.getItem('icw_alert_actions') || '{}'); } catch (e) { return {}; }
  }
  function saveActions() {
    try { localStorage.setItem('icw_alert_actions', JSON.stringify(State.actions)); } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------------ 数据准备 */
  // 币种是数据事实：数据集 params 显式声明 > meta 声明 > GBP 兜底。
  // 导入 / 恢复时必须重新解析，否则上一次会话的参数会盖住新数据自己的币种。
  function declaredCurrency(d) {
    return E.normalizeCurrency((d && d.params && d.params.currency) ||
      (d && d.meta && d.meta.currency) || 'GBP');
  }
  function recompute() {
    State.result = E.compute(DATA, State.cfg);
    E.setCurrency(State.result.params.currency); // 渲染期间金额符号与当前结果严格一致
    // 指纹只在「数据集换了」或「生效参数变了」时重算，避免每次 render 都哈希 250 KB
    const key = State.dataToken + '|' + canonical(State.result.params);
    if (key !== State.evidenceKey) { State.evidenceKey = key; refreshEvidenceHashes(); }
  }

  /* ------------------------------------------------------------------ 证据指纹
   * 与 scripts/build_data.py 的 canonical_bytes() 严格对齐：key 排序、无空白、
   * 非 ASCII 不转义、整数值浮点按 JS 原生整数输出。浏览器可当场复算并比对。
   */
  function canonical(o) {
    if (o === null || o === undefined) return 'null';
    if (typeof o !== 'object') return JSON.stringify(o);
    if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']';
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  async function sha256Hex(text) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) return null;
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const shortHash = h => h ? h.slice(0, 12) : '—';
  async function refreshEvidenceHashes(force) {
    const R = State.result, meta = (R && R.meta) || {}, ev = meta.evidence || {};
    const payload = JSON.parse(JSON.stringify(DATA));
    if (payload.meta) delete payload.meta.evidence;   // 构建期算 hash 时该字段尚不存在
    const canon = canonical(payload);
    let ds = null, sc = null, err = '';
    try { ds = await sha256Hex(canon); sc = await sha256Hex(canonical(R.params)); }
    catch (e) { err = String(e && e.message || e); }
    State.evidence = {
      dataset: ds, declared: ev.dataset_sha256 || null,
      bytes: new TextEncoder().encode(canon).length,
      declaredBytes: ev.dataset_bytes === undefined ? null : ev.dataset_bytes,
      scenario: sc, rule: ev.rule_sha256 || null,
      match: ds && ev.dataset_sha256 ? ds === ev.dataset_sha256 : null,
      unsupported: ds === null, err,
    };
    if (force) State.evidenceCheckedAt = tsLocal(true);
    if (State.view === 'evidence') paintEvidenceHashes();
    return State.evidence;
  }
  function paintEvidenceHashes() {
    const S = State.evidence; if (!S) return;
    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    set('#evDatasetKpi', shortHash(S.declared));
    set('#evScenarioKpi', shortHash(S.scenario));
    set('#evDatasetFull', S.dataset || S.declared || '—');
    set('#evDatasetDeclared', S.declared || '—');
    set('#evDatasetBytes', S.bytes === undefined ? '—' : Q(S.bytes) + ' 字节');
    set('#evScenarioFull', S.scenario || '—');
    const box = $('#evCheckState');
    if (box) {
      let cls = 'ev-check', txt;
      if (S.unsupported) { cls += ' warn'; txt = '当前环境不提供 Web Crypto（常见于非安全上下文）；改用 HTTP 打开即可复算，声明值仍可核对。'; }
      else if (S.match === null) { cls += ' warn'; txt = '数据集未声明指纹，无法比对（可能是旧版导入数据）。'; }
      else if (S.match) { cls += ' ok'; txt = `✓ 一致 · 浏览器复算 ${Q(S.bytes)} 字节的规范化 JSON，SHA-256 与构建期声明逐位相同${State.evidenceCheckedAt ? ' · 复算于 ' + State.evidenceCheckedAt : ''}`; }
      else { cls += ' bad'; txt = `✗ 不一致 · 复算 ${Q(S.bytes)} 字节得到 ${shortHash(S.dataset)}，声明为 ${shortHash(S.declared)}；数据或构建产物已被改动，请重跑 build_data.py。`; }
      box.className = cls; box.textContent = txt;
    }
  }

  function basicSku(s) {
    const f = State.filters;
    if (f.category && s.category !== f.category) return false;
    if (f.warehouse && s.warehouse !== f.warehouse) return false;
    if (f.supplier && s.supplier !== f.supplier) return false;
    // 分级下拉同时承载 ABC（金额贡献）与 XYZ（需求波动），前缀 xyz: 区分
    if (f.abc) {
      if (String(f.abc).startsWith('xyz:')) { if (s.m.xyz !== f.abc.slice(4)) return false; }
      else if (s.m.abc !== f.abc) return false;
    }
    return true;
  }
  const q = () => State.filters.q.trim().toLowerCase();
  function data() {
    const R = State.result;
    const k = q();
    const skuById = {}; R.skus.forEach(s => skuById[s.id] = s);
    // 检索同时支持 SKU 编码 / 品名 / PO 号：命中 PO 的 SKU 需一并纳入，
    // 否则 PO 行会因 ids 集合为空而被全部过滤，出现「搜 PO 号结果为空」。
    const poHitSku = new Set(), poHitId = new Set();
    if (k) R.pos.forEach(p => {
      if ((p.id + ' ' + p.sku).toLowerCase().includes(k)) { poHitSku.add(p.sku); poHitId.add(p.id); }
    });
    const skus = R.skus.filter(s => {
      if (!basicSku(s)) return false;
      if (!k) return true;
      return (s.id + ' ' + s.desc).toLowerCase().includes(k) || poHitSku.has(s.id);
    });
    const ids = new Set(skus.map(s => s.id));
    const pos = R.pos.filter(p => {
      const s = skuById[p.sku]; if (!s || !ids.has(p.sku) || !basicSku(s)) return false;
      if (k && !poHitId.has(p.id) && !(p.sku + ' ' + s.desc).toLowerCase().includes(k)) return false;
      if (State.filters.status && p.status !== State.filters.status) return false;
      return true;
    });
    const alerts = R.alerts.filter(a => {
      const s = skuById[a.sku]; if (!s || !ids.has(a.sku) || !basicSku(s)) return false;
      if (k && !(a.sku + ' ' + a.desc2 + ' ' + a.rule).toLowerCase().includes(k)) return false;
      if (State.filters.severity && a.severity !== State.filters.severity) return false;
      return true;
    });
    return { R, skus, pos, alerts, skuById };
  }
  function K(skus, pos) {
    const R = State.result;
    return E.aggregate(skus, pos, R.params, R.weeks.length, R.meta);
  }

  /* ------------------------------------------------------------------ 通用控件 */
  function setCount(t) { $('#resultCount').textContent = t; }
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2300);
  }
  function kpi(o) {
    return `<div class="card kpi ${o.flag ? 'flag-' + o.flag : ''}">
      <div class="k-label">${esc(o.label)}${o.hint ? ` <span class="hint" title="${esc(o.hint)}">(?)</span>` : ''}</div>
      <div class="k-value">${o.value}${o.unit ? `<span class="unit">${esc(o.unit)}</span>` : ''}</div>
      <div class="k-foot">${o.foot || ''}</div>
      ${o.bar === undefined ? '' : `<div class="bar"><i class="${o.barCls || ''}" style="width:${clamp(o.bar * 100, 0, 100)}%"></i></div>`}
    </div>`;
  }
  const kpiRow = arr => `<div class="kpi-grid">${arr.map(kpi).join('')}</div>`;
  function card(title, body, sub, actions, tight) {
    return `<div class="card"><div class="card-head"><h3>${esc(title)}</h3>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
      ${actions ? `<div class="right-actions">${actions}</div>` : ''}</div>
      <div class="card-body ${tight ? 'tight' : ''}">${body}</div></div>`;
  }
  function tag(text, cls) { return `<span class="tag ${cls || ''}">${esc(text)}</span>`; }
  function sevTag(s) { return tag(SEV[s] || s, s); }
  function statusTag(st) { const x = PO_STATUS[st] || [st, 'low']; return tag(x[0], x[1]); }
  function tagsFor(m) {
    const map = {
      STOCKOUT: ['缺货风险', 'critical'], REPLENISH: ['待补货', 'high'], BUFFER: ['缓冲击穿', 'high'],
      OVERSTOCK: ['超储', 'medium'], OBSOLETE: ['呆滞', 'high'], NO_DEMAND: ['无需求', 'low'], SLOW: ['慢动销', 'low'],
    };
    const t = (m.tags || []).slice(0, 2).map(x => tag(map[x][0], map[x][1])).join('');
    return t || tag('正常', 'good');
  }

  /* ------------------------------------------------------------------ 图表 */
  function spark(vals, w, h, color) {
    w = w || 110; h = h || 26; color = color || C.blue;
    if (!vals || !vals.length) return '';
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
    const d = vals.map((v, i) => (i ? 'L' : 'M') + (i / Math.max(1, vals.length - 1) * w).toFixed(1) + ' ' + (h - 2 - (v - mn) / rg * (h - 4)).toFixed(1)).join(' ');
    return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px"><path d="${d}" class="line" stroke="${color}"/></svg>`;
  }
  function comboChart(o) {
    const series = o.series || [], bars = o.bars || [];
    const hasRight = series.some(se => se.right);
    const W = o.width || 700, H = o.height || 200, ml = o.ml || 50, mr = o.mr || (hasRight ? 54 : 12), mt = 12, mb = 26;
    const iw = W - ml - mr, ih = H - mt - mb, n = o.labels.length, step = iw / Math.max(1, n);
    const clean = a => a.filter(v => v !== null && isFinite(v));
    // 左轴：柱 + 普通折线；右轴：标记 right 的折线。两轴独立量程，禁止把金额缩放成件数当量。
    const leftVals = bars.concat(series.filter(se => !se.right)).reduce((a, s) => a.concat(clean(s.values)), []);
    const rightVals = series.filter(se => se.right).reduce((a, s) => a.concat(clean(s.values)), []);
    const range = arr => {
      let lo = o.min !== undefined ? o.min : Math.min.apply(null, [0].concat(arr));
      let hi = o.max !== undefined ? o.max : Math.max.apply(null, [1].concat(arr));
      if (!isFinite(lo) || !isFinite(hi) || hi <= lo) { lo = 0; hi = 1; }
      return { lo, hi: hi + (hi - lo) * .06 };
    };
    const L = range(leftVals), R = range(rightVals.length ? rightVals : [0, 1]);
    const yL = v => mt + ih - (v - L.lo) / (L.hi - L.lo) * ih;
    const yR = v => mt + ih - (v - R.lo) / (R.hi - R.lo) * ih;
    const y = yL;
    const f = o.yFmt || shortNum, fr = o.rightFmt || f;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">`;
    for (let i = 0; i <= 4; i++) {
      const v = L.lo + (L.hi - L.lo) * i / 4, yy = yL(v);
      s += `<line class="grid-line" x1="${ml}" x2="${W - mr}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
      s += `<text x="${ml - 6}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${esc(f(v))}</text>`;
    }
    if (hasRight) for (let i = 0; i <= 4; i++) {
      const v = R.lo + (R.hi - R.lo) * i / 4, yy = yR(v);
      s += `<text class="ax-r" x="${W - mr + 6}" y="${(yy + 3).toFixed(1)}" text-anchor="start">${esc(fr(v))}</text>`;
    }
    bars.forEach((b, bi) => {
      const bw = Math.max(1, step * .58 / (bars.length));
      b.values.forEach((v, i) => {
        if (v === null || !isFinite(v)) return;
        const x = ml + i * step + step * .21 + bi * bw, yv = y(Math.max(0, v));
        s += `<rect class="bar-rect" x="${x.toFixed(1)}" y="${yv.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, y(0) - yv).toFixed(1)}" fill="${b.color}" opacity="${b.opacity || .8}"/>`;
      });
    });
    (o.refs || []).forEach(r => {
      const yy = y(r.value); if (yy < mt || yy > mt + ih) return;
      s += `<line class="ref" x1="${ml}" x2="${W - mr}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${r.color}"/>`;
      if (r.label) s += `<text x="${W - mr - 2}" y="${(yy - 3).toFixed(1)}" text-anchor="end" fill="${r.color}">${esc(r.label)}</text>`;
    });
    series.forEach(se => {
      const yy = se.right ? yR : yL;
      let d = '', started = false;
      se.values.forEach((v, i) => {
        if (v === null || !isFinite(v)) { started = false; return; }
        d += (started ? 'L' : 'M') + (ml + i * step + step / 2).toFixed(1) + ' ' + yy(v).toFixed(1) + ' ';
        started = true;
      });
      s += `<path d="${d}" class="line" stroke="${se.color}" ${se.dash ? 'stroke-dasharray="4 3"' : ''} ${se.width ? 'stroke-width="' + se.width + '"' : ''}/>`;
      if (se.dots) se.values.forEach((v, i) => {
        if (v === null || !isFinite(v)) return;
        s += `<circle cx="${(ml + i * step + step / 2).toFixed(1)}" cy="${yy(v).toFixed(1)}" r="2.2" fill="${se.color}"/>`;
      });
    });
    const every = Math.max(1, Math.ceil(n / (o.xTicks || 7)));
    o.labels.forEach((l, i) => {
      if (i % every && i !== n - 1) return;
      s += `<text x="${(ml + i * step + step / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle">${esc(l)}</text>`;
    });
    for (let i = 0; i < n; i++) {
      const parts = [o.labels[i]];
      bars.forEach(b => parts.push(`${b.name}: ${b.tipFmt ? b.tipFmt(b.values[i]) : o.tipFmt ? o.tipFmt(b.values[i]) : shortNum(b.values[i])}`));
      series.forEach(se => parts.push(`${se.name}: ${se.tipFmt ? se.tipFmt(se.values[i]) : o.tipFmt ? o.tipFmt(se.values[i]) : shortNum(se.values[i])}`));
      s += `<rect x="${(ml + i * step).toFixed(1)}" y="${mt}" width="${step.toFixed(1)}" height="${ih}" fill="transparent" data-tip="${esc(parts.join('\n'))}"/>`;
    }
    return s + '</svg>';
  }
  function legend(items) {
    return `<div class="chart-legend">${items.map(i => `<span><i class="${i.line ? '' : 'swatch'}" style="background:${i.color};${i.line ? 'height:2px;width:14px' : ''}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  }
  function hbars(items, o) {
    o = o || {};
    const mx = Math.max.apply(null, [1].concat(items.map(i => Math.abs(i.value || 0))));
    return `<div class="stat-list">${items.map(i => `<div class="stat-row" style="grid-template-columns:${o.labelW || '1fr'} auto 84px">
      <div class="lbl" title="${esc(i.label)}">${esc(i.label)}</div>
      <div class="val">${i.text !== undefined ? i.text : shortNum(i.value)}</div>
      <div class="track"><i style="width:${(Math.abs(i.value || 0) / mx * 100).toFixed(1)}%;background:${i.color || C.ink}"></i></div>
    </div>`).join('')}</div>`;
  }
  function stackBar(parts, total) {
    return `<div style="display:flex;height:16px;border:1px solid var(--line);border-radius:2px;overflow:hidden;background:var(--panel-3)">` +
      parts.map(p => `<div title="${esc(p.label)} · ${esc(p.text)}" style="width:${total > 0 ? (p.value / total * 100).toFixed(2) : 0}%;background:${p.color}"></div>`).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ 表格组件 */
  function table(key, cols, rows, opts) {
    opts = opts || {};
    const st = State.sort[key] || {};
    let rr = rows.slice();
    if (st.col) {
      const c = cols.find(x => x.k === st.col);
      if (c && c.value) rr.sort((a, b) => {
        const x = c.value(a), y = c.value(b);
        if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1;
        const d = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'zh');
        return d * (st.dir === 'desc' ? -1 : 1);
      });
    }
    const ps = opts.pageSize || State.pageSize, pages = Math.max(1, Math.ceil(rr.length / ps));
    let pg = State.page[key] || 0; pg = clamp(pg, 0, pages - 1); State.page[key] = pg;
    const slice = opts.noPage ? rr : rr.slice(pg * ps, (pg + 1) * ps);
    let h = `<div class="card" data-tablekey="${esc(key)}">`;
    if (opts.title) h += `<div class="card-head"><h3>${esc(opts.title)}</h3>${opts.sub ? `<span class="sub">${esc(opts.sub)}</span>` : ''}</div>`;
    h += '<div class="table-wrap"><table class="tbl"><thead><tr>';
    cols.forEach(c => {
      h += `<th class="${c.align === 'r' ? 'r ' : ''}${c.value ? 'sortable' : ''}" ${c.value ? 'data-sort="' + esc(c.k) + '"' : ''} ${c.w ? 'style="min-width:' + c.w + 'px"' : ''}>${esc(c.label)}${st.col === c.k ? `<span class="arrow">${st.dir === 'desc' ? '▼' : '▲'}</span>` : ''}</th>`;
    });
    h += '</tr></thead><tbody>';
    if (!slice.length) h += `<tr><td colspan="${cols.length}"><div class="empty">当前筛选条件下无记录</div></td></tr>`;
    slice.forEach(r => {
      h += `<tr class="${opts.clickable ? 'clickable' : ''}" data-sku="${esc(opts.rowSku ? opts.rowSku(r) : '')}">`;
      cols.forEach(c => {
        const content = c.render ? c.render(r) : esc(r[c.k] === null || r[c.k] === undefined ? '—' : r[c.k]);
        h += `<td class="${c.align === 'r' ? 'r num' : ''} ${c.cls || ''}">${content}</td>`;
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if (!opts.noPage) {
      const win = [], s0 = Math.max(0, Math.min(pg - 2, pages - 5)), s1 = Math.min(pages, s0 + 5);
      for (let i = s0; i < s1; i++) win.push(`<button data-page="${i}" class="${i === pg ? 'cur' : ''}">${i + 1}</button>`);
      h += `<div class="tbl-foot"><span>共 <b class="num">${rr.length}</b> 条 · 第 ${pg + 1}/${pages} 页</span>
        <span class="muted">${opts.footHint || '点击列头排序 · 点击行查看 SKU 明细'}</span>
        <div class="pager"><button data-page="prev" ${pg === 0 ? 'disabled' : ''}>‹</button>${win.join('')}<button data-page="next" ${pg >= pages - 1 ? 'disabled' : ''}>›</button></div></div>`;
    }
    h += '</div>';
    State.exports[key] = { cols, rows: rr, name: opts.exportName || key };
    return h;
  }

  /* ------------------------------------------------------------------ 视图：总览 */
  function renderOverview() {
    const d = data(), R = d.R, skus = d.skus, pos = d.pos, k = K(skus, pos);
    setCount(`${skus.length} SKU · ${pos.length} PO`);
    const p = R.params;
    let h = kpiRow([
      { label: '库存总额', value: M(k.inventoryValue), hint: 'Σ 现货量 × 当前单位成本；成本率可调', foot: `可用 ${M(k.availableValue)} <span class="k-sub">· 可用率 ${P(k.availableRate)}</span>`, bar: k.availableRate, barCls: k.availableRate < .9 ? 'warn' : '' },
      { label: '在途库存金额', value: M(k.inTransitValue), hint: '已发运未收货的未清 PO 金额', foot: `<b>${Q(k.inTransit)}</b> 件 · 未清 PO <b>${k.openPoCount}</b> 张`, bar: k.inventoryValue ? k.inTransitValue / k.inventoryValue : 0 },
      { label: '采购逾期', value: Q(k.overduePoCount), unit: '张', flag: k.overduePoCount ? 'critical' : '', hint: '承诺交期已过且未清量 > 0', foot: `未结金额 <b>${M(k.openPoValue)}</b> · 共 ${k.poCount} 张`, bar: k.openPoCount ? k.overduePoCount / k.openPoCount : 0, barCls: 'bad' },
      { label: '缺货风险 SKU', value: Q(k.stockoutSku), unit: '个', flag: 'critical', hint: '提前期窗口内预计可用量 PA(t) < 0', foot: `补货触发 <b>${k.replenishSku}</b> · 超储 <b>${k.overstockSku}</b>`, bar: skus.length ? k.stockoutSku / skus.length : 0, barCls: 'bad' },
      { label: '加权 Weeks of Supply', value: D(k.wosWeighted), unit: '周', hint: 'Σ 可用量 / Σ 周均需求；比单 SKU 简单平均更稳健', foot: `参考区间 <b>${p.wos_min}–${p.wos_max}</b> 周`, bar: k.wosWeighted / p.wos_max },
      { label: '库存周转率（年化）', value: D(k.turnoverAnnual), unit: '次', hint: '期间 COGS / 期间日均库存金额 × 52/期间周数', foot: `DIO <b>${D(k.dio, 0)}</b> 天 · 期间周转 ${D(k.turnoverPeriod, 2)} 次`, bar: k.turnoverAnnual / 12 },
      { label: '动销率', value: P(k.activeRate), hint: `近 ${p.active_window_weeks} 周有出库记录的 SKU / 在册 SKU`, foot: `<b>${k.activeSkus}</b> / ${skus.length} SKU · 零需求样本 ${k.zeroDemandSku}`, bar: k.activeRate, barCls: k.activeRate < .8 ? 'warn' : '' },
      { label: '冗余与呆滞 E&O', value: M(k.eoValue), flag: k.eoRatio > p.eo_ratio_max ? 'high' : '', hint: '计提后净敞口 = 毛敞口 − 呆滞减值；Obsolete 与 Excess 数量互斥。金额为估算成本额，非财务入账口径', foot: `毛敞口 <b>${M(k.grossEoValue)}</b> · 计提 ${M(k.provisionValue)} · 净占比 ${P(k.eoRatio)}`, bar: k.eoRatio / (p.eo_ratio_max * 2), barCls: k.eoRatio > p.eo_ratio_max ? 'warn' : '' },
    ]);

    // 趋势（指数化，首周=100）
    const labels = R.weeks.map(w => w.slice(5));
    const demand = new Array(R.weeks.length).fill(0), inv = new Array(R.weeks.length).fill(0);
    skus.forEach(s => {
      s.weekly.forEach((v, i) => demand[i] += v);
      (s.weekly_oh || []).forEach((v, i) => inv[i] += v * s.m.unitCost);
    });
    const idx = a => a.map(v => a[0] > 0 ? v / a[0] * 100 : 100);
    const demandI = idx(demand), invI = idx(inv);
    const trend = comboChart({
      labels, height: 205,
      series: [
        { name: '库存金额指数', values: invI, color: C.ink, width: 1.8 },
        { name: '周需求指数', values: demandI, color: C.blue, width: 1.3 },
      ],
      yFmt: v => Math.round(v), tipFmt: v => v === null ? '—' : Math.round(v),
      xTicks: 8,
    });
    const trendCard = card('需求与库存金额趋势', trend + legend([
      { label: '库存金额指数', color: C.ink, line: 1 }, { label: '周需求指数', color: C.blue, line: 1 },
    ]) + `<div class="chart-note">指数化：首周 = 100，用于比较两条不同量纲序列的相对变化。期间真实出库 ${Q(sum(demand))} 件，期末库存金额 ${M(k.inventoryValue)}。</div>`,
      '52 周 · 真实交易需求');

    // 健康结构（互斥划分，按金额）
    const health = { obsolete: 0, risk: 0, over: 0, normal: 0 };
    const healthN = { obsolete: 0, risk: 0, over: 0, normal: 0 };
    skus.forEach(s => {
      const v = s.m.onHandValue, m = s.m; let bucket;
      if (m.obsolete > 0) bucket = 'obsolete';
      else if (m.minPaInLead < 0) bucket = 'risk';
      else if (m.onHand > m.maxTarget * 1.05) bucket = 'over';
      else bucket = 'normal';
      health[bucket] += v; healthN[bucket]++;
    });
    const parts = [
      { key: 'normal', label: '健康', color: C.green }, { key: 'over', label: '超储', color: C.amber },
      { key: 'risk', label: '缺货风险', color: C.red }, { key: 'obsolete', label: '呆滞 / 停售', color: C.violet },
    ];
    const totalV = sum(parts.map(x => health[x.key])) || 1;
    const healthCard = card('库存健康结构',
      stackBar(parts.map(x => ({ ...x, value: health[x.key], text: M(health[x.key]) })), totalV) +
      `<div style="margin-top:12px">${hbars(parts.map(x => ({ label: x.label, value: health[x.key], text: M(health[x.key]) + ' · ' + P(health[x.key] / totalV, 0) + ' · ' + healthN[x.key] + ' SKU', color: x.color })), {})}</div>
      <div class="chart-note">按 SKU 库存金额互斥归类，优先级：呆滞 → 缺货风险 → 超储 → 健康。同一 SKU 不重复计入。</div>`,
      '按库存金额');

    h += `<div class="row2">${trendCard}${healthCard}</div>`;

    // 预警分布 / 品类 / WOS
    const byRule = {};
    d.alerts.forEach(a => byRule[a.name] = (byRule[a.name] || 0) + 1);
    const ruleItems = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([n, v]) => ({ label: n, value: v, text: v + ' 条', color: Object.values(E.RULE_META).find(m => m.name === n)?.sev ? SEV_COLOR[Object.values(E.RULE_META).find(m => m.name === n).sev] : C.grey }));
    const catItems = k.byCategory.slice(0, 8).map(c => ({ label: c.category.split(' / ')[0], value: c.value, text: M(c.value), color: C.ink }));
    const wosBins = [0, 2, 4, 6, 8, 12, 16, 24, 1e9];
    const wosCounts = new Array(wosBins.length - 1).fill(0);
    skus.forEach(s => { if (s.m.wos === null) return; for (let i = 0; i < wosBins.length - 1; i++) if (s.m.wos >= wosBins[i] && s.m.wos < wosBins[i + 1]) { wosCounts[i]++; break; } });
    const wosLabels = ['0–2', '2–4', '4–6', '6–8', '8–12', '12–16', '16–24', '24+'];
    h += `<div class="row3">
      ${card('预警规则分布', hbars(ruleItems), null, null, true)}
      ${card('品类库存金额 Top 8', hbars(catItems), null, null, true)}
      ${card('WOS 分布', comboChart({ labels: wosLabels, bars: [{ name: 'SKU 数', values: wosCounts, color: C.blue, opacity: .85 }], height: 165, xTicks: 8, yFmt: v => Math.round(v), tipFmt: v => Math.round(v) + ' SKU' }) + `<div class="chart-note">目标区间 ${p.wos_min}–${p.wos_max} 周；零需求样本不计入。</div>`, 'SKU 数 / 周', null, true)}
    </div>`;

    // 优先处理
    const top = d.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 10);
    const cols = [
      { k: 'rule', label: '规则', render: a => `<span class="tag-mono">${esc(a.rule)}</span>`, csv: a => a.rule },
      { k: 'sku', label: 'SKU', render: a => `<span class="code">${esc(a.sku)}</span>`, csv: a => a.sku },
      { k: 'desc', label: '品名', w: 210, render: a => `<div class="desc-cell">${esc(a.desc2)}</div>`, csv: a => a.desc2 },
      { k: 'sev', label: '级别', value: a => ({ critical: 0, high: 1, medium: 2, low: 3 })[a.severity], render: a => sevTag(a.severity), csv: a => SEV[a.severity] },
      { k: 'note', label: '说明', render: a => esc(a.note), csv: a => a.note },
      { k: 'date', label: '关键日期', render: a => `<span class="num">${esc(a.date || '—')}</span>`, csv: a => a.date || '' },
    ];
    h += `<div class="section-title">优先处理 <span class="en">Top priority · 严重 + 高</span></div>` + table('ovAlert', cols, top, { clickable: true, rowSku: a => a.sku, pageSize: 10, exportName: '优先处理清单' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：预警中心 */
  function renderAlerts() {
    const d = data(), R = d.R, skus = d.skus;
    let list = d.alerts.slice();
    const k = K(skus, d.pos);
    setCount(`${list.length} 条预警`);
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    list.forEach(a => counts[a.severity]++);
    const handled = list.filter(a => State.actions[a.id] && State.actions[a.id].status !== 'OPEN').length;
    let h = kpiRow([
      { label: '严重 Critical', value: Q(counts.critical), unit: '条', flag: 'critical', foot: '需当日处理 · 缺货 / 采购逾期', bar: list.length ? counts.critical / list.length : 0, barCls: 'bad' },
      { label: '高 High', value: Q(counts.high), unit: '条', flag: 'high', foot: '补货触发 / 缓冲击穿 / 呆滞', bar: list.length ? counts.high / list.length : 0, barCls: 'warn' },
      { label: '中 / 低', value: Q(counts.medium + counts.low), unit: '条', foot: `中 ${counts.medium} · 低 ${counts.low}`, bar: list.length ? (counts.medium + counts.low) / list.length : 0 },
      { label: '已闭环', value: Q(handled), unit: '条', flag: 'good', foot: `闭环率 ${P(list.length ? handled / list.length : 0)} · 确认 + 忽略`, bar: list.length ? handled / list.length : 0 },
    ]);

    if (State.expandAlert) {
      const a = list.find(x => x.id === State.expandAlert);
      if (a) {
        h += `<div class="card" style="margin-bottom:12px;border-left:2px solid var(--accent)"><div class="card-head"><h3>处置预警 · ${esc(a.rule)} / ${esc(a.sku)}</h3>
          <span class="sub">${esc(a.desc2)}</span></div><div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr auto;gap:9px;align-items:end">
            <div><div class="mono-label" style="margin-bottom:4px">经办人</div><input type="text" id="ackOwner" class="w-full" style="width:100%" placeholder="姓名 / 工号" value="${esc(State.actions[a.id]?.owner || '')}"></div>
            <div><div class="mono-label" style="margin-bottom:4px">原因代码</div><select id="ackReason" style="width:100%">${REASON_CODES.map(r => `<option ${r === State.actions[a.id]?.reason ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
            <div><div class="mono-label" style="margin-bottom:4px">备注</div><input type="text" id="ackNote" style="width:100%" placeholder="选填" value="${esc(State.actions[a.id]?.note || '')}"></div>
            <div style="display:flex;gap:6px"><button class="btn btn-primary" data-ack="ACK" data-id="${esc(a.id)}">确认处理</button>
            <button class="btn" data-ack="IGNORED" data-id="${esc(a.id)}">忽略</button>
            <button class="btn btn-ghost" data-ack="CANCEL">取消</button></div>
          </div></div></div>`;
      }
    }

    const cols = [
      { k: 'rule', label: '规则', w: 118, value: a => a.rule, render: a => `<span class="tag-mono">${esc(a.rule)}</span> <span class="muted small">${esc(a.name)}</span>`, csv: a => a.rule + '/' + a.name },
      { k: 'sev', label: '级别', value: a => ({ critical: 0, high: 1, medium: 2, low: 3 })[a.severity], render: a => sevTag(a.severity), csv: a => SEV[a.severity] },
      { k: 'sku', label: 'SKU', value: a => a.sku, render: a => `<span class="code">${esc(a.sku)}</span>`, csv: a => a.sku },
      { k: 'desc', label: '品名', w: 200, value: a => a.desc2, render: a => `<div class="desc-cell">${esc(a.desc2)}</div>`, csv: a => a.desc2 },
      { k: 'cat', label: '品类', value: a => a.category, render: a => `<span class="small">${esc(a.category.split(' / ')[0])}</span>`, csv: a => a.category },
      { k: 'cur', label: '当前值', align: 'r', value: a => Number(a.current) || 0, render: a => `<span class="num">${esc(a.current)}</span>`, csv: a => a.current },
      { k: 'thr', label: '阈值', align: 'r', render: a => `<span class="num muted">${esc(a.threshold)}</span>`, csv: a => a.threshold },
      { k: 'note', label: '诊断', w: 190, value: a => a.note, render: a => esc(a.note), csv: a => a.note },
      { k: 'date', label: '关键日期', value: a => a.date || '', render: a => `<span class="num">${esc(a.date || '—')}</span>`, csv: a => a.date || '' },
      { k: 'status', label: '状态', value: a => State.actions[a.id]?.status || 'OPEN', render: a => {
        const st = State.actions[a.id]?.status || 'OPEN';
        return st === 'ACK' ? tag('已确认', 'good') : st === 'IGNORED' ? tag('已忽略', 'low') : tag('待处理', 'high');
      }, csv: a => State.actions[a.id]?.status || 'OPEN' },
      { k: 'act', label: '操作', render: a => `<button class="btn btn-xs" data-edit-alert="${esc(a.id)}">处置</button>`, csv: () => '' },
    ];
    h += table('alerts', cols, list, { clickable: true, rowSku: a => a.sku, exportName: '预警清单', footHint: '严重度与筛选条件全局联动 · 处置结果本地留存' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：库存台账 */
  function renderInventory() {
    const d = data(), skus = d.skus, k = K(skus, d.pos), p = d.R.params;
    setCount(`${skus.length} SKU`);
    let h = kpiRow([
      { label: '现货总量', value: Q(k.totalOH), unit: '件', foot: `库存金额 <b>${M(k.inventoryValue)}</b> · 可用率 ${P(k.availableRate)}`, bar: k.availableRate },
      { label: '在途 / 未清 PO', value: Q(k.inTransit), unit: '件', foot: `未发运 <b>${M(k.notShippedValue)}</b> · 逾期 ${k.overduePoCount} 张`, bar: k.totalOH ? k.inTransit / k.totalOH : 0 },
      { label: '低于补货点', value: Q(k.replenishSku), unit: 'SKU', flag: 'high', hint: '库存位置 IP ≤ ROP', foot: `缺货风险 <b>${k.stockoutSku}</b> · 超储 <b>${k.overstockSku}</b>`, bar: skus.length ? k.replenishSku / skus.length : 0, barCls: 'warn' },
      { label: '加权平均库龄', value: D(k.avgAge, 0), unit: '天', hint: '按批次数量加权，批次层判定呆滞', foot: `呆滞 SKU <b>${k.staleSku}</b> · 阈值 ${p.stale_days} 天`, bar: k.avgAge / p.stale_days, barCls: k.avgAge > 90 ? 'warn' : '' },
    ]);
    const cols = [
      { k: 'id', label: 'SKU', value: s => s.id, render: s => `<span class="code">${esc(s.id)}</span>`, csv: s => s.id },
      { k: 'desc', label: '品名', w: 215, value: s => s.desc, render: s => `<div class="desc-cell" title="${esc(s.desc)}">${esc(s.desc)}</div>`, csv: s => s.desc },
      { k: 'category', label: '品类', value: s => s.category, render: s => `<span class="small">${esc(s.category.split(' / ')[0])}</span>`, csv: s => s.category },
      { k: 'warehouse', label: '仓', value: s => s.warehouse, csv: s => s.warehouse },
      { k: 'abc', label: 'ABC', value: s => s.m.abc, render: s => tag(s.m.abc, s.m.abc === 'A' ? 'medium' : 'low'), csv: s => s.m.abc },
      { k: 'xyz', label: 'XYZ', value: s => s.m.xyz, render: s => `<span class="small" title="CV ${D(s.m.cv, 2)} · 零需求周 ${P(s.m.zeroRate, 0)}">${esc(s.m.xyz)}</span>`, csv: s => s.m.xyz },
      { k: 'on_hand', label: '现货', align: 'r', value: s => s.m.onHand, render: s => Q(s.m.onHand), csv: s => s.m.onHand },
      { k: 'available', label: '可用', align: 'r', value: s => s.m.available, render: s => Q(s.m.available), csv: s => s.m.available },
      { k: 'blocked', label: '预留/待检/冻结', align: 'r', value: s => s.m.reserved + s.m.quarantine + s.m.blocked, render: s => `<span class="muted num">${Q(s.m.reserved + s.m.quarantine + s.m.blocked)}</span>`, csv: s => s.m.reserved + s.m.quarantine + s.m.blocked },
      { k: 'inTransit', label: '在途', align: 'r', value: s => s.m.inTransit, render: s => Q(s.m.inTransit), csv: s => s.m.inTransit },
      { k: 'onOrder', label: '未清 PO', align: 'r', value: s => s.m.onOrder, render: s => Q(s.m.onOrder), csv: s => s.m.onOrder },
      { k: 'ip', label: 'IP', align: 'r', value: s => s.m.ip, render: s => Q(s.m.ip), csv: s => s.m.ip },
      { k: 'dbar', label: '周均需求', align: 'r', value: s => s.m.dbar, render: s => D(s.m.dbar), csv: s => Math.round(s.m.dbar * 10) / 10 },
      { k: 'cslEff', label: 'CSL', align: 'r', value: s => s.m.cslEff, render: s => `<span class="small" title="${esc(modelLabel(s.m.ssModel))}">${cslLabel(s.m.cslEff)}</span>`, csv: s => s.m.cslEff },
      { k: 'ss', label: 'SS', align: 'r', value: s => s.m.ss, render: s => Q(s.m.ss), csv: s => Math.round(s.m.ss) },
      { k: 'rop', label: 'ROP', align: 'r', value: s => s.m.rop, render: s => Q(s.m.rop), csv: s => Math.round(s.m.rop) },
      { k: 'wos', label: 'WOS', align: 'r', value: s => s.m.wos, render: s => s.m.wos === null ? '<span class="muted">—</span>' : `<span class="${s.m.wos > p.wos_max ? 'warn' : ''}">${D(s.m.wos)}</span>`, csv: s => s.m.wos === null ? '' : Math.round(s.m.wos * 10) / 10 },
      { k: 'turnoverAnnual', label: '周转/年', align: 'r', value: s => s.m.turnoverAnnual, render: s => D(s.m.turnoverAnnual), csv: s => s.m.turnoverAnnual === null ? '' : Math.round(s.m.turnoverAnnual * 10) / 10 },
      { k: 'weightedAge', label: '库龄/天', align: 'r', value: s => s.m.weightedAge, render: s => s.m.weightedAge === null ? '—' : D(s.m.weightedAge, 0), csv: s => s.m.weightedAge === null ? '' : Math.round(s.m.weightedAge) },
      { k: 'eoRatio', label: 'E&O', align: 'r', value: s => s.m.eoRatio, render: s => `<span class="${s.m.eoRatio > p.eo_ratio_max ? 'neg' : ''}">${P(s.m.eoRatio, 0)}</span>`, csv: s => s.m.eoRatio === null ? '' : Math.round(s.m.eoRatio * 1000) / 10 },
      { k: 'status', label: '状态', w: 130, render: s => tagsFor(s.m), csv: s => (s.m.tags || []).join('|') },
      { k: 'trend', label: '52 周需求', render: s => spark(s.weekly, 90, 22, C.blue), csv: () => '' },
    ];
    h += table('inventory', cols, skus, { clickable: true, rowSku: s => s.id, exportName: '库存台账' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：采购订单 */
  function renderPurchase() {
    const d = data(), R = d.R;
    let pos = d.pos.slice();
    if (State.filters.status) pos = pos.filter(p => p.status === State.filters.status);
    setCount(`${pos.length} 张 PO`);
    const open = pos.filter(p => p.status !== 'CLOSED');
    const openValue = sum(open.map(p => (p.qty - p.received_qty) * (d.skuById[p.sku]?.m.unitCost || 0)));
    const overdue = pos.filter(p => p.status === 'OVERDUE' || (p.status !== 'CLOSED' && E.daysBetween(p.promise_date, R.meta.snapshot_date) > 0));
    // 口径：分母只能是未清 PO。已结案单据无实收日期，不能据此计算真实 OTD（On-Time Delivery）。
    const openOnTimeRate = open.length ? 1 - overdue.length / open.length : null;
    let h = kpiRow([
      { label: '订单总数', value: Q(pos.length), unit: '张', foot: `已结案 <b>${pos.length - open.length}</b> · 未清 <b>${open.length}</b>`, bar: 1 },
      { label: '未清金额', value: M(openValue), hint: '未清数量 × 当前单位成本', foot: `未清 <b>${Q(sum(open.map(p => p.qty - p.received_qty)))}</b> 件`, bar: openValue / Math.max(1, openValue * 1.6) },
      { label: '逾期订单', value: Q(overdue.length), unit: '张', flag: overdue.length ? 'critical' : '', hint: '承诺交期早于快照日且未清量 > 0。分母为未清 PO；已结案单据无实收日期，不计算真实 OTD', foot: `未清准时率 <b>${P(openOnTimeRate)}</b> · 逾期/未清 <b>${Q(overdue.length)}/${Q(open.length)}</b>`, bar: open.length ? overdue.length / open.length : 0, barCls: 'bad' },
      { label: '平均提前期', value: D(sum(pos.map(p => p.lead_days)) / Math.max(1, pos.length), 0), unit: '天', foot: `系数 <b>${D(R.params.lead_factor, 1)}×</b> 已在 SS / ROP 中生效`, bar: .5 },
    ]);
    const cols = [
      { k: 'id', label: '采购订单号', value: p => p.id, render: p => `<span class="code">${esc(p.id)}</span>`, csv: p => p.id },
      { k: 'sku', label: 'SKU', value: p => p.sku, render: p => `<span class="code">${esc(p.sku)}</span>`, csv: p => p.sku },
      { k: 'desc', label: '品名', w: 190, render: p => `<div class="desc-cell">${esc(d.skuById[p.sku]?.desc || '')}</div>`, csv: p => d.skuById[p.sku]?.desc || '' },
      { k: 'supplier', label: '供应商', value: p => p.supplier, csv: p => p.supplier },
      { k: 'warehouse', label: '目的仓', value: p => p.warehouse, csv: p => p.warehouse },
      { k: 'qty', label: '订购量', align: 'r', value: p => p.qty, render: p => Q(p.qty), csv: p => p.qty },
      { k: 'received_qty', label: '已收', align: 'r', value: p => p.received_qty, render: p => Q(p.received_qty), csv: p => p.received_qty },
      { k: 'open', label: '未清', align: 'r', value: p => p.qty - p.received_qty, render: p => Q(p.qty - p.received_qty), csv: p => p.qty - p.received_qty },
      { k: 'unit_cost', label: '单位成本 / ' + CS(), align: 'r', value: p => d.skuById[p.sku]?.m.unitCost || 0, render: p => CS() + D(d.skuById[p.sku]?.m.unitCost, 2), csv: p => d.skuById[p.sku]?.m.unitCost || 0 },
      { k: 'amount', label: '金额', align: 'r', value: p => p.qty * (d.skuById[p.sku]?.m.unitCost || 0), render: p => M(p.qty * (d.skuById[p.sku]?.m.unitCost || 0)), csv: p => Math.round(p.qty * (d.skuById[p.sku]?.m.unitCost || 0) * 100) / 100 },
      { k: 'order_date', label: '下单日', value: p => p.order_date, render: p => `<span class="num">${esc(p.order_date)}</span>`, csv: p => p.order_date },
      { k: 'promise_date', label: '承诺交期', value: p => p.promise_date, render: p => `<span class="num">${esc(p.promise_date)}</span>`, csv: p => p.promise_date },
      { k: 'eta', label: 'ETA', value: p => p.eta, render: p => `<span class="num">${esc(p.eta)}</span>`, csv: p => p.eta },
      { k: 'lead_days', label: 'LT/天', align: 'r', value: p => p.lead_days, render: p => Q(p.lead_days), csv: p => p.lead_days },
      { k: 'status', label: '状态', value: p => p.status, render: p => statusTag(p.status), csv: p => PO_STATUS[p.status]?.[0] || p.status },
      { k: 'overdue', label: '逾期/天', align: 'r', value: p => p.status === 'CLOSED' ? 0 : Math.max(0, E.daysBetween(p.promise_date, R.meta.snapshot_date)), render: p => { const v = p.status === 'CLOSED' ? 0 : Math.max(0, E.daysBetween(p.promise_date, R.meta.snapshot_date)); return v ? `<span class="neg">${v}</span>` : '<span class="muted">—</span>'; }, csv: p => p.status === 'CLOSED' ? 0 : Math.max(0, E.daysBetween(p.promise_date, R.meta.snapshot_date)) },
    ];
    h += `<div class="section-title">采购订单明细 <span class="en">Purchase Orders · 状态筛选在上方筛选栏</span></div>` +
      table('purchase', cols, pos, { clickable: true, rowSku: p => p.sku, exportName: '采购订单' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：在途追踪 */
  function renderTransit() {
    const d = data(), R = d.R, snap = R.meta.snapshot_date;
    let pos = d.pos.filter(p => p.status !== 'CLOSED');
    if (State.filters.status) pos = pos.filter(p => p.status === State.filters.status);
    setCount(`${pos.length} 条在途`);
    const qtyOpen = sum(pos.map(p => p.qty - p.received_qty));
    const valOpen = sum(pos.map(p => (p.qty - p.received_qty) * (d.skuById[p.sku]?.m.unitCost || 0)));
    const overdue = pos.filter(p => p.status === 'OVERDUE');
    const transitDays = pos.map(p => Math.max(0, E.daysBetween(p.ship_date, snap)));
    const next7 = pos.filter(p => E.daysBetween(snap, p.eta) >= 0 && E.daysBetween(snap, p.eta) <= 7).length;
    let h = kpiRow([
      { label: '在途 / 未清', value: Q(qtyOpen), unit: '件', foot: `<b>${pos.length}</b> 条单据 · 金额 <b>${M(valOpen)}</b>`, bar: 1 },
      { label: '逾期在途', value: Q(overdue.length), unit: '条', flag: overdue.length ? 'critical' : '', foot: `逾期未清 <b>${Q(sum(overdue.map(p => p.qty - p.received_qty)))}</b> 件`, bar: pos.length ? overdue.length / pos.length : 0, barCls: 'bad' },
      { label: '平均在途时长', value: D(transitDays.length ? sum(transitDays) / transitDays.length : null, 0), unit: '天', foot: '自发运日至快照日', bar: .5 },
      { label: '未来 7 天到货', value: Q(next7), unit: '条', flag: 'good', foot: `到货量 <b>${Q(sum(pos.filter(p => E.daysBetween(snap, p.eta) >= 0 && E.daysBetween(snap, p.eta) <= 7).map(p => p.qty - p.received_qty)))}</b> 件`, bar: pos.length ? next7 / pos.length : 0 },
    ]);
    // 未来到货柱
    const labels = [], vals = [];
    for (let i = 0; i < 8; i++) {
      const d0 = dateAdd(snap, i * 7), d1 = dateAdd(snap, (i + 1) * 7);
      labels.push(d0.slice(5));
      vals.push(sum(pos.filter(p => p.eta >= d0 && p.eta < d1).map(p => p.qty - p.received_qty)));
    }
    const lateCnt = pos.filter(p => E.daysBetween(p.promise_date, p.eta) > 0).length;
    const maxVar = pos.length ? Math.max.apply(null, pos.map(p => E.daysBetween(p.promise_date, p.eta))) : 0;
    const carrierN = new Set(pos.map(p => p.carrier)).size, laneN = new Set(pos.map(p => p.lane)).size;
    const weeksWithArrival = vals.filter(v => v > 0).length;
    h += `<div class="row2">${card('未来 8 周计划到货', comboChart({ labels, bars: [{ name: '到货量', values: vals, color: C.blue }], height: 175, yFmt: v => shortNum(v), tipFmt: v => Q(v) + ' 件', xTicks: 8 }) + `<div class="chart-note">按 ETA 周汇总未清量；已结案订单不计入。本快照 ${weeksWithArrival}/8 周有未清到货，其余周为空属真实排程空档，非数据缺失。承诺交期与 ETA 的偏差是逾期预警来源。</div>`, '按 ETA 周')
      }${card('在途状态构成', (() => {
        const g = {}; pos.forEach(p => g[p.status] = (g[p.status] || 0) + 1);
        return hbars(Object.entries(g).map(([s, v]) => ({ label: PO_STATUS[s]?.[0] || s, value: v, text: v + ' 条', color: s === 'OVERDUE' ? C.red : s === 'IN_TRANSIT' ? C.blue : C.grey })));
      })() + `<div class="hr"></div><div class="mono-label" style="margin-bottom:5px">交期偏差诊断 · ETA vs 承诺</div>` +
        hbars([
          { label: 'ETA 晚于承诺', value: lateCnt, text: lateCnt + ' 条', color: C.red },
          { label: '按承诺或提前', value: pos.length - lateCnt, text: (pos.length - lateCnt) + ' 条', color: C.green },
          { label: '最大顺延', value: Math.max(0, maxVar), text: '+' + Math.max(0, maxVar) + ' 天', color: C.amber },
          { label: '承运商 / 线路', value: carrierN, text: carrierN + ' 家 / ' + laneN + ' 条', color: C.grey },
        ]) + `<div class="chart-note">在途量计入库存位置 IP 与预计可用量 PA(t)；未发运单据计入 IP，但不计入可承诺量 ATP。</div>`, '单据数')}</div>`;
    const cols = [
      { k: 'id', label: 'PO / ASN', value: p => p.id, render: p => `<span class="code">${esc(p.id)}</span><div class="small muted">ASN-${esc(p.id.slice(-9))}</div>`, csv: p => p.id },
      { k: 'sku', label: 'SKU', value: p => p.sku, render: p => `<span class="code">${esc(p.sku)}</span>`, csv: p => p.sku },
      { k: 'desc', label: '品名', w: 190, render: p => `<div class="desc-cell">${esc(d.skuById[p.sku]?.desc || '')}</div>`, csv: p => d.skuById[p.sku]?.desc || '' },
      { k: 'carrier', label: '承运商', value: p => p.carrier, render: p => `<span class="tag-mono">${esc(p.carrier)}</span>`, csv: p => p.carrier },
      { k: 'lane', label: '线路', value: p => p.lane, render: p => `<span class="tag-mono">${esc(p.lane)}</span>`, csv: p => p.lane },
      { k: 'qty', label: '发运量', align: 'r', value: p => p.qty - p.received_qty, render: p => Q(p.qty - p.received_qty), csv: p => p.qty - p.received_qty },
      { k: 'ship_date', label: '发运日', value: p => p.ship_date, render: p => `<span class="num">${esc(p.ship_date)}</span>`, csv: p => p.ship_date },
      { k: 'promise_date', label: '承诺交期', value: p => p.promise_date, render: p => `<span class="num">${esc(p.promise_date)}</span>`, csv: p => p.promise_date },
      { k: 'eta', label: 'ETA', value: p => p.eta, render: p => `<span class="num">${esc(p.eta)}</span>`, csv: p => p.eta },
      { k: 'tdays', label: '在途/天', align: 'r', value: p => Math.max(0, E.daysBetween(p.ship_date, snap)), render: p => Q(Math.max(0, E.daysBetween(p.ship_date, snap))), csv: p => Math.max(0, E.daysBetween(p.ship_date, snap)) },
      { k: 'variance', label: '交期偏差/天', align: 'r', value: p => Math.max(0, E.daysBetween(p.promise_date, p.eta)), render: p => { const v = Math.max(0, E.daysBetween(p.promise_date, p.eta)); return v ? `<span class="neg">+${v}</span>` : '<span class="muted">0</span>'; }, csv: p => Math.max(0, E.daysBetween(p.promise_date, p.eta)) },
      { k: 'warehouse', label: '目的仓', value: p => p.warehouse, csv: p => p.warehouse },
      { k: 'status', label: '状态', value: p => p.status, render: p => statusTag(p.status), csv: p => PO_STATUS[p.status]?.[0] || p.status },
      { k: 'atp', label: '计入 ATP', render: p => p.status === 'NOT_SHIPPED' ? tag('否', 'low') : tag('是', 'good'), csv: p => p.status === 'NOT_SHIPPED' ? '否' : '是' },
    ];
    h += `<div class="section-title">在途单据 <span class="en">In-transit · 按 ETA 排序</span></div>` +
      table('transit', cols, pos.slice().sort((a, b) => a.eta.localeCompare(b.eta)), { clickable: true, rowSku: p => p.sku, exportName: '在途追踪' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：库龄分析 */
  function renderAging() {
    const d = data(), skus = d.skus, p = d.R.params, k = K(skus, d.pos);
    setCount(`${skus.length} SKU · ${sum(skus.map(s => s.batches.length))} 批次`);
    const agg = p.age_buckets.map(b => ({ ...b, qty: 0, value: 0, skus: 0 }));
    skus.forEach(s => s.m.ageBuckets.forEach((b, i) => { agg[i].qty += b.qty; agg[i].value += b.value; agg[i].skus += b.skus; }));
    const totalV = sum(agg.map(a => a.value)) || 1;
    const oldV = sum(agg.filter(a => a.lo >= 91).map(a => a.value));
    const staleV = sum(agg.filter(a => a.lo >= p.stale_days).map(a => a.value));
    let h = kpiRow([
      { label: '加权平均库龄', value: D(k.avgAge, 0), unit: '天', foot: `批次数量加权 · 共 ${sum(skus.map(s => s.batches.length))} 个批次`, bar: k.avgAge / p.stale_days },
      { label: '> 90 天库存金额', value: M(oldV), foot: `占库存 <b>${P(oldV / totalV)}</b> · 需关注周转`, bar: oldV / totalV, barCls: 'warn' },
      { label: `> ${p.stale_days} 天（呆滞阈值）`, value: M(staleV), flag: 'high', foot: `占库存 <b>${P(staleV / totalV)}</b> · 计提减值后 ${M(k.obsoleteValue)}`, bar: staleV / totalV, barCls: 'bad' },
      { label: '呆滞 SKU', value: Q(k.staleSku), unit: '个', hint: '批次库龄超阈值，或连续 N 周无动销，或标记 PHASE_OUT', foot: `占在册 <b>${P(skus.length ? k.staleSku / skus.length : 0)}</b>`, bar: skus.length ? k.staleSku / skus.length : 0 },
    ]);
    const colors = [C.green, '#6f9e7f', C.amber, '#c57032', C.red];
    const parts = agg.map((a, i) => ({ label: a.label, value: a.value, text: M(a.value), color: colors[i] }));
    h += `<div class="row2">${card('库龄分桶结构', stackBar(parts, totalV) + legend(parts.map(x => ({ label: x.label, color: x.color }))) +
      `<div style="margin-top:12px">${hbars(parts.map(x => ({ label: x.label, value: x.value, text: M(x.value) + ' · ' + P(x.value / totalV, 0), color: x.color })))}</div>
      <div class="chart-note">库龄按<b>批次层</b>计算（收货日至快照日），不可用 SKU 平均库龄判定呆滞。批次按 FIFO 扣减。</div>`, '按库存金额')
      }${table('agingBuckets', [
        { k: 'label', label: '库龄区间', render: a => esc(a.label), csv: a => a.label },
        { k: 'skus', label: '批次数', align: 'r', value: a => a.skus, render: a => Q(a.skus), csv: a => a.skus },
        { k: 'qty', label: '数量', align: 'r', value: a => a.qty, render: a => Q(a.qty), csv: a => a.qty },
        { k: 'value', label: '金额', align: 'r', value: a => a.value, render: a => M(a.value), csv: a => Math.round(a.value) },
        { k: 'pct', label: '占比', align: 'r', value: a => a.value / totalV, render: a => P(a.value / totalV), csv: a => Math.round(a.value / totalV * 1000) / 10 + '%' },
      ], agg, { noPage: true, title: '分桶明细', sub: '数量 / 金额 / 占比' })}</div>`;
    const batches = skus.flatMap(s => s.batches.map(b => ({ ...b, sku: s.id, desc: s.desc, cat: s.category, uc: s.m.unitCost, lifecycle: s.lifecycle })))
      .sort((a, b) => b.age_days - a.age_days);
    const cols = [
      { k: 'sku', label: 'SKU', value: b => b.sku, render: b => `<span class="code">${esc(b.sku)}</span>`, csv: b => b.sku },
      { k: 'desc', label: '品名', w: 190, render: b => `<div class="desc-cell">${esc(b.desc)}</div>`, csv: b => b.desc },
      { k: 'id', label: '批次', value: b => b.id, render: b => `<span class="tag-mono">${esc(b.id)}</span>`, csv: b => b.id },
      { k: 'date', label: '入库日', value: b => b.date, render: b => `<span class="num">${esc(b.date)}</span>`, csv: b => b.date },
      { k: 'age_days', label: '库龄/天', align: 'r', value: b => b.age_days, render: b => `<span class="${b.age_days >= p.stale_days ? 'neg' : b.age_days > 90 ? 'warn' : ''}">${Q(b.age_days)}</span>`, csv: b => b.age_days },
      { k: 'qty', label: '结存数量', align: 'r', value: b => b.qty, render: b => Q(b.qty), csv: b => b.qty },
      { k: 'value', label: '结存金额', align: 'r', value: b => b.qty * b.uc, render: b => M(b.qty * b.uc), csv: b => Math.round(b.qty * b.uc) },
      { k: 'bucket', label: '分桶', render: b => { const a = p.age_buckets.find(x => b.age_days >= x.lo && b.age_days < x.hi); return tag(a ? a.label : '—', b.age_days >= p.stale_days ? 'critical' : 'low'); }, csv: b => (p.age_buckets.find(x => b.age_days >= x.lo && b.age_days < x.hi) || {}).label || '' },
      { k: 'lifecycle', label: '生命周期', value: b => b.lifecycle, render: b => b.lifecycle === 'PHASE_OUT' ? tag('停售', 'critical') : tag('在售', 'good'), csv: b => b.lifecycle },
    ];
    h += `<div class="section-title">批次明细 <span class="en">Batch-level aging · FIFO 扣减后结存</span></div>` +
      table('aging', cols, batches, { clickable: true, rowSku: b => b.sku, exportName: '库龄批次明细' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：冗余与 E&O */
  function renderExcess() {
    const d = data(), skus = d.skus, p = d.R.params, k = K(skus, d.pos);
    const ranked = skus.filter(s => s.m.eoValue > 0).sort((a, b) => b.m.eoValue - a.m.eoValue);
    setCount(`${ranked.length} SKU 存在冗余`);
    const obsoleteGross = sum(skus.map(s => s.m.obsolete * s.m.unitCost));
    let h = kpiRow([
      { label: 'E&O 毛敞口', value: M(k.grossEoValue), hint: '未计提减值的风险规模 = (Excess + Obsolete) × 单位成本；用于规模沟通，非财务入账口径', foot: `呆滞原值 <b>${M(obsoleteGross)}</b> · 超储 <b>${M(k.excessValue)}</b>`, bar: (k.grossEoRatio || 0) / (p.eo_ratio_max * 2), barCls: 'warn' },
      { label: '呆滞减值计提', value: M(k.provisionValue), hint: `= Obsolete 原值 × 减值率 ${P(p.provision_rate, 0)}；为估算计提额，不等于财务凭证`, foot: `计提后净敞口 <b>${M(k.eoValue)}</b>`, bar: k.grossEoValue ? k.provisionValue / k.grossEoValue : 0 },
      { label: '计提后净敞口', value: M(k.eoValue), flag: k.eoRatio > p.eo_ratio_max ? 'high' : '', hint: '= 毛敞口 − 减值计提；E&O 占比基于此口径，三个口径互不混加', foot: `占库存 <b>${P(k.eoRatio)}</b> · 毛敞口占比 ${P(k.grossEoRatio)} · 阈值 ${P(p.eo_ratio_max, 0)}`, bar: k.eoRatio / (p.eo_ratio_max * 2), barCls: k.eoRatio > p.eo_ratio_max ? 'warn' : '' },
      { label: '涉及 SKU', value: Q(ranked.length), unit: '个', foot: `呆滞 <b>${k.staleSku}</b> · 超储 <b>${k.overstockSku}</b>`, bar: skus.length ? ranked.length / skus.length : 0 },
    ]);
    const totalV = k.inventoryValue || 1;
    // 口径对照：若跳过「先划 Obsolete」直接按 On-hand 减去目标上限，会把呆滞库存重复计成超储。
    const grossExcess = sum(skus.map(s => Math.max(0, s.m.onHand - s.m.maxTarget) * s.m.unitCost));
    const parts = [
      { label: '健康可用', value: totalV - sum(skus.map(s => s.m.obsolete * s.m.unitCost)) - k.excessValue, color: C.green, text: M(totalV - sum(skus.map(s => s.m.obsolete * s.m.unitCost)) - k.excessValue) },
      { label: 'Excess 超储', value: k.excessValue, color: C.amber, text: M(k.excessValue) },
      { label: 'Obsolete 呆滞', value: sum(skus.map(s => s.m.obsolete * s.m.unitCost)), color: C.red, text: M(sum(skus.map(s => s.m.obsolete * s.m.unitCost))) },
    ];
    h += `<div class="row2">${card('库存价值拆解', stackBar(parts, totalV) + legend(parts.map(x => ({ label: x.label, color: x.color }))) +
      `<div class="formula">Obsolete = 批次库龄 ≥ ${p.stale_days} 天 | 连续 ≥ ${p.stale_no_move_weeks} 周无动销 | PHASE_OUT 停售
Eligible = On-hand − Obsolete
Excess   = max(0, Eligible − 目标上限)
目标上限  = d̄ × (L + P) + SS + ${p.target_cover_weeks} × d̄
<span class="cm">// 先划 O 再算 E，两者互斥，禁止重复计入</span>
<span class="cm">// 金额三口径：毛敞口 =(Excess+Obsolete)×成本 | 计提 = Obsolete×成本×减值率 | 净敞口 = 毛敞口 − 计提；三者禁止互相混加</span></div>
      <div class="chart-note"><b>互斥口径对照</b>：若跳过「先划 Obsolete」直接按现货减目标上限，超储毛额会是 <b>${M(grossExcess)}</b>；按互斥口径实际 Excess 仅 <b>${M(k.excessValue)}</b>，差额已归入 Obsolete，避免同一批库存重复计提。调整呆滞天数 / 目标覆盖周数 / 减值率可即时重算。</div>`, '互斥口径')
      }${card('呆滞与冗余 Top 10', hbars(ranked.slice(0, 10).map(s => ({ label: s.id + ' · ' + s.desc.slice(0, 22), value: s.m.eoValue, text: M(s.m.eoValue), color: s.lifecycle === 'PHASE_OUT' ? C.red : C.amber }))), '按计提后净敞口')}</div>`;
    const action = s => {
      if (s.lifecycle === 'PHASE_OUT') return '停售清算 / 减值处置';
      if (s.m.obsolete > 0 && s.m.excess > 0) return '呆滞先处置，剩余暂停补货';
      if (s.m.obsolete > 0) return '促销消化 / 退供协商';
      if (s.m.excess > 0) return '暂停补货至目标上限';
      return '观察';
    };
    const cols = [
      { k: 'id', label: 'SKU', value: s => s.id, render: s => `<span class="code">${esc(s.id)}</span>`, csv: s => s.id },
      { k: 'desc', label: '品名', w: 195, render: s => `<div class="desc-cell">${esc(s.desc)}</div>`, csv: s => s.desc },
      { k: 'lifecycle', label: '生命周期', value: s => s.lifecycle, render: s => s.lifecycle === 'PHASE_OUT' ? tag('停售', 'critical') : tag('在售', 'good'), csv: s => s.lifecycle },
      { k: 'onHand', label: '现货', align: 'r', value: s => s.m.onHand, render: s => Q(s.m.onHand), csv: s => s.m.onHand },
      { k: 'obsolete', label: 'Obsolete', align: 'r', value: s => s.m.obsolete, render: s => Q(s.m.obsolete), csv: s => s.m.obsolete },
      { k: 'eligible', label: 'Eligible', align: 'r', value: s => s.m.eligible, render: s => Q(s.m.eligible), csv: s => s.m.eligible },
      { k: 'maxTarget', label: '目标上限', align: 'r', value: s => s.m.maxTarget, render: s => Q(s.m.maxTarget), csv: s => Math.round(s.m.maxTarget) },
      { k: 'excess', label: 'Excess', align: 'r', value: s => s.m.excess, render: s => Q(s.m.excess), csv: s => s.m.excess },
      { k: 'eoValue', label: '净敞口', align: 'r', value: s => s.m.eoValue, render: s => M(s.m.eoValue), csv: s => Math.round(s.m.eoValue) },
      { k: 'eoRatio', label: '净敞口占比', align: 'r', value: s => s.m.eoRatio, render: s => `<span class="${s.m.eoRatio > p.eo_ratio_max ? 'neg' : ''}">${P(s.m.eoRatio)}</span>`, csv: s => Math.round((s.m.eoRatio || 0) * 1000) / 10 + '%' },
      { k: 'noMoveWeeks', label: '无动销/周', align: 'r', value: s => s.m.noMoveWeeks, render: s => Q(s.m.noMoveWeeks), csv: s => s.m.noMoveWeeks },
      { k: 'action', label: '建议动作', w: 190, render: s => `<span class="small">${esc(action(s))}</span>`, csv: s => action(s) },
    ];
    h += `<div class="section-title">冗余库存清单 <span class="en">Excess &amp; Obsolete · 按计提后净敞口降序</span></div>` +
      table('excess', cols, ranked, { clickable: true, rowSku: s => s.id, exportName: '冗余库存清单' });
    return h;
  }

  /* ------------------------------------------------------------------ 视图：绩效分析 */
  function renderMetrics() {
    const d = data(), R = d.R, skus = d.skus, p = R.params, k = K(skus, d.pos);
    setCount(`${skus.length} SKU · ${p.turnover_window_weeks} 周窗口`);
    let h = kpiRow([
      { label: '库存周转率（年化）', value: D(k.turnoverAnnual), unit: '次', hint: 'COGS 口径，非销售收入；分母为期间逐周平均库存金额', foot: `期间 ${D(k.turnoverPeriod, 2)} 次 · COGS ${M(k.cogs)}`, bar: k.turnoverAnnual / 12 },
      { label: '库存周转天数 DIO', value: D(k.dio, 0), unit: '天', hint: '期间日历日 / 期间周转次数', foot: `年化口径对应 ${D(k.turnoverAnnual ? 365 / k.turnoverAnnual : null, 0)} 天`, bar: k.dio / 120, barCls: k.dio > 90 ? 'warn' : '' },
      { label: '动销率', value: P(k.activeRate), hint: `近 ${p.active_window_weeks} 周有出库的 SKU 占比`, foot: `${k.activeSkus} / ${skus.length} SKU · 平均售罄率 ${P(sum(skus.map(s => s.m.sellThrough || 0)) / Math.max(1, skus.length))}`, bar: k.activeRate, barCls: k.activeRate < .8 ? 'warn' : '' },
      { label: '加权 WOS', value: D(k.wosWeighted), unit: '周', foot: `按周现货可用率 <b>${k.instockWeekRate === null ? '—' : P(k.instockWeekRate)}</b> · 非 CSL 达成，不可与目标 ${P(p.csl, 0)} 对比`, bar: k.wosWeighted / p.wos_max },
    ]);
    const labels = R.weeks.map(w => w.slice(5));
    const demand = new Array(R.weeks.length).fill(0), inv = new Array(R.weeks.length).fill(0);
    skus.forEach(s => {
      s.weekly.forEach((v, i) => demand[i] += v);
      (s.weekly_oh || []).forEach((v, i) => inv[i] += v * s.m.unitCost);
    });
    h += `<div class="row2">${card('周度真实需求与库存结存', comboChart({
      labels, height: 205,
      bars: [{ name: '真实出库量', values: demand, color: '#b9d0e6', opacity: .9, tipFmt: v => Q(v) + ' 件' }],
      series: [{ name: '库存结存金额', values: inv, color: C.ink, width: 1.7, right: true, tipFmt: v => M(v) }],
      yFmt: v => shortNum(v), rightFmt: v => CS() + shortNum(v), xTicks: 8,
    }) + legend([{ label: '出库量 / 件（左轴）', color: '#b9d0e6' }, { label: '库存金额 / ' + CS() + '（右轴）', color: C.ink, line: 1 }]) +
      `<div class="chart-note">双轴独立刻度：柱为真实交易出库件数（左轴），线为逐周库存结存金额（右轴），用于观察补货与消耗的相位关系；两轴绝对高度不可直接比较。期间总出库 ${Q(sum(demand))} 件。</div>`, 'UCI 真实交易聚合')
      }${card('品类绩效对比', hbars(k.byCategory.slice(0, 9).map(c => ({ label: c.category.split(' / ')[0], value: c.value, text: M(c.value) + ' · WOS ' + D(c.wos), color: C.ink }))), '按库存金额')}</div>`;
    const catCols = [
      { k: 'category', label: '品类', value: c => c.category, render: c => `<span class="primary">${esc(c.category)}</span>`, csv: c => c.category },
      { k: 'skus', label: 'SKU 数', align: 'r', value: c => c.skus, render: c => Q(c.skus), csv: c => c.skus },
      { k: 'value', label: '库存金额', align: 'r', value: c => c.value, render: c => M(c.value), csv: c => Math.round(c.value) },
      { k: 'share', label: '占比', align: 'r', value: c => c.value / (k.inventoryValue || 1), render: c => P(c.value / (k.inventoryValue || 1)), csv: c => Math.round(c.value / (k.inventoryValue || 1) * 1000) / 10 + '%' },
      { k: 'wos', label: 'WOS', align: 'r', value: c => c.wos, render: c => D(c.wos), csv: c => c.wos === null ? '' : Math.round(c.wos * 10) / 10 },
      { k: 'turnover', label: '周转/年', align: 'r', value: c => c.turnover, render: c => D(c.turnover), csv: c => c.turnover === null ? '' : Math.round(c.turnover * 10) / 10 },
      { k: 'activeRate', label: '动销率', align: 'r', value: c => c.activeRate, render: c => P(c.activeRate), csv: c => Math.round((c.activeRate || 0) * 1000) / 10 + '%' },
      { k: 'eoRatio', label: 'E&O 占比', align: 'r', value: c => c.eoRatio, render: c => `<span class="${c.eoRatio > p.eo_ratio_max ? 'neg' : ''}">${P(c.eoRatio)}</span>`, csv: c => Math.round((c.eoRatio || 0) * 1000) / 10 + '%' },
      { k: 'stale', label: '呆滞量', align: 'r', value: c => c.stale, render: c => Q(c.stale), csv: c => c.stale },
    ];
    h += `<div class="section-title">品类绩效 <span class="en">Category performance</span></div>` + table('metricsCat', catCols, k.byCategory, { noPage: true, exportName: '品类绩效' });
    // ABC
    const abc = ['A', 'B', 'C'].map(g => {
      const g2 = skus.filter(s => s.abc === g);
      const val = sum(g2.map(s => s.m.onHandValue));
      return { g, n: g2.length, val, share: val / (k.inventoryValue || 1), wos: sum(g2.map(s => s.m.available)) / Math.max(1, sum(g2.map(s => s.m.dbar))), active: g2.filter(s => s.m.active).length / Math.max(1, g2.length), eo: sum(g2.map(s => s.m.eoValue)) / Math.max(1, val) };
    });
    const abcCols = [
      { k: 'g', label: 'ABC 分级', render: a => tag(a.g, a.g === 'A' ? 'medium' : 'low'), csv: a => a.g },
      { k: 'n', label: 'SKU 数', align: 'r', value: a => a.n, render: a => Q(a.n), csv: a => a.n },
      { k: 'val', label: '库存金额', align: 'r', value: a => a.val, render: a => M(a.val), csv: a => Math.round(a.val) },
      { k: 'share', label: '金额占比', align: 'r', value: a => a.share, render: a => P(a.share), csv: a => Math.round(a.share * 1000) / 10 + '%' },
      { k: 'wos', label: 'WOS', align: 'r', value: a => a.wos, render: a => D(a.wos), csv: a => Math.round(a.wos * 10) / 10 },
      { k: 'active', label: '动销率', align: 'r', value: a => a.active, render: a => P(a.active), csv: a => Math.round(a.active * 1000) / 10 + '%' },
      { k: 'eo', label: 'E&O 占比', align: 'r', value: a => a.eo, render: a => P(a.eo), csv: a => Math.round(a.eo * 1000) / 10 + '%' },
    ];
    h += `<div class="section-title">ABC 分级 <span class="en">按真实销售金额划分：A 前 20% / B 次 30% / C 后 50%</span></div>` + table('metricsAbc', abcCols, abc, { noPage: true, exportName: 'ABC分级' });
    h += `<div class="section-title">指标口径速查 <span class="en">Metric definitions</span></div>` + card('计算口径', metricDictTable(), null, null, true);
    return h;
  }
  function metricDictTable() {
    const rows = [
      ['金额币种', 'dataset.meta.currency (ISO 4217) → params.currency', '币种由数据层声明，只决定金额符号与导出元信息，不参与任何指标计算、不做汇率换算；销售额口径（unit_price / weekly_revenue）与库存成本口径（数量 × 单位成本）同为 ' + CS() + ' 但不可相加'],
      ['安全库存 SS', 'z · √(L·σ_d² + d²·σ_L²)', '需求与提前期双重波动；L 与 σ_L 使用同一时间单位（周）；正态假设不适用于间歇性需求；d 为周均需求'],
      ['实测提前期 L / σ', 'L实测 = mean(实收 − 下单)；σ实测 = max(s, (P90(L) − L实测)/z90)', '按供应商在滚动窗口内的交付签收记录统计；右尾保护捕捉延迟分布的长尾，避免标准差低估极端延迟'],
      ['生效 L / σ_L', 'eff = w·实测 + (1−w)·契约；w = n/(n+prior)', 'contract 恒取契约值；rolling 在 n ≥ 最少样本数时 w=1；blend 始终收缩。实测 L 钳制在契约的 0.4~2.5 倍，σ ≤ L'],
      ['OTD 准时交付率', '#(实收 ≤ 判定基准 + 宽限) / 窗口内交付笔数', '基准可选确认 ETA 或合同承诺日；两者口径不同会显著改变评级。OTD 只做风险标记与样本统计，不直接乘进 SS 公式'],
      ['服务水平 CSL', 'z = Φ⁻¹(CSL)', '补货周期内不缺货概率；≠ 数量满足率 fill rate，≠ 按周现货可用率，三者不可互换'],
      ['ABC 分级', '主数据 ABC，或窗口消耗金额帕累托累计 80% / 95%', '基于全量 SKU 计算一次，筛选不改变归类；消耗金额用成本口径 d̄·52·单位成本'],
      ['XYZ 分级', 'CV = σ_d / d̄；零需求周占比', '先判间歇性再判波动：zero > 35% 或 CV > 1 → Z；zero ≤ 5% 且 CV ≤ 0.5 → X；其余 Y'],
      ['差异化 CSL 矩阵', 'CSL_eff = matrix[ABC + XYZ]', '3×3 九宫格；默认全局统一模式，切换后按格取 CSL，全局 CSL 降为对照基线'],
      ['Z 类安全库存', 'SS = Q_LTD(CSL) − d̄·L', 'Q_LTD 为周需求经验分布做 (L+σ_L) 周离散卷积所得的提前期总需求分位数；样本 <13 周或有效周 <6 时回退正态式'],
      ['补货点 ROP', 'd̄ · L + SS', '以库存位置 IP 触发，不以 On-hand 触发'],
      ['可下单补货量', 'max(MOQ, ⌈净需求/包装倍数⌉ × 包装倍数)', '净需求 = max(0, 目标上限 − IP)；无需求样本返回 0'],
      ['按周现货可用率', '1 − 缺货周数 / (周数 × SKU 数)', '结果型周级统计，不可与 CSL 目标对比；导入数据无缺货历史时显示 N/A'],
      ['库存位置 IP', '可用 + 全部未清 PO − 欠交', '未发运单据计入 IP，不计入 ATP'],
      ['Weeks of Supply', '可用量 / 周均需求', '零需求返回 N/A；总览使用 Σ可用 / Σ周均需求 加权口径'],
      ['库存周转率', '期间 COGS / 期间平均库存金额', '分子用成本口径，不用销售收入；分母用逐周结存均值'],
      ['周转天数 DIO', '期间日历日 / 期间周转次数', '与年化周转率不可混用'],
      ['动销率', '近 N 周有出库 SKU 数 / 在册 SKU 数', '与售罄率（sell-through）是两个指标，不互相替代'],
      ['售罄率', '期间出库量 / (期初量 + 期间收货量)', '收货量由逐周库存恒等式反推（可见 PO 台账经窗口裁剪会漏收货）；上限 100%'],
      ['金额口径', '估算成本额 = 单价 × 成本率，或导入的 unit_cost', '非财务入账口径；E&O 拆为毛敞口 / 减值计提 / 净敞口，三者禁止混加'],
      ['库龄', '快照日 − 批次收货日', '批次层判定，FIFO 扣减；禁止用 SKU 平均库龄判呆滞'],
      ['Obsolete', '库龄 ≥ 阈值 或 连续无动销 ≥ N 周 或 PHASE_OUT', '先划 O，再从剩余量算 Excess，两者互斥'],
      ['Excess', 'max(0, (On-hand − Obsolete) − 目标上限)', '目标上限 = d̄(L+P) + SS + 覆盖周数·d̄'],
      ['E&O 金额', 'Excess·成本 + Obsolete·成本·(1−减值率)', '计提减值后金额，≤ SKU 库存原值'],
      ['预计可用量 PA(t)', 'PA(t) = PA(t−1) + 计划到货 − 预测需求', '预测需求基准为近窗周均（history），不计已承诺订单'],
    ];
    return `<div class="table-wrap"><table class="tbl dict-table"><thead><tr><th>指标</th><th>公式</th><th>口径边界</th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${esc(r[0])}</td><td><code>${esc(r[1])}</code></td><td>${esc(r[2])}</td></tr>`).join('') + '</tbody></table></div>';
  }

  /* ------------------------------------------------------------------ 视图：参数与口径 */
  const PARAM_GROUPS = [
    { title: '服务水平策略 · Segmentation', items: [
      { k: 'segment_csl', label: '策略模式', type: 'select', opts: [['global', '全局统一 CSL'], ['matrix', 'ABC×XYZ 差异化矩阵']], desc: '差异化模式按九宫格取 CSL；Z 类间歇需求改用提前期总需求经验分位数定 SS' },
      { k: 'abc_mode', label: 'ABC 分级来源', type: 'select', opts: [['supplied', '主数据 / ERP 分级'], ['computed', '按窗口消耗金额重算（帕累托）']], desc: '主数据缺 ABC 字段时自动回退重算；分级基于全量 SKU，筛选不改变归类' },
      { k: 'csl', label: '全局服务水平 CSL', type: 'select', opts: [['0.90', '90% · z=1.282'], ['0.95', '95% · z=1.645'], ['0.975', '97.5% · z=1.960'], ['0.99', '99% · z=2.326'], ['0.995', '99.5% · z=2.576']], desc: '仅在「全局统一」模式生效；差异化模式下作为矩阵对照基线' },
    ] },
    { title: '策略参数 · Policy', items: [
      { k: 'cost_rate', label: '成本率', type: 'range', min: .3, max: .85, step: .01, fmt: v => P(v, 0), desc: '仅「估算」口径生效：单位成本 = 单价 × 成本率；影响全部金额指标' },
      { k: 'cost_basis', label: '成本口径', type: 'select', opts: [['estimated', '估算：单价 × 成本率'], ['supplied', '导入的真实单位成本']], desc: 'supplied 模式读取 SKU 的 unit_cost；导入含 unit_cost 的 CSV 时自动切换' },
      { k: 'lead_factor', label: '提前期系数', type: 'range', min: .5, max: 2, step: .1, fmt: v => D(v, 1) + '×', desc: '对全部供应商的提前期与其标准差同比缩放' },
      { k: 'target_cover_weeks', label: '目标覆盖周数', type: 'range', min: 1, max: 12, step: 1, fmt: v => v + ' 周', desc: '目标库存上限中的额外覆盖，影响超储 / Excess' },
      { k: 'demand_window_weeks', label: '需求统计窗口', type: 'select', opts: [['13', '13 周'], ['26', '26 周'], ['39', '39 周'], ['52', '52 周']], desc: 'd̄ 与 σ_d 的取样窗口' },
      { k: 'turnover_window_weeks', label: '周转统计窗口', type: 'select', opts: [['13', '13 周'], ['26', '26 周'], ['39', '39 周'], ['52', '52 周']], desc: 'COGS 与平均库存的统计期间' },
      { k: 'active_window_weeks', label: '动销判定窗口', type: 'select', opts: [['4', '4 周'], ['8', '8 周'], ['13', '13 周']], desc: '窗口内有出库即判定为动销 SKU' },
    ] },
    { title: '预警阈值 · Thresholds', items: [
      { k: 'wos_min', label: 'WOS 下限', type: 'range', min: 0.5, max: 8, step: .5, fmt: v => D(v, 1) + ' 周', desc: '低于下限触发覆盖不足预警' },
      { k: 'wos_max', label: 'WOS 上限', type: 'range', min: 6, max: 40, step: 1, fmt: v => v + ' 周', desc: '高于上限触发覆盖过高预警' },
      { k: 'turnover_min', label: '周转率下限', type: 'range', min: 1, max: 10, step: .5, fmt: v => D(v, 1) + ' 次/年', desc: '年化周转低于阈值触发预警' },
      { k: 'eo_ratio_max', label: 'E&O 占比阈值', type: 'range', min: .05, max: .5, step: .01, fmt: v => P(v, 0), desc: '单 SKU 冗余金额占比超过阈值触发预警' },
      { k: 'stale_days', label: '呆滞库龄阈值', type: 'range', min: 60, max: 365, step: 10, fmt: v => v + ' 天', desc: '批次库龄达到该天数计入 Obsolete' },
      { k: 'stale_no_move_weeks', label: '连续无动销阈值', type: 'range', min: 4, max: 26, step: 1, fmt: v => v + ' 周', desc: '整 SKU 连续无出库达该周数计入 Obsolete' },
      { k: 'provision_rate', label: '呆滞减值率', type: 'range', min: 0, max: 1, step: .05, fmt: v => P(v, 0), desc: 'Obsolete 计提比例，仅影响 E&O 金额' },
    ] },
    { title: '模型口径 · Model', items: [
      { k: 'review_period_weeks', label: '检查周期 P', type: 'range', min: 1, max: 4, step: 1, fmt: v => v + ' 周', desc: '周期性检查间隔，进入 ROP 与目标上限' },
      { k: 'horizon_weeks', label: '预测视野', type: 'range', min: 6, max: 20, step: 1, fmt: v => v + ' 周', desc: 'PA(t) 供需时间轴长度' },
      { k: 'moq', label: '最小订购量 MOQ', type: 'range', min: 1, max: 200, step: 1, fmt: v => v + ' 件', desc: '建议补货量不低于 MOQ，联网重算可执行量' },
      { k: 'pack', label: '包装倍数', type: 'range', min: 1, max: 100, step: 1, fmt: v => v + ' 件/包', desc: '建议补货量向上取整到该倍数' },
    ] },
    { title: '分类阈值 · Classification', items: [
      { k: 'xyz_cv_x', label: 'X 类 CV 上限', type: 'range', min: 0.1, max: 1.5, step: .05, fmt: v => D(v, 2), desc: '变异系数 σ_d / d̄ ≤ 该值且零需求周占比达标 → X 稳定类' },
      { k: 'xyz_cv_y', label: 'Y 类 CV 上限', type: 'range', min: .5, max: 3, step: .1, fmt: v => D(v, 1), desc: '超过该值判 Z 类；Z 类走经验分位数模型' },
      { k: 'xyz_zero_x', label: 'X 类零需求周上限', type: 'range', min: 0, max: .5, step: .01, fmt: v => P(v, 0), desc: '窗口内零需求周占比上限，用于识别间歇性' },
      { k: 'xyz_zero_y', label: 'Z 类零需求周阈值', type: 'range', min: .1, max: 1, step: .01, fmt: v => P(v, 0), desc: '超过该占比直接判 Z，避免 CV 在稀疏序列上失真' },
      { k: 'abc_cut_a', label: 'A 类累计占比', type: 'range', min: .5, max: .95, step: .01, fmt: v => P(v, 0), desc: '仅「按窗口消耗金额重算」模式生效，帕累托累计分界' },
      { k: 'abc_cut_b', label: 'B 类累计占比', type: 'range', min: .6, max: .99, step: .01, fmt: v => P(v, 0), desc: '剩余 SKU 归 C 类；窗口为当前需求统计窗口' },
    ] },
    { title: '供应商交期 · OTD 滚动', items: [
      { k: 'lead_source', label: '提前期取值口径', type: 'select', opts: [['contract', '契约主数据（基线）'], ['rolling', '实测滚动（样本达标全采信）'], ['blend', '收缩混合（向契约值收缩）']], desc: '默认契约值保证既有结论可复现；切换后 L / σ_L 按供应商实测交付重算 SS、ROP、目标上限与预警' },
      { k: 'otd_basis', label: 'OTD 判定基准', type: 'select', opts: [['eta', '确认 ETA（推荐）'], ['contract', '合同承诺日']], desc: '演示台账中承诺日往往早于确认 ETA（催交缓冲），故合同口径准时率显著偏低；两种口径都列出，判定基准只影响风险标记' },
      { k: 'otd_window_weeks', label: '滚动窗口', type: 'range', min: 4, max: 52, step: 1, fmt: v => v + ' 周', desc: '以库存快照日回溯的实收记录窗口；缩短窗口可观察近期表现变化' },
      { k: 'otd_min_samples', label: '最少交付笔数', type: 'range', min: 2, max: 30, step: 1, fmt: v => v + ' 笔', desc: 'rolling 模式下达到该笔数才全采信实测，否则按先验强度降权' },
      { k: 'otd_prior_strength', label: '收缩先验强度', type: 'range', min: 1, max: 40, step: 1, fmt: v => v + ' 笔', desc: 'w = n / (n + prior)；prior 越大越信任契约主数据，样本少时自动收缩' },
      { k: 'otd_grace_days', label: '准时宽限天数', type: 'range', min: 0, max: 7, step: 1, fmt: v => v + ' 天', desc: '实收日 ≤ 判定基准 + 宽限天数即视为准时' },
      { k: 'otd_tail', label: '右尾保护', type: 'select', opts: [['1', '开启：P90 反推等效 σ'], ['0', '关闭：仅用样本标准差']], desc: '延迟分布右偏，单用标准差会低估长尾；σ 取样本标准差与 (P90(L) − L̄)/z₉₀ 的较大者' },
      { k: 'otd_target', label: 'OTD 目标线', type: 'range', min: .7, max: .99, step: .01, fmt: v => P(v, 0), desc: '仅用于供应商风险标记，不参与 SS 公式' },
      { k: 'otd_drift_pct', label: '交期漂移预警线', type: 'range', min: .05, max: .6, step: .05, fmt: v => P(v, 0), desc: '实测 L 超过契约 L 该比例时标记「交期漂移」' },
    ] },
    { title: '金额与单位 · Currency & Units', items: [
      { k: 'currency', label: '金额币种', type: 'select', opts: Object.entries(E.CURRENCIES).map(([k, v]) => [k, k + ' · ' + v.name + ' ' + v.symbol]), desc: '由数据集 meta.currency（ISO 4217）声明，此处可覆盖。切换只改金额符号与导出元信息，不做汇率换算、不改变任何指标数值；导入自有数据请用 JSON 的 meta.currency 或 CSV 注释行 # currency= 指定' },
    ] },
  ];

  function impactHTML() {
    const b = E.compute(DATA, State.cfgDefault), c = State.result;
    // compute() 会把引擎当前币种切到基线配置；影响预览的金额须跟随「当前生效参数」
    E.setCurrency(c.params.currency);
    const ssSum = R => sum(R.skus.map(s => s.m.ss));
    const rows = [
      ['安全库存合计', ssSum(b), ssSum(c), v => Q(v) + ' 件'],
      ['触发补货 SKU', b.kpis.replenishSku, c.kpis.replenishSku, v => Q(v) + ' 个'],
      ['缺货风险 SKU', b.kpis.stockoutSku, c.kpis.stockoutSku, v => Q(v) + ' 个'],
      ['预警总数', b.alerts.length, c.alerts.length, v => Q(v) + ' 条'],
      ['E&O 金额', b.kpis.eoValue, c.kpis.eoValue, v => M(v)],
      ['加权 WOS', b.kpis.wosWeighted, c.kpis.wosWeighted, v => D(v) + ' 周'],
    ];
    return `<div class="impact">${rows.map(([n, a, bb, f]) => {
      const dv = (bb || 0) - (a || 0), same = Math.abs(dv) < 1e-6;
      return `<div><div class="i-label">${esc(n)}</div><div class="i-value">${f(bb)}</div>
        <div class="i-delta ${same ? 'flat' : dv > 0 ? 'up' : 'down'}">${same ? '与基线一致' : (dv > 0 ? '▲ +' : '▼ ') + f(Math.abs(dv)) + ' vs 基线'}</div></div>`;
    }).join('')}</div>`;
  }

  function paramRow(it) {
    const v = State.cfg[it.k], f = it.fmt || (x => x);
    let ctrl;
    if (it.type === 'select') {
      ctrl = `<select data-param="${it.k}" style="width:100%">${it.opts.map(o => `<option value="${o[0]}" ${String(v) === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    } else {
      ctrl = `<input type="range" data-param="${it.k}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}" style="width:100%"><div class="p-val" id="pv_${it.k}">${f(v)}</div>`;
    }
    return `<div class="param-row"><div><div class="p-name">${esc(it.label)} <span class="muted small">${esc(it.k)}</span></div><div class="p-desc">${esc(it.desc)}</div></div><div>${ctrl}</div></div>`;
  }

  function renderGuide() {
    const R = State.result, m = R.meta;
    setCount(`${R.skus.length} SKU · 参数 ${Object.keys(State.cfg).length} 项`);
    const cfgRows = Object.entries(State.cfg)
      .filter(([k]) => PARAM_GROUPS.some(g => g.items.some(i => i.k === k)))
      .map(([k, v]) => `<div><code>${esc(k)}</code><b>${esc(String(v))}</b></div>`).join('');
    let h = `<div class="callout"><b>参数改动只重算「建议值」</b>：SS、ROP、目标上限、预警、E&O、周转与 WOS 会即时重算；<b>已生成的库存台账（On-hand、批次、PO）保持不变</b>，符合 point-in-time 口径，避免用新参数改写历史事实。导入自有数据后同样适用。</div>`;
    h += `<div class="callout warn" style="margin-top:8px"><b>已知口径边界 · 接入实际业务前必读</b><br>
      1. 需求序列是公开交易数据的已实现出库量，缺货、弃单与替代购买背后的真实需求不可见（censored demand）；SS 的正态分位数不适用于间歇性需求 SKU。<br>
      2. CSL 是「一个补货周期内不缺货的概率」，与数量满足率 fill rate、按周现货可用率是三个不同指标，不可互相替代，也不可把后者当作 CSL 达成。<br>
      3. 金额默认是<b>估算成本额</b>（成交单价 × 成本率），非财务入账口径；使用真实成本请在导入模板提供 <code>unit_cost</code>，系统自动切到 supplied 口径。<br>
      4. PA(t) 以近窗周均作常数需求，不含季节性、不扣已承诺订单；ATP 目前仅在在途单据上标注是否计入，未提供按周可承诺量。<br>
      5. WOS 分子为可用量、不含在途；按单仓单供应商建模，未做多仓风险共担。差异化服务水平已支持（见「分类与服务水平」）：Z 类经验分位数取自 26 周窗口，样本不足会回退正态；经验分布同样无法还原被缺货截断的真实需求。<br>
      6. 演示台账由 (s,Q) 策略回放生成，回放参数取自全期统计量，存在前视偏差；不可用于评估策略本身的绩效达成。<br>
      7. 预警处置留痕仅存于本浏览器 localStorage，无多人协作、参数版本与不可篡改审计日志。<br>
      8. 供应商交付签收记录为按演示 OTD 目标生成的推导事实（SRM 口径），库存回放按到货周结算（WMS 周粒度），两者可能相差数日；接入实际业务须分别取收货单与上架单时间戳，并统一合同承诺日与 ASN 确认 ETA 的定义。实测样本仅覆盖可见 PO 台账，更早的历史交付未纳入统计。<br>
      9. 实测 σ̂ 用 P90 右尾反推等效正态 σ，仍是正态近似；对双峰 / 极端长尾交期应改用提前期经验分布卷积定 SS，不能把 OTD 百分比直接当 CSL。</div>`;
    h += `<div class="section-title">策略参数 <span class="en">Live recalculation</span></div>`;
    const isSeg = R.params.segment_csl === 'matrix';
    h += `<div class="callout" style="margin-bottom:10px"><b>当前服务水平策略：${isSeg ? 'ABC×XYZ 差异化矩阵' : '全局统一 ' + P(R.params.csl, 1)}</b>。
      ${isSeg ? `九宫格加权 CSL ${P(R.kpis.segmentSummary.cslWeighted, 1)}，其中 ${Q(R.kpis.segmentSummary.empiricalCount)} 个间歇 SKU 使用经验分位数。` : '全部 SKU 使用同一 CSL；可在下方切换为差异化策略。'}
      <button class="btn btn-xs" data-mode="${isSeg ? 'global' : 'matrix'}" style="margin-left:6px">切换为${isSeg ? '全局统一' : '差异化矩阵'}</button>
      <button class="btn btn-xs" data-gosegment="1" style="margin-left:4px">打开九宫格编辑</button></div>`;
    const ltSm = R.leadTimes.summary;
    h += `<div class="callout" style="margin-bottom:10px"><b>当前提前期取值：${esc(E.LEAD_SOURCES[R.params.lead_source])}</b>。
      滚动窗口 ${R.params.otd_window_weeks} 周内 ${Q(ltSm.inWindow)} 笔交付、OTD（确认 ETA）${P(ltSm.otdEtaRate, 1)}，
      相对契约基线 SS ${ltSigned(ltSm.ssDelta, ' 件')}（${M(ltSm.ssValueDelta)}）。
      默认契约模式不改写既有结论；切换口径后 L / σ_L 联动 SS、ROP、目标上限与预警。
      <button class="btn btn-xs" data-gosupplier="supplier" style="margin-left:6px">打开供应商交期与 OTD</button></div>`;
    h += `<div class="grid" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);margin-bottom:12px">
      <div>${PARAM_GROUPS.map(g => card(g.title, g.items.map(paramRow).join(''), null, null, true)).join('<div style="height:12px"></div>')}</div>
      <div style="align-self:start;position:sticky;top:60px">
        ${card('参数影响预览', `<div id="impactBox">${impactHTML()}</div><div class="chart-note">基线 = 本数据集默认参数（CSL 95%）。拖动滑块即可观察联动结果。</div>`, '当前 vs 基线',
          `<button class="btn btn-xs" id="btnResetParams">恢复默认</button>`, true)}
        ${card('当前生效参数', `<div class="param-kv">${cfgRows}</div><div class="chart-note">以上为本次会话生效值；筛选栏的服务水平 CSL 与此处联动，改动后所有视图统一重算。</div>`, null, null, true)}
      </div></div>`;

    h += `<div class="section-title">数据来源与溯源 <span class="en">Data provenance</span></div>`;
    h += `<div class="row2">${card('真实数据源', `<table class="tbl dict-table"><tbody>
      <tr><td>数据集</td><td>${esc(m.source)}</td></tr>
      <tr><td>官方页面</td><td><a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(m.source_url)}</a></td></tr>
      <tr><td>DOI / 许可</td><td>${esc(m.doi)} · ${esc(m.license)}</td></tr>
      <tr><td>发布者</td><td>${esc(m.publisher)}</td></tr>
      <tr><td>业务背景</td><td>${esc(m.description)}</td></tr>
      <tr><td>原始区间</td><td>${esc(m.raw_period[0])} ~ ${esc(m.raw_period[1])}（${Q(m.raw_rows)} 行）</td></tr>
      <tr><td>清洗后有效行</td><td>${Q(m.clean_rows)} 行（剔除取消单、退货、非商品码、零价与空品名）</td></tr>
      <tr><td>建模周期 / 快照日</td><td>${esc(m.weeks[0])} ~ ${esc(m.weeks[m.weeks.length - 1])} · 52 个完整周 / <b>${esc(m.snapshot_date)}</b></td></tr>
      <tr><td>样本规模</td><td>${Q(m.sku_count)} SKU · ${Q(m.po_count)} PO · 生成于 ${esc(m.generated_at)}</td></tr>
      <tr><td>金额币种</td><td title="${esc(m.currency_note || '')}"><b>${esc(R.params.currency)} (${esc(CS())})</b> · ${esc(E.currencyInfo(R.params.currency).name)} · 由 <code>meta.currency</code> 声明；全部金额为成本口径，不做汇率换算</td></tr>
      </tbody></table>`, null, null, true)}
      ${card('字段口径', `<table class="tbl dict-table"><tbody>
      <tr><td>真实字段</td><td><ul>${m.real_fields.map(x => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>
      <tr><td>推导字段</td><td><ul>${m.derived_fields.map(x => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>
      <tr><td>边界说明</td><td><ul>${m.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></td></tr>
      </tbody></table>`, null, null, true)}</div>`;

    h += `<div class="section-title">指标公式字典 <span class="en">Single source of truth · engine.js</span></div>` + card('全部指标口径', metricDictTable(), null, null, true);

    h += `<div class="section-title">接入实际业务数据 <span class="en">Import your own data</span></div>`;
    h += `<div class="row2">${card('导入方式', `<div class="callout" style="margin-bottom:10px"><b>CSV 模板</b>：一行一个 SKU，必填 <code>sku, description, on_hand, unit_price, lead_days, w1..w52</code>（52 周需求序列）；可选 <code>abc, unit_cost, category, warehouse, supplier, reserved, quarantine, blocked, avg_inventory_qty, lifecycle, lead_sd_days</code>。<br>提供 <code>abc</code> 则沿用 ERP 分级，留空则按窗口消耗金额帕累托自动重算；XYZ 始终由需求序列计算。<br>支持以 <code># snapshot_date=YYYY-MM-DD</code> 开头的元数据注释行来自定义快照日；<code># currency=CNY</code> 声明金额币种（JSON 方式用 <code>meta.currency</code>），缺省沿用当前数据集声明。导入后 PO / 批次按快照生成，指标引擎口径不变；工作台不做汇率换算，导入前请确保全部金额已是同一币种。</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-primary" data-do="import">选择 CSV / JSON 导入</button><button class="btn" data-do="template">下载 CSV 模板</button><button class="btn" data-do="restore">恢复演示数据</button></div>
      <div class="chart-note">JSON 方式：直接提供与 <code>assets/dataset.json</code> 相同结构的完整文件（含 skus / pos / meta / params），可保留完整 PO 与批次台账。CSV 方式适合快速接入 ERP 导出的库存快照 + 需求历史。</div>`, 'CSV / JSON')
      }${card('交互说明', `<div class="callout"><b>快捷键</b>：<span class="kbd">/</span> 聚焦检索 · <span class="kbd">Esc</span> 关闭明细抽屉<br><br>
      <b>筛选</b>：品类 / 仓库 / 供应商 / 分级（ABC 金额贡献 或 XYZ 需求波动）/ 严重度 / 状态 全局联动所有视图与 KPI。<br><br>
      <b>排序与下钻</b>：点击列头排序，点击任一行打开 SKU 明细（供需时间轴、批次库龄、指标代入过程、在途 PO）。<br><br>
      <b>导出</b>：右上角「导出 CSV」输出当前视图、当前筛选、当前排序的<b>全部行</b>（不受分页影响），含口径元数据注释行。<br><br>
      <b>预警处置</b>：经办人 / 原因代码 / 备注保存在浏览器本地，不上传。</div>`, '操作手册', null, true)}</div>`;
    return h;
  }

  /* ------------------------------------------------ 视图：分类与服务水平 ABC×XYZ */
  const CSL_OPTS = [0.85, 0.90, 0.95, 0.975, 0.99, 0.995];
  // 0.995 若用 toFixed(0) 会误显示 100%，先化到 0.1% 精度再决定是否保留小数
  const cslLabel = v => { const x = Math.round(v * 1000) / 10; return (Number.isInteger(x) ? x : x.toFixed(1)) + '%'; };
  const cslOpt = v => CSL_OPTS.map(o => `<option value="${o}" ${Math.abs(o - v) < 1e-9 ? 'selected' : ''}>${cslLabel(o)}</option>`).join('');
  const modelLabel = m => m === 'empirical' ? '经验分位' : m === 'normal_fallback' ? '正态（样本不足回退）' : '正态';

  function matrixEditorHTML() {
    const p = State.result.params;
    const head = '<tr><th>金额 \\ 波动</th><th>X · 稳定</th><th>Y · 波动</th><th>Z · 间歇</th></tr>';
    const rows = ['A', 'B', 'C'].map(a => `<tr><td>${a} 类</td>${['X', 'Y', 'Z'].map(x => {
      const key = a + x;
      return `<td><select data-seg="${key}" aria-label="${key} 服务水平">${cslOpt(p.csl_matrix[key])}</select></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="tbl matrix-editor"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="chart-note">改动后按下述口径即时重算：X / Y 类用正态分位数 <code>z·√(L·σ_d² + d̄²·σ_L²)</code>；Z 类用提前期总需求经验分布的 CSL 分位数。矩阵仅在「差异化」模式下生效，但可预先编辑。</div>
      <div class="hr"></div>
      <div class="mono-label" style="margin-bottom:6px">分类规则 · 当前阈值</div>
      <div class="table-wrap"><table class="tbl dict-table"><tbody>
        <tr><td>X 稳定</td><td>CV ≤ ${D(p.xyz_cv_x, 2)} 且 零需求周 ≤ ${P(p.xyz_zero_x, 0)}</td></tr>
        <tr><td>Y 波动</td><td>CV ≤ ${D(p.xyz_cv_y, 1)} 且 零需求周 ≤ ${P(p.xyz_zero_y, 0)}</td></tr>
        <tr><td>Z 间歇</td><td>其余或无需求样本；差异化模式下改用经验分位数</td></tr>
        <tr><td>ABC</td><td>${p.abc_mode === 'supplied' ? '主数据分级，缺失时按帕累托 ' + P(p.abc_cut_a, 0) + ' / ' + P(p.abc_cut_b, 0) + ' 重算' : '按窗口消耗金额帕累托 ' + P(p.abc_cut_a, 0) + ' / ' + P(p.abc_cut_b, 0)}</td></tr>
      </tbody></table></div>
      <div class="chart-note">分类在全部 SKU 上计算一次；筛选、排序、九宫格下钻都不会改变同一 SKU 的归类。样本窗口为近 ${p.demand_window_weeks} 周真实周需求。</div>`;
  }

  function segmentGridHTML(k) {
    const p = State.result.params, isGlobal = p.segment_csl !== 'matrix';
    return `<div class="seg-grid">${k.segments.map(g => {
      const preset = p.csl_matrix[g.key];
      const t = clamp((preset - 0.84) / 0.155, 0, 1);
      const bg = `rgba(44,110,203,${(0.015 + t * 0.085).toFixed(3)})`;
      return `<div class="seg-cell ${State.segmentFilter === g.key ? 'active' : ''} ${g.skus ? '' : 'empty'}"
        data-segfilter="${g.key}" style="background:${bg}" title="点击筛选该策略格的 SKU">
        <div class="seg-top"><span class="seg-key">${g.key}</span><span class="seg-csl">${isGlobal ? '预设' : 'CSL'} ${cslLabel(preset)}</span></div>
        <div class="seg-meta">${g.abc} 类 · ${E.SEGMENT_LABELS[g.xyz]}需求 · ${isGlobal ? '全局模式' : (g.model === 'empirical' ? '经验分位' : '正态模型')}</div>
        ${isGlobal ? `<div class="seg-meta" style="color:var(--ink-2)">当前生效 ${cslLabel(g.csl)}（统一口径）</div>` : ''}
        <div class="seg-stats">
          <div><span>SKU</span><b>${Q(g.skus)}</b></div><div><span>库存额</span><b>${M(g.onHandValue)}</b></div>
          <div><span>SS 合计</span><b>${Q(g.ss)}</b></div><div><span>待补货</span><b>${Q(g.replenish)}</b></div>
        </div></div>`;
    }).join('')}</div>`;
  }

  function strategyCompareHTML(g, m) {
    const cur = State.cfg.segment_csl === 'matrix' ? 'matrix' : 'global';
    const rows = [
      ['安全库存合计 / 件', g.kpis.segmentSummary.ssTotal, m.kpis.segmentSummary.ssTotal, v => Q(v)],
      ['安全库存资金占用', g.kpis.segmentSummary.ssValue, m.kpis.segmentSummary.ssValue, v => M(v)],
      ['触发补货 SKU', g.kpis.replenishSku, m.kpis.replenishSku, v => Q(v) + ' 个'],
      ['缺货风险 SKU', g.kpis.stockoutSku, m.kpis.stockoutSku, v => Q(v) + ' 个'],
      ['超储 SKU', g.kpis.overstockSku, m.kpis.overstockSku, v => Q(v) + ' 个'],
      ['例外预警总数', g.alerts.length, m.alerts.length, v => Q(v) + ' 条'],
      ['E&O 净敞口', g.kpis.eoValue, m.kpis.eoValue, v => M(v)],
      ['经验分位 SKU', g.kpis.segmentSummary.empiricalCount, m.kpis.segmentSummary.empiricalCount, v => Q(v) + ' 个'],
    ];
    return `<div class="table-wrap"><table class="tbl cmp-table"><thead><tr>
        <th>指标</th><th class="r">全局统一 ${cslLabel(State.result.params.csl)}</th>
        <th class="r">ABC×XYZ 差异化</th><th class="r">差异</th><th>说明</th></tr></thead><tbody>
      ${rows.map(([n, a, b, f], i) => {
        const dv = (b || 0) - (a || 0);
        const remarks = [
          '建议值，不改写库存台账', 'SS 件数 × 单位成本，估算资金占用', 'IP ≤ ROP 的 SKU 数',
          '提前期窗口内 PA 转负', 'On-hand > 目标上限', '全部规则合计',
          '目标上限随 SS 变化，故 E&O 会联动', 'Z 类中样本充足的 SKU 数',
        ];
        return `<tr class="${(cur === 'matrix' && i === 0) ? 'hl' : ''}"><td>${esc(n)}</td>
          <td class="r">${f(a)}</td><td class="r">${f(b)}</td>
          <td class="r ${dv > 0 ? 'neg' : dv < 0 ? 'pos' : 'muted'}">${Math.abs(dv) < 1e-6 ? '—' : (dv > 0 ? '+' : '−') + f(Math.abs(dv))}</td>
          <td class="small muted">${esc(remarks[i])}</td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="chart-note">两列均由指标引擎对<b>全量 SKU</b>独立计算，不受当前筛选影响；当前生效策略 = <b>${cur === 'matrix' ? 'ABC×XYZ 差异化' : '全局统一 ' + cslLabel(State.result.params.csl)}</b>。
      差异化并不必然降低总安全库存：Z 类改用经验分位数会如实承认间歇需求的厚尾风险，A 类提高保障也会增加占用，真正的变化是<b>资金在九宫格之间重新分配</b>。</div>`;
  }

  function renderSegment() {
    const d = data(), R = d.R, p = R.params, k = K(d.skus, d.pos), sm = k.segmentSummary;
    const isMatrix = p.segment_csl === 'matrix';
    // 两种策略各算一次，供 KPI 与对比表复用（全量 SKU，不受筛选影响）
    const cfgGlobal = Object.assign({}, State.cfg, { segment_csl: 'global' });
    const cmpG = E.compute(DATA, cfgGlobal);
    const cmpM = E.compute(DATA, Object.assign({}, cfgGlobal, { segment_csl: 'matrix' }));
    const usedCsl = k.segments.filter(x => x.skus).map(x => x.csl);
    const cslRange = usedCsl.length ? cslLabel(Math.min.apply(null, usedCsl)) + ' ~ ' + cslLabel(Math.max.apply(null, usedCsl)) : '—';
    let rows = d.skus;
    if (State.segmentFilter) rows = rows.filter(s => s.m.segment === State.segmentFilter);
    setCount(`${rows.length} / ${d.skus.length} SKU · 9 个策略格`);

    let h = `<div class="callout"><b>ABC×XYZ 差异化服务水平</b>：ABC 按金额贡献分级（默认取主数据，缺失时按当前窗口消耗金额帕累托重算）；XYZ 按近 ${p.demand_window_weeks} 周需求序列的
      变异系数 CV = σ_d / d̄ 与零需求周占比分级。X 稳定、Y 波动、Z 间歇。九宫格分别设定 CSL；<b>Z 类不套用正态分位数</b>，改由周需求经验分布做 ${'L + σ_L'} 周卷积求提前期总需求的 CSL 分位数（样本不足时回退正态）。
      分类在<b>全量 SKU</b> 上完成一次，筛选只影响展示，不会改变同一 SKU 的归类。</div>`;
    h += `<div class="mode-row" style="margin:10px 0 12px">
      <span class="mono-label">策略模式</span>
      <div class="seg"><button class="${!isMatrix ? 'active' : ''}" data-mode="global">全局统一 CSL</button>
      <button class="${isMatrix ? 'active' : ''}" data-mode="matrix">ABC×XYZ 差异化</button></div>
      ${State.segmentFilter ? `<button class="btn btn-xs" data-segfilter="">清除 ${esc(State.segmentFilter)} 下钻</button>` : ''}
      <span class="small muted">当前生效：${isMatrix ? '九宫格矩阵（加权 ' + P(sm.cslWeighted, 1) + '）' : '全局 ' + P(p.csl, 1) + ' · z=' + D(zFirst(R), 4)}</span></div>`;

    h += kpiRow([
      { label: '当前策略', value: isMatrix ? '差异化矩阵' : '全局统一', foot: `ABC 来源 <b>${sm.abcSource === 'supplied' ? '主数据' : '窗口重算'}</b> · Z 类 <b>${Q(sm.zSkus)}</b> 个 SKU`, bar: isMatrix ? 1 : .45 },
      { label: '安全库存合计', value: Q(sm.ssTotal), unit: '件', hint: '全部 SKU 的 SS 建议值合计', foot: `估算资金占用 <b>${M(sm.ssValue)}</b>`, bar: sm.ssTotal / Math.max(1, sm.ssTotal * 1.5) },
      { label: '经验分位模型', value: Q(sm.empiricalCount), unit: 'SKU', flag: sm.fallbackCount ? 'high' : '', foot: isMatrix ? `Z 类 <b>${Q(sm.zSkus)}</b> 个 · 样本不足回退 <b>${Q(sm.fallbackCount)}</b> 个` : `全局模式未启用 · 切换后预计 <b>${Q(cmpM.kpis.segmentSummary.empiricalCount)}</b> 个 SKU 改用经验分位`, bar: sm.zSkus ? sm.empiricalCount / sm.zSkus : 0 },
      { label: '矩阵加权 CSL', value: P(sm.cslWeighted, 1), hint: '按 SKU 数加权的当前生效 CSL 均值', foot: `生效范围 ${cslRange}`, bar: sm.cslWeighted },
    ]);

    h += `<div class="section-title">服务水平矩阵 <span class="en">3×3 segmentation · 点击格子下钻</span></div>`;
    h += `<div class="grid" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);margin-bottom:12px">
      ${card('九宫格分布与资金配置', segmentGridHTML(k) + `<div class="chart-note">${isMatrix ? '底色深浅表示生效 CSL 高低；' : '当前为全局统一模式，格内「预设」是矩阵档位、「当前生效」为统一 CSL，切换后矩阵档位才生效；底色按预设档位深浅绘制。'}SS 合计为该格建议安全库存件数；待补货为 IP ≤ ROP 的 SKU 数。当前筛选${State.segmentFilter ? '：<b>' + esc(State.segmentFilter) + '</b> 格' : '：全部'}。</div>`, 'SKU 数 / 库存额 / SS', null, true)}
      ${card('矩阵 CSL 编辑', matrixEditorHTML(), '即时重算', `<button class="btn btn-xs" id="btnMatrixReset">恢复默认矩阵</button>`, true)}</div>`;

    h += `<div class="section-title">策略影响对比 <span class="en">Global vs segmented · what-if</span></div>`;
    h += card('两种策略下的指标变化', strategyCompareHTML(cmpG, cmpM), '引擎独立复算 · 全量 SKU', null, true);

    h += `<div class="section-title">分类明细 <span class="en">SKU-level classification${State.segmentFilter ? ' · ' + esc(State.segmentFilter) : ''}</span></div>`;
    h += table('segmentDetail', [
      { k: 'id', label: 'SKU', value: s => s.id, render: s => `<span class="code">${esc(s.id)}</span>`, csv: s => s.id },
      { k: 'desc', label: '品名', w: 200, value: s => s.desc, render: s => `<div class="desc-cell" title="${esc(s.desc)}">${esc(s.desc)}</div>`, csv: s => s.desc },
      { k: 'segment', label: '策略格', value: s => s.m.segment, render: s => tag(s.m.segment, s.m.abc === 'A' ? 'medium' : 'low'), csv: s => s.m.segment },
      { k: 'cv', label: 'CV', align: 'r', value: s => s.m.cv, render: s => s.m.cv === null ? '<span class="muted">—</span>' : D(s.m.cv, 2), csv: s => s.m.cv === null ? '' : Math.round(s.m.cv * 100) / 100 },
      { k: 'zeroRate', label: '零需求周', align: 'r', value: s => s.m.zeroRate, render: s => P(s.m.zeroRate, 0), csv: s => Math.round(s.m.zeroRate * 100) + '%' },
      { k: 'demandValue', label: '年化消耗额', align: 'r', value: s => s.m.dbar * 52 * s.m.unitCost, render: s => M(s.m.dbar * 52 * s.m.unitCost), csv: s => Math.round(s.m.dbar * 52 * s.m.unitCost) },
      { k: 'cslEff', label: '生效 CSL', align: 'r', value: s => s.m.cslEff, render: s => cslLabel(s.m.cslEff), csv: s => Math.round(s.m.cslEff * 1000) / 10 + '%' },
      { k: 'ssModel', label: 'SS 模型', value: s => s.m.ssModel, render: s => `<span class="small">${esc(modelLabel(s.m.ssModel))}</span>`, csv: s => modelLabel(s.m.ssModel) },
      { k: 'ss', label: 'SS', align: 'r', value: s => s.m.ss, render: s => Q(s.m.ss), csv: s => Math.round(s.m.ss) },
      { k: 'ssNormal', label: '正态对照', align: 'r', value: s => s.m.ssNormal, render: s => `<span class="muted">${Q(s.m.ssNormal)}</span>`, csv: s => Math.round(s.m.ssNormal) },
      { k: 'rop', label: 'ROP', align: 'r', value: s => s.m.rop, render: s => Q(s.m.rop), csv: s => Math.round(s.m.rop) },
      { k: 'suggestQty', label: '可下单量', align: 'r', value: s => s.m.suggestQty, render: s => Q(s.m.suggestQty), csv: s => s.m.suggestQty },
    ], rows, { clickable: true, rowSku: s => s.id, exportName: 'ABC×XYZ分类' });
    return h;
  }
  /* ------------------------------------------------ 视图：供应商交期 · OTD 滚动 */
  const FALLBACK_LABEL = {
    contract_mode: '契约模式', no_deliveries: '窗口内无交付',
    insufficient_samples: '样本不足 · 已收缩', none: '实测生效',
  };
  const ltDay = (v, d) => v === null || v === undefined || !isFinite(v) ? '—' : D(v, d === undefined ? 1 : d) + ' 天';
  // 有符号数值：避免小负数被四舍五入成 "-0"；d=1 时保留一位小数（平均延迟）
  const ltSigned = (v, unit, d) => {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const x = d ? Math.round(v * 10) / 10 : Math.round(v);
    const s = d ? Math.abs(x).toFixed(d) : String(Math.abs(x));
    return (x > 0 ? '+' : x < 0 ? '−' : '') + s + (unit || '');
  };
  const LEAD_ADVICE = {
    OTD_LOW: '复核确认 ETA 准确性并催交；持续低于目标时评估备选源或上调该供应商 CSL',
    THIN_SAMPLE: '补足交付样本；当前按收缩权重取值，不宜据此做供应商考核',
    LEAD_DRIFT: '更新主数据 lead_days；重谈交期或同步调整补货参数',
  };

  function leadRiskTag(r) {
    if (!r.risks.length) return tag('达标', 'good');
    return r.risks.map(x => tag(E.RISK_LABELS[x] || x,
      x === 'OTD_LOW' ? 'critical' : x === 'LEAD_DRIFT' ? 'high' : 'medium')).join(' ');
  }

  function leadCompareHTML(cmp, cur) {
    const modes = ['contract', 'rolling', 'blend'];
    const metrics = [
      ['安全库存合计', r => r.leadTimes.summary.ssCurrent, v => Q(v) + ' 件', '全部 SKU 建议 SS 件数'],
      ['SS 资金占用', r => r.leadTimes.summary.ssValueCurrent, v => M(v), 'Σ SS × 单位成本（估算口径）'],
      ['平均生效 L', r => r.leadTimes.summary.avgLeadEffective, v => D(v, 1) + ' 天', '按 SKU 数加权的提前期均值'],
      ['平均生效 σ_L', r => r.leadTimes.summary.avgSdEffective, v => D(v, 2) + ' 天', '按 SKU 数加权的提前期标准差'],
      ['触发补货 SKU', r => r.kpis.replenishSku, v => Q(v) + ' 个', 'IP ≤ ROP'],
      ['缺货风险 SKU', r => r.kpis.stockoutSku, v => Q(v) + ' 个', '提前期窗口内 PA(t) < 0'],
      ['预警总数', r => r.alerts.length, v => Q(v) + ' 条', '全部规则合计'],
      ['E&O 净敞口', r => r.kpis.eoValue, v => M(v), '目标上限随 SS 联动'],
    ];
    return `<div class="table-wrap"><table class="tbl cmp-table"><thead><tr><th>指标</th>
      ${modes.map(m => `<th class="r">${esc(E.LEAD_SOURCES[m])}${m === cur ? ' · 生效' : ''}</th>`).join('')}
      <th class="r">滚动 − 契约</th><th>说明</th></tr></thead><tbody>
      ${metrics.map(([n, f, fmt, note]) => {
        const vals = modes.map(m => f(cmp[m]) || 0), dv = vals[1] - vals[0];
        return `<tr><td>${esc(n)}</td>${vals.map((v, i) =>
          `<td class="r ${modes[i] === cur ? 'cur' : ''}">${fmt(v)}</td>`).join('')}
          <td class="r ${Math.abs(dv) < 1e-6 ? 'muted' : dv > 0 ? 'neg' : 'pos'}">${Math.abs(dv) < 1e-6 ? '—' : (dv > 0 ? '+' : '−') + fmt(Math.abs(dv))}</td>
          <td class="small muted">${esc(note)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="chart-note">三列均由指标引擎对<b>全量 SKU</b>独立计算，不受当前筛选影响。
      实测口径不必然降低安全库存：L 的实测均值通常长于契约值、σ_L 的实测值通常更集中，两者对 SS 的作用方向相反；
      真正的变化是<b>缓冲按供应商实际表现重新分配</b>。</div>`;
  }

  function renderSupplier() {
    const R = State.result, p = R.params, lt = R.leadTimes, sm = lt.summary;
    const modes = ['contract', 'rolling', 'blend'];
    const cmp = {};
    modes.forEach(m => { cmp[m] = m === p.lead_source ? R : E.compute(DATA, Object.assign({}, State.cfg, { lead_source: m })); });
    const fSup = State.filters.supplier, focus = State.supplierFocus;
    const rows = lt.rows.filter(r => !fSup || r.id === fSup);
    const drows = lt.deliveries.filter(d => d.inWindow && (!fSup || d.supplier === fSup) && (!focus || d.supplier === focus))
      .slice().sort((a, b) => b.receipt_date.localeCompare(a.receipt_date) || b.po_id.localeCompare(a.po_id));
    setCount(`${rows.length} / ${lt.rows.length} 家供应商 · ${sm.inWindow} 笔滚动交付${focus ? ' · 已下钻 ' + focus : ''}`);
    const ssPct = sm.ssContract > 0 ? sm.ssDelta / sm.ssContract : null;

    let h = `<div class="callout"><b>供应商实测 OTD 滚动更新 L 与 σ_L</b>：从交付签收记录（下单日 → 合同承诺日 → 确认 ETA → 实收日）按供应商滚动统计，
      以 <code>L实测 = 平均(实收日 − 下单日)</code>、<code>σ实测 = max(样本标准差, (P90(L) − L实测) / z90)</code> 估计提前期及其波动，
      再生成生效 L / σ_L 代入 <code>SS = z·√(L·σ_d² + d²·σ_L²)</code> 与 <code>ROP = d·L + SS</code>（d 为周均需求）。
      窗口以快照日 <b>${esc(sm.windowEnd)}</b> 回溯 <b>${p.otd_window_weeks} 周</b>（${esc(sm.windowStart)} 起）；样本不足按 <code>w = n / (n + ${p.otd_prior_strength})</code> 向契约值收缩，
      实测均值钳制在契约值的 0.4~2.5 倍、σ 不超过 L。<b>默认「契约静态」不改写任何既有结论</b>；切换后全量重算建议值，库存台账仍保持 point-in-time。
      可见 PO 台账仅保留最近 14 周开具的单据，故窗口超过 14 周后样本数不再增加。</div>`;
    h += `<div class="callout warn" style="margin-top:8px"><b>OTD 口径提示</b>：默认按<b>确认 ETA</b>判定准时（实收 ≤ ETA + ${p.otd_grace_days} 天宽限）。
      演示台账中「合同承诺日」普遍早于确认 ETA 6~18 天（采购催交缓冲），因此合同口径 OTD <b>${P(sm.otdContractRate, 1)}</b> 显著低于 ETA 口径 <b>${P(sm.otdEtaRate, 1)}</b>。
      接入实际 SRM 时须先统一承诺日与 ASN 确认 ETA 的定义，否则同一批交付会得出完全不同的供应商评级与交期参数。</div>`;

    h += `<div class="mode-row" style="margin:10px 0 12px">
      <span class="mono-label">提前期口径</span>
      <div class="seg">${modes.map(m => `<button class="${p.lead_source === m ? 'active' : ''}" data-ltmode="${m}">${esc(E.LEAD_SOURCES[m])}</button>`).join('')}</div>
      <span class="small muted">判定基准 <b>${p.otd_basis === 'contract' ? '合同承诺日' : '确认 ETA'}</b> · 宽限 ${p.otd_grace_days} 天 · 右尾保护 ${p.otd_tail ? '开启' : '关闭'} · 生效 L 均值 ${D(sm.avgLeadEffective, 1)} 天</span>
      ${focus ? `<button class="btn btn-xs" data-ltsupplier="">清除 ${esc(focus)} 下钻</button>` : ''}
      <button class="btn btn-xs" data-gosupplier="guide">查看完整参数</button></div>`;

    h += kpiRow([
      { label: '当前生效口径', value: E.LEAD_SOURCES[p.lead_source], foot: `供应商 <b>${Q(sm.activeSuppliers)}/${Q(sm.suppliers)}</b> 家采用实测值 · 回退 <b>${Q(sm.fallbackCount)}</b> 家`, bar: sm.suppliers ? sm.activeSuppliers / sm.suppliers : 0 },
      { label: '滚动交付样本', value: Q(sm.inWindow), unit: '笔', foot: `台账共 <b>${Q(sm.deliveries)}</b> 笔 · 窗口 ${p.otd_window_weeks} 周`, bar: sm.deliveries ? sm.inWindow / sm.deliveries : 0 },
      { label: '实测 OTD · ' + (p.otd_basis === 'contract' ? '合同口径' : 'ETA 口径'), value: P(sm.otdRate, 1), flag: sm.otdRate !== null && sm.otdRate < p.otd_target ? 'high' : '', hint: '当前判定基准下的准时交付率，切换基准会改变评级', foot: `另一口径 <b>${P(p.otd_basis === 'contract' ? sm.otdEtaRate : sm.otdContractRate, 1)}</b> · 平均延迟 <b>${ltSigned(sm.avgDelay, ' 天', 1)}</b>`, bar: sm.otdRate, barCls: sm.otdRate !== null && sm.otdRate < p.otd_target ? 'warn' : '' },
      { label: 'SS 相对契约变化', value: (ssPct === null ? '—' : (sm.ssDelta > 0 ? '+' : '') + P(ssPct, 1)), flag: sm.ssDelta > 0 ? 'high' : sm.ssDelta < 0 ? 'good' : '', hint: '当前口径 SS 合计 vs 契约基线，同一 CSL 同一模型', foot: `<b>${ltSigned(sm.ssDelta, ' 件')}</b> · 资金 <b>${M(sm.ssValueDelta)}</b>`, bar: ssPct === null ? 0 : clamp(Math.abs(ssPct) * 4, 0, 1), barCls: sm.ssDelta > 0 ? 'warn' : '' },
    ]);

    const otdItems = lt.rows.map(r => ({
      label: r.id, value: r.otdBasisRate === null ? 0 : r.otdBasisRate,
      text: P(r.otdBasisRate, 1),
      color: r.otdBasisRate === null ? C.grey : r.otdBasisRate < p.otd_target ? C.red : C.green,
    }));
    const quickKeys = ['otd_basis', 'otd_window_weeks', 'otd_min_samples', 'otd_prior_strength', 'otd_grace_days'];
    const quickItems = PARAM_GROUPS.reduce((a, g) => a.concat(g.items), []).filter(i => quickKeys.indexOf(i.k) >= 0);
    h += `<div class="grid" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);margin-bottom:12px">
      ${card('滚动参数', quickItems.map(paramRow).join(''), '改动后全量重算', `<button class="btn btn-xs" data-gosupplier="guide">全部参数</button>`, true)}
      ${card('供应商 OTD 对比', hbars(otdItems) + `<div class="chart-note">按当前判定基准（${p.otd_basis === 'contract' ? '合同承诺日' : '确认 ETA'}）；红色为低于目标线 ${P(p.otd_target, 0)} 的供应商。条形长度按 0~100% 绝对刻度绘制。</div>`, '窗口内准时率', null, true)}</div>`;

    h += `<div class="section-title">供应商交付绩效 <span class="en">Delivery performance · rolling ${p.otd_window_weeks}w</span></div>`;
    if (rows.length) h += table('supplierPerf', [
      { k: 'id', label: '供应商', value: r => r.id, render: r => `<button class="btn-link" data-ltsupplier="${esc(r.id)}" title="下钻该供应商交付明细">${esc(r.id)}</button>`, csv: r => r.id },
      { k: 'skus', label: '在册 SKU', align: 'r', value: r => r.skus, render: r => Q(r.skus), csv: r => r.skus },
      { k: 'n', label: '交付笔数', align: 'r', value: r => r.n, render: r => Q(r.n), csv: r => r.n },
      { k: 'otdRate', label: 'OTD · ETA', align: 'r', value: r => r.otdRate, render: r => `<b>${P(r.otdRate, 1)}</b>`, csv: r => r.otdRate === null ? '' : Math.round(r.otdRate * 1000) / 10 + '%' },
      { k: 'otdContractRate', label: 'OTD · 合同', align: 'r', value: r => r.otdContractRate, render: r => `<span class="muted">${P(r.otdContractRate, 1)}</span>`, csv: r => r.otdContractRate === null ? '' : Math.round(r.otdContractRate * 1000) / 10 + '%' },
      { k: 'avgDelay', label: '平均延迟', align: 'r', value: r => r.avgDelay, render: r => ltSigned(r.avgDelay, ' 天', 1), csv: r => r.avgDelay === null ? '' : Math.round(r.avgDelay * 10) / 10 },
      { k: 'p90Delay', label: 'P90 延迟', align: 'r', value: r => r.p90Delay, render: r => ltSigned(r.p90Delay, ' 天'), csv: r => r.p90Delay },
      { k: 'maxLate', label: '最长延迟', align: 'r', value: r => r.maxLate, render: r => ltSigned(r.maxLate, ' 天'), csv: r => r.maxLate },
      { k: 'risks', label: '风险标记', value: r => r.risks.length, render: r => leadRiskTag(r), csv: r => r.risks.map(x => E.RISK_LABELS[x]).join(' / ') },
    ], rows, { noPage: true, exportName: '供应商交付绩效', footHint: '点击供应商代号下钻交付明细 · OTD 两种口径并列展示' });
    else h += `<div class="card"><div class="empty">当前筛选条件下无供应商</div></div>`;

    h += `<div class="section-title">提前期生效值对照 <span class="en">Contract vs observed vs effective L / σ_L</span></div>`;
    h += `<div class="card"><div class="card-head"><h3>从契约主数据到实测滚动</h3><span class="sub">天数口径 · Σσ 已含右尾保护</span></div><div class="table-wrap"><table class="tbl"><thead><tr>
      <th>供应商</th><th class="r">契约 L</th><th class="r">实测 L̄</th><th class="r">生效 L</th>
      <th class="r">契约 σ</th><th class="r">实测 σ</th><th class="r">右尾 σ</th><th class="r">生效 σ</th>
      <th class="r">权重 w</th><th class="r">ΔSS</th><th>取值依据</th></tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td><span class="code">${esc(r.id)}</span></td>
        <td class="r num">${ltDay(r.contractL, 0)}</td><td class="r num">${ltDay(r.obsL)}</td>
        <td class="r num"><b>${ltDay(r.effL)}</b></td>
        <td class="r num">${ltDay(r.contractSd, 0)}</td><td class="r num">${ltDay(r.obsSd)}</td>
        <td class="r num muted">${ltDay(r.sigmaTail, 2)}</td><td class="r num"><b>${ltDay(r.effSd, 2)}</b></td>
        <td class="r num">${D(r.weight, 2)}</td>
        <td class="r num ${r.ssDelta > 0 ? 'neg' : r.ssDelta < 0 ? 'pos' : 'muted'}">${ltSigned(r.ssDelta, ' 件')}</td>
        <td class="small">${esc(FALLBACK_LABEL[r.fallback] || r.fallback)}</td></tr>`).join('') ||
        '<tr><td colspan="11"><div class="empty">当前筛选条件下无供应商</div></td></tr>'}
      </tbody></table></div><div class="card-body" style="border-top:1px solid var(--line-soft);padding:8px 12px">
      <div class="chart-note" style="margin:0">实测 σ = max(样本标准差, (P90(L) − L实测)/z90)；权重 w 决定实测与契约的混合比例。
      ΔSS = 当前口径 SS 合计 − 契约口径 SS 合计（同一 CSL、同一模型，仅 L / σ_L 不同），由引擎按 SKU 汇总。</div></div></div>`;

    h += `<div class="section-title">策略影响对比 <span class="en">Three lead-time policies · what-if</span></div>`;
    h += card('三种提前期口径下的指标变化', leadCompareHTML(cmp, p.lead_source), '引擎独立复算 · 全量 SKU', null, true);

    const riskRows = lt.rows.filter(r => r.risks.length);
    h += `<div class="section-title">供应商风险清单 <span class="en">Action list · ${riskRows.length} suppliers</span></div>`;
    h += card('需跟进事项', riskRows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr>
      <th>供应商</th><th>风险</th><th class="r">OTD</th><th class="r">实测 L / 契约 L</th><th>建议动作</th></tr></thead><tbody>
      ${riskRows.map(r => `<tr><td><span class="code">${esc(r.id)}</span></td><td>${leadRiskTag(r)}</td>
        <td class="r num">${P(r.otdBasisRate, 1)}</td><td class="r num">${ltDay(r.obsL, 1)} / ${ltDay(r.contractL, 0)}</td>
        <td class="small">${r.risks.map(x => esc(LEAD_ADVICE[x] || x)).join('；')}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">当前窗口内没有触发风险阈值的供应商</div>',
      `目标线 ${P(p.otd_target, 0)} · 样本门槛 ${p.otd_min_samples} 笔 · 漂移线 ${P(p.otd_drift_pct, 0)}`, null, true);

    h += `<div class="section-title">交付实测明细 <span class="en">Receipt evidence${focus ? ' · ' + esc(focus) : ''}${fSup ? ' · 筛选 ' + esc(fSup) : ''}</span></div>`;
    h += table('deliveryDetail', [
      { k: 'po_id', label: 'PO 号', value: d => d.po_id, render: d => `<span class="code">${esc(d.po_id)}</span>`, csv: d => d.po_id },
      { k: 'sku', label: 'SKU', value: d => d.sku, render: d => `<span class="code">${esc(d.sku)}</span>`, csv: d => d.sku },
      { k: 'supplier', label: '供应商', value: d => d.supplier, render: d => esc(d.supplier), csv: d => d.supplier },
      { k: 'order_date', label: '下单日', value: d => d.order_date, render: d => `<span class="num">${esc(d.order_date)}</span>`, csv: d => d.order_date },
      { k: 'promise_date', label: '合同承诺', value: d => d.promise_date, render: d => `<span class="num">${esc(d.promise_date)}</span>`, csv: d => d.promise_date },
      { k: 'eta', label: '确认 ETA', value: d => d.eta, render: d => `<span class="num">${esc(d.eta)}</span>`, csv: d => d.eta },
      { k: 'receipt_date', label: '实收日', value: d => d.receipt_date, render: d => `<span class="num">${esc(d.receipt_date)}</span>`, csv: d => d.receipt_date },
      { k: 'leadActualDays', label: '实测 L', align: 'r', value: d => d.leadActualDays, render: d => Q(d.leadActualDays) + ' 天', csv: d => d.leadActualDays },
      { k: 'delayDays', label: '延迟/ETA', align: 'r', value: d => d.delayDays, render: d => `<span class="${d.delayDays > 0 ? 'neg' : 'pos'}">${ltSigned(d.delayDays, ' 天')}</span>`, csv: d => d.delayDays },
      { k: 'onTimeBasis', label: '准时判定', value: d => d.onTimeBasis ? 1 : 0, render: d => d.onTimeBasis ? tag('准时', 'good') : tag('延迟', 'critical'), csv: d => d.onTimeBasis ? '准时' : '延迟' },
    ], drows, { exportName: '供应商交付实测', footHint: '明细为交付签收事实；延迟、实测 L 与准时判定由引擎统一计算' });
    return h;
  }
  function zFirst(R) { return R.skus.length ? R.skus[0].m.z : 0; }

  /* ------------------------------------------------------------------ 视图：证据与局限 */
  const RED_LINES = [
    '不出真实采购单：「可下单补货量」是按 MOQ / 包装倍数取整的演示推导，须人工复核后再写入 ERP。',
    '不冒充企业库存：On-hand / PO / 批次 / 交付签收均由公开真实需求回放推导，不是任何企业的 ERP / WMS 记录。',
    '不做汇率换算：金额币种由 meta.currency 声明，切换只改符号与元信息；导入自有数据前须自行统一币种。',
    '不承诺降本时效：CSL 是策略参数而非服务水平达成率预测，本台不测算降本金额、不给执行时效承诺。',
  ];
  const VERIFY_SCRIPTS = [
    ['verify_engine.js', '2,920 项', '指标引擎全量口径与边界'],
    ['verify_otd.js', '2,295 项', '交付实测 / 滚动窗口 / 三模式 / 右尾保护'],
    ['verify_currency.js', '174 项', '币种声明优先级与数值不变'],
    ['verify_evidence.js', '—', '源文件 / 数据集 / 规则三类指纹与契约闭合'],
    ['verify_ui.mjs', '—', '12 视图零横向溢出与零控制台错误'],
    ['verify_ss.mjs', '—', '安全库存公式专项'],
    ['verify_import.mjs', '—', 'CSV 导入 → 全链路重算 → 恢复 → 处置闭环'],
    ['verify_audit.mjs', '—', '项目自查补充断言'],
    ['verify_segment.mjs', '—', 'ABC×XYZ 九宫格与经验分位数'],
    ['verify_otd_ui.mjs', '—', '供应商交期视图交互'],
    ['verify_currency_ui.mjs', '38 项', '币种切换 / 导出 / 导入 / 窄屏'],
    ['verify_evidence_ui.mjs', '—', '证据视图复算 / 导出 / 红线展示'],
  ];

  function limitsOf(R) {
    const m = R.meta, p = R.params, sm = R.leadTimes.summary, seg = R.kpis.segmentSummary;
    const ssSum = sum(R.skus.map(s => s.m.ss));
    const dl = (DATA.deliveries || []).length;
    const batches = sum(R.skus.map(s => (s.batches || []).length));
    return [
      { title: '观测销量是需求的删失代理，不是真实需求',
        fact: `原始 ${Q(m.raw_rows)} 行交易清洗后保留 ${Q(m.clean_rows)} 行（取消单、退货、零价、空品名剔除）。公开样本没有缺货暴露字段，缺货期间的潜在需求不可观测，销量会系统性低估需求与 σ_d。`,
        next: '接入 open_hours / out_of_stock_hours 等缺货暴露字段做删失恢复，再重估需求分布与 SS。' },
      { title: '库存台账是回放推导，不是企业真实库存',
        fact: `${Q(R.skus.length)} SKU、${Q(R.pos.length)} 张 PO、${Q(batches)} 个批次、${Q(dl)} 笔交付签收，全部由连续检查 (s,Q) 策略回放 ${Q((m.weeks || []).length)} 周真实需求生成。`,
        next: '用「导入自有数据」替换 ERP 库存快照、批次、PO 与收货单；指标引擎口径保持不变。' },
      { title: '单位成本是估算值，不是财务入账成本',
        fact: `当前成本率 ${P(p.cost_rate, 0)}，单位成本 = 真实成交单价 × 成本率；全部库存金额、COGS、E&O 均沿用该估算口径。`,
        next: '导入含 unit_cost 的 CSV / JSON 并切到 supplied 口径，与财务标准成本对齐后再看资金指标。' },
      { title: 'CSL ≠ fill rate ≠ 按周现货可用率',
        fact: `默认全局 CSL ${P(p.csl, 1)}（z = ${D(R.skus[0]?.m.z, 3)}），表示补货周期内不缺货概率；矩阵模式下另有九宫格差异化取值，${Q(seg.zSkus)} 个 Z 类 SKU 走经验分位数。`,
        next: '用实际预测误差分布替代正态假设，并把 CSL 目标与订单满足率分开验收。' },
      { title: '经验分位数受样本长度限制',
        fact: `需求统计窗口 ${Q(p.demand_window_weeks)} 周；样本 < 13 周或有效需求周 < 6 时回退正态，高分位数在小样本上外推会失真。`,
        next: '把窗口扩到 52 周并加 bootstrap 置信带，对 Z 类间歇需求改用负二项 / Croston 类模型。' },
      { title: '供应商 OTD 双口径差异会改变评级',
        fact: `窗口内 OTD（确认 ETA）${P(sm.otdEtaRate, 1)}，OTD（合同承诺日）${P(sm.otdContractRate, 1)}；演示台账的承诺日普遍早于确认 ETA 6~18 天（催交缓冲）。`,
        next: '接入 SRM 前先统一「合同承诺日」与「ASN 确认 ETA」定义，再决定供应商考核基准。' },
      { title: '交付签收是演示推导事实，粒度与库存回放不同',
        fact: `${Q(dl)} 笔签收按日生成、与已结案 PO 一一对应；库存回放按到货周上架结算（WMS 周粒度），两者可能相差数日。`,
        next: '真实接入时分别取收货单与上架单两个时间戳，不要把签收日直接当作可用日。' },
      { title: '可见 PO 只保留最近 14 周',
        fact: `滚动窗口可设到 ${Q(p.otd_window_weeks)} 周，但可见历史 PO 仅覆盖最近 14 周，窗口再拉长样本数不再增加。`,
        next: '接入完整历史采购订单表，再评估更长窗口的供应商交期漂移。' },
      { title: '单仓单供应商，没有多级库存风险共担',
        fact: '仓库 / 供应商代号仅作筛选与主数据分组，没有调拨、合单、多仓安全库存共享；所有 SS 按单节点独立计算。',
        next: '建立多仓网络与风险共担模型，区分中央仓与前置仓的服务水平目标。' },
      { title: 'PA(t) 用常数需求，WOS 不含在途',
        fact: `预计可用量按近窗周均需求推 ${Q(p.horizon_weeks)} 周，不计已承诺订单；WOS = 可用量 / 周均需求，与 PO 在途量分列。`,
        next: '改为 time-phased ATP，把已承诺订单、在途 ETA 与分批到货纳入同一时间轴。' },
      { title: '动销与呆滞判定并行使用三套窗口',
        fact: `动销 ${Q(p.active_window_weeks)} 周、连续无动销 ${Q(p.stale_no_move_weeks)} 周、库龄 ${Q(p.stale_days)} 天，三者口径独立、不共享同一张业务日历。`,
        next: '统一口径日历与参数生效日，避免同一 SKU 在不同窗口下被重复归类。' },
      { title: '预警处置留痕没有权限与不可篡改审计',
        fact: '确认 / 忽略记录仅存于本浏览器 localStorage，无用户身份、参数版本、生效日与签名。',
        next: '接审批系统，为每次处置记录参数快照 hash、规则版本与操作人。' },
      { title: '补货量是演示推导，未经人工复核不得下单',
        fact: `当前全局 SS 合计 ${Q(ssSum)} 件；建议量按 MOQ ${Q(p.moq)} 件、包装 ${Q(p.pack)} 件/包向上取整，未考虑预算、产能与合同约束。`,
        next: '把建议量导出为待复核清单，人工确认后写入 ERP；本台不生成采购单。' },
      { title: '未做大数据量压测',
        fact: `当前 ${Q(R.skus.length)} SKU / ${Q(R.pos.length)} PO，${VERIFY_SCRIPTS.length} 套回归脚本覆盖口径正确性，但没有万级 SKU 的渲染与计算耗时基准。`,
        next: '造 10,000 SKU 压测数据，测首屏时间、筛选重算耗时与内存峰值。' },
    ];
  }

  function renderEvidence() {
    const R = State.result, m = R.meta, p = R.params, ev = m.evidence || {}, S = State.evidence || {};
    const limits = limitsOf(R);
    setCount(`${limits.length} 条局限 · ${VERIFY_SCRIPTS.length} 套回归`);
    let h = `<div class="callout"><b>证据与局限是一等交付物</b>：数据契约、三类指纹与 ${limits.length} 条局限默认全部展开，不提供收起。
      每条局限都附一个已量化事实与一个具体下一步；指纹可在浏览器内当场重算，不依赖截图或口头声明。
      <button class="btn btn-xs" data-do="exportEvidence" style="margin-left:6px">导出待复核证据清单</button></div>`;
    h += kpiRow([
      { label: '源文件指纹', value: `<span class="hash" id="evSourceKpi">${esc(shortHash(ev.source_sha256))}</span>`, foot: `${esc(ev.source_file || '—')} · SHA-256 前 12 位` },
      { label: '数据集指纹', value: `<span class="hash" id="evDatasetKpi">${esc(shortHash(S.dataset || ev.dataset_sha256))}</span>`, foot: '构建期声明 · 浏览器可复算比对' },
      { label: '规则版本', value: `<span class="hash">${esc(ev.rule_version || '—')}</span>`, foot: `${esc(ev.rule_file || '—')} · ${esc(shortHash(ev.rule_sha256))}` },
      { label: '情景指纹', value: `<span class="hash" id="evScenarioKpi">${esc(shortHash(S.scenario))}</span>`, foot: '当前生效参数快照的 SHA-256 前 12 位' },
    ]);
    const contractRows = [
      ['数据来源', `${esc(m.source)} · ${esc(m.license)} · DOI ${esc(m.doi)}`],
      ['源文件 / 指纹', `<span class="hash">${esc(ev.source_file || '—')}</span> · SHA-256 <span class="hash">${esc(ev.source_sha256 || '—')}</span>`],
      ['原始 / 清洗', `${Q(m.raw_rows)} 行 → ${Q(m.clean_rows)} 行（剔除取消单、退货、非商品码、零价与空品名）`],
      ['真实区间 / 快照日', `${esc(m.raw_period[0])} ~ ${esc(m.raw_period[1])} · 快照 ${esc(m.snapshot_date)}`],
      ['样本规模', `${Q(R.skus.length)} SKU · ${Q(R.pos.length)} PO · ${Q((DATA.deliveries || []).length)} 笔交付签收 · ${Q((m.weeks || []).length)} 周`],
      ['金额币种', `<b>${esc(p.currency)} (${esc(CS())})</b> · 由 meta.currency 声明，不做汇率换算`],
      ['生成时间 / 构建', `${esc(m.generated_at)} · ${esc(ev.hash_algorithm || 'SHA-256')} / ${esc(ev.hash_scope || '规范化 JSON')}`],
      ['真实字段', `${Q((m.real_fields || []).length)} 组 · 完整清单见「参数与口径 → 字段口径」`],
      ['推导字段', `${Q((m.derived_fields || []).length)} 组，逐项登记在「参数与口径 → 字段口径」`],
    ];
    h += `<div class="row2">${card('数据契约', `<div class="table-wrap"><table class="tbl dict-table"><tbody>` +
      contractRows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + `</tbody></table></div>`, 'Data contract', null, true)
      }${card('自己验一遍 · 数据集指纹', `<div class="ev-recheck">
        <div class="chart-note" style="margin:0 0 8px">构建期把「不含 meta.evidence 的规范化 JSON」取 SHA-256 写入数据集。点击下面按钮，浏览器按相同规则重新序列化并比对；不是展示预置结论，而是当场重算。</div>
        <button class="btn btn-primary" data-do="recheckEvidence">重算并比对</button>
        <div class="ev-check" id="evCheckState">正在计算…</div>
        <table class="tbl dict-table" style="margin-top:8px"><tbody>
          <tr><td>浏览器复算</td><td><span class="hash" id="evDatasetFull">—</span></td></tr>
          <tr><td>构建期声明</td><td><span class="hash" id="evDatasetDeclared">${esc(ev.dataset_sha256 || '—')}</span></td></tr>
          <tr><td>规范化字节数</td><td><span id="evDatasetBytes">—</span>（声明 <span class="num">${ev.dataset_bytes === undefined ? '—' : Q(ev.dataset_bytes)}</span>）</td></tr>
          <tr><td>情景指纹（全值）</td><td><span class="hash" id="evScenarioFull">—</span></td></tr>
        </tbody></table></div>`, 'Recompute in browser', null, true)}</div>`;

    h += `<div class="section-title">局限清单 <span class="en">Known limits · ${limits.length} items · 默认展开，不提供收起</span></div>`;
    h += card('逐条事实与下一步', `<div class="ev-limits">${limits.map((x, i) => `<div class="ev-limit">
      <div class="ev-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="ev-body"><div class="ev-title">${esc(x.title)}</div>
        <div class="ev-fact"><span class="ev-tag">已量化事实</span>${esc(x.fact)}</div>
        <div class="ev-next"><span class="ev-tag">具体下一步</span>${esc(x.next)}</div></div>
    </div>`).join('')}</div>`, '每条 = 事实 + 下一步', null, true);

    h += `<div class="row2">${card('红线声明', `<ol class="ev-red">${RED_LINES.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`, '与作品集口径一致', null, true)
      }${card('复现与验证', `<div class="table-wrap"><table class="tbl"><thead><tr><th>脚本</th><th>规模</th><th>覆盖范围</th></tr></thead><tbody>` +
      VERIFY_SCRIPTS.map(r => `<tr><td class="code">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('') +
      `</tbody></table></div><div class="chart-note">运行：<code>node scripts/verify_engine.js</code>（纯 Node）；浏览器类脚本需先起静态服务 <code>python3 -m http.server 8765</code> 与 Chrome 调试端口 <code>9333</code>。本台纯前端、无外部请求，<code>file://</code> 双击可直接打开。</div>`, `${VERIFY_SCRIPTS.length} 套`, null, true)}</div>`;
    return h;
  }

  function exportEvidence() {
    const R = State.result, m = R.meta, p = R.params, ev = m.evidence || {}, S = State.evidence || {};
    const limits = limitsOf(R);
    const kv = [
      ['# 库存控制工作台 / Inventory Control Workbench · 待复核证据清单'],
      ['# 本清单是证据快照，不是采购单；建议补货量须人工复核后写入 ERP'],
      [`# 导出时间: ${tsLocal(true)}`],
      ['键', '值', '备注'],
      ['snapshot_date', m.snapshot_date, '库存快照日（point-in-time，参数调整不改写台账）'],
      ['data_source', m.source, `${m.license} / DOI ${m.doi}`],
      ['source_file', ev.source_file || '', 'UCI 原始 Excel'],
      ['source_sha256', ev.source_sha256 || '', '构建期对源文件取 SHA-256'],
      ['dataset_sha256_declared', S.declared || ev.dataset_sha256 || '', '构建期声明'],
      ['dataset_sha256_recomputed', S.dataset || '', S.unsupported ? '当前环境不支持 Web Crypto' : '浏览器当场复算'],
      ['dataset_hash_match', S.match === null || S.match === undefined ? 'N/A' : (S.match ? 'MATCH' : 'MISMATCH'), '规范化 JSON 逐位比对'],
      ['dataset_bytes', S.bytes === undefined ? '' : S.bytes, '规范化 JSON 字节数'],
      ['rule_version', ev.rule_version || '', '引擎语义版本'],
      ['rule_sha256', ev.rule_sha256 || '', 'assets/engine.js 文件指纹'],
      ['scenario_sha256', S.scenario || '', '当前生效参数快照指纹'],
      ['currency', p.currency, `${CS()} · 不做汇率换算`],
      ['sku_count', R.skus.length, ''],
      ['po_count', R.pos.length, ''],
      ['delivery_count', (DATA.deliveries || []).length, '交付签收记录'],
      ['ss_total_pcs', Math.round(sum(R.skus.map(s => s.m.ss))), '全局安全库存合计（件）'],
      ['alert_count', R.alerts.length, ''],
      ['limits_count', limits.length, '局限条目数（全部默认展开）'],
      ['verify_scripts', VERIFY_SCRIPTS.length, '回归脚本套数'],
      ['# 策略参数快照'],
    ];
    Object.keys(p).sort().forEach(k => {
      const v = p[k];
      kv.push(['param.' + k, typeof v === 'object' ? canonical(v) : v, '']);
    });
    kv.push(['# 局限清单']);
    kv.push(['序号', '局限', '已量化事实', '具体下一步']);
    limits.forEach((x, i) => kv.push([String(i + 1).padStart(2, '0'), x.title, x.fact, x.next]));
    kv.push(['# 红线声明']);
    RED_LINES.forEach((x, i) => kv.push(['R' + (i + 1), x, '', '']));
    const text = '\ufeff' + kv.map(r => r.length === 1 ? '# ' + r[0].replace(/^#\s*/, '') : r.map(csvCell).join(',')).join('\r\n');
    download('ICW_evidence_handoff.csv', text, 'text/csv;charset=utf-8');
    toast(`已导出证据清单 · ${limits.length} 条局限 · 指纹 ${S.match ? '一致' : '未通过'}`);
  }

  const VIEWS = {
    overview: { t: '库存控制总览', en: 'Inventory Control Overview', c: '总览', d: '基于真实交易回放的库存快照 · 全部指标按当前策略参数实时重算', fn: renderOverview },
    alerts: { t: '预警中心', en: 'Exception Center', c: '预警中心', d: '按严重度排序的例外清单 · 支持经办、原因代码与闭环留痕', fn: renderAlerts },
    inventory: { t: '库存台账', en: 'Inventory Ledger', c: '库存台账', d: 'On-hand / 可用 / 在途 / IP / SS / ROP / WOS / 周转 / 库龄 一览', fn: renderInventory },
    purchase: { t: '采购订单', en: 'Purchase Orders', c: '采购订单', d: 'PO 全生命周期状态、承诺交期、ETA 与逾期诊断', fn: renderPurchase },
    transit: { t: '在途追踪', en: 'In-transit Tracking', c: '在途追踪', d: '未清单据、发运 / ETA / 交期偏差与可承诺量口径', fn: renderTransit },
    aging: { t: '库龄分析', en: 'Inventory Aging', c: '库龄分析', d: '批次层库龄分桶 · FIFO 扣减 · 呆滞识别', fn: renderAging },
    excess: { t: '冗余与 E&O', en: 'Excess & Obsolete', c: '冗余与 E&O', d: 'Obsolete 与 Excess 互斥拆解、资金占用与处置建议', fn: renderExcess },
    metrics: { t: '绩效分析', en: 'Performance Analysis', c: '绩效分析', d: '周转 / DIO / 动销率 / WOS / CSL 达成与品类、ABC 对比', fn: renderMetrics },
    segment: { t: '分类与服务水平', en: 'ABC×XYZ Segmentation', c: '分类与服务水平', d: '按金额贡献 × 需求波动九宫格设定 CSL，间歇需求用经验分位数定 SS', fn: renderSegment },
    supplier: { t: '供应商交期与 OTD', en: 'Supplier Lead Time & OTD', c: '供应商交期', d: '以交付签收实测滚动更新 L 与 σ_L，联动 SS / ROP 与缓冲资金配置', fn: renderSupplier },
    guide: { t: '参数与口径', en: 'Parameters & Methodology', c: '参数与口径', d: '策略参数、公式字典、数据来源与自有数据接入', fn: renderGuide },
    evidence: { t: '证据与局限', en: 'Evidence & Known Limits', c: '证据与局限', d: '数据契约与三类指纹可当场复算 · 局限默认全部展开 · 红线与复现路径', fn: renderEvidence },
  };

  function footnote() {
    const m = State.result.meta, p = State.result.params;
    return `<div class="fn-title">Data &amp; Methodology</div>
      <b>数据来源</b>：${esc(m.source)} · <a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(m.source_url)}</a> · ${esc(m.license)} · DOI ${esc(m.doi)}。
      原始 ${Q(m.raw_rows)} 行真实交易（${esc(m.raw_period[0])} ~ ${esc(m.raw_period[1])}），清洗后 ${Q(m.clean_rows)} 行；库存快照日 <b>${esc(m.snapshot_date)}</b>。<br>
      <b>口径</b>：需求与商品主数据来自真实交易；On-hand / 批次 / PO / 在途 / 供应商代号与提前期为按 (s,Q) 策略回放真实需求生成的演示台账，非任何企业真实库存记录。
      当前服务水平策略 ${p.segment_csl === 'matrix' ? 'ABC×XYZ 差异化九宫格（全局对照 CSL ' + P(p.csl, 1) + ' · Z 类经验分位数）' : '全局统一 CSL ' + P(p.csl, 1) + '（z=' + D(State.result.skus[0]?.m.z, 3) + '）'}、成本率 ${P(p.cost_rate, 0)}、提前期系数 ${D(p.lead_factor, 1)}×、
      提前期取值 <b>${esc(E.LEAD_SOURCES[p.lead_source])}</b>（滚动窗口 ${p.otd_window_weeks} 周 · ${p.otd_basis === 'contract' ? '合同承诺日' : '确认 ETA'} 判定 OTD）。
      供应商交付签收记录为按演示 OTD 目标生成的推导事实，与库存回放按周到账分属不同粒度，切换口径只重算建议值、不改写台账。
      <b>全部指标由 engine.js 单一计算源产出，分母为零或样本不足显示「—」。</b> 接入实际业务请到「参数与口径 → 导入自有数据」。`;
  }

  /* ------------------------------------------------------------------ SKU 明细抽屉 */
  function openDrawer(id) {
    const R = State.result, s = R.skus.find(x => x.id === id);
    if (!s) return;
    State.drawerSku = id;
    const m = s.m, p = R.params, snap = R.meta.snapshot_date;
    const pos = R.pos.filter(x => x.sku === id && x.status !== 'CLOSED');
    const alerts = R.alerts.filter(a => a.sku === id);
    const grid = [
      ['On-hand 现货', Q(m.onHand)], ['可用 Available', Q(m.available)], ['状态桶合计', Q(m.reserved + m.quarantine + m.blocked)],
      ['在途 In-transit', Q(m.inTransit)], ['未发运', Q(m.notShipped)], ['库存位置 IP', Q(m.ip)],
      ['安全库存 SS', Q(m.ss)], ['补货点 ROP', Q(m.rop)], ['目标上限', Q(m.maxTarget)],
      ['WOS', m.wos === null ? '—' : D(m.wos) + ' 周'], ['周转/年', D(m.turnoverAnnual)], ['平均库龄', m.weightedAge === null ? '—' : D(m.weightedAge, 0) + ' 天'],
      ['E&O 金额', M(m.eoValue)], ['Obsolete', Q(m.obsolete)], ['Excess', Q(m.excess)],
      ['单位成本', CS() + D(m.unitCost, 2) + (m.costSource === 'estimated' ? ' *估' : ' 实')], ['需求波动 σ_d', D(m.sd) + ' 件/周'],
      ['可下单补货量', Q(m.suggestQty) + ' 件'],
      ['策略格 ABC×XYZ', m.segment], ['生效 CSL', cslLabel(m.cslEff)], ['SS 模型', modelLabel(m.ssModel)],
      ['生效提前期 L', D(m.leadDays, 1) + ' 天'], ['生效 σ_L', D(m.leadSdDays, 2) + ' 天'],
      ['提前期取值口径', E.LEAD_SOURCES[m.leadSource] || m.leadSource], ['供应商 OTD', P(m.supplierOtd, 1)],
    ];
    const labels = [], pa = m.pa, receipts = m.receipts;
    for (let i = 0; i < pa.length; i++) labels.push(dateAdd(snap, i * 7).slice(5));
    const paChart = comboChart({
      labels, height: 185,
      bars: [{ name: '计划到货', values: receipts, color: '#c9dcec' }],
      series: [{ name: '预计可用量 PA(t)', values: pa, color: m.minPa < 0 ? C.red : C.ink, width: 1.9, dots: true }],
      refs: [
        { value: 0, color: C.red, label: '缺货线 0' },
        { value: m.ss, color: C.amber, label: 'SS ' + Q(m.ss) },
      ],
      yFmt: v => shortNum(v), tipFmt: v => Q(v), xTicks: 8,
    });
    const batchRows = s.batches.slice().sort((a, b) => b.age_days - a.age_days).map(b => `<tr>
      <td class="code">${esc(b.id)}</td><td class="num">${esc(b.date)}</td><td class="r num">${Q(b.age_days)}</td>
      <td class="r num">${Q(b.qty)}</td><td class="r num">${M(b.qty * m.unitCost)}</td>
      <td>${b.age_days >= p.stale_days || s.lifecycle === 'PHASE_OUT' ? tag('呆滞', 'critical') : tag('正常', 'good')}</td></tr>`).join('');
    const poRows = pos.map(x => `<tr><td class="code">${esc(x.id)}</td><td class="num">${esc(x.eta)}</td><td class="r num">${Q(x.qty - x.received_qty)}</td><td>${statusTag(x.status)}</td></tr>`).join('') ||
      '<tr><td colspan="4" class="muted" style="padding:10px">无未清采购订单</td></tr>';
    const ltRow = (R.leadTimes.byId || {})[s.supplier] || null;
    const supDeliveries = (R.leadTimes.deliveries || []).filter(x => x.supplier === s.supplier && x.inWindow)
      .slice().sort((a, b) => b.receipt_date.localeCompare(a.receipt_date)).slice(0, 5);
    const leadProvHTML = `<div class="drawer-section"><h4>供应商交期依据 <span class="en">Lead-time provenance</span></h4>
      <table class="tbl dict-table"><tbody>
      <tr><td>供应商 / 窗口样本</td><td><b>${esc(s.supplier)}</b> · ${ltRow ? Q(ltRow.n) + ' 笔交付（近 ' + p.otd_window_weeks + ' 周）' : '无交付样本'}</td></tr>
      <tr><td>契约主数据</td><td>L = ${D(m.leadDaysContract, 0)} 天 · σ_L = ${D(m.leadSdDaysContract, 0)} 天</td></tr>
      <tr><td>实测统计</td><td>L̄ = ${ltRow && ltRow.obsL !== null ? D(ltRow.obsL, 1) + ' 天' : '—'} · σ̂ = ${ltRow && ltRow.sigmaUsed !== null ? D(ltRow.sigmaUsed, 2) + ' 天' : '—'}（含右尾保护 ${ltRow && ltRow.sigmaTail !== null ? D(ltRow.sigmaTail, 2) : '—'} 天）</td></tr>
      <tr><td>生效值</td><td><b>L = ${D(m.leadDays, 1)} 天 · σ_L = ${D(m.leadSdDays, 2)} 天</b> · 口径 <b>${esc(E.LEAD_SOURCES[m.leadSource] || m.leadSource)}</b> · 权重 w = ${D(m.leadWeight, 2)} · ${esc(FALLBACK_LABEL[m.leadFallback] || m.leadFallback)}</td></tr>
      <tr><td>供应商 OTD</td><td>确认 ETA ${P(ltRow ? ltRow.otdRate : null, 1)} / 合同承诺 ${P(ltRow ? ltRow.otdContractRate : null, 1)} · 当前判定 ${P(m.supplierOtd, 1)}</td></tr>
      <tr><td>SS 口径差异</td><td>当前 ${Q(m.ss)} 件 vs 契约 ${Q(m.ssContract)} 件 · Δ ${ltSigned(m.ssDelta, ' 件')}</td></tr>
      </tbody></table>
      ${supDeliveries.length ? `<table class="tbl" style="margin-top:8px"><thead><tr><th>最近交付</th><th>确认 ETA</th><th>实收日</th><th class="r">实测 L</th><th class="r">延迟</th></tr></thead><tbody>
        ${supDeliveries.map(d => `<tr><td class="code">${esc(d.po_id)}</td><td class="num">${esc(d.eta)}</td><td class="num">${esc(d.receipt_date)}</td>
          <td class="r num">${Q(d.leadActualDays)} 天</td><td class="r num ${d.delayDays > 0 ? 'neg' : 'pos'}">${ltSigned(d.delayDays, ' 天')}</td></tr>`).join('')}
        </tbody></table>` : '<div class="chart-note">该供应商在滚动窗口内无交付签收记录，已回退契约主数据。</div>'}</div>`;
    const alertRows = alerts.map(a => `<div class="stat-row" style="grid-template-columns:auto 1fr auto"><div>${sevTag(a.severity)}</div><div class="lbl">${esc(a.name)}</div><div class="val">${esc(a.note)}</div></div>`).join('') || '<div class="empty">该 SKU 当前无预警</div>';

    $('#drawer').innerHTML = `
      <div class="drawer-head"><div>
        <div class="code">${esc(s.id)} <span class="muted">/ ${esc(s.category)} / ${esc(s.warehouse)} / ${esc(s.supplier)}</span></div>
        <h2>${esc(s.desc)}</h2>
        <div class="tags" style="margin-top:6px">${tag('策略格 ' + m.segment, m.abc === 'A' ? 'medium' : 'low')}
          ${tag('XYZ ' + m.xyz + ' · ' + E.SEGMENT_LABELS[m.xyz], m.xyz === 'Z' ? 'high' : 'low')}
          ${tag('CSL ' + cslLabel(m.cslEff), 'outline')}
          ${s.lifecycle === 'PHASE_OUT' ? tag('停售 PHASE-OUT', 'critical') : tag('在售', 'good')}${tagsFor(m)}</div>
      </div><button class="btn btn-xs close" data-close="1">关闭 Esc</button></div>
      <div class="drawer-body">
        <div class="drawer-section"><h4>关键指标 <span class="en">Snapshot metrics</span></h4>
          <div class="metric-grid">${grid.map(g => `<div><div class="m-label">${esc(g[0])}</div><div class="m-value">${g[1]}</div></div>`).join('')}</div></div>
        <div class="drawer-section"><h4>供需时间轴 <span class="en">Projected Available Balance PA(t) · ${p.horizon_weeks} 周</span></h4>
          ${paChart}${legend([{ label: '预计可用量', color: C.ink, line: 1 }, { label: '计划到货', color: '#c9dcec' }, { label: '安全库存线', color: C.amber, line: 1 }])}
          <div class="chart-note">预测需求基准 = 近 ${p.demand_window_weeks} 周周均 ${D(m.dbar)} 件（history，非预测模型）；${m.stockoutDate ? `<span class="neg">预计 ${esc(m.stockoutDate)} 当周出现缺口，提前期窗口最低 PA = ${Q(m.minPaInLead)} 件</span>（全视野最低 ${Q(m.minPa)} 件）` : '预测视野内未出现负可用量'}。</div></div>
        <div class="drawer-section"><h4>分类与服务水平依据 <span class="en">Segment rationale</span></h4>
          <table class="tbl dict-table"><tbody>
          <tr><td>策略格</td><td><b>${esc(m.segment)}</b> = ${m.abc} 类（${m.abcSource === 'supplied' ? '主数据分级' : '按窗口消耗金额帕累托重算'}） × ${m.xyz} 类（${E.SEGMENT_LABELS[m.xyz]}需求）</td></tr>
          <tr><td>消耗金额</td><td>年化 ${M(m.dbar * 52 * m.unitCost)} = 周均 ${D(m.dbar)} 件 × 52 × 单位成本 ${CS()}${D(m.unitCost, 2)}（成本口径，非销售额）</td></tr>
          <tr><td>XYZ 判定</td><td>CV = σ_d / d̄ = ${m.cv === null ? '—（无需求样本）' : D(m.cv, 2)}（X ≤ ${D(p.xyz_cv_x, 2)} / Y ≤ ${D(p.xyz_cv_y, 1)}）；零需求周占比 ${P(m.zeroRate, 0)}（X ≤ ${P(p.xyz_zero_x, 0)} / Z &gt; ${P(p.xyz_zero_y, 0)}）→ <b>${m.xyz}</b></td></tr>
          <tr><td>生效 CSL</td><td><b>${cslLabel(m.cslEff)}</b>（z = ${D(m.z, 4)}）· 来源：${p.segment_csl === 'matrix' ? '九宫格矩阵 [' + esc(m.segment) + ']' : '全局统一策略'}</td></tr>
          <tr><td>SS 模型</td><td>${esc(modelLabel(m.ssModel))}${m.ssModel === 'empirical' ? '：间歇需求不套用正态分位数，改由提前期总需求经验分布定 SS' : ''}</td></tr>
          </tbody></table></div>
        ${leadProvHTML}
        <div class="drawer-section"><h4>指标代入过程 <span class="en">Calculation trace</span></h4>
          <div class="formula">d̄ = ${D(m.dbar)} 件/周   σ_d = ${D(m.sd)}   L = ${m.L} 周   σ_L = ${D(m.Lsd, 2)} 周   z = ${D(m.z, 4)} (CSL ${cslLabel(m.cslEff)})
<span class="cm">// L / σ_L 来源：${esc(E.LEAD_SOURCES[m.leadSource] || m.leadSource)}（${D(m.leadDays, 1)} 天 / ${D(m.leadSdDays, 2)} 天）；契约 ${D(m.leadDaysContract, 0)} 天 / ${D(m.leadSdDaysContract, 0)} 天 · 系数 ${D(p.lead_factor, 1)}×</span>
${m.ssModel === 'empirical'
            ? `<b>SS</b>  = Q_LTD(${cslLabel(m.cslEff)}) − d̄·L = ${Q(m.qLtd)} − ${Q(m.dbar * m.L)} = ${Q(m.ss)} 件\n<span class="cm">// Q_LTD：近 ${p.demand_window_weeks} 周周需求经验分布做 L+σ_L = ${D(m.L + m.Lsd, 2)} 周离散卷积求分位数；正态式对照 ${Q(m.ssNormal)} 件</span>`
            : `<b>SS</b>  = z · √(L·σ_d² + d̄²·σ_L²) = ${Q(m.ss)} 件${m.ssModel === 'normal_fallback' ? '\n<span class="cm">// Z 类样本不足，经验分位数回退正态式</span>' : ''}`}
<b>ROP</b> = d̄·L + SS = ${Q(m.rop)} 件
<b>IP</b>  = 可用 ${Q(m.available)} + 未清 PO ${Q(m.onOrder)} = ${Q(m.ip)} 件  → ${m.ip <= m.rop ? '触发补货' : '暂不补货'}
<b>目标上限</b> = d̄·(L+P) + SS + ${p.target_cover_weeks}·d̄ = ${Q(m.maxTarget)} 件
<b>可下单量</b> = 理论净需求 ${Q(m.netNeed)} → 不低于 MOQ ${m.moq} → 按 ${m.packSize} 件/包向上取整 = ${Q(m.suggestQty)} 件（取整多买 ${Q(m.roundingExtra)} 件）
<b>WOS</b> = 可用 / d̄ = ${m.wos === null ? 'N/A（无需求样本）' : D(m.wos) + ' 周'}
<b>周转</b> = COGS ${M(m.cogs)} / 平均库存 ${M(m.avgInvValue)} × 52/${p.turnover_window_weeks} = ${D(m.turnoverAnnual)} 次/年
<b>E&amp;O</b> = Obsolete ${Q(m.obsolete)} + Excess ${Q(m.excess)} → ${M(m.eoValue)}（占 ${P(m.eoRatio)}）
<span class="cm">// calc_status = ${m.calcStatus} · param_version 随页面参数实时变化 · 台账快照 ${snap}</span></div></div>
        <div class="drawer-section"><h4>52 周真实需求 <span class="en">UCI transaction history</span></h4>
          ${comboChart({ labels: R.weeks.map(w => w.slice(5)), bars: [{ name: '周出库', values: s.weekly, color: '#b9d0e6' }], height: 145, yFmt: v => shortNum(v), tipFmt: v => Q(v) + ' 件', xTicks: 8 })}</div>
        <div class="drawer-section"><h4>批次与库龄 <span class="en">FIFO batches</span></h4>
          <table class="tbl"><thead><tr><th>批次</th><th>入库日</th><th class="r">库龄/天</th><th class="r">结存</th><th class="r">金额</th><th>判定</th></tr></thead><tbody>${batchRows}</tbody></table></div>
        <div class="drawer-section"><h4>未清采购订单 <span class="en">Open PO</span></h4>
          <table class="tbl"><thead><tr><th>PO</th><th>ETA</th><th class="r">未清</th><th>状态</th></tr></thead><tbody>${poRows}</tbody></table></div>
        <div class="drawer-section"><h4>关联预警 <span class="en">${alerts.length} exceptions</span></h4>${alertRows}</div>
      </div>`;
    $('#drawer').classList.add('show'); $('#scrim').classList.add('show');
  }
  function closeDrawer() {
    State.drawerSku = null;
    $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show');
  }

  /* ------------------------------------------------------------------ 导入 / 导出 */
  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCurrent() {
    const key = State.view;
    const exKeys = Object.keys(State.exports);
    let ex = State.exports[key] || (exKeys.length ? State.exports[exKeys[0]] : null);
    const R = State.result, m = R.meta, p = R.params;
    const meta = [
      `库存控制工作台 / Inventory Control Workbench`,
      `视图: ${VIEWS[key].t} (${key})`,
      `数据源: ${m.source} | ${m.source_url} | ${m.license} | DOI ${m.doi}`,
      `库存快照日: ${m.snapshot_date} | 导出时间: ${tsLocal(true)}`,
      `策略参数: CSL=${p.csl}, segment_mode=${p.segment_csl}, abc_mode=${p.abc_mode}, cost_rate=${p.cost_rate}, lead_factor=${p.lead_factor}, cover_weeks=${p.target_cover_weeks}, demand_window=${p.demand_window_weeks}w`,
      `CSL矩阵: ${E.SEGMENT_KEYS.map(k => k + '=' + p.csl_matrix[k]).join(', ')} | XYZ阈值: cv_x=${p.xyz_cv_x}, cv_y=${p.xyz_cv_y}, zero_x=${p.xyz_zero_x}, zero_y=${p.xyz_zero_y}`,
      `交期口径: lead_source=${p.lead_source}, otd_basis=${p.otd_basis}, window=${p.otd_window_weeks}w, min_samples=${p.otd_min_samples}, prior=${p.otd_prior_strength}, grace=${p.otd_grace_days}d, tail=${p.otd_tail}`,
      `OTD实测: 窗口内交付=${R.leadTimes.summary.inWindow}/${R.leadTimes.summary.deliveries}笔 | OTD(ETA)=${P(R.leadTimes.summary.otdEtaRate, 1)} | OTD(合同)=${P(R.leadTimes.summary.otdContractRate, 1)} | SS相对契约=${Q(R.leadTimes.summary.ssDelta)}件`,
      `筛选: ${JSON.stringify(State.filters)}`,
      `金额币种: ${p.currency} (${CS()}) · ${E.currencyInfo(p.currency).name} | 金额口径: 数量 × 单位成本（成本额），与销售额口径不可相加；工作台不做汇率换算`,
      `币种声明: dataset.meta.currency = ${m.currency || '(未声明，采用默认 GBP)'}；当前生效参数 currency = ${p.currency}`,
      `口径: 指标由 engine.js 统一计算；空值表示分母为零或样本不足；历史台账不随参数改写`,
    ];
    if (!ex) {
      // 无主表格的视图：导出 SKU 主数据
      const cols = [
        { k: 'id', label: 'SKU', csv: s => s.id }, { k: 'desc', label: '品名', csv: s => s.desc },
        { k: 'on_hand', label: '现货', csv: s => s.m.onHand }, { k: 'ss', label: 'SS', csv: s => Math.round(s.m.ss) },
        { k: 'rop', label: 'ROP', csv: s => Math.round(s.m.rop) }, { k: 'wos', label: 'WOS', csv: s => s.m.wos === null ? '' : Math.round(s.m.wos * 10) / 10 },
        { k: 'eoValue', label: 'E&O金额', csv: s => Math.round(s.m.eoValue) },
      ];
      ex = { cols, rows: data().skus, name: 'SKU汇总' };
    }
    const header = ex.cols.map(c => c.label);
    const rows = ex.rows.map(r => ex.cols.map(c => c.csv ? c.csv(r) : (c.value ? c.value(r) : r[c.k])));
    const csv = '\ufeff' + meta.map(x => '# ' + x).concat([header.map(csvCell).join(',')])
      .concat(rows.map(r => r.map(csvCell).join(','))).join('\r\n');
    download(`ICW_${key}_${ex.name}_${m.snapshot_date}.csv`, csv, 'text/csv;charset=utf-8');
    toast(`已导出 ${ex.rows.length} 行 · ${ex.name}`);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') inQ = false; else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function templateCSV() {
    const head = ['sku', 'description', 'category', 'warehouse', 'supplier', 'unit_price', 'unit_cost', 'lead_days', 'lead_sd_days',
      'on_hand', 'reserved', 'quarantine', 'blocked', 'avg_inventory_qty', 'lifecycle', 'abc'];
    for (let i = 1; i <= 52; i++) head.push('w' + i);
    const s = State.result.skus[0];
    const sample = [s.id, s.desc, s.category, s.warehouse, s.supplier, s.unit_price, s.unit_cost, s.lead_days, s.lead_sd_days,
      s.on_hand, s.reserved, s.quarantine, s.blocked, Math.round(sum(s.weekly_oh) / 52), s.lifecycle, s.m.abc].concat(s.weekly);
    const meta = ['# 库存控制工作台 · CSV 导入模板',
      '# 币种: currency=' + State.result.params.currency + ' (ISO 4217)',
      '#   本行声明 unit_price / unit_cost 及全部金额类字段的币种；删除本行则沿用当前数据集的 meta.currency。工作台不做汇率换算，同一份数据的金额必须已是同一币种。',
      '# 必填: sku, description, unit_price, on_hand, lead_days, w1..w52',
      '# 可选: abc(ERP 的 A/B/C 分级，留空则按窗口消耗金额帕累托自动重算), unit_cost(真实单位成本，提供后自动采用), category, warehouse, supplier, reserved, quarantine, blocked, avg_inventory_qty, lifecycle(ACTIVE|PHASE_OUT), lead_sd_days',
      '# snapshot_date=' + State.result.meta.snapshot_date,
      '# 删除本示例行后填入自有数据；w1 为最早一周，w52 为快照日前一周'];
    return '\ufeff' + meta.concat([head.map(csvCell).join(',')]).concat([sample.map(csvCell).join(',')]).join('\r\n');
  }
  function buildFromCSV(rows) {
    let snapshot = State.result.meta.snapshot_date;
    // 币种默认沿用当前数据集声明；CSV 注释行 # currency=CNY 可覆盖
    let curCode = declaredCurrency(State.result);
    const metaRows = rows.filter(r => String(r[0]).trim().startsWith('#'));
    metaRows.forEach(r => {
      const line = String(r[0]);
      const mm = line.match(/snapshot_date\s*=\s*(\d{4}-\d{2}-\d{2})/); if (mm) snapshot = mm[1];
      const cm = line.match(/currency\s*=\s*([A-Za-z$€£¥￥]{1,5})/i);
      if (cm) curCode = E.normalizeCurrency(cm[1]);
    });
    const body = rows.filter(r => !String(r[0]).trim().startsWith('#'));
    if (body.length < 2) throw new Error('CSV 至少需要表头 + 1 行数据');
    const head = body[0].map(x => String(x).trim().toLowerCase());
    const ix = n => head.indexOf(n);
    const need = ['sku', 'description', 'unit_price', 'on_hand', 'lead_days'];
    need.forEach(n => { if (ix(n) < 0) throw new Error('缺少必填列: ' + n); });
    const wIdx = []; for (let i = 1; i <= 52; i++) wIdx.push(ix('w' + i));
    if (wIdx.filter(i => i >= 0).length < 4) throw new Error('至少需要 4 周需求列（w1..w52）');
    const val = (r, n, d) => { const i = ix(n); const v = i >= 0 ? parseFloat(r[i]) : NaN; return isFinite(v) ? v : d; };
    const str = (r, n, d) => { const i = ix(n); return i >= 0 && String(r[i]).trim() ? String(r[i]).trim() : d; };
    const weeks = [];
    const snapDate = new Date(snapshot + 'T00:00:00');
    const lastMon = new Date(snapDate.getTime() - 7 * 86400000);
    lastMon.setDate(lastMon.getDate() - ((lastMon.getDay() + 6) % 7));
    for (let i = 51; i >= 0; i--) weeks.push(isoLocal(new Date(lastMon.getTime() - i * 7 * 86400000)));
    const cr = State.cfg.cost_rate;
    const skus = body.slice(1).map((r, ri) => {
      const id = str(r, 'sku', ''); if (!id) return null;
      const weekly = wIdx.map(i => i >= 0 ? Math.max(0, parseFloat(r[i]) || 0) : 0);
      const price = Math.max(.01, val(r, 'unit_price', 1));
      const oh = Math.max(0, Math.round(val(r, 'on_hand', 0)));
      const avgInv = Math.max(0, Math.round(val(r, 'avg_inventory_qty', oh)));
      // 提供 unit_cost 时采用真实成本，否则才用「单价 × 成本率」估算
      const uc = Math.max(0.01, val(r, 'unit_cost', Math.round(price * cr * 100) / 100));
      const nz = weekly.filter(v => v > 0).length;
      return {
        id, desc: str(r, 'description', id), category: str(r, 'category', '未分类 / Other'),
        warehouse: str(r, 'warehouse', 'DC-01'), supplier: str(r, 'supplier', 'SUP-01'),
        // 未提供 abc 列时留空，由引擎按窗口消耗金额帕累托重算（口径与差异化策略一致）
        abc: str(r, 'abc', ''), lifecycle: str(r, 'lifecycle', 'ACTIVE'),
        unit_price: price, unit_cost: uc, weekly, weekly_revenue: weekly.map(v => Math.round(v * price * 100) / 100),
        weekly_oh: new Array(52).fill(avgInv),
        on_hand: oh, reserved: Math.round(val(r, 'reserved', 0)), quarantine: Math.round(val(r, 'quarantine', 0)),
        blocked: Math.round(val(r, 'blocked', 0)),
        batches: oh > 0 ? [{ id: id + '-B1', date: dateAdd(snapshot, -30), qty: oh, cost: uc, age_days: 30 }] : [],
        lead_days: Math.max(1, Math.round(val(r, 'lead_days', 14))),
        lead_sd_days: Math.max(0, Math.round(val(r, 'lead_sd_days', 3))),
        tail_bias: 1, real_volume: sum(weekly) * price, weeks_with_demand: nz,
      };
    }).filter(Boolean);
    if (!skus.length) throw new Error('未解析到有效 SKU 行');
    const hasAbc = ix('abc') >= 0;
    // 提供 abc 列则沿用 ERP 分级；否则留空，交给引擎在全量 SKU 上统一重算
    if (!hasAbc) skus.forEach(s => { s.abc = ''; });
    const meta = Object.assign({}, State.result.meta, {
      source: '用户导入数据 · CSV', source_url: '—', doi: '—', license: '用户自有数据',
      publisher: '—', description: '由用户通过标准 CSV 模板导入的库存快照与需求历史。',
      raw_period: [weeks[0], snapshot], raw_rows: skus.length, clean_rows: skus.length,
      snapshot_date: snapshot, weeks, sku_count: skus.length, po_count: 0,
      generated_at: tsLocal(),
      currency: curCode,
      currency_note: '由 CSV 注释行 # currency= 或当前数据集声明确定；unit_price / unit_cost 及全部金额指标均为 ' + curCode + '，工作台不做汇率换算。',
      real_fields: ['导入的 SKU 主数据、现货量、单位价格（币种 ' + curCode + '）、提前期与周度需求序列'],
      derived_fields: [ix('unit_cost') >= 0 ? '单位成本采用导入的 unit_cost（真实成本口径）' : '单位成本 = 导入单价 × 当前成本率（估算口径）',
        hasAbc ? 'ABC 采用导入的 abc 列（主数据口径）' : 'ABC 由工作台按当前窗口消耗金额帕累托自动重算（80% / 95% 分界）；XYZ 按 CV 与零需求周占比自动分级',
        '批次按单一入库批次生成（库龄 30 天）；PO / 在途台账为空',
        '未提供历史逐周结存时，平均库存按 avg_inventory_qty 近似（默认等于现货量）'],
      notes: ['当前为用户自有数据，工作台指标计算口径保持不变。', '如需完整 PO / 批次 / 在途台账，请改用 JSON 方式导入。'],
    });
    const params = Object.assign({}, State.result.params, {
      cost_basis: ix('unit_cost') >= 0 ? 'supplied' : 'estimated',
      currency: curCode,   // 显式写入，避免继承当前会话的参数而盖住 CSV 自己的声明
    });
    return { meta, params, skus, pos: [], weekly_inventory_value: new Array(52).fill(0) };
  }
  function handleImport(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const text = String(fr.result);
        let nd;
        if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) {
          nd = JSON.parse(text);
          if (!nd.skus || !nd.meta || !nd.meta.weeks) throw new Error('JSON 缺少 skus / meta / meta.weeks');
          // 规范化可选字段：用户 JSON 常缺 pos / params，缺失会导致抛异常或 age_buckets 崩溃
          nd.pos = Array.isArray(nd.pos) ? nd.pos : [];
          nd.weekly_inventory_value = nd.weekly_inventory_value || [];
        } else nd = buildFromCSV(parseCSV(text.replace(/^\ufeff/, '')));
        DATA = nd; State.dataToken++;
        // 币种随数据走：JSON 取 meta.currency / params.currency，CSV 取注释行；
        // 回写两层声明，保证本次导入的导出文件同样可追溯，且不被会话残留参数覆盖。
        const curCode = declaredCurrency(nd);
        nd.meta.currency = curCode;
        nd.params = Object.assign({}, nd.params || {}, { currency: curCode });
        // 显式声明优先；未声明但 SKU 自带 unit_cost 时，按真实成本口径处理
        const declared = nd.params && nd.params.cost_basis;
        const hasCost = Array.isArray(nd.skus) && nd.skus.some(s => Number(s.unit_cost) > 0);
        const basis = declared || (hasCost ? 'supplied' : 'estimated');
        State.cfg = Object.assign({}, E.DEFAULTS, nd.params || {}, { csl: State.cfg.csl || .95, cost_basis: basis, currency: curCode });
        State.cfgDefault = Object.assign({}, State.cfg);
        State.filters = { q: '', category: '', warehouse: '', supplier: '', abc: '', status: '', severity: '' };
        State.segmentFilter = ''; State.page = {}; State.sort = {};
        syncFilterInputs(); fillSelects(); recompute(); render();
        toast(`导入成功：${nd.skus.length} SKU · ${(nd.pos || []).length} PO`);
      } catch (err) { toast('导入失败：' + err.message); }
    };
    fr.onerror = () => toast('文件读取失败');
    fr.readAsText(file, 'utf-8');
  }

  /* ------------------------------------------------------------------ 渲染主控 */
  function render() {
    recompute();
    const R = State.result, v = VIEWS[State.view];
    $('#topSnapshot').textContent = R.meta.snapshot_date;
    $('#topSource').textContent = R.meta.source.split('·')[0].trim();
    $('#topSku').textContent = Q(R.skus.length);
    $('#topCsl').textContent = R.params.segment_csl === 'matrix'
      ? 'ABC×XYZ ' + P(R.kpis.segmentSummary.cslWeighted, 1) : P(R.params.csl, 1);
    // 差异化模式下全局 CSL 只作对照基线，必须显式标注，避免用户误改后以为 SS 会变
    const segMode = R.params.segment_csl === 'matrix';
    $('#fCslLabel').textContent = segMode ? '对照基线 CSL' : '服务水平 CSL';
    $('#fCslWrap').classList.toggle('policy-inactive', segMode);
    $('#fCslWrap').title = segMode
      ? '当前为 ABC×XYZ 差异化模式：此档位仅作全局基线对照，不参与 SS 计算。请到「分类与服务水平」编辑九宫格矩阵。'
      : '修改后全表重算 SS / ROP / 预警 / 目标上限';
    $('#badgeSegment').textContent = Q(R.kpis.segmentSummary.zSkus);
    $('#badgeSupplier').textContent = Q(R.leadTimes.summary.riskCount);
    $('#badgeEvidence').textContent = Q(limitsOf(R).length);
    $('#footPeriod').textContent = R.meta.raw_period[0] + ' ~ ' + R.meta.raw_period[1];
    $('#crumb').textContent = v.c; $('#pageTitle').textContent = v.t;
    $('#pageTitleEn').textContent = v.en; $('#pageDesc').textContent = v.d;
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === State.view));
    $('#badgeOverview').textContent = Q(R.skus.length);
    $('#badgeAlerts').textContent = Q(R.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length);
    $('#badgeInv').textContent = Q(R.skus.length);
    $('#badgePo').textContent = Q(R.pos.filter(p => p.status !== 'CLOSED').length);
    $('#badgeTransit').textContent = Q(R.pos.filter(p => p.status === 'IN_TRANSIT' || p.status === 'OVERDUE').length);
    const showStatus = State.view === 'purchase' || State.view === 'transit';
    const showSeverity = State.view === 'alerts';
    $('#fStatusWrap').classList.toggle('hidden', !showStatus);
    $('#fSeverityWrap').classList.toggle('hidden', !showSeverity);
    if (!showStatus) State.filters.status = '';
    if (!showSeverity) State.filters.severity = '';
    $('#pageActions').innerHTML = State.view === 'guide' ? '' :
      `<span class="small muted">快捷键 <span class="kbd">/</span> 检索 · <span class="kbd">Esc</span> 关闭明细</span>`;
    State.exports = {};
    $('#view').innerHTML = v.fn();
    // 指纹是异步计算的：切回证据视图时用缓存值回填，否则会停在「正在计算…」
    if (State.view === 'evidence' && State.evidence) paintEvidenceHashes();
    $('#footnote').innerHTML = footnote();
    syncFilterInputs();
  }
  function syncFilterInputs() {
    const f = State.filters;
    [['fCategory', 'category'], ['fWarehouse', 'warehouse'], ['fSupplier', 'supplier'], ['fAbc', 'abc'],
     ['fStatus', 'status'], ['fSeverity', 'severity']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.value = f[k] || ''; });
    if ($('#fSearch').value !== f.q) $('#fSearch').value = f.q;
    $('#fCsl').value = String(State.cfg.csl);
  }
  function fillSelects() {
    const R = State.result.skus;
    const uniq = f => Array.from(new Set(R.map(f))).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'zh'));
    const set = (id, arr, all) => { $('#' + id).innerHTML = [['', all]].concat(arr.map(x => [x, x])).map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join(''); };
    set('fCategory', uniq(s => s.category), '全部品类');
    set('fWarehouse', uniq(s => s.warehouse), '全部仓库');
    set('fSupplier', uniq(s => s.supplier), '全部供应商');
    $('#fAbc').innerHTML = `<option value="">全部分级</option>
      <optgroup label="ABC · 金额贡献">${['A', 'B', 'C'].map(x => `<option value="${x}">${x} 类</option>`).join('')}</optgroup>
      <optgroup label="XYZ · 需求波动">${['X', 'Y', 'Z'].map(x => `<option value="xyz:${x}">${x} 类 · ${E.SEGMENT_LABELS[x]}</option>`).join('')}</optgroup>`;
    $('#fStatus').innerHTML = [['', '全部状态'], ['NOT_SHIPPED', '未发运'], ['IN_TRANSIT', '在途'], ['OVERDUE', '逾期'], ['CLOSED', '已结案']]
      .map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
    $('#fSeverity').innerHTML = [['', '全部级别'], ['critical', '严重'], ['high', '高'], ['medium', '中'], ['low', '低']]
      .map(o => `<option value="${o[0]}">${o[1]}</option>`).join('');
  }

  /* ------------------------------------------------------------------ 事件 */
  function bind() {
    $('#nav').addEventListener('click', e => {
      const n = e.target.closest('.nav-item'); if (!n) return;
      State.view = n.dataset.view; State.page = {}; State.expandAlert = null; closeDrawer(); render();
    });
    $('#filterbar').addEventListener('input', e => {
      if (e.target.id === 'fSearch') { State.filters.q = e.target.value; State.page = {}; render(); }
    });
    $('#filterbar').addEventListener('change', e => {
      const map = { fCategory: 'category', fWarehouse: 'warehouse', fSupplier: 'supplier', fAbc: 'abc', fStatus: 'status', fSeverity: 'severity' };
      if (map[e.target.id]) { State.filters[map[e.target.id]] = e.target.value; State.page = {}; render(); }
      if (e.target.id === 'fCsl') { State.cfg.csl = parseFloat(e.target.value); render(); toast('服务水平已更新 · SS / ROP / 预警全部重算'); }
      if (e.target.dataset && e.target.dataset.param) onParam(e.target, false);
    });
    $('#filterbar').addEventListener('input', e => {
      if (e.target.dataset && e.target.dataset.param) onParam(e.target, true);
    });
    $('#btnReset').addEventListener('click', () => {
      State.filters = { q: '', category: '', warehouse: '', supplier: '', abc: '', status: '', severity: '' };
      State.segmentFilter = ''; State.supplierFocus = ''; State.page = {}; State.sort = {}; render(); toast('筛选条件已重置');
    });
    $('#btnExport').addEventListener('click', exportCurrent);
    $('#btnTemplate').addEventListener('click', () => { download('ICW_import_template.csv', templateCSV(), 'text/csv;charset=utf-8'); toast('模板已下载'); });
    $('#btnImport').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', e => { if (e.target.files[0]) handleImport(e.target.files[0]); e.target.value = ''; });
    $('#btnParams').addEventListener('click', () => { State.view = 'guide'; render(); window.scrollTo(0, 0); });

    $('#view').addEventListener('click', e => {
      const mode = e.target.closest('[data-mode]');
      if (mode) {
        State.cfg.segment_csl = mode.dataset.mode === 'matrix' ? 'matrix' : 'global';
        render();
        toast(State.cfg.segment_csl === 'matrix' ? '已启用 ABC×XYZ 差异化 · SS / ROP / 预警全量重算' : '已切回全局统一 CSL');
        return;
      }
      const ltMode = e.target.closest('[data-ltmode]');
      if (ltMode) {
        State.cfg.lead_source = ltMode.dataset.ltmode;
        render();
        toast(State.cfg.lead_source === 'contract'
          ? '已切回契约提前期 · 恢复基线结论'
          : '已启用' + E.LEAD_SOURCES[State.cfg.lead_source] + ' · L / σ_L 与 SS / ROP 全量重算');
        return;
      }
      const ltSup = e.target.closest('[data-ltsupplier]');
      if (ltSup) {
        State.supplierFocus = ltSup.dataset.ltsupplier || '';
        State.page = {}; render(); return;
      }
      const goSup = e.target.closest('[data-gosupplier]');
      if (goSup) { State.view = goSup.dataset.gosupplier || 'guide'; State.page = {}; render(); window.scrollTo(0, 0); return; }
      const segCell = e.target.closest('[data-segfilter]');
      if (segCell) {
        const key = segCell.dataset.segfilter;
        State.segmentFilter = key && State.segmentFilter !== key ? key : '';
        State.page = {}; render(); return;
      }
      if (e.target.closest('[data-gosegment]')) {
        State.view = 'segment'; State.page = {}; render(); window.scrollTo(0, 0); return;
      }
      if (e.target.closest('#btnMatrixReset')) {
        State.cfg.csl_matrix = Object.assign({}, E.DEFAULTS.csl_matrix);
        render(); toast('矩阵已恢复默认 9 档'); return;
      }
      const sort = e.target.closest('[data-sort]');
      if (sort) {
        const tk = e.target.closest('[data-tablekey]')?.dataset.tablekey || State.view;
        const col = sort.dataset.sort, st = State.sort[tk] || {};
        State.sort[tk] = { col, dir: st.col === col && st.dir !== 'desc' ? 'desc' : 'asc' };
        render(); return;
      }
      const pg = e.target.closest('[data-page]');
      if (pg) {
        const v = pg.dataset.page;
        const tk = e.target.closest('[data-tablekey]')?.dataset.tablekey || State.view;
        const cur = State.page[tk] || 0;
        State.page[tk] = v === 'prev' ? Math.max(0, cur - 1) : v === 'next' ? cur + 1 : parseInt(v, 10);
        render(); return;
      }
      const edit = e.target.closest('[data-edit-alert]');
      if (edit) { State.expandAlert = edit.dataset.editAlert; render(); return; }
      const ack = e.target.closest('[data-ack]');
      if (ack) {
        const id = ack.dataset.id;
        if (ack.dataset.ack === 'CANCEL') State.expandAlert = null;
        else {
          State.actions[id] = { status: ack.dataset.ack, owner: $('#ackOwner')?.value || '', reason: $('#ackReason')?.value || '', note: $('#ackNote')?.value || '', at: tsLocal() };
          saveActions(); State.expandAlert = null; toast(ack.dataset.ack === 'ACK' ? '预警已确认并留痕' : '预警已忽略');
        }
        render(); return;
      }
      if (e.target.closest('#btnResetParams')) { State.cfg = Object.assign({}, State.cfgDefault); render(); toast('参数已恢复为基线'); return; }
      const doBtn = e.target.closest('[data-do]');
      if (doBtn) {
        if (doBtn.dataset.do === 'import') $('#fileInput').click();
        if (doBtn.dataset.do === 'template') { download('ICW_import_template.csv', templateCSV(), 'text/csv;charset=utf-8'); toast('模板已下载'); }
        if (doBtn.dataset.do === 'recheckEvidence') { refreshEvidenceHashes(true); toast('已按构建期规则重新计算并比对'); }
        if (doBtn.dataset.do === 'exportEvidence') exportEvidence();
        if (doBtn.dataset.do === 'restore') {
          DATA = window.INV_DATA; State.dataToken++;
          State.cfg = Object.assign({}, E.DEFAULTS, DATA.params || {}, { csl: State.cfg.csl || .95, currency: declaredCurrency(DATA) });
          State.cfgDefault = Object.assign({}, State.cfg);
          State.filters = { q: '', category: '', warehouse: '', supplier: '', abc: '', status: '', severity: '' };
          State.segmentFilter = ''; State.supplierFocus = ''; State.page = {}; State.sort = {};
          recompute(); fillSelects(); render(); toast('已恢复 UCI 演示数据');
        }
        return;
      }
      const tr = e.target.closest('tr[data-sku]');
      if (tr && tr.dataset.sku) openDrawer(tr.dataset.sku);
    });
    $('#view').addEventListener('change', e => {
      if (e.target.dataset && e.target.dataset.seg) {
        const key = e.target.dataset.seg, v = parseFloat(e.target.value);
        if (E.SEGMENT_KEYS.includes(key) && isFinite(v)) {
          State.cfg.csl_matrix = Object.assign({}, State.cfg.csl_matrix, { [key]: v });
          render(); toast(`策略格 ${key} → CSL ${cslLabel(v)}${State.cfg.segment_csl === 'matrix' ? ' · 已全量重算' : '（切到差异化后生效）'}`);
        }
        return;
      }
      if (e.target.dataset && e.target.dataset.param) onParam(e.target, false);
      if (e.target.id === 'fCsl') { State.cfg.csl = parseFloat(e.target.value); render(); }
    });
    $('#view').addEventListener('input', e => {
      if (e.target.dataset && e.target.dataset.param) onParam(e.target, true);
    });
    $('#drawer').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });
    $('#scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeDrawer(); $('#tooltip').classList.add('hidden'); }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $('#fSearch').focus(); }
    });
    document.addEventListener('mousemove', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      const el = $('#tooltip');
      if (!t) { el.classList.add('hidden'); return; }
      el.textContent = t.getAttribute('data-tip');
      el.classList.remove('hidden');
      el.style.left = Math.min(window.innerWidth - 230, e.clientX + 14) + 'px';
      el.style.top = Math.max(8, e.clientY - 12) + 'px';
    });
  }
  function onParam(el, live) {
    const k = el.dataset.param, raw = el.type === 'range' ? parseFloat(el.value) : el.value;
    const v = el.type === 'range' ? raw : (isNaN(Number(raw)) ? raw : Number(raw));
    State.cfg[k] = v;
    const it = PARAM_GROUPS.reduce((a, g) => a.concat(g.items), []).find(i => i.k === k);
    const pv = document.getElementById('pv_' + k);
    if (pv && it) pv.textContent = (it.fmt || (x => x))(v);
    if (live) {
      // 拖动时只刷新影响预览，避免重建滑块导致拖拽中断
      const box = document.getElementById('impactBox');
      if (box) { recompute(); box.innerHTML = impactHTML(); }
    } else render();
  }

  /* ------------------------------------------------------------------ 启动 */
  function boot() {
    if (!DATA || !DATA.skus) { document.body.innerHTML = '<div style="padding:40px">数据未加载：请检查 assets/dataset.js</div>'; return; }
    State.cfg = Object.assign({}, E.DEFAULTS, DATA.params || {}, { csl: 0.95, currency: declaredCurrency(DATA) });
    State.cfgDefault = Object.assign({}, State.cfg);
    recompute(); fillSelects(); bind(); render();
  }
  boot();
})();
