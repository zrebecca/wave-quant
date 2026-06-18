export interface EquityPoint {
  ts: number;
  total_equity: number;
  available_balance: number;
  unrealized_pnl: number;
}

export type Role = "admin" | "viewer";

export interface User {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface AccountDetail {
  ccy: string;
  eq: number;
  eq_usd: number;
  avail_bal: number;
  frozen_bal: number;
  upl: number;
}

export interface Account {
  total_equity: number;
  available_balance: number;
  unrealized_pnl: number;
  margin_ratio: number | null;
  currency: string;
  position_count: number;
  open_order_count: number;
  bot_state: string;
  details: AccountDetail[];
  source: string;
  ts: number | null;
}

export type HealthState = "up" | "down" | "stale" | "idle";

export interface HealthStatus {
  server_time: number;
  backend: HealthState;
  database: HealthState;
  market_ws: HealthState;
  market_ws_last_ts: number | null;
  private_ws: HealthState;
  bot: HealthState;
  bot_state: string;
  bot_last_heartbeat: number | null;
}

export interface Position {
  inst_id: string;
  pos_side: string;
  position: number;
  avg_px: number;
  mark_px: number;
  upl: number;
  upl_ratio: number | null;
  realized_pnl: number | null;
  margin: number | null;
  mgn_mode: string | null;
  lever: string | null;
  liq_px: number | null;
  c_time: number | null;
}

export interface ClosedPosition {
  inst_id: string;
  pos_side: string;
  close_type: string | null;
  open_avg_px: number;
  close_avg_px: number;
  realized_pnl: number | null;
  pnl_ratio: number | null;
  open_max_pos: number | null;
  close_total_pos: number | null;
  lever: string | null;
  mgn_mode: string | null;
  c_time: number | null;
  u_time: number | null;
}

export interface Order {
  id: number;
  order_id: string | null;
  client_order_id: string | null;
  inst_id: string;
  side: string;
  ord_type: string;
  price: number | null;
  size: number;
  filled_size: number;
  avg_price: number | null;
  state: string;
  source: string;
  ts: number | null;
  created_at: string;
}

export interface Trade {
  id: number;
  trade_id: string | null;
  order_id: string | null;
  inst_id: string;
  side: string;
  fill_px: number;
  fill_sz: number;
  fee: number | null;
  fee_ccy: string | null;
  fill_pnl: number | null;
  exec_type: string | null;
  source: string;
  ts: number | null;
  created_at: string;
}

export interface AlgoOrder {
  algo_id: string | null;
  algo_cl_ord_id: string | null;
  inst_id: string;
  side: string;
  ord_type: string;
  state: string | null;
  size: number | null;
  tp_trigger_px: number | null;
  tp_ord_px: number | null;
  sl_trigger_px: number | null;
  sl_ord_px: number | null;
  trigger_px: number | null;
  order_px: number | null;
  ts: number | null;
}

export interface AccountConfig {
  pos_mode: string; // "long_short_mode" (hedge) | "net_mode" (one-way)
}

export interface LeverageInfo {
  inst_id: string;
  mgn_mode: string;
  lever: number;
}

export interface Ticker {
  inst_id: string;
  last_px: number;
  bid_px: number | null;
  ask_px: number | null;
  spread: number | null;
  spread_pct: number | null;
  vol_24h: number | null;
  vol_ccy_24h?: number | null;
  open_24h?: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
  change_24h_pct?: number | null;
  ts: number | null;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  inst_id: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ts: number | null;
}

export interface PublicTrade {
  price: number;
  size: number;
  side: string;   // "buy" | "sell" (taker side)
  ts: number;
}

export interface PublicTrades {
  inst_id: string;
  trades: PublicTrade[];
}

export interface InstrumentRule {
  inst_id: string;
  inst_type: string;
  base_ccy: string | null;
  quote_ccy: string | null;
  settle_ccy: string | null;
  tick_sz: number | null;
  lot_sz: number | null;
  min_sz: number | null;
  ct_val: number | null;
  ct_mult: number | null;
  lever: string | null;
  state: string | null;
}

export interface InstrumentStat {
  inst_id: string;
  mark_px: number | null;
  index_px: number | null;
  funding_rate: number | null;
  next_funding_time: number | null;
  funding_time: number | null;
  open_interest: number | null;
  open_interest_ccy: number | null;
}

export interface StrategyConfig {
  id: number;
  name: string;
  inst_id: string;
  order_size: number;
  spread: number;
  refresh_interval: number;
  max_position: number;
  num_levels: number;
  is_active: boolean;
  strategy_type: string; // backend key, e.g. market_maker | ma_cross | grid | macd …
  ma_fast: number;
  ma_slow: number;
  ma_bar: string;
  rsi_len: number;
  rsi_low: number;
  rsi_high: number;
  boll_len: number;
  boll_k: number;
  grid_low: number;
  grid_high: number;
  grid_count: number;
  tp_pct: number;
  sl_pct: number;
  entry_taker: boolean;
  max_slice: number;
}

export interface PnlInstrument {
  inst_id: string;
  realized_pnl: number;
  fees: number;
  net_pnl: number;
  volume: number;
  trades: number;
  maker: number;
  taker: number;
  wins: number;
  closes: number;
  win_rate: number;
}

export interface PnlSummary {
  since_days: number | null;
  total_realized: number;
  total_fees: number;
  total_net: number;
  total_volume: number;
  total_trades: number;
  win_rate: number;
  profit_factor: number | null;
  instruments: PnlInstrument[];
}

export interface StrategyVersion {
  id: number;
  strategy_name: string;
  version: number;
  params: Record<string, number | string | boolean>;
  note: string | null;
  created_by: string;
  created_at: string;
}

export type BreachAction = "alert" | "pause" | "cancel" | "stop" | "stop_close";

export interface RiskConfig {
  id: number;
  name: string;
  max_position: number;
  max_order_notional: number;
  max_open_orders: number;
  max_daily_loss: number;
  max_net_long: number;
  max_net_short: number;
  max_gross_exposure: number;
  max_order_rate: number;
  max_cancel_rate: number;
  max_drawdown: number;
  max_market_delay_sec: number;
  max_consecutive_losses: number;
  on_breach_action: BreachAction;
  enabled: boolean;
}

export interface RiskStatus {
  config: RiskConfig;
  current_position_notional: number;
  open_order_count: number;
  daily_pnl: number;
  net_position: number;
  gross_exposure: number;
  breaches: string[];
  triggered: boolean;
  action: string;
  usage: Record<string, number>;
}

export interface HaltState {
  halted: boolean;
  reason: string | null;
  ts: number | null;
}

export interface KillSwitchResult {
  halted: boolean;
  bot_stopped: boolean;
  cancelled: number;
  closed: number;
  errors: string[];
}

export interface RiskEvent {
  id: number;
  rule: string;
  level: string;
  action: string;
  metric_value: number | null;
  threshold: number | null;
  inst_id: string | null;
  message: string;
  ts: number | null;
  created_at: string | null;
}

export interface OperationAudit {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  result: string;
  before: string | null;
  after: string | null;
  detail: string | null;
  trace_id: string | null;
  created_at: string | null;
}

export type BotState =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "PAUSED"
  | "STOPPING"
  | "ERROR"
  | "RISK_STOPPED";

export type BotStopMode = "keep" | "cancel" | "cancel_close";

export interface BotStatus {
  state: string;
  message: string | null;
  strategy_name: string;
  strategy_version: number | null;
  started_at: number | null;
  last_heartbeat: number | null;
  last_quote_ts: number | null;
  cycles: number;
}

export interface BotRuntime {
  state: string;
  strategy_name: string;
  strategy_version: number | null;
  inst_id: string | null;
  started_at: number | null;
  last_heartbeat: number | null;
  last_quote_ts: number | null;
  cycles: number;
  open_buy: number;
  open_sell: number;
  today_fills: number;
  maker_fills: number;
  maker_ratio: number | null;
  today_fee: number;
  net_position: number;
  gross_exposure: number;
  last_error: string | null;
}

export interface LogEntry {
  id: number;
  level: string;
  category: string;
  message: string;
  detail: string | null;
  created_at: string;
}

export interface Candle {
  inst_id: string;
  bar: string;
  candles: [number, number, number, number, number, number][];
}

export interface BacktestResult {
  inst_id: string;
  strategy: string;
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  trade_count: number;
  win_rate_pct: number;
  profit_factor: number;
  sharpe: number;
  total_fee: number;
  avg_holding_bars: number;
  max_consecutive_losses: number;
  final_equity: number;
  equity_curve: [number, number][];
  drawdown_curve: [number, number][];
  price_series: [number, number][];
}

export interface BacktestRun {
  id: number;
  created_at: string;
  inst_id: string;
  bar: string;
  strategy: string;
  limit_bars: number;
  params: Record<string, any>;
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  sharpe: number;
  trade_count: number;
  win_rate_pct: number;
  profit_factor: number;
  total_fee: number;
  final_equity: number;
}

export type WsEvent =
  | { type: "ticker"; payload: Ticker }
  | { type: "orderbook"; payload: OrderBook }
  | { type: "bot"; payload: Partial<BotStatus> }
  | { type: "log"; payload: LogEntry }
  | { type: "order"; payload: { inst_id: string; state: string } }
  | { type: "fill"; payload: { inst_id: string; side: string; fill_px: number; fill_sz: number } }
  | { type: "position"; payload: { count: number } }
  | { type: "account"; payload: { ts: number | null } }
  | { type: "notification"; payload: { title: string; kind: string; description?: string; key?: string | null; vars?: Record<string, string | number> } };
