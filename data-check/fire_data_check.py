#!/usr/bin/env python3
"""FIRE 数据源验证脚本。

验证三个免费数据源能否稳定拉取实时 + 历史数据：
  1. 公募基金（天天基金 / 东方财富）
  2. A 股（新浪 / 东方财富）
  3. 加密货币（CoinGecko）

运行: python3 fire_data_check.py
"""
from __future__ import annotations

import json
import os
import time
import traceback
from datetime import datetime
from pathlib import Path

import requests

OUTPUTS = Path(__file__).parent / "outputs"
OUTPUTS.mkdir(exist_ok=True)
REPORT: list[dict] = []

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15"}

# 国内行情服务器对代理 IP 不友好；用户开了 clash/v2ray 时需要直连。
# 中国大陆 host 走 _cn_session（trust_env=False，忽略系统 SOCKS 代理），
# CoinGecko 等境外 host 走 _global_session（默认 trust_env=True）。
CN_HOSTS = (
    ".eastmoney.com",
    ".1234567.com.cn",
    ".sinajs.cn",
    "hq.sinajs.cn",
    "quotes.sina.cn",
    ".sina.com.cn",
)

_cn_session = requests.Session()
_cn_session.trust_env = False  # 完全忽略 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY 环境变量
_global_session = requests.Session()


def get(url: str, **kwargs):
    """统一 GET：CN host 直连，境外走系统代理。"""
    kwargs.setdefault("timeout", 10)
    sess = _cn_session if any(h in url for h in CN_HOSTS) else _global_session
    return sess.get(url, **kwargs)


def check(name: str, fn):
    print(f"\n→ {name}")
    start = time.time()
    try:
        result = fn()
        elapsed_ms = int((time.time() - start) * 1000)
        REPORT.append({"name": name, "status": "✓", "ms": elapsed_ms})
        print(f"  ✓ {elapsed_ms} ms")
        if isinstance(result, dict):
            for k, v in result.items():
                print(f"    {k}: {v}")
        return result
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        REPORT.append({"name": name, "status": "✗", "ms": elapsed_ms, "error": str(e)})
        print(f"  ✗ {elapsed_ms} ms — {e}")
        if os.environ.get("DEBUG"):
            traceback.print_exc()
        return None


def save_raw(filename: str, payload):
    path = OUTPUTS / filename
    if isinstance(payload, (dict, list)):
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        path.write_text(str(payload), encoding="utf-8")


# ==================== 公募基金 ====================

def fund_realtime(code: str) -> dict:
    """天天基金盘中估值（jsonp 包装）。"""
    url = f"http://fundgz.1234567.com.cn/js/{code}.js"
    resp = get(url, timeout=5, headers=UA)
    resp.raise_for_status()
    text = resp.text.strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    if start < 0 or end <= 0:
        raise ValueError(f"无估值数据（基金未开盘 / 代码无效）: {text[:80]}")
    data = json.loads(text[start:end])
    save_raw(f"fund_realtime_{code}.json", data)
    return {
        "code": data.get("fundcode"),
        "name": data.get("name"),
        "实时估值": data.get("gsz"),
        "估算涨跌": (data.get("gszzl") or "0") + "%",
        "估值时间": data.get("gztime"),
        "最新净值": data.get("dwjz"),
        "净值日期": data.get("jzrq"),
    }


def fund_history(code: str) -> dict:
    """基金历史净值。

    用 fund.eastmoney.com 的 pingzhongdata 接口（返回 JS 文件，内嵌完整净值序列）。
    这个接口比 api.fund.eastmoney.com/f10/lsjz 稳定得多，不需要 cookie/referer。
    """
    url = f"http://fund.eastmoney.com/pingzhongdata/{code}.js"
    resp = get(url, headers=UA, timeout=15)
    resp.raise_for_status()
    text = resp.text
    # 找 "var Data_netWorthTrend = [...];" 这一行
    marker = "var Data_netWorthTrend ="
    idx = text.find(marker)
    if idx < 0:
        raise ValueError(f"pingzhongdata 未含 Data_netWorthTrend (resp len={len(text)})")
    start = text.find("[", idx)
    # 找匹配的右括号（数组结尾分号前）
    end = text.find("];", start)
    if end < 0:
        raise ValueError("Data_netWorthTrend 解析失败：找不到 ];")
    raw = text[start:end + 1]
    # 字段名是 x/y/equityReturn/unitMoney，没引号，是合法 JS 不是合法 JSON。
    # 用简单替换转换为 JSON。
    json_like = (
        raw.replace("x:", '"x":')
           .replace("y:", '"y":')
           .replace("equityReturn:", '"equityReturn":')
           .replace("unitMoney:", '"unitMoney":')
    )
    items = json.loads(json_like)
    if not items:
        raise ValueError("空净值序列")
    save_raw(f"fund_history_{code}.json", items[-20:])

    def fmt_date(ts):
        return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")

    first, last = items[0], items[-1]
    return {
        "样本数": len(items),
        "最早日期": fmt_date(first["x"]),
        "最早净值": first["y"],
        "最新日期": fmt_date(last["x"]),
        "最新净值": last["y"],
        "区间涨跌幅": f"{(last['y'] / first['y'] - 1) * 100:+.2f}%",
    }


# ==================== A 股 ====================

def astock_realtime(code: str) -> dict:
    """新浪财经实时行情。code: sh600519 / sz000001 / sh510500"""
    url = f"https://hq.sinajs.cn/list={code}"
    headers = {**UA, "Referer": "https://finance.sina.com.cn"}
    resp = get(url, headers=headers, timeout=5)
    resp.raise_for_status()
    # var hq_str_sh600519="贵州茅台,...";
    text = resp.content.decode("gbk", errors="ignore")
    inside = text.split('"')[1] if '"' in text else ""
    parts = inside.split(",")
    if len(parts) < 32:
        raise ValueError(f"unexpected sina format: {text[:120]}")
    save_raw(f"astock_realtime_{code}.txt", text)
    return {
        "code": code,
        "name": parts[0],
        "今开": parts[1],
        "昨收": parts[2],
        "现价": parts[3],
        "最高": parts[4],
        "最低": parts[5],
        "成交量(手)": parts[8],
        "日期": parts[30],
        "时间": parts[31],
    }


def gold_realtime(code: str = "AU9999") -> dict:
    """上海黄金交易所现货金（新浪 gds_*）。CNY/克。
    code: AU9999 (沪金99 含税) / AU9995 / AU100G ..."""
    url = f"https://hq.sinajs.cn/list=gds_{code}"
    headers = {**UA, "Referer": "https://finance.sina.com.cn"}
    resp = get(url, headers=headers, timeout=5)
    resp.raise_for_status()
    text = resp.content.decode("gbk", errors="ignore")
    inside = text.split('"')[1] if '"' in text else ""
    parts = inside.split(",")
    if len(parts) < 14:
        raise ValueError(f"unexpected gds format: {text[:120]}")
    save_raw(f"gold_realtime_{code}.txt", text)
    return {
        "code": code,
        "name": parts[13],
        "现价": parts[0],
        "买价": parts[2],
        "卖价": parts[3],
        "最高": parts[4],
        "最低": parts[5],
        "时间": parts[6],
        "昨收": parts[7],
        "今开": parts[8],
        "成交量(克)": parts[9],
        "日期": parts[12],
    }


def astock_history(code: str, days: int = 250) -> dict:
    """A 股日 K 线。

    主用新浪 (CN_MarketDataService.getKLineData)，新浪用同一个 host 已经验证过实时接口
    走代理 OK，K 线接口稳定性也比东方财富 push2his 更好。
    返回字段：[{day, open, high, low, close, volume}, ...]
    """
    url = "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
    params = {"symbol": code, "scale": 240, "ma": "no", "datalen": days}
    resp = get(url, params=params, headers={**UA, "Referer": "https://finance.sina.com.cn"}, timeout=10)
    resp.raise_for_status()
    # 响应是 JSON 数组（带 BOM 时去掉）
    text = resp.text.lstrip("﻿").strip()
    klines = json.loads(text)
    if not isinstance(klines, list) or not klines:
        raise ValueError(f"empty klines: {text[:120]}")
    save_raw(f"astock_history_{code}.json", klines[-20:])
    first, last = klines[0], klines[-1]
    change_pct = (float(last["close"]) / float(first["close"]) - 1) * 100
    return {
        "样本数": len(klines),
        "最早日期": first["day"],
        "最早收盘": first["close"],
        "最新日期": last["day"],
        "最新收盘": last["close"],
        "区间涨跌幅": f"{change_pct:+.2f}%",
    }


def market_monthly_returns(code: str = "sh510300", years: int = 10) -> list[float]:
    """计算月度收益率序列，供历史回测蒙特卡洛使用。

    从日 K 线取月末收盘价，计算月度对数收益率。
    返回: [0.023, -0.045, 0.012, ...] （小数，非百分比）
    """
    days = min(years * 250, 3000)  # 约 250 交易日/年，最多 3000 条
    url = "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
    params = {"symbol": code, "scale": 240, "ma": "no", "datalen": days}
    resp = get(url, params=params, headers={**UA, "Referer": "https://finance.sina.com.cn"}, timeout=15)
    resp.raise_for_status()
    text = resp.text.lstrip("﻿").strip()
    klines = json.loads(text)
    if not isinstance(klines, list) or len(klines) < 2:
        raise ValueError("历史数据不足")

    # 按月份分组，取每月最后一个交易日的收盘价
    from collections import OrderedDict
    monthly: dict[str, float] = OrderedDict()
    for bar in klines:
        ym = bar["day"][:7]  # "YYYY-MM"
        monthly[ym] = float(bar["close"])

    closes = list(monthly.values())
    if len(closes) < 3:
        raise ValueError("月度数据不足")

    # 计算月度简单收益率
    returns = []
    for i in range(1, len(closes)):
        if closes[i - 1] > 0:
            returns.append((closes[i] - closes[i - 1]) / closes[i - 1])

    return returns


# ==================== 港股（新浪 rt_hk）====================

def hk_realtime(code: str) -> dict:
    """港股实时行情（新浪 rt_hk 接口）。
    code: 4-5 位数字，如 "00700" (腾讯), "00388" (港交所)。

    实际字段格式：
      EN_name, CN_name, price, prev_close, open, high, low,
      change_amt, change_pct_decimal, bid, ask, ..., date, time, ...
    """
    padded = code.zfill(5) if len(code) <= 5 else code
    symbol = f"rt_hk{padded}"
    url = f"https://hq.sinajs.cn/list={symbol}"
    headers = {**UA, "Referer": "https://finance.sina.com.cn"}
    resp = get(url, headers=headers, timeout=5)
    resp.raise_for_status()
    text = resp.content.decode("gbk", errors="ignore")
    inside = text.split('"')[1] if '"' in text else ""
    parts = inside.split(",")
    # 至少需要 10 个字段：EN_name, CN_name, price(2), prev(3), open(4), high(5), low(6), chg_amt(7), chg_pct(8), ...
    if len(parts) < 9 or not parts[0]:
        raise ValueError(f"港股代码无效或数据为空: {text[:120]}")
    save_raw(f"hk_realtime_{code}.txt", text)
    # parts[2] = current price, parts[3] = prev close, parts[8] = change_pct (decimal, e.g. 0.346)
    price      = float(parts[2]) if parts[2] else 0.0
    prev       = float(parts[3]) if parts[3] else 0.0
    chg_pct_d  = float(parts[8]) if len(parts) > 8 and parts[8] else 0.0
    change_pct = f"{chg_pct_d:+.2f}%" if prev > 0 else "—"
    # Date/time are around index 16/17
    date_str = parts[16].strip() if len(parts) > 16 else "—"
    time_str = parts[17].strip() if len(parts) > 17 else "—"
    return {
        "code":   padded,
        "name":   parts[1],  # 中文名
        "现价":   parts[2],
        "昨收":   parts[3],
        "今开":   parts[4] if len(parts) > 4 else "—",
        "最高":   parts[5] if len(parts) > 5 else "—",
        "最低":   parts[6] if len(parts) > 6 else "—",
        "日期":   date_str,
        "时间":   time_str,
        "涨跌幅": change_pct,
        "货币":   "HKD",
    }


# ==================== 美股（新浪 gb_）====================

def us_realtime(ticker: str) -> dict:
    """美股实时行情（新浪 gb_ 接口）。
    ticker: 大写或小写，如 "AAPL", "TSLA", "NVDA"。

    实际字段格式：
      CN_name, price, change_pct, datetime, change_amt, low, high, low2, high2, ...
    """
    symbol = f"gb_{ticker.lower()}"
    url = f"https://hq.sinajs.cn/list={symbol}"
    headers = {**UA, "Referer": "https://finance.sina.com.cn"}
    resp = get(url, headers=headers, timeout=5)
    resp.raise_for_status()
    text = resp.content.decode("gbk", errors="ignore")
    inside = text.split('"')[1] if '"' in text else ""
    parts = inside.split(",")
    if len(parts) < 3 or not parts[0]:
        raise ValueError(f"美股代码无效或数据为空: {text[:120]}")
    save_raw(f"us_realtime_{ticker}.txt", text)
    # parts[0]=name, parts[1]=price, parts[2]=change_pct_decimal, parts[3]=datetime
    try:
        chg_pct = float(parts[2])
        change_str = f"{chg_pct:+.2f}%"
    except (ValueError, IndexError):
        change_str = "—"
    return {
        "code":   ticker.upper(),
        "name":   parts[0],
        "现价":   parts[1],
        "涨跌幅": change_str,
        "货币":   "USD",
    }


# ==================== 加密货币 ====================

def crypto_realtime(ids: list[str]) -> dict:
    """CoinGecko 实时价（含 24h 涨跌）。返回结构化字典: {coin: {cny, usd, change_24h}}"""
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {
        "ids": ",".join(ids),
        "vs_currencies": "cny,usd",
        "include_24hr_change": "true",
    }
    resp = get(url, params=params, headers=UA, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError("empty response (rate limit?)")
    save_raw("crypto_realtime.json", data)
    out = {}
    for coin in ids:
        d = data.get(coin) or {}
        out[coin] = {
            "cny": d.get("cny"),
            "usd": d.get("usd"),
            "change_24h": d.get("usd_24h_change"),
        }
    return out


def _format_crypto_for_terminal(prices: dict) -> dict:
    """终端打印用的格式化版本。"""
    out = {}
    for coin, d in prices.items():
        if d.get("cny") is None:
            out[coin] = "(missing)"
        else:
            out[coin] = (
                f"¥{d['cny']:,.2f} / ${d['usd']:,.2f} "
                f"({d.get('change_24h') or 0:+.2f}%)"
            )
    return out


def crypto_history(coin_id: str, days: int = 365) -> dict:
    """CoinGecko 历史价格（日级）。"""
    url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart"
    params = {"vs_currency": "cny", "days": days}
    resp = get(url, params=params, headers=UA, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    prices = data.get("prices") or []
    if not prices:
        raise ValueError("empty price series")
    save_raw(f"crypto_history_{coin_id}.json", prices[:20])
    first, last = prices[0], prices[-1]
    return {
        "样本数": len(prices),
        "最早日期": datetime.fromtimestamp(first[0] / 1000).strftime("%Y-%m-%d"),
        "最早价格": f"¥{first[1]:,.2f}",
        "最新日期": datetime.fromtimestamp(last[0] / 1000).strftime("%Y-%m-%d"),
        "最新价格": f"¥{last[1]:,.2f}",
        "涨跌幅": f"{(last[1] / first[1] - 1) * 100:+.2f}%",
    }


# ==================== Main ====================

def main():
    print("=" * 64)
    print(f"FIRE 数据源验证 · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 64)

    print("\n【1/3 公募基金（天天基金 / 东方财富）】")
    check("华夏成长 (000001) 盘中估值", lambda: fund_realtime("000001"))
    check("易方达蓝筹精选 (005827) 盘中估值", lambda: fund_realtime("005827"))
    check("中欧医疗健康 (003095) 盘中估值", lambda: fund_realtime("003095"))
    check("华夏成长 (000001) 历史净值 1 年", lambda: fund_history("000001"))

    print("\n【2/3 A 股 / ETF（新浪 / 东方财富）】")
    check("贵州茅台 (sh600519) 实时", lambda: astock_realtime("sh600519"))
    check("平安银行 (sz000001) 实时", lambda: astock_realtime("sz000001"))
    check("沪深300ETF (sh510300) 实时", lambda: astock_realtime("sh510300"))
    check("贵州茅台 (sh600519) 日 K 250 天", lambda: astock_history("sh600519"))
    check("沪深300ETF (sh510300) 日 K 250 天", lambda: astock_history("sh510300"))

    print("\n【3/3 加密货币（CoinGecko）】")
    check("BTC / ETH / SOL 实时", lambda: _format_crypto_for_terminal(
        crypto_realtime(["bitcoin", "ethereum", "solana"])
    ))
    check("BTC 历史 365 天", lambda: crypto_history("bitcoin"))

    # ===== Summary =====
    print("\n" + "=" * 64)
    print("汇总")
    print("=" * 64)
    passed = sum(1 for r in REPORT if r["status"] == "✓")
    total = len(REPORT)
    print(f"\n通过率: {passed}/{total}")
    print(f"原始响应已保存至: {OUTPUTS}/\n")

    failed = [r for r in REPORT if r["status"] == "✗"]
    if failed:
        print("失败项:")
        for r in failed:
            print(f"  ✗ {r['name']} — {r.get('error')}")
        print()

    # Performance
    print("响应耗时:")
    for r in REPORT:
        bar = "█" * min(40, r["ms"] // 50)
        print(f"  {r['status']} {r['ms']:>5} ms  {bar}  {r['name']}")


if __name__ == "__main__":
    main()
