// OKX-style strategy categories for the 我的策略 list. Mirrors OKX's strategy-bot
// tabs: one category is always selected and the table columns adapt to it (each
// category exposes a different metric set). `types` lists the backend
// `strategy_type` values that map into the category — categories with no wired
// backend type still show as an (empty) tab, exactly like OKX lists every product.

export interface StratCategory {
  key: string;
  zh: string;
  en: string;
  types: string[]; // backend strategy_type values belonging to this category
  cols: string[]; // ordered column-registry keys (see COL in StrategyParams.tsx)
}

export const CATEGORIES: StratCategory[] = [
  {
    key: "spot_grid", zh: "现货网格", en: "Spot Grid", types: ["grid"],
    cols: ["name", "invested", "pnl", "rate", "gridPnl", "unmatched", "range", "gridCount", "arbDone", "startCond", "stopCond", "tpsl", "status", "action"],
  },
  {
    key: "futures_grid", zh: "合约网格", en: "Futures Grid", types: ["futures_grid"],
    // OKX 合约网格列顺序（参照 OKX 实盘）。
    cols: ["name", "invested", "pnl", "rate", "gridPnl", "unmatched", "range", "gridCount", "arbDone", "extraMargin", "liqPx", "startCond", "stopCond", "tpsl", "action"],
  },
  {
    key: "smart_arb", zh: "智能套利", en: "Smart Arbitrage",
    types: ["pairs", "funding_arb", "cash_carry", "triangular", "mean_rev"],
    cols: ["name", "coreInd", "invested", "pnl", "rate", "apr", "openSpread", "arbPnl", "stakePnl", "earnPnl", "fee", "borrowInt", "cumReturn", "status", "action"],
  },
  {
    key: "signal", zh: "信号策略", en: "Signal",
    types: ["ma_cross", "rsi", "bollinger", "macd", "boll_break", "donchian", "turtle", "momentum", "kdj", "ichimoku", "atr_trend", "market_maker"],
    // 信号类的 OKX 列均为运行指标（demo 无数据），改为展示真实配置，与编辑表单一致。
    cols: ["name", "coreInd", "inst", "status", "action"],
  },
  {
    key: "futures_martingale", zh: "合约马丁格尔", en: "Futures Martingale", types: ["futures_martingale"],
    cols: ["name", "coreInd", "invested", "pnl", "rate", "arbPnl", "floatPnl", "arbApr", "totalApr", "addedCount", "maxAddCount", "avgHoldCost", "doneCycles", "liqLev", "action"],
  },
  {
    key: "spot_martingale", zh: "现货马丁格尔", en: "Spot Martingale", types: ["martingale"],
    cols: ["name", "coreInd", "invested", "pnl", "rate", "arbPnl", "floatPnl", "arbApr", "totalApr", "addedCount", "maxAddCount", "avgHoldCost", "doneCycles", "startCond", "action"],
  },
  {
    key: "dca", zh: "定投策略", en: "DCA", types: ["dca"],
    cols: ["name", "coreInd", "pnl", "rate", "cumDca", "coinTarget", "dcaFreq", "nextBuy", "perAmount", "dcaAvg", "status", "action"],
  },
  {
    key: "coin_accum", zh: "屯币宝", en: "Coin Accumulation", types: ["coin_accum"],
    cols: ["name", "coreInd", "invested", "pnl", "rate", "coinTarget", "balanceMode", "balanceCount", "status", "action"],
  },
  {
    key: "arb_order", zh: "套利下单", en: "Arbitrage Order", types: ["arb_order"],
    cols: ["name", "coreInd", "totalFilled", "orderTotal", "avgPx", "orderPx", "colReduceOnly", "curSubOrder", "subOrderStatus", "dualLeg", "status", "action"],
  },
  {
    key: "buy_dip_tp", zh: "抄底止盈策略", en: "Buy-dip Take-profit", types: ["buy_dip_tp"],
    cols: ["name", "coreInd", "invested", "pnl", "rate", "arbPnl", "arbPnlApr", "autoReinvest", "coinAmt", "costPx", "floatPnl", "status", "action"],
  },
  {
    key: "iceberg", zh: "冰山策略", en: "Iceberg", types: ["iceberg"],
    cols: ["name", "coreInd", "orderTotal", "filledAmount", "startCond", "perOrderQty", "orderPref", "orderLimitPx", "orderCount", "status", "action"],
  },
  {
    key: "twap", zh: "时间加权策略", en: "TWAP", types: ["twap"],
    cols: ["name", "coreInd", "orderTotal", "avgFillPx", "filledAmount", "takerBetter", "takerLimitPx", "timeInterval", "perOrderQty", "status", "action"],
  },
];
