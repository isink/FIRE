# FIRE 财富自由计算器（中国版 ProjectionLab）

## 启动

```bash
cd data-check
python3 backend.py
```

然后浏览器打开 http://localhost:8000/

## 目录

- `demo/` — 前端（HTML/JS/CSS，浏览器渲染）
- `data-check/` — Flask 后端（行情代理 + 静态文件托管）

## 功能

- 蒙特卡洛 P10/P50/P90 模拟（5000 次）
- 历史回测（CSI 300 月度收益 block bootstrap）
- 多方案对比、Coast FIRE、逐年现金流表
- 资产：A股 / 公募基金 / 黄金 / 加密 / 港股 / 美股 / 个人养老金
- 房贷/债务建模（等额本息 + 等额本金）
- 事件时间线、SWR 提取策略、通胀调整
- 中国 A 股交易日历（holiday-cn）

## 注意

如果你开了 Clash/V2Ray 系统代理，浏览器可能拦截 localhost 请求导致后端显示离线。
解决：在 Clash bypass 中加入 `localhost, 127.0.0.1`，或临时关闭系统代理。
