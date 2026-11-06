/* 往期雷达回顾 · 单 tab 单项
   - 内联精简词云：与全量工作台共用 wordcloud-data.json + d3.layout.cloud，只改词数与字号区间
   - 结构信号 / 核查剧本：从 reports/chainscope/signal-data.json 渲染，随周更重建
   - 渐进增强：任何 fetch / CDN 失败都保留 HTML 里的静态兜底，不白屏
   零 LLM，零外部数据请求（d3 由页面既有 CDN 提供）。 */
(function () {
  'use strict';
  var WC = null, S = null, STALE = false;
  var FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';

  function lang() { return document.documentElement.lang === 'en' ? 'en' : 'zh'; }
  function t(zh, en) { return lang() === 'en' ? en : zh; }

  // 数据文件缺失时（例如上线时未随主站一起部署归纳台目录）必须明示降级，
  // 不能让页面一边显示旧快照、一边标着「随周更同步」。
  function markStale() {
    var e = document.getElementById('rvLive');
    if (!e) return;
    e.textContent = t('数据源未加载 · 显示内嵌快照', 'Data file unavailable · showing embedded snapshot');
    e.classList.add('rv-stale');
  }
  function cloudMessage(msg) {
    var svg = document.getElementById('rvCloudSvg');
    if (!svg) return;
    svg.innerHTML = '';
    var n = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    n.setAttribute('x', '20'); n.setAttribute('y', '38'); n.setAttribute('font-size', '12');
    n.style.fill = '#8a949f'; n.textContent = msg;
    svg.appendChild(n);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function get(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
      return r.json();
    });
  }

  /* ---------- 归纳数字：单一来源是 signal-data.json，静态 HTML 只是兜底 ---------- */
  function values() {
    if (!S) return null;
    var m = S.meta || {}, a = S.biasAudit || {};
    var L = a.lexicon || {}, E = a.equalWidth || {}, O = a.overlap || {};
    var Og = a.origin || {}, P = a.periods || {};
    var st = {}, rk = {};
    (S.stages || []).forEach(function (x) { st[x.key] = x.n; });
    (S.risks || []).forEach(function (x) { rk[x.key] = x.n; });
    var lex = function (k) { return L[k] && L[k].total; };
    return {
      periods: m.periods, signals: m.signals, sources: m.sources, verified: m.verified,
      duplicates: m.duplicates, unclassified: m.unclassified,
      windowFrom: m.from, windowTo: m.to,
      stages: (S.stages || []).length,
      playbooks: (S.playbooks || []).length,
      caveats: (S.caveats || []).length,
      stPlan: st.plan, stSource: st.source, stMake: st.make,
      stDeliver: st.deliver, stReturn: st.return,
      riskDigital: rk.digital, riskCost: rk.cost, riskFlow: rk.flow,
      lexPlan: lex('plan'), lexSource: lex('source'), lexMake: lex('make'),
      lexDeliver: lex('deliver'), lexReturn: lex('return'),
      trim: E.deliverTrim, makeFull: E.makeFull,
      exclusive: O.exclusive, shared: O.shared, stageTotal: O.stageTotal,
      title: Og.title, atLeast60: P.atLeast60
    };
  }

  function applyNumbers() {
    var v = values();
    if (!v) return;
    document.querySelectorAll('#radar-review [data-rv]').forEach(function (el) {
      var k = el.getAttribute('data-rv');
      if (v[k] != null && v[k] !== '') el.textContent = v[k];
    });
    var maxStage = Math.max(v.stPlan || 0, v.stSource || 0, v.stMake || 0,
      v.stDeliver || 0, v.stReturn || 0) || 1;
    document.querySelectorAll('#radar-review [data-rv-bar]').forEach(function (el) {
      var k = el.getAttribute('data-rv-bar');
      if (v[k] != null) el.style.width = Math.max(2, Math.round(v[k] / maxStage * 1000) / 10) + '%';
    });
    var win = document.getElementById('rvWindow');
    if (win) win.textContent = t(v.periods + ' 期 · ', v.periods + ' issues · ')
      + v.windowFrom + ' — ' + v.windowTo;
  }

  /* ---------- 核查剧本：前 6 条，完整 19 条仍留在独立归纳台 ---------- */
  function renderPlaybooks() {
    var box = document.getElementById('rvPlaybooks');
    if (!box || !S) return;
    var en = lang() === 'en';
    var pick = function (o) {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      return o[en ? 'en' : 'zh'] || o.zh || '';
    };
    var lab = en
      ? ['Signal', 'Action', 'Trigger', 'Fields']
      : ['信号', '动作', '触发条件', '所需字段'];
    var list = (S.playbooks || []).slice(0, 6);
    if (!list.length) { box.innerHTML = '<div class="rr-note">' + t('暂无剧本', 'No playbooks yet') + '</div>'; return; }
    box.innerHTML = list.map(function (p) {
      var rows = [
        [lab[0], pick(p.signal)], [lab[1], pick(p.action)],
        [lab[2], pick(p.trigger)], [lab[3], pick(p.fields)]
      ].map(function (r) {
        return '<p><b>' + esc(r[0]) + '：</b>' + esc(r[1]) + '</p>';
      }).join('');
      return '<div class="rv-pb"><div class="rv-pb-h"><i>' + esc(p.id) + '</i>'
        + esc(pick(p.owner)) + '<em>' + esc(p.stage) + ' / ' + esc(p.risk) + '</em></div>'
        + rows + '</div>';
    }).join('');
  }

  /* ---------- 内联精简词云 ---------- */
  function renderLegend(list) {
    var box = document.getElementById('rvLegend');
    if (!box) return;
    var seen = [], colors = [];
    list.forEach(function (d) { if (d.cat && seen.indexOf(d.cat) < 0) seen.push(d.cat); });
    colors = seen.slice(0, 6);
    // 色块成组放在一个不换行的 inline-flex 容器里：窄屏时整组一起换行，
    // 不会出现「3 个色块在第一行、第 4 个孤零零掉到第二行」。
    box.innerHTML = '<span>' + t('字号 = TF-IDF 权重 · 颜色 = 主题分类（' + colors.length + ' 类）',
      'Size = TF-IDF weight · colour = topic class (' + colors.length + ' classes)')
      + '</span><span class="rv-leg-sw">'
      + colors.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('')
      + '</span>';
  }

  /* 内联词云：与全量工作台共用同一份词表，字号按容器面积等比缩放。
     2026-11-06 密度修正：旧版只取 top 30、把字号压到 12–32px，实测墨迹覆盖率
     7.1%（全量工作台 19.2%），四周大片留白且大小层级被压平。现改为全量 80 词、
     字号区间随画布缩放（桌面约 10–49px，极值比 ≥4.5×）、padding 收紧到 2、
     矩形螺旋更贴合宽扁卡片，并用固定随机种子保证每次布局可复现。 */
  var CLOUD_BASE = { w: 1142, h: 616, min: 14, max: 64 }; // 全量工作台实测画布与字号
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  var cloudTimer = null;
  function renderCloud() {
    var svg = document.getElementById('rvCloudSvg');
    var pane = document.getElementById('rvPaneCloud');
    if (!svg || !WC || !pane || !pane.classList.contains('active')) return;
    if (typeof d3 === 'undefined' || !d3.layout || !d3.layout.cloud) {
      cloudMessage(t('词云依赖未加载，可点下方按钮打开完整工作台。',
        'Cloud library unavailable; use the full workspace button below.'));
      return;
    }
    var rect = svg.getBoundingClientRect();
    var W = Math.max(280, Math.round(rect.width) || 640);
    var H = Math.max(200, Math.round(rect.height) || 400);
    // 窄屏不靠横向裁切：按容器真实宽度重排、减词数，字号是绝对 px 不会等比缩小到不可读
    var narrow = W < 560, mid = W < 860;
    var topN = narrow ? 34 : (mid ? 60 : 80);
    var scale = Math.sqrt((W * H) / (CLOUD_BASE.w * CLOUD_BASE.h));
    // 与内页工作台同款观感：字号上限贴近 64px 基准，下限压到 9px，
    // 极值比约 5.8×（内页 4.6×），大词居中、长尾更小。
    var maxFs = Math.round(Math.max(narrow ? 26 : 34, Math.min(56, CLOUD_BASE.max * scale * 1.08)));
    var minFs = 9;
    var src = (WC[lang() === 'en' ? 'en' : 'zh'] || []).slice(0, topN);
    if (!src.length) return;
    var sizes = src.map(function (d) { return d.size; });
    var lo = Math.min.apply(null, sizes), hi = Math.max.apply(null, sizes);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';
    var words = src.map(function (d) {
      // 幂次 >1：把长尾压得更小、头部更突出，最大/最小字号差异比线性映射更明显
      var p = Math.pow((d.size - lo) / Math.max(1, hi - lo), 1.12);
      return {
        text: d.text, cat: d.cat, items: d.items || [],
        size: Math.round(minFs + p * (maxFs - minFs))
      };
    });
    renderLegend(words);
    d3.layout.cloud()
      .size([W, H]).words(words).padding(3)
      .rotate(function () { return 0; })
      .random(seeded(20261106))
      .font(FONT)
      .fontSize(function (d) { return d.size; })
      .on('end', function (placed) {
        var full = (WC[lang() === 'en' ? 'en' : 'zh'] || []).length;
        var sub = document.getElementById('rvCloudSub');
        if (sub) sub.textContent = t('内联 ' + placed.length + ' / 全量 ' + full + ' 词',
          'inline ' + placed.length + ' / full ' + full + ' words');
        var g = d3.select(svg).append('g');
        var sel = g.selectAll('g.rv-word').data(placed).enter().append('g')
          .attr('class', 'rv-word')
          .attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; })
          .style('cursor', 'pointer')
          .on('click', function (e, d) { openDrawer(d); });
        sel.append('text')
          .attr('text-anchor', 'middle').attr('dy', '0.35em')
          .style('font-family', FONT)
          .style('font-size', function (d) { return d.size + 'px'; })
          .style('font-weight', '600')
          .style('fill', function (d) { return d.cat || '#2b5d78'; })
          .text(function (d) { return d.text; });
        // d3-cloud 的螺旋天然收敛在中心；按实际包围盒等比放大到铺满画布
        // （内页同款：几乎不留边），同时保持所有词的相对大小与防重叠关系。
        var bb = g.node().getBBox();
        var k = Math.max(1, Math.min(1.8,
          Math.min(W * 0.96 / Math.max(1, bb.width), H * 0.92 / Math.max(1, bb.height))));
        g.attr('transform', 'translate(' + (W / 2 - (bb.x + bb.width / 2) * k) + ','
          + (H / 2 - (bb.y + bb.height / 2) * k) + ') scale(' + k + ')');
        // 与内页一致的 stagger 入场；用 WAAPI 而非 CSS opacity:0，
        // 动画 API 不可用时词保持默认可见，不会整块白屏。
        if (typeof Element !== 'undefined' && Element.prototype.animate) {
          sel.nodes().forEach(function (node, i) {
            try {
              node.animate([{ opacity: 0 }, { opacity: 1 }],
                { duration: 320, delay: Math.min(i, 40) * 8, fill: 'backwards', easing: 'ease-out' });
            } catch (e) { /* 不支持就保持可见 */ }
          });
        }
        var note = document.getElementById('rvCloudNote');
        if (note) note.textContent = t(
          '中文 TF-IDF · 每期雷达为一个文档 · 字号 ' + Math.round(minFs * k) + '–' + Math.round(maxFs * k) + 'px（自适应）',
          'TF-IDF · each radar issue is one document · ' + Math.round(minFs * k) + '–' + Math.round(maxFs * k) + 'px (auto-fit)');
      }).start();
  }
  function scheduleCloud() {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(renderCloud, 90);
  }

  /* ---------- 卡片内抽屉 ---------- */
  function openDrawer(d) {
    var box = document.getElementById('rvDrawer');
    var word = document.getElementById('rvDrawerWord');
    var body = document.getElementById('rvDrawerBody');
    if (!box || !word || !body) return;
    word.textContent = d.text;
    var en = lang() === 'en';
    var items = d.items || [];
    if (!items.length) {
      body.innerHTML = '<div class="rr-note">' + t('该词暂无关联新闻明细。', 'No linked news for this word.') + '</div>';
    } else {
      body.innerHTML = items.slice(0, 12).map(function (it) {
        var title = en ? (it.titleEn || it.titleZh) : (it.titleZh || it.titleEn);
        var href = it.url || '#';
        return '<a href="' + esc(href) + '" target="_blank" rel="noopener">'
          + esc(title) + '<small>' + esc(it.date || '') + '</small></a>';
      }).join('');
    }
    box.hidden = false;
  }
  function closeDrawer() {
    var box = document.getElementById('rvDrawer');
    if (box) box.hidden = true;
  }

  /* ---------- tab：一次只显示一项 ---------- */
  function activate(key) {
    var tabs = document.querySelectorAll('#rvTabs .rv-tab');
    var panes = document.querySelectorAll('#radar-review .rv-pane');
    tabs.forEach(function (b) {
      var on = b.getAttribute('data-rv-tab') === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panes.forEach(function (p) {
      p.classList.toggle('active', p.id === 'rvPane' + key.charAt(0).toUpperCase() + key.slice(1));
    });
    closeDrawer();
    if (key === 'cloud') scheduleCloud();
    if (key === 'playbook') renderPlaybooks();
  }

  function boot() {
    var tabs = document.querySelectorAll('#rvTabs .rv-tab');
    tabs.forEach(function (b) {
      b.addEventListener('click', function () { activate(b.getAttribute('data-rv-tab')); });
    });
    var close = document.getElementById('rvDrawerClose');
    if (close) close.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
    var full = document.getElementById('rvOpenWorkspace');
    if (full) full.addEventListener('click', function () {
      var entry = document.getElementById('wcEntryCloud');
      if (entry) entry.click();          // 复用已验收的全量工作台，不复制其逻辑
    });

    // 语言切换：applyLang 会重写 [data-i18n] 的 innerHTML，需重填数字、重排词云与剧本
    new MutationObserver(function () {
      applyNumbers(); renderPlaybooks(); scheduleCloud();
      if (STALE) markStale();   // applyLang 会重写徽标 innerHTML，需重新标注降级
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (WC) scheduleCloud(); }, 220);
    });

    // 两份数据独立取用：任一失败都只影响对应视图，静态兜底保留，不整页白屏
    get('reports/chainscope/signal-data.json')
      .then(function (j) { S = j; applyNumbers(); renderPlaybooks(); })
      .catch(function (e) {
        STALE = true; markStale();
        var box = document.getElementById('rvPlaybooks');
        if (box) box.innerHTML = '<div class="rr-note">'
          + t('归纳数据未加载；完整剧本请打开归纳台查看。',
            'Recap data unavailable; open the recap deck for the full playbooks.') + '</div>';
        console.warn('[radar-review] signal-data unavailable, static snapshot kept:', e.message);
      });
    get('wordcloud-data.json')
      .then(function (j) { WC = j; scheduleCloud(); })
      .catch(function (e) {
        STALE = true; markStale();
        cloudMessage(t('词频数据未加载；可点下方按钮打开完整工作台。',
          'Word-frequency data unavailable; use the full workspace button below.'));
        console.warn('[radar-review] wordcloud-data unavailable:', e.message);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
