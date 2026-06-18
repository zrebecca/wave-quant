# 启动指南

**语言 / Language**：中文 · [English](STARTUP.en.md)

本机运行 **观澜量化 Wave Quant** 的完整步骤。架构与功能见 👉 [README.md](README.md)。

> 全程仅连接 OKX 模拟盘（`flag = '1'`），实盘已被代码硬性禁用。

---

## 前置要求

- **Python** 3.10+
- **Node.js** 18+
- **MySQL** 8（已在本机运行）
- 一个 **OKX 模拟盘 API Key**（在 OKX → 模拟交易 中生成）
- 如本机访问 OKX 需要代理（如 Clash），准备好代理地址（如 `http://127.0.0.1:7897`）

---

## 第 1 步 · 初始化数据库

用 root 执行初始化脚本（回车后输入 root 密码）：

```bash
mysql -u root -p < deploy/mysql/local_setup.sql
```

脚本会创建 `okx_dashboard` 数据库和 `okx` / `okx_pass` 用户。**表无需手动建**，后端首次启动时自动创建。

> root 没有密码就去掉 `-p`。

验证：

```bash
mysql -u okx -pokx_pass -e "SHOW DATABASES;"   # 应能看到 okx_dashboard
```

---

## 第 2 步 · 启动后端

```bash
cd backend

# 建立并激活独立 Python 环境
python3 -m venv .venv
source .venv/bin/activate            # 提示符出现 (.venv) 即成功；每开新终端都要再执行一次

# 安装依赖
pip install -r requirements.txt

# 生成配置文件
cp .env.example .env
```

编辑 `backend/.env`，填写你自己的密钥（**切勿提交到仓库**）：

```ini
# OKX 模拟盘密钥（必填）
OKX_API_KEY=你的-demo-key
OKX_API_SECRET=你的-demo-secret
OKX_API_PASSPHRASE=你的-demo-passphrase
OKX_FLAG=1                         # 固定为 1（模拟盘），实盘已禁用
HTTP_PROXY=http://127.0.0.1:7897   # 需要代理访问 OKX 时填写，否则留空

# 数据库（本机 MySQL）
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=okx
MYSQL_PASSWORD=okx_pass
MYSQL_DB=okx_dashboard

# 鉴权：生产环境务必另设一个随机长字符串
SECRET_KEY=换成你自己的随机密钥

CACHE_BACKEND=memory               # 内置内存缓存，无需额外服务
```

启动后端（首次启动会自动创建全部数据表）：

```bash
uvicorn app.main:app --reload --port 8000
```

看到日志 `OKX flag=1 = DEMO TRADING` 和 `Application startup complete` 即成功。

> 必须在 `backend/` 目录下、且已激活 venv 后执行。

---

## 第 3 步 · 启动用户看板（新开一个终端）

```bash
cd frontend
npm install        # 仅首次需要
npm run dev
```

打开浏览器访问 👉 **http://localhost:5173**

> **需要登录。** 首次启动后端会自动创建超级管理员 **`admin` / `admin123456`**。用它登录可执行全部操作；
> 普通成员（viewer）登录后**只能浏览**。成员由管理员在后台管理系统中创建（见第 4 步）。

---

## 第 4 步 · 启动后台管理系统（成员管理，新开一个终端）

后台管理系统是**独立的一套前端**，仅供管理员登录，用于添加 / 编辑 / 删除成员。

```bash
cd admin-frontend
npm install        # 仅首次需要
npm run dev        # 端口 5174
```

打开浏览器访问 👉 **http://localhost:5174**，用 `admin` / `admin123456` 登录。

> 想换默认管理员账号密码，可在 `backend/.env` 设置 `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`
> （仅在数据库还没有任何用户时生效）。

---

## 启动成功的验证清单

| 检查项 | 方法 | 预期 |
| --- | --- | --- |
| 后端健康 | 访问 http://localhost:8000/health | `{"status":"ok","mode":"demo"}` |
| OKX 连通 | 访问 http://localhost:8000/api/account（需登录 token） | 返回真实模拟盘权益/余额 |
| 数据表 | `mysql -u okx -pokx_pass okx_dashboard -e "SHOW TABLES;"` | 列出全部表 |
| 前端页面 | http://localhost:5173 | 看板显示账户数据 |
| 实时行情 | 看板右上角状态 | 绿点「Live feed」，行情表数字跳动 |

---

## 以后每次启动（环境已装好后）

```bash
# 终端 1 · 后端
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 终端 2 · 用户看板
cd frontend && npm run dev

# 终端 3 · 后台管理系统（按需）
cd admin-frontend && npm run dev
```

停止：在对应终端按 `Ctrl + C`。

---

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| `command not found: uvicorn` | venv 没激活，重新执行 `source .venv/bin/activate`。 |
| `Access denied for user 'okx'` | 数据库用户没建好，重跑第 1 步。 |
| `Can't connect to MySQL (2003)` | MySQL 没启动，先启动 MySQL 服务。 |
| `/docs` 能开但 `/api/account` 报错 | OKX 密钥不对，或访问不到 OKX——在 `.env` 设置 `HTTP_PROXY`。 |
| 右上角一直「Reconnecting」 | 后端没在 8000 运行；先起后端再刷新前端。 |
| 端口被占用（8000 / 5173 / 5174） | 关掉占用进程，或换端口启动。 |
| 想清空所有数据重来 | `mysql -u root -p -e "DROP DATABASE okx_dashboard;"` 后重跑第 1 步。 |

---

## 各服务地址速查

| 服务 | 地址 |
| --- | --- |
| 用户看板 | http://localhost:5173 |
| 后台管理系统 | http://localhost:5174 |
| 后端 API | http://localhost:8000 |
| 接口文档（Swagger） | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/health |

> 默认管理员：`admin` / `admin123456`（首次启动自动创建，生产环境请务必修改）。
