# Supply Chain Portfolio · Bilingual Hero

`hero-bilingual.svg` is the animated, editable source. `hero-bilingual-static.svg` is the static fallback; `hero-bilingual-preview.png` is a rendered preview. Both languages appear together, so the same image can serve the English and Chinese README.

动画源文件为 `hero-bilingual.svg`，静态备用版为 `hero-bilingual-static.svg`，渲染预览为 `hero-bilingual-preview.png`。中英文同时展示，两个 README 可使用同一张封面。

The composition follows the portfolio's existing paper, ink, cobalt and teal palette. The five incoming research lanes correspond to Cursor x Grok 4.5, Kimi K3 Deep Research, WorkBuddy x Deepseek-V4-Pro, Gemini 3.6 Flash and Codex GPT-6 Astra. The footer explicitly counts two spin-off apps: VeloCortex Maritime and TariffLens. The globe is a schematic research motif, not a live map or quantitative chart.

8-second loop: five research lanes converge, a radar sector scans, a confirmation ring appears, then the scene rests. Text remains stationary and readable. `prefers-reduced-motion: reduce` disables all animation. The SVG uses no scripts, external fonts, remote images or `foreignObject`.

## Preview / 预览

Serve the repository root, then open `/assets/readme/hero-preview.html`:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

The preview offers pause/play and light/dark surroundings, plus a 360px scale check. Only the preview HTML contains JavaScript; the SVG is self-contained.

## README embed / 引用方式

Suggested embed, relative to a README in the repository root:

```html
<p align="center">
  <img src="assets/readme/hero-bilingual.svg" width="100%"
       alt="全球供应链多模型洞察：同一命题、五种独立 AI 视角、每周雷达与研究衍生应用。Supply Chain Intelligence: one brief, five AI perspectives, Weekly Radar and research spin-offs.">
</p>
```

For a guaranteed static presentation, replace the image path with `assets/readme/hero-bilingual-static.svg`.

[GitHub's file-viewer documentation](https://docs.github.com/en/repositories/working-with-files/using-files/working-with-non-code-files) states that SVG animation is not supported there. Animated SVG playback depends on the display context; the local browser preview shows the complete motion. No GIF has been substituted for the requested SVG.

Both root README files embed `assets/readme/hero-bilingual.svg`; their cover links point to the same bilingual asset. README body content is unchanged.
