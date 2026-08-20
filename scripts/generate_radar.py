#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Supply Chain Radar — scheduled data generator.

Fetches a curated set of authoritative supply-chain / shipping / logistics
RSS feeds, cross-verifies stories that appear in more than one source,
structures the recent items into the schema consumed by docs/index.html
(renderRadar), and writes:

  - docs/radar-data.json            (the file the page fetches)
  - the embedded <script id="embeddedRadar"> fallback inside docs/index.html

Quality principles (restored to match the hand-curated baseline)
----------------------------------------------------------------
* Source bar: ONLY authoritative, dated RSS feeds (trade press + research /
  model-report blogs). Low-quality / undated HTML scrapers are intentionally
  excluded — every feed below carries a real publication date.
* Cross-verification: items from DIFFERENT sources about the same story are
  merged into one card. When >= 2 independent sources corroborate a story,
  the card is flagged `verified: true` and floats to the top of its column.
* Recency gate: stories older than RECENCY_DAYS are dropped so the radar
  always reflects current, accurate intelligence.
* Bilingual output: English is the source of truth; if DEEPSEEK_API_KEY (or
  OPENAI_API_KEY) is set, titles/descriptions are translated to Chinese.
* Graceful: a dead feed is skipped; if NO feed returns data, the existing
  docs/radar-data.json is left untouched (never publish an empty radar).
"""

import json
import os
import re
import sys
import html
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
# Curated, authoritative feed list (edit freely). Short name = source label.
# Every feed below serves real RSS WITH publication dates.
# --------------------------------------------------------------------------- #
FEEDS = [
    ("Supply Chain Dive",   "https://www.supplychaindive.com/feeds/news/"),
    ("FreightWaves",        "https://www.freightwaves.com/news/feed"),
    ("The Loadstar",        "https://theloadstar.com/feed/"),
    ("gCaptain",            "https://gcaptain.com/feed/"),
    ("MHI",                 "https://mhiblog.org/feed/"),        # research / model-report blog
    ("Journal of Commerce", "https://www.joc.com/rss.xml"),      # authoritative trade / shipping
    ("Freightos",           "https://www.freightos.com/feed/"),  # freight-rate intelligence
]

COLUMNS = [
    {"key": "research", "cat": {"zh": "研究瞭望", "en": "Research"},
     "color": "#5b8cff",
     "kw": ["report", "research", "gartner", "mhi", "study", "survey",
            "analyst", "forecast", "trend", "whitepaper",
            # 中文
            "报告", "研究", "白皮书", "调研", "分析", "预测", "年报"]},
    {"key": "apps", "cat": {"zh": "应用风向", "en": "Apps & Adoption"},
     "color": "#35c2b0",
     "kw": ["automation", "robot", "warehouse", "software", "platform",
            "deploy", "technology", "startup", "orchestration", "digital twin",
            # 中文
            "自动化", "机器人", "仓储", "软件", "平台", "数字化", "智能", "系统", "物联网"]},
    {"key": "hot", "cat": {"zh": "热门议题", "en": "Hot Topics"},
     "color": "#f0a13a",
     "kw": ["ai", "agent", "tariff", "policy", "regulation", "geopolit",
            "trade war", "sanction", "emission", "esg", "carbon", "reshor",
            # 中文
            "关税", "政策", "监管", "地缘", "贸易", "制裁", "碳", "环保", "合规", "回流"]},
    {"key": "news", "cat": {"zh": "重点新闻", "en": "Key News"},
     "color": "#e05656", "kw": []},
]

ITEMS_PER_COLUMN = 3
FEED_MAX_PER_COLUMN = 2    # diversity cap: no single feed monopolizes a column
RECENCY_DAYS = 21          # drop stories older than this (accuracy / freshness gate)
UA = "Mozilla/5.0 (SupplyChainRadarBot/1.0; +https://github.com/SummerPapaya/supply-chain-portfolio)"

# Words too generic to count toward story-similarity matching.
_STOP = set(
    "the a an of to in on for and or with from by at as is are was were be "
    "this that these those new how why what when where who its their our your "
    "supply chain logistics global into over after amid says say report reports "
    "could will would can may me than then now per via are not but has have had".split()
)


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
    s = html.unescape(s)            # decode &amp; / &#38; / &nbsp; etc.
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
# Cross-verification: cluster items from DIFFERENT sources about the same story
# --------------------------------------------------------------------------- #
def _norm_tokens(s):
    toks = re.findall(r"[a-z0-9][a-z0-9'\-]{3,}", (s or "").lower())
    return {t for t in toks if t not in _STOP and not t.isdigit()}


def _similar(a, b):
    """High-precision SAME-STORY match (not just same-topic).

    Requires >= 3 shared significant words AND Jaccard >= 0.5, so it only
    fires when two outlets are clearly reporting the identical story (e.g.
    syndicated wire copy or parallel reporting). This deliberately avoids
    merging merely-related articles (same topic, different story), which would
    create false "verified" badges and undermine accuracy. Genuine same-story
    duplicates are rare in live diverse feeds, so `verified` is truthfully rare.
    """
    ta, tb = _norm_tokens(a), _norm_tokens(b)
    if len(ta) < 3 or len(tb) < 3:
        return False
    inter = ta & tb
    if len(inter) < 3:
        return False
    union = ta | tb
    return (len(inter) / len(union)) >= 0.5


def _cluster(items):
    """Union-find: merge indices whose titles look like the same story (diff source)."""
    n = len(items)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            if items[i]["source"] == items[j]["source"]:
                continue
            if _similar(items[i]["title"], items[j]["title"]):
                union(i, j)
    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


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


def _load_existing_zh():
    """Best-effort: reuse previous zh translations so a no-key rerun does not
    wipe Chinese back to English pass-through."""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(os.path.dirname(here), "docs", "radar-data.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    out = {}
    for c in data.get("columns", []):
        for it in c.get("items", []):
            t, d = it.get("title", {}), it.get("desc", {})
            if t.get("en"):
                out[t["en"]] = {"zh": t.get("zh"), "desc_zh": d.get("zh")}
    return out


def _fetch_meta_desc(url, timeout=12):
    """Best-effort summary from the article page's meta description."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            html = r.read().decode("utf-8", "ignore")
        m = re.search(r'<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']+)["\']',
                      html, re.I)
        if not m:
            m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']',
                          html, re.I)
        if m:
            return _truncate(m.group(1), 200)
    except Exception:
        pass
    return ""


def main():
    existing_zh = _load_existing_zh()
    cfg = _translate_client()
    raw_items = []
    for name, url in FEEDS:
        try:
            raw = fetch(url)
            for it in parse_feed(raw):
                if not it["title"] or not it["link"]:
                    continue
                it["source"] = name  # remember which feed this item came from
                raw_items.append(it)
        except Exception as e:
            print(f"[skip] {name}: {e}", file=sys.stderr)

    if not raw_items:
        print("[warn] no feed data fetched; leaving docs/radar-data.json unchanged.",
              file=sys.stderr)
        return

    # Recency gate (accuracy / freshness): drop anything older than RECENCY_DAYS.
    now = datetime.now(timezone.utc)
    fresh = [it for it in raw_items if (now - it["published"]).days <= RECENCY_DAYS]
    raw_items = fresh  # if empty, the guard below bails out safely
    if not raw_items:
        print("[warn] every item filtered out by recency gate; "
              "leaving docs/radar-data.json unchanged.", file=sys.stderr)
        return

    # Cross-verification: cluster same-story items across different sources.
    collected = {c["key"]: [] for c in COLUMNS}
    for grp in _cluster(raw_items):
        members = [raw_items[i] for i in grp]
        primary = max(members, key=lambda x: x["published"])
        # Build a de-duplicated source list for this story.
        src_seen, sources = {}, []
        for m in members:
            if m["link"] in src_seen:
                continue
            src_seen[m["link"]] = True
            sources.append({"label": f"{m['source']} ↗", "url": m["link"]})
        verified = len(sources) >= 2

        en_title = primary["title"]
        en_desc = primary["summary"]
        if not en_desc:
            md = _fetch_meta_desc(primary["link"])
            if md:
                en_desc = md
        zh_title = translate_zh(en_title)
        zh_desc = translate_zh(en_desc) if en_desc and en_desc != en_title else zh_title
        if cfg is None and en_title in existing_zh:
            # No translation key available: keep the previously curated Chinese
            # instead of falling back to English pass-through.
            prev = existing_zh[en_title]
            zh_title = prev["zh"] or zh_title
            zh_desc = prev["desc_zh"] or zh_desc

        cat = categorize(en_title, en_desc)
        collected[cat].append({
            "published": primary["published"],
            "feed": primary["source"],   # used only for the diversity cap below
            "title": {"zh": zh_title, "en": en_title},
            "desc": {"zh": zh_desc, "en": en_desc or en_title},
            "sources": sources,
            "verified": verified,
        })

    columns_out = []
    for col in COLUMNS:
        # Verified (cross-source) stories float to the top, then by recency.
        items = sorted(collected[col["key"]],
                       key=lambda x: (x["verified"], x["published"]), reverse=True)
        # Diversity cap: no single feed monopolizes the column.
        feed_count, picked = {}, []
        for it in items:
            f = it.get("feed")
            if f and feed_count.get(f, 0) >= FEED_MAX_PER_COLUMN:
                continue
            picked.append(it)
            feed_count[f] = feed_count.get(f, 0) + 1
            if len(picked) >= ITEMS_PER_COLUMN:
                break
        items = picked
        # `published` / `feed` are only used for sorting & diversity; strip before serializing.
        clean = [{k: v for k, v in it.items() if k not in ("published", "feed")} for it in items]
        columns_out.append({
            "cat": col["cat"],
            "color": col["color"],
            "items": clean,
        })

    total = sum(len(c["items"]) for c in columns_out)
    if total == 0:
        print("[warn] no items after filtering; leaving docs/radar-data.json unchanged.",
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
    print(f"[ok] wrote {radar_path} ({total} items, "
          f"{sum(1 for c in columns_out for i in c['items'] if i['verified'])} verified)")

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
