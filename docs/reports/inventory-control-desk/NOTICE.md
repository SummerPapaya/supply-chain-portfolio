# NOTICE · 许可例外、数据署名与使用边界 / Licence exceptions, attribution & boundaries

本文件说明本仓库中**不适用 MIT 的部分**，以及使用数据快照时必须保留的署名信息。
`LICENSE` 中的 MIT 条款适用于代码、原创文档（README）与头图（`docs/banner-*.svg`）；
下述数据快照适用 **CC BY 4.0**，两者不可混为一谈。

This notice records the parts of this repository that are **not covered by MIT**.
The MIT terms in `LICENSE` apply to the code, original documentation (README) and banners
(`docs/banner-*.svg`); the data snapshot below remains under **CC BY 4.0**.

---

## 1. 第三方数据署名 / Third-party attribution

| | |
|---|---|
| Title / 名称 | Online Retail (UCI Machine Learning Repository, dataset id=352) |
| Author / 作者 | Daqing Chen, London South Bank University (2015) |
| Source / 来源 | https://archive.ics.uci.edu/dataset/352/online+retail |
| DOI | https://doi.org/10.24432/C5BW33 |
| Licence / 许可 | Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ |
| Changes / 改动 | Filtered, aggregated to SKU × week, enriched with demo master data and replayed into a demo inventory ledger (see §2) |

中文说明：原始数据为英国某无实体店礼品批发电商 2010-12-01 至 2011-12-09 的全量真实交易（541,909 行），
官方变量表声明 `UnitPrice` 单位为 sterling（GBP）。本仓库**不分发原始 Excel**，仅分发按下述方式加工的聚合快照。

## 2. 改编材料说明 / Adapted material

`assets/dataset.json` 与 `assets/dataset.js` 是上述数据的**改编材料（Adapted Material）**，不是原始数据本身：

- **保留的真实部分**：交易清洗后 527,906 行有效记录聚合而成的 120 SKU × 52 周需求序列、周销售额、成交单价与 ABC 金额分级。
- **推导的演示部分**：库存台账、203 张采购订单、179 个批次、167 笔交付签收，均由连续检查 `(s,Q)` 策略回放真实周需求生成；
  品类、仓库、供应商代号、提前期、单位成本等为演示主数据配置。它们**不是任何企业的真实 ERP / WMS 记录**。
- **已做的改动**：过滤无效行、按周与 SKU 聚合、补充演示主数据、生成三类 SHA-256 指纹、声明 `meta.currency = GBP`。

按 CC BY 4.0，改编材料仍须保留第 1 节署名并标示改动；本仓库不对原始数据主张额外权利，
**也不把数据快照重新许可为 MIT**。复制或再分发 `assets/dataset.json` / `dataset.js` 时，
请一并保留本 NOTICE 的第 1、2 节与 `LICENSE` 中的版权声明。

## 3. 三类证据指纹 / Evidence fingerprints

以下摘要由 `scripts/build_data.py` 在构建期计算并写入 `dataset.meta.evidence`，
可在工作台「证据与局限」视图内当场复算比对。它们是公开摘要，**不是密钥或凭据**。

| 对象 | SHA-256 |
|---|---|
| 源文件 `data/Online Retail.xlsx` | `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d` |
| 规范化数据集（247,054 字节，排除 `meta.evidence` 自身） | `6b8e0f6c55e63a94e04c1724909e48df01cbf4b618dbfd42e8073ccb27d7752e` |
| 规则文件 `assets/engine.js`（`ICW-ENGINE-2026.11.14`） | `81cb4630b15d94111aa8c87b33db1d1f59094f4ff5a3f5aa0f38d4d542eb2f2a` |

## 4. 使用边界 / Boundaries of use

以下是**事实说明与风险提示，不是对软件用途的许可限制**，也不在 MIT 条款之外附加任何条件：

- 库存事实是演示推导台账，不是任何企业的真实库存记录；
- 界面给出的**建议补货量是演示推导，不是采购单、不是建议下单量**，接入 ERP 前必须人工复核；
- 导出的 `ICW_evidence_handoff.csv` 是待复核证据清单，不是采购单；
- `unit_price` / 周销售额是售价口径，库存、在途、PO、E&O、周转金额是成本口径，两者不可相加；
- 切换金额币种只影响符号与导出元信息，不做汇率换算；`CSL` 不等于 fill rate；
- 单仓单供应商，未做多级库存与万级 SKU 压测；更完整的 14 条局限见工作台「证据与局限」视图。

These are factual disclosures, **not additional licence restrictions**. The MIT "AS IS" warranty
disclaimer and limitation of liability in `LICENSE` govern the software; this section exists so that
derived numbers are not mistaken for production purchasing advice.

## 5. 复现 / Reproducing the snapshot

本仓库不含 UCI 原始 Excel。如需从原始交易重建快照，请自行从 UCI 官方页面下载
`Online Retail.xlsx` 放入 `data/`，再运行 `python3 scripts/build_data.py`。
仓库内的 `assets/dataset.json` / `dataset.js` 已足以直接运行应用（纯静态、`file://` 可用）。
