# Getting Started

**语言 / Language**: [中文](STARTUP.md) · English

Full steps to run **Wave Quant** locally. For architecture & features see 👉 [README.en.md](README.en.md).

> The app connects only to OKX Demo Trading (`flag = '1'`); live trading is hard-disabled in code.

---

## Prerequisites

- **Python** 3.10+
- **Node.js** 18+
- **MySQL** 8 (running locally)
- An **OKX Demo Trading API key** (create it under OKX → Demo Trading)
- A proxy (e.g. Clash) if your machine needs one to reach OKX (e.g. `http://127.0.0.1:7897`)

---

## Step 1 · Initialize the database

Run the init script as root (you'll be prompted for the root password):

```bash
mysql -u root -p < deploy/mysql/local_setup.sql
```

It creates the `okx_dashboard` database and the `okx` / `okx_pass` user. **You don't need to create tables** — the backend creates them on first start.

> Drop `-p` if root has no password.

Verify:

```bash
mysql -u okx -pokx_pass -e "SHOW DATABASES;"   # should list okx_dashboard
```

---

## Step 2 · Start the backend

```bash
cd backend

# Create and activate an isolated Python environment
python3 -m venv .venv
source .venv/bin/activate            # prompt shows (.venv); re-run in every new shell

# Install dependencies
pip install -r requirements.txt

# Create the config file
cp .env.example .env
```

Edit `backend/.env` with your own keys (**never commit this file**):

```ini
# OKX Demo Trading keys (required)
OKX_API_KEY=your-demo-key
OKX_API_SECRET=your-demo-secret
OKX_API_PASSPHRASE=your-demo-passphrase
OKX_FLAG=1                         # fixed to 1 (demo); live is disabled
HTTP_PROXY=http://127.0.0.1:7897   # set if a proxy is needed to reach OKX, else leave empty

# Database (local MySQL)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=okx
MYSQL_PASSWORD=okx_pass
MYSQL_DB=okx_dashboard

# Auth: set your own random string in production
SECRET_KEY=replace-with-your-own-random-secret

CACHE_BACKEND=memory               # built-in in-memory cache; no extra service needed
```

Start the backend (first start auto-creates all tables):

```bash
uvicorn app.main:app --reload --port 8910
```

Logs `OKX flag=1 = DEMO TRADING` and `Application startup complete` mean success.

> Must be run from `backend/` with the venv activated.

---

## Step 3 · Start the user dashboard (new terminal)

```bash
cd frontend
npm install        # first time only
npm run dev
```

Open 👉 **http://localhost:5910**

> **Login required.** On first start the backend seeds a super-admin **`admin` / `admin123456`** — it can do everything; member (viewer) accounts are **read-only**. Members are created by an admin in the admin console (Step 4).

---

## Step 4 · Start the admin console (member management, new terminal)

The admin console is a **separate frontend**, admin-only, for adding / editing / deleting members.

```bash
cd admin-frontend
npm install        # first time only
npm run dev        # port 5911
```

Open 👉 **http://localhost:5911** and log in with `admin` / `admin123456`.

> To change the default admin credentials, set `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` in `backend/.env`
> (only effective while the database has no users yet).

---

## Startup verification checklist

| Check | How | Expected |
| --- | --- | --- |
| Backend health | open http://localhost:8910/health | `{"status":"ok","mode":"demo"}` |
| OKX connectivity | open http://localhost:8910/api/account (needs a login token) | real demo equity/balance |
| Tables | `mysql -u okx -pokx_pass okx_dashboard -e "SHOW TABLES;"` | all tables listed |
| Frontend | http://localhost:5910 | dashboard shows account data |
| Live feed | top-right status in the dashboard | green "Live feed" dot, ticking numbers |

---

## Every subsequent start (once set up)

```bash
# Terminal 1 · backend
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8910

# Terminal 2 · user dashboard
cd frontend && npm run dev

# Terminal 3 · admin console (optional)
cd admin-frontend && npm run dev
```

Stop with `Ctrl + C` in each terminal.

---

## FAQ

| Symptom | Cause / fix |
| --- | --- |
| `command not found: uvicorn` | venv not activated — run `source .venv/bin/activate` again. |
| `Access denied for user 'okx'` | DB user not set up — re-run Step 1. |
| `Can't connect to MySQL (2003)` | MySQL not running — start the MySQL service. |
| `/docs` opens but `/api/account` errors | wrong OKX key, or OKX unreachable — set `HTTP_PROXY` in `.env`. |
| Top-right stuck on "Reconnecting" | backend not on 8910 — start it, then refresh. |
| Port in use (8910 / 5910 / 5911) | kill the process holding it, or start on another port. |
| Wipe all data and start over | `mysql -u root -p -e "DROP DATABASE okx_dashboard;"` then re-run Step 1. |

---

## Service URLs

| Service | URL |
| --- | --- |
| User dashboard | http://localhost:5910 |
| Admin console | http://localhost:5911 |
| Backend API | http://localhost:8910 |
| API docs (Swagger) | http://localhost:8910/docs |
| Health check | http://localhost:8910/health |

> Default admin: `admin` / `admin123456` (seeded on first start — change it for production).
