// ─────────────────────────────────────────────────────────────────────────────
// 观澜量化 · 经典策略库 (Classic Strategy Library)
//
// Source of truth for the professional strategy catalogue shown on the Strategy
// page (经典策略 tab). Strategies are grouped into 8 product categories and carry
// a full, productised schema so the page can render filters, badges and a detail
// panel — and so the same records can later drive 回测 / 模拟盘 / 实盘 runners.
//
// Design principles (产品原则):
//   · 指标 ≠ 策略：每个策略都给出 入场 / 出场 / 止盈止损 / 仓位 / 风控。
//   · 默认不开放实盘 (enableLive=false)；先支持回测与模拟盘。
//   · 所有策略都有风险提示；高风险策略 (highRisk) 显著标记。
//   · `impl` 指向后端 strategy_type，已接入 demo bot 的策略可一键模拟运行。
// 内容为公开交易学概念的自有精炼注释，非投资建议。
// ─────────────────────────────────────────────────────────────────────────────

export type Risk = 1 | 2 | 3; // 低 / 中 / 高
export type Difficulty = 1 | 2 | 3; // 初级 / 中级 / 高级
export type Direction = "long" | "short" | "both" | "neutral"; // 做多 / 做空 / 双向 / 中性
/** template 模板 · backtest 可回测 · paper 可模拟盘 · dev 开发中 */
export type StratStatus = "template" | "backtest" | "paper" | "dev";

export interface CatDef {
  key: string;
  zh: string;
  en: string;
  desc: string;
}

// 8 大类。顺序即页面 Tabs 顺序。
export const LIB_CATEGORIES: CatDef[] = [
  { key: "trend", zh: "趋势跟踪类", en: "Trend Following", desc: "顺势而为，在明确趋势中持有，靠大行情盈利、靠纪律止损。" },
  { key: "meanrev", zh: "均值回归类", en: "Mean Reversion", desc: "价格偏离均值后押注回归，适合震荡区间，强趋势中需谨慎。" },
  { key: "breakout", zh: "突破与波动率类", en: "Breakout & Volatility", desc: "在波动率收敛后捕捉突破，抓趋势启动，假突破是主要敌人。" },
  { key: "grid", zh: "网格与定投类", en: "Grid & DCA", desc: "用机械化的分批买卖摊薄成本、收割震荡，纪律重于择时。" },
  { key: "arb", zh: "套利与对冲类", en: "Arbitrage & Hedging", desc: "市场中性，赚价差收敛或资金费率，对成本与执行要求高。" },
  { key: "orderflow", zh: "盘口与订单流类", en: "Order Book & Flow", desc: "解读盘口与成交流的微观结构，对延迟与数据质量极敏感。" },
  { key: "factor", zh: "量价与因子类", en: "Volume-Price & Factor", desc: "以量价关系和多因子打分驱动，量在价先，关注资金流向。" },
  { key: "execution", zh: "执行算法类", en: "Execution Algorithms", desc: "不判断方向，只负责把大单低冲击、低滑点地拆分执行。" },
];

export const CAT_LABEL_ZH: Record<string, string> = Object.fromEntries(LIB_CATEGORIES.map((c) => [c.key, c.zh]));
export const CAT_LABEL_EN: Record<string, string> = Object.fromEntries(LIB_CATEGORIES.map((c) => [c.key, c.en]));

export interface StratParam {
  key: string;
  label: string;
  default: number | string;
  unit?: string;
}

export interface Strategy {
  id: string;
  nameZh: string;
  nameEn: string;
  category: string; // CatDef.key
  marketCondition: string; // 适用行情
  notSuitable?: string; // 不适合行情
  coreIndicators: string[]; // 核心指标 / 参数
  direction: Direction;
  risk: Risk;
  difficulty: Difficulty;
  recommendedFor: string[]; // 推荐用途：观察 / 回测 / 模拟盘 / 实盘谨慎
  suitableMarkets: string[]; // 现货 / 永续合约 / 交割合约 …
  tags: string[];
  principle: string; // 一句话原理（列表「策略原理」列）
  status: StratStatus;
  enableBacktest: boolean;
  enablePaper: boolean;
  enableLive: boolean; // 当前阶段统一 false
  highRisk?: boolean; // 高风险，页面红色提示
  advanced?: boolean; // 高级策略（对延迟/手续费/滑点/盘口/API 敏感）
  impl?: string; // 后端 strategy_type；存在即可在 demo bot 上模拟运行
  // ── 详情字段（核心策略完整填写，其余尽量补全）──
  summary?: string; // 策略简介（详情页）
  entryRules?: string[]; // 入场逻辑
  exitRules?: string[]; // 出场逻辑
  tpSl?: string; // 止盈止损逻辑
  positionMgmt?: string; // 仓位管理建议
  riskNotes?: string; // 风险提示
  exampleSignal?: string; // 示例信号
  parameters?: StratParam[]; // 默认参数
}

// 公共「推荐用途 / 市场」常量，减少重复书写。
const OBS = "观察";
const BT = "回测";
const PAPER = "模拟盘";
const LIVE_CAREFUL = "实盘谨慎";
const SPOT = "现货";
const PERP = "永续合约";
const FUT = "交割合约";

export const STRATEGIES: Strategy[] = [
  // ════════════════════════ 1. 趋势跟踪类 (trend) ════════════════════════
  {
    id: "ma_crossover", nameZh: "MA 均线交叉", nameEn: "MA Crossover", category: "trend",
    marketCondition: "单边趋势", notSuitable: "无趋势的横盘震荡（频繁假信号）",
    coreIndicators: ["MA5", "MA20"], direction: "both", risk: 2, difficulty: 1,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "均线", "入门"],
    principle: "短期均线上穿长期均线做多，下穿做空或离场。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "ma_cross",
    summary: "最经典的趋势跟踪策略，用两条不同周期均线的交叉来判别趋势方向与转折，结构简单、可解释性强，常作为趋势体系的基线。",
    entryRules: ["MA5 上穿 MA20（金叉）→ 开多", "MA5 下穿 MA20（死叉）→ 开空或平多"],
    exitRules: ["反向交叉出现即离场", "触发 ATR / 固定比例止损"],
    tpSl: "可用反向交叉作为移动止盈；止损用 ATR(14) × 2 或固定 2% 亏损线。",
    positionMgmt: "单笔风险不超过账户权益的 1–2%，按止损距离反推仓位。",
    riskNotes: "震荡行情中金叉死叉频繁切换，易被反复止损（俗称‘锯齿’）。建议叠加 ADX 等趋势过滤。",
    exampleSignal: "MA5 上穿 MA20，且 ADX>20 → 开多 BTC-USDT。",
    parameters: [
      { key: "fastPeriod", label: "快线周期", default: 5 },
      { key: "slowPeriod", label: "慢线周期", default: 20 },
      { key: "stopAtr", label: "ATR 止损倍数", default: 2 },
    ],
  },
  {
    id: "ema_trend", nameZh: "EMA 多周期趋势", nameEn: "EMA Multi-Timeframe Trend", category: "trend",
    marketCondition: "中长线单边趋势", notSuitable: "高频震荡",
    coreIndicators: ["EMA20", "EMA60", "EMA120"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "EMA", "多周期"],
    principle: "多条 EMA 多头/空头排列确认趋势，回踩均线顺势进场。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用一组指数均线的排列关系过滤趋势方向，对价格更敏感、滞后更小；多头排列只做多、空头排列只做空，回踩不破时顺势加仓。",
    entryRules: ["EMA20>EMA60>EMA120（多头排列）且价格回踩 EMA20 不破 → 开多", "空头排列镜像做空"],
    exitRules: ["均线排列被破坏（缠绕）→ 离场", "价格有效跌破 EMA60"],
    tpSl: "跌破中期 EMA60 止损；用 EMA20 移动止盈。",
    positionMgmt: "趋势确认后可分批加仓，总风险敞口受单笔 2% 约束。",
    riskNotes: "均线缠绕期信号失真；周期参数对不同币种敏感，需分别充分验证。",
    parameters: [
      { key: "fast", label: "快 EMA", default: 20 },
      { key: "mid", label: "中 EMA", default: 60 },
      { key: "slow", label: "慢 EMA", default: 120 },
    ],
  },
  {
    id: "macd", nameZh: "MACD 趋势", nameEn: "MACD", category: "trend",
    marketCondition: "趋势行情", notSuitable: "极窄幅震荡",
    coreIndicators: ["MACD(12,26,9)", "DIF", "DEA", "柱状能量"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "动能", "经典"],
    principle: "DIF 上穿 DEA 金叉做多，死叉离场或做空，柱状能量辅助确认。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "macd",
    summary: "通过快慢 EMA 之差（DIF）与其信号线（DEA）的交叉、以及柱状能量的增减来刻画趋势的动能强弱，是趋势与动量的折中工具。",
    entryRules: ["DIF 上穿 DEA 且位于零轴上方 → 开多", "柱状由负转正放大确认"],
    exitRules: ["DIF 下穿 DEA → 离场/反手", "柱状能量持续衰减"],
    tpSl: "死叉离场即软止盈；硬止损用 ATR 或前低/前高。",
    positionMgmt: "零轴上方信号更可靠，零轴下方信号减半仓位。",
    riskNotes: "MACD 滞后明显，震荡市背离信号失效率高，不宜单独使用。",
    exampleSignal: "DIF 在零轴上方上穿 DEA，柱状放大 → 开多。",
    parameters: [
      { key: "fast", label: "快线", default: 12 },
      { key: "slow", label: "慢线", default: 26 },
      { key: "signal", label: "信号线", default: 9 },
    ],
  },
  {
    id: "donchian", nameZh: "唐奇安通道突破", nameEn: "Donchian Breakout", category: "trend",
    marketCondition: "趋势启动 / 中长线", notSuitable: "区间震荡",
    coreIndicators: ["Donchian(20)", "Donchian(55)"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP, FUT], tags: ["突破", "通道", "趋势"],
    principle: "突破 N 日最高价做多、最低价做空，经典通道突破。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "donchian",
    summary: "海龟体系的核心入场器：以过去 N 根 K 线的最高/最低价构成通道，价格创出新高/新低即视为趋势启动并顺势进场。",
    entryRules: ["收盘突破 20 日最高 → 开多", "收盘跌破 20 日最低 → 开空"],
    exitRules: ["反向 10 日通道被触及离场", "ATR 跟踪止损"],
    tpSl: "用较短周期（如 10 日）反向通道止盈/止损。",
    positionMgmt: "按 ATR 计算头寸（波动越大仓位越小）。",
    riskNotes: "通道突破在震荡市假突破频繁，需要趋势过滤或更长周期。",
    parameters: [
      { key: "entryN", label: "入场通道", default: 20 },
      { key: "exitN", label: "出场通道", default: 10 },
    ],
  },
  {
    id: "turtle", nameZh: "海龟交易法则", nameEn: "Turtle Trading", category: "trend",
    marketCondition: "强趋势", notSuitable: "长期无趋势",
    coreIndicators: ["唐奇安突破", "ATR(N) 头寸", "金字塔加仓"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP, FUT], tags: ["趋势", "系统化", "经典"],
    principle: "突破入场、ATR 定头寸、金字塔加仓与止损纪律严明的完整趋势系统。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "turtle",
    summary: "完整的机械化趋势跟踪系统：唐奇安突破入场，按 ATR(N) 把每笔风险标准化，盈利后金字塔加仓，破 2N 止损，纪律性是其灵魂。",
    entryRules: ["突破 20 日通道入场（System1）或 55 日（System2）", "每盈利 0.5N 加一个单位，最多 4 单位"],
    exitRules: ["反向 10 日通道离场", "价格回撤 2N 止损"],
    tpSl: "止损固定为 2N（N=ATR）；止盈交给反向通道。",
    positionMgmt: "1 单位 = 账户 1% 风险 / N；总持仓单位有上限，控制相关性敞口。",
    riskNotes: "回撤期可能很长、心理压力大；加仓放大了单边反转时的损失。",
    exampleSignal: "突破 20 日新高入场 1 单位，随后每涨 0.5N 加仓，跌破 2N 全平。",
    parameters: [
      { key: "entryN", label: "入场通道", default: 20 },
      { key: "exitN", label: "出场通道", default: 10 },
      { key: "atrN", label: "ATR 周期", default: 20 },
      { key: "riskPct", label: "单位风险%", default: 1 },
    ],
  },
  {
    id: "supertrend", nameZh: "SuperTrend", nameEn: "SuperTrend", category: "trend",
    marketCondition: "趋势行情", notSuitable: "频繁震荡",
    coreIndicators: ["ATR(10)", "倍数 3"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "ATR", "止损线"],
    principle: "基于 ATR 的趋势跟踪线，价格在线上做多、线下做空，自带移动止损。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用 ATR 构造一条随价格移动的趋势轨道，翻转即变色：价格上穿转多、下穿转空，天然就是一条移动止损线，直观易用。",
    entryRules: ["价格上穿 SuperTrend 线 → 开多", "下穿 → 开空"],
    exitRules: ["趋势线翻转即反手或离场"],
    tpSl: "趋势线本身即移动止损，无需额外止损。",
    positionMgmt: "可与更高周期 SuperTrend 共振过滤，仅同向交易。",
    riskNotes: "震荡市频繁翻转造成亏损；倍数过小信号过密、过大滞后。",
    parameters: [
      { key: "atr", label: "ATR 周期", default: 10 },
      { key: "mult", label: "倍数", default: 3 },
    ],
  },
  {
    id: "parabolic_sar", nameZh: "Parabolic SAR", nameEn: "Parabolic SAR", category: "trend",
    marketCondition: "持续趋势", notSuitable: "横盘",
    coreIndicators: ["SAR(0.02,0.2)"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "抛物线", "止损"],
    principle: "抛物线 SAR 点位翻转即趋势反转，常作加速移动止损。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "抛物线转向指标，随趋势延续加速逼近价格，触及即翻转。最适合作为趋势中的移动止损，单独择时偏弱。",
    entryRules: ["SAR 点位从价格上方翻到下方 → 开多", "反之开空"],
    exitRules: ["SAR 再次翻转离场"],
    tpSl: "SAR 点即移动止损位。",
    positionMgmt: "建议与趋势过滤器组合，仅在趋势方向交易。",
    riskNotes: "震荡市频繁翻转，假信号多；适合做止损而非独立信号。",
    parameters: [
      { key: "step", label: "加速因子", default: 0.02 },
      { key: "max", label: "最大加速", default: 0.2 },
    ],
  },
  {
    id: "ichimoku", nameZh: "一目均衡表", nameEn: "Ichimoku Cloud", category: "trend",
    marketCondition: "趋势行情", notSuitable: "无方向震荡",
    coreIndicators: ["转换线", "基准线", "先行云A/B", "迟行线"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "云图", "支撑阻力"],
    principle: "价格在云上偏多、云下偏空，综合判断趋势与支撑阻力。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "ichimoku",
    summary: "一套自成体系的趋势与支撑阻力系统：用五条线和‘云’一眼判断多空、强弱与关键位，信息密度高但需要练习解读。",
    entryRules: ["价格在云之上 + 转换线上穿基准线 → 开多", "迟行线在价格上方确认"],
    exitRules: ["价格跌回云内/云下 → 离场"],
    tpSl: "云的下沿/基准线作为止损参考。",
    positionMgmt: "云越厚支撑阻力越强，逆云交易减仓。",
    riskNotes: "参数固定（9/26/52）对加密 7×24 市场未必最优；震荡市云带失效。",
    parameters: [
      { key: "tenkan", label: "转换线", default: 9 },
      { key: "kijun", label: "基准线", default: 26 },
      { key: "senkou", label: "先行跨度", default: 52 },
    ],
  },
  {
    id: "atr_trend", nameZh: "趋势 + ATR 止损", nameEn: "Trend + ATR Stop", category: "trend",
    marketCondition: "趋势行情", notSuitable: "剧烈震荡",
    coreIndicators: ["趋势过滤", "ATR(14) 移动止损"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势", "ATR", "风控"],
    principle: "顺势持有，用 ATR 跟踪止损动态锁定利润、控制回撤。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "atr_trend",
    summary: "以任意趋势过滤器（如均线）定方向，再叠加 ATR 移动止损形成完整体系——核心价值在于用波动率自适应地保护利润。",
    entryRules: ["趋势过滤为多（如价格 > EMA60）且出现回踩企稳 → 开多"],
    exitRules: ["价格回撤超过 ATR×倍数 → 止损/止盈离场"],
    tpSl: "止损 = 最高价 − ATR×3（多头），随价格抬升上移（chandelier 吊灯止损）。",
    positionMgmt: "ATR 越大仓位越小，保持单笔风险恒定。",
    riskNotes: "ATR 滞后于突变行情；跳空/插针可能击穿止损。",
    exampleSignal: "价格站上 EMA60 后开多，止损挂在 最高价−3ATR 并随价上移。",
    parameters: [
      { key: "trendMa", label: "趋势均线", default: 60 },
      { key: "atr", label: "ATR 周期", default: 14 },
      { key: "atrMult", label: "ATR 倍数", default: 3 },
    ],
  },
  {
    id: "adx_filter", nameZh: "ADX 趋势强度过滤", nameEn: "ADX Trend Strength", category: "trend",
    marketCondition: "趋势识别", notSuitable: "单独择时（它是过滤器）",
    coreIndicators: ["ADX(14)", "+DI", "-DI"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["趋势强度", "过滤器", "DMI"],
    principle: "ADX 衡量趋势强度，>25 才允许趋势策略入场，过滤震荡。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "ADX 本身不指示方向，只度量趋势强弱。作为‘开关’叠加在趋势策略前，能显著减少震荡市的假信号。",
    entryRules: ["ADX>25 且 +DI 上穿 -DI → 趋势走强做多", "ADX>25 且 -DI 上穿 +DI → 做空"],
    exitRules: ["ADX 跌破 20 → 趋势转弱，离场观望"],
    tpSl: "交给被过滤的母策略；ADX 仅控制是否开仓。",
    positionMgmt: "ADX 越高趋势越强，可适度加大仓位。",
    riskNotes: "ADX 滞后，趋势末期才走高；不能预测拐点。",
    parameters: [
      { key: "period", label: "ADX 周期", default: 14 },
      { key: "th", label: "强趋势阈值", default: 25 },
    ],
  },

  // ════════════════════════ 2. 均值回归类 (meanrev) ════════════════════════
  {
    id: "rsi_reversal", nameZh: "RSI 超买超卖", nameEn: "RSI Reversal", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "强单边趋势（RSI 会钝化）",
    coreIndicators: ["RSI(14)", "30 / 70"], direction: "both", risk: 2, difficulty: 1,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "震荡", "入门"],
    principle: "RSI 跌破 30 超卖买入、升破 70 超买卖出，捕捉短期反转。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "rsi",
    summary: "RSI 不是看到 <30 就买这么简单。专业用法把它当作震荡市的反转触发器，并配合价格结构与严格止损，避免在强趋势里逆势硬抗。",
    entryRules: ["RSI(14) < 30 且价格未明显破位（守住前低/支撑）→ 开多", "RSI > 70 且上涨乏力 → 开空"],
    exitRules: ["RSI 回到 50 中枢，或价格触及布林中轨 → 离场"],
    tpSl: "止损用 ATR 或固定亏损比例；止盈在均值（中轨/50 线）。",
    positionMgmt: "单笔风险 ≤ 账户权益的固定比例（如 1%），逆势仓位宁小勿大。",
    riskNotes: "强趋势下 RSI 可长期超买/超卖（钝化），不能盲目逆势抄底摸顶。",
    exampleSignal: "RSI(14)=27 且价格仍在区间下沿支撑上方 → 开多，RSI 回到 50 离场。",
    parameters: [
      { key: "period", label: "RSI 周期", default: 14 },
      { key: "low", label: "超卖阈值", default: 30 },
      { key: "high", label: "超买阈值", default: 70 },
    ],
  },
  {
    id: "kdj", nameZh: "KDJ 反转", nameEn: "KDJ Stochastic", category: "meanrev",
    marketCondition: "区间波段", notSuitable: "强趋势",
    coreIndicators: ["KDJ(9,3,3)", "20 / 80"], direction: "both", risk: 2, difficulty: 1,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "随机指标", "波段"],
    principle: "超卖区金叉买入、超买区死叉卖出，适合区间波段。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "kdj",
    summary: "随机指标的本土化版本，J 值更敏感。低位金叉买、高位死叉卖，是区间波段的常用触发器，需配合趋势过滤。",
    entryRules: ["K、D 在 20 以下金叉 → 开多", "在 80 以上死叉 → 开空"],
    exitRules: ["反向交叉，或 J 值进入另一端极值"],
    tpSl: "止损用区间边界/ATR；止盈在对侧极值或中轨。",
    positionMgmt: "仅在震荡确认时交易；趋势中只做顺势一侧。",
    riskNotes: "J 值波动剧烈，趋势市频繁钝化与假交叉。",
    parameters: [
      { key: "n", label: "RSV 周期", default: 9 },
      { key: "k", label: "K 平滑", default: 3 },
      { key: "d", label: "D 平滑", default: 3 },
    ],
  },
  {
    id: "bollinger_reversion", nameZh: "布林带回归", nameEn: "Bollinger Reversion", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "趋势放量突破",
    coreIndicators: ["BOLL(20,2)", "中轨", "上下轨"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "布林带", "均值回归"],
    principle: "触下轨买入、触上轨卖出，押注价格回归中轨。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "bollinger",
    summary: "把布林带当作统计意义上的‘正常波动区间’，触及边界视为偏离过度、押注回归中轨。强趋势单边贴带时需切换为突破思路。",
    entryRules: ["价格触/破下轨且未放量破位 → 开多", "触/破上轨且滞涨 → 开空"],
    exitRules: ["价格回到中轨 → 离场"],
    tpSl: "止盈在中轨；止损在轨外 1×ATR 或带宽外侧。",
    positionMgmt: "带宽收窄（挤压）后不要做回归，警惕突破。",
    riskNotes: "趋势行情会持续单边贴带，逆势做回归极易被套。",
    exampleSignal: "价格下破下轨后收回轨内 → 开多，回到中轨止盈。",
    parameters: [
      { key: "period", label: "均线周期", default: 20 },
      { key: "k", label: "标准差倍数", default: 2 },
    ],
  },
  {
    id: "zscore", nameZh: "Z-Score 均值回归", nameEn: "Z-Score Mean Reversion", category: "meanrev",
    marketCondition: "平稳震荡 / 高相关标的", notSuitable: "趋势漂移",
    coreIndicators: ["滚动均值", "标准差", "Z-Score"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["统计", "均值回归", "标准分"],
    principle: "价格 Z 分数越界（如 ±2）后反向押注回归。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "mean_rev",
    summary: "把价格对滚动均值的偏离标准化为 Z 分数，越界即统计意义上的极端值并反向下注，是配对/价差类的基础构件。",
    entryRules: ["Z < −2 → 开多", "Z > +2 → 开空"],
    exitRules: ["Z 回到 0 附近 → 平仓"],
    tpSl: "Z 回 0 止盈；Z 继续扩大到阈值（如 ±3.5）止损。",
    positionMgmt: "越界越深可金字塔加仓，但设硬性 Z 止损上限。",
    riskNotes: "均值本身漂移时回归假设失效（趋势市致命）；需平稳性检验。",
    parameters: [
      { key: "window", label: "滚动窗口", default: 20 },
      { key: "entryZ", label: "入场 Z", default: 2 },
      { key: "stopZ", label: "止损 Z", default: 3.5 },
    ],
  },
  {
    id: "vwap_reversion", nameZh: "VWAP 均值回归", nameEn: "VWAP Reversion", category: "meanrev",
    marketCondition: "日内震荡", notSuitable: "趋势日",
    coreIndicators: ["VWAP", "标准差带"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["VWAP", "日内", "均值回归"],
    principle: "价格大幅偏离 VWAP 后回归，日内交易者的公允价值锚。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "VWAP 是机构眼中的日内公允价。价格远离 VWAP 标准差带时押注回归，常用于日内均值回归与执行参考。",
    entryRules: ["价格跌破 VWAP−2σ → 开多", "升破 VWAP+2σ → 开空"],
    exitRules: ["回到 VWAP → 平仓"],
    tpSl: "VWAP 止盈；σ 带外固定止损。",
    positionMgmt: "趋势日（价格持续单侧偏离）暂停回归。",
    riskNotes: "VWAP 每日重置，趋势日会持续偏离；需判断当日属性。",
    parameters: [
      { key: "band", label: "σ 倍数", default: 2 },
    ],
  },
  {
    id: "cci", nameZh: "CCI 回归", nameEn: "CCI Reversion", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "强趋势",
    coreIndicators: ["CCI(20)", "±100"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "CCI", "震荡"],
    principle: "CCI 越过 +100/−100 极值区后反向回归。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "CCI 衡量价格相对统计均值的偏离程度，越过 ±100 视为脱离常态。可做回归触发，也可做突破确认。",
    entryRules: ["CCI < −100 后回升穿越 −100 → 开多", "CCI > +100 后回落穿越 +100 → 开空"],
    exitRules: ["CCI 回到 0 轴附近"],
    tpSl: "0 轴止盈；极端值继续扩大止损。",
    positionMgmt: "震荡确认时使用，趋势市改作突破解读。",
    riskNotes: "无界指标，强趋势可长时间停留极值区。",
    parameters: [
      { key: "period", label: "CCI 周期", default: 20 },
      { key: "th", label: "极值阈值", default: 100 },
    ],
  },
  {
    id: "williams_r", nameZh: "Williams %R", nameEn: "Williams %R", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "强趋势",
    coreIndicators: ["%R(14)", "−20 / −80"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "超买超卖"],
    principle: "%R 进入 −80 以下超卖买、−20 以上超买卖。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "威廉指标衡量收盘价在近期高低区间中的位置，与随机指标同源、反应更快，用于震荡市的超买超卖反转。",
    entryRules: ["%R < −80（超卖）回升 → 开多", "%R > −20（超买）回落 → 开空"],
    exitRules: ["回到 −50 中枢"],
    tpSl: "中枢止盈；区间边界止损。",
    positionMgmt: "趋势中只取顺势一侧信号。",
    riskNotes: "极敏感、假信号多，须配合过滤。",
    parameters: [{ key: "period", label: "周期", default: 14 }],
  },
  {
    id: "bias", nameZh: "BIAS 偏离率回归", nameEn: "BIAS Reversion", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "趋势加速",
    coreIndicators: ["BIAS(6/12/24)"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["乖离率", "回归"],
    principle: "价格与均线乖离过大时回归，乖离率越界反向操作。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "乖离率度量价格偏离均线的百分比。偏离过大被视为短期透支，押注向均线回归，阈值需按币种波动率标定。",
    entryRules: ["负乖离超阈值（如 −8%）→ 开多", "正乖离超阈值 → 开空"],
    exitRules: ["乖离率回到 0 附近"],
    tpSl: "回均线止盈；乖离继续放大止损。",
    positionMgmt: "高波动币种阈值需放大。",
    riskNotes: "阈值因币而异，趋势加速期乖离可持续扩大。",
    parameters: [
      { key: "ma", label: "均线周期", default: 12 },
      { key: "th", label: "乖离阈值%", default: 8 },
    ],
  },
  {
    id: "stoch_rsi", nameZh: "Stochastic RSI", nameEn: "Stochastic RSI", category: "meanrev",
    marketCondition: "区间震荡", notSuitable: "强趋势",
    coreIndicators: ["StochRSI(14)", "0.2 / 0.8"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["反转", "复合指标"],
    principle: "对 RSI 再做随机化，更灵敏地捕捉超买超卖拐点。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "在 RSI 之上再套一层随机指标，灵敏度更高、信号更多更早，适合短线区间反转，但噪声也更大。",
    entryRules: ["StochRSI 在 0.2 下方金叉 → 开多", "在 0.8 上方死叉 → 开空"],
    exitRules: ["进入对侧极值或回到 0.5"],
    tpSl: "0.5 中枢止盈；区间边界止损。",
    positionMgmt: "信号密集，需限频与过滤。",
    riskNotes: "极敏感→噪声大，趋势市频繁钝化。",
    parameters: [
      { key: "rsi", label: "RSI 周期", default: 14 },
      { key: "stoch", label: "Stoch 周期", default: 14 },
    ],
  },

  // ════════════════════════ 3. 突破与波动率类 (breakout) ════════════════════════
  {
    id: "bollinger_breakout", nameZh: "布林带突破", nameEn: "Bollinger Breakout", category: "breakout",
    marketCondition: "趋势启动 / 放量突破", notSuitable: "纯区间震荡",
    coreIndicators: ["BOLL(20,2)", "带宽"], direction: "both", risk: 3, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["突破", "波动率", "高风险"],
    principle: "带宽收窄后放量突破上/下轨，顺势追多/追空。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "boll_break",
    summary: "与布林回归相反：当带宽极度收窄（波动率压缩）后价格放量突破边界，往往意味着趋势启动，顺势进场。假突破是最大风险。",
    entryRules: ["带宽处于近期低位 + 收盘放量突破上轨 → 开多", "突破下轨 → 开空"],
    exitRules: ["价格收回带内 → 假突破离场", "回到中轨"],
    tpSl: "止损放突破 K 线另一端/中轨；止盈用移动止损跟随。",
    positionMgmt: "确认放量再进，量能不足减仓或放弃。",
    riskNotes: "假突破频繁，逆势插针可瞬间击穿止损；高波动需小仓位。",
    exampleSignal: "带宽创 20 日新低后放量收盘破上轨 → 开多，跌回中轨止损。",
    parameters: [
      { key: "period", label: "均线周期", default: 20 },
      { key: "k", label: "标准差倍数", default: 2 },
      { key: "squeeze", label: "挤压判定百分位", default: 20, unit: "%" },
    ],
  },
  {
    id: "boll_squeeze", nameZh: "布林带挤压突破", nameEn: "Bollinger Squeeze", category: "breakout",
    marketCondition: "波动率压缩后扩张", notSuitable: "持续高波动",
    coreIndicators: ["BOLL", "Keltner", "带宽收敛"], direction: "both", risk: 3, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["挤压", "波动率", "突破"],
    principle: "布林带收进肯特纳通道内（挤压）后向外扩张，捕捉爆发。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "经典‘TTM Squeeze’思路：当布林带被压进肯特纳通道，意味着波动率极度压缩、能量积聚，一旦释放往往是大行情的起点。",
    entryRules: ["挤压解除（布林带突破肯特纳）+ 动能指标定向 → 顺势进场"],
    exitRules: ["动能衰减或价格回到挤压区"],
    tpSl: "止损放挤压区另一端；移动止损跟随扩张。",
    positionMgmt: "等待挤压解除信号，不预测方向。",
    riskNotes: "方向需额外动能指标判定，单看挤压不知向上还是向下。",
    parameters: [
      { key: "bollK", label: "布林倍数", default: 2 },
      { key: "kcMult", label: "肯特纳倍数", default: 1.5 },
    ],
  },
  {
    id: "keltner", nameZh: "肯特纳通道", nameEn: "Keltner Channel", category: "breakout",
    marketCondition: "趋势 / 突破", notSuitable: "无序震荡",
    coreIndicators: ["EMA20", "ATR 通道"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["通道", "ATR", "趋势"],
    principle: "以 EMA 为中线、ATR 为带宽的通道，突破上下轨顺势。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用 ATR 而非标准差构造通道，更平滑、对极端值不敏感。价格突破上/下轨视为趋势确认，也可做趋势中的回踩参考。",
    entryRules: ["收盘突破上轨 → 开多", "突破下轨 → 开空"],
    exitRules: ["回到中线 EMA"],
    tpSl: "中线止损；移动止损止盈。",
    positionMgmt: "与布林带配合判断挤压。",
    riskNotes: "震荡市边界突破常假；需趋势确认。",
    parameters: [
      { key: "ema", label: "EMA 周期", default: 20 },
      { key: "atrMult", label: "ATR 倍数", default: 2 },
    ],
  },
  {
    id: "dual_thrust", nameZh: "Dual Thrust", nameEn: "Dual Thrust", category: "breakout",
    marketCondition: "日内趋势", notSuitable: "极端缩量",
    coreIndicators: ["开盘价", "Range(HH−LC,HC−LL)", "K1/K2"], direction: "both", risk: 3, difficulty: 3,
    recommendedFor: [BT, PAPER], suitableMarkets: [PERP, FUT], tags: ["日内", "区间突破", "经典"],
    principle: "以开盘价±区间×系数设上下轨，突破即顺势开仓。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "经典日内区间突破系统：用前 N 日真实波幅构造区间，今日开盘价加减区间得到触发线，突破上轨做多、下轨做空。",
    entryRules: ["价格突破 开盘价 + K1×Range → 开多", "跌破 开盘价 − K2×Range → 开空"],
    exitRules: ["反向触发线 → 反手", "日内收盘平仓"],
    tpSl: "反向轨止损；日内不留隔夜。",
    positionMgmt: "K1/K2 不对称可偏多/偏空；单合约日内限仓。",
    riskNotes: "参数敏感、易过拟合；缩量日假突破多。",
    parameters: [
      { key: "n", label: "区间回看", default: 1 },
      { key: "k1", label: "上轨系数", default: 0.5 },
      { key: "k2", label: "下轨系数", default: 0.5 },
    ],
  },
  {
    id: "r_breaker", nameZh: "R-Breaker", nameEn: "R-Breaker", category: "breakout",
    marketCondition: "日内趋势 + 反转", notSuitable: "无波动",
    coreIndicators: ["枢轴点", "突破/反转/观察价位"], direction: "both", risk: 3, difficulty: 3,
    recommendedFor: [BT, PAPER], suitableMarkets: [PERP, FUT], tags: ["日内", "枢轴", "经典"],
    principle: "基于枢轴点的多档支撑阻力，兼具突破与反转两套触发。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用前一日高低收计算枢轴，衍生出突破买卖价与反转买卖价两套价位，趋势走强追突破、走弱做反转，是成熟的日内系统。",
    entryRules: ["突破观察阻力 → 趋势做多", "高位回落跌破反转价 → 反转做空"],
    exitRules: ["反向价位触发", "收盘平仓"],
    tpSl: "枢轴各档位互为止损止盈。",
    positionMgmt: "日内限仓、不留隔夜。",
    riskNotes: "价位计算与参数复杂，过拟合风险高。",
    parameters: [
      { key: "setupK", label: "观察系数", default: 0.35 },
      { key: "breakK", label: "突破系数", default: 0.25 },
    ],
  },
  {
    id: "atr_breakout", nameZh: "ATR 波动率突破", nameEn: "ATR Volatility Breakout", category: "breakout",
    marketCondition: "波动放大", notSuitable: "缩量横盘",
    coreIndicators: ["ATR(14)", "突破倍数"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["波动率", "突破"],
    principle: "价格在均值基础上偏离 N×ATR 即视为有效突破，顺势进场。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用 ATR 把‘突破多远才算数’标准化：只有超过 N 倍 ATR 的位移才视为有效突破，能自适应不同币种与时段的波动。",
    entryRules: ["价格 > 参考价 + N×ATR → 开多", "< 参考价 − N×ATR → 开空"],
    exitRules: ["反向 ATR 偏移 / 移动止损"],
    tpSl: "止损 N×ATR；移动止损跟随。",
    positionMgmt: "ATR 标准化头寸，波动越大仓位越小。",
    riskNotes: "突变跳空可放大滑点；参数 N 需充分验证。",
    parameters: [
      { key: "atr", label: "ATR 周期", default: 14 },
      { key: "mult", label: "突破倍数", default: 1.5 },
    ],
  },
  {
    id: "range_breakout", nameZh: "区间突破", nameEn: "Range Breakout", category: "breakout",
    marketCondition: "盘整后突破", notSuitable: "无清晰区间",
    coreIndicators: ["近 N 根高低点", "成交量"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["区间", "突破", "量能"],
    principle: "识别盘整箱体，放量突破箱体上/下沿顺势。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "最朴素的突破：先识别一段横盘箱体，价格带量突破箱体边界即顺势进场，回踩不破可加仓。",
    entryRules: ["放量突破箱体上沿 → 开多", "跌破下沿 → 开空"],
    exitRules: ["假突破收回箱内 → 离场"],
    tpSl: "止损箱体内侧；目标=箱体高度投影。",
    positionMgmt: "量能不足不追，等回踩确认。",
    riskNotes: "假突破与诱多诱空常见；需量价配合。",
    parameters: [
      { key: "lookback", label: "箱体回看", default: 20 },
      { key: "volMult", label: "放量倍数", default: 1.5 },
    ],
  },
  {
    id: "donchian_breakout", nameZh: "唐奇安突破（短周期）", nameEn: "Donchian Breakout (Short)", category: "breakout",
    marketCondition: "短线趋势启动", notSuitable: "震荡",
    coreIndicators: ["Donchian(10/20)"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["通道", "突破", "短线"],
    principle: "短周期唐奇安通道突破，快速捕捉短线趋势启动。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "唐奇安通道的短周期版本，反应更快、信号更多，定位短线突破。与趋势类的长周期唐奇安互补。",
    entryRules: ["突破 10/20 日通道边界顺势进场"],
    exitRules: ["反向短通道离场"],
    tpSl: "反向通道/ATR 止损。",
    positionMgmt: "短周期信号多，需限频。",
    riskNotes: "周期越短假突破越多。",
    parameters: [
      { key: "entryN", label: "入场通道", default: 10 },
      { key: "exitN", label: "出场通道", default: 5 },
    ],
  },

  // ════════════════════════ 4. 网格与定投类 (grid) ════════════════════════
  {
    id: "spot_grid", nameZh: "现货网格", nameEn: "Spot Grid", category: "grid",
    marketCondition: "区间震荡", notSuitable: "单边大跌（被动接货）",
    coreIndicators: ["区间上下界", "格数", "单格间距"], direction: "both", risk: 2, difficulty: 1,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT], tags: ["网格", "震荡", "现货"],
    principle: "区间内等距挂买卖单，自动低买高卖，震荡里层层累积价差。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "grid",
    summary: "把价格区间切成若干格，每格挂买单、上一格挂卖单，价格上下波动就自动低买高卖，赚取无数小价差。震荡市的利器。",
    entryRules: ["价格落入网格区间即按格挂单，触发买单则在上一格挂卖单"],
    exitRules: ["价格跌破区间下界（或上破上界）→ 停止并按设置处理"],
    tpSl: "可设区间外止损；上破止盈可选‘卖出全部’。",
    positionMgmt: "预留底仓应对单边；总投入 = 每格金额 × 格数。",
    riskNotes: "单边下跌会把网格买满变成深套；务必设区间下方止损或只用闲钱。",
    exampleSignal: "BTC 在 58k–66k 设 40 格，价格回落触发第 12 格买单 → 在第 13 格挂卖。",
    parameters: [
      { key: "lower", label: "区间下界", default: 0 },
      { key: "upper", label: "区间上界", default: 0 },
      { key: "grids", label: "网格数", default: 40 },
      { key: "perGrid", label: "每格金额", default: 50, unit: "USDT" },
    ],
  },
  {
    id: "futures_grid", nameZh: "合约网格", nameEn: "Futures Grid", category: "grid",
    marketCondition: "合约区间震荡", notSuitable: "单边行情 + 高杠杆（爆仓风险）",
    coreIndicators: ["区间", "格数", "杠杆", "方向"], direction: "both", risk: 3, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [PERP], tags: ["网格", "合约", "杠杆"],
    principle: "在永续合约上做网格，可做多/做空/中性，带杠杆放大收益与风险。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "futures_grid",
    summary: "现货网格的合约版，支持做多/做空/中性三种方向并可加杠杆。收益放大的同时，单边行情下有强平风险，需关注预估强平价。",
    entryRules: ["按方向在区间内布网，多头网格价格回落加仓、反弹减仓"],
    exitRules: ["触及区间边界或强平价附近 → 止损/停止"],
    tpSl: "设区间外止损价；应远离强平价区。",
    positionMgmt: "杠杆越高格数与每格越小，留足保证金。",
    riskNotes: "杠杆 + 单边 = 强平风险；务必监控强平价与保证金率。",
    parameters: [
      { key: "lower", label: "区间下界", default: 0 },
      { key: "upper", label: "区间上界", default: 0 },
      { key: "grids", label: "网格数", default: 30 },
      { key: "leverage", label: "杠杆", default: 2, unit: "x" },
    ],
  },
  {
    id: "infinite_grid", nameZh: "无限网格", nameEn: "Infinite Grid", category: "grid",
    marketCondition: "长期上涨 / 高波动", notSuitable: "持续下跌",
    coreIndicators: ["单格涨幅%", "每格金额"], direction: "long", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT], tags: ["网格", "无上界", "屯币"],
    principle: "无上界网格，按百分比间距上涨卖一份、下跌买一份，长期持币增值。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "不设上界的等比网格：每涨一定百分比卖出固定金额、每跌买回，长期上涨中既能屯币又能吃波动，适合看好的主流币。",
    entryRules: ["价格每下跌一个百分比间距 → 买入固定金额"],
    exitRules: ["价格每上涨一个间距 → 卖出等额，保留底仓"],
    tpSl: "通常无止盈（长期持有）；可设最低买入价。",
    positionMgmt: "保持币本位持仓随上涨自然增加。",
    riskNotes: "持续下跌会不断接货占用资金；本质偏多。",
    parameters: [
      { key: "stepPct", label: "单格涨幅%", default: 1.5 },
      { key: "perGrid", label: "每格金额", default: 50, unit: "USDT" },
    ],
  },
  {
    id: "dynamic_grid", nameZh: "动态网格", nameEn: "Dynamic Grid", category: "grid",
    marketCondition: "趋势性震荡", notSuitable: "无规律暴涨暴跌",
    coreIndicators: ["ATR 自适应间距", "区间随价移动"], direction: "neutral", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["网格", "自适应", "ATR"],
    principle: "区间与格距随波动率/价格移动自适应，避免固定网格被趋势甩开。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "在普通网格上加入自适应：用 ATR 调整格距、让区间随价格中枢平移，缓解固定网格在趋势中被‘单边甩出’的痛点。",
    entryRules: ["按当前波动率动态布网，中枢移动时整体平移网格"],
    exitRules: ["触发外层保护止损"],
    tpSl: "外层硬止损 + 波动率收敛时降频。",
    positionMgmt: "波动放大时拉宽格距、降低密度。",
    riskNotes: "自适应规则复杂、参数多，过拟合风险高。",
    parameters: [
      { key: "atr", label: "ATR 周期", default: 14 },
      { key: "gridK", label: "格距 ATR 倍数", default: 0.5 },
    ],
  },
  {
    id: "smart_grid", nameZh: "智能网格", nameEn: "Smart Grid", category: "grid",
    marketCondition: "震荡（AI 选参）", notSuitable: "极端单边",
    coreIndicators: ["历史波动率", "区间推荐", "AI 参数"], direction: "neutral", risk: 2, difficulty: 2,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["网格", "智能", "推荐参数"],
    principle: "由历史行情自动推荐网格区间与格数，降低手动调参门槛。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "在网格之上做参数推荐：基于历史波动率与区间统计自动给出建议的上下界、格数与每格金额，本质仍是网格，重在‘选参’。",
    entryRules: ["采用推荐参数后按标准网格布单"],
    exitRules: ["同标准网格"],
    tpSl: "沿用推荐的止损区间。",
    positionMgmt: "推荐仅供参考，需人工复核。",
    riskNotes: "‘智能’依赖历史，未来行情切换时推荐可能失效。",
    parameters: [
      { key: "lookbackD", label: "回看天数", default: 30 },
      { key: "gridSuggest", label: "推荐格数", default: 40 },
    ],
  },
  {
    id: "dca", nameZh: "DCA 定投", nameEn: "Dollar-Cost Averaging", category: "grid",
    marketCondition: "长期看多 / 下跌布局", notSuitable: "短期投机",
    coreIndicators: ["周期", "每期金额"], direction: "long", risk: 1, difficulty: 1,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT], tags: ["定投", "长期", "低风险"],
    principle: "定期定额买入，均摊成本、弱化择时，适合长期看多。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "dca",
    summary: "最朴素也最稳健的入场方式：固定周期投入固定金额，自动在低位买更多份额，平滑成本、消除择时焦虑，适合长期主义者。",
    entryRules: ["每到周期（如每周）以固定金额买入标的"],
    exitRules: ["达成长期目标或基本面恶化时分批退出"],
    tpSl: "通常不设短期止损；可设目标收益分批止盈。",
    positionMgmt: "金额恒定，自然在低价多买、高价少买。",
    riskNotes: "标的长期归零则定投也亏损；选标的比择时更重要。",
    exampleSignal: "每周一定投 100 USDT 买 BTC，持续 52 周。",
    parameters: [
      { key: "period", label: "周期(天)", default: 7 },
      { key: "amount", label: "每期金额", default: 100, unit: "USDT" },
    ],
  },
  {
    id: "smart_dca", nameZh: "智能定投", nameEn: "Smart DCA", category: "grid",
    marketCondition: "长期看多 + 估值波动", notSuitable: "短炒",
    coreIndicators: ["估值偏离", "动态金额"], direction: "long", risk: 1, difficulty: 2,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT], tags: ["定投", "智能", "低吸"],
    principle: "在普通定投上按低估程度加码、高估时减码，提升资金效率。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "给定投装上‘估值油门’：价格相对均线/低估时加大买入、高估时减少甚至暂停，比固定金额定投更主动地摊低成本。",
    entryRules: ["价格低于参考均线越多 → 本期买入金额越大"],
    exitRules: ["高估区减少买入或分批止盈"],
    tpSl: "目标收益分批止盈；无硬止损。",
    positionMgmt: "设单期金额上限，避免顶部反向被套。",
    riskNotes: "加码规则若过激，单边下跌中消耗资金更快。",
    parameters: [
      { key: "baseAmt", label: "基准金额", default: 100, unit: "USDT" },
      { key: "maxMult", label: "最大加码倍数", default: 3 },
    ],
  },
  {
    id: "martingale", nameZh: "马丁格尔", nameEn: "Martingale", category: "grid",
    marketCondition: "震荡回归（高危）", notSuitable: "单边趋势（致命）",
    coreIndicators: ["等比/加倍补仓", "止损线", "补仓间距"], direction: "both", risk: 3, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT, PERP], tags: ["高风险", "补仓", "马丁"],
    principle: "亏损后加倍补仓摊低成本，顺利时回血快，单边极端行情风险极大。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, highRisk: true, impl: "martingale",
    summary: "⚠️ 高风险策略。每次亏损后按倍数加仓拉低均价，只要价格小幅反弹即可整体获利回血；但遇到极端单边行情，仓位呈几何级膨胀，可能造成大额甚至毁灭性亏损。",
    entryRules: ["初始建仓后，价格每下跌一个间距 → 按倍数加仓"],
    exitRules: ["整体均价回到目标盈利 → 一次性平仓获利"],
    tpSl: "必须设硬性最大补仓次数与总止损线，绝不无限加仓。",
    positionMgmt: "倍数与层数共同决定最坏敞口，需按最坏情况反推最大投入。",
    riskNotes: "⚠️ 极端单边行情下补仓呈指数膨胀，可能击穿本金或爆仓。不要把它当作低风险‘稳赚’策略，务必设最大补仓层数与总止损。",
    exampleSignal: "首仓 100，价格每跌 2% 加仓且金额翻倍，最多 6 层，触及总止损强制平仓。",
    parameters: [
      { key: "baseAmt", label: "首仓金额", default: 100, unit: "USDT" },
      { key: "stepPct", label: "补仓间距%", default: 2 },
      { key: "multiplier", label: "加仓倍数", default: 2 },
      { key: "maxLayers", label: "最大层数", default: 6 },
      { key: "totalStop", label: "总止损%", default: 30 },
    ],
  },

  // ════════════════════════ 5. 套利与对冲类 (arb) ════════════════════════
  {
    id: "funding_arb", nameZh: "资金费率套利", nameEn: "Funding-Rate Arbitrage", category: "arb",
    marketCondition: "任意（正资金费率）", notSuitable: "资金费率持续为负",
    coreIndicators: ["永续 − 现货", "资金费率"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["套利", "中性", "资金费率"],
    principle: "持现货 + 反向永续对冲价格，持续收取正资金费率。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "funding_arb",
    summary: "市场中性套利：买入现货同时开等量永续空单对冲价格风险，净敞口≈0，靠每 8 小时的正资金费率稳定收息。",
    entryRules: ["资金费率显著为正 → 买现货 + 开等额永续空"],
    exitRules: ["资金费率转负或价差异常 → 平掉两腿"],
    tpSl: "以资金费率与基差为信号；设极端基差止损。",
    positionMgmt: "两腿数量严格对冲，预留保证金防永续腿强平。",
    riskNotes: "资金费率会转负；永续腿需维持保证金，剧烈行情可能被强平破坏对冲。",
    exampleSignal: "BTC 永续费率 +0.03%/8h → 买 1 BTC 现货 + 开 1 BTC 永续空。",
    parameters: [
      { key: "minFunding", label: "最小资金费率%", default: 0.01 },
      { key: "hedgeRatio", label: "对冲比例", default: 1 },
    ],
  },
  {
    id: "cash_carry", nameZh: "期现套利", nameEn: "Cash-and-Carry", category: "arb",
    marketCondition: "任意（正基差）", notSuitable: "负基差 / 贴水",
    coreIndicators: ["期货 − 现货 基差"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, FUT], tags: ["套利", "基差", "中性"],
    principle: "买现货卖期货，锁定正基差，到期价差收敛兑现收益。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "cash_carry",
    summary: "经典期现套利：当交割合约相对现货升水（正基差），买现货卖期货锁定价差，持有到期价差收敛即落袋，方向中性。",
    entryRules: ["年化基差 > 资金成本阈值 → 买现货 + 卖等额交割期货"],
    exitRules: ["临近交割或基差收敛至阈值 → 平两腿"],
    tpSl: "持有到期自然收敛；中途基差反向扩大可设止损。",
    positionMgmt: "两腿等额，预留期货保证金。",
    riskNotes: "保证金占用与展期成本；负基差时无套利空间。",
    exampleSignal: "季度合约年化升水 12% → 买现货 + 卖季度合约，持有至交割。",
    parameters: [
      { key: "minBasisApr", label: "最小年化基差%", default: 8 },
    ],
  },
  {
    id: "pairs", nameZh: "配对交易", nameEn: "Pairs Trading", category: "arb",
    marketCondition: "高相关标的", notSuitable: "相关性破裂",
    coreIndicators: ["协整价差", "Z-Score"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["统计套利", "中性", "协整"],
    principle: "做多被低估、做空被高估的相关标的，赚价差收敛，市场中性。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "pairs",
    summary: "统计套利的代表：找两个高度相关（协整）的标的，当价差偏离历史均值时做多弱者、做空强者，押注价差回归，对冲掉大盘方向。",
    entryRules: ["价差 Z-Score > +2 → 做空强腿 + 做多弱腿", "Z < −2 反向"],
    exitRules: ["Z 回到 0 附近 → 平仓"],
    tpSl: "Z 回 0 止盈；Z 扩大到阈值或协整破裂止损。",
    positionMgmt: "按对冲比例（β）配两腿金额，保持市场中性。",
    riskNotes: "相关性/协整关系会破裂，价差可能不回归而持续扩大。",
    exampleSignal: "ETH/BTC 价差 Z=2.3 → 做空 ETH + 做多 BTC，回 0 平仓。",
    parameters: [
      { key: "window", label: "协整窗口", default: 60 },
      { key: "entryZ", label: "入场 Z", default: 2 },
      { key: "stopZ", label: "止损 Z", default: 3.5 },
    ],
  },
  {
    id: "triangular", nameZh: "三角套利", nameEn: "Triangular Arbitrage", category: "arb",
    marketCondition: "任意（瞬时定价错配）", notSuitable: "高延迟 / 高手续费环境",
    coreIndicators: ["三币种汇率闭环"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT], tags: ["套利", "高级", "低延迟"],
    principle: "利用三个交易对之间的汇率不一致，瞬时闭环套利。",
    status: "dev", enableBacktest: false, enablePaper: false, enableLive: false, advanced: true, impl: "triangular",
    summary: "⚙️ 高级策略。沿 A→B→C→A 三个交易对绕一圈，若闭环汇率乘积 ≠ 1 即存在无风险价差。机会瞬时存在，对延迟、手续费、盘口深度极度敏感。",
    entryRules: ["实时计算三角闭环收益 > 手续费+滑点 → 三腿原子下单"],
    exitRules: ["闭环完成即了结（持仓时间极短）"],
    tpSl: "无传统止损，靠极速执行与失败回滚控制风险。",
    positionMgmt: "单次金额受最薄一腿盘口深度限制。",
    riskNotes: "⚙️ 高级：延迟、手续费、滑点、盘口深度、API 稳定性任一不达标即亏损；一腿成交另一腿失败会留下敞口。",
    parameters: [
      { key: "minEdge", label: "最小净edge%", default: 0.1 },
      { key: "maxLatencyMs", label: "最大延迟ms", default: 200 },
    ],
  },
  {
    id: "cross_exchange", nameZh: "跨交易所套利", nameEn: "Cross-Exchange Arbitrage", category: "arb",
    marketCondition: "交易所间价差", notSuitable: "提币慢 / 单所流动性差",
    coreIndicators: ["所间买卖价差", "转账成本"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT], tags: ["套利", "高级", "跨所"],
    principle: "在低价交易所买、高价交易所卖，赚取所间价差。",
    status: "dev", enableBacktest: false, enablePaper: false, enableLive: false, advanced: true,
    summary: "⚙️ 高级策略。同一资产在不同交易所存在买卖价差时，低买高卖赚差价。难点在于跨所资金调度、提币时间与两所的手续费/滑点。",
    entryRules: ["A 所卖一 < B 所买一 且价差 > 总成本 → 两所同时对敲"],
    exitRules: ["价差收敛 / 完成对敲"],
    tpSl: "靠价差阈值与库存再平衡控制。",
    positionMgmt: "两所预置库存，避免实时提币延迟。",
    riskNotes: "⚙️ 高级：提币延迟、单所风控/宕机、价差瞬时消失；需两所充足预置资金。",
    parameters: [
      { key: "minSpread", label: "最小价差%", default: 0.3 },
    ],
  },
  {
    id: "perp_basis", nameZh: "永续基差套利", nameEn: "Perpetual Basis Arbitrage", category: "arb",
    marketCondition: "永续相对现货升贴水", notSuitable: "基差长期为零",
    coreIndicators: ["永续 − 现货 基差", "资金费率"], direction: "neutral", risk: 1, difficulty: 3,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["套利", "基差", "中性"],
    principle: "捕捉永续与现货的基差波动，结合资金费率综合套利。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "资金费率套利的进阶：同时考虑永续与现货的瞬时基差和资金费率，在基差偏离时入场、收敛时了结，叠加费率收益。",
    entryRules: ["基差偏离均值且费率方向有利 → 建对冲两腿"],
    exitRules: ["基差收敛 / 费率反转 → 平仓"],
    tpSl: "基差阈值止盈止损。",
    positionMgmt: "两腿对冲、监控保证金。",
    riskNotes: "基差与费率可能同时反向；保证金管理要求高。",
    parameters: [
      { key: "entryBasis", label: "入场基差%", default: 0.2 },
    ],
  },
  {
    id: "calendar_spread", nameZh: "日历价差套利", nameEn: "Calendar Spread", category: "arb",
    marketCondition: "不同到期合约价差", notSuitable: "单一合约",
    coreIndicators: ["近月 − 远月 价差"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS, BT], suitableMarkets: [FUT], tags: ["套利", "期限结构", "中性"],
    principle: "做多/做空不同到期月合约的价差，押注期限结构变化。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "在同一标的的不同到期合约间做价差：当近远月价差偏离正常期限结构时，多一腿空一腿押注其回归，方向中性。",
    entryRules: ["近远月价差偏离历史区间 → 多低估腿 + 空高估腿"],
    exitRules: ["价差回归 / 临近交割"],
    tpSl: "价差区间止盈止损。",
    positionMgmt: "两腿名义对冲，关注交割与流动性。",
    riskNotes: "远月流动性差、滑点大；期限结构可持续异常。",
    parameters: [
      { key: "entrySpread", label: "入场价差%", default: 0.5 },
    ],
  },
  {
    id: "funding_rotation", nameZh: "资金费率轮动", nameEn: "Funding Rate Rotation", category: "arb",
    marketCondition: "多币种费率分化", notSuitable: "全市场费率趋同",
    coreIndicators: ["各永续资金费率排序"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["套利", "轮动", "中性"],
    principle: "在多个永续中轮动选取资金费率最高的标的做对冲套利。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "资金费率套利的组合版：横向比较多个币种的资金费率，资金集中在费率最高的若干标的上做对冲，并定期轮动调仓。",
    entryRules: ["按资金费率排序，选 TopN 标的各自建对冲两腿"],
    exitRules: ["费率排名跌出 TopN → 轮出换仓"],
    tpSl: "以费率排名与基差异常为信号。",
    positionMgmt: "分散到多标的，单标的限额。",
    riskNotes: "换仓产生手续费与滑点；费率快速收敛时收益骤降。",
    parameters: [
      { key: "topN", label: "选取数量", default: 3 },
      { key: "rebalanceH", label: "轮动周期(h)", default: 8 },
    ],
  },

  // ════════════════════════ 6. 盘口与订单流类 (orderflow) ════════════════════════
  {
    id: "market_making", nameZh: "做市", nameEn: "Market Making", category: "orderflow",
    marketCondition: "高流动 / 震荡", notSuitable: "剧烈单边 / 低流动性",
    coreIndicators: ["双边报价", "价差", "库存"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["做市", "盘口", "中性", "内置"],
    principle: "同时挂买卖单赚买卖价差，控制库存与风险（本平台内置策略）。",
    status: "paper", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true, impl: "market_maker",
    summary: "本平台内置的核心策略：在买一/卖一附近同时挂双边限价单，赚取买卖价差与挂单返佣，并通过库存偏移（skew）动态控制净头寸。",
    entryRules: ["围绕中间价 ± 价差/2 挂双边限价单", "成交后立即补单维持双边报价"],
    exitRules: ["库存超阈值时单边收口/主动平库", "行情异常时撤单避险"],
    tpSl: "以库存上限与最大回撤为风控线；价差覆盖手续费才有正期望。",
    positionMgmt: "库存越偏离 0，报价越向回归方向倾斜（inventory skew）。",
    riskNotes: "⚙️ 高级：单边行情中持续被逆向成交累积库存（adverse selection）；延迟与撤单速度直接决定盈亏。",
    exampleSignal: "中间价 60000，价差 4 → 买 59998 / 卖 60002，成交后补单并按库存调 skew。",
    parameters: [
      { key: "spreadBps", label: "目标价差(bps)", default: 4 },
      { key: "orderSize", label: "单笔数量", default: 0.01, unit: "BTC" },
      { key: "maxInventory", label: "最大库存", default: 0.1, unit: "BTC" },
    ],
  },
  {
    id: "ob_imbalance", nameZh: "订单簿失衡", nameEn: "Order Book Imbalance", category: "orderflow",
    marketCondition: "高流动盘口", notSuitable: "薄盘 / 易被操纵",
    coreIndicators: ["买卖盘量比", "盘口深度"], direction: "both", risk: 2, difficulty: 3,
    recommendedFor: [OBS, PAPER], suitableMarkets: [SPOT, PERP], tags: ["盘口", "失衡", "高级"],
    principle: "买卖盘挂单量严重失衡时，短期价格倾向失衡较重的一侧。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。统计盘口若干档买卖挂单量之比，买盘远大于卖盘预示短期上行压力，反之下行。属高频微观信号。",
    entryRules: ["买卖量比 > 阈值（如 2:1）→ 偏多信号", "反之偏空"],
    exitRules: ["失衡消失或反转 → 离场"],
    tpSl: "极短持有，紧止损（tick 级）。",
    positionMgmt: "受盘口深度限制，小额高频。",
    riskNotes: "⚙️ 高级：挂单可被撤可被伪造（spoofing），薄盘易误导；对延迟敏感。",
    parameters: [
      { key: "levels", label: "统计档位", default: 5 },
      { key: "ratio", label: "失衡阈值", default: 2 },
    ],
  },
  {
    id: "spread_capture", nameZh: "价差捕捉", nameEn: "Spread Capture", category: "orderflow",
    marketCondition: "买卖价差偏大", notSuitable: "极窄价差",
    coreIndicators: ["买一卖一价差", "成交频率"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS, PAPER], suitableMarkets: [SPOT, PERP], tags: ["盘口", "价差", "高级"],
    principle: "在价差偏大的盘口被动挂单，赚取买卖价差。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。做市的简化形态：专挑价差偏大的时刻被动挂单，成交后快速对冲，赚价差。需要低延迟与撤单能力。",
    entryRules: ["价差 > 阈值时在内侧挂被动单"],
    exitRules: ["成交后对侧挂单了结 / 价差收窄撤单"],
    tpSl: "价差即目标利润；库存超限即平。",
    positionMgmt: "保持库存接近中性。",
    riskNotes: "⚙️ 高级：被逆向成交风险；与做市同源。",
    parameters: [
      { key: "minSpreadBps", label: "最小价差(bps)", default: 6 },
    ],
  },
  {
    id: "large_order_follow", nameZh: "大单跟随", nameEn: "Large Order Following", category: "orderflow",
    marketCondition: "有主力大单", notSuitable: "无明显大单",
    coreIndicators: ["大额成交", "主动买卖方向"], direction: "both", risk: 2, difficulty: 3,
    recommendedFor: [OBS, PAPER], suitableMarkets: [SPOT, PERP], tags: ["订单流", "大单", "高级"],
    principle: "监测异常大额主动成交，顺主力方向短线跟随。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。从逐笔成交中识别异常大额主动买/卖，假设其代表主力意图并短线跟随，需快速进出。",
    entryRules: ["出现远超均值的主动买单 → 跟多", "主动卖单 → 跟空"],
    exitRules: ["动能衰减 / 反向大单出现"],
    tpSl: "短持紧止损。",
    positionMgmt: "小额试探，确认再加。",
    riskNotes: "⚙️ 高级：大单可能是诱导或对冲腿，跟随未必正确。",
    parameters: [
      { key: "sizeMult", label: "大单倍数", default: 5 },
    ],
  },
  {
    id: "cvd", nameZh: "CVD 成交量差", nameEn: "Cumulative Volume Delta", category: "orderflow",
    marketCondition: "趋势/背离识别", notSuitable: "数据缺失",
    coreIndicators: ["主动买量 − 主动卖量", "累计 Delta"], direction: "both", risk: 2, difficulty: 3,
    recommendedFor: [OBS, PAPER], suitableMarkets: [SPOT, PERP], tags: ["订单流", "CVD", "高级"],
    principle: "累计主动买卖量差，判断买卖压力与价量背离。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。把每笔成交按主动方向累加成 Delta 曲线，用其与价格的同步/背离来判断买卖压力的真实强弱。",
    entryRules: ["价格新高但 CVD 不创新高（顶背离）→ 警惕做空", "底背离反之"],
    exitRules: ["背离消解 / 趋势确认反向"],
    tpSl: "结构位止损。",
    positionMgmt: "作为过滤/确认信号配合主策略。",
    riskNotes: "⚙️ 高级：交易所主动方向标注口径不一；非交易所数据需重构。",
    parameters: [
      { key: "window", label: "累计窗口", default: 0 },
    ],
  },
  {
    id: "order_flow_imbalance", nameZh: "订单流失衡", nameEn: "Order Flow Imbalance", category: "orderflow",
    marketCondition: "高频微观结构", notSuitable: "低频 / 薄盘",
    coreIndicators: ["盘口增减(OFI)", "成交流"], direction: "both", risk: 2, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT, PERP], tags: ["订单流", "OFI", "高频"],
    principle: "综合盘口挂撤单与成交，量化瞬时买卖压力（OFI）。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。学术界的 OFI 指标：综合盘口挂单增减与主动成交，量化极短期的净买卖压力，是高频价格预测的常用特征。",
    entryRules: ["OFI 显著为正 → 短多", "显著为负 → 短空"],
    exitRules: ["OFI 回落 / 反向"],
    tpSl: "tick 级紧止损。",
    positionMgmt: "高频小额。",
    riskNotes: "⚙️ 高级：需要 L2 全量数据与极低延迟，实现门槛高。",
    parameters: [
      { key: "horizonMs", label: "预测窗口ms", default: 500 },
    ],
  },
  {
    id: "liquidity_sweep", nameZh: "流动性扫单", nameEn: "Liquidity Sweep", category: "orderflow",
    marketCondition: "关键位插针/扫损", notSuitable: "平静盘整",
    coreIndicators: ["流动性聚集位", "扫单后反转"], direction: "both", risk: 3, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [PERP], tags: ["订单流", "扫单", "高级"],
    principle: "识别主力扫掉关键位流动性（插针止损）后的反转机会。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。捕捉价格快速插穿关键支撑/阻力扫掉止损流动性后迅速收回的‘扫单反转’形态，顺反转方向进场。",
    entryRules: ["价格急刺破关键位扫损后快速收回 → 反向进场"],
    exitRules: ["反转动能衰减"],
    tpSl: "插针极值外侧紧止损。",
    positionMgmt: "小仓试探，确认收回再进。",
    riskNotes: "⚙️ 高级：可能是真突破而非扫单，逆势接针风险大。",
    parameters: [
      { key: "wickPct", label: "插针幅度%", default: 1 },
    ],
  },
  {
    id: "iceberg_detection", nameZh: "冰山单识别", nameEn: "Iceberg Detection", category: "orderflow",
    marketCondition: "隐藏大单", notSuitable: "无隐藏单",
    coreIndicators: ["同价位反复补单", "成交吃不动"], direction: "neutral", risk: 2, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT, PERP], tags: ["订单流", "冰山", "高级"],
    principle: "识别同价位不断隐性补单的冰山委托，推断主力意图。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级（仅信号/模拟）。冰山单只露出小部分挂单、成交后自动补单。通过同一价位反复成交却‘吃不动’来探测隐藏大单与其方向。",
    entryRules: ["某价位反复成交而挂单不减 → 判定冰山，顺其支撑/压力方向"],
    exitRules: ["冰山消失 / 价格远离"],
    tpSl: "以冰山价位为参考止损。",
    positionMgmt: "作为辅助信号，不独立重仓。",
    riskNotes: "⚙️ 高级：识别为概率推断，冰山可能随时撤离。",
    parameters: [
      { key: "refillTimes", label: "补单次数阈值", default: 3 },
    ],
  },

  // ════════════════════════ 7. 量价与因子类 (factor) ════════════════════════
  {
    id: "momentum", nameZh: "动量策略", nameEn: "Momentum", category: "factor",
    marketCondition: "趋势 / 强弱分化", notSuitable: "无序震荡",
    coreIndicators: ["ROC / 收益率排序"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["动量", "因子", "强者恒强"],
    principle: "买入近期强势、卖出弱势标的，‘强者恒强’的截面/时序动量。",
    status: "paper", enableBacktest: true, enablePaper: true, enableLive: false, impl: "momentum",
    summary: "动量是最稳健的因子之一：近期涨得多的未来一段时间倾向继续涨。可做时序（单标的）或截面（多标的排序）动量。",
    entryRules: ["时序：N 日收益 > 0 且加速 → 做多", "截面：买强势组、空弱势组"],
    exitRules: ["动量转负 / 排名跌出 → 离场"],
    tpSl: "移动止损跟随；定期再平衡。",
    positionMgmt: "截面等权或按动量加权，定期换仓。",
    riskNotes: "动量崩溃（reversal）时回撤剧烈；换仓成本不可忽视。",
    exampleSignal: "过去 20 日涨幅排名前 3 的币 → 等权做多，每周再平衡。",
    parameters: [
      { key: "lookback", label: "动量回看", default: 20 },
      { key: "topN", label: "持仓数量", default: 3 },
    ],
  },
  {
    id: "roc", nameZh: "ROC 动量", nameEn: "Rate of Change", category: "factor",
    marketCondition: "趋势加速", notSuitable: "横盘",
    coreIndicators: ["ROC(N)", "零轴"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["动量", "变动率"],
    principle: "价格变动率上穿零轴动能转多，下穿转空。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "ROC 直接度量价格相对 N 周期前的百分比变化，是最纯粹的动量表达，常作动量过滤或择时。",
    entryRules: ["ROC 上穿 0 且走高 → 做多", "下穿 0 → 做空"],
    exitRules: ["ROC 回落穿越 0"],
    tpSl: "结构位/ATR 止损。",
    positionMgmt: "与趋势过滤组合使用。",
    riskNotes: "零轴附近频繁穿越，需平滑或阈值。",
    parameters: [{ key: "period", label: "ROC 周期", default: 12 }],
  },
  {
    id: "obv", nameZh: "OBV 能量潮", nameEn: "On-Balance Volume", category: "factor",
    marketCondition: "量价确认/背离", notSuitable: "成交清淡",
    coreIndicators: ["OBV 累计量", "OBV 均线"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["量能", "OBV", "背离"],
    principle: "按涨跌累计成交量，OBV 与价格背离预示反转。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "OBV 把成交量按收盘涨跌累加，用‘量’确认‘价’。OBV 与价格同步增强趋势，背离则预警反转，是量价分析的基石。",
    entryRules: ["价升 OBV 同步创新高 → 顺势做多", "价升 OBV 不创高（背离）→ 警惕"],
    exitRules: ["OBV 趋势反转 / 跌破其均线"],
    tpSl: "价格结构位止损。",
    positionMgmt: "作确认信号，配合趋势策略。",
    riskNotes: "对单笔大额成交敏感；不区分主动被动。",
    parameters: [{ key: "maPeriod", label: "OBV 均线", default: 30 }],
  },
  {
    id: "mfi", nameZh: "MFI 资金流", nameEn: "Money Flow Index", category: "factor",
    marketCondition: "资金进出 / 超买超卖", notSuitable: "缩量",
    coreIndicators: ["MFI(14)", "20 / 80"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["资金流", "量价", "超买超卖"],
    principle: "结合价格与成交量的‘量价版 RSI’，衡量资金进出强度。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "MFI 在 RSI 基础上加入成交量权重，衡量资金流入流出的力度，超买超卖与背离信号比纯 RSI 更有量能支撑。",
    entryRules: ["MFI < 20 资金超卖回升 → 做多", "MFI > 80 超买回落 → 做空"],
    exitRules: ["回到 50 中枢"],
    tpSl: "中枢止盈；区间止损。",
    positionMgmt: "震荡市使用，趋势取顺势侧。",
    riskNotes: "强趋势钝化；需成交量数据可靠。",
    parameters: [{ key: "period", label: "MFI 周期", default: 14 }],
  },
  {
    id: "volume_breakout", nameZh: "放量突破", nameEn: "Volume Breakout", category: "factor",
    marketCondition: "放量启动", notSuitable: "缩量假突破",
    coreIndicators: ["成交量均线", "放量倍数", "价格突破"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [BT, PAPER], suitableMarkets: [SPOT, PERP], tags: ["量价", "突破", "量能"],
    principle: "价格突破同时成交量显著放大，确认突破有效性。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "用‘量’给突破背书：只有伴随显著放量的价格突破才视为有效，过滤掉大量缩量假突破，是突破类策略的量能加强版。",
    entryRules: ["价格突破关键位 + 成交量 > N 倍均量 → 顺势进场"],
    exitRules: ["量能萎缩 / 价格收回"],
    tpSl: "突破位另一端止损；移动止盈。",
    positionMgmt: "量越大确认越强，可适度加仓。",
    riskNotes: "放量也可能是出货/诱多；需结合结构。",
    parameters: [
      { key: "volMa", label: "量均线", default: 20 },
      { key: "volMult", label: "放量倍数", default: 2 },
    ],
  },
  {
    id: "pv_divergence", nameZh: "价量背离", nameEn: "Price-Volume Divergence", category: "factor",
    marketCondition: "趋势衰竭", notSuitable: "趋势健康延续",
    coreIndicators: ["价格新高/低", "量能/指标背离"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["背离", "量价", "反转"],
    principle: "价格创新高/低而量能或动量指标不配合，预示趋势衰竭。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "价量背离是趋势衰竭的经典预警：价格还在创新高但成交量/动量已跟不上，说明推动力减弱，反转概率上升。",
    entryRules: ["价格新高 + 量/动量不创新高（顶背离）→ 准备做空", "底背离反之"],
    exitRules: ["背离失败（价量重新同步）→ 离场"],
    tpSl: "背离极值外止损。",
    positionMgmt: "作为反转预警，需价格确认再进。",
    riskNotes: "背离可多次出现而趋势继续，‘背离不是卖出信号’。",
    parameters: [{ key: "lookback", label: "对比窗口", default: 20 }],
  },
  {
    id: "volume_profile", nameZh: "成交密集区", nameEn: "Volume Profile", category: "factor",
    marketCondition: "区间结构交易", notSuitable: "无历史成交参考",
    coreIndicators: ["成交量分布", "POC", "价值区"], direction: "both", risk: 2, difficulty: 2,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["量价", "筹码", "支撑阻力"],
    principle: "按价格统计成交量分布，密集区(POC)构成强支撑阻力。",
    status: "backtest", enableBacktest: true, enablePaper: true, enableLive: false,
    summary: "成交量分布把‘量’按价格而非时间统计，找出成交最密集的价位（POC）与价值区，作为高质量的支撑阻力与区间边界。",
    entryRules: ["价格回踩 POC/价值区下沿企稳 → 做多", "价值区上沿滞涨 → 做空"],
    exitRules: ["到对侧价值区边界 / 跌破密集区"],
    tpSl: "密集区外止损；对侧边界止盈。",
    positionMgmt: "结合区间策略使用。",
    riskNotes: "结构会随新成交演变；突破密集区后可能加速。",
    parameters: [
      { key: "bins", label: "价格分箱", default: 50 },
      { key: "vaPct", label: "价值区占比%", default: 70 },
    ],
  },
  {
    id: "multi_factor", nameZh: "多因子排序", nameEn: "Multi-Factor Ranking", category: "factor",
    marketCondition: "多标的组合", notSuitable: "单标的",
    coreIndicators: ["动量/波动/量能等因子", "综合打分"], direction: "long", risk: 2, difficulty: 3,
    recommendedFor: [OBS, BT], suitableMarkets: [SPOT, PERP], tags: ["因子", "选币", "组合"],
    principle: "综合多个因子打分排序，买入综合得分最高的标的组合。",
    status: "dev", enableBacktest: true, enablePaper: false, enableLive: false,
    summary: "量化选币的雏形：对一篮子标的计算动量、波动率、量能等多个因子，加权打分后选 TopN 构建组合并定期再平衡。",
    entryRules: ["按多因子综合得分排序 → 买入 TopN 等权/加权组合"],
    exitRules: ["得分跌出 TopN → 换出"],
    tpSl: "组合层面回撤控制 + 定期再平衡。",
    positionMgmt: "分散持有，单标的限重。",
    riskNotes: "因子失效与拥挤、过拟合；需样本外验证。",
    parameters: [
      { key: "topN", label: "持仓数量", default: 5 },
      { key: "rebalanceD", label: "再平衡(天)", default: 7 },
    ],
  },

  // ════════════════════════ 8. 执行算法类 (execution) ════════════════════════
  {
    id: "twap", nameZh: "TWAP 时间加权执行", nameEn: "TWAP", category: "execution",
    marketCondition: "任意（大单分拆执行）", notSuitable: "需即时全部成交",
    coreIndicators: ["时间切片", "每片数量"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["执行", "时间加权", "降冲击"],
    principle: "大单按时间均匀拆分下单，降低冲击成本与滑点。",
    status: "paper", enableBacktest: false, enablePaper: true, enableLive: false, impl: "twap",
    summary: "执行算法而非择时策略：把一笔大单沿时间轴均匀切片，按固定节奏小额成交，目标是贴近时间加权均价、减少市场冲击。",
    entryRules: ["在指定时间窗内，每个切片下等额订单直至完成总量"],
    exitRules: ["总量执行完毕即结束"],
    tpSl: "不涉及方向止损；可设价格保护带（超出暂停）。",
    positionMgmt: "切片越细冲击越小但耗时越长。",
    riskNotes: "不判断方向，执行期内行情不利仍会成交；可加价格上限保护。",
    exampleSignal: "在 2 小时内分 24 片买入 1 BTC，每 5 分钟买约 0.0417 BTC。",
    parameters: [
      { key: "totalQty", label: "总数量", default: 1, unit: "BTC" },
      { key: "durationMin", label: "执行时长(分)", default: 120 },
      { key: "slices", label: "切片数", default: 24 },
    ],
  },
  {
    id: "vwap", nameZh: "VWAP 成交量加权执行", nameEn: "VWAP", category: "execution",
    marketCondition: "任意（贴合市场量分布）", notSuitable: "极低流动性",
    coreIndicators: ["历史成交量分布", "动态切片"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["执行", "成交量加权", "降冲击"],
    principle: "按市场成交量分布拆单，成交量大时多下、量小时少下，贴合 VWAP。",
    status: "backtest", enableBacktest: false, enablePaper: true, enableLive: false,
    summary: "执行算法：依据市场历史成交量分布动态分配下单节奏，在放量时段多成交、清淡时段少成交，目标是贴近成交量加权均价（VWAP）。",
    entryRules: ["按预测的成交量曲线分配每个时段的执行量"],
    exitRules: ["总量执行完毕"],
    tpSl: "无方向止损；可设 VWAP 偏离保护。",
    positionMgmt: "跟随市场流动性节奏，减少冲击。",
    riskNotes: "依赖成交量预测，实际分布偏离会带来执行偏差。",
    exampleSignal: "按当日典型量分布在欧美盘活跃时段多执行，凌晨少执行。",
    parameters: [
      { key: "totalQty", label: "总数量", default: 1, unit: "BTC" },
      { key: "durationMin", label: "执行时长(分)", default: 120 },
    ],
  },
  {
    id: "iceberg_order", nameZh: "冰山委托", nameEn: "Iceberg Order", category: "execution",
    marketCondition: "大单隐藏执行", notSuitable: "需快速全成",
    coreIndicators: ["显示数量", "隐藏总量"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["执行", "冰山", "隐藏"],
    principle: "只暴露小额挂单，成交后自动补单，隐藏真实大单规模。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false,
    summary: "执行算法：把大单拆成只露出一小部分的‘冰山’，成交一份立即补一份，避免暴露真实意图引发盘口反应。",
    entryRules: ["以小额显示量挂单，成交后自动补到设定显示量，直至总量完成"],
    exitRules: ["隐藏总量全部成交"],
    tpSl: "不涉及；可设价格区间约束。",
    positionMgmt: "显示量越小越隐蔽但成交越慢。",
    riskNotes: "可能被识别（见冰山单识别）；执行期行情可能不利。",
    parameters: [
      { key: "totalQty", label: "隐藏总量", default: 1, unit: "BTC" },
      { key: "showQty", label: "显示数量", default: 0.05, unit: "BTC" },
    ],
  },
  {
    id: "pov", nameZh: "POV 成交量参与率", nameEn: "Percentage of Volume", category: "execution",
    marketCondition: "跟随市场成交量", notSuitable: "成交清淡",
    coreIndicators: ["市场实时成交量", "参与率%"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["执行", "参与率", "自适应"],
    principle: "按市场实时成交量的固定百分比参与下单，量大多下、量小少下。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false,
    summary: "执行算法：始终保持自己的成交量占市场成交量的固定比例（如 10%），自适应流动性，比 VWAP 更实时，但完成时间不确定。",
    entryRules: ["实时跟踪市场成交量，按参与率投放对应数量"],
    exitRules: ["总量完成"],
    tpSl: "无方向止损；可设最长执行时限。",
    positionMgmt: "参与率越高冲击越大、完成越快。",
    riskNotes: "完成时间随市场量波动；放量时被动加速。",
    parameters: [
      { key: "povPct", label: "参与率%", default: 10 },
      { key: "totalQty", label: "总数量", default: 1, unit: "BTC" },
    ],
  },
  {
    id: "post_only", nameZh: "Post Only Maker 执行", nameEn: "Post Only Maker", category: "execution",
    marketCondition: "争取 maker 返佣", notSuitable: "急需成交",
    coreIndicators: ["盘口排队", "maker 费率"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [SPOT, PERP], tags: ["执行", "maker", "省手续费"],
    principle: "只以只挂单(Post-Only)方式被动成交，确保拿 maker 费率、避免吃单。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false,
    summary: "执行算法：强制以 Post-Only 方式挂单，若会立即成交则撤回重挂，保证始终是 maker，赚返佣/省手续费，代价是成交不确定。",
    entryRules: ["在买一/卖一内侧 Post-Only 挂单，被吃则成交，否则随盘口追挂"],
    exitRules: ["总量成交完成"],
    tpSl: "无方向；可设最大追价范围。",
    positionMgmt: "追价过紧易吃单失败，过松成交慢。",
    riskNotes: "行情快速单边时可能长时间不成交（踏空执行）。",
    parameters: [
      { key: "maxChase", label: "最大追价(bps)", default: 5 },
    ],
  },
  {
    id: "smart_router", nameZh: "智能路由", nameEn: "Smart Order Router", category: "execution",
    marketCondition: "多场所/多腿最优执行", notSuitable: "单一场所",
    coreIndicators: ["多场所盘口", "费率/滑点综合"], direction: "neutral", risk: 1, difficulty: 3,
    recommendedFor: [OBS], suitableMarkets: [SPOT, PERP], tags: ["执行", "路由", "高级"],
    principle: "综合各场所盘口、费率与滑点，将订单拆分路由到最优执行路径。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false, advanced: true,
    summary: "⚙️ 高级执行算法：在多个交易场所/交易对之间，综合盘口深度、手续费与预期滑点，把一笔订单智能拆分路由到综合成本最低的路径。",
    entryRules: ["实时比较各场所有效价格，按最优成本拆分下单"],
    exitRules: ["总量在各场所执行完毕"],
    tpSl: "以综合执行成本为目标，无方向止损。",
    positionMgmt: "受各场所深度与预置资金限制。",
    riskNotes: "⚙️ 高级：多场所连接复杂、状态同步难；某腿失败需回滚。",
    parameters: [
      { key: "venues", label: "候选场所数", default: 2 },
    ],
  },
  {
    id: "reduce_only", nameZh: "平仓保护执行", nameEn: "Reduce-Only Execution", category: "execution",
    marketCondition: "只减仓 / 风险了结", notSuitable: "需要加仓",
    coreIndicators: ["持仓数量", "reduce-only 约束"], direction: "neutral", risk: 1, difficulty: 2,
    recommendedFor: [PAPER, LIVE_CAREFUL], suitableMarkets: [PERP, FUT], tags: ["执行", "平仓", "风控"],
    principle: "以只减仓(Reduce-Only)约束分批平仓，确保订单不会反向开新仓。",
    status: "dev", enableBacktest: false, enablePaper: true, enableLive: false,
    summary: "执行算法/风控工具：所有订单带 Reduce-Only 标志，保证只会减少现有持仓、绝不反向加仓，常用于安全了结或止损分批离场。",
    entryRules: ["对现有持仓按 TWAP/POV 节奏分批 Reduce-Only 平仓"],
    exitRules: ["持仓归零"],
    tpSl: "本身即风险了结工具；可设最差可接受均价。",
    positionMgmt: "分批降低冲击，避免一次性砸盘。",
    riskNotes: "不保证最优价，仅保证不反向；急跌中分批可能错过更优出场。",
    parameters: [
      { key: "slices", label: "切片数", default: 10 },
    ],
  },
];

// ── 衍生导出：第一阶段 20 个核心策略（用于‘核心’筛选）──
export const CORE_IDS = new Set([
  "ma_crossover", "ema_trend", "macd", "rsi_reversal", "kdj",
  "bollinger_reversion", "bollinger_breakout", "donchian", "turtle", "supertrend",
  "atr_trend", "spot_grid", "futures_grid", "dca", "funding_arb",
  "cash_carry", "pairs", "market_making", "twap", "vwap",
]);

export const STRATEGY_COUNT = STRATEGIES.length;

// ── 模板类型 (template type) ──
// 经典策略库是策略百科 / 模板展示，列表用「模板类型」描述其定位，而非运行状态。
//   core 核心模板 · classic 经典模板 · advanced 高级模板 · reference 仅参考 · highrisk 高风险
export type TemplateType = "core" | "classic" | "advanced" | "reference" | "highrisk";

// 最基础、最常被学习的入门模板。
const CORE_TEMPLATE = new Set([
  "ma_crossover", "ema_trend", "macd", "rsi_reversal", "kdj",
  "bollinger_reversion", "spot_grid", "dca",
]);

export function templateType(s: Strategy): TemplateType {
  if (s.highRisk) return "highrisk"; // 马丁格尔等
  if (s.advanced) return "advanced"; // 三角套利 / 做市 / 盘口订单流 / 智能路由…
  if (s.status === "dev") return "reference"; // 变体 / 工程化程度低，仅作参考
  if (CORE_TEMPLATE.has(s.id)) return "core";
  return "classic";
}

// 是否需要展示醒目的高风险提示（极端行情/低流动性/滑点/杠杆敏感）。
export function isHighRiskStrategy(s: Strategy): boolean {
  return Boolean(s.highRisk || s.advanced || s.risk === 3);
}

// ── 后台执行映射（demo） ──
// 「我的策略」的新增类型 = 后端可执行的 strategy_type。本平台是单标的 demo bot，
// 无法为 66 个策略各自实现独立引擎（盘口/订单流、跨所、三角套利等需要 L2 全量行情、
// 多交易所连接等基础设施）。沿用项目既有设计——未原生实现的策略在 demo 上用最接近的
// 引擎「近似执行」（后端 _STRATEGIES 已对套利类如此处理）。
//
// strategyTypeValue(s) = 下拉/存储用的 strategy_type（已实现用 impl，其余用 id，保证唯一）。
// runnerOf(value)      = 该类型实际调用的后端引擎 key（用于表单参数区、分类归并、后端分发）。
const FALLBACK_RUNNER: Record<string, string> = {
  trend: "ma_cross", meanrev: "mean_rev", breakout: "boll_break",
  grid: "grid", arb: "mean_rev", orderflow: "mean_rev",
  factor: "momentum", execution: "dca",
};
// impl 值 → 实际后端引擎（与 _STRATEGIES 一致）：部分 strategy_type 虽是独立的存储值，
// 但后端用等价引擎执行（套利类→均值回归、twap→dca、futures_grid→grid）。
const IMPL_ALIAS: Record<string, string> = {
  futures_grid: "grid",
  funding_arb: "mean_rev", cash_carry: "mean_rev", pairs: "mean_rev", triangular: "mean_rev",
  twap: "dca",
};
// 按 id 的引擎覆盖（无 impl、但分类回落会误判的特例）。
// 智能定投属「网格与定投」分类，但后端按 DCA 引擎运行，非网格。
const RUNNER_BY_ID: Record<string, string> = { smart_dca: "dca" };

export function strategyTypeValue(s: Strategy): string {
  return s.impl ?? s.id;
}

const BY_VALUE: Record<string, Strategy> = Object.fromEntries(
  STRATEGIES.map((s) => [strategyTypeValue(s), s])
);

export function runnerOf(value: string): string {
  const s = BY_VALUE[value];
  if (!s) return value; // 兼容旧值 / market_maker
  if (s.impl) return IMPL_ALIAS[s.impl] ?? s.impl;
  return RUNNER_BY_ID[s.id] ?? FALLBACK_RUNNER[s.category] ?? "ma_cross";
}

// 名称 / 简介映射（覆盖全部 66，键为 strategyTypeValue）。
export const LIB_LABEL_ZH: Record<string, string> = Object.fromEntries(STRATEGIES.map((s) => [strategyTypeValue(s), s.nameZh]));
export const LIB_LABEL_EN: Record<string, string> = Object.fromEntries(STRATEGIES.map((s) => [strategyTypeValue(s), s.nameEn]));
export const LIB_BRIEF: Record<string, string> = Object.fromEntries(STRATEGIES.map((s) => [strategyTypeValue(s), s.principle]));

// ── 「我的策略」OKX 式产品 Tab 归类 ──
// 对齐 OKX 策略广场的产品分类（见 strategyCategories.ts 的 key）。OKX 的分类比 8 大类窄：
// 所有指标 / 盘口类统一归「信号策略」（OKX 的信号策略=指标信号统称），执行算法归「时间加权 /
// 冰山策略」，网格 / 定投 / 马丁各归各位。OKX 没有对应产品的 Tab（合约马丁 / 屯币宝 / 套利下单 /
// 抄底止盈）保持为空。
const OKX_TAB_BY_ID: Record<string, string> = {
  // 网格
  spot_grid: "spot_grid", infinite_grid: "spot_grid", dynamic_grid: "spot_grid", smart_grid: "spot_grid",
  futures_grid: "futures_grid",
  // 定投 / 马丁
  dca: "dca", smart_dca: "dca",
  martingale: "spot_martingale",
  // 执行算法
  twap: "twap", vwap: "twap", pov: "twap", post_only: "twap", smart_router: "twap", reduce_only: "twap",
  iceberg_order: "iceberg", iceberg_detection: "iceberg",
};
const OKX_TAB_BY_CAT: Record<string, string> = {
  trend: "signal", meanrev: "signal", breakout: "signal", factor: "signal", orderflow: "signal",
  arb: "smart_arb", grid: "spot_grid", execution: "twap",
};

/** 给定存储的 strategy_type，返回该策略的核心指标列表（用于「核心指标 / 参数」列）。 */
export function coreIndicatorsOf(value: string): string[] {
  return BY_VALUE[value]?.coreIndicators ?? [];
}

/** 给定存储的 strategy_type，返回它在「我的策略」里所属的 OKX 产品 Tab key。 */
export function okxTabOf(value: string): string {
  const s = BY_VALUE[value];
  if (!s) return "signal"; // 兼容旧值
  return OKX_TAB_BY_ID[s.id] ?? OKX_TAB_BY_CAT[s.category] ?? "signal";
}
