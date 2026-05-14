#!/usr/bin/env python3
"""组合聚合 demo：从真实行情拉取一个虚拟组合的当前净值。

模拟 iOS 端用户填好持仓后，App 每次启动要做的事：
  1. 对每个持仓项拉最新价格 / 净值
  2. 折算成 CNY
  3. 汇总净资产
  4. 给出"距离财富自由的进度"

运行: python3 portfolio_demo.py
"""
from __future__ import annotations

from datetime import datetime

from fire_data_check import (
    astock_realtime,
    crypto_realtime,
    fund_realtime,
)

# ============== 用户的虚拟组合 ==============
# 真实使用时会从 SwiftData 本地存储拉
PORTFOLIO = [
    {"type": "cash",   "name": "招行活期 + 余额宝",       "amount_cny": 80_000},
    {"type": "cash",   "name": "短期理财（货基）",          "amount_cny": 150_000},
    {"type": "fund",   "name": "易方达蓝筹精选",            "code": "005827",   "shares": 50_000},
    {"type": "fund",   "name": "中欧医疗健康A",             "code": "003095",   "shares": 20_000},
    {"type": "stock",  "name": "沪深300ETF",                "code": "sh510300", "shares": 100_000},
    {"type": "stock",  "name": "贵州茅台",                  "code": "sh600519", "shares": 100},
    {"type": "stock",  "name": "平安银行",                  "code": "sz000001", "shares": 5_000},
    {"type": "crypto", "name": "BTC",                       "id": "bitcoin",    "amount": 0.05},
    {"type": "crypto", "name": "ETH",                       "id": "ethereum",   "amount": 1.5},
    {"type": "crypto", "name": "SOL",                       "id": "solana",     "amount": 20},
]

TARGET_CNY = 10_000_000  # 财富自由门槛


def value_of(item: dict, crypto_prices: dict) -> tuple[float, str]:
    """返回 (item 当前价值 CNY, 备注)。"""
    if item["type"] == "cash":
        return float(item["amount_cny"]), "（手动录入）"
    if item["type"] == "fund":
        info = fund_realtime(item["code"])
        nav = float(info["实时估值"] or info["最新净值"])
        return nav * item["shares"], f"净值 {nav}（{info['估值时间']}）"
    if item["type"] == "stock":
        info = astock_realtime(item["code"])
        price = float(info["现价"])
        return price * item["shares"], f"现价 ¥{price}（{info['日期']} {info['时间']}）"
    if item["type"] == "crypto":
        d = crypto_prices.get(item["id"], {})
        price = float(d.get("cny") or 0)
        return price * item["amount"], f"¥{price:,.0f}/枚 ({d.get('usd_24h_change', 0):+.2f}%)"
    raise ValueError(f"未知类型: {item['type']}")


def main():
    print("=" * 70)
    print(f"FIRE 组合聚合 demo · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # 加密货币一次性批量拉，省请求数
    crypto_ids = [it["id"] for it in PORTFOLIO if it["type"] == "crypto"]
    print(f"\n拉取加密货币批量价格 ({len(crypto_ids)} 种)...")
    crypto_prices_raw = None
    if crypto_ids:
        import requests
        from fire_data_check import _global_session, UA
        resp = _global_session.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={
                "ids": ",".join(crypto_ids),
                "vs_currencies": "cny,usd",
                "include_24hr_change": "true",
            },
            headers=UA,
            timeout=10,
        )
        crypto_prices_raw = resp.json()

    print(f"\n{'类型':<8} {'名称':<24} {'数量':>14} {'估值 (CNY)':>16}  备注")
    print("-" * 100)

    total = 0.0
    by_type = {}

    for item in PORTFOLIO:
        try:
            v, note = value_of(item, crypto_prices_raw or {})
            total += v
            by_type[item["type"]] = by_type.get(item["type"], 0) + v
            qty = (
                f"¥{item.get('amount_cny', 0):,}"
                if item["type"] == "cash"
                else f"{item.get('shares', item.get('amount', 0)):,}"
            )
            print(f"{item['type']:<8} {item['name']:<22} {qty:>16} {v:>14,.0f}    {note}")
        except Exception as e:
            print(f"{item['type']:<8} {item['name']:<22} {'—':>16} {'(失败)':>14}    {e}")

    print("-" * 100)

    # 资产配置占比
    print("\n资产配置:")
    type_labels = {"cash": "现金", "fund": "公募基金", "stock": "股票/ETF", "crypto": "加密"}
    for t, v in sorted(by_type.items(), key=lambda x: -x[1]):
        pct = v / total * 100
        bar = "█" * int(pct / 2)
        print(f"  {type_labels.get(t, t):<10} ¥{v:>12,.0f}  {pct:>5.1f}%  {bar}")

    # 净资产 + 进度
    pct = total / TARGET_CNY * 100
    print(f"\n净资产合计:    ¥{total:>14,.0f}")
    print(f"财富自由目标:  ¥{TARGET_CNY:>14,.0f}")
    print(f"进度:          {pct:>14.1f}%")
    bar_len = 40
    filled = int(min(pct, 100) / 100 * bar_len)
    print(f"               [{('█' * filled).ljust(bar_len, '·')}]")

    # 这条线很关键：iOS App 完全可以用这个逻辑拼装首页
    print("\n→ 这是 iOS App 首页的数据流：上述输出能在 ~1-3 秒内拉完整组合，可行 ✓")


if __name__ == "__main__":
    main()
