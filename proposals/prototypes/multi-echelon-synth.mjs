/**
 * multi-echelon-synth.mjs
 * ---------------------------------------------------------------
 * 多级供应链合成序列生成器（B+ 衍生应用 · L4 合成层）
 *
 * 为什么要有这个文件：
 *   UCI Online Retail II 是单渠道、单主体数据（英国在线礼品批发商），
 *   SKU 之上没有仓库层级（实测：Country 维度顶替不了层级 —— UK 占 82.5%
 *   销量，其余 42 国销量中位仅 7,038 单位、活跃天数低至 41 天）。因此
 *   「多级库存 / 牛鞭效应」这类必须有层级才能演示的功能，只能由合成层
 *   承担 —— 它是承重墙，不是装饰品。
 *
 * 建模形式（重要）：
 *   采用 order-up-to 策略的解析递推形式（Chen, Drezner, Ryan & Simchi-Levi
 *   2000, Management Science 46(3) 分析牛鞭时的标准形式）：
 *
 *       order_t = demand_t + (S_t − S_{t−1})
 *
 *   其中 S_t 为目标库存位(order-up-to level)。
 *
 *   ★ 为什么不用「完整物理库存仿真」（跟踪到货、缺货、发货约束）：
 *     第一版就是这么做的，结果上游发货约束导致整链长期缺货，每层都在追
 *     补一个永远达不到的目标，最终 DC 订单均值是终端需求的 8277 倍 ——
 *     那是 bug 不是牛鞭。改用递推形式后，流量守恒由数学保证：
 *     Σ(S_t − S_{t−1}) → 0（S 平稳），长期 mean(order) = mean(demand)，
 *     放大只体现在方差上。这才是牛鞭效应的定义。
 *
 * 牛鞭的三个成因如何体现：
 *   ① 需求信号处理 —— 目标库存位用移动平均预测 → MA_t 变动进入 order
 *   ② 订货批量     —— order 向上取整到批量倍数
 *   ③ 提前期放大   —— S_t ∝ (L+1)，层级越靠上 L 越大
 *
 * 三条设计约束：
 *   1. 确定性：同一种子必须产出逐位相同的序列（浏览器内可复现）
 *   2. 形态真实：需求参数从 UCI 实测标定（间歇率中位 0.18、块状出货）
 *   3. 有物理校验：流量守恒 + 牛鞭比须落在文献常见区间
 *
 * 运行：node multi-echelon-synth.mjs
 * 依赖：无。纯标准库 + 纯 JS 数值运算，浏览器可直接跑（红线②：模型须
 * 浏览器内可复现 —— 本文件不含 fs / Buffer / crypto / node-only API）。
 */

// ──────────────────────── 确定性随机数 ────────────────────────
// mulberry32：32 位种子 PRNG。刻意不用 Math.random —— 那样无法复现。
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller：均匀 → 标准正态，用于对数正态出货批量
function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ──────────────────────── 配置 ────────────────────────
const CFG = {
  seed: 20260930,
  days: 730,           // 与 UCI 的 739 天口径对齐
  warmup: 180,         // 预热期：吸收设施启动时的建库瞬态（目标库存位从 0 跃升）
  z: 1.65,             // 服务水平 95%（单侧 z=1.645）
  maWindow: 7,         // 移动平均窗口（成因①）

  rdcCount: 3,
  fsPerRdc: 3,
  leadTime: { dc: 14, rdc: 7, fs: 4 },            // 成因③：越靠上游 L 越大
  batchSize: { fs: 60, rdc: 300, dc: 1200 },      // 成因②

  // 终端需求标定（来源：UCI Online Retail II 实测）
  // coverage = 有出货行为的日子占比，实测中位 0.18
  demandMix: [
    { name: '间歇型-块状', share: 0.67, coverage: 0.18, meanLot: 180, lotSigma: 0.9 },
    { name: '中间型',     share: 0.29, coverage: 0.50, meanLot: 90,  lotSigma: 0.7 },
    { name: '平稳型',     share: 0.04, coverage: 0.82, meanLot: 45,  lotSigma: 0.5 },
  ],
};

// ──────────────────────── 终端需求生成 ────────────────────────
// 间歇块状需求 = Bernoulli(出货日) × 对数正态(批量)
// 各前置仓用不同 rngSeed，避免同日完全同步 —— 同步会让上游方差虚高，
// 那种「放大」是不诚实的（真实网络中各地的出库日并不重合）。
function makeTerminalDemand(cfg, nodeIdx) {
  const rng = mulberry32(cfg.seed + nodeIdx * 7919);
  let r = rng(), acc = 0, seg = cfg.demandMix[0];
  for (const m of cfg.demandMix) { acc += m.share; if (r <= acc) { seg = m; break; } }

  const series = new Array(cfg.days).fill(0);
  for (let t = 0; t < cfg.days; t++) {
    if (rng() < seg.coverage) {
      const lot = seg.meanLot * Math.exp(seg.lotSigma * gaussian(rng) - (seg.lotSigma ** 2) / 2);
      series[t] = Math.max(1, Math.round(lot));
    }
  }
  // 温和的年度季节性：让 Holt-Winters / Croston 都有东西可拟合
  for (let t = 0; t < cfg.days; t++) {
    series[t] = Math.max(0, Math.round(series[t] * (1 + 0.35 * Math.sin((2 * Math.PI * t) / 365 - 1.2))));
  }
  return { series, profile: seg.name, coverageTarget: seg.coverage };
}

// ──────────────────────── 工具 ────────────────────────
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/** 资源 t 处的移动平均（用 t 之前的历史，不含未来 —— 避免偷看未来） */
function maAt(history, t, window) {
  const lo = Math.max(0, t - window + 1);
  const slice = history.slice(lo, t + 1);
  return mean(slice);
}

// ──────────────────────── 节点：order-up-to 递推 ────────────────────────
/**
 * 单个节点的订单传播。
 *   S_t   = MA_t×(L+1) + SS          （目标库存位）
 *   SS    = z × σ_steady × √(L+1)    （σ 用整段稳态，避免滚动 σ 抖动引入额外噪声）
 *   order_t = max(0, demand_t + (S_t − S_{t−1}))，再向上取整到批量倍数
 */
class OrderUpToNode {
  constructor(name, leadTime, batchSize, z) {
    this.name = name; this.L = leadTime; this.batch = batchSize; this.z = z;
    this.demand = []; this.levels = []; this.orders = [];
    this.sigma = 0; this.ssFixed = null;
  }

  /** 用整段需求先定下稳态 σ，使 SS 固定 —— 这样牛鞭只来自预测滞后与批量 */
  calibrate() {
    this.sigma = stdev(this.demand);
    this.ssFixed = this.z * this.sigma * Math.sqrt(this.L + 1);
  }

  levelAt(t, maWindow) {
    const fc = maAt(this.demand, t, maWindow);
    return Math.max(0, fc * (this.L + 1) + this.ssFixed);
  }

  propagate(maWindow) {
    this.levels = new Array(this.demand.length).fill(0);
    this.orders = new Array(this.demand.length).fill(0);
    this.ip = new Array(this.demand.length).fill(0);

    // ★ 显式跟踪库存位 IP，而不是用「order = demand + ΔS」的等价形式。
    //   后者只在【完美履行】假设下成立：一旦引入 MOQ / 截断，缺少了
    //   「多订了 → 下期自动少订」的负反馈，订单均值就会被系统性抬高
    //   （实测每层抬 1.5–2 倍，三层串起来达 5.3 倍）。
    //   显式维护 IP 后，流量守恒由 IP_N − IP_0 = Σorder − Σdemand 数学保证。
    // ★ 期初库存位 = 期初目标库存位，表示「系统带着与目标匹配的库存启动」。
    //   若从 0 起步，第一天的 ΔS 会是一次巨大的虚假建库订单；该巨单再向上传染，
    //   上层 MA 又会把它放大 15 倍（实测 DC 第 0 天收到 33,600，订了 513,600），
    //   此后库存位长期远高于目标位，链条会数白天下不了订单。
    let ip = 0;
    if (this.demand.length > 0) ip = this.levelAt(0, maWindow);

    for (let t = 0; t < this.demand.length; t++) {
      const S = this.levelAt(t, maWindow);
      this.levels[t] = S;

      const need = S - ip;                       // 距目标库存位还差多少
      const order = this.applyMoq(need);
      this.orders[t] = order;

      ip = ip + order - this.demand[t];          // 到货已计入在途，需求已扣减
      this.ip[t] = ip;
    }
    return this.orders;
  }

  /**
   * 最小起订量（MOQ）约束。
   *   缺口未达起订量 → 本期不下订，缺口留在 IP 里自然累积到下期
   *   达到起订量     → 向上取整到批量的整数倍
   *
   * 因为 IP 显式跟踪了「多订 / 少订」，多订的部分会自动削减下一期需求，
   * 不再需要额外的偏差结转 —— 这里也就不会踩「carry 无界累积」那类坑。
   */
  applyMoq(need) {
    if (need < this.batch) return 0;             // 未达 MOQ：本期不下订
    return Math.ceil(need / this.batch) * this.batch;
  }
}

// ──────────────────────── 仿真主流程 ────────────────────────
function runSimulation(cfg = CFG) {
  const fsCount = cfg.rdcCount * cfg.fsPerRdc;

  // 1) 终端需求
  const terminals = [];
  for (let i = 0; i < fsCount; i++) terminals.push(makeTerminalDemand(cfg, i));

  // 2) FS 层：每个前置仓依据自己的终端需求下单
  const fss = [];
  for (let i = 0; i < fsCount; i++) {
    const n = new OrderUpToNode(
      `FS-${Math.floor(i / cfg.fsPerRdc) + 1}-${(i % cfg.fsPerRdc) + 1}`,
      cfg.leadTime.fs, cfg.batchSize.fs, cfg.z);
    n.demand = terminals[i].series.slice();
    fss.push(n);
  }

  // 3) RDC 层：需求 = 其下所有 FS 订单之和
  const rdcs = [];
  for (let r = 0; r < cfg.rdcCount; r++) {
    const n = new OrderUpToNode(`RDC-${r + 1}`, cfg.leadTime.rdc, cfg.batchSize.rdc, cfg.z);
    rdcs.push(n);
  }
  fss.forEach((n) => n.calibrate());
  const fsOrders = fss.map((n) => n.propagate(cfg.maWindow));
  for (let r = 0; r < cfg.rdcCount; r++) {
    const agg = new Array(cfg.days).fill(0);
    for (let i = r * cfg.fsPerRdc; i < (r + 1) * cfg.fsPerRdc; i++) {
      fsOrders[i].forEach((v, t) => (agg[t] += v));
    }
    rdcs[r].demand = agg;
  }

  // 4) DC 层：需求 = 所有 RDC 订单之和
  const dc = new OrderUpToNode('DC', cfg.leadTime.dc, cfg.batchSize.dc, cfg.z);
  rdcs.forEach((n) => n.calibrate());
  const rdcOrders = rdcs.map((n) => n.propagate(cfg.maWindow));
  const dcDemand = new Array(cfg.days).fill(0);
  rdcOrders.forEach((ord) => ord.forEach((v, t) => (dcDemand[t] += v)));
  dc.demand = dcDemand;
  dc.calibrate();
  const dcOrders = dc.propagate(cfg.maWindow);

  return { terminals, fss, rdcs, dc, fsOrders, rdcOrders, dcOrders, cfg };
}

// ──────────────────────── 统计与校验 ────────────────────────
function stats(arr, warmup) {
  const a = arr.slice(warmup).map(Number);
  return { n: a.length, mean: mean(a), sd: stdev(a), variance: stdev(a) ** 2 };
}

function sumSeries(list, days) {
  const out = new Array(days).fill(0);
  list.forEach((o) => o.forEach((v, t) => (out[t] += v)));
  return out;
}

// ════════════════════════ 输出 ════════════════════════
// 仅在被直接运行时打印；被 import（如 gsm.mjs 取 σ）时保持静默。
// 浏览器里 process 未定义，因此这段永远不会在浏览器执行 —— 保持零 node-only 依赖。
const __directRun = typeof process !== 'undefined' && !!process.argv && !!process.argv[1]
  && process.argv[1].indexOf('multi-echelon-synth') >= 0;

if (__directRun) {
const sim = runSimulation();
const W = CFG.warmup;
const pad = (s, n) => String(s).padStart(n);

const termAgg = sumSeries(sim.terminals.map((t) => t.series), CFG.days);
const fsAgg = sumSeries(sim.fsOrders, CFG.days);      // FS → RDC
const rdcAggIn = sumSeries(sim.rdcOrders, CFG.days);  // RDC → DC
const dcAggIn = sim.dcOrders.slice();              // DC → 供应商（已是单条序列）

const sTerm = stats(termAgg, W);
const sFS = stats(fsAgg, W);
const sRdc = stats(rdcAggIn, W);
const sDc = stats(dcAggIn, W);

console.log('════════ 多级供应链合成序列 · 仿真结果 ════════');
console.log(`seed=${CFG.seed}  days=${CFG.days}  warmup=${W}  z=${CFG.z}  MA窗口=${CFG.maWindow}`);
console.log(`拓扑：1 DC → ${CFG.rdcCount} RDC → ${CFG.rdcCount * CFG.fsPerRdc} FS`);
console.log(`提前期 DC/RDC/FS = ${CFG.leadTime.dc}/${CFG.leadTime.rdc}/${CFG.leadTime.fs} 天`);
console.log(`批量   DC/RDC/FS = ${CFG.batchSize.dc}/${CFG.batchSize.rdc}/${CFG.batchSize.fs}\n`);

console.log('── 1. 终端需求形态（对照 UCI 实测：覆盖率中位 0.18）──');
const covList = sim.terminals.map((x) => x.series.filter((v) => v > 0).length / x.series.length).sort((a, b) => a - b);
console.log(`  9 个前置仓覆盖率: ${covList.map((x) => x.toFixed(2)).join('  ')}`);
console.log(`  中位覆盖率 = ${covList[Math.floor(covList.length / 2)].toFixed(2)}   目标 ~0.18\n`);

console.log('── 2. 牛鞭效应：订单方差沿层级放大 ──');
console.log(`  ${'层级'.padEnd(20)}${'订单均值'.padStart(11)}${'订单sd'.padStart(11)}${'牛鞭比'.padStart(9)}`);
console.log(`  ${'终端零售需求'.padEnd(20)}${pad(sTerm.mean.toFixed(1), 11)}${pad(sTerm.sd.toFixed(1), 11)}${pad('—', 9)}`);
console.log(`  ${'FS→RDC 订单'.padEnd(20)}${pad(sFS.mean.toFixed(1), 11)}${pad(sFS.sd.toFixed(1), 11)}${pad((sFS.sd / sTerm.sd).toFixed(2) + 'x', 9)}`);
console.log(`  ${'RDC→DC 订单'.padEnd(20)}${pad(sRdc.mean.toFixed(1), 11)}${pad(sRdc.sd.toFixed(1), 11)}${pad((sRdc.sd / sTerm.sd).toFixed(2) + 'x', 9)}`);
console.log(`  ${'DC→供应商 订单'.padEnd(20)}${pad(sDc.mean.toFixed(1), 11)}${pad(sDc.sd.toFixed(1), 11)}${pad((sDc.sd / sTerm.sd).toFixed(2) + 'x', 9)}\n`);

console.log('── 3. 物理校验（不过关就不得进演示层）──');
const meanRatio = sDc.mean / sTerm.mean;
const meanOk = meanRatio > 0.90 && meanRatio < 1.10;
const bwFS = sFS.sd / sTerm.sd, bwRdc = sRdc.sd / sTerm.sd, bwDc = sDc.sd / sTerm.sd;
const bwOk = bwFS < bwRdc && bwRdc < bwDc && bwDc < 6;
console.log(`  ① 流量守恒  DC订单均值/终端需求均值 = ${meanRatio.toFixed(4)}  ${meanOk ? 'OK ✅' : 'FAIL ❌'}`);
console.log(`  ② 单调放大  FS ${bwFS.toFixed(2)}x < RDC ${bwRdc.toFixed(2)}x < DC ${bwDc.toFixed(2)}x  ${bwOk ? 'OK ✅' : 'FAIL ❌'}`);
console.log(`  ③ 牛鞭量级  DC 端 ${bwDc.toFixed(2)}x，须 < 6x（文献常见 1–4x）  ${bwDc < 6 ? 'OK ✅' : 'FAIL ❌'}\n`);

console.log('── 4. 各层安全库存配置（σ 基于各层自身面临的需求）──');
console.log(`  ${'层级'.padEnd(12)}${'需求均值'.padStart(10)}${'σ'.padStart(10)}${'SS=z·σ·√(L+1)'.padStart(16)}`);
const rows = [['FS(示例)', stats(sim.fss[0].demand, W), CFG.leadTime.fs],
              ['RDC(示例)', stats(sim.rdcs[0].demand, W), CFG.leadTime.rdc],
              ['DC', stats(sim.dc.demand, W), CFG.leadTime.dc]];
for (const [name, s, L] of rows) {
  const ss = CFG.z * s.sd * Math.sqrt(L + 1);
  console.log(`  ${name.padEnd(12)}${pad(s.mean.toFixed(1), 10)}${pad(s.sd.toFixed(1), 10)}${pad(ss.toFixed(0), 16)}`);
}

console.log('\n── 5. 确定性验证 ──');
const sim2 = runSimulation();
const identical = sim.dcOrders.every((v, t) => v === sim2.dcOrders[t])
  && sim.fss.every((n, i) => n.orders.every((v, t) => v === sim2.fss[i].orders[t]));
const sim3 = runSimulation({ ...CFG, seed: CFG.seed + 1 });
const differs = !sim3.dcOrders.every((v, t) => v === sim.dcOrders[t]);
console.log(`  同种子重跑逐位一致: ${identical ? 'YES ✅' : 'NO ❌'}`);
console.log(`  换种子后结果不同:   ${differs ? 'YES ✅' : 'NO ❌'}`);

console.log('\n── 6. 产物体积 ──');
const payload = {
  meta: {
    synthetic: true, generator: 'multi-echelon-synth.mjs', seed: CFG.seed, days: CFG.days,
    note: 'SYNTHETIC. 演示用多级结构，非真实观测。',
  },
  topology: { dc: 1, rdc: CFG.rdcCount, fs: CFG.rdcCount * CFG.fsPerRdc },
  demand: sim.terminals.map((t) => t.series),
};
console.log(`  9 SKU × ${CFG.days} 天 JSON ≈ ${(JSON.stringify(payload).length / 1024).toFixed(0)} KB（未压缩）`);

}   // ── end __directRun ──

// 导出 σ 提取函数供决策层使用
export function demandSigmas(sim = runSimulation(), warmup = CFG.warmup) {
  const fs = sim.terminals.map((t) => stdev(t.series.slice(warmup)));
  const sumBy = (idxList) => {
    const out = new Array(CFG.days).fill(0);
    idxList.forEach((i) => sim.terminals[i].series.forEach((v, t) => (out[t] += v)));
    return stdev(out.slice(warmup));
  };
  const rdc = [0, 1, 2].map((r) => sumBy([0, 1, 2].map((f) => r * 3 + f)));
  const dc = sumBy([...Array(9).keys()]);
  return { fs, rdc, dc };
}

export { mulberry32, gaussian, makeTerminalDemand, OrderUpToNode, runSimulation, stats, mean, stdev, CFG };
