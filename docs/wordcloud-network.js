/* docs/wordcloud-network.js — 共现网络词云（InfraNodus 风格：词即节点）
 * 设计意图：
 *  - 复用站点已加载的 d3 全量包（含 d3-force / d3-drag），**不新增 CDN 请求**；
 *  - 数据来自同源 wordcloud-network.json（由 scripts/build_wordcloud_network.py 每周重建）；
 *  - 节点=关键词本身（颜色=栏目四色、字号=TF-IDF 影响力，无圆形底），边=同一篇雷达资讯中的共现；
 *  - 连线=两端栏目色的降饱和/降明度渐变（与正文彩色词拉开层次），粗细/深浅随共现权重，
 *    hover 高亮支路换 accent 色、其余淡出；
 *  - 环境微动效：模拟保持极小 alphaTarget，布局持续轻缓呼吸（更灵动）；可拖拽整理布局；
 *  - 跟随语言(html[lang])重渲、跟随主题(CSS 变量)变色；仅在模态面板可见时渲染。
 * 渐进增强：d3 缺失或数据取不到时静默降级，不白屏、不影响主站其它脚本。
 */
(function () {
  "use strict";
  var svg = document.getElementById("wnSvg");
  if (!svg) return;

  var legend = document.getElementById("wnLegend");
  var info = document.getElementById("wnInfo");
  var hintEl = document.getElementById("wnHint");
  var pane = document.getElementById("wcPaneNet");
  var modal = document.getElementById("wcModal");
  var statsExtra = document.getElementById("wcStatsNetExtra");

  var CATS = [
    { zh: "重点新闻", en: "Key News", color: "#e05656" },
    { zh: "热门议题", en: "Hot Topics", color: "#f0a13a" },
    { zh: "研究瞭望", en: "Research", color: "#5b8cff" },
    { zh: "应用风向", en: "Apps & Adoption", color: "#35c2b0" }
  ];
  var FONT = 'Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

  var DATA = null;
  var sim = null;
  var lastLang = null;

  function lang() { return document.documentElement.lang === "en" ? "en" : "zh"; }
  function t(zh, en) { return lang() === "en" ? en : zh; }
  function paneVisible() { return pane && pane.classList.contains("active") && modal && !modal.hidden; }
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* 连线专用弱化色：同一栏目色但降饱和(×0.5)并压明度(×0.85，夹在 40–60%)，
   * 与正文全彩词拉开层次，避免连线抢过文字。 */
  function mutedColor(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return hex;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    s = Math.round(s * 50);
    l = Math.round(Math.min(0.60, Math.max(0.40, l * 0.85)) * 100);
    return "hsl(" + Math.round(h * 360) + ", " + s + "%, " + l + "%)";
  }

  function showError(msg) {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="var(--ink-mute)" font-size="13">' +
      (msg || String(t("网络数据不可用 / network data unavailable"))) + "</text>";
  }

  fetch("wordcloud-network.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { DATA = j; fillEntry(); if (paneVisible()) render(); })
    .catch(function () { showError(); });

  /* ---- 入口卡统计：并入主站单张入口卡的统计行（追加共现维度）---- */
  function fillEntry() {
    if (!DATA || !statsExtra) return;
    var l = lang();
    var d = DATA[l] || { nodes: [], links: [] };
    statsExtra.textContent = l === "en"
      ? " · " + d.nodes.length + " words · " + d.links.length + " co-occurrence links"
      : " · " + d.nodes.length + " 词 · " + d.links.length + " 组共现";
  }

  function renderLegend() {
    if (!legend) return;
    legend.innerHTML = CATS.map(function (c) {
      return '<span class="wn-leg"><i style="--cat:' + c.color + '"></i>' +
        (lang() === "en" ? c.en : c.zh) + "</span>";
    }).join("");
  }

  function setInfo(s) { if (info) info.textContent = s; }

  function applyText() {
    if (hintEl) hintEl.textContent = lang() === "en"
      ? "Hover to highlight links · drag words to rearrange"
      : "悬停查看关联词 · 可拖拽词语调整布局";
  }

  function render() {
    if (!DATA) return;
    if (typeof d3 === "undefined" || !d3.forceSimulation) return;
    var d = DATA[lang()];
    if (!d || !d.nodes || !d.nodes.length) { showError(); return; }
    lastLang = lang();
    applyText();
    renderLegend();

    var rect = svg.getBoundingClientRect();
    var W = Math.max(320, Math.floor(rect.width) || 960);
    var H = Math.max(340, Math.floor(rect.height) || 560);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = "";
    // 重渲时清掉上一轮的 hover focus 残留（否则全部节点被压到 .16 透明度）
    svg.classList.remove("wn-focus");
    setInfo("");

    var maxT = d3.max(d.nodes, function (n) { return n.tfidf; }) || 1;
    var maxW = d3.max(d.links, function (l) { return l.weight; }) || 1;

    // 深拷贝：模拟会写入 x/y/vx/vy，重渲时不能污染原数据
    var nodes = d.nodes.map(function (n) {
      return { text: n.text, cat: n.cat, count: n.count, tfidf: n.tfidf };
    });
    var byId = {};
    nodes.forEach(function (n) { byId[n.text] = n; });
    var links = (d.links || []).filter(function (l) { return byId[l.source] && byId[l.target]; })
      .map(function (l) { return { source: byId[l.source], target: byId[l.target], weight: l.weight }; });

    // 字号：幂次缩放（指数 1.55），高频词显著更大 —— 低频 10.5px，最高频 ~36px
    function fsize(n) { return 10.5 + 25.5 * Math.pow(n.tfidf / maxT, 1.55); }
    // 文本半径估算（CJK ≈ 1em/字，拉丁 ≈ 0.56em/字），供 collide 与防重叠
    function labelR(n) {
      var w = 0, i, ch;
      for (i = 0; i < n.text.length; i++) {
        ch = n.text.charCodeAt(i);
        w += (ch >= 0x2e80 && ch <= 0x9fff) || (ch >= 0xff00 && ch <= 0xffef) ? 1 : 0.56;
      }
      return Math.max(7, (w * fsize(n)) / 2 * 0.92 + 3);
    }

    var neigh = {};
    nodes.forEach(function (n) { neigh[n.text] = {}; });
    links.forEach(function (l) {
      neigh[l.source.text][l.target.text] = true;
      neigh[l.target.text][l.source.text] = true;
    });
    var degOf = {};
    Object.keys(neigh).forEach(function (k) { degOf[k] = Object.keys(neigh[k]).length; });

    var root = d3.select(svg);
    var defs = root.append("defs");
    var gLink = root.append("g").attr("class", "wn-links");
    var gNode = root.append("g").attr("class", "wn-nodes");

    // 渐变连线：颜色取两端词条的栏目色，但经 mutedColor 弱化（降饱和/降明度），
    // 保留「哪两个语境在对话」的可读性，又不与正文全彩词抢视觉
    var gradSel = gLink.selectAll("line").data(links).enter().append("linearGradient")
      .attr("id", function (l, i) { return "wng" + i; })
      .attr("gradientUnits", "userSpaceOnUse")
      .each(function (l) {
        d3.select(this).append("stop").attr("offset", "0%").attr("stop-color", mutedColor(l.source.cat));
        d3.select(this).append("stop").attr("offset", "100%").attr("stop-color", mutedColor(l.target.cat));
      });

    var linkSel = gLink.selectAll("line").data(links).enter().append("line")
      .attr("class", "wn-link")
      .attr("stroke", function (l, i) { return "url(#wng" + i + ")"; })
      // 线宽（2026-10-27 整体再收窄 20%：0.6–2.7px → 0.48–2.16px）
      .style("stroke-width", function (l) { return (0.48 + 1.68 * (l.weight / maxW)) + "px"; })
      // 透明度走 CSS 变量：内联 opacity 会盖过 .wn-focus 的淡出规则；整体加深一档（0.42–0.80）
      .style("--o", function (l) { return 0.42 + 0.38 * (l.weight / maxW); });

    var nodeSel = gNode.selectAll("g").data(nodes).enter().append("g")
      .attr("class", "wn-node")
      .style("cursor", "pointer");

    // 词即节点：无圆形底，颜色即栏目色；paper 色描边保证任何背景上清晰
    nodeSel.append("text")
      .text(function (n) { return n.text; })
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-family", FONT)
      .style("font-size", function (n) { return fsize(n) + "px"; })
      .style("font-weight", "650")
      .style("text-transform", function (n) { return /[一-龥]/.test(n.text) ? "none" : "lowercase"; })
      .style("fill", function (n) { return n.cat; })
      .style("paint-order", "stroke")
      .style("stroke", "var(--paper)")
      .style("stroke-width", "3.5px")
      .style("stroke-linejoin", "round");

    if (sim) sim.stop();
    // 初始摆成椭圆环，避免开局爆开；环境微动效：alphaTarget 保持极小值，布局持续轻缓呼吸
    nodes.forEach(function (n, i) {
      var a = (i / nodes.length) * Math.PI * 2;
      n.x = W / 2 + Math.cos(a) * W * 0.3;
      n.y = H / 2 + Math.sin(a) * H * 0.3;
    });
    sim = d3.forceSimulation(nodes)
      .alphaDecay(0.022)
      .alphaTarget(0.0032)                      // 永不静止 —— 缓慢呼吸感
      .force("link", d3.forceLink(links).id(function (n) { return n.text; })
        .distance(function (l) { return 46 + 46 * (1 - l.weight / maxW); })
        .strength(function (l) { return 0.28 + 0.45 * (l.weight / maxW); }))
      .force("charge", d3.forceManyBody().strength(function (n) { return -120 - 230 * (n.tfidf / maxT); }))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.05))
      .force("collide", d3.forceCollide(function (n) { return labelR(n) + 3; }))
      .force("x", d3.forceX(W / 2).strength(function () { return 0.03 + Math.random() * 0.03; }))
      .force("y", d3.forceY(H / 2).strength(function () { return 0.04 + Math.random() * 0.03; }))
      .on("tick", ticked);

    var M = 26; // 防裁边：把节点留在视口内（顶部气泡被遮的修复）
    function ticked() {
      linkSel
        .attr("x1", function (l) { return l.source.x; })
        .attr("y1", function (l) { return l.source.y; })
        .attr("x2", function (l) { return l.target.x; })
        .attr("y2", function (l) { return l.target.y; });
      gradSel
        .attr("x1", function (l) { return l.source.x; })
        .attr("y1", function (l) { return l.source.y; })
        .attr("x2", function (l) { return l.target.x; })
        .attr("y2", function (l) { return l.target.y; });
      nodeSel.attr("transform", function (n) {
        n.x = Math.max(M, Math.min(W - M, n.x));
        n.y = Math.max(M, Math.min(H - M, n.y));
        return "translate(" + n.x + "," + n.y + ")";
      });
    }

    nodeSel
      .on("mouseenter", function (e, n) { focus(n); })
      .on("mouseleave", function () { blur(); })
      .call(d3.drag()
        .on("start", function (e, n) { if (!e.active) sim.alphaTarget(0.25).restart(); n.fx = n.x; n.fy = n.y; })
        .on("drag", function (e, n) { n.fx = e.x; n.fy = e.y; })
        .on("end", function (e, n) { if (!e.active) sim.alphaTarget(0.0032); n.fx = null; n.fy = null; }));

    function focus(n) {
      svg.classList.add("wn-focus");
      nodeSel.each(function (m) {
        this.classList.toggle("wn-hl", m.text === n.text || !!neigh[n.text][m.text]);
      });
      linkSel.each(function (l) {
        var hit = l.source.text === n.text || l.target.text === n.text;
        this.classList.toggle("wn-hl", hit);
      });
      setInfo(n.text + " · " + (degOf[n.text] || 0) + " " + t("个关联词 · ", "links · ") +
        n.count + " " + t("条雷达资讯", " radar items"));
    }

    function blur() {
      svg.classList.remove("wn-focus");
      nodeSel.each(function () { this.classList.remove("wn-hl"); });
      linkSel.each(function () { this.classList.remove("wn-hl"); });
      setInfo("");
    }
  }

  // 已渲过且语言未变 → 只恢复呼吸；否则全量重渲
  function renderOrResume() {
    if (!DATA) return;
    if (svg.querySelector(".wn-node") && lastLang === lang()) {
      if (sim) { sim.alphaTarget(0.0032).restart(); }
      return;
    }
    render();
  }

  // 模态开合：由词云工作台(wordcloud.js)广播
  window.addEventListener("wc-modal-change", function (e) {
    var d = e.detail || {};
    if (d.open && d.tab === "net") {
      requestAnimationFrame(function () { setTimeout(renderOrResume, 40); });
    } else if (!d.open && sim) {
      sim.alphaTarget(0); sim.stop();   // 关闭时停表，省电
    }
  });

  // 语言切换：监听 html[lang]（不侵入站点原语言逻辑）
  var lt = null;
  new MutationObserver(function () {
    clearTimeout(lt);
    lt = setTimeout(function () { fillEntry(); if (paneVisible()) render(); }, 70);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  // 响应式重排（仅面板可见时）
  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (paneVisible()) render(); }, 220);
  });
})();
