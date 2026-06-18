// 统一数字 / 价格 / 资产格式化。空值一律显示 DASH，绝不显示 NaN/undefined/null。
// 所有数字应配合 .mono 等宽样式（font-variant-numeric: tabular-nums）使用，避免实时刷新抖动。

/** 空值占位符 —— 全站统一。 */
export const DASH = "--";

const isNil = (v: number | null | undefined): boolean =>
  v === null || v === undefined || Number.isNaN(v);

/** 通用数字：固定小数位 + 千分位。空值 → "--"。 */
export const fmtNum = (v: number | null | undefined, digits = 2): string => {
  if (isNil(v)) return DASH;
  return (v as number).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/** USD 金额：两位小数 + 千分位 + $ 前缀。 */
export const fmtUsd = (v: number | null | undefined, digits = 2): string =>
  isNil(v) ? DASH : `$${fmtNum(v, digits)}`;

/** 百分比：固定小数位 + %。 */
export const fmtPct = (v: number | null | undefined, digits = 2): string =>
  isNil(v) ? DASH : `${fmtNum(v, digits)}%`;

/**
 * 自适应百分比：数值越小保留越多小数（2~4 位），避免小价差显示成 0.00%。
 */
export const fmtPctAuto = (v: number | null | undefined): string => {
  if (isNil(v)) return DASH;
  const a = Math.abs(v as number);
  const digits = a >= 1 ? 2 : a >= 0.1 ? 3 : 4;
  return `${fmtNum(v, digits)}%`;
};

/**
 * 自适应价格/绝对值：数值越小保留越多小数，避免小价差被截成 0.00。
 */
export const fmtAuto = (v: number | null | undefined): string => {
  if (isNil(v)) return DASH;
  const a = Math.abs(v as number);
  const digits = a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
  return fmtNum(v, digits);
};

/** 按交易品种推断数量精度：BTC 4 位、ETH 3 位、其余 4 位。 */
export const qtyDecimals = (instId?: string): number => {
  if (!instId) return 4;
  const base = instId.split("-")[0]?.toUpperCase();
  if (base === "BTC") return 4;
  if (base === "ETH") return 3;
  return 4;
};

/** 数量：按品种精度（或显式 digits）格式化。 */
export const fmtQty = (
  v: number | null | undefined,
  instId?: string,
  digits?: number
): string => fmtNum(v, digits ?? qtyDecimals(instId));

/** 盈亏配色：盈用涨色、亏用跌色、零/空灰。涨跌色随「涨跌颜色」设置切换（CSS 变量）。 */
export const pnlColor = (v: number | null | undefined): string =>
  isNil(v) || v === 0 ? "var(--app-text-2)" : (v as number) > 0 ? "var(--up)" : "var(--down)";

export interface SpreadStats {
  mid: number;
  /** 绝对价差 = ask - bid */
  abs: number;
  /** 价差率（百分比）= abs / mid * 100 */
  rate: number;
  /** 价差（基点）= abs / mid * 10000 */
  bp: number;
}

/**
 * 计算买一卖一的价差统计。任一边缺失或非正 → null。
 * 同时给出绝对价差、价差率(%) 和基点(bp)，避免只显示 0.000%。
 */
export const spreadStats = (
  bid: number | null | undefined,
  ask: number | null | undefined
): SpreadStats | null => {
  if (isNil(bid) || isNil(ask)) return null;
  const b = bid as number;
  const a = ask as number;
  if (b <= 0 || a <= 0) return null;
  const mid = (b + a) / 2;
  const abs = a - b;
  return { mid, abs, rate: (abs / mid) * 100, bp: (abs / mid) * 10000 };
};

/** 把一个起始毫秒时间戳格式化为持续时长（如 2d 3h / 5h 12m / 8m）。空值 → "--"。 */
export const fmtDuration = (since: number | null | undefined): string => {
  if (since === null || since === undefined) return DASH;
  let s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
};

/** 把毫秒/秒时间戳格式化为本地 HH:mm:ss。空值 → "--"。 */
export const fmtTime = (ts: number | string | null | undefined): string => {
  if (ts === null || ts === undefined) return DASH;
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts < 1e12 ? ts * 1000 : ts);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleTimeString();
};
