#!/usr/bin/env python3
# scripts/wc_tokenize.py
# 词云（build_wordcloud.py）与共现网络（build_wordcloud_network.py）**共用**的分词规则。
#
# 为什么抽出来：两脚本此前各自复制了一份「词性白名单 / 停用词 / 标点集 / 英文复数归并」，
# 规则一旦要改（比如再剔一个虚词）必须同步改两处，极易漂移。这里作为单一事实来源。
#
# 规则要点：
#  - 中文用 jieba.posseg 只留核心实词（名词 / 专名 / 动名词 / 英文 token），
#    动词、形容词、副词、介词等虚词一律剔除，否则「日起 / 尚未 / 升至」这类会进词云；
#  - 英文统一小写，英文复数在构图时按词表归并（canon_en），避免 rate / rates 被拆开稀释权重。
import pathlib
import re

import jieba.posseg as pseg

ROOT = pathlib.Path(__file__).resolve().parent.parent
SW_ZH = ROOT / "scripts" / "stopwords_zh.txt"
SW_EN = ROOT / "scripts" / "stopwords_en.txt"

# 中文仅保留这些词性的「核心实词」；其余（动词 v、形容词 a、副词 d、
# 代词 r、介词 p、连词 c、助词 u、数词 m、量词 q 等）一律剔除。
ZH_POS_KEEP = {
    "n",   # 名词
    "nr",  # 人名
    "ns",  # 地名
    "nt",  # 机构名
    "nz",  # 其他专名
    "nl",  # 名词性惯用语
    "ng",  # 名词语素
    "vn",  # 动名词
    "l",   # 惯用语
    "eng", # 中文文本里的英文 token（AI / GPT / US …）
}

PUNCT = set("，。、；：！？（）《》【】“”‘’%0123456789.,:;!?()[]\"")

# 领域降权 / 主题词：每期都出现、信息量低
DENY = {"supply", "chain", "chains", "supplychain", "logistics", "logistic",
        "供应链", "物流", "链条"}

EN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]*")


def load_sw(p):
    """读停用词表：忽略空行与 # 开头的注释行。文件不存在时返回空集（不阻断构建）。"""
    p = pathlib.Path(p)
    if not p.exists():
        return set()
    return {line.strip() for line in p.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")}


def load_stopwords(sw_zh=SW_ZH, sw_en=SW_EN):
    return load_sw(sw_zh), load_sw(sw_en)


def tok_zh(text, sw):
    """中文分词：只保留长度>=2、非停用词、非主题词、词性属于核心实词的 token。"""
    out = []
    for w, flag in pseg.cut(text):
        w = w.strip()
        if len(w) < 2 or w in sw or w in DENY:
            continue
        if flag not in ZH_POS_KEEP or all(ch in PUNCT for ch in w):
            continue
        out.append(w)
    return out


def tok_en(text, sw):
    """英文分词：小写后按 EN_RE 抽取，剔除停用词 / 主题词 / 单字符。"""
    return [w for w in EN_RE.findall(text.lower())
            if len(w) >= 2 and w not in sw and w not in DENY]


def canon_en(w, vocab):
    """英文复数归并：'costs' 不在词表但 'cost' 在 → 按 'cost' 计（与 build_wordcloud 的
    merge_plurals 保持同一口径）。'us'→'u' 之类不会误触发（'u' 不在词表）。"""
    if w in vocab:
        return w
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss") and w[:-1] in vocab:
        return w[:-1]
    return None
