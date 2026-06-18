<div align="center">

<img src="frontend/public/logo.png" width="92" alt="Wave Quant logo" />

# 观澜量化 · Wave Quant

**基于 OKX 模拟盘的全栈量化交易看板**
实时行情终端 · 策略机器人 · 执行层 · 风控引擎 · 回测 · 盈亏分析

**语言 / Language**：中文 · [English](README.en.md)

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Trading](https://img.shields.io/badge/Trading-Demo%20Only-orange)

</div>

一体化的「信号 → 下单 → 成交 → 持仓/盈亏 → 风控」闭环。

> ⚠️ **仅限模拟盘。** 全程只连接 OKX 模拟盘（`flag = '1'`）。实盘交易在代码层被**硬性禁用**（`backend/app/core/security.py::enforce_demo_flag`），无法通过配置开启。本项目用于学习与作品集展示，**不构成任何投资建议**。

启动步骤见 👉 **[STARTUP.md](STARTUP.md)**。

本项目在官方 [okx-sample-market-maker](https://github.com/okxapi/okx-sample-market-maker) 示例基础上演进而来，原始做市示例保留在 `okx_market_maker/` 作为库复用（原文档见 `docs/LEGACY_README.md`）。

---

## 界面展示

<!-- 把截图按下列文件名放进 docs/screenshots/ 即自动显示；录屏转 GIF 命名 demo.gif -->

<div align="center">

![演示](docs/screenshots/demo.gif)

</div>

| 首页看板 | 交易终端 |
| :---: | :---: |
| ![首页](docs/screenshots/dashboard.png) | ![交易终端](docs/screenshots/terminal.png) |
| **策略与盈亏** | **风控引擎** |
| ![策略](docs/screenshots/strategy.png) | ![风控](docs/screenshots/risk.png) |
| **回测** | **登录** |
| ![回测](docs/screenshots/backtest.png) | ![登录](docs/screenshots/login.png) |

---

## 功能一览

**实时交易终端**
- 盘口（OrderBook）、K 线、最新成交、下单面板，公共 WebSocket 实时推送
- 限价 / 市价 / 只挂单(post-only) / IOC / FOK，以及条件单、OCO、触发单
- 下单前按合约 tick/lot/min 自动取整

**策略机器人（单实例，后台线程）**
- **做市策略**：双边 post-only 报价 + 防抖（行情未动、挂单完好则不重挂）
- **16+ 方向性策略**：均线交叉 / RSI / 布林 / MACD / 唐奇安 / 海龟 / 网格 / 动量 / 均值回归 / DCA 等，回测与实盘共用同一套信号
- **事件驱动闭环**：私有 WS 推来成交即唤醒机器人重算，而非干等定时器

**执行层（多种下单方式）**
- 信号策略可选 **吃单/挂单进场**（挂单超时自动升级市价补足）
- **自动止盈止损**：开仓后按持仓均价挂 reduce-only 的 OCO 止盈止损，平仓即撤
- **TWAP 拆单**：大额再平衡按子单上限分多周期成交

**风控引擎**
- 下单前校验 + 运行时巡检：净持仓 / 敞口 / 单日亏损 / 回撤 / 下单·撤单频率 / 连续亏损
- 一键 Kill Switch（撤单 + 平仓）、分级触发动作（告警 / 暂停 / 撤单 / 停止）

**盈亏分析与回测**
- 从本地成交流聚合已实现盈亏 / 胜率 / 盈亏比 / 手续费 / 成交量（按品种）
- 基于 OKX K 线的多策略、多品种回测，历史记录持久化

**账号体系**
- 管理员 / 普通成员两种角色；所有写操作前后端双重鉴权
- **独立的后台管理控制台**（端口 5174）供管理员增删成员

**可靠性**
- 启动自动对账（拉取在场订单 / 成交，重启不从空白起）
- 私有 WebSocket 空闲保活 + 断线重连

---

## 技术栈

| 层 | 技术 | 职责 |
| --- | --- | --- |
| **用户看板** | React 18 · TypeScript · Vite · Ant Design 5 · ECharts | 交易终端 UI、图表、实时数据（端口 5173） |
| **后台管理** | React 18 · TypeScript · Vite · Ant Design 5 | 独立成员管理控制台，仅管理员可登录（端口 5174） |
| **后端** | Python 3.10+ · FastAPI · SQLAlchemy 2.0 · Pydantic v2 | REST + WebSocket 服务、业务逻辑、鉴权 |
| **行情/交易** | python-okx · websockets | 对接 OKX 模拟盘 REST 与公共 / 私有 WebSocket |
| **数据库** | MySQL 8 | 用户、订单、成交、配置、回测、日志等持久化 |

> 鉴权为纯标准库实现（PBKDF2 哈希 + HMAC-SHA256 自包含 token），未引入额外依赖。

---

## 整体架构

```
   ┌──────────────────────┐   ┌──────────────────────┐
   │   用户看板 (5173)     │   │   后台管理 (5174)     │
   │ React+TS+Antd+ECharts │   │  React+TS+Antd 成员管理│
   └───────────┬──────────┘   └───────────┬──────────┘
       REST /api │   WS /api/ws │ (行情/订单/成交/持仓/机器人/日志)
   ┌────────────▼──────────────▼─────────────────────┐
   │              后端 Backend (FastAPI)               │
   │   api  ──►  services  ──►  repositories  ──► models│
   │                                                   │
   │   常驻任务：                                       │
   │    • 公共行情 WS 协程     (market_ws)              │
   │    • 私有订单/持仓/账户 WS (private_ws → live_state)│
   │    • 策略 / 做市机器人线程 (bot_manager)           │
   │    • WebSocket 广播中心    (ws_manager)            │
   │    • 模拟盘安全锁          (core/security)         │
   └────────────┬──────────────────────┬───────────────┘
                │                       │ python-okx (flag=1)
        ┌───────▼──────┐      ┌─────────▼──────────┐
        │   MySQL      │      │  OKX 模拟盘         │
        │  (11 张表)   │      │ REST + 公共/私有 WSS │
        └──────────────┘      └────────────────────┘
```

**事件驱动闭环**：OKX 私有 WS 把订单 / 成交 / 持仓 / 账户实时推给 `private_ws`，写入数据库与内存快照（`live_state`），并在每笔成交时唤醒机器人立即重算；机器人据此调整报价 / 进场 / 止盈止损，再下单回到 OKX —— 形成闭环。REST 轮询作为 WS 不可用时的兜底。

---

## 目录结构

```
backend/            FastAPI 后端
  app/
    api/            路由（account/orders/positions/strategy/risk/backtest/pnl/…）
    services/       业务逻辑（bot_manager/strategies/order_service/risk_service/
                    private_ws/live_state/pnl_service/…）
    repositories/   数据库 CRUD
    models/         SQLAlchemy ORM（11 张表）
    schemas/        Pydantic 模型
    core/           配置、数据库、鉴权、模拟盘安全锁
  scripts/          幂等补列迁移脚本
frontend/           用户交易看板（端口 5173）
admin-frontend/     后台成员管理控制台（端口 5174）
okx_market_maker/   官方做市示例（作为库复用）
deploy/mysql/       数据库初始化 SQL
docs/               旧版文档与截图
```

---

## 安全说明

- **实盘禁用**：`OKX_FLAG` 只接受 `'1'`（模拟盘），传 `'0'` 启动即抛错。
- **密钥不入库**：OKX API Key / Secret / Passphrase 仅从 `backend/.env`（环境变量）读取，代码与仓库中不含任何真实密钥；`.env` 已被 `.gitignore` 忽略。
- **生产前务必修改**：`SECRET_KEY`（token 签名）、默认管理员密码、MySQL 密码等默认值仅供本地开发，正式使用请在 `.env` 中另设。

---

## 致谢

- 官方示例：[okxapi/okx-sample-market-maker](https://github.com/okxapi/okx-sample-market-maker)
