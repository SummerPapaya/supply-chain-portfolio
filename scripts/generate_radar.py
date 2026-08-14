#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Supply Chain Radar — scheduled data generator.

Fetches a set of public supply-chain / shipping / logistics RSS feeds,
structures the recent items into the schema consumed by docs/index.html
(renderRadar), and writes:

  - docs/radar-data.json            (the file the refresh button fetches)
  - the embedded <script id="embeddedRadar"> fallback inside docs/index.html

Design notes
------------
* Stdlib only (urllib + xml.etree) so it runs in GitHub Actions with no pip install.
* Bilingual output: English feeds are passed through to both zh/en by default.
  If DEEPSEEK_API_KEY (or OPENAI_API_KEY) is set, titles/descriptions are
  translated to Chinese for the `zh` field via the OpenAI-compatible chat API.
* Graceful: a dead feed is skipped; if NO feed returns data, the existing
  docs/radar-data.json is left untouched (so we never publish an empty radar).
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Asia/Shanghai")
except Exception:
    _TZ = timezone(timedelta(hours=8))

# --------------------------------------------------------------------------- #
# Configurable feed list (edit freely). Short name is used as the source label.
# --------------------------------------------------------------------------- #
FEEDS = [
    ("Supply Chain Dive", "https://www.supplychaindive.com/feeds/news/"),
    ("FreightWaves",      "https://www.freightwaves.com/news/feed"),
    ("The Loadstar",      "https://theloadstar.com/feed/"),
    ("gCaptain",          "https://gcaptain.com/feed/"),
    ("Logistics Mgmt",    "https://www.logisticsmgmt.com/rss/news"),
]

COLUMNS = [
    {"key": "research", "cat": {"zh": "研究瞭望", "en": "Research"},
     "color": "#5b8cff",
     "kw": ["report", "research", "gartner", "mhi", "study", "survey",
            "analyst", "forecast", "trend", "whitepaper"]},
    {"key": "apps", "cat": {"zh": "应用风向", "en": "Apps & Adoption"},
     "color": "#35c2b0",
     "kw": ["automation", "robot", "warehouse", "software", "platform",
            "deploy", "technology", "startup", "orchestration", "digital twin"]},
    {"key": "hot", "cat": {"zh": "热门议题", "en": "Hot Topics"},
     "color": "#f0a13a",
     "kw": ["ai", "agent", "tariff", "policy", "regulation", "geopolit",
            "trade war", "sanction", "emission", "esg", "carbon", "reshor"]},
    {"key": "news", "cat": {"zh": "重点新闻", "en": "Key News"},
     "color": "#e05656", "kw": []},
]

ITEMS_PER_COLUMN = 3
UA = "Mozilla/5.0 (SupplyChainRadarBot/1.0; +https://github.com/SummerPapaya/supply-chain-portfolio)"


def fetch(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _text(el):
    if el is None or el.text is None:
        return ""
    return re.sub(r"\s+", " ", el.text).strip()


def _strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"&[a-zA-Z]+;", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _truncate(s, n=260):
    s = _strip_html(s)
    return s if len(s) <= n else s[:n].rstrip() + "…"


def _parse_date(s):
    if not s:
        return datetime.min.replace(tzinfo=timezone.utc)
    s = s.strip()
    # RSS pubDate (RFC 2822)
    try:
        from email.utils import parsedate_to_datetime
        d = parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception:
        pass
    # Atom updated (ISO 8601)
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def parse_feed(xml_bytes):
    """Return list of {title, link, summary, published(datetime)}."""
    out = []
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return out
    # RSS 2.0
    items = root.findall(".//item")
    if items:
        for it in items:
            out.append({
                "title": _text(it.find("title")),
                "link": _text(it.find("link")),
                "summary": _truncate(_text(it.find("description")) or _text(it.find("content:encoded"))),
                "published": _parse_date(_text(it.find("pubDate"))),
            })
        return out
    # Atom
    ns = "{http://www.w3.org/2005/Atom}"
    entries = root.findall(f"{ns}entry") or root.findall("entry")
    for e in entries:
        link = ""
        for l in e.findall(f"{ns}link") or e.findall("link"):
            rel = l.get("rel")
            if rel is None or rel == "alternate":
                link = l.get("href") or ""
                break
        out.append({
            "title": _text(e.find(f"{ns}title") or e.find("title")),
            "link": link,
            "summary": _truncate(_text(e.find(f"{ns}summary") or e.find("summary"))
                                or _text(e.find(f"{ns}content") or e.find("content"))),
            "published": _parse_date(_text(e.find(f"{ns}updated") or e.find("updated"))),
        })
    return out


def categorize(title, summary):
    blob = (title + " " + summary).lower()
    for col in COLUMNS:
        if not col["kw"]:
            continue
        if any(k in blob for k in col["kw"]):
            return col["key"]
    return "news"


# --------------------------------------------------------------------------- #
# Optional translation (OpenAI-compatible). No key -> pass-through (English in
# both zh/en). Any failure falls back to pass-through.
# --------------------------------------------------------------------------- #
def _translate_client():
    key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    base = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1")
    model = os.environ.get("LLM_MODEL", "deepseek-chat")
    return key, base, model


def translate_zh(text):
    cfg = _translate_client()
    if not cfg or not text:
        return text
    key, base, model = cfg
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system",
             "content": "You translate English supply-chain news into concise, "
                        "natural Simplified Chinese. Return only the translation."},
            {"role": "user", "content": text}
        ],
        "temperature": 0.2,
    }).encode("utf-8")
    try:
        req = urllib.request.Request(
            base.rstrip("/") + "/chat/completions",
            data=payload,
            headers={"Authorization": f"Bearer {key}",
                     "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return text


def main():
    collected = {c["key"]: [] for c in COLUMNS}
    for name, url in FEEDS:
        try:
            raw = fetch(url)
            for it in parse_feed(raw):
                if not it["title"] or not it["link"]:
                    continue
                cat = categorize(it["title"], it["summary"])
                collected[cat].append(it)
        except Exception as e:
            print(f"[skip] {name}: {e}", file=sys.stderr)

    # Sort each column by recency and cap.
    columns_out = []
    for col in COLUMNS:
        items = sorted(collected[col["key"]], key=lambda x: x["published"], reverse=True)
        items = items[:ITEMS_PER_COLUMN]
        out_items = []
        for it in items:
            en_title = it["title"]
            en_desc = it["summary"] or it["title"]
            zh_title = translate_zh(en_title)
            zh_desc = translate_zh(en_desc) if en_desc != en_title else zh_title
            out_items.append({
                "title": {"zh": zh_title, "en": en_title},
                "desc": {"zh": zh_desc, "en": en_desc},
                "sources": [{"label": f"{name} ↗", "url": it["link"]}],
            })
        columns_out.append({
            "cat": col["cat"],
            "color": col["color"],
            "items": out_items,
        })

    total = sum(len(c["items"]) for c in columns_out)
    if total == 0:
        print("[warn] no feed data fetched; leaving docs/radar-data.json unchanged.",
              file=sys.stderr)
        return

    data = {
        "updatedAt": datetime.now(_TZ).strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "columns": columns_out,
    }
    json_str = json.dumps(data, ensure_ascii=False, indent=2)

    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    radar_path = os.path.join(repo, "docs", "radar-data.json")
    with open(radar_path, "w", encoding="utf-8") as f:
        f.write(json_str + "\n")
    print(f"[ok] wrote {radar_path} ({total} items)")

    # Keep the offline fallback in index.html in sync.
    html_path = os.path.join(repo, "docs", "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            html = f.read()
        new_html = re.sub(
            r'(<script id="embeddedRadar" type="application/json">)([\s\S]*?)(</script>)',
            lambda m: m.group(1) + "\n" + json_str + "\n" + m.group(3),
            html, count=1,
        )
        if new_html != html:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(new_html)
            print(f"[ok] updated embedded fallback in {html_path}")


if __name__ == "__main__":
    main()
