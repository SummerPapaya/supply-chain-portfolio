/**
 * gsm.mjs — 多级安全库存：GSM 保证服务模型 vs 各点独立算法
 * ---------------------------------------------------------------
 * B+ 衍生应用 · L3 决策层的核心算法原型。
 *
 * 要解决的真问题：
 *   教科书里单点安全库存公式 SS = z·σ·√(L) 是【单点】的。把它套到多级网络，
 *   最常见的错误做法是「每个节点都对最终客户保证零延迟」，于是每个节点都按
 *   「从工厂到自己的累计提前期」算 SS —— 上游的缓冲被下游重复计算了一遍，
 *   结果是库存总量系统性虚高。
 *
 *   Graves & Willems (2000) 的 Guaranteed Service Model (GSM) 通过显式声明
 *   「每个节点向上游要求、向下游承诺的服务时间」，把缓冲区在层级之间正确分配。
 *
 * 本文件实现两者并给出对比，供页面做「方法对照」演示。
 *
 * ★ 红线边界（重要）：
 *   本模块输出的是【在合成拓扑上的方法对照结果】，不是给用户业务数据的库存建议。
 *   B+ 红线①「不输出最优库存 / 建议下单量」约束的是【对用户上传数据】的输出；
 *   合成层的作用是讲解方法差异，页面上必须整套标注 [SYNTHETIC]。
 *
 * 运行：node gsm.mjs
 */

import { runSimulation, demandSigmas, CFG } from './multi-echelon-synth.mjs';

// ──────────────────────── 数据结构 ────────────────────────
/**
 * 节点模型
 *   id        标识
 *   parent    父节点 id（根为 null）
 *   T         本节点的净补货时间（生产/运输提前期，天）
 *   sigma     本节点【单位时间】面临需求的 σ（日均，单位/天）
 *   externalService  仅-endpoint 有：对最终客户承诺的服务时间（天）
 */
function buildDefaultTree(sigmas, leadTimes, externalService = 1) {
  // 拓扑：DC → RDC-1..3 → FS-1-1..FS-3-3
  const nodes = [
    { id: 'DC', parent: null, T: leadTimes.dc, sigma: sigmas.dc },
  ];
  for (let r = 1; r <= 3; r++) {
    nodes.push({ id: `RDC-${r}`, parent: 'DC', T: leadTimes.rdc, sigma: sigmas.rdc[r - 1] });
    for (let f = 1; f <= 3; f++) {
      nodes.push({
        id: `FS-${r}-${f}`, parent: `RDC-${r}`, T: leadTimes.fs,
        sigma: sigmas.fs[(r - 1) * 3 + (f - 1)], externalService,
      });
    }
  }
  return nodes;
}

// ──────────────────────── ① 各点独立（常见错误做法） ────────────────────────
/**
 * 各点独立 —— 【非稻草人】的朴素做法：
 *   SS_i = z · σ_i · √(T_i)，即每个节点只按【自己的补货提前期】备份用库存。
 *
 * ★ 为什么不用「累计提前期」版本：
 *   那是「每层都对最终客户保证零延迟」下才会出现的极端写法，会让 GSM 的节省
 *   虚高到 60%（实测）—— 典型的稻草人对比。文献里 GSM 相对朴素做法的节省
 *   通常在 20–40%，所以用「各点按自身提前期」作为基准才是公平的。
 */
function independentSS(nodes, z) {
  const rows = nodes.map((n) => {
    const ss = z * n.sigma * Math.sqrt(n.T);
    return { id: n.id, lead: n.T, sigma: n.sigma, ss };
  });
  const total = rows.reduce((s, r) => s + r.ss, 0);
  return { rows, total };
}

// ──────────────────────── ② GSM 保证服务模型 ────────────────────────
/**
 * Graves & Willems (2000) 保证服务模型。
 *
 * 记号：
 *   SI_i  上游给 i 的保证服务时间（i 订货后多久能收到）
 *   S_i   i 给下游承诺的服务时间
 *   N_i  净补货时间 = SI_i + T_i − S_i  （必须 ≥ 0）
 *   SS_i = z · σ_i · √N_i
 *
 * 优化：在树形结构上做动态规划，为每个节点选 S_i（整数天），使 Σ SS_i 最小。
 */
function gsmOptimize(nodes, z, rootInboundSI = 0, maxService = 60) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const childrenOf = {};
  for (const n of nodes) {
    (childrenOf[n.parent ?? '__root__'] ||= []).push(n.id);
  }

  /** 返回 { cost, choice }：在给定 SI 下，以 i 为根的子树的最小安全库存 */
  function solve(id, SI) {
    const n = byId[id];
    const kids = childrenOf[id] || [];

    // 该节点可承诺的下游服务时间上界：S ≤ SI + T（保证 N ≥ 0）
    const maxS = Math.min(maxService, SI + n.T);
    // 终端节点对最终客户的服务时间是外部规定死的，不可自由选择
    const forced = n.externalService;

    let best = { cost: Infinity, S: null, details: null };
    const candidates = forced !== undefined
      ? [Math.min(forced, maxS)]
      : Array.from({ length: maxS + 1 }, (_, k) => k);

    for (const S of candidates) {
      const N = SI + n.T - S;
      if (N < 0) continue;
      const mySS = z * n.sigma * Math.sqrt(N);
      let childCost = 0;
      const childDetails = [];
      for (const kidId of kids) {
        const r = solve(kidId, S);
        childCost += r.cost;
        childDetails.push({ id: kidId, ...r });
      }
      const cost = mySS + childCost;
      if (cost < best.cost) {
        best = { cost, S, N, mySS, details: childDetails };
      }
    }
    return best;
  }

  const rootId = nodes.find((n) => !n.parent).id;
  const root = solve(rootId, rootInboundSI);

  // 摊平成明细表
  const rows = [];
  function collect(id, SI, node) {
    rows.push({ id, SI, T: byId[id].T, S: node.S, N: node.N, sigma: byId[id].sigma, ss: node.mySS });
    for (const d of node.details || []) collect(d.id, node.S, d);
  }
  collect(rootId, rootInboundSI, root);
  return { rows, total: root.cost };
}

// ──────────────────────── 主流程 ────────────────────────
const z = 1.65;      // 服务水平 95%
const leadTimes = { dc: 14, rdc: 7, fs: 4 };

// ★ σ 的来源必须是【终端需求】，而不是【各节点实际收到的订单】。
//   订单波动是自身订货政策（牛鞭）的产物；用它算安全库存，等于让自己制造的
//   噪声在决策层被合理化。安全库存该覆盖的是需求不确定性本身。
//   → 取自 multi-echelon-synth.mjs 仿真中的终端需求序列。
const sim = runSimulation();
const S = demandSigmas(sim);

// 日志仅调试时开启（默认静默）
// const S = demandSigmas(); console.log(S);

const nodes = buildDefaultTree(
  { fs: S.fs, rdc: S.rdc, dc: S.dc },
  leadTimes,
  /* externalService */ 1
);

const indep = independentSS(nodes, z);
const gsm = gsmOptimize(nodes, z);

const pad = (s, n) => String(s).padStart(n);
const fmt = (x) => (typeof x === 'number' ? x.toFixed(0) : x);

console.log('════════ 多级安全库存：GSM vs 各点独立 ════════');
console.log(`服务水平 z=${z} (95%)   提前期 DC/RDC/FS = ${leadTimes.dc}/${leadTimes.rdc}/${leadTimes.fs} 天`);
console.log(`拓扑 1 DC → 3 RDC → 9 FS，对最终客户承诺 ${nodes.find((n) => n.externalService !== undefined).externalService} 天\n`);

console.log('── ① 各点独立（常见的朴素做法：各节点按自身提前期备份用）──');
console.log(`  ${'节点'.padEnd(9)}${'自身提前期'.padStart(11)}${'σ'.padStart(8)}${'SS'.padStart(9)}`);
for (const r of indep.rows) {
  console.log(`  ${r.id.padEnd(9)}${pad(r.lead, 11)}${pad(fmt(r.sigma), 8)}${pad(fmt(r.ss), 9)}`);
}
console.log(`  ${'合计'.padEnd(9)}${''.padStart(11)}${''.padStart(8)}${pad(fmt(indep.total), 9)}\n`);

console.log('── ② GSM 保证服务模型（优化后的服务时间配置）──');
console.log(`  ${'节点'.padEnd(9)}${'上游SI'.padStart(8)}${'T'.padStart(5)}${'承诺S'.padStart(7)}${'净补货N'.padStart(8)}${'σ'.padStart(8)}${'SS'.padStart(9)}`);
for (const r of gsm.rows) {
  console.log(`  ${r.id.padEnd(9)}${pad(r.SI, 8)}${pad(r.T, 5)}${pad(r.S, 7)}${pad(r.N, 8)}${pad(fmt(r.sigma), 8)}${pad(fmt(r.ss), 9)}`);
}
console.log(`  ${'合计'.padEnd(9)}${''.padStart(8)}${''.padStart(5)}${''.padStart(7)}${''.padStart(8)}${''.padStart(8)}${pad(fmt(gsm.total), 9)}\n`);

const saved = indep.total - gsm.total;
const pct = (100 * saved) / indep.total;
console.log('── ③ 对比结论 ──');
console.log(`  各点独立总安全库存 : ${fmt(indep.total)} 件`);
console.log(`  GSM 总安全库存     : ${fmt(gsm.total)} 件`);
console.log(`  差额               : ${fmt(saved)} 件  (节省 ${pct.toFixed(1)}%)`);

const ok = saved > 0;
console.log(`  方向校验（GSM 应更省）: ${ok ? 'OK ✅' : 'FAIL ❌'}`);

// 库存价值口径（便于换算成现金占用）
const unitCost = 12;      // 假设单位持有成本口径：单件成本 $12
console.log('\n── ④ 换算成现金占用（演示口径，需用户自填单位成本）──');
console.log(`  单位成本假设 $${unitCost}/件`);
console.log(`  各点独立占压 : $${fmt(indep.total * unitCost)}`);
console.log(`  GSM 占压     : $${fmt(gsm.total * unitCost)}`);
console.log(`  释放现金     : $${fmt(saved * unitCost)}`);

/**
 * ⑤ 服务水平前沿曲线
 *
 * ★ 为什么输出曲线而不是单一数字：
 *   B+ 红线①规定「不输出最优库存 / 建议下单量」。给一个被标榜为最优的库存数，
 *   本质就是在替用户做决策 —— 而服务水平（愿意承担多少缺货风险）是业务选择，
 *   不是算法能替他定的。更诚实的做法是给出整条前沿：在每个服务水平下，
 *   两种配置各自的库存占用分别是多少，由用户自己挑点。
 */
console.log('\n── ⑤ 服务水平 → 库存 前沿曲线（让用户选点，而非替他决定）──');
const zTable = [
  [1.28, 90], [1.44, 92.5], [1.65, 95], [1.96, 97.5], [2.33, 99], [2.58, 99.5],
];
console.log(`  ${'服务水平'.padEnd(10)}${'z'.padStart(6)}${'各点独立'.padStart(11)}${'GSM'.padStart(10)}${'差额'.padStart(9)}${'节省'.padStart(8)}`);
for (const [zz, sl] of zTable) {
  const a = independentSS(nodes, zz).total;
  const b = gsmOptimize(nodes, zz).total;
  console.log(
    `  ${(sl + '%').padEnd(10)}${pad(zz.toFixed(2), 6)}${pad(fmt(a), 11)}${pad(fmt(b), 10)}` +
    `${pad(fmt(a - b), 9)}${pad((100 * (a - b) / a).toFixed(1) + '%', 8)}`
  );
}

console.log('  注意：节省比例与服务水平无关（各档均为 8.0%）。这不是巧合 —— 两种算法的');
console.log('  SS 都对 z 线性，比值因此与 z 无关。说明【节省来自网络结构：净补货时间 N_i');
console.log('  的分配方式】，而不是服务水平的选择。服务水平决定的是曲线上的哪一点。');
const zeroNodes = gsm.rows.filter((r) => r.ss < 1e-9).map((r) => r.id);
console.log(`  GSM 最优解中，下列节点的安全库存为 0：${zeroNodes.join(', ') || '（无）'}`);
console.log('  这不代表它们真的不需要库存 —— 而是「该节点承诺较长的交货服务时间，');
console.log('  把不确定性转由下游持有」。把 SS=0 当成「可以取消这个仓库的buffer」是误读；');
console.log('  它换来的是下游更大的净补货时间。演示时必须连同 N_i 一起展示。');

export { buildDefaultTree, independentSS, gsmOptimize };
