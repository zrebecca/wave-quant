// Classic, well-known trading-strategy reference (public concepts; own concise notes).
// `impl` is the backend strategy key — every strategy is wired to run on the demo
// bot. Arbitrage/neutral ones (pairs/funding/cash-carry/triangular) are
// demo-approximated by single-instrument mean reversion; TWAP maps to DCA.
export type Risk = 1 | 2 | 3; // 低 / 中 / 高
export type ImplType = string;

export interface Classic {
  name: string; en: string; type: string; regime: string; ind: string;
  dir: string; risk: Risk; brief: string; impl?: ImplType;
}

export const CLASSIC: Classic[] = [
  { name: "做市", en: "Market Making", type: "做市", regime: "高流动 / 震荡", ind: "双边报价 · 价差 · 库存", dir: "中性", risk: 2, brief: "同时挂买卖单赚买卖价差,控制库存与风险(本平台内置策略)。", impl: "market_maker" },
  { name: "均线交叉", en: "MA Crossover", type: "趋势跟踪", regime: "趋势", ind: "MA 快/慢(如 5/20)", dir: "双向", risk: 2, brief: "短均线上穿长均线(金叉)做多,下穿(死叉)做空或离场。", impl: "ma_cross" },
  { name: "RSI 超买超卖", en: "RSI Reversal", type: "均值回归", regime: "震荡", ind: "RSI(14) · 30/70", dir: "双向", risk: 2, brief: "RSI 跌破 30 超卖买入,升破 70 超买卖出,捕捉短期反转。", impl: "rsi" },
  { name: "布林带回归", en: "Bollinger Reversion", type: "均值回归", regime: "震荡", ind: "BOLL(20,2)", dir: "双向", risk: 2, brief: "触下轨买入、触上轨卖出,押注价格回归中轨。", impl: "bollinger" },
  { name: "现货网格", en: "Spot Grid", type: "网格震荡", regime: "震荡 / 区间", ind: "区间上下界 · 格数 · 单格间距", dir: "双向", risk: 2, brief: "在区间内等距挂买卖单,自动低买高卖,震荡行情里层层累积价差。", impl: "grid" },
  { name: "定投 DCA", en: "Dollar-Cost Averaging", type: "定投", regime: "长期 / 下跌", ind: "周期 · 每期金额", dir: "做多", risk: 1, brief: "定期定额买入,均摊成本、弱化择时,适合长期看多与熊转牛布局。", impl: "dca" },
  { name: "MACD 趋势", en: "MACD", type: "趋势跟踪", regime: "趋势", ind: "MACD(12,26,9)", dir: "双向", risk: 2, brief: "DIF 上穿 DEA 金叉做多,死叉离场/做空;柱状能量辅助确认。", impl: "macd" },
  { name: "布林带突破", en: "Bollinger Breakout", type: "突破", regime: "趋势启动", ind: "BOLL(20,2) · 带宽", dir: "双向", risk: 3, brief: "带宽收窄后放量突破上/下轨,顺势追多/追空。", impl: "boll_break" },
  { name: "唐奇安通道突破", en: "Donchian Breakout", type: "突破", regime: "趋势", ind: "Donchian(20 / 55)", dir: "双向", risk: 2, brief: "突破 N 日最高价做多、最低价做空,经典通道突破。", impl: "donchian" },
  { name: "海龟交易法则", en: "Turtle Trading", type: "趋势跟踪", regime: "趋势", ind: "唐奇安突破 + ATR 头寸 + 金字塔", dir: "双向", risk: 2, brief: "系统化趋势跟踪:突破入场、ATR 定头寸、加仓与止损纪律严明。", impl: "turtle" },
  { name: "动量策略", en: "Momentum", type: "动量", regime: "趋势", ind: "ROC / 收益率排序", dir: "做多 / 双向", risk: 2, brief: "买入近期强势、卖出弱势标的,'强者恒强'的截面/时序动量。", impl: "momentum" },
  { name: "均值回归", en: "Mean Reversion", type: "均值回归", regime: "震荡", ind: "Z-Score · 偏离均值", dir: "双向", risk: 2, brief: "价格大幅偏离均值后反向押注其回归,适合无趋势震荡。", impl: "mean_rev" },
  { name: "配对交易", en: "Pairs Trading", type: "统计套利", regime: "任意", ind: "协整价差 · Z-Score", dir: "中性", risk: 2, brief: "做多被低估、做空被高估的相关标的,赚价差收敛,市场中性。", impl: "pairs" },
  { name: "资金费率套利", en: "Funding-Rate Arbitrage", type: "套利", regime: "任意", ind: "永续 - 现货 · 资金费率", dir: "中性", risk: 1, brief: "持现货 + 反向永续对冲价格,持续收取正资金费率。", impl: "funding_arb" },
  { name: "期现套利", en: "Cash-and-Carry", type: "套利", regime: "任意", ind: "期货 - 现货 基差", dir: "中性", risk: 1, brief: "买现货卖期货,锁定正基差,到期价差收敛兑现收益。", impl: "cash_carry" },
  { name: "三角套利", en: "Triangular Arbitrage", type: "套利", regime: "任意", ind: "三币种汇率闭环", dir: "中性", risk: 1, brief: "利用三个交易对之间的汇率不一致,瞬时闭环套利。", impl: "triangular" },
  { name: "趋势 + ATR 止损", en: "Trend + ATR Stop", type: "趋势跟踪", regime: "趋势", ind: "趋势过滤 + ATR(14) 移动止损", dir: "双向", risk: 2, brief: "顺势持有,用 ATR 跟踪止损动态锁定利润、控制回撤。", impl: "atr_trend" },
  { name: "一目均衡表", en: "Ichimoku", type: "趋势跟踪", regime: "趋势", ind: "转换线/基准线/先行云", dir: "双向", risk: 2, brief: "价格在云上偏多、云下偏空,综合判断趋势与支撑阻力。", impl: "ichimoku" },
  { name: "KDJ 随机指标", en: "KDJ Stochastic", type: "反转", regime: "震荡", ind: "KDJ(9,3,3) · 20/80", dir: "双向", risk: 2, brief: "超卖区金叉买入、超买区死叉卖出,适合区间波段。", impl: "kdj" },
  { name: "TWAP / VWAP 执行", en: "TWAP / VWAP", type: "执行算法", regime: "任意", ind: "时间 / 成交量加权", dir: "中性", risk: 1, brief: "大单拆分按时间或成交量均匀执行,降低冲击成本与滑点。", impl: "twap" },
  { name: "马丁格尔", en: "Martingale", type: "加仓补仓", regime: "震荡(高危)", ind: "等比/加倍补仓 · 止损线", dir: "双向", risk: 3, brief: "亏损后加倍补仓摊低成本,顺利时回血快,单边极端行情风险极大。", impl: "martingale" },
];

export const TYPE_FILTERS = ["趋势跟踪", "均值回归", "网格震荡", "突破", "动量", "套利", "统计套利", "做市", "定投", "反转", "加仓补仓", "执行算法"];

// strategy_type key → display name, derived from the catalogue above.
export const STRATEGY_LABEL_ZH: Record<string, string> = Object.fromEntries(
  CLASSIC.filter((c) => c.impl).map((c) => [c.impl as string, c.name])
);
export const STRATEGY_LABEL_EN: Record<string, string> = Object.fromEntries(
  CLASSIC.filter((c) => c.impl).map((c) => [c.impl as string, c.en])
);
export const STRATEGY_BRIEF: Record<string, string> = Object.fromEntries(
  CLASSIC.filter((c) => c.impl).map((c) => [c.impl as string, c.brief])
);
