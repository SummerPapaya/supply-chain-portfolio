#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""供应链雷达 · 往期存档工具

目的：每周雷达更新会覆盖 docs/radar-data.json，此前的内容就丢了。
本脚本把每一期完整快照另存一份，供站点「往期存档」下拉回看。

两种模式
--------
  backfill   从 git 历史导出 docs/radar-data.json 的每一个历史版本
             （同一日期出现多次时，保留最后一次，即含后续修订的那版）
  snapshot   把当前 docs/radar-data.json 存为一份存档
             —— 周更脚本在覆盖数据前调用它，实现"覆盖前先归档"

栏目标准化
----------
早期几期用的是旧栏目顺序（研究瞭望/应用风向前置），本脚本在落盘前统一
按现行标准重排为：重点新闻 → 热门议题 → 研究瞭望 → 应用风向，
并补齐标准配色，保证往期存档与当期版面完全一致。
条目标题/描述的原始文本一律不改。

产出布局
--------
  docs/radar-archive/index.json        清单（按日期倒序）
  docs/radar-archive/YYYY-MM-DD.json   各期完整快照（结构与 radar-data.json 一致）

用法
----
  python3 scripts/archive_radar.py backfill
  python3 scripts/archive_radar.py backfill --keep-order   # 保留历史原栏目顺序
  python3 scripts/archive_radar.py snapshot
  python3 scripts/archive_radar.py reindex     # 仅重建清单
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
LIVE = DOCS / "radar-data.json"
ARCHIVE = DOCS / "radar-archive"
MANIFEST = ARCHIVE / "index.json"

# 现行标准栏目顺序与配色（与 docs/radar-data.json 一致）
CANON = [
    {"zh": "重点新闻", "en": "Key News",         "color": "#e05656", "keys": ["key news"]},
    {"zh": "热门议题", "en": "Hot Topics",       "color": "#f0a13a", "keys": ["hot topics"]},
    {"zh": "研究瞭望", "en": "Research",         "color": "#5b8cff", "keys": ["research"]},
    {"zh": "应用风向", "en": "Apps & Adoption",  "color": "#35c2b0", "keys": ["apps & adoption", "apps"]},
]

# 现行标准（含栏目顺序）确立于该期；更早的期次在清单里标记 retro
STANDARD_SINCE = "2026-08-21"


def _col_key(col):
    """栏目匹配键：优先英文名，其次中文名，均小写去空白。"""
    cat = (col or {}).get("cat") or {}
    return ((cat.get("en") or "") + "|" + (cat.get("zh") or "")).strip().lower()


def normalize_columns(data):
    """把一期的 columns 按现行标准顺序/配色重排。文本内容不改动。"""
    cols = list((data or {}).get("columns") or [])
    used, out = set(), []
    for spec in CANON:
        hit = None
        for idx, col in enumerate(cols):
            if idx in used:
                continue
            en = (((col or {}).get("cat") or {}).get("en") or "").strip().lower()
            zh = (((col or {}).get("cat") or {}).get("zh") or "").strip()
            if en in spec["keys"] or zh == spec["zh"]:
                hit = idx
                break
        if hit is None:
            continue
        used.add(hit)
        col = dict(cols[hit])
        col["cat"] = {"zh": spec["zh"], "en": spec["en"]}
        col["color"] = spec["color"]
        out.append(col)
    # 未能识别的栏目按原顺序追加，避免丢数据
    out.extend(cols[i] for i in range(len(cols)) if i not in used)
    data = dict(data or {})
    data["columns"] = out
    return data


# ---------- 基础工具 ----------

def issue_date(data):
    """从 updatedAt 取日期（本地日期部分）作为该期编号。"""
    iso = (data or {}).get("updatedAt") or ""
    return iso[:10] if len(iso) >= 10 else None


def stats(data):
    cols = data.get("columns") or []
    items = [i for c in cols for i in (c.get("items") or [])]
    verified = [i for i in items if i.get("verified")]
    labels = {s.get("label") for i in items for s in (i.get("sources") or []) if s.get("label")}
    return {
        "items": len(items),
        "verified": len(verified),
        "sources": len(labels),
        "columns": len(cols),
    }


def write_issue(data, date, *, force=False, normalize=True):
    """写一份快照；已存在且内容相同则跳过。返回 True 表示有写入。"""
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    path = ARCHIVE / f"{date}.json"
    if normalize:
        data = normalize_columns(data)
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and not force:
        if path.read_text(encoding="utf-8") == payload:
            return False
    path.write_text(payload, encoding="utf-8")
    return True


def rebuild_manifest():
    """扫描存档目录，生成按日期倒序的清单。"""
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    issues = []
    for f in sorted(ARCHIVE.glob("*.json")):
        if f.name == "index.json":
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  ! 跳过无法解析的 {f.name}: {e}")
            continue
        date = issue_date(data) or f.stem
        issues.append({
            "date": date,
            "updatedAt": data.get("updatedAt"),
            "file": f.name,
            "retro": date < STANDARD_SINCE,   # 现行标准之前的历史期次
            **stats(data),
        })
    issues.sort(key=lambda x: x["date"], reverse=True)
    MANIFEST.write_text(
        json.dumps({"count": len(issues), "issues": issues}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return issues


# ---------- 模式：backfill ----------

def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout


def backfill(normalize=True):
    """遍历 git 历史中 docs/radar-data.json 的每个版本，按日期导出。"""
    commits = git("log", "--reverse", "--format=%H", "--", "docs/radar-data.json").split()
    if not commits:
        print("git 历史中没有 docs/radar-data.json")
        return []
    by_date = {}   # date -> (commit, data)  后写入者覆盖前者
    for c in commits:
        raw = git("show", f"{c}:docs/radar-data.json")
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        if not isinstance(data.get("columns"), list):
            continue
        date = issue_date(data)
        if not date:
            continue
        by_date[date] = (c, data)

    written = []
    for date in sorted(by_date):
        commit, data = by_date[date]
        if write_issue(data, date, normalize=normalize):
            written.append(date)
        st = stats(normalize_columns(data) if normalize else data)
        order = " / ".join(c["cat"]["zh"] for c in (normalize_columns(data) if normalize else data)["columns"])
        print(f"  ✓ {date}  ({commit[:7]})  {st['items']} 条 / verified {st['verified']}  [{order}]")
    return written


# ---------- 模式：snapshot ----------

def snapshot():
    """把当前 radar-data.json 存为存档（周更覆盖前调用）。"""
    if not LIVE.exists():
        print("找不到 docs/radar-data.json")
        return None
    data = json.loads(LIVE.read_text(encoding="utf-8"))
    date = issue_date(data)
    if not date:
        print("radar-data.json 缺少 updatedAt，无法归档")
        return None
    changed = write_issue(data, date)
    print(f"  {'✓ 已归档' if changed else '= 已存在且一致，跳过'} {date}")
    return date


# ---------- 入口 ----------

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "snapshot"
    print(f"== 雷达存档 · {mode} ==")
    if mode == "backfill":
        backfill()
    elif mode == "snapshot":
        snapshot()
    elif mode != "reindex":
        print(f"未知模式：{mode}（可选 backfill / snapshot / reindex）")
        return 1
    issues = rebuild_manifest()
    print(f"清单 docs/radar-archive/index.json：{len(issues)} 期")
    for it in issues:
        print(f"  {it['date']}  {it['items']:>2} 条 · verified {it['verified']} · 来源 {it['sources']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
