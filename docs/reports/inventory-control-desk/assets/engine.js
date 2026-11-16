/* =============================================================================
 * 库存控制指标引擎 · Inventory Control Metrics Engine
 * -----------------------------------------------------------------------------
 * 单一计算源：UI 不得自行计算任何业务指标，只消费 compute() 的输出。
 * 口径：连续检查 (s,Q) + 周期性检查 P；CSL 服务水平；FIFO 批次库龄。
 * 所有分母为 0 / 样本不足的指标返回 null，由 UI 显示 "—"，不得显示 0 或 ∞。
 * ========================================================================== */
(function (global) {
  'use strict';

  const Z_TABLE = { '0.90': 1.2816, '0.95': 1.6449, '0.975': 1.9600, '0.99': 2.3263, '0.995': 2.5758 };
  const DAY = 86400000;
  const WEEK = 7 * DAY;

  /* ------------------------------------------------------------------ 金额币种
   * 币种属于「数据事实」，由 dataset.meta.currency 声明（ISO 4217），不再写死在 UI。
   * 优先级：显式 cfg > data.params > data.meta > DEFAULTS。币种只影响金额展示与导出
   * 元信息，不参与任何指标计算，也不做汇率换算——跨币种数据必须在导入前自行统一。
   */
  const CURRENCIES = {
    GBP: { symbol: '£', name: '英镑', en: 'Pound Sterling' },
    CNY: { symbol: '¥', name: '人民币', en: 'Chinese Yuan' },
    USD: { symbol: '$', name: '美元', en: 'US Dollar' },
    EUR: { symbol: '€', name: '欧元', en: 'Euro' },
    JPY: { symbol: '¥', name: '日元', en: 'Japanese Yen' },
    HKD: { symbol: 'HK$', name: '港元', en: 'Hong Kong Dollar' },
    SGD: { symbol: 'S$', name: '新加坡元', en: 'Singapore Dollar' },
  };
  // 容错：兼容 ISO code、符号与常见别名。'¥' 在 CNY/JPY 间歧义，默认归 CNY，
  // 需要日元时请显式写 JPY。未识别的一律回退 GBP，且必须能在界面上被看到。
  const CURRENCY_ALIAS = {
    GBP: 'GBP', '£': 'GBP', STERLING: 'GBP', POUND: 'GBP',
    CNY: 'CNY', '¥': 'CNY', RMB: 'CNY', '￥': 'CNY',
    USD: 'USD', '$': 'USD', 'US$': 'USD',
    EUR: 'EUR', '€': 'EUR',
    JPY: 'JPY', HKD: 'HKD', 'HK$': 'HKD',
    SGD: 'SGD', 'S$': 'SGD',
  };
  function normalizeCurrency(v) {
    if (v === null || v === undefined) return 'GBP';
    const key = String(v).trim().toUpperCase();
    return CURRENCIES[CURRENCY_ALIAS[key] || ''] ? CURRENCY_ALIAS[key] : 'GBP';
  }
  function currencyInfo(code) { return CURRENCIES[normalizeCurrency(code)]; }
  let activeCurrency = 'GBP';
  function setCurrency(code) { activeCurrency = normalizeCurrency(code); return activeCurrency; }
  function currentCurrency() { return activeCurrency; }
  function currencySymbol() { return CURRENCIES[activeCurrency].symbol; }

  // 逆标准正态 CDF：查表优先，自定义档位走 Acklam 三段有理逼近（精度 <1.2e-9）
  function zFor(csl) {
    const pv = Number(csl);
    // 表键保留 "0.90" 这类写法，按数值比较，避免 0.9 → "0.9" 查不到 "0.90"
    for (const k of Object.keys(Z_TABLE)) {
      if (Math.abs(Number(k) - pv) < 1e-9) return Z_TABLE[k];
    }
    if (!isFinite(pv) || pv <= 0 || pv >= 1) return Z_TABLE['0.95']; // 非法 CSL 回退默认档
    const p = Math.min(1 - 1e-12, Math.max(1e-12, pv));
    const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    const h6 = (v, x) => (((((v[0]*x+v[1])*x+v[2])*x+v[3])*x+v[4])*x+v[5]);
    const h5 = (v, x) => ((((v[0]*x+v[1])*x+v[2])*x+v[3])*x+v[4])*x+1;
    const h4 = (v, x) => (((v[0]*x+v[1])*x+v[2])*x+v[3])*x+1;
    const plow = 0.02425, phigh = 1 - plow;
    if (p < plow) {                       // 低尾：x < -1.96
      const q = Math.sqrt(-2 * Math.log(p));
      return h6(c, q) / h4(d, q);
    }
    if (p > phigh) {                      // 高尾：x > 1.96，注意取负号
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -h6(c, q) / h4(d, q);
    }
    const q = p - 0.5, r = q * q;         // 中心区：自变量为 r = q²
    return q * h6(a, r) / h5(b, r);
  }

  const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
  const mean = a => a.length ? sum(a) / a.length : 0;
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a), v = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
    return Math.sqrt(v);
  }
  const r1 = v => v === null ? null : Math.round(v * 10) / 10;
  const dt = s => new Date(s + 'T00:00:00');
  const daysBetween = (a, b) => Math.round((dt(b) - dt(a)) / DAY);
  // 本地日历日期，禁止用 toISOString() 输出（东八区会整体回退一天）
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const clamp = (v, lo, hi, dflt) => {
    const x = Number(v);
    return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
  };

  const RULE_META = {
    STOCKOUT:   { name: '缺货风险',     en: 'Stockout Risk',      sev: 'critical', desc: '提前期窗口内预计可用量转负' },
    REPLENISH:  { name: '触发补货',     en: 'Reorder Trigger',    sev: 'high',     desc: '库存位置 IP ≤ 补货点 ROP' },
    BUFFER:     { name: '缓冲击穿',     en: 'Buffer Breach',      sev: 'high',     desc: '预计可用量跌破安全库存 SS' },
    PO_OVERDUE: { name: '采购逾期',     en: 'PO Overdue',         sev: 'critical', desc: '承诺交期已过且未清量 > 0' },
    TRANSIT:    { name: '在途逾期',     en: 'Transit Overdue',    sev: 'high',     desc: 'ETA 已过但仍在途' },
    OVERSTOCK:  { name: '超储',         en: 'Overstock',          sev: 'medium',   desc: '现货量超过目标库存上限' },
    WOS_HIGH:   { name: '覆盖周数过高', en: 'WOS Above Range',    sev: 'medium',   desc: 'WOS 高于品类上限' },
    OBSOLETE:   { name: '呆滞批次',     en: 'Obsolete Batch',     sev: 'high',     desc: '批次库龄超阈值或长期无动销' },
    EO_RATIO:   { name: '冗余占比过高', en: 'E&O Ratio High',     sev: 'medium',   desc: 'E&O 金额占 SKU 库存金额超阈值' },
    WOS_LOW:    { name: '覆盖周数不足', en: 'WOS Below Range',    sev: 'medium',   desc: 'WOS 低于品类下限' },
    TURNOVER:   { name: '周转偏低',     en: 'Turnover Low',       sev: 'low',      desc: '年化周转率低于阈值' },
    NO_DEMAND:  { name: '无需求样本',   en: 'No Demand History',  sev: 'low',      desc: '统计窗口内无需求，相关指标不计算' },
    DQ:         { name: '数据质量',     en: 'Data Quality',       sev: 'low',      desc: '状态桶求和与现货量不一致' },
  };

  const DEFAULTS = {
    csl: 0.95,
    // 仅作为「数据集未声明币种」时的兜底；演示数据由 meta.currency 声明 GBP
    currency: 'GBP',
    cost_rate: 0.55,
    lead_factor: 1.0,
    target_cover_weeks: 4,
    review_period_weeks: 1,
    demand_window_weeks: 26,
    turnover_window_weeks: 26,
    active_window_weeks: 4,
    stale_days: 180,
    stale_no_move_weeks: 13,
    wos_min: 2.0,
    wos_max: 16.0,
    turnover_min: 3.0,
    eo_ratio_max: 0.15,
    provision_rate: 0.30,
    horizon_weeks: 12,
    cost_basis: 'estimated',
    moq: 24,
    pack: 12,
    // 供应商实测 OTD 滚动更新 L / σ_L：默认 contract，保证既有结论可复现
    // contract = 契约主数据；rolling = 窗口内实测值（样本达标才全采信）；blend = 贝叶斯式收缩
    lead_source: 'contract',
    otd_basis: 'eta',            // eta = 确认 ETA 口径；contract = 合同承诺日口径
    otd_window_weeks: 26,        // 以快照日回溯的滚动统计窗口
    otd_min_samples: 6,          // 完全采信实测的最少交付笔数
    otd_prior_strength: 6,       // 收缩先验强度 w = n / (n + prior)
    otd_grace_days: 0,           // 准时判定宽限天数
    otd_tail: 1,                 // 右尾保护：P90 提前期反推等效 σ
    otd_target: 0.90,            // OTD 目标线（仅风险标记，不改公式）
    otd_drift_pct: 0.20,         // 实测 L 相对契约 L 的漂移预警线
    // ABC×XYZ 差异化服务水平：默认 global，保证既有结论与导出口径不变
    segment_csl: 'global',
    abc_mode: 'supplied',
    abc_cut_a: 0.80,
    abc_cut_b: 0.95,
    xyz_cv_x: 0.50,
    xyz_cv_y: 1.00,
    xyz_zero_x: 0.05,
    xyz_zero_y: 0.35,
    // 行 = ABC，列 = XYZ。A 类稳定品提高保障，C 类长尾间歇品降低保障
    csl_matrix: {
      AX: 0.99, AY: 0.975, AZ: 0.95,
      BX: 0.975, BY: 0.95, BZ: 0.90,
      CX: 0.95, CY: 0.90, CZ: 0.85,
    },
    age_buckets: [
      { id: 'A0', label: '0–30 天', lo: 0, hi: 31 },
      { id: 'A1', label: '31–60 天', lo: 31, hi: 61 },
      { id: 'A2', label: '61–90 天', lo: 61, hi: 91 },
      { id: 'A3', label: '91–180 天', lo: 91, hi: 181 },
      { id: 'A4', label: '>180 天', lo: 181, hi: 100000 },
    ],
  };

  // 参数校验：导入的 JSON 可能缺字段或带越界值，先钳制再计算，避免 Infinity / NaN / 抛异常
  function sanitize(p) {
    const lim = {
      cost_rate: [0.01, 1], lead_factor: [0.1, 5], target_cover_weeks: [0, 52],
      review_period_weeks: [1, 12], demand_window_weeks: [1, 52], turnover_window_weeks: [1, 52],
      active_window_weeks: [1, 52], stale_days: [1, 3650], stale_no_move_weeks: [1, 52],
      wos_min: [0, 100], wos_max: [0, 200], turnover_min: [0, 100], eo_ratio_max: [0, 1],
      provision_rate: [0, 1], horizon_weeks: [1, 52], moq: [1, 1e7], pack: [1, 1e7],
      abc_cut_a: [0.1, 0.99], abc_cut_b: [0.1, 0.999],
      xyz_cv_x: [0.05, 5], xyz_cv_y: [0.1, 10], xyz_zero_x: [0, 1], xyz_zero_y: [0, 1],
      otd_window_weeks: [1, 104], otd_min_samples: [1, 200], otd_prior_strength: [1, 200],
      otd_grace_days: [0, 30], otd_target: [0.5, 1], otd_drift_pct: [0, 2],
    };
    Object.keys(lim).forEach(k => { p[k] = clamp(p[k], lim[k][0], lim[k][1], DEFAULTS[k]); });
    ['review_period_weeks', 'demand_window_weeks', 'turnover_window_weeks', 'active_window_weeks',
      'stale_no_move_weeks', 'horizon_weeks', 'moq', 'pack',
      'otd_window_weeks', 'otd_min_samples', 'otd_prior_strength', 'otd_grace_days'].forEach(k => { p[k] = Math.round(p[k]); });
    p.csl = clamp(p.csl, 0.0001, 0.9999, DEFAULTS.csl);
    p.currency = normalizeCurrency(p.currency);
    p.cost_basis = p.cost_basis === 'supplied' ? 'supplied' : 'estimated';
    p.segment_csl = p.segment_csl === 'matrix' ? 'matrix' : 'global';
    p.abc_mode = p.abc_mode === 'computed' ? 'computed' : 'supplied';
    p.lead_source = ['contract', 'rolling', 'blend'].indexOf(p.lead_source) >= 0 ? p.lead_source : 'contract';
    p.otd_basis = p.otd_basis === 'contract' ? 'contract' : 'eta';
    p.otd_tail = Number(p.otd_tail) ? 1 : 0;
    if (p.abc_cut_b < p.abc_cut_a) p.abc_cut_b = p.abc_cut_a;
    if (p.xyz_cv_y < p.xyz_cv_x) p.xyz_cv_y = p.xyz_cv_x;
    if (p.xyz_zero_y < p.xyz_zero_x) p.xyz_zero_y = p.xyz_zero_x;
    const mtx = Object.assign({}, DEFAULTS.csl_matrix, p.csl_matrix || {});
    SEGMENT_KEYS.forEach(k => { mtx[k] = clamp(mtx[k], 0.5, 0.9999, DEFAULTS.csl_matrix[k]); });
    p.csl_matrix = mtx;
    if (p.wos_max < p.wos_min) p.wos_max = p.wos_min;
    if (!Array.isArray(p.age_buckets) || !p.age_buckets.length) p.age_buckets = DEFAULTS.age_buckets;
    return p;
  }

  /* ---------------------------------------------------------------- ABC×XYZ 分类
   * 分类在 compute() 内对「全量 SKU」计算一次，筛选只影响展示、不改变分级结果，
   * 否则帕累托累计占比会随筛选变化，同一 SKU 在不同筛选下被划入不同类别。
   */
  const SEGMENT_KEYS = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];
  const SEGMENT_LABELS = {
    X: '稳定', Y: '波动', Z: '间歇',
  };

  function unitCostOf(s, p) {
    const supplied = Number(s.unit_cost);
    const estimated = Math.max(0.01, Math.round((Number(s.unit_price) || 0) * p.cost_rate * 100) / 100);
    const useSupplied = p.cost_basis === 'supplied' && isFinite(supplied) && supplied > 0;
    return { unitCost: useSupplied ? Math.round(supplied * 100) / 100 : estimated, costSource: useSupplied ? 'supplied' : 'estimated' };
  }

  // 周需求经验分布做 L 次离散卷积，确定性求提前期总需求 LTD 的 CSL 分位数。
  // 不假设正态，适用于间歇 / 厚尾需求；bins 限制状态空间，避免 L 较大时组合爆炸。
  function ltdQuantile(dw, L, csl, bins) {
    const vals = dw.map(v => Math.max(0, Math.round(Number(v) || 0)));
    if (!vals.length) return 0;
    const maxV = Math.max.apply(null, vals);
    if (maxV <= 0) return 0;
    const step = Math.max(1, Math.ceil(maxV / bins));
    const maxI = Math.max(1, Math.ceil(maxV / step));
    const pmf = new Float64Array(maxI + 1);
    vals.forEach(v => { pmf[Math.min(maxI, Math.round(v / step))] += 1 / vals.length; });
    let dist = new Float64Array([1]);
    const rounds = Math.max(1, Math.min(20, Math.round(L)));
    for (let k = 0; k < rounds; k++) {
      const nd = new Float64Array(dist.length + maxI);
      for (let i = 0; i < dist.length; i++) {
        if (!dist[i]) continue;
        for (let j = 0; j <= maxI; j++) if (pmf[j]) nd[i + j] += dist[i] * pmf[j];
      }
      dist = nd;
    }
    let acc = 0;
    for (let i = 0; i < dist.length; i++) {
      const na = acc + dist[i];
      // 离散点质量的累积分布是阶梯函数：跨过 CSL 的那个点即为分位数，
      // 线性插值会把常数需求 20 件算成 19.95，属系统性低估。
      if (na >= csl - 1e-12) return Math.max(0, i * step);
      acc = na;
    }
    return (dist.length - 1) * step;
  }
  // 提前期波动按「等效覆盖周数 L + σ_L」计入经验分布；L 非整数时上下取整插值
  function quantileLtd(dw, L, csl, bins) {
    const lo = Math.max(1, Math.floor(L)), hi = Math.max(lo, Math.ceil(L));
    const a = ltdQuantile(dw, lo, csl, bins);
    if (hi === lo) return a;
    return a + (ltdQuantile(dw, hi, csl, bins) - a) * (L - lo);
  }

  function classifySkus(list, p) {
    const win = p.demand_window_weeks;
    const rows = list.map(s => {
      const dw = (s.weekly || []).slice(-win).map(v => Math.max(0, Number(v) || 0));
      const dbar = mean(dw), sd = stdev(dw);
      const cv = dbar > 0 ? sd / dbar : null;
      const zeroRate = dw.length ? dw.filter(v => v <= 0).length / dw.length : 1;
      // 先判间歇性（零需求周占比），再判波动；CV 在 d̄→0 时不具可比性
      const xyz = cv === null ? 'Z' :
        (zeroRate > p.xyz_zero_y || cv > p.xyz_cv_y) ? 'Z' :
          (zeroRate <= p.xyz_zero_x && cv <= p.xyz_cv_x) ? 'X' : 'Y';
      const { unitCost, costSource } = unitCostOf(s, p);
      return {
        id: s.id, dw, dbar, sd, cv, zeroRate, xyz, unitCost, costSource,
        demandValue: dbar * 52 * unitCost,  // 年化消耗金额（成本口径）
        abc: String(s.abc || '').trim().toUpperCase(),
      };
    });
    const hasSupplied = p.abc_mode === 'supplied' && rows.every(r => r.abc === 'A' || r.abc === 'B' || r.abc === 'C');
    let abcSource = 'supplied';
    if (hasSupplied) {
      // 沿用 ERP / 主数据分级
    } else {
      abcSource = 'computed';
      const total = sum(rows.map(r => r.demandValue));
      const order = rows.map((r, i) => i).sort((a, b) => rows[b].demandValue - rows[a].demandValue);
      let cum = 0;
      order.forEach(i => {
        const before = cum;
        cum += total > 0 ? rows[i].demandValue / total : 0;
        // 跨越阈值的那个 SKU 仍计入上一档，符合帕累托惯例
        rows[i].abc = before < p.abc_cut_a ? 'A' : before < p.abc_cut_b ? 'B' : 'C';
      });
    }
    rows.forEach(r => {
      r.key = r.abc + r.xyz;
      r.csl = p.segment_csl === 'matrix' ? p.csl_matrix[r.key] : p.csl;
      r.model = (p.segment_csl === 'matrix' && r.xyz === 'Z' && r.dbar > 0) ? 'empirical' : 'normal';
      r.abcSource = abcSource;
    });
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });
    return { rows, byId, abcSource };
  }

  /* ------------------------------------------------ 供应商实测 OTD 滚动 L / σ_L
   * 事实层：deliveries 只存日期（下单 / 合同承诺 / 确认 ETA / 实收），所有判定在此计算。
   * 统计层：以快照日回溯 otd_window_weeks 周；L̂ = 实测提前期均值，σ̂ 取样本标准差与
   *   「P90 右尾反推等效 σ」的较大者——延迟分布右偏，单用标准差会系统性低估长尾。
   * 决策层：contract 完全沿用契约主数据；rolling 在样本达标后全采信；blend 用
   *   w = n/(n+prior) 向契约值收缩，样本不足时自动降权并标记回退原因。
   */
  const LEAD_SOURCES = { contract: '契约静态', rolling: '实测滚动', blend: '收缩混合' };
  const RISK_LABELS = {
    OTD_LOW: 'OTD 低于目标', THIN_SAMPLE: '样本不足', LEAD_DRIFT: '实测交期漂移',
  };
  // 经验分位数取阶梯值（向上取整索引），与 ltdQuantile 的口径一致，不做线性插值
  function qAtSorted(a, q) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.max(0, Math.min(s.length - 1, Math.ceil(q * s.length) - 1))];
  }
  function finiteOr(v, dflt) { const x = Number(v); return isFinite(x) && x !== 0 ? x : dflt; }

  function computeLeadTimes(data, p, snapISO) {
    const skus = data.skus || [];
    const skuBySup = {};
    skus.forEach(s => (skuBySup[s.supplier] || (skuBySup[s.supplier] = [])).push(s));
    const supMeta = {};
    const supCfg = (data.params && Array.isArray(data.params.suppliers)) ? data.params.suppliers : [];
    supCfg.forEach(x => { if (x && x.id) supMeta[x.id] = x; });

    const winStart = isoLocal(new Date(dt(snapISO).getTime() - p.otd_window_weeks * 7 * DAY));
    const grace = p.otd_grace_days, basis = p.otd_basis;
    // 事实增强：所有派生判定都在这里产出，UI 与导出只消费结果
    const deliveries = (data.deliveries || []).map(d => {
      const leadActualDays = daysBetween(d.order_date, d.receipt_date);
      const delayDays = daysBetween(d.eta, d.receipt_date);
      const delayContractDays = daysBetween(d.promise_date, d.receipt_date);
      const onTime = delayDays <= grace, onTimeContract = delayContractDays <= grace;
      return {
        ...d, leadActualDays, delayDays, delayContractDays, onTime, onTimeContract,
        onTimeBasis: basis === 'contract' ? onTimeContract : onTime,
        inWindow: !!d.receipt_date && d.receipt_date <= snapISO && d.receipt_date >= winStart &&
          isFinite(leadActualDays) && leadActualDays > 0,
      };
    });
    const bySup = {};
    deliveries.forEach(d => { if (d.inWindow) (bySup[d.supplier] || (bySup[d.supplier] = [])).push(d); });
    const ids = Array.from(new Set(skus.map(s => s.supplier).concat(Object.keys(bySup)))).filter(Boolean).sort();

    const rows = ids.map(id => {
      const g = bySup[id] || [], ss = skuBySup[id] || [], m = supMeta[id] || {};
      const contractL = finiteOr(m.lead_days, finiteOr(mean(ss.map(x => x.lead_days)), 14));
      const contractSd = finiteOr(m.lead_sd_days, Math.max(0, mean(ss.map(x => x.lead_sd_days))));
      const n = g.length;
      const leads = g.map(d => d.leadActualDays);
      const obsL = n ? mean(leads) : null;
      const obsSd = n >= 2 ? stdev(leads) : null;
      const q90Lead = n ? qAtSorted(leads, 0.9) : null;
      const sigmaTail = (p.otd_tail && n >= 2) ? Math.max(0, (q90Lead - obsL) / Z_TABLE['0.90']) : null;
      const sigmaUsed = obsSd === null ? null : Math.max(obsSd, sigmaTail === null ? 0 : sigmaTail);
      const otdRate = n ? g.filter(d => d.onTime).length / n : null;
      const otdContractRate = n ? g.filter(d => d.onTimeContract).length / n : null;
      const otdBasisRate = basis === 'contract' ? otdContractRate : otdRate;
      const avgDelay = n ? mean(g.map(d => d.delayDays)) : null;

      let w = 0, fallback = 'contract_mode';
      if (p.lead_source === 'rolling' || p.lead_source === 'blend') {
        w = p.lead_source === 'rolling' && n >= p.otd_min_samples
          ? 1 : n / (n + Math.max(1, p.otd_prior_strength));
        fallback = n === 0 ? 'no_deliveries' : n < p.otd_min_samples ? 'insufficient_samples' : 'none';
      }
      let effL = n ? w * obsL + (1 - w) * contractL : contractL;
      let effSd = n ? w * sigmaUsed + (1 - w) * contractSd : contractSd;
      if (p.lead_source !== 'contract') {
        // 脏数据防护：实测均值不得偏离契约 0.4~2.5 倍，σ 不得大于均值
        effL = Math.min(contractL * 2.5, Math.max(contractL * 0.4, effL));
        effSd = Math.min(effL * 0.8, Math.max(0, effSd));
      }
      const risks = [];
      if (otdBasisRate !== null && otdBasisRate < p.otd_target) risks.push('OTD_LOW');
      if (n > 0 && n < p.otd_min_samples) risks.push('THIN_SAMPLE');
      if (n > 0 && obsL - contractL > contractL * p.otd_drift_pct) risks.push('LEAD_DRIFT');
      return {
        id, skus: ss.length, n,
        deliveriesTotal: deliveries.filter(d => d.supplier === id).length,
        contractL, contractSd, obsL, obsSd, q90Lead, sigmaTail, sigmaUsed,
        otdRate, otdContractRate, otdBasisRate, avgDelay,
        p90Delay: n ? qAtSorted(g.map(d => d.delayDays), 0.9) : null,
        maxLate: n ? Math.max.apply(null, g.map(d => d.delayDays)) : null,
        weight: w, fallback, effL, effSd, risks,
        ssCurrent: 0, ssContract: 0, ssDelta: 0,
        ssValueCurrent: 0, ssValueContract: 0, ssValueDelta: 0,
      };
    });
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });
    const win = deliveries.filter(d => d.inWindow);
    const summary = {
      mode: p.lead_source, basis, windowWeeks: p.otd_window_weeks, windowStart: winStart, windowEnd: snapISO,
      suppliers: rows.length, deliveries: deliveries.length, inWindow: win.length,
      otdRate: win.length ? win.filter(d => d.onTimeBasis).length / win.length : null,
      otdEtaRate: win.length ? win.filter(d => d.onTime).length / win.length : null,
      otdContractRate: win.length ? win.filter(d => d.onTimeContract).length / win.length : null,
      avgDelay: win.length ? mean(win.map(d => d.delayDays)) : null,
      avgLead: win.length ? mean(win.map(d => d.leadActualDays)) : null,
      activeSuppliers: rows.filter(r => r.weight > 0).length,
      fallbackCount: rows.filter(r => r.fallback === 'no_deliveries' || r.fallback === 'insufficient_samples').length,
      riskCount: rows.filter(r => r.risks.length).length,
      ssCurrent: 0, ssContract: 0, ssDelta: 0,
      ssValueCurrent: 0, ssValueContract: 0, ssValueDelta: 0,
      avgLeadEffective: null, avgSdEffective: null,
    };
    return { rows, byId, deliveries, summary };
  }

  // 同一 SKU 在「生效 L/σ_L」与「契约 L/σ_L」下各算一次 SS，用于归因，不重算台账
  function ssForSku(cls, cslEff, z, L, Lsd, dbar, sd) {
    const ssNormal = z * Math.sqrt(L * sd * sd + dbar * dbar * Lsd * Lsd);
    let ss = ssNormal, qLtd = null, ssModel = 'normal';
    const dw = cls.dw;
    const usable = dw.length >= 13 && dw.filter(v => v > 0).length >= 6;
    if (cls.model === 'empirical' && usable) {
      qLtd = quantileLtd(dw, Math.min(20, L + Lsd), cslEff, 64);
      ss = Math.max(0, qLtd - dbar * L);
      ssModel = 'empirical';
    } else if (cls.model === 'empirical') ssModel = 'normal_fallback';
    return { ss, ssNormal, qLtd, ssModel };
  }

  function computeSku(s, pos, p, n, snapISO, cls, leadTimes) {
    // 成本口径：estimated = 售价 × 成本率（演示态）；supplied = 采用导入的真实单位成本
    const unitCost = cls.unitCost, costSource = cls.costSource;
    // 需求序列与分类共用同一份样本，避免 d̄/σ_d 与 XYZ 分级取自不同窗口
    const dw = cls.dw, dbar = cls.dbar, sd = cls.sd;
    const cslEff = cls.csl;
    const z = zFor(cslEff);
    // 生效提前期：默认严格取契约主数据（与历史基线逐位一致）；
    // 切到 rolling / blend 后取供应商实测滚动结果，lead_factor 仍统一作用于 L 与 σ_L。
    const ltRow = leadTimes && leadTimes.byId ? leadTimes.byId[s.supplier] : null;
    const contractL = Number(s.lead_days) || 0, contractSd = Number(s.lead_sd_days) || 0;
    const useObserved = p.lead_source !== 'contract' && ltRow && ltRow.n > 0;
    const leadDays = useObserved ? ltRow.effL : contractL;
    const leadSdDays = useObserved ? ltRow.effSd : contractSd;
    const L = Math.max(1, Math.ceil(leadDays * p.lead_factor / 7));
    const Lsd = leadSdDays * p.lead_factor / 7;
    const P = p.review_period_weeks;

    // 安全库存：需求波动 + 提前期波动（标准正态式，量纲为「件」）；
    // Z 类（间歇/厚尾）改用 LTD 经验分位数，样本不足回退正态（见 ssForSku）。
    const cur = ssForSku(cls, cslEff, z, L, Lsd, dbar, sd);
    const { ss, ssNormal, qLtd, ssModel } = cur;
    // 契约口径对照：同一 CSL / 同一模型，只把 L 与 σ_L 换回主数据，用于 ΔSS 归因
    const Lc = Math.max(1, Math.ceil(contractL * p.lead_factor / 7));
    const Lsdc = contractSd * p.lead_factor / 7;
    const base = useObserved ? ssForSku(cls, cslEff, z, Lc, Lsdc, dbar, sd) : cur;
    const ssContract = base.ss, ropContract = dbar * Lc + ssContract;
    const rop = dbar * L + ss;
    // 目标库存上限：超储、冗余、超储预警共用同一函数
    const maxTarget = dbar * (L + P) + ss + p.target_cover_weeks * dbar;

    const onHand = s.on_hand;
    const available = Math.max(0, onHand - s.reserved - s.quarantine - s.blocked);
    const openPos = pos.filter(x => x.status !== 'CLOSED' && x.qty - x.received_qty > 0.5);
    const isShipped = x => x.status === 'IN_TRANSIT' || x.status === 'OVERDUE' || x.status === 'PARTIAL';
    const inTransit = sum(openPos.filter(isShipped).map(x => x.qty - x.received_qty));
    const notShipped = sum(openPos.filter(x => !isShipped(x)).map(x => x.qty - x.received_qty));
    const onOrder = inTransit + notShipped;
    // 库存位置 IP：补货判定用 IP，不用 on_hand
    const ip = available + onOrder;

    // 供需时间轴 PA(t)：未来 H 周，需求基准 = 近窗周均（history）
    const H = p.horizon_weeks;
    const receipts = new Array(H).fill(0);
    openPos.forEach(x => {
      const k = Math.round((dt(x.eta) - dt(snapISO)) / WEEK);
      if (k >= 0 && k < H) receipts[k] += x.qty - x.received_qty;
    });
    const pa = []; let bal = available;
    for (let k = 0; k < H; k++) {
      bal += receipts[k] - dbar;
      pa.push(bal);
    }
    const minPa = pa.length ? Math.min(...pa) : available;
    const stockoutIdx = pa.findIndex(v => v < 0);
    const coverHorizon = Math.min(H, L + P);
    const minPaInLead = pa.length ? Math.min(...pa.slice(0, Math.max(1, Math.min(pa.length, coverHorizon)))) : available;
    // 本地日历日：toISOString() 在东八区会把周一回退成周日
    const stockoutDate = stockoutIdx < 0 ? null :
      isoLocal(new Date(dt(snapISO).getTime() + stockoutIdx * WEEK));
    // 归零时点按当周「实际降幅」线性插值，不能假定降幅恒等于 dbar（该周可能有计划到货）
    let wosForward = null;
    if (stockoutIdx >= 0) {
      const prev = stockoutIdx === 0 ? available : pa[stockoutIdx - 1];
      const drop = prev - pa[stockoutIdx];
      wosForward = drop > 0 ? Math.max(0, stockoutIdx + prev / drop) : stockoutIdx;
    }

    const wos = dbar > 0 ? available / dbar : null;

    // 周转（金额口径，COGS / 期间日均库存；期间库存用逐周结存均值）
    const tw = p.turnover_window_weeks;
    const issueQty = sum(s.weekly.slice(-tw));
    const cogs = issueQty * unitCost;
    const ohSeries = (s.weekly_oh || []).slice(-tw);
    const avgInvValue = ohSeries.length ? mean(ohSeries) * unitCost : null;
    const turnover = avgInvValue > 0 ? cogs / avgInvValue : null;
    const turnoverAnnual = turnover === null ? null : turnover * 52 / tw;
    const dio = turnover > 0 ? tw * 7 / turnover : null;
    const avgInvQty = ohSeries.length ? mean(ohSeries) : null;
    const turnoverQty = avgInvQty > 0 ? issueQty / avgInvQty : null;

    // 动销：期内有出库记录 / 在册 SKU；售罄率单独计算
    const active = sum(s.weekly.slice(-p.active_window_weeks)) > 0;
    let noMoveWeeks = 0;
    for (let i = s.weekly.length - 1; i >= 0; i--) {
      if (s.weekly[i] > 0) break; noMoveWeeks++;
    }
    // 售罄率：期间收货量不能只数可见 PO（PO 台账按最近 14 周裁剪，会漏历史收货，
    // 曾导致 85/120 个 SKU 售罄率 >100%）。改用逐周库存恒等式
    // recv_t = OH_t − OH_(t−1) + issue_t 反推，保证 期初 + 收货 ≥ 期间出库。
    const ohFull = s.weekly_oh || [], dFull = s.weekly || [];
    const start = Math.max(0, ohFull.length - tw);
    const beginQty = start > 0 ? ohFull[start - 1] : (ohFull.length ? ohFull[0] : onHand);
    let receivedQty = 0;
    for (let i = start; i < ohFull.length; i++) {
      const prev = i > 0 ? ohFull[i - 1] : beginQty;
      receivedQty += ohFull[i] - prev + (dFull[i] || 0);
    }
    const sellThrough = (beginQty + receivedQty) > 0
      ? Math.max(0, Math.min(1, issueQty / (beginQty + receivedQty))) : null;

    // 库龄：批次层，禁止用 SKU 平均库龄判定呆滞
    const buckets = p.age_buckets.map(b => ({ ...b, qty: 0, value: 0, skus: 0 }));
    let obsoleteByAge = 0, weightedAgeNum = 0, batchQty = 0;
    (s.batches || []).forEach(b => {
      const q = b.qty, v = q * unitCost;
      const bucket = buckets.find(x => b.age_days >= x.lo && b.age_days < x.hi) || buckets[buckets.length - 1];
      bucket.qty += q; bucket.value += v; bucket.skus += 1;
      weightedAgeNum += q * b.age_days; batchQty += q;
      if (b.age_days >= p.stale_days) obsoleteByAge += q;
    });
    const weightedAge = batchQty > 0 ? weightedAgeNum / batchQty : null;
    // Obsolete 与 Excess 必须互斥：先划 O，再在剩余部分算 E
    const obsolete = (s.lifecycle === 'PHASE_OUT' || noMoveWeeks >= p.stale_no_move_weeks)
      ? onHand : Math.min(onHand, obsoleteByAge);
    const eligible = Math.max(0, onHand - obsolete);
    const excess = Math.max(0, eligible - maxTarget);
    const onHandValue = onHand * unitCost;
    const excessValue = excess * unitCost;
    // 毛敞口与减值计提分开列示，避免「毛额 + 净额」混成一个无财务含义的 E&O 金额
    const obsoleteGrossValue = obsolete * unitCost;
    const provisionValue = obsoleteGrossValue * p.provision_rate;
    const obsoleteValue = obsoleteGrossValue - provisionValue;
    const grossEoValue = (excess + obsolete) * unitCost;
    const eoValue = grossEoValue - provisionValue;          // 计提后净敞口（数值口径保持兼容）
    const eoRatio = onHandValue > 0 ? eoValue / onHandValue : null;
    const grossEoRatio = onHandValue > 0 ? grossEoValue / onHandValue : null;

    // 可执行补货量：理论净需求 → 不低于 MOQ → 向上取整到包装倍数
    const netNeed = Math.max(0, maxTarget - ip);
    const moq = Math.max(1, p.moq), packSize = Math.max(1, p.pack);
    const suggestQty = dbar === 0 || netNeed <= 0 ? 0 : Math.max(moq, Math.ceil(netNeed / packSize) * packSize);
    const roundingExtra = Math.max(0, suggestQty - netNeed);

    // 无需求样本的 SKU 屏蔽数值型供需预警，只保留超储/呆滞/数据质量结论
    const hasDemand = dbar > 0;
    const tags = [];
    if (hasDemand && minPaInLead < 0) tags.push('STOCKOUT');
    if (hasDemand && ip <= rop) tags.push('REPLENISH');
    else if (hasDemand && minPaInLead >= 0 && minPaInLead < ss) tags.push('BUFFER');
    if (onHand > maxTarget * 1.05) tags.push('OVERSTOCK');
    if (obsolete > 0) tags.push('OBSOLETE');
    if (dbar === 0) tags.push('NO_DEMAND');
    if (noMoveWeeks > 0 && noMoveWeeks < p.stale_no_move_weeks && onHand > 0) tags.push('SLOW');

    return {
      ...s,
      m: {
        unitCost, costSource, dbar, sd, cv: cls.cv, zeroRate: cls.zeroRate,
        abc: cls.abc, xyz: cls.xyz, segment: cls.key, abcSource: cls.abcSource,
        cslEff, z, ssNormal, qLtd, ssModel,
        L, Lsd, P, ss, rop, maxTarget,
        leadSource: useObserved ? p.lead_source : 'contract',
        leadDays, leadSdDays, leadDaysContract: contractL, leadSdDaysContract: contractSd,
        leadWeight: useObserved ? ltRow.weight : 0,
        leadFallback: ltRow ? ltRow.fallback : 'no_deliveries',
        supplierOtd: ltRow ? ltRow.otdBasisRate : null,
        supplierDeliveries: ltRow ? ltRow.n : 0,
        ssContract, ropContract, ssDelta: ss - ssContract,
        netNeed, suggestQty, roundingExtra, moq, packSize,
        onHand, available, reserved: s.reserved, quarantine: s.quarantine, blocked: s.blocked,
        inTransit, notShipped, onOrder, ip,
        onHandValue, availableValue: available * unitCost,
        wos, wosForward, pa, receipts, minPa, minPaInLead, stockoutDate, stockoutIdx,
        issueQty, cogs, avgInvValue, turnover, turnoverAnnual, turnoverQty, dio,
        active, noMoveWeeks, sellThrough,
        ageBuckets: buckets, weightedAge, obsoleteByAge, obsolete, eligible, excess,
        excessValue, obsoleteGrossValue, provisionValue, obsoleteValue,
        grossEoValue, grossEoRatio, eoValue, eoRatio,
        tags, calcStatus: dbar === 0 ? 'no_demand' : 'ok',
        openPosCount: openPos.length,
      },
    };
  }

  function buildAlerts(skus, allPos, p, snapISO) {
    const out = [];
    const push = (rule, sku, current, threshold, note, date) => {
      const meta = RULE_META[rule];
      out.push({
        id: rule + ':' + (sku ? sku.id : 'GLOBAL'), rule, name: meta.name, en: meta.en,
        severity: meta.sev, desc: meta.desc,
        sku: sku ? sku.id : '', desc2: sku ? sku.desc : '', category: sku ? sku.category : '',
        warehouse: sku ? sku.warehouse : '', supplier: sku ? sku.supplier : '',
        current, threshold, note, date: date || null,
        status: 'OPEN', owner: '', reason: '',
      });
    };

    skus.forEach(s => {
      const m = s.m;
      const hasDemand = m.calcStatus !== 'no_demand';
      // 触发条件与展示值必须同口径：判定用 minPaInLead，当前值就不能填全视野的 minPa
      if (hasDemand && m.minPaInLead < 0) {
        const wider = m.minPa < m.minPaInLead - 0.5 ? ` · 全视野最低 ${Math.round(m.minPa)} 件` : '';
        push('STOCKOUT', s, Math.round(m.minPaInLead), 0,
          '提前期窗口预计缺口 ' + Math.abs(Math.round(m.minPaInLead)) + ' 件' + wider, m.stockoutDate);
      }
      if (hasDemand && m.ip <= m.rop) push('REPLENISH', s, Math.round(m.ip), Math.round(m.rop), 'IP 低于 ROP ' + Math.round(m.rop - m.ip) + ' 件');
      else if (hasDemand && m.minPaInLead >= 0 && m.minPaInLead < m.ss) push('BUFFER', s, Math.round(m.minPaInLead), Math.round(m.ss), '预计缓冲跌破 SS');
      if (m.onHand > m.maxTarget * 1.05) push('OVERSTOCK', s, m.onHand, Math.round(m.maxTarget), '超出上限 ' + Math.round(m.onHand - m.maxTarget) + ' 件');
      if (m.obsolete > 0) push('OBSOLETE', s, m.obsolete, p.stale_days + ' 天 / ' + p.stale_no_move_weeks + ' 周', '呆滞金额 ' + money(m.obsoleteValue));
      if (m.eoRatio !== null && m.eoRatio > p.eo_ratio_max) push('EO_RATIO', s, pct(m.eoRatio), pct(p.eo_ratio_max), 'E&O 金额 ' + money(m.eoValue));
      if (m.wos !== null && m.wos > p.wos_max) push('WOS_HIGH', s, r1(m.wos), p.wos_max + ' 周', '库存覆盖过久');
      else if (m.wos !== null && m.wos < p.wos_min) push('WOS_LOW', s, r1(m.wos), p.wos_min + ' 周', '库存覆盖不足');
      if (m.turnoverAnnual !== null && m.turnoverAnnual < p.turnover_min && m.dbar > 0) push('TURNOVER', s, r1(m.turnoverAnnual), p.turnover_min + ' 次/年', 'DIO ' + (m.dio === null ? '—' : Math.round(m.dio) + ' 天'));
      if (m.calcStatus === 'no_demand' && m.onHand > 0) push('NO_DEMAND', s, m.onHand, '—', 'SS / ROP / WOS 不计算');
      if (m.available + m.reserved + m.quarantine + m.blocked !== m.onHand) push('DQ', s, m.onHand, '状态桶求和', '状态桶校验失败');
    });

    allPos.forEach(po => {
      const overdue = daysBetween(po.promise_date, snapISO);
      if ((po.status === 'OVERDUE' || (po.status !== 'CLOSED' && overdue > 0)) && po.qty - po.received_qty > 0) {
        const sku = skus.find(x => x.id === po.sku);
        if (!sku) return;
        out.push({
          id: 'PO_OVERDUE:' + po.id, rule: 'PO_OVERDUE', name: RULE_META.PO_OVERDUE.name,
          en: RULE_META.PO_OVERDUE.en, severity: 'critical', desc: RULE_META.PO_OVERDUE.desc,
          sku: po.sku, desc2: sku.desc, category: sku.category, warehouse: po.warehouse, supplier: po.supplier,
          current: overdue, threshold: 0, note: po.id + ' 未清 ' + (po.qty - po.received_qty) + ' 件 · ' + money((po.qty - po.received_qty) * sku.m.unitCost),
          date: po.promise_date, status: 'OPEN', owner: '', reason: '',
        });
      }
      if (po.status === 'IN_TRANSIT' && daysBetween(po.eta, snapISO) > 0) {
        const sku = skus.find(x => x.id === po.sku); if (!sku) return;
        out.push({
          id: 'TRANSIT:' + po.id, rule: 'TRANSIT', name: RULE_META.TRANSIT.name,
          en: RULE_META.TRANSIT.en, severity: 'high', desc: RULE_META.TRANSIT.desc,
          sku: po.sku, desc2: sku.desc, category: sku.category, warehouse: po.warehouse, supplier: po.supplier,
          current: daysBetween(po.eta, snapISO), threshold: 0, note: po.id + ' ETA ' + po.eta,
          date: po.eta, status: 'OPEN', owner: '', reason: '',
        });
      }
    });
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.rule.localeCompare(b.rule) || a.sku.localeCompare(b.sku));
    return out;
  }

  function buildKpis(skus, pos, p, n, meta) {
    const S = f => sum(skus.map(f));
    const S2 = (arr, f) => sum(arr.map(f));
    const inventoryValue = S(s => s.m.onHandValue);
    const availableValue = S(s => s.m.availableValue);
    const inTransit = S(s => s.m.inTransit);
    const inTransitValue = S(s => s.m.inTransit * s.m.unitCost);
    const notShippedValue = S(s => s.m.notShipped * s.m.unitCost);
    const openPos = pos.filter(x => x.status !== 'CLOSED' && x.qty - x.received_qty > 0.5);
    const costById = {}; skus.forEach(s => costById[s.id] = s.m.unitCost);
    const openPoValue = sum(openPos.map(x => (x.qty - x.received_qty) * (costById[x.sku] || 0)));
    const overduePos = pos.filter(x => x.status === 'OVERDUE' || (x.status !== 'CLOSED' && daysBetween(x.promise_date, meta.snapshot_date) > 0));
    const totalDemand = S(s => sum(s.weekly));
    const avgWeeklyDemand = S(s => s.m.dbar);
    const wosWeighted = avgWeeklyDemand > 0 ? S(s => s.m.available) / avgWeeklyDemand : null;
    const cogs = S(s => s.m.cogs);
    const avgInvValue = S(s => s.m.avgInvValue || 0);
    const turnoverPeriod = avgInvValue > 0 ? cogs / avgInvValue : null;
    const turnoverAnnual = turnoverPeriod === null ? null : turnoverPeriod * 52 / p.turnover_window_weeks;
    const dio = turnoverPeriod > 0 ? p.turnover_window_weeks * 7 / turnoverPeriod : null;
    const activeSkus = skus.filter(s => s.m.active).length;
    const totalOH = S(s => s.m.onHand);
    const ages = sum(skus.map(s => (s.m.weightedAge || 0) * s.m.onHand));
    const eoValue = S(s => s.m.eoValue);
    const grossEoValue = S(s => s.m.grossEoValue);
    const provisionValue = S(s => s.m.provisionValue);
    const obsoleteValue = S(s => s.m.obsoleteValue);
    const excessValue = S(s => s.m.excessValue);
    // 「按周现货可用率」≠ 周期服务水平 CSL：前者是周级结果统计，后者是补货周期内的不缺货概率。
    // 导入数据没有 stockout_weeks 历史时必须返回 null，不能默认 100% 达成。
    const hasStockoutHistory = skus.some(s => typeof s.stockout_weeks === 'number');
    const stockoutWeeks = S(s => s.stockout_weeks || 0);
    const instockWeekRate = hasStockoutHistory ? Math.max(0, 1 - stockoutWeeks / Math.max(1, n * skus.length)) : null;
    const cslObserved = instockWeekRate; // 兼容旧字段名

    const byCategory = {};
    skus.forEach(s => {
      const c = byCategory[s.category] || (byCategory[s.category] = {
        category: s.category, skus: 0, onHand: 0, value: 0, eoValue: 0, available: 0,
        dbar: 0, cogs: 0, avgInv: 0, active: 0, stale: 0, wosSum: 0, wosN: 0,
      });
      c.skus++; c.onHand += s.m.onHand; c.value += s.m.onHandValue; c.eoValue += s.m.eoValue;
      c.available += s.m.available; c.dbar += s.m.dbar; c.cogs += s.m.cogs;
      c.avgInv += s.m.avgInvValue || 0; c.active += s.m.active ? 1 : 0; c.stale += s.m.obsolete;
      if (s.m.wos !== null) { c.wosSum += s.m.wos; c.wosN++; }
    });
    Object.values(byCategory).forEach(c => {
      c.wos = c.dbar > 0 ? c.available / c.dbar : null;
      c.turnover = c.avgInv > 0 ? c.cogs / c.avgInv * 52 / p.turnover_window_weeks : null;
      c.activeRate = c.skus ? c.active / c.skus : null;
      c.eoRatio = c.value > 0 ? c.eoValue / c.value : null;
    });

    // ABC×XYZ 九宫格：分类已由 compute() 在全量 SKU 上完成，此处只汇总当前集合
    const segments = SEGMENT_KEYS.map(key => {
      const g = skus.filter(s => s.m.segment === key);
      const mtx = p.csl_matrix || DEFAULTS.csl_matrix;
      return {
        key, abc: key[0], xyz: key[1],
        csl: p.segment_csl === 'matrix' ? (mtx[key] || p.csl) : p.csl,
        model: (p.segment_csl === 'matrix' && key[1] === 'Z') ? 'empirical' : 'normal',
        skus: g.length,
        onHandValue: S2(g, s => s.m.onHandValue),
        demandValue: S2(g, s => s.m.dbar * 52 * s.m.unitCost),
        ss: S2(g, s => s.m.ss),
        ssNormal: S2(g, s => s.m.ssNormal),
        ssValue: S2(g, s => s.m.ss * s.m.unitCost),
        empiricalCount: g.filter(s => s.m.ssModel === 'empirical').length,
        replenish: g.filter(s => s.m.ip <= s.m.rop).length,
        dbar: S2(g, s => s.m.dbar),
      };
    });
    const ssTotal = S(s => s.m.ss);
    const cslWeighted = skus.length ? sum(skus.map(s => s.m.cslEff)) / skus.length : null;
    const segmentSummary = {
      mode: p.segment_csl,
      abcSource: skus.length ? skus[0].m.abcSource : 'supplied',
      cslWeighted,
      ssTotal,
      ssValue: S(s => s.m.ss * s.m.unitCost),
      ssNormalTotal: S(s => s.m.ssNormal),
      empiricalCount: skus.filter(s => s.m.ssModel === 'empirical').length,
      fallbackCount: skus.filter(s => s.m.ssModel === 'normal_fallback').length,
      zSkus: skus.filter(s => s.m.xyz === 'Z').length,
    };

    return {
      inventoryValue, availableValue, availableRate: inventoryValue > 0 ? availableValue / inventoryValue : null,
      inTransit, inTransitValue, notShippedValue, openPoCount: openPos.length, openPoValue,
      overduePoCount: overduePos.length, totalOH, totalDemand, avgWeeklyDemand,
      wosWeighted, cogs, avgInvValue, turnoverPeriod, turnoverAnnual, dio,
      activeSkus, activeRate: skus.length ? activeSkus / skus.length : null,
      avgAge: totalOH > 0 ? ages / totalOH : null,
      eoValue, grossEoValue, provisionValue,
      eoRatio: inventoryValue > 0 ? eoValue / inventoryValue : null,
      grossEoRatio: inventoryValue > 0 ? grossEoValue / inventoryValue : null,
      obsoleteValue, excessValue, cslObserved, instockWeekRate,
      skuCount: skus.length, poCount: pos.length,
      stockoutSku: skus.filter(s => s.m.minPaInLead < 0).length,
      replenishSku: skus.filter(s => s.m.ip <= s.m.rop).length,
      overstockSku: skus.filter(s => s.m.onHand > s.m.maxTarget * 1.05).length,
      staleSku: skus.filter(s => s.m.obsolete > 0).length,
      zeroDemandSku: skus.filter(s => s.m.dbar === 0).length,
      segments, segmentSummary,
      byCategory: Object.values(byCategory).sort((a, b) => b.value - a.value),
    };
  }

  function compute(data, cfg) {
    // 币种优先级：显式配置 > 数据集 params > 数据集 meta > DEFAULTS 兜底。
    // 单独取一次，避免 DEFAULTS 的 GBP 遮住数据集自己的声明（导入自有数据的关键路径）。
    const declared = (cfg && cfg.currency !== undefined) ? cfg.currency
      : (data.params && data.params.currency !== undefined) ? data.params.currency
        : (data.meta && data.meta.currency) || DEFAULTS.currency;
    const p = sanitize(Object.assign({}, DEFAULTS, data.params || {}, cfg || {}, { currency: declared }));
    // 引擎内部 buildAlerts 生成的金额说明也走 money()，必须先同步当前币种
    setCurrency(p.currency);
    const meta = data.meta;
    const posBySku = {};
    (data.pos || []).forEach(x => (posBySku[x.sku] || (posBySku[x.sku] = [])).push(x));
    // 分类基于全量 SKU，筛选只影响展示（见 classifySkus 注释）
    const cls = classifySkus(data.skus || [], p);
    const leadTimes = computeLeadTimes(data, p, meta.snapshot_date);
    const skus = (data.skus || []).map(s => computeSku(s, posBySku[s.id] || [], p, meta.weeks.length, meta.snapshot_date, cls.byId[s.id], leadTimes));
    // 供应商级 ΔSS 由引擎汇总，UI 不得自行累加业务指标
    const rowById = leadTimes.byId;
    skus.forEach(s => {
      const r = rowById[s.supplier]; if (!r) return;
      r.ssCurrent += s.m.ss; r.ssContract += s.m.ssContract;
      r.ssValueCurrent += s.m.ss * s.m.unitCost;
      r.ssValueContract += s.m.ssContract * s.m.unitCost;
      r.ssValueDelta += (s.m.ss - s.m.ssContract) * s.m.unitCost;
    });
    leadTimes.rows.forEach(r => { r.ssDelta = r.ssCurrent - r.ssContract; });
    const sm = leadTimes.summary;
    sm.ssCurrent = sum(leadTimes.rows.map(r => r.ssCurrent));
    sm.ssContract = sum(leadTimes.rows.map(r => r.ssContract));
    sm.ssDelta = sm.ssCurrent - sm.ssContract;
    sm.ssValueCurrent = sum(leadTimes.rows.map(r => r.ssValueCurrent));
    sm.ssValueContract = sum(leadTimes.rows.map(r => r.ssValueContract));
    sm.ssValueDelta = sm.ssValueCurrent - sm.ssValueContract;
    sm.avgLeadEffective = skus.length ? mean(skus.map(s => s.m.leadDays)) : null;
    sm.avgSdEffective = skus.length ? mean(skus.map(s => s.m.leadSdDays)) : null;
    const alerts = buildAlerts(skus, data.pos || [], p, meta.snapshot_date);
    const kpis = buildKpis(skus, data.pos || [], p, meta.weeks.length, meta);
    return { skus, alerts, kpis, leadTimes, pos: data.pos || [], params: p, meta, weeks: meta.weeks };
  }

  function money(v, cur) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    // cur 可传 ISO code（'CNY'）或字面符号（'$'）；不传则取当前生效币种
    let c = currencySymbol();
    if (typeof cur === 'string' && cur.trim() !== '') {
      const k = cur.trim().toUpperCase();
      const code = CURRENCY_ALIAS[k] || (CURRENCIES[k] ? k : null);
      c = code ? CURRENCIES[code].symbol : cur;
    }
    const a = Math.abs(v);
    if (a >= 1e6) return c + (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e4) return c + (v / 1e3).toFixed(1) + 'k';
    return c + Math.round(v).toLocaleString('en-US');
  }
  function pct(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toFixed(d === undefined ? 1 : d) + '%';
  }
  function qty(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return Math.round(v).toLocaleString('en-US');
  }
  function dec(v, d) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(d === undefined ? 1 : d);
  }

  global.Engine = {
    compute, aggregate: buildKpis, zFor, DEFAULTS, RULE_META, Z_TABLE,
    SEGMENT_KEYS, SEGMENT_LABELS, classifySkus, quantileLtd,
    computeLeadTimes, LEAD_SOURCES, RISK_LABELS, qAtSorted,
    CURRENCIES, normalizeCurrency, currencyInfo, currencySymbol, currentCurrency, setCurrency,
    money, pct, qty, dec, daysBetween,
  };
})(window);
