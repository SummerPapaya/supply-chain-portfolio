#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 README 中英文动态头图（docs/banner-zh.svg / docs/banner-en.svg）。

设计约束：
  * 纯 SVG + SMIL 声明式动画，无 <script>、无外部字体 / 图片 / CSS 依赖，
    可放进 GitHub README 的 ![...](...) 图片引用中播放；静态首帧也必须完整可读。
  * 配色沿用作品集卡片：纸墨底 / 深钢蓝主色 / teal 交互色 / 朱红警示色。
  * 右侧为 2×3 多功能微型仪表盘，六格分别对应工作台的不同能力，
    每格使用不同类型的动画（绘制 / 进度推进 / 脉冲 / 指针位移 / 柱高呼吸 / 九宫格点亮），
    呼应「12 个视图 · 1 个指标引擎」。
用法：python3 scripts/build_banner.py
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs")

MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


def xe(s):
    """文本节点 XML 转义（标签里含 E&O 等字面量）"""
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def cell(x, y, label, body, tag=""):
    """统一的格子外框与标签；图形区约为 x+10 .. x+269, y+20 .. y+44"""
    label = xe(label)
    tag_svg = ""
    if tag:
        tag_svg = (f'<text x="{x + 269}" y="{y + 14}" text-anchor="end" font-size="7.5" '
                   f'font-family="{MONO}" fill="#8a8577">{tag}</text>')
    return f'''<g>
    <rect x="{x}" y="{y}" width="279" height="49" rx="4" fill="#fbfaf6" stroke="#e8e5dd"/>
    <text x="{x + 10}" y="{y + 14}" font-size="8.5" font-weight="700" letter-spacing=".3"
          font-family="{MONO}" fill="#3f6079">{label}</text>
    {tag_svg}
    {body}
  </g>'''


def c_rop(x, y):
    """补货点与安全库存：水位绘制动画 + ROP 虚线流动 + 触发点脉冲"""
    gx, gy = x + 10, y + 20
    return f'''<g>
    <rect x="{gx}" y="{gy + 12}" width="250" height="10" fill="#0e7a6d" fill-opacity=".10"/>
    <path d="M{gx} {gy + 11} H{gx + 250}" stroke="#c9403f" stroke-width="1" stroke-dasharray="4 3">
      <animate attributeName="stroke-dashoffset" values="0;-14" dur="1.4s" repeatCount="indefinite"/>
    </path>
    <path d="M{gx} {gy + 2} L{gx + 40} {gy + 6} L{gx + 80} {gy + 11} L{gx + 120} {gy + 17}
             L{gx + 140} {gy + 2} L{gx + 180} {gy + 7} L{gx + 220} {gy + 12} L{gx + 250} {gy + 17}"
          fill="none" stroke="#3f6079" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"
          stroke-dasharray="400" stroke-dashoffset="0">
      <animate attributeName="stroke-dashoffset" values="400;0;0" keyTimes="0;.3;1" dur="5s" repeatCount="indefinite"/>
    </path>
    <path d="M{gx + 140} {gy + 17} V{gy + 2}" stroke="#0e7a6d" stroke-width="1.8"/>
    <circle cx="{gx + 120}" cy="{gy + 17}" r="2.6" fill="#c9403f">
      <animate attributeName="r" values="2.6;5;2.6" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;.4;1" dur="2s" repeatCount="indefinite"/>
    </circle>
    <text x="{gx + 250}" y="{gy + 24}" text-anchor="end" font-size="7"
          font-family="{MONO}" fill="#8a8577">REORDER → RECEIPT +Q</text>
  </g>'''


def c_po(x, y):
    """采购订单与在途：三条进度条依次推进 + 沿最长条移动的在途点"""
    gx, gy = x + 10, y + 20
    rows = [(gy + 2, "#3f6079", "0s"), (gy + 9, "#3f6079", "0.5s"), (gy + 16, "#0e7a6d", "1s")]
    bars = ""
    for ry, col, begin in rows:
        bars += (f'<rect x="{gx}" y="{ry}" width="200" height="4" rx="2" fill="#e8e5dd"/>'
                 f'<rect x="{gx}" y="{ry}" width="200" height="4" rx="2" fill="{col}">'
                 f'<animate attributeName="width" values="0;200;200" keyTimes="0;.35;1" '
                 f'dur="5s" begin="{begin}" repeatCount="indefinite"/></rect>')
    return f'''<g>
    {bars}
    <circle r="2.2" fill="#0e7a6d">
      <animateMotion dur="5s" repeatCount="indefinite" path="M{gx} {gy + 4} H{gx + 200}"/>
    </circle>
    <text x="{gx + 208}" y="{gy + 8}" font-size="7.5" font-family="{MONO}" fill="#8a8577">PO</text>
    <text x="{gx + 208}" y="{gy + 16}" font-size="7.5" font-family="{MONO}" fill="#8a8577">ETA</text>
  </g>'''


def c_hand(x, y):
    """On-hand 状态桶与预警：四段堆叠 + 段宽呼吸 + 严重度告警脉冲"""
    gx, gy = x + 10, y + 20
    return f'''<g>
    <rect x="{gx}" y="{gy + 8}" width="110" height="8" rx="1" fill="#3f6079">
      <animate attributeName="width" values="110;96;110" dur="4s" repeatCount="indefinite"/>
    </rect>
    <rect x="{gx + 110}" y="{gy + 8}" width="45" height="8" fill="#0e7a6d"/>
    <rect x="{gx + 155}" y="{gy + 8}" width="30" height="8" fill="#8a8577"/>
    <rect x="{gx + 185}" y="{gy + 8}" width="18" height="8" fill="#d8d4c8"/>
    <circle cx="{gx + 218}" cy="{gy + 12}" r="3" fill="#c9403f">
      <animate attributeName="r" values="3;6;3" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="1;.35;1" dur="1.8s" repeatCount="indefinite"/>
    </circle>
    <text x="{gx + 230}" y="{gy + 15}" font-size="7.5" font-family="{MONO}" fill="#c9403f">CRITICAL</text>
  </g>'''


def c_wos(x, y):
    """WOS 与周转：指针在刻度上往复 + DIO 条推进"""
    gx, gy = x + 10, y + 20
    ticks = "".join(f'<path d="M{gx + i * 50} {gy + 5} V{gy + 13}" stroke="#d8d4c8" stroke-width="1"/>'
                    for i in range(5))
    return f'''<g>
    <rect x="{gx}" y="{gy + 8}" width="200" height="4" rx="2" fill="#e8e5dd"/>
    {ticks}
    <rect x="0" y="{gy + 3}" width="3" height="14" rx="1" fill="#3f6079" transform="translate({gx + 100} 0)">
      <animateTransform attributeName="transform" type="translate"
                        values="{gx} 0;{gx + 200} 0;{gx} 0" dur="6s" repeatCount="indefinite"/>
    </rect>
    <rect x="{gx}" y="{gy + 18}" width="200" height="3" rx="1.5" fill="#e8e5dd"/>
    <rect x="{gx}" y="{gy + 18}" width="130" height="3" rx="1.5" fill="#0e7a6d">
      <animate attributeName="width" values="60;170;60" dur="5s" repeatCount="indefinite"/>
    </rect>
    <text x="{gx + 208}" y="{gy + 12}" font-size="7.5" font-family="{MONO}" fill="#8a8577">WOS</text>
    <text x="{gx + 208}" y="{gy + 21}" font-size="7.5" font-family="{MONO}" fill="#8a8577">DIO</text>
  </g>'''


def c_age(x, y):
    """FIFO 批次库龄与 E&O：四根柱高呼吸 + 超期柱警示脉冲"""
    gx, gy = x + 10, y + 20
    base = gy + 22
    specs = [(12, "#3f6079", ".45", "0s"), (16, "#3f6079", ".65", "0.4s"),
             (22, "#3f6079", ".85", "0.8s"), (28, "#c9403f", ".85", "1.2s")]
    bars = ""
    for i, (h, col, op, begin) in enumerate(specs):
        top = base - h
        bars += (f'<rect x="{gx + i * 28}" y="{top}" width="22" height="{h}" fill="{col}" opacity="{op}">'
                 f'<animate attributeName="height" values="{h};{h + 4};{h}" dur="3s" '
                 f'begin="{begin}" repeatCount="indefinite"/>'
                 f'<animate attributeName="y" values="{top};{top - 4};{top}" dur="3s" '
                 f'begin="{begin}" repeatCount="indefinite"/></rect>')
    return f'''<g>
    {bars}
    <path d="M{gx} {base} H{gx + 134}" stroke="#d8d4c8" stroke-width="1"/>
    <text x="{gx + 145}" y="{gy + 12}" font-size="8" font-family="{MONO}" fill="#8a8577">0-30 / 31-60 / 61-90 / 90+d</text>
    <text x="{gx + 145}" y="{gy + 21}" font-size="8" font-weight="700" font-family="{MONO}" fill="#c9403f">E&amp;O · PROVISION</text>
  </g>'''


def c_matrix(x, y):
    """ABC×XYZ 九宫格差异化 CSL + 供应商 OTD 滚动"""
    gx, gy = x + 10, y + 20
    grid = ""
    for r in range(3):
        for c in range(3):
            begin = (r * 3 + c) * 0.2
            op = ".45" if (r + c) < 2 else ".85"
            grid += (f'<rect x="{gx + c * 13}" y="{gy + r * 7}" width="11" height="5" rx="1" '
                     f'fill="#3f6079" opacity="{op}">'
                     f'<animate attributeName="opacity" values=".3;1;.3" dur="3s" '
                     f'begin="{begin}s" repeatCount="indefinite"/></rect>')
    return f'''<g>
    {grid}
    <text x="{gx}" y="{gy + 24}" font-size="7" font-family="{MONO}" fill="#8a8577">ABC×XYZ → CSL</text>
    <rect x="{gx + 92}" y="{gy + 3}" width="140" height="4" rx="2" fill="#e8e5dd"/>
    <rect x="{gx + 92}" y="{gy + 3}" width="126" height="4" rx="2" fill="#0e7a6d">
      <animate attributeName="width" values="70;140;70" dur="4.5s" repeatCount="indefinite"/>
    </rect>
    <text x="{gx + 92}" y="{gy + 15}" font-size="7.5" font-family="{MONO}" fill="#8a8577">OTD ROLLING → L / σ_L</text>
    <text x="{gx + 232}" y="{gy + 15}" text-anchor="end" font-size="8" font-weight="700"
          font-family="{MONO}" fill="#0e7a6d">92.6%</text>
  </g>'''


def dashboard(labels):
    """右区 2 列 × 3 行多功能仪表盘"""
    coords = [(574, 84), (865, 84), (574, 139), (865, 139), (574, 194), (865, 194)]
    makers = [c_rop, c_po, c_hand, c_wos, c_age, c_matrix]
    tags = ["", "203 PO", "", "6.4 WEEKS", "", "8 SUPPLIERS"]
    parts = [cell(px, py, labels[i], makers[i](px, py), tags[i]) for i, (px, py) in enumerate(coords)]
    return ('''<g>
  <rect x="566" y="76" width="586" height="176" rx="8" fill="#fffdf9" stroke="#d8d4c8"/>
  <text x="578" y="70" font-size="8.5" font-family="''' + MONO + '''" fill="#8a8577">12 VIEWS · 1 ENGINE · SINGLE SOURCE OF TRUTH</text>
''' + "\n".join(parts) + "\n</g>")


# 所有动画均为 SMIL；SMIL 不改变文档静态属性，因此未播放动画时首帧仍是完整图
TEMPLATE = r'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 320" width="1200" height="320" role="img"
     aria-label="__ARIA__">
  <title>__TITLE__</title>
  <desc>__DESC__</desc>

  <!-- 纸墨底 -->
  <rect x="0" y="0" width="1200" height="320" rx="14" fill="#f7f6f2" stroke="#d8d4c8" stroke-width="1"/>

  <!-- 眉标 -->
  <circle cx="52" cy="40" r="3.5" fill="#0e7a6d">
    <animate attributeName="opacity" values="1;.25;1" dur="2.2s" repeatCount="indefinite"/>
  </circle>
  <text x="64" y="44" font-size="11" letter-spacing="1.6" font-weight="700"
        font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fill="#3f6079">INVENTORY CONTROL DESK</text>
  <text x="1152" y="44" text-anchor="end" font-size="10.5" letter-spacing=".8"
        font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fill="#8a8577">__EYEBROW_RIGHT__</text>
  <path d="M48 58 H1152" stroke="#d8d4c8" stroke-width="1"/>

  <!-- 左：标题区 -->
  <text x="48" y="128" font-size="__TITLE_SIZE__" font-weight="700" fill="#1a1f26"
        font-family="__TITLE_FONT__">__TITLE__</text>
  <text x="48" y="166" font-size="16" fill="#4a5058"
        font-family="__BODY_FONT__">__SUBTITLE__</text>
  <text x="48" y="194" font-size="11" fill="#8a8577"
        font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">__FEATURES__</text>

  <!-- 三个能力标签 -->
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="10.5" fill="#3f6079">
    <rect x="48" y="214" width="150" height="28" rx="4" fill="#fffdf9" stroke="#d8d4c8"/>
    <text x="62" y="232">__CHIP1__</text>
    <rect x="208" y="214" width="150" height="28" rx="4" fill="#fffdf9" stroke="#d8d4c8"/>
    <text x="222" y="232">__CHIP2__</text>
    <rect x="368" y="214" width="170" height="28" rx="4" fill="#fffdf9" stroke="#d8d4c8"/>
    <text x="382" y="232">__CHIP3__</text>
  </g>

  <!-- 红线声明 -->
  <path d="M48 268 V296" stroke="#3f6079" stroke-width="3"/>
  <text x="62" y="280" font-size="10" font-weight="700" letter-spacing=".6"
        font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fill="#3f6079">REVIEW ONLY · NOT A PURCHASE ORDER</text>
  <text x="62" y="295" font-size="11.5" fill="#4a5058" font-family="__BODY_FONT__">__REDLINE__</text>

  <!-- 右：六格多功能微型仪表盘 -->
__DASHBOARD__

  <!-- 证据指纹（依次呼吸高亮） -->
  <text x="566" y="270" font-size="9.5" font-weight="700" letter-spacing=".5"
        font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" fill="#3f6079">__EVIDENCE__</text>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="9" fill="#e9edf2">
    <g opacity=".85">
      <animate attributeName="opacity" values=".72;1;.72" dur="3s" begin="0s" repeatCount="indefinite"/>
      <rect x="566" y="278" width="186" height="24" rx="3" fill="#141a22"/>
      <text x="576" y="294">SOURCE  43465a06f2cc</text>
    </g>
    <g opacity=".85">
      <animate attributeName="opacity" values=".72;1;.72" dur="3s" begin="1s" repeatCount="indefinite"/>
      <rect x="760" y="278" width="186" height="24" rx="3" fill="#141a22"/>
      <text x="770" y="294">DATASET 6b8e0f6c55e6</text>
    </g>
    <g opacity=".85">
      <animate attributeName="opacity" values=".72;1;.72" dur="3s" begin="2s" repeatCount="indefinite"/>
      <rect x="954" y="278" width="186" height="24" rx="3" fill="#141a22"/>
      <text x="964" y="294">RULE    81cb4630b15d OK</text>
    </g>
  </g>

  <!-- 底部扫描线 -->
  <path d="M48 312 H1152" stroke="#e8e5dd" stroke-width="1"/>
  <rect x="0" y="310.5" width="90" height="3" rx="1.5" fill="#0e7a6d" opacity=".55">
    <animateTransform attributeName="transform" type="translate" from="48 0" to="1152 0"
                      dur="6s" repeatCount="indefinite"/>
  </rect>
</svg>
'''

# 字体族用单引号：SVG 属性本身以双引号包裹，内部不能出现双引号
SANS = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple-system,sans-serif"
SANS_EN = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

LANG = {
    'zh': {
        'aria': '库存控制工作台动态头图：六格仪表盘展示补货点、采购订单在途、On-hand 预警、WOS 周转、库龄 E&O、ABC×XYZ 与供应商 OTD',
        'title': '库存控制工作台',
        'desc': '基于 UCI Online Retail 真实周需求回放的库存控制工作台，动态展示补货点、采购在途、库存预警、周转、库龄与冗余、分类服务水平及供应商交期',
        'title_size': '46',
        'title_font': SANS,
        'body_font': SANS,
        'eyebrow_right': '数据源 UCI ONLINE RETAIL · CC BY 4.0',
        'subtitle': '12 个视图 · 1 个指标引擎 · 一份可复算的数据契约',
        'features': '120 SKU · 203 张 PO · 167 笔签收 · 52 周 · 12 个视图',
        'chip1': '零密钥 · 零服务端',
        'chip2': 'FILE:// 可直接打开',
        'chip3': 'GBP · 币种由数据层声明',
        'redline': '建议补货量是演示推导，接入 ERP 前须人工复核',
        'evidence': '证据指纹 · 浏览器可当场复算 · 14 条局限默认展开',
        'cells': ['补货点 ROP / SS', '采购订单与在途 PO / ETA',
                  'ON-HAND 状态桶与预警', 'WOS 与库存周转',
                  'FIFO 库龄与 E&O', 'ABC×XYZ 与供应商 OTD'],
    },
    'en': {
        'aria': 'Animated banner for Inventory Control Desk: six panels for ROP/SS, PO and in-transit, on-hand alerts, WOS, ageing and E&O, ABC×XYZ and supplier OTD',
        'title': 'Inventory Control Desk',
        'desc': 'An inventory control workbench replaying UCI Online Retail weekly demand, with animated panels for reorder points, POs, alerts, turnover, ageing, service levels and OTD',
        'title_size': '38',
        'title_font': SANS_EN,
        'body_font': SANS_EN,
        'eyebrow_right': 'DATA: UCI ONLINE RETAIL · CC BY 4.0',
        'subtitle': '12 views · one metrics engine · one verifiable data contract',
        'features': '120 SKUs · 203 POs · 167 receipts · 52 weeks · 12 views',
        'chip1': 'NO KEYS · NO SERVER',
        'chip2': 'FILE:// READY',
        'chip3': 'GBP · DECLARED IN DATA',
        'redline': 'Suggested quantities are derived for review before any ERP write-back',
        'evidence': 'FINGERPRINTS · RECOMPUTE IN BROWSER · 14 LIMITS ALWAYS OPEN',
        'cells': ['ROP / SS WATERLINE', 'PO / IN-TRANSIT',
                  'ON-HAND / ALERTS', 'WOS / TURNOVER',
                  'AGEING / E&O', 'ABC×XYZ / SUPPLIER OTD'],
    },
}


def build(lang):
    s = LANG[lang]
    out = TEMPLATE.replace('__DASHBOARD__', dashboard(s['cells']))
    for key, val in [
        ('__ARIA__', s['aria']), ('__TITLE__', s['title']), ('__DESC__', s['desc']),
        ('__TITLE_SIZE__', s['title_size']), ('__TITLE_FONT__', s['title_font']),
        ('__BODY_FONT__', s['body_font']), ('__EYEBROW_RIGHT__', s['eyebrow_right']),
        ('__SUBTITLE__', s['subtitle']), ('__FEATURES__', s['features']),
        ('__CHIP1__', s['chip1']), ('__CHIP2__', s['chip2']), ('__CHIP3__', s['chip3']),
        ('__REDLINE__', s['redline']), ('__EVIDENCE__', s['evidence']),
    ]:
        # 字体栈等属性值不含 & < >，统一转义对它们无影响
        out = out.replace(key, xe(val) if key not in ('__TITLE_FONT__', '__BODY_FONT__', '__TITLE_SIZE__') else val)
    leftover = re.findall(r'__[A-Z0-9_]+__', out)
    if leftover:
        raise ValueError(f'unresolved placeholders: {sorted(set(leftover))}')
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for lang in ('zh', 'en'):
        p = os.path.join(OUT_DIR, f'banner-{lang}.svg')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(build(lang))
        print(f'{os.path.relpath(p, ROOT)}  {os.path.getsize(p):,} bytes')


if __name__ == '__main__':
    main()
