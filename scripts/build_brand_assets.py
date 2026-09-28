#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""品牌资产构建 · 主页 favicon + 链接预览卡

背景：站点品牌标记是 `.brand-mark`（26px 圆角方块 + 1.5px ink 描边 + 等宽 "SC"），
但 docs/index.html 从未声明任何 favicon / og 标签，分享链接是完全裸的。

本脚本负责「矢量源 + 装配」，中间的栅格化由 scripts/rasterize_brand.mjs 走 CDP 完成
（沙箱里 Chrome 一次性 --screenshot 会卡死，只能用调试协议）。

用法
----
  python3 scripts/build_brand_assets.py gen       # 生成 SVG 源 + 待栅格化 HTML
  python3 scripts/build_brand_assets.py assemble  # 栅格结果 -> favicon.ico + docs/ 成品

字体可用性（沙箱无外网，一律用本机字体）
--------------------------------------
  SF Mono  /System/Library/Fonts/SFNSMono.ttf        ← 站点 --font-mono 的首选回退
  SF Pro   /System/Library/Fonts/SFNS.ttf
  宋体     /System/Library/Fonts/Supplemental/Songti.ttc  ← 替代 Noto Serif SC（衬线）
  苹方     /System/Library/Fonts/PingFang.ttc
"""

import json
import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont, TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SRC = ROOT / "assets" / "brand"
TMP = ROOT / ".workbuddy" / "tmp" / "brand"

SF_MONO = Path("/System/Library/Fonts/SFNSMono.ttf")
PAPER = "#f7f6f2"
INK = "#101418"
ACCENT = "#1a4fd6"
RADAR_COLORS = ["#e05656", "#f0a13a", "#5b8cff", "#35c2b0"]
SITE_URL = "https://supply-chain-lab.summercommences.com"


# ---------------------------------------------------------------- 字形轮廓

def load_mono(weight=500):
    """取 SF Mono 指定字重的 TTFont；可变字体先实例化。"""
    font = TTFont(str(SF_MONO))
    if "fvar" in font:
        from fontTools.varLib.instancer import instantiateVariableFont
        axes = {a.axisTag: (a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes}
        if "wght" in axes:
            lo, _def, hi = axes["wght"]
            font = instantiateVariableFont(font, {"wght": max(lo, min(hi, weight))}, inplace=True)
    return font


def outline(font, text, size, tracking=0.0):
    """文本 -> (SVG path d, 总宽度)；基线在 y=0，y 轴已翻转为 SVG 方向。"""
    scale = size / font["head"].unitsPerEm
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    x, parts = 0.0, []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            x += size * 0.5
            continue
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, x, 0)))
        if d := pen.getCommands():
            parts.append(d)
        x += glyphs[name].width * scale + tracking
    return " ".join(parts), (x - tracking if text else 0.0)


def cap_height(font, size):
    os2 = font.get("OS/2")
    upm = font["head"].unitsPerEm
    ch = getattr(os2, "sCapHeight", None) or int(upm * 0.7)
    return ch * size / upm


def sc_path(font, size):
    """返回居中用的 ('SC' path d, width, cap) —— 基线 y=0。"""
    d, w = outline(font, "SC", size)
    return d, w, cap_height(font, size)


# ---------------------------------------------------------------- SVG 源

def svg_icon(size_tile, font, glyph_size, *, bleed=False):
    """ink 底 + 纸色 SC 的圆角方块。

    为什么是「反白」而不是照搬 `.brand-mark` 的「纸底 + ink 描边」：
    16px 下纸底方案的 1px 描边 + 5.6px 高的小字会糊成一团（实测对比见
    .workbuddy/tmp/brand/check-cands*.png）。反白方案把字高提到方块的 48%，
    16px 下 "SC" 仍可辨认；配色仍是站点自己的 ink #101418 / paper #f7f6f2，
    等于站点深色模式的取色，不算跑偏。

    bleed=True 用于 iOS/Android：满幅铺底（系统自己切遮罩），字缩到 40 保证
    落在 maskable 安全圆内。
    """
    d, w, cap = sc_path(font, glyph_size)
    tx = size_tile / 2 - w / 2
    ty = size_tile / 2 + cap / 2
    r = 0 if bleed else round(size_tile * 7 / 26, 2)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size_tile} {size_tile}" '
        f'width="{size_tile}" height="{size_tile}" role="img">\n'
        f'  <title>供应链 × AI 研究索引</title>\n'
        f'  <rect width="{size_tile}" height="{size_tile}" rx="{r}" fill="{INK}"/>\n'
        f'  <g transform="translate({tx:.2f} {ty:.2f})" fill="{PAPER}">\n'
        f'    <path d="{d}"/>\n'
        f'  </g>\n'
        f'</svg>\n'
    )


# ---------------------------------------------------------------- 预览卡

def og_card_html():
    """1200×630（微信按居中 630×630 方图裁剪，正文全部压在安全框内）。

    只用本机字体族名 —— 沙箱取不到 Google Fonts，@font-face 也就无从谈起。
    """
    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ width:1200px; height:630px; overflow:hidden; }}
  body {{
    background:{PAPER}; color:{INK};
    font-family:"Songti SC","Songti TC",serif;
    background-image:
      linear-gradient(to right, rgba(16,20,24,.035) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(16,20,24,.035) 1px, transparent 1px);
    background-size:48px 48px;
  }}
  .col {{ position:absolute; left:320px; width:560px; }}
  .brand {{ top:96px; display:flex; align-items:center; gap:16px; }}
  .mark {{ width:64px; height:64px; flex:0 0 auto; }}
  .mark svg {{ width:100%; height:100%; display:block; }}
  .brandname {{ font-family:".SF NS Mono","SF Mono",Menlo,monospace; font-size:19px;
    letter-spacing:.04em; line-height:1.45; }}
  .brandname small {{ display:block; font-size:15px; color:#6e767f; letter-spacing:.08em; }}
  h1 {{ top:214px; font-weight:900; font-size:60px; line-height:1.28; letter-spacing:.01em; }}
  h1 .thin {{ color:#5a6169; }}
  .sub {{ top:400px; font-family:"PingFang SC","Hiragino Sans GB",sans-serif;
    font-size:23px; color:#3d454d; line-height:1.6; }}
  .bar {{ top:482px; display:flex; gap:10px; }}
  .bar i {{ width:46px; height:5px; border-radius:2px; }}
  .foot {{ top:520px; font-family:".SF NS Mono","SF Mono",Menlo,monospace; font-size:17px; color:#6e767f;
    letter-spacing:.02em; display:flex; justify-content:space-between; width:560px; }}
</style></head><body>
  <div class="col brand">
    <div class="mark">{svg_icon(64, MONO_FONT, 44).strip()}</div>
    <div class="brandname">SUPPLY CHAIN &times; AI<small>RESEARCH INDEX</small></div>
  </div>
  <h1 class="col">AI 多模型视角下的<br>全球供应链<span class="thin">洞察研究</span></h1>
  <div class="sub col">每日热点雷达 · 行业研究对比 · 衍生应用作品集</div>
  <div class="bar col">{"".join(f'<i style="background:{c}"></i>' for c in RADAR_COLORS)}</div>
  <div class="foot col"><span>supply-chain-lab.summercommences.com</span><span>中 / EN</span></div>
</body></html>
"""


def icon_html():
    """栅格化容器：viewBox 自适应视口，Chrome 按视口尺寸原生光栅化。"""
    return """<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:transparent; }
  svg { display:block; width:100vw; height:100vh; }
</style></head><body>
<script>
  const src = new URLSearchParams(location.search).get('src') || 'favicon-source.svg';
  fetch(src).then(r => r.text()).then(t => { document.body.innerHTML = t; });
</script>
</body></html>
"""


# ---------------------------------------------------------------- 装配

SIZES = [16, 32, 48, 180, 192, 512]
ICO_SIZES = [16, 32, 48]
BLEED_SIZES = [180, 192, 512]


def gen():
    SRC.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    font = load_mono(500)
    fam = font["name"].getDebugName(1)
    print(f"  mono 字族 = {fam}（用于 SC 轮廓）")
    d, w, cap = sc_path(font, 44)
    print(f"  SC @44 → 宽 {w:.1f}，cap {cap:.1f}（占方块 {cap / 64:.0%}）")

    (SRC / "favicon-source.svg").write_text(svg_icon(64, font, 44), encoding="utf-8")
    (SRC / "icon-bleed-source.svg").write_text(svg_icon(64, font, 40, bleed=True), encoding="utf-8")
    (TMP / "icon.html").write_text(icon_html(), encoding="utf-8")
    (TMP / "ogcard.html").write_text(og_card_html(), encoding="utf-8")
    print(f"  ✓ {SRC.relative_to(ROOT)}/favicon-source.svg, icon-bleed-source.svg")
    print(f"  ✓ {TMP.relative_to(ROOT)}/icon.html, ogcard.html")
    print("  下一步：node scripts/rasterize_brand.mjs")

    (TMP / "favicon-source.svg").write_bytes((SRC / "favicon-source.svg").read_bytes())
    (TMP / "icon-bleed-source.svg").write_bytes((SRC / "icon-bleed-source.svg").read_bytes())


def assemble():
    from PIL import Image

    staged = {}
    for n in SIZES:
        src = TMP / f"icon-{n}.png"
        if not src.exists():
            print(f"  ! 缺 {src.name}，跳过")
            continue
        img = Image.open(src).convert("RGBA")
        if img.size != (n, n):
            img = img.resize((n, n), Image.LANCZOS)
        stage = TMP / f"final-{n}.png"          # 一律先落暂存，ICO 从这儿取
        img.save(stage, optimize=True)
        staged[n] = stage
        if n in BLEED_SIZES:                     # 满幅版直接进 docs/
            target = DOCS / ("apple-touch-icon.png" if n == 180 else f"icon-{n}.png")
            shutil.copy(stage, target)
        elif n == 32:                            # 浏览器标签页的 PNG 兜底
            target = DOCS / "icon-32.png"
            shutil.copy(stage, target)
        else:
            target = stage
        print(f"  ✓ {target.name}  {n}×{n}  {target.stat().st_size / 1024:.1f} KB")

    ico_srcs = [(n, staged[n]) for n in ICO_SIZES if n in staged]
    if ico_srcs:
        # 手写 ICO 容器：Pillow 的 ICO writer 是「一张图缩放出多档」，
        # 会把 16px 从 48px 降采样。这里三档都是原生栅格，直接内嵌 PNG。
        import struct
        dir_entries, blobs, offset = [], [], 6 + 16 * len(ico_srcs)
        for n, path in ico_srcs:
            blob = path.read_bytes()
            blobs.append(blob)
            dir_entries.append(struct.pack("<BBBBHHII", n % 256, n % 256, 0, 0, 1, 32,
                                           len(blob), offset))
            offset += len(blob)
        ico = DOCS / "favicon.ico"
        ico.write_bytes(struct.pack("<HHH", 0, 1, len(ico_srcs))
                        + b"".join(dir_entries) + b"".join(blobs))
        print(f"  ✓ favicon.ico  {ico.stat().st_size / 1024:.1f} KB（原生内嵌 {ICO_SIZES}）")

    shutil.copy(SRC / "favicon-source.svg", DOCS / "favicon.svg")

    og = TMP / "og-cover.png"
    if og.exists():
        from PIL import Image as _I
        im = _I.open(og).convert("RGB")
        im.save(DOCS / "og-cover.png", optimize=True)
        print(f"  ✓ og-cover.png  {im.size}  {(DOCS / 'og-cover.png').stat().st_size / 1024:.0f} KB")

    (DOCS / "site.webmanifest").write_text(json.dumps({
        "name": "供应链 × AI 研究索引",
        "short_name": "SC × AI",
        "description": "AI 多模型视角下的全球供应链洞察研究",
        "start_url": "./",
        "display": "standalone",
        "background_color": PAPER,
        "theme_color": PAPER,
        "icons": [
            {"src": "./icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("  ✓ site.webmanifest")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "gen"
    MONO_FONT = load_mono(500)
    if mode == "gen":
        gen()
    elif mode == "assemble":
        assemble()
    else:
        raise SystemExit(f"未知模式 {mode}")
