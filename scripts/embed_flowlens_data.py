#!/usr/bin/env python3
"""FlowLens：把 facts.csv / aggregate.json 以 gzip+base64 注入 index.html。

同源静态文件始终是首选数据源；内嵌副本只用于单文件预览场景
（file:// 打开、或只托管 HTML 本身而不托管同目录文件的预览服务）。
注入内容由同一次构建的数据文件产生，gzip mtime 固定为 0，可重复运行且结果确定。
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import io
import json
from pathlib import Path

BEGIN = "<!-- FL_EMBED_BEGIN -->"
END = "<!-- FL_EMBED_END -->"
ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "docs" / "reports" / "flowlens"


def gz_b64(data: bytes) -> str:
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9, mtime=0) as g:
        g.write(data)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def verify(enc: str, raw: bytes, label: str) -> None:
    dec = gzip.decompress(base64.b64decode(enc.encode("ascii")))
    if dec != raw or hashlib.sha256(dec).digest() != hashlib.sha256(raw).digest():
        raise AssertionError(label + " 内嵌副本与原文件不一致")
    if "</script" in enc.lower():
        raise AssertionError(label + " 编码内容意外含有脚本闭合标签")
    if label == "aggregate.json":
        json.loads(dec.decode("utf-8"))


def build_block(out: Path) -> tuple[str, dict]:
    agg = (out / "aggregate.json").read_bytes()
    facts = (out / "facts.csv").read_bytes()
    a, f = gz_b64(agg), gz_b64(facts)
    verify(a, agg, "aggregate.json")
    verify(f, facts, "facts.csv")
    block = (
        BEGIN + "\n"
        + '<script type="text/plain" id="flEmbeddedAgg">' + a + "</script>\n"
        + '<script type="text/plain" id="flEmbeddedFacts">' + f + "</script>\n"
        + END
    )
    return block, {
        "aggregate.json": len(agg),
        "facts.csv": len(facts),
        "embeddedBytes": len(block),
    }


def sync(out: Path = DEFAULT) -> dict:
    html_path = out / "index.html"
    html = html_path.read_text(encoding="utf-8")
    if html.count(BEGIN) != 1 or html.count(END) != 1:
        raise AssertionError("index.html 缺少唯一的 FL_EMBED_BEGIN / FL_EMBED_END 标记")
    block, info = build_block(out)
    i = html.index(BEGIN)
    j = html.index(END) + len(END)
    new = html[:i] + block + html[j:]
    if new != html:
        html_path.write_text(new, encoding="utf-8")
    if block not in html_path.read_text(encoding="utf-8"):
        raise AssertionError("写入后内嵌块校验失败")
    # 幂等：再算一遍应与磁盘内容完全一致
    if build_block(out)[0] != block:
        raise AssertionError("内嵌块不具备确定性")
    return info


def main() -> None:
    info = sync(DEFAULT)
    print("FlowLens 内嵌副本已同步：aggregate.json %d B / facts.csv %d B → %.2f MB base64"
          % (info["aggregate.json"], info["facts.csv"], info["embeddedBytes"] / 1e6))


if __name__ == "__main__":
    main()
