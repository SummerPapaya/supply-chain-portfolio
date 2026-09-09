# Report design and time-window logic / 报告设计与时间窗口

本版依据报告数据独立设计。页面采用原生 HTML、SVG 和独立 report.css，使用系统字体，无外部图表依赖。用途：个人学习、非商业。

This edition is independently designed from the report's data. It uses native HTML/SVG, report.css and system fonts, with no external chart dependency. For personal learning and noncommercial use.

## 时间窗口 / Time windows

- Q1：1—3月。主读数为本季发生额、期间比率或3月底存量。Q2、H1置于默认收起的跨期参考；不展示后续季度变化。
- Q2：4—6月。主读数为本季发生额、期间比率或6月底存量。已核验Q1数据作为前期对照。H1另列跨期参考。
- H1：1—6月。主读数为半年累计发生额、半年期间比率或6月底存量；Q1/Q2拆分解释半年节奏。

Q1 foregrounds January–March; Q2 foregrounds April–June with Q1 comparison where available; H1 foregrounds January–June with supporting quarter detail. Other windows are explicitly labelled as references.

## 指标语义 / Metric semantics

- 流量 flow：同口径收入、产量、部署量、现金流可按Q1+Q2汇总H1，保留计算状态与来源。条形比较按绝对值显示，不自动年化。
- 存量 stock：Q1取3月底；Q2和H1共享6月底。不可相加。中国算力和AutoStore在手订单按此处理。
- 比率 ratio：半年利润率、销量占比、占用率采用来源半年值，不平均季度比例。季度差额使用“百分点”。比率条形使用0—100%固定刻度。
- 同比 growth：各期间按匹配的上年期间比较，不从两个季度同比推导H1或Q2同比。增速差额为百分点，不称为环比增速。
- 月度 monthly：航空货运图只显示窗口内月份；Q2月度同比不替代Q2累计同比。

Flows, stocks, ratios and growth rates follow different aggregation rules. Missing observations remain unavailable, and a different period is never substituted into the selected-window headline. Comparisons are not seasonally adjusted; nominal amounts retain price effects.

## 展示 / Presentation

时间范围示意明确H1涵盖Q1与Q2。每个产业首先显示当前窗口、统计性质、单位和来源，再展示适用的季度对照。辅助背景可展开；市场同比使用零基线条形，月度序列使用折线。蓝色表达主读数，其他主题色辅助识别产业；变化值采用中性色，避免把数量增加一概暗示为经营改善。没有自动切换、图表重播或滚动揭示动效。

A calendar guide explains containment. Each sector leads with its selected-period reading, basis, unit and provenance, followed by applicable quarter comparisons. Supporting context is expandable. Changes use neutral styling to avoid implying that every numerical increase is beneficial. There is no automatic period switching or decorative chart animation.

## 验证 / Verification

研究来源核验日期仍为2026-09-06；本次属于展示与时间逻辑调整，不构成数据重新核验。原有38条来源、98条记录保留。离线回归检查144种组合、公式与CSV；浏览器检查18种筛选组合、八个诊断项、时间窗口语义和窄屏布局。打印控件检查不等于PDF逐页验收。
