#!/usr/bin/env python3
"""FIRE demo 后端代理 + 静态文件服务。

为什么需要后端：
  浏览器不允许直接 fetch 天天基金 / 新浪 / CoinGecko —— CORS 拦截。
  这个 Flask 服务把数据源包装成本地 API，前端从 http://localhost:8000/api/* 拉。

运行: python3 backend.py
然后浏览器访问: http://localhost:8000/
"""
from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from fire_data_check import (
    astock_history,
    astock_realtime,
    crypto_history,
    crypto_realtime,
    fund_history,
    fund_realtime,
    gold_realtime,
    hk_realtime,
    market_monthly_returns,
    us_realtime,
)

DEMO_DIR = Path(__file__).resolve().parent.parent / "demo"

app = Flask(__name__, static_folder=str(DEMO_DIR), static_url_path="")


# ============ CORS（开发期允许任意来源）============
@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp


# ============ Demo 静态站点 ============
@app.route("/")
def index():
    return send_from_directory(DEMO_DIR, "index.html")


# ============ 包装：统一错误响应 ============
def safe(fn, *args, **kwargs):
    try:
        return jsonify({"ok": True, "data": fn(*args, **kwargs)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


# ============ 公募基金 ============
@app.get("/api/fund/<code>")
def api_fund_realtime(code: str):
    return safe(fund_realtime, code)


@app.get("/api/fund/<code>/history")
def api_fund_history(code: str):
    return safe(fund_history, code)


# ============ A 股 / ETF ============
@app.get("/api/stock/<code>")
def api_stock_realtime(code: str):
    return safe(astock_realtime, code)


@app.get("/api/stock/<code>/history")
def api_stock_history(code: str):
    days = int(request.args.get("days", 250))
    return safe(astock_history, code, days)


# ============ 加密货币 ============
@app.get("/api/crypto")
def api_crypto_realtime():
    ids = request.args.get("ids", "bitcoin,ethereum,solana").split(",")
    return safe(crypto_realtime, ids)


@app.get("/api/crypto/<coin_id>/history")
def api_crypto_history(coin_id: str):
    days = int(request.args.get("days", 365))
    return safe(crypto_history, coin_id, days)


# ============ 黄金（上海黄金交易所现货）============
@app.get("/api/gold/<code>")
def api_gold_realtime(code: str):
    # code: AU9999 / AU9995 / AU100G
    return safe(gold_realtime, code.upper())


# ============ 港股（新浪 rt_hk）============
@app.get("/api/hk/<code>")
def api_hk_realtime(code: str):
    return safe(hk_realtime, code)


# ============ 美股（新浪 gb_）============
@app.get("/api/us/<ticker>")
def api_us_realtime(ticker: str):
    return safe(us_realtime, ticker)


# ============ 历史月度收益率（用于历史回测蒙特卡洛）============
@app.get("/api/stock/<code>/monthly-returns")
def api_monthly_returns(code: str):
    years = int(request.args.get("years", 10))
    return safe(market_monthly_returns, code, years)


if __name__ == "__main__":
    print()
    print("  FIRE Demo backend")
    print(f"  Demo:  http://localhost:8000/")
    print(f"  API:   http://localhost:8000/api/fund/005827")
    print()
    app.run(host="127.0.0.1", port=8000, debug=False)
