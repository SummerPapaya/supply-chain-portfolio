/* docs/wordcloud.js — 雷达词频工作台（d3-cloud）
 * 结构：主页面上只有一张折叠「入口卡」；点击打开全屏模态，模态内用按钮切换 词云 / 共现网络 两个视图。
 * 词云本体：跟随站点主题(切主题不重绘、仅靠 CSS 过渡)与语言(监听 html[lang])；
 * 入场 stagger 微动效，hover 轻放大+辉光，点击开抽屉列关联新闻并跳往期存档。
 * 渐进增强：d3 / d3-cloud 未加载或数据不可用时静默降级，不白屏。
 */
(function () {
  "use strict";
  var svg = document.getElementById("wordcloudSvg");
  if (!svg) return;
  var drawer = document.getElementById("wcDrawer");
  var overlay = document.getElementById("wcOverlay");
  var drawerWord = document.getElementById("wcDrawerWord");
  var drawerBody = document.getElementById("wcDrawerBody");
  var closeBtn = document.getElementById("wcDrawerClose");
  var legend = document.getElementById("wcLegend");

  var modal = document.getElementById("wcModal");
  var tabCloud = document.getElementById("wcTabCloud");
  var tabNet = document.getElementById("wcTabNet");
  var paneCloud = document.getElementById("wcPaneCloud");
  var modalTitle = document.getElementById("wcModalTitle");
  var modalClose = document.getElementById("wcModalClose");

  var entryCloud = document.getElementById("wcEntryCloud");
  var entryCloudTitle = document.getElementById("wcEntryCloudTitle");
  var entryGoCloud = document.getElementById("wcGoCloud");
  var statsCloud = document.getElementById("wcStatsCloudMain");
  var chipsCloud = document.getElementById("wcChipsCloud");

  var DATA = null;
  var curTab = "cloud";

  function lang() { return document.documentElement.lang === "en" ? "en" : "zh"; }
  function cloudVisible() {
    return modal && !modal.hidden && paneCloud && paneCloud.classList.contains("active");
  }

  function showError() {
    svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="var(--ink-mute)" font-size="13">词云数据不可用 / word cloud data unavailable</text>';
  }
  // 同源 fetch（GitHub Pages 与本地预览均可用）；不再内联，避免 index.html 膨胀
  fetch("wordcloud-data.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) { DATA = j; fillEntry(); if (cloudVisible()) render(); })
    .catch(function () { showError(); });

  var CATS = [
    { zh: "重点新闻", en: "Key News", color: "#e05656" },
    { zh: "热门议题", en: "Hot Topics", color: "#f0a13a" },
    { zh: "研究瞭望", en: "Research", color: "#5b8cff" },
    { zh: "应用风向", en: "Apps & Adoption", color: "#35c2b0" }
  ];
  var FONT = 'Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---- 入口卡（折叠态摘要：标题 / 统计 / 高频词 chips；共现网络统计由 wordcloud-network.js 填 wcStatsNetExtra）---- */
  function fillEntry() {
    if (!DATA) return;
    var l = lang();
    var list = DATA[l] || [];
    if (entryCloudTitle) entryCloudTitle.innerHTML =
      (l === "en" ? "Top Keywords" : "重点高频词") + ' <span class="wc-entry-arrow">↗</span>';
    if (statsCloud) statsCloud.textContent = l === "en"
      ? DATA.periods + " issues · " + list.length + " keywords · click for linked news"
      : "跨 " + DATA.periods + " 期 · " + list.length + " 个关键词 · 点击看关联新闻";
    if (entryGoCloud) entryGoCloud.textContent = l === "en" ? "Open workspace →" : "点击展开 →";
    if (chipsCloud) {
      chipsCloud.innerHTML = list.slice(0, 8).map(function (d) {
        return '<span class="wc-chip" style="color:' + d.cat + ';border-color:' + d.cat + '55;background:' + d.cat + '14">' +
          escapeHtml(d.text) + "</span>";
      }).join("");
    }
  }

  function renderLegend(l) {
    if (!legend) return;
    legend.innerHTML = CATS.map(function (c) {
      return '<span class="wc-leg"><i style="--cat:' + c.color + '"></i>' + (l === "en" ? c.en : c.zh) + "</span>";
    }).join("");
  }

  function currentWords() {
    var l = lang();
    return (DATA[l] || []).map(function (d) {
      return { text: d.text, size: d.size, cat: d.cat, count: d.count, items: d.items };
    });
  }

  function render() {
    if (!DATA) return;
    if (typeof d3 === "undefined" || !d3.layout || !d3.layout.cloud) return;
    var l = lang();
    // d3.layout.cloud 会往 word 对象上写 x/y/rotate 等字段，直接喂原对象会污染 DATA，
    // 切语言重渲时字号就不对了 —— currentWords() 的浅拷贝正是为此，这里不再二次拷贝。
    var words = currentWords();
    renderLegend(l);

    var rect = svg.getBoundingClientRect();
    var W = Math.max(320, Math.floor(rect.width) || 980);
    var H = Math.max(320, Math.floor(rect.height) || 560);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = "";

    var layout = d3.layout.cloud()
      .size([W, H])
      .words(words)
      .padding(3)
      .rotate(function () { return 0; })
      .font(FONT)
      .fontSize(function (d) { return d.size; })
      .on("end", draw);
    layout.start();

    function draw(placed) {
      var g = d3.select(svg).append("g").attr("transform", "translate(" + (W / 2) + "," + (H / 2) + ")");
      var sel = g.selectAll("g.wc-word").data(placed).enter().append("g")
        .attr("class", "wc-word")
        .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ") rotate(" + d.rotate + ")"; })
        .style("opacity", 0)
        .style("cursor", "pointer")
        .on("click", function (e, d) { openDrawer(d); });
      sel.append("text")
        .style("--cat", function (d) { return d.cat; })
        .style("font-family", FONT)
        .style("font-size", function (d) { return d.size + "px"; })
        .style("font-weight", "600")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .text(function (d) { return d.text; });
      sel.transition().duration(450).delay(function (d, i) { return i * 22; }).style("opacity", 1);
    }
  }

  /* ---- 模态工作台 ---- */
  function applyChromeText() {
    var l = lang();
    if (tabCloud) tabCloud.textContent = l === "en" ? "Cloud" : "词云";
    if (tabNet) tabNet.textContent = l === "en" ? "Network" : "共现网络";
    if (modalTitle) modalTitle.textContent = l === "en"
      ? (curTab === "cloud" ? "Keyword Frequency · Cross-week Keywords" : "Keyword Co-occurrence Network · Cross-week Context")
      : (curTab === "cloud" ? "雷达词频 · 跨周关键词" : "关键词共现网络 · 跨周语境");
  }

  function activate(tab) {
    curTab = tab;
    if (tabCloud) tabCloud.classList.toggle("active", tab === "cloud");
    if (tabNet) tabNet.classList.toggle("active", tab === "net");
    if (paneCloud) paneCloud.classList.toggle("active", tab === "cloud");
    var paneNet = document.getElementById("wcPaneNet");
    if (paneNet) paneNet.classList.toggle("active", tab === "net");
    applyChromeText();
    // 广播给网络脚本（wordcloud-network.js 监听）
    window.dispatchEvent(new CustomEvent("wc-modal-change", { detail: { open: true, tab: tab } }));
    if (tab === "cloud") {
      requestAnimationFrame(function () { setTimeout(function () { if (cloudVisible()) render(); }, 40); });
    }
  }

  function openModal(tab) {
    if (!modal) return;
    closeDrawer();
    curTab = tab || curTab;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(function () { modal.classList.add("open"); });
    activate(curTab);
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    closeDrawer();
    modal.classList.remove("open");
    document.body.style.overflow = "";
    window.dispatchEvent(new CustomEvent("wc-modal-change", { detail: { open: false, tab: curTab } }));
    setTimeout(function () { modal.hidden = true; }, 240);
  }

  if (entryCloud) entryCloud.addEventListener("click", function () { openModal("cloud"); });
  if (entryCloud) entryCloud.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entryCloud.click(); }
  });
  if (tabCloud) tabCloud.addEventListener("click", function () { activate("cloud"); });
  if (tabNet) tabNet.addEventListener("click", function () { activate("net"); });
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

  /* ---- 抽屉（关联新闻）---- */
  function openDrawer(d) {
    if (!drawer) return;
    var l = lang();
    drawerWord.textContent = d.text + "  ·  " + d.count;
    var items = (d.items || []).map(function (it) {
      var title = l === "en" ? it.titleEn : it.titleZh;
      // 链接样式统一由 .wc-item-meta a 提供，不再挂没有对应规则的 wc-src / wc-arch 钩子
      var src = it.url ? '<a href="' + it.url + '" target="_blank" rel="noopener">来源 / source ↗</a>' : "";
      var arch = '<a href="radar-archive/' + it.date + '.json" target="_blank" rel="noopener">' + it.date + " ↗</a>";
      return '<div class="wc-item"><span class="wc-dot" style="--cat:' + it.cat + '"></span>' +
        '<div class="wc-item-main"><div class="wc-item-title">' + escapeHtml(title) + "</div>" +
        '<div class="wc-item-meta">' + arch + src + "</div></div></div>";
    }).join("");
    drawerBody.innerHTML = items || '<div class="wc-empty">暂无关联新闻 / no linked news</div>';
    drawer.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(function () {
      drawer.classList.add("open");
      overlay.classList.add("show");
    });
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    setTimeout(function () { if (drawer) drawer.hidden = true; if (overlay) overlay.hidden = true; }, 260);
  }

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (overlay) overlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (drawer && !drawer.hidden) { closeDrawer(); return; }
    closeModal();
  });

  // 语言切换：监听 html[lang]（不侵入站点原 lang 代码）
  var cloudTimer = null;
  var mo = new MutationObserver(function () {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(function () {
      fillEntry();
      applyChromeText();
      if (cloudVisible()) render();
    }, 60);
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  // 响应式重排（仅面板可见时）
  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (cloudVisible()) render(); }, 200);
  });
})();
