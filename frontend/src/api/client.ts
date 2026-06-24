import axios from "axios";
import type {
  Account,
  AccountConfig,
  AlgoOrder,
  BacktestResult,
  BacktestRun,
  BotRuntime,
  BotStatus,
  BotStopMode,
  Candle,
  ClosedPosition,
  EquityPoint,
  HaltState,
  HealthStatus,
  InstrumentRule,
  InstrumentStat,
  KillSwitchResult,
  LeverageInfo,
  LoginResponse,
  LogEntry,
  OperationAudit,
  Order,
  OrderBook,
  PnlSummary,
  Prefs,
  PublicTrades,
  Position,
  RiskConfig,
  RiskEvent,
  RiskStatus,
  StrategyConfig,
  StrategyVersion,
  Ticker,
  Trade,
  User,
  Watchlist,
} from "@/types";

const TOKEN_KEY = "okx_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

const http = axios.create({ baseURL: "/api", timeout: 20000 });

// Attach the bearer token to every request when present.
http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 (expired/invalid token) drop the token and bounce to the login page.
// Skipped for the login call itself so a bad-credentials error surfaces normally.
http.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? "";
    if (error?.response?.status === 401 && !url.includes("/auth/login")) {
      tokenStore.clear();
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (username: string, password: string) =>
    http.post<LoginResponse>("/auth/login", { username, password }).then((r) => r.data),
  me: () => http.get<User>("/auth/me").then((r) => r.data),

  getHealth: () => http.get<HealthStatus>("/health/status").then((r) => r.data),

  getAccount: () => http.get<Account>("/account").then((r) => r.data),
  getAccountConfig: () => http.get<AccountConfig>("/account/config").then((r) => r.data),
  setPositionMode: (pos_mode: string) =>
    http.post<AccountConfig>("/account/position-mode", { pos_mode }).then((r) => r.data),
  getLeverage: (inst_id: string, mgn_mode: string) =>
    http.get<LeverageInfo>("/account/leverage", { params: { inst_id, mgn_mode } }).then((r) => r.data),
  setLeverage: (body: { inst_id: string; lever: number; mgn_mode: string }) =>
    http.post<LeverageInfo>("/account/leverage", body).then((r) => r.data),
  getEquityHistory: (limit = 200) =>
    http.get<EquityPoint[]>("/account/equity-history", { params: { limit } }).then((r) => r.data),

  getPositions: () => http.get<Position[]>("/positions").then((r) => r.data),
  getPositionsHistory: (limit = 50) =>
    http.get<ClosedPosition[]>("/positions/history", { params: { limit } }).then((r) => r.data),
  closePosition: (inst_id: string, pos_side = "net", mgn_mode = "cross") =>
    http.post("/positions/close", { inst_id, pos_side, mgn_mode }).then((r) => r.data),

  getOrders: (params?: { open_only?: boolean; inst_id?: string }) =>
    http.get<Order[]>("/orders", { params }).then((r) => r.data),
  placeOrder: (body: {
    inst_id: string;
    side: "buy" | "sell";
    ord_type: "limit" | "market" | "post_only" | "ioc" | "fok";
    size: number;
    price?: number;
    td_mode?: string;
    reduce_only?: boolean;
    pos_side?: "long" | "short" | "net";
  }) => http.post<Order>("/order", body).then((r) => r.data),
  cancelOrder: (body: { inst_id: string; order_id?: string; client_order_id?: string }) =>
    http.post("/order/cancel", body).then((r) => r.data),
  cancelAll: (inst_id?: string) =>
    http.post("/order/cancel-all", null, { params: { inst_id } }).then((r) => r.data),

  getTrades: (inst_id?: string) =>
    http.get<Trade[]>("/trades", { params: { inst_id } }).then((r) => r.data),

  placeAlgo: (body: {
    inst_id: string;
    side: "buy" | "sell";
    size: number;
    td_mode?: string;
    reduce_only?: boolean;
    tp_trigger_px?: number;
    sl_trigger_px?: number;
  }) => http.post<AlgoOrder>("/order/algo", body).then((r) => r.data),
  placeTrigger: (body: {
    inst_id: string;
    side: "buy" | "sell";
    size: number;
    td_mode?: string;
    trigger_px: number;
    order_px?: number;
  }) => http.post<AlgoOrder>("/order/trigger", body).then((r) => r.data),
  getAlgos: (inst_id?: string) =>
    http.get<AlgoOrder[]>("/orders/algo", { params: { inst_id } }).then((r) => r.data),
  cancelAlgo: (body: { inst_id: string; algo_id: string }) =>
    http.post("/order/algo/cancel", body).then((r) => r.data),

  getTickers: () => http.get<Ticker[]>("/market/tickers").then((r) => r.data),
  getTicker: (inst_id: string) =>
    http.get<Ticker>("/market/ticker", { params: { inst_id } }).then((r) => r.data),
  getAllTickers: (inst_type = "SWAP") =>
    http.get<Ticker[]>("/market/all-tickers", { params: { inst_type } }).then((r) => r.data),
  getInstrumentRules: () =>
    http.get<InstrumentRule[]>("/market/instrument-rules").then((r) => r.data),
  getStats: (inst_id: string) =>
    http.get<InstrumentStat>("/market/stats", { params: { inst_id } }).then((r) => r.data),
  getOrderbook: (inst_id: string, depth = 20) =>
    http.get<OrderBook>("/orderbook", { params: { inst_id, depth } }).then((r) => r.data),
  getCandles: (inst_id: string, bar = "1H", limit = 200) =>
    http.get<Candle>("/market/candles", { params: { inst_id, bar, limit } }).then((r) => r.data),
  getPublicTrades: (inst_id: string, limit = 60) =>
    http.get<PublicTrades>("/market/trades", { params: { inst_id, limit } }).then((r) => r.data),

  getBot: () => http.get<BotStatus>("/bot").then((r) => r.data),
  getBotRuntime: () => http.get<BotRuntime>("/bot/runtime").then((r) => r.data),
  startBot: () => http.post<BotStatus>("/bot/start").then((r) => r.data),
  pauseBot: () => http.post<BotStatus>("/bot/pause").then((r) => r.data),
  resumeBot: () => http.post<BotStatus>("/bot/resume").then((r) => r.data),
  stopBot: (mode: BotStopMode = "cancel") =>
    http.post<BotStatus>("/bot/stop", { mode }).then((r) => r.data),
  restartBot: () => http.post<BotStatus>("/bot/restart").then((r) => r.data),
  applyStrategy: () => http.post<BotStatus>("/bot/apply-strategy").then((r) => r.data),
  emergencyStop: () => http.post<BotStatus>("/bot/emergency-stop").then((r) => r.data),
  emergencyClose: () => http.post<{ msg: string }>("/bot/emergency-close").then((r) => r.data),

  getStrategy: () => http.get<StrategyConfig>("/strategy").then((r) => r.data),
  updateStrategy: (body: Partial<StrategyConfig> & { note?: string }) =>
    http.put<StrategyConfig>("/strategy", body).then((r) => r.data),
  getStrategyVersions: () =>
    http.get<StrategyVersion[]>("/strategy/versions").then((r) => r.data),
  rollbackStrategy: (version: number) =>
    http.post<StrategyConfig>(`/strategy/rollback/${version}`).then((r) => r.data),

  // Strategy instances (CRUD over named configs) + one-click run.
  listStrategyInstances: () =>
    http.get<StrategyConfig[]>("/strategy/instances").then((r) => r.data),
  createStrategyInstance: (body: Partial<StrategyConfig> & { name: string; note?: string }) =>
    http.post<StrategyConfig>("/strategy/instances", body).then((r) => r.data),
  updateStrategyInstance: (name: string, body: Partial<StrategyConfig> & { note?: string }) =>
    http.put<StrategyConfig>(`/strategy/instances/${encodeURIComponent(name)}`, body).then((r) => r.data),
  deleteStrategyInstance: (name: string) =>
    http.delete(`/strategy/instances/${encodeURIComponent(name)}`).then((r) => r.data),
  runStrategyInstance: (name: string) =>
    http.post(`/strategy/instances/${encodeURIComponent(name)}/run`).then((r) => r.data),
  stopStrategyInstance: (name: string, mode: BotStopMode = "cancel") =>
    http.post(`/strategy/instances/${encodeURIComponent(name)}/stop`, { mode }).then((r) => r.data),

  getRisk: () => http.get<RiskStatus>("/risk").then((r) => r.data),
  updateRisk: (body: Partial<RiskConfig>) =>
    http.put<RiskConfig>("/risk", body).then((r) => r.data),
  getRiskEvents: (limit = 100, level?: string) =>
    http.get<RiskEvent[]>("/risk/events", { params: { limit, level: level || undefined } }).then((r) => r.data),
  clearRiskEvents: () => http.delete("/risk/events").then((r) => r.data),

  getHalt: () => http.get<HaltState>("/risk/halt").then((r) => r.data),
  killSwitch: (body: { cancel_orders: boolean; close_positions: boolean }) =>
    http.post<KillSwitchResult>("/risk/kill-switch", body).then((r) => r.data),
  resumeTrading: () => http.post<HaltState>("/risk/resume").then((r) => r.data),

  getAudits: (params?: { limit?: number; action?: string }) =>
    http.get<OperationAudit[]>("/audits", { params }).then((r) => r.data),

  getLogs: (params?: { level?: string; category?: string; search?: string; limit?: number }) =>
    http.get<LogEntry[]>("/logs", { params }).then((r) => r.data),

  runBacktest: (body: {
    inst_id: string;
    bar: string;
    limit: number;
    strategy: string;
    fast?: number;
    slow?: number;
    rsi_len?: number;
    rsi_low?: number;
    rsi_high?: number;
    boll_len?: number;
    boll_k?: number;
    donchian_len?: number;
    macd_fast?: number;
    macd_slow?: number;
    macd_signal?: number;
    initial_capital: number;
    fee_rate?: number;
    slippage_bp?: number;
  }, opts?: { save?: boolean }) =>
    http.post<BacktestResult>("/backtest", body, opts?.save === false ? { params: { save: false } } : undefined).then((r) => r.data),

  getPnlSummary: (days?: number) =>
    http.get<PnlSummary>("/pnl/summary", { params: { days } }).then((r) => r.data),

  // Per-user watchlist (自选) — stored server-side, follows the account.
  getWatchlist: () =>
    http.get<Watchlist>("/me/watchlist").then((r) => r.data),
  saveWatchlist: (body: Watchlist) =>
    http.put<Watchlist>("/me/watchlist", body).then((r) => r.data),

  // Per-user display preferences (设置) — stored server-side, follows the account.
  getPrefs: () =>
    http.get<Prefs>("/me/prefs").then((r) => r.data),
  savePrefs: (body: Partial<Prefs>) =>
    http.put<Prefs>("/me/prefs", body).then((r) => r.data),

  getBacktestHistory: (params?: { limit?: number; strategy?: string }) =>
    http.get<BacktestRun[]>("/backtest/history", { params }).then((r) => r.data),
  deleteBacktestRun: (id: number) =>
    http.delete(`/backtest/history/${id}`).then((r) => r.data),
  clearBacktestHistory: () => http.delete("/backtest/history").then((r) => r.data),
};

export default api;
