import { graphic } from "echarts";
import ReactECharts from "echarts-for-react";
import { memo, useEffect, useRef, useState } from "react";
import { useThemeMode } from "@/store/ThemeContext";
import type { Candle } from "@/types";
import { useColors } from "@/store/PrefsContext";

export interface ChartOverlays {
  /** Live limit orders to draw as dashed price lines. */
  orders?: { price: number; side: string }[];
  /** Position average price → solid blue line. */
  positionAvg?: number | null;
  /** Recent fills → triangles at (time, price). */
  fills?: { ts: number; price: number; side: string }[];
}

export type SubIndicator = "none" | "macd" | "rsi" | "kdj";

export interface ChartIndicators {
  /** Moving averages (MA7 / MA25 / MA99). */
  ma?: boolean;
  /** Exponential moving averages (EMA7 / EMA25 / EMA99). */
  ema?: boolean;
  /** Bollinger Bands (20, 2σ). */
  boll?: boolean;
  /** Logarithmic price axis. */
  log?: boolean;
  /** Lower sub-chart indicator. */
  sub?: SubIndicator;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Crosshair time label, AiCoin-style: `2026-06-12 18:10`. */
const fmtTs = (v: number) => {
  const d = new Date(v);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const MA_DEFS = [
  { period: 7, color: "#eab308" },
  { period: 25, color: "#ec4899" },
  { period: 99, color: "#8b5cf6" },
];
const EMA_DEFS = [
  { period: 7, color: "#22d3ee" },
  { period: 25, color: "#f97316" },
  { period: 99, color: "#a3e635" },
];

/** Simple moving average; positions before the window are null (gap). */
function sma(xs: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= period) sum -= xs[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Exponential moving average (seeded with the first value). */
function ema(xs: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = xs[0] ?? 0;
  for (let i = 0; i < xs.length; i++) {
    prev = i === 0 ? xs[0] : xs[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function boll(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const m = mid[i];
    if (m == null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

/** MACD(12,26,9): DIF, DEA, histogram. */
function macd(closes: number[]) {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const dif = closes.map((_, i) => fast[i] - slow[i]);
  const dea = ema(dif, 9);
  const hist = dif.map((d, i) => (d - dea[i]) * 2);
  return { dif, dea, hist };
}

/** RSI(14) with simple rolling averages. */
function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [null];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      avgGain += g;
      avgLoss += l;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
      } else out.push(null);
    } else {
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      out.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return out;
}

/** KDJ(9,3,3). */
function kdj(highs: number[], lows: number[], closes: number[], n = 9) {
  const K: number[] = [];
  const D: number[] = [];
  const J: number[] = [];
  let k = 50;
  let d = 50;
  for (let i = 0; i < closes.length; i++) {
    const lo = Math.min(...lows.slice(Math.max(0, i - n + 1), i + 1));
    const hi = Math.max(...highs.slice(Math.max(0, i - n + 1), i + 1));
    const rsv = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
    K.push(k);
    D.push(d);
    J.push(3 * k - 2 * d);
  }
  return { K, D, J };
}

function CandleChart({
  data,
  height = 560,
  overlays,
  indicators,
  drawMode,
  drawnLines,
  onAddLine,
  onReady,
  onHover,
}: {
  data: Candle | null;
  height?: number | string;
  overlays?: ChartOverlays;
  indicators?: ChartIndicators;
  /** When true, clicking the price grid adds a horizontal line. */
  drawMode?: boolean;
  /** User-drawn horizontal price lines. */
  drawnLines?: number[];
  onAddLine?: (price: number) => void;
  /** Receives the ECharts instance once ready (for screenshot, etc.). */
  onReady?: (inst: any) => void;
  /** Hovered candle index under the crosshair (null when not hovering). */
  onHover?: (index: number | null) => void;
}) {
  const { mode } = useThemeMode();
  const { up: UP, down: DOWN, upRgb, downRgb } = useColors();
  const drawRef = useRef(false);
  drawRef.current = !!drawMode;
  const addRef = useRef(onAddLine);
  addRef.current = onAddLine;
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const dataRef = useRef(data);
  dataRef.current = data;
  // Price-axis tick count, derived from the pane's pixel height (~one line per ~55px)
  // so spacing stays OKX-like regardless of chart size — not a fixed, over-dense number.
  const [priceTicks, setPriceTicks] = useState(9);
  // Last cursor position over the chart (null when the mouse has left).
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  // Crosshair driver bound to the chart instance once it's ready.
  const pointToRef = useRef<((x: number, y: number) => void) | null>(null);
  // Legend on/off state, persisted across data refreshes. MA lines are hidden by
  // default — the MA7/MA25/MA99 labels stay visible and a click toggles each line.
  const legendRef = useRef<Record<string, boolean>>({ MA7: false, MA25: false, MA99: false });
  // Preserve the user's zoom across data refreshes (notMerge rebuilds the option).
  const zoomRef = useRef({ start: 55, end: 100 });
  const keyRef = useRef("");
  const key = `${data?.inst_id}-${data?.bar}`;
  if (key !== keyRef.current) {
    keyRef.current = key;
    zoomRef.current = { start: 55, end: 100 }; // reset zoom when symbol/timeframe changes
  }
  const axisColor = mode === "light" ? "#8a97a5" : "#7d8896";
  const lineColor = mode === "light" ? "#e6e8eb" : "#2a3441";
  const splitColor = mode === "light" ? "#e9edf1" : "#1e2632";

  const candles = data?.candles ?? [];
  const times = candles.map((c) => c[0]);
  // The x-axis is a continuous TIME axis, not category: category-axis dataZoom
  // windows are rounded to whole candles (Ordinal.parse → Math.round), which made
  // wheel-zoom wobble by up to half a bar per tick. A time axis maps percent →
  // pixel continuously, so the zoom anchor stays pinned under the cursor.
  const barMs = times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : 60_000;
  // Padded x-extent (half a bar each side) so edge candles render fully; the
  // invisible pad series below stretch every grid to this same extent.
  const ext0 = times.length ? times[0] - barMs / 2 : 0;
  const ext1 = times.length ? times[times.length - 1] + barMs / 2 : 1;
  // Clock-nice interval ladder used by the custom vertical-gridline overlay below.
  // (ECharts ignores `interval` on time axes, and per-pane auto ticks drift, so we
  // draw the vertical grid lines ourselves — one full-height line across all panes.)
  const NICE_MS = [60e3, 3 * 60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 4 * 3600e3, 6 * 3600e3, 12 * 3600e3, 86400e3, 2 * 86400e3, 7 * 86400e3, 14 * 86400e3, 30 * 86400e3];
  const ohlc = candles.map((c) => [c[0], c[1], c[4], c[3], c[2]]);
  const volumes = candles.map((c) => ({
    value: [c[0], c[5]],
    itemStyle: { color: c[4] >= c[1] ? `rgba(${upRgb},0.5)` : `rgba(${downRgb},0.5)` },
  }));

  const closes = candles.map((c) => c[4]);
  const highs = candles.map((c) => c[2]);
  const lows = candles.map((c) => c[3]);
  const sub = indicators?.sub && indicators.sub !== "none" ? indicators.sub : null;
  // Pair indicator values with their candle timestamps (time-axis series data).
  const tv = (xs: (number | null)[]) => xs.map((v, i) => [times[i], v]);

  const maSeries = indicators?.ma
    ? MA_DEFS.map((d) => ({ name: `MA${d.period}`, type: "line", showSymbol: false, data: tv(sma(closes, d.period)), lineStyle: { width: 1, color: d.color }, z: 3 }))
    : [];
  const emaSeries = indicators?.ema
    ? EMA_DEFS.map((d) => ({ name: `EMA${d.period}`, type: "line", showSymbol: false, data: tv(ema(closes, d.period)), lineStyle: { width: 1, color: d.color, type: "dashed" }, z: 3 }))
    : [];
  const bb = indicators?.boll ? boll(closes) : null;
  const bollSeries = bb
    ? [
        { name: "BOLL UP", type: "line", showSymbol: false, data: tv(bb.upper), lineStyle: { width: 1, color: "#9aa7b4", type: "dashed", opacity: 0.8 }, z: 2 },
        { name: "BOLL MB", type: "line", showSymbol: false, data: tv(bb.mid), lineStyle: { width: 1, color: "#3b82f6", opacity: 0.9 }, z: 2 },
        { name: "BOLL LB", type: "line", showSymbol: false, data: tv(bb.lower), lineStyle: { width: 1, color: "#9aa7b4", type: "dashed", opacity: 0.8 }, z: 2 },
      ]
    : [];
  const legendNames = [
    ...(indicators?.ma ? MA_DEFS.map((d) => `MA${d.period}`) : []),
    ...(indicators?.ema ? EMA_DEFS.map((d) => `EMA${d.period}`) : []),
    ...(indicators?.boll ? ["BOLL UP", "BOLL MB", "BOLL LB"] : []),
  ];

  const markLineData: any[] = [];
  for (const o of overlays?.orders ?? []) {
    const buy = o.side === "buy";
    markLineData.push({
      yAxis: o.price,
      lineStyle: { color: buy ? UP : DOWN, type: "dashed", width: 1, opacity: 0.7 },
      label: { formatter: buy ? "B" : "S", color: buy ? UP : DOWN, fontSize: 10, position: "insideEndTop" },
    });
  }
  if (overlays?.positionAvg) {
    markLineData.push({
      yAxis: overlays.positionAvg,
      lineStyle: { color: "#3b82f6", type: "solid", width: 1.5 },
      label: { formatter: "AVG", color: "#3b82f6", fontSize: 10, position: "insideEndTop" },
    });
  }
  for (const p of drawnLines ?? []) {
    markLineData.push({
      yAxis: p,
      lineStyle: { color: "#f0a020", type: "solid", width: 1 },
      label: { formatter: p.toLocaleString(undefined, { maximumFractionDigits: 2 }), color: "#f0a020", fontSize: 10, position: "insideEndTop" },
    });
  }

  const fillPoints = (overlays?.fills ?? [])
    .map((f) => {
      if (!times.length) return null;
      const buy = f.side === "buy";
      // Clamp into the padded extent so fills never widen any grid's x range.
      const ts = Math.min(Math.max(f.ts, ext0), ext1);
      return { value: [ts, f.price], symbol: "triangle", symbolRotate: buy ? 0 : 180, symbolSize: 9, itemStyle: { color: buy ? UP : DOWN } };
    })
    .filter(Boolean);

  // ---- Grid layout: 2 grids normally, 3 when a sub-indicator is shown ----
  // Grids tile the plot area with only hairline seams: the crosshair renders
  // only inside a grid, so any gap between panes would be a crosshair dead zone.
  const grids = sub
    ? [
        { left: 16, right: 78, top: 14, height: "60%" },
        { left: 16, right: 78, top: "61.5%", height: "13%" },
        { left: 16, right: 78, top: "75.5%", height: "19%" },
      ]
    : [
        { left: 16, right: 78, top: 14, height: "75%" },
        { left: 16, right: 78, top: "76.5%", height: "18%" },
      ];

  const mkXAxis = (gridIndex: number, showLabel: boolean) => ({
    type: "time",
    gridIndex,
    // Pin every pane to the identical time extent so split-line ticks land at the
    // same x across panes — otherwise per-grid auto-extents drift and the vertical
    // grid lines don't line up between the candle and volume/sub panes.
    min: ext0,
    max: ext1,
    axisLine: { lineStyle: { color: lineColor } },
    axisLabel: showLabel ? { color: axisColor, hideOverlap: true } : { show: false },
    axisTick: { show: false },
    splitLine: { show: false },   // vertical grid drawn manually (see drawGrid) for cross-pane alignment
    // Snapping is done manually in pointTo; the time label renders only under
    // the bottom-most axis (AiCoin-style dark pill at the chart bottom).
    // Per-pane vertical pointer lines are hidden — the full-height crosshair is
    // a single zrender line (see vline in handleReady), so it can never kink
    // at pane seams the way independently-mapped per-axis lines could.
    axisPointer: {
      lineStyle: { opacity: 0 },
      label: showLabel
        ? { formatter: (p: any) => fmtTs(p.value), backgroundColor: mode === "light" ? "#1f2937" : "#4b5563", color: "#fff", fontSize: 11, padding: [3, 6], borderRadius: 2 }
        : { show: false },
    },
  });
  const xAxis = sub
    ? [mkXAxis(0, false), mkXAxis(1, false), mkXAxis(2, true)]
    : [mkXAxis(0, false), mkXAxis(1, true)];

  const subYAxis = sub
    ? [{ gridIndex: 2, scale: true, splitNumber: 2, axisLabel: { color: axisColor, fontSize: 10 }, axisLine: { show: false }, splitLine: { show: false } }]
    : [];
  const yAxis = [
    {
      type: indicators?.log ? "log" : "value",
      scale: true,
      position: "right",
      // Tick count scales with pane height (see priceTicks) → ~50/100 intervals like OKX.
      splitNumber: priceTicks,
      splitLine: { lineStyle: { color: splitColor } },
      axisLabel: { color: axisColor, margin: 10, formatter: (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    },
    // Volume pane: axis labels are hidden, so hide its crosshair label too.
    { gridIndex: 1, scale: true, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false }, axisPointer: { label: { show: false } } },
    ...subYAxis,
  ];

  // ---- Sub-indicator series ----
  const subSeries: any[] = [];
  const subLegend: string[] = [];
  if (sub === "macd") {
    const m = macd(closes);
    subLegend.push("DIF", "DEA", "MACD");
    subSeries.push(
      { name: "MACD", type: "bar", xAxisIndex: 2, yAxisIndex: 2, data: m.hist.map((v, i) => ({ value: [times[i], v], itemStyle: { color: v >= 0 ? `rgba(${upRgb},0.6)` : `rgba(${downRgb},0.6)` } })) },
      { name: "DIF", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(m.dif), lineStyle: { width: 1, color: "#eab308" } },
      { name: "DEA", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(m.dea), lineStyle: { width: 1, color: "#3b82f6" } }
    );
  } else if (sub === "rsi") {
    subLegend.push("RSI14");
    subSeries.push({ name: "RSI14", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(rsi(closes)), lineStyle: { width: 1, color: "#8b5cf6" } });
  } else if (sub === "kdj") {
    const k = kdj(highs, lows, closes);
    subLegend.push("K", "D", "J");
    subSeries.push(
      { name: "K", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(k.K), lineStyle: { width: 1, color: "#eab308" } },
      { name: "D", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(k.D), lineStyle: { width: 1, color: "#3b82f6" } },
      { name: "J", type: "line", xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, data: tv(k.J), lineStyle: { width: 1, color: "#ec4899" } }
    );
  }

  const zoomAxes = sub ? [0, 1, 2] : [0, 1];

  // Invisible points extending every grid's x-extent by half a bar on each side:
  // edge candles render fully, and all grids share one extent so the linked
  // percent-based dataZoom keeps them perfectly aligned.
  const padPoints = times.length ? [[ext0, NaN], [ext1, NaN]] : [];
  const padSeries = grids.map((_, gi) => ({
    name: `_pad${gi}`,
    type: "scatter",
    xAxisIndex: gi,
    yAxisIndex: gi,
    data: padPoints,
    silent: true,
    itemStyle: { opacity: 0 },
  }));

  const option = {
    backgroundColor: "transparent",
    animation: false,
    grid: grids,
    // Crosshair + axis labels, but NO floating tooltip box (the OHLC info line
    // above the chart reflects the hovered candle instead — OKX/AiCoin-style).
    tooltip: { trigger: "axis", showContent: false, axisPointer: { type: "cross" } },
    // triggerOn 'none': the crosshair is driven exclusively by our own
    // dispatches (see pointTo) so every pane shares one snapped pixel.
    axisPointer: { link: [{ xAxisIndex: "all" }], triggerOn: "none" },
    legend: [...legendNames, ...subLegend].length
      ? { data: [...legendNames, ...subLegend], selected: legendRef.current, top: 0, left: 16, itemWidth: 14, itemHeight: 2, textStyle: { color: axisColor, fontSize: 11 } }
      : undefined,
    xAxis,
    yAxis,
    // Native wheel-zoom is disabled — we drive a gentler, fixed-step zoom ourselves
    // (see the mousewheel handler) so it feels stable like OKX/AiCoin. Drag still pans.
    dataZoom: [{ type: "inside", xAxisIndex: zoomAxes, start: zoomRef.current.start, end: zoomRef.current.end, zoomOnMouseWheel: false, moveOnMouseMove: true, moveOnMouseWheel: false }],
    series: [
      { name: "Candle", type: "candlestick", data: ohlc, itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN }, markLine: markLineData.length ? { symbol: "none", silent: true, data: markLineData } : undefined },
      { name: "Volume", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: volumes },
      { name: "Fills", type: "scatter", xAxisIndex: 0, yAxisIndex: 0, data: fillPoints, z: 10 },
      ...maSeries,
      ...emaSeries,
      ...bollSeries,
      ...subSeries,
      ...padSeries,
    ],
  };

  const chartRef = useRef<any>(null);
  // Manual vertical-gridline overlay: full-height lines spanning all panes, so they
  // can't drift between the candle and volume panes the way per-axis split lines do.
  const gridColorRef = useRef(splitColor);
  gridColorRef.current = splitColor;
  const drawGridRef = useRef<(() => void) | null>(null);
  const handleReady = (inst: any) => {
    chartRef.current = inst;
    onReady?.(inst);
    const zr = inst.getZr();
    zr.on("click", (e: any) => {
      if (!drawRef.current || !addRef.current) return;
      const val = inst.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY]);
      if (val && val[1] != null && Number.isFinite(val[1])) addRef.current(val[1]);
    });
    // The full-height vertical crosshair: ONE zrender line spanning all panes
    // (the per-pane x-pointer lines are hidden via lineStyle opacity 0). The
    // panes' y-pointers and the bottom time label still come from ECharts.
    const vline = new graphic.Line({
      silent: true,
      ignore: true,
      zlevel: 1,
      z: 100,
      shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
      style: { stroke: "#9aa3af", lineWidth: 1, lineDash: [4, 4], opacity: 0.9 },
    });
    zr.add(vline);

    // Vertical grid lines: one full-height line per clock-nice tick, positioned from a
    // SINGLE axis (xAxisIndex 0) and spanning all panes — so they're identical across
    // panes by construction (per-axis split lines drifted because ECharts re-nices each
    // time axis independently). Recomputed on every render/zoom/pan via drawGridRef.
    const gridPool: any[] = [];
    const drawGrid = () => {
      const w = inst.getWidth();
      const h = inst.getHeight();
      const tL = inst.convertFromPixel({ xAxisIndex: 0 }, 16);
      const tR = inst.convertFromPixel({ xAxisIndex: 0 }, w - 78);
      if (!Number.isFinite(tL) || !Number.isFinite(tR) || tR <= tL) {
        gridPool.forEach((l) => l.attr("ignore", true));
        return;
      }
      const interval = NICE_MS.find((v) => v >= (tR - tL) / 6) ?? NICE_MS[NICE_MS.length - 1];
      const yTop = 14;
      const yBot = Math.round(h * 0.945);
      let i = 0;
      for (let tk = Math.ceil(tL / interval) * interval; tk <= tR; tk += interval, i++) {
        const px = inst.convertToPixel({ xAxisIndex: 0 }, tk);
        if (!Number.isFinite(px)) continue;
        let line = gridPool[i];
        if (!line) { line = new graphic.Line({ silent: true, z: 0, zlevel: 0 }); zr.add(line); gridPool[i] = line; }
        const cx = Math.round(px) + 0.5;
        line.setShape({ x1: cx, y1: yTop, x2: cx, y2: yBot });
        line.attr({ ignore: false, style: { stroke: gridColorRef.current, lineWidth: 1 } });
      }
      for (; i < gridPool.length; i++) gridPool[i].attr("ignore", true);
    };
    drawGridRef.current = drawGrid;
    drawGrid();

    // Crosshair driver (axisPointer triggerOn:'none'): snap once to the nearest
    // candle, convert back to one pixel, and drive the pointers + vline from it.
    // Also reports the hovered index for the OHLC info line.
    const pointTo = (rawX: number, rawY: number) => {
      const cs = dataRef.current?.candles ?? [];
      if (!cs.length) return;
      const t = inst.convertFromPixel({ xAxisIndex: 0 }, rawX);
      if (t == null || !Number.isFinite(t)) return;
      const t0 = cs[0][0];
      const bar = cs.length > 1 ? (cs[cs.length - 1][0] - t0) / (cs.length - 1) : 1;
      const idx = Math.max(0, Math.min(cs.length - 1, Math.round((t - t0) / bar)));
      hoverRef.current?.(idx);
      const px = inst.convertToPixel({ xAxisIndex: 0 }, cs[idx][0]);
      if (!Number.isFinite(px)) return;
      inst.dispatchAction({ type: "updateAxisPointer", currTrigger: "mousemove", x: px, y: rawY });
      const cx = Math.round(px) + 0.5; // crisp 1px line
      // 14 = grid top; 94.5% = bottom pane's bottom edge (see grid layout).
      vline.setShape({ x1: cx, y1: 14, x2: cx, y2: Math.round(inst.getHeight() * 0.945) });
      vline.attr("ignore", false);
    };
    pointToRef.current = pointTo;
    zr.on("mousemove", (e: any) => {
      lastPosRef.current = { x: e.offsetX, y: e.offsetY };
      pointTo(e.offsetX, e.offsetY);
    });
    zr.on("globalout", () => {
      lastPosRef.current = null;
      hoverRef.current?.(null);
      vline.attr("ignore", true);
      inst.dispatchAction({ type: "updateAxisPointer", currTrigger: "leave" });
    });

    // Rock-stable wheel zoom: the x-axis is a continuous time axis, so percent →
    // pixel is exact (no whole-candle rounding). The focal point (data percent +
    // pixel fraction) is locked once per gesture; wheel events only move a TARGET
    // window size, and a rAF loop eases the actual window toward it (~30%/frame).
    // That coalesces bursty trackpad events into one render per frame and turns
    // notched mouse-wheel ticks into a smooth glide (OKX/AiCoin/TradingView feel),
    // while the locked anchor keeps the cursor's candle pinned with zero drift.
    const SENS = 0.0011; // zoom sensitivity — smaller = steadier
    const G_LEFT = 16;
    const G_RIGHT = 78;
    let aPct: number | null = null; // locked data-percent under the cursor
    let aFrac = 0.5; // locked cursor fraction across the plot area
    let idleTimer: any = 0;
    let targetRange: number | null = null; // window size the animation eases toward
    let lastX = 0;
    let lastY = 0;
    let rafId = 0;
    const step = () => {
      rafId = 0;
      if (targetRange == null || aPct == null) return;
      const cur = zoomRef.current.end - zoomRef.current.start;
      const eased = cur + (targetRange - cur) * 0.3;
      const done = Math.abs(eased - targetRange) < targetRange * 0.002;
      const range = done ? targetRange : eased;
      let ns = aPct - aFrac * range; // keep the locked point at its locked pixel
      let ne = ns + range;
      if (ns < 0) { ns = 0; ne = range; }
      if (ne > 100) { ne = 100; ns = 100 - range; }
      zoomRef.current = { start: ns, end: ne };
      inst.dispatchAction({ type: "dataZoom", start: ns, end: ne });
      // The dataZoom action hides the crosshair until the next mousemove —
      // re-snap it at the cursor so it stays visible (and glued) while zooming.
      pointTo(lastX, lastY);
      drawGrid();
      if (done) targetRange = null;
      else rafId = requestAnimationFrame(step);
    };
    // Release the anchor only after the wheel has gone idle AND the animation
    // has settled, so a tail of easing frames can't outlive its focal point.
    const releaseWhenSettled = () => {
      if (targetRange != null) idleTimer = setTimeout(releaseWhenSettled, 80);
      else aPct = null;
    };
    zr.on("mousewheel", (e: any) => {
      e.event?.preventDefault?.();
      let dy = e.event?.deltaY ?? -(e.wheelDelta ?? 0);
      if (e.event?.deltaMode === 1) dy *= 16;       // lines → px
      else if (e.event?.deltaMode === 2) dy *= 400; // pages → px
      dy = Math.max(-100, Math.min(100, dy));       // clamp inertial spikes
      if (!dy) return;
      const cs = dataRef.current?.candles ?? [];
      const n = cs.length;
      if (n < 3) return;
      const bar = (cs[n - 1][0] - cs[0][0]) / (n - 1) || 1;
      const x0 = cs[0][0] - bar / 2; // padded extent — must match the pad series
      const x1 = cs[n - 1][0] + bar / 2;
      const gridW = inst.getWidth() - G_LEFT - G_RIGHT;
      lastX = e.offsetX;
      lastY = e.offsetY;
      if (aPct == null) {
        // Lock the focal point at the start of the gesture.
        const t = inst.convertFromPixel({ xAxisIndex: 0 }, e.offsetX); // timestamp (continuous)
        if (t == null || !Number.isFinite(t)) return;
        aPct = Math.max(0, Math.min(100, ((t - x0) / (x1 - x0)) * 100));
        aFrac = gridW > 0 ? Math.max(0, Math.min(1, (e.offsetX - G_LEFT) / gridW)) : 0.5;
      }
      const minPct = Math.min(100, ((bar * 8) / (x1 - x0)) * 100); // keep ≥ ~8 candles in view
      const cur = targetRange ?? zoomRef.current.end - zoomRef.current.start;
      targetRange = Math.max(minPct, Math.min(100, cur * Math.exp(dy * SENS)));
      if (!rafId) rafId = requestAnimationFrame(step);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(releaseWhenSettled, 200);
    });
  };
  // Persist zoom on every wheel/drag so the next data refresh keeps the range.
  const onDataZoom = () => {
    const dz = chartRef.current?.getOption?.()?.dataZoom?.[0];
    if (dz && dz.start != null) zoomRef.current = { start: dz.start, end: dz.end };
    drawGridRef.current?.();   // realign the vertical grid after a drag-pan
  };
  // Persist legend on/off so clicks survive the periodic data refresh.
  const onLegendSelect = (p: any) => {
    if (p?.selected) legendRef.current = { ...legendRef.current, ...p.selected };
  };
  // Re-arm the crosshair after every option rebuild (periodic data refresh with
  // notMerge resets the axisPointer, making it vanish under a resting cursor).
  // lazyUpdate flushes on the next frame, so dispatch one frame later.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      drawGridRef.current?.();   // redraw the grid after every option flush (data refresh, theme, resize)
      // Keep the price-axis density ~constant in pixels (OKX-like) as the pane resizes.
      const inst = chartRef.current;
      if (inst) {
        const paneH = inst.getHeight() * (sub ? 0.6 : 0.75);
        // ~50px per line (OKX-like). Constant pixel density → the "nice" interval
        // auto-scales per timeframe: 50 on 1m's tight range, 100/500/… on wider ones.
        const want = Math.max(5, Math.min(16, Math.round(paneH / 50)));
        if (want !== priceTicks) setPriceTicks(want);
      }
      const p = lastPosRef.current;
      if (p) pointToRef.current?.(p.x, p.y);
    });
    return () => cancelAnimationFrame(id);
  });

  return (
    <ReactECharts
      option={option}
      style={{ width: "100%", height, cursor: drawMode ? "crosshair" : "default" }}
      opts={{ renderer: "canvas" }}
      onChartReady={handleReady}
      onEvents={{ datazoom: onDataZoom, legendselectchanged: onLegendSelect }}
      notMerge
      lazyUpdate
    />
  );
}

// Memoized so hover-driven parent re-renders (info line) don't re-init the chart.
export default memo(CandleChart);
