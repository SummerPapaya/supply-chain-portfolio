#!/usr/bin/env python3
"""下载 Olist 官方公开数据集（Kaggle 匿名数据集下载端点，无需登录）。

用法：
    python scripts/download_olist.py --out /tmp/scds/olist

说明：Kaggle 公共数据集的 /api/v1/datasets/download/<owner>/<slug> 会 302 到
带签名的 GCS 归档；curl 需要 -L，Python 用 urlopen 会自动跟随。数据集许可为
CC BY-NC-SA 4.0，仅用于研究 / 作品集展示，不得商用。
"""
import argparse
import sys
import urllib.request
import zipfile
from pathlib import Path

URL = "https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce?datasetVersionNumber=2"
EXPECTED = [
    "olist_orders_dataset.csv",
    "olist_order_items_dataset.csv",
    "olist_customers_dataset.csv",
    "olist_products_dataset.csv",
    "olist_sellers_dataset.csv",
    "olist_order_reviews_dataset.csv",
    "olist_order_payments_dataset.csv",
    "olist_geolocation_dataset.csv",
    "product_category_name_translation.csv",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="输出目录（会创建）")
    ap.add_argument("--zip", default=None, help="可选：本地已有 zip，跳过下载")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if all((out / f).exists() and (out / f).stat().st_size > 1000 for f in EXPECTED):
        print("已存在完整数据集，跳过下载：", out)
        return 0

    zpath = Path(args.zip) if args.zip else out.parent / "olist-official.zip"
    if not zpath.exists():
        print("下载：", URL, flush=True)
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r, open(zpath, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        print("下载完成：", zpath, zpath.stat().st_size, "bytes", flush=True)

    with zipfile.ZipFile(zpath) as z:
        names = set(z.namelist())
        missing = [f for f in EXPECTED if f not in names]
        if missing:
            print("归档缺少文件：", missing, file=sys.stderr)
            return 1
        z.extractall(out)
    for f in EXPECTED:
        print("  %-42s %10d bytes" % (f, (out / f).stat().st_size))
    print("完成。请运行 build_flowlens.py --input", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
