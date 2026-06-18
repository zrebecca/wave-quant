import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, ProfileOutlined, StopOutlined } from "@ant-design/icons";
import { App, Button, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Switch, Table, Tabs, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import api from "@/api/client";
import { LIB_BRIEF, LIB_LABEL_EN, LIB_LABEL_ZH, STRATEGIES, coreIndicatorsOf, okxTabOf, runnerOf, strategyTypeValue } from "@/data/strategyLibrary";
import { CATEGORIES } from "@/data/strategyCategories";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import type { LogEntry, PnlInstrument, StrategyConfig, Trade } from "@/types";
import { DASH, fmtNum, fmtTime, fmtUsd, pnlColor } from "@/utils/format";

const INSTRUMENTS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"];
const BARS = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];
const RUN_STATES = ["RUNNING", "PAUSED", "STARTING"];

// Each strategy_type maps to exactly one OKX-style product tab (okxTabOf), so the
// 66 library types align with OKX's strategy-bot categories.
const rowInTab = (tabKey: string, st: string): boolean => okxTabOf(st) === tabKey;

// OKX-style: no "全部" — one strategy category (see CATEGORIES) is always
// selected, and the table columns adapt to it (each category exposes a
// different metric set). Category → backend strategy_type mapping lives in
// @/data/strategyCategories.
const categoryOf = (type: string) => CATEGORIES.find((c) => c.types.includes(type));

const DIST_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

/** Tiny SVG donut for strategy asset distribution. */
function Donut({ segments, size = 92 }: { segments: { value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-border)" strokeWidth={9} />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
            strokeWidth={9} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

/** Minimal sparkline for the equity card. */
function Spark({ points, color = "var(--up)", w = 150, h = 44 }: { points: number[]; color?: string; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const path = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 2 - ((p - min) / span) * (h - 4)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// Default name for a new strategy: S-<instrument>-<YYYYMMDD-HHmm> (editable).
function genStrategyName(inst: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `S-${inst}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const NEW_DEFAULTS: Partial<StrategyConfig> = {
  strategy_type: "ma_cross", inst_id: "BTC-USDT-SWAP", order_size: 0.5, max_position: 1,
  refresh_interval: 5, is_active: true, spread: 0.001, num_levels: 1,
  ma_fast: 5, ma_slow: 20, ma_bar: "1H", rsi_len: 14, rsi_low: 30, rsi_high: 70, boll_len: 20, boll_k: 2,
  grid_low: 60000, grid_high: 70000, grid_count: 10, tp_pct: 0, sl_pct: 0, entry_taker: true, max_slice: 0,
};

export default function StrategyParams() {
  const { t, lang } = useI18n();
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const { data: rows, refresh } = usePolling(api.listStrategyInstances, 0);
  const { data: bot } = usePolling(api.getBot, 4000);
  const { data: rt } = usePolling(api.getBotRuntime, 5000);
  const [form] = Form.useForm();
  // Run-detail drawer (运行详情 + 运行记录) for a strategy row.
  const [detail, setDetail] = useState<StrategyConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dTrades, setDTrades] = useState<Trade[]>([]);
  const [dPx, setDPx] = useState<number | null>(null);
  const openDetail = (r: StrategyConfig) => {
    setDetail(r);
    setDTrades([]); setDPx(null);
    api.getLogs({ limit: 50 }).then(setLogs).catch(() => setLogs([]));
    api.getTrades(r.inst_id).then(setDTrades).catch(() => setDTrades([]));
    api.getTicker(r.inst_id).then((tk) => setDPx(tk.last_px)).catch(() => setDPx(null));
  };
  const stType = (Form.useWatch("strategy_type", form) ?? "market_maker") as StrategyConfig["strategy_type"];
  // The backend engine this type actually runs on (demo): native where implemented,
  // nearest approximation otherwise. Param fields & categorisation key off this.
  const stRunner = runnerOf(stType);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StrategyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"all" | "running" | "history">("all");
  // One category is always active (OKX-style). Initialised to the first
  // category that actually has instances so the table isn't empty on open.
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [stopFor, setStopFor] = useState<StrategyConfig | null>(null);
  const { data: account } = usePolling(api.getAccount, 8000);
  const { data: equity } = usePolling(() => api.getEquityHistory(60), 15000);
  const { data: pnl } = usePolling(() => api.getPnlSummary(), 12000);

  const typeLabel = lang === "en" ? LIB_LABEL_EN : LIB_LABEL_ZH;
  const isRunning = (name: string) =>
    bot?.strategy_name === name && RUN_STATES.includes(bot?.state ?? "");

  // Strategy-type picker: all 66 library strategies are selectable (searchable).
  // Each maps to a backend engine via runnerOf — native where implemented, nearest
  // demo approximation otherwise — so no option is a dead end.
  const typeOptions = STRATEGIES.map((s) => ({
    value: strategyTypeValue(s),
    label: lang === "en" ? s.nameEn : s.nameZh,
    search: `${s.nameZh} ${s.nameEn} ${s.coreIndicators.join(" ")} ${s.tags.join(" ")}`.toLowerCase(),
  }));

  const paramSummary = (r: StrategyConfig): string => {
    const tail = ` · ${t("strategy.orderSize").split("（")[0]} ${r.order_size} / ${t("strategy.maxPosition").split("（")[0]} ${r.max_position}`;
    const rt = runnerOf(r.strategy_type);
    if (rt === "ma_cross") return `MA ${r.ma_fast}/${r.ma_slow} @${r.ma_bar}${tail}`;
    if (rt === "rsi") return `RSI${r.rsi_len} ${r.rsi_low}/${r.rsi_high} @${r.ma_bar}${tail}`;
    if (rt === "bollinger") return `BOLL ${r.boll_len},${r.boll_k} @${r.ma_bar}${tail}`;
    if (rt === "grid") return `GRID ${r.grid_low}–${r.grid_high} · ${r.grid_count}${t("strat.grids")}${tail}`;
    if (rt === "market_maker") return `${t("strategy.spread").split("（")[0]} ${r.spread} · ${r.num_levels}${tail}`;
    return `@${r.ma_bar}${tail}`;
  };

  // 「核心指标 / 参数」列：只展示该实例真实可配置 / 生效的关键参数（与编辑表单一一对应），
  // 始终带上 K 线周期、下单量、最大持仓。有专属指标字段的类型显示实际值；其余类型若有
  // 具体指标规格（如 MACD(12,26,9)）则带上规格，没有具体规格的（如 DCA 的“每期金额”等
  // 抽象标签）则不显示标签，避免出现非真实值的占位文字。
  const coreParams = (r: StrategyConfig): string => {
    const rt = runnerOf(r.strategy_type);
    const p: string[] = [];
    // 指标 / 策略专属参数（带完整标签，与编辑表单一致）。
    if (rt === "ma_cross") p.push(`${t("strat.lpFast")} ${r.ma_fast}`, `${t("strat.lpSlow")} ${r.ma_slow}`);
    else if (rt === "rsi") p.push(`${t("strat.lpRsiLen")} ${r.rsi_len}`, `${t("strat.lpOversold")} ${r.rsi_low}`, `${t("strat.lpOverbought")} ${r.rsi_high}`);
    else if (rt === "bollinger") p.push(`${t("strat.lpBollLen")} ${r.boll_len}`, `${t("strat.lpBollK")} ${r.boll_k}`);
    else if (rt === "grid") p.push(`${t("strat.lpGridLow")} ${fmtNum(r.grid_low, 0)}`, `${t("strat.lpGridHigh")} ${fmtNum(r.grid_high, 0)}`, `${t("strat.lpGridCount")} ${r.grid_count}`);
    else if (rt === "market_maker") p.push(`${t("strat.lpSpread")} ${r.spread}`, `${t("strat.lpLevels")} ${r.num_levels}`);
    else {
      // 固定参数策略：库里有“具体规格”（含数字/括号）才带上，跳过纯标签。
      const spec = coreIndicatorsOf(r.strategy_type).find((x) => /[\d(]/.test(x));
      if (spec) p.push(spec);
    }
    // 通用配置（所有策略统一，顺序同编辑表单）：下单数量 · K线周期 · 刷新间隔 · 最大持仓。
    p.push(`${t("strat.lpSize")} ${fmtNum(r.order_size, 4)}`);
    if (rt !== "grid" && rt !== "market_maker") p.push(`${t("strat.lpBar")} ${r.ma_bar}`);
    p.push(`${t("strat.lpRefresh")} ${r.refresh_interval}s`);
    p.push(`${t("strat.lpPos")} ${fmtNum(r.max_position, 4)}`);
    return p.join(" · ");
  };

  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        editing ?? { ...NEW_DEFAULTS, name: genStrategyName(NEW_DEFAULTS.inst_id as string) }
      );
    }
  }, [open, editing, form]);

  // When adding, keep the auto-name in sync with the instrument — unless the user
  // has customized it (a manual name won't match the generated S-…-DATE pattern).
  const watchInst = Form.useWatch("inst_id", form);
  useEffect(() => {
    if (!open || editing || !watchInst) return;
    const cur = form.getFieldValue("name") as string | undefined;
    if (!cur || /^S-.+-\d{8}-\d{4}$/.test(cur)) {
      form.setFieldsValue({ name: genStrategyName(watchInst) });
    }
  }, [watchInst, open, editing, form]);

  // Pick the initial category once instances load: first category that has
  // rows, else the first pill. Never overrides a category the user picked.
  useEffect(() => {
    if (typeFilter || !rows?.length) return;
    const withRows = CATEGORIES.find((c) => rows.some((r) => rowInTab(c.key, r.strategy_type)));
    setTypeFilter((withRows ?? CATEGORIES[0]).key);
  }, [rows, typeFilter]);

  const openAdd = () => { setEditing(null); setOpen(true); };
  const openEdit = (r: StrategyConfig) => { setEditing(r); setOpen(true); };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) await api.updateStrategyInstance(editing.name, values);
      else await api.createStrategyInstance(values);
      message.success(t("common.saved"));
      setOpen(false);
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    } finally {
      setSaving(false);
    }
  };

  const run = async (r: StrategyConfig) => {
    try {
      await api.runStrategyInstance(r.name);
      message.success(t("strat.runStarted"));
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const stop = async (r: StrategyConfig, mode: "cancel" | "cancel_close") => {
    setStopFor(null);
    try {
      await api.stopStrategyInstance(r.name, mode);
      message.success(t("strat.stopIt"));
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const del = async (r: StrategyConfig) => {
    try {
      await api.deleteStrategyInstance(r.name);
      message.success(t("common.saved"));
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };

  // Live PnL only exists for the one running strategy (single-bot model).
  const pnlOf = (r: StrategyConfig) => (isRunning(r.name) ? (account?.unrealized_pnl ?? 0) : null);
  const rateOf = (r: StrategyConfig) =>
    isRunning(r.name) && account?.total_equity ? (account.unrealized_pnl / account.total_equity) * 100 : null;

  // Column registry. Each OKX category (CATEGORIES) lists an ordered set of
  // column keys; columns the demo backend can't populate (网格收益/已套利次数/
  // 强平价格…) render a muted placeholder, so the headers still match OKX.
  const phDash = (title: string, key: string, width = 104, align: "right" | "center" = "right") => ({
    title, key, width, align, render: () => <span style={{ color: "var(--app-text-3)" }}>{DASH}</span>,
  });
  const phNotSet = (title: string, key: string, width = 116) => ({
    title, key, width, align: "center" as const, render: () => <span style={{ color: "var(--app-text-3)" }}>{t("strat.dNotSet")}</span>,
  });
  const COL: Record<string, object> = {
    name: { title: t("strat.cName"), dataIndex: "name", width: 172, render: (v: string, r: StrategyConfig) => (
      <div><b>{v}</b><div><Tag style={{ marginTop: 3 }}>{typeLabel[r.strategy_type] ?? r.strategy_type}</Tag></div></div>
    ) },
    inst: { title: t("common.instrument"), dataIndex: "inst_id", width: 124 },
    invested: { title: t("strat.dInvested"), key: "invested", width: 96, align: "right" as const,
      render: (_: unknown, r: StrategyConfig) => <span className="mono">{fmtNum(r.max_position, 4)}</span> },
    range: { title: t("strat.priceRange"), key: "range", width: 130, render: (_: unknown, r: StrategyConfig) =>
      r.grid_low ? <span className="mono">{fmtNum(r.grid_low, 0)}–{fmtNum(r.grid_high, 0)}</span> : DASH },
    gridCount: { title: t("strategy.gridCount"), key: "gc", width: 84, align: "right" as const,
      render: (_: unknown, r: StrategyConfig) => <span className="mono">{r.grid_count ?? DASH}</span> },
    params: { title: t("strat.keyParams"), key: "params", width: 230, render: (_: unknown, r: StrategyConfig) =>
      <span className="mono" style={{ fontSize: 11.5, color: "var(--app-text-2)", whiteSpace: "normal", lineHeight: 1.5 }}>{paramSummary(r)}</span> },
    coreInd: { title: t("strat.cCoreInd"), key: "coreInd", width: 340, render: (_: unknown, r: StrategyConfig) =>
      <span style={{ fontSize: 12, color: "var(--app-text-2)", whiteSpace: "normal", lineHeight: 1.5 }}>{coreParams(r)}</span> },
    orderSize: { title: t("strat.cOrderSize"), key: "orderSize", width: 100, align: "right" as const,
      render: (_: unknown, r: StrategyConfig) => <span className="mono">{fmtNum(r.order_size, 4)}</span> },
    maxPos: { title: t("strat.cMaxPos"), key: "maxPos", width: 100, align: "right" as const,
      render: (_: unknown, r: StrategyConfig) => <span className="mono">{fmtNum(r.max_position, 4)}</span> },
    pnl: { title: t("strat.totalPnl"), key: "pnl", width: 96, align: "right" as const, render: (_: unknown, r: StrategyConfig) => {
      const v = pnlOf(r); return v == null ? DASH : <span className="mono" style={{ color: pnlColor(v) }}>{fmtUsd(v)}</span>; } },
    rate: { title: t("strat.pnlRate"), key: "rate", width: 84, align: "right" as const, render: (_: unknown, r: StrategyConfig) => {
      const v = rateOf(r); return v == null ? DASH : <span className="mono" style={{ color: pnlColor(v) }}>{v >= 0 ? "+" : ""}{fmtNum(v, 2)}%</span>; } },
    status: { title: t("strat.cStatus"), key: "status", width: 88, render: (_: unknown, r: StrategyConfig) =>
      isRunning(r.name) ? <Tag color="green">{t("strat.running")}</Tag> : <Tag>{t("strat.stopped")}</Tag> },
    action: {
      title: t("common.action"), key: "act", width: 208, render: (_: unknown, r: StrategyConfig) => (
        <span style={{ display: "inline-flex", gap: 4 }}>
          {isRunning(r.name)
            ? <Button size="small" danger icon={<StopOutlined />} onClick={() => setStopFor(r)}>{t("strat.stopIt")}</Button>
            : <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => run(r)}>{t("strat.runIt")}</Button>}
          <Button size="small" icon={<ProfileOutlined />} title={t("strat.runRecord")} onClick={() => openDetail(r)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title={t("strat.delConfirm")} okButtonProps={{ danger: true }} onConfirm={() => del(r)} disabled={isRunning(r.name)}>
            <Button size="small" icon={<DeleteOutlined />} disabled={isRunning(r.name)} />
          </Popconfirm>
        </span>
      ),
    },
    // OKX-specific metrics the demo backend does not track → muted placeholders.
    gridPnl: phDash(t("strat.dGridPnl"), "gridPnl"),
    unmatched: phDash(t("strat.dUnmatched"), "unmatched"),
    arbDone: phDash(t("strat.cArbDone"), "arbDone"),
    startCond: phNotSet(t("strat.dPreStart"), "startCond"),
    stopCond: phNotSet(t("strat.dPreStop"), "stopCond"),
    tpsl: phNotSet(t("strat.cTpSl"), "tpsl"),
    leverage: phDash(t("strat.cLeverage"), "leverage", 80),
    direction: phDash(t("strat.cDirection"), "direction", 80, "center"),
    liqPx: phDash(t("strat.cLiqPx"), "liqPx"),
    extraMargin: phDash(t("strat.cExtraMargin"), "extraMargin"),
    totalQty: phDash(t("strat.cTotalQty"), "totalQty"),
    filled: phDash(t("strat.cFilled"), "filled"),
    avgPx: phDash(t("strat.cAvgPx"), "avgPx"),
    period: phDash(t("strat.cPeriod"), "period", 90, "center"),
    timeRange: phDash(t("strat.cTimeRange"), "timeRange", 130, "center"),
    holdAvg: phDash(t("strat.cHoldAvg"), "holdAvg"),
    dcaCount: phDash(t("strat.cDcaCount"), "dcaCount"),
    addCount: phDash(t("strat.cAddCount"), "addCount"),
    signalSrc: phDash(t("strat.cSignalSrc"), "signalSrc", 100, "center"),
    triggers: phDash(t("strat.cTriggers"), "triggers"),
    spreadVal: phDash(t("strat.cSpreadVal"), "spreadVal"),
    arbPair: phDash(t("strat.cArbPair"), "arbPair", 120, "center"),
    reveal: phDash(t("strat.cReveal"), "reveal"),
    dipPx: phDash(t("strat.cDipPx"), "dipPx"),
    tpPx: phDash(t("strat.cTpPx"), "tpPx"),
    coinAmt: phDash(t("strat.cCoinAmt"), "coinAmt"),
    // ── OKX-aligned placeholder columns (headers match OKX 1:1; demo doesn't track values) ──
    apr: phDash(t("strat.cApr"), "apr", 104),
    openSpread: phDash(t("strat.cOpenSpread"), "openSpread", 104),
    arbPnl: phDash(t("strat.cArbPnl"), "arbPnl", 104),
    stakePnl: phDash(t("strat.cStakePnl"), "stakePnl", 104),
    earnPnl: phDash(t("strat.cEarnPnl"), "earnPnl", 104),
    fee: phDash(t("strat.cFee"), "fee", 96),
    borrowInt: phDash(t("strat.cBorrowInt"), "borrowInt", 104),
    cumReturn: phDash(t("strat.cCumReturn"), "cumReturn", 120),
    usedInvest: phDash(t("strat.cUsedInvest"), "usedInvest", 110),
    signalName: phDash(t("strat.cSignalName"), "signalName", 120, "center"),
    availMargin: phDash(t("strat.cAvailMargin"), "availMargin", 110),
    floatPnl: phDash(t("strat.cFloatPnl"), "floatPnl", 104),
    signalTriggers: phDash(t("strat.cSignalTriggers"), "signalTriggers", 120),
    arbApr: phDash(t("strat.cArbApr"), "arbApr", 130),
    totalApr: phDash(t("strat.cTotalApr"), "totalApr", 120),
    addedCount: phDash(t("strat.cAddedCount"), "addedCount", 110),
    maxAddCount: phDash(t("strat.cMaxAddCount"), "maxAddCount", 120),
    avgHoldCost: phDash(t("strat.cAvgHoldCost"), "avgHoldCost", 120),
    doneCycles: phDash(t("strat.cDoneCycles"), "doneCycles", 104),
    liqLev: phDash(t("strat.cLiqLev"), "liqLev", 160, "center"),
    cumDca: phDash(t("strat.cCumDca"), "cumDca", 104),
    coinTarget: phDash(t("strat.cCoinTarget"), "coinTarget", 130, "center"),
    dcaFreq: phDash(t("strat.cDcaFreq"), "dcaFreq", 104, "center"),
    nextBuy: phDash(t("strat.cNextBuy"), "nextBuy", 130, "center"),
    perAmount: phDash(t("strat.cPerAmount"), "perAmount", 104),
    dcaAvg: phDash(t("strat.cDcaAvg"), "dcaAvg", 104),
    balanceMode: phDash(t("strat.cBalanceMode"), "balanceMode", 150, "center"),
    balanceCount: phDash(t("strat.cBalanceCount"), "balanceCount", 120),
    totalFilled: phDash(t("strat.cTotalFilled"), "totalFilled", 104),
    orderTotal: phDash(t("strat.cOrderTotal"), "orderTotal", 104),
    orderPx: phDash(t("strat.cOrderPx"), "orderPx", 104),
    colReduceOnly: phDash(t("strat.cReduceOnly"), "colReduceOnly", 88, "center"),
    curSubOrder: phDash(t("strat.cCurSubOrder"), "curSubOrder", 120, "center"),
    subOrderStatus: phDash(t("strat.cSubOrderStatus"), "subOrderStatus", 150, "center"),
    dualLeg: phDash(t("strat.cDualLeg"), "dualLeg", 100, "center"),
    arbPnlApr: phDash(t("strat.cArbPnlApr"), "arbPnlApr", 130),
    autoReinvest: phDash(t("strat.cAutoReinvest"), "autoReinvest", 120),
    costPx: phDash(t("strat.cCostPx"), "costPx", 96),
    filledAmount: phDash(t("strat.cFilledAmount"), "filledAmount", 104),
    perOrderQty: phDash(t("strat.cPerOrderQty"), "perOrderQty", 110),
    orderPref: phDash(t("strat.cOrderPref"), "orderPref", 104, "center"),
    orderLimitPx: phDash(t("strat.cOrderLimitPx"), "orderLimitPx", 110),
    orderCount: phDash(t("strat.cOrderCount"), "orderCount", 104),
    avgFillPx: phDash(t("strat.cAvgFillPx"), "avgFillPx", 120),
    takerBetter: phDash(t("strat.cTakerBetter"), "takerBetter", 130, "center"),
    takerLimitPx: phDash(t("strat.cTakerLimitPx"), "takerLimitPx", 110),
    timeInterval: phDash(t("strat.cTimeInterval"), "timeInterval", 104, "center"),
  };
  const activeCat = CATEGORIES.find((c) => c.key === typeFilter) ?? CATEGORIES[0];
  const columns = activeCat.cols.filter((k) => k !== "action" || isAdmin).map((k) => COL[k]);

  const runningCount = (rows ?? []).filter((r) => isRunning(r.name)).length;
  const shown = (rows ?? []).filter((r) =>
    (view === "running" ? isRunning(r.name) : view === "history" ? !isRunning(r.name) : true) &&
    rowInTab(activeCat.key, r.strategy_type));

  // Asset-distribution donut weighted by each strategy's max position.
  const dist = (rows ?? []).map((r, i) => ({ name: r.name, value: Number(r.max_position) || 0, color: DIST_COLORS[i % DIST_COLORS.length] }));
  const distTotal = dist.reduce((s, x) => s + x.value, 0);
  const sparkPts = (equity ?? []).map((e) => e.total_equity);
  const upl = account?.unrealized_pnl ?? 0;

  const TYPE_PILLS = CATEGORIES.map((c) => ({
    key: c.key,
    label: lang === "en" ? c.en : c.zh,
    count: (rows ?? []).filter((r) => rowInTab(c.key, r.strategy_type)).length,
  }));

  return (
    <div className="strat-page">
      {/* OKX-style summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="strat-card">
          <div className="strat-card-h">{t("strat.sumEquity")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{account ? fmtUsd(account.total_equity) : DASH}</div>
              <div style={{ fontSize: 12, color: "var(--app-text-3)", marginTop: 4 }}>
                {t("strat.todayPnl")} <span className="mono" style={{ color: pnlColor(upl) }}>{account ? `${upl >= 0 ? "+" : ""}${fmtUsd(upl)}` : DASH}</span>
              </div>
            </div>
            <Spark points={sparkPts} color={upl >= 0 ? "var(--up)" : "var(--down)"} />
          </div>
        </div>
        <div className="strat-card">
          <div className="strat-card-h">{t("strat.distTitle")}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Donut segments={dist} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {dist.length === 0 && <span style={{ color: "var(--app-text-3)", fontSize: 12 }}>{DASH}</span>}
              {dist.slice(0, 4).map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                  <span className="mono" style={{ color: "var(--app-text-3)" }}>{distTotal ? fmtNum((d.value / distTotal) * 100, 0) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="strat-card">
          <div className="strat-card-h">{t("strat.pnlTitle")}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--app-text-3)", marginBottom: 4 }}>
            <span>{t("strat.name")}</span><span>{t("strat.totalPnl")}</span>
          </div>
          {(rows ?? []).slice(0, 4).map((r) => {
            const v = pnlOf(r);
            return (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span className="mono" style={{ color: v == null ? "var(--app-text-3)" : pnlColor(v) }}>{v == null ? DASH : fmtUsd(v)}</span>
              </div>
            );
          })}
          {(rows ?? []).length === 0 && <span style={{ color: "var(--app-text-3)", fontSize: 12 }}>{DASH}</span>}
        </div>
      </div>

      {/* Realized PnL summary (from local fills) */}
      <div className="strat-card" style={{ marginBottom: 16 }}>
        <div className="strat-card-h">{t("strat.pnlSummary")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 26, alignItems: "baseline" }}>
          {([
            { k: "pnl.net", v: pnl ? fmtUsd(pnl.total_net) : DASH, c: pnlColor(pnl?.total_net) },
            { k: "pnl.realized", v: pnl ? fmtUsd(pnl.total_realized) : DASH, c: pnlColor(pnl?.total_realized) },
            { k: "pnl.fees", v: pnl ? fmtUsd(pnl.total_fees) : DASH },
            { k: "pnl.winRate", v: pnl ? `${fmtNum(pnl.win_rate, 1)}%` : DASH },
            { k: "pnl.pf", v: pnl?.profit_factor != null ? fmtNum(pnl.profit_factor, 2) : DASH },
            { k: "pnl.volume", v: pnl ? fmtUsd(pnl.total_volume, 0) : DASH },
            { k: "pnl.trades", v: pnl ? String(pnl.total_trades) : DASH },
          ] as { k: string; v: string; c?: string }[]).map((m) => (
            <div key={m.k}>
              <div style={{ fontSize: 11.5, color: "var(--app-text-3)", marginBottom: 2 }}>{t(m.k)}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: m.c ?? "var(--app-text)" }}>{m.v}</div>
            </div>
          ))}
        </div>
        {!!pnl?.instruments.length && (
          <Table<PnlInstrument>
            rowKey="inst_id"
            size="small"
            pagination={false}
            style={{ marginTop: 12 }}
            dataSource={pnl.instruments}
            columns={[
              { title: t("common.instrument"), dataIndex: "inst_id" },
              { title: t("pnl.realized"), dataIndex: "realized_pnl", align: "right",
                render: (v: number) => <span className="mono" style={{ color: pnlColor(v) }}>{fmtUsd(v)}</span> },
              { title: t("pnl.net"), dataIndex: "net_pnl", align: "right",
                render: (v: number) => <span className="mono" style={{ color: pnlColor(v) }}>{fmtUsd(v)}</span> },
              { title: t("pnl.trades"), dataIndex: "trades", align: "right",
                render: (_: number, r) => <span className="mono">{r.trades} <span style={{ color: "var(--app-text-3)" }}>({r.maker}M/{r.taker}T)</span></span> },
              { title: t("pnl.winRate"), dataIndex: "win_rate", align: "right",
                render: (v: number) => <span className="mono">{fmtNum(v, 1)}%</span> },
            ]}
          />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <Segmented value={view} onChange={(v) => setView(v as "all" | "running" | "history")} options={[
          { label: t("strat.tabAll"), value: "all" },
          { label: `${t("strat.tabRunning")} (${runningCount})`, value: "running" },
          { label: t("strat.tabHistory"), value: "history" },
        ]} />
        <span style={{ flex: 1 }} />
        {isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>{t("strat.add")}</Button>}
      </div>

      {/* 策略类型筛选 pills (OKX) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {TYPE_PILLS.map((p) => (
          <button key={p.key} type="button" className={`strat-pill${typeFilter === p.key ? " on" : ""}`} onClick={() => setTypeFilter(p.key)}>
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      <div className="strat-table">
        <Table<StrategyConfig> rowKey="name" size="small" pagination={false}
          dataSource={shown} columns={columns} tableLayout="fixed" />
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} placement="right" width={440} forceRender
        className="strat-form-drawer"
        title={editing ? t("strat.editTitle") : t("strat.addTitle")}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="primary" loading={saving} onClick={save}>{t("common.save")}</Button>
          </div>
        }>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("strat.name")} rules={[{ required: true }]}>
            <Input disabled={!!editing} placeholder="e.g. btc-ma-1h" />
          </Form.Item>
          <Form.Item name="strategy_type" label={t("strategy.type")} rules={[{ required: true }]}>
            <Select showSearch options={typeOptions}
              filterOption={(input, opt) => ((opt as any)?.search ?? "").includes(input.toLowerCase())} />
          </Form.Item>
          {LIB_BRIEF[stType] && (
            <div className="form-hint">{LIB_BRIEF[stType]}</div>
          )}
          {stRunner !== stType && (
            <div className="form-hint" style={{ opacity: 0.8 }}>{t("strat.demoApprox")}</div>
          )}
          <Form.Item name="inst_id" label={t("common.instrument")} rules={[{ required: true }]}>
            <Select options={INSTRUMENTS.map((i) => ({ value: i, label: i }))} />
          </Form.Item>
          <Form.Item name="order_size" label={t("strategy.orderSize")} rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} step={0.1} />
          </Form.Item>

          {stRunner === "market_maker" && (
            <div className="form-2col">
              <Form.Item name="spread" label={t("strategy.spread")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={0} max={0.5} step={0.0005} />
              </Form.Item>
              <Form.Item name="num_levels" label={t("strategy.numLevels")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={1} max={10} />
              </Form.Item>
            </div>
          )}
          {stRunner === "ma_cross" && (
            <div className="form-2col">
              <Form.Item name="ma_fast" label={t("strategy.maFast")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={1} max={200} />
              </Form.Item>
              <Form.Item name="ma_slow" label={t("strategy.maSlow")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={2} max={400} />
              </Form.Item>
            </div>
          )}
          {stRunner === "rsi" && (<>
            <Form.Item name="rsi_len" label={t("strategy.rsiLen")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={2} max={200} />
            </Form.Item>
            <div className="form-2col">
              <Form.Item name="rsi_low" label={t("strategy.rsiLow")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={1} max={49} />
              </Form.Item>
              <Form.Item name="rsi_high" label={t("strategy.rsiHigh")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={51} max={99} />
              </Form.Item>
            </div>
          </>)}
          {stRunner === "bollinger" && (
            <div className="form-2col">
              <Form.Item name="boll_len" label={t("strategy.bollLen")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={2} max={400} />
              </Form.Item>
              <Form.Item name="boll_k" label={t("strategy.bollK")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={0.5} max={5} step={0.1} />
              </Form.Item>
            </div>
          )}
          {stRunner === "grid" && (<>
            <div className="form-2col">
              <Form.Item name="grid_low" label={t("strategy.gridLow")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={0} step={100} />
              </Form.Item>
              <Form.Item name="grid_high" label={t("strategy.gridHigh")} rules={[{ required: true }]}>
                <InputNumber style={{ width: "100%" }} min={0} step={100} />
              </Form.Item>
            </div>
            <Form.Item name="grid_count" label={t("strategy.gridCount")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={2} max={200} />
            </Form.Item>
          </>)}
          {stRunner !== "market_maker" && stRunner !== "grid" && (
            <Form.Item name="ma_bar" label={t("strategy.maBar")} rules={[{ required: true }]}>
              <Select options={BARS.map((b) => ({ value: b, label: b }))} />
            </Form.Item>
          )}
          {stRunner !== "market_maker" && (
            <div className="form-2col">
              <Form.Item name="tp_pct" label={t("strategy.tpPct")} tooltip={t("strategy.tpslHint")}>
                <InputNumber style={{ width: "100%" }} min={0} max={50} step={0.5} />
              </Form.Item>
              <Form.Item name="sl_pct" label={t("strategy.slPct")} tooltip={t("strategy.tpslHint")}>
                <InputNumber style={{ width: "100%" }} min={0} max={50} step={0.5} />
              </Form.Item>
            </div>
          )}
          {stRunner !== "market_maker" && (
            <div className="form-2col">
              <Form.Item name="entry_taker" label={t("strategy.entryMode")} valuePropName="checked" tooltip={t("strategy.entryModeHint")}>
                <Switch checkedChildren={t("strategy.entryTaker")} unCheckedChildren={t("strategy.entryMaker")} />
              </Form.Item>
              <Form.Item name="max_slice" label={t("strategy.maxSlice")} tooltip={t("strategy.maxSliceHint")}>
                <InputNumber style={{ width: "100%" }} min={0} step={0.1} />
              </Form.Item>
            </div>
          )}
          <div className="form-2col">
            <Form.Item name="refresh_interval" label={t("strategy.refreshInterval")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1} max={3600} />
            </Form.Item>
            <Form.Item name="max_position" label={t("strategy.maxPosition")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} step={0.5} />
            </Form.Item>
          </div>
          <Form.Item name="is_active" label={t("strategy.active")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 策略详情：OKX 式右侧全高抽屉 + 三个 tab */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} placement="right" width={560}
        styles={{ body: { paddingTop: 8 } }}
        title={detail ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{detail.inst_id}</span>
              <Tag style={{ margin: 0 }}>{typeLabel[detail.strategy_type] ?? detail.strategy_type}</Tag>
            </div>
            <div style={{ fontSize: 12, fontWeight: 400, color: "var(--app-text-3)", marginTop: 3 }}>
              {isRunning(detail.name)
                ? <span style={{ color: "var(--up)" }}>● {t("strat.running")}</span>
                : <span>● {t("strat.stopped")}</span>}
              {rt?.started_at ? ` · ${t("bot.startedAt")} ${new Date(rt.started_at).toLocaleTimeString()}` : ""}
            </div>
          </div>
        ) : ""}
        extra={detail ? (
          <Button size="small" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(detail, null, 2)); message.success(t("strat.copied")); }}>
            {t("strat.copyParams")}
          </Button>
        ) : null}>
        {detail && (() => {
          const live = isRunning(detail.name) ? rt : null;
          const isGrid = runnerOf(detail.strategy_type) === "grid";
          const [base, quote] = detail.inst_id.split("-");
          const det = account?.details ?? [];
          const baseD = det.find((d) => d.ccy === base);
          const quoteD = det.find((d) => d.ccy === quote);
          const baseUsd = baseD?.eq_usd ?? 0, quoteUsd = quoteD?.eq_usd ?? 0;
          const holdTot = baseUsd + quoteUsd;
          const holdSegs = [{ name: base, value: baseUsd, color: DIST_COLORS[1] }, { name: quote, value: quoteUsd, color: DIST_COLORS[0] }];
          const pnl = live ? (account?.unrealized_pnl ?? 0) : null;
          const rate = live && account?.total_equity ? (account.unrealized_pnl / account.total_equity) * 100 : null;
          const mid = isGrid ? (Number(detail.grid_low) + Number(detail.grid_high)) / 2 : 0;
          const step = isGrid && detail.grid_count ? (Number(detail.grid_high) - Number(detail.grid_low)) / detail.grid_count : 0;
          const perGridPct = mid ? (step / mid) * 100 : 0;

          const Section = ({ title }: { title: string }) => <div style={{ fontWeight: 600, margin: "16px 0 8px", fontSize: 13 }}>{title}</div>;
          const cardSt: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 10, padding: "14px 16px" };
          const Metric = ({ label, children }: { label: string; children: React.ReactNode }) => (
            <div><div style={{ fontSize: 11.5, color: "var(--app-text-3)", marginBottom: 3 }}>{label}</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{children}</div></div>
          );
          const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 14, columnGap: 12 };

          const basic = (
            <div>
              <Section title={t("strat.earnings")} />
              <div style={{ ...cardSt, ...grid2 }}>
                <Metric label={t("strat.dInvested")}>{fmtNum(detail.max_position, 4)}</Metric>
                <Metric label={t("strat.totalPnl")}>{pnl == null ? DASH : <span style={{ color: pnlColor(pnl) }}>{fmtUsd(pnl)}{rate != null ? ` (${rate >= 0 ? "+" : ""}${fmtNum(rate, 2)}%)` : ""}</span>}</Metric>
                <Metric label={t("strat.dGridPnl")}>{DASH}</Metric>
                <Metric label={t("strat.dUnmatched")}>{pnl == null ? DASH : <span style={{ color: pnlColor(pnl) }}>{fmtUsd(pnl)}</span>}</Metric>
                <Metric label={t("strat.dApr")}>{DASH}</Metric>
                <Metric label={t("strat.dCurPx")}>{dPx != null ? fmtNum(dPx) : DASH}</Metric>
                <Metric label={t("strat.priceRange")}>{isGrid ? `${fmtNum(detail.grid_low, 0)} - ${fmtNum(detail.grid_high, 0)}` : DASH}</Metric>
                <Metric label={t("strat.dArbCount")}>{live ? `${live.today_fills} / ${live.today_fills}` : "0 / 0"}</Metric>
              </div>

              <Section title={t("strat.dHoldings")} />
              <div style={{ ...cardSt, display: "flex", alignItems: "center", gap: 18 }}>
                <Donut segments={holdSegs} />
                <div style={{ flex: 1 }}>
                  {[{ ccy: base, amt: baseD?.eq ?? 0, usd: baseUsd, c: DIST_COLORS[1], dp: 6 }, { ccy: quote, amt: quoteD?.eq ?? 0, usd: quoteUsd, c: DIST_COLORS[0], dp: 2 }].map((h) => (
                    <div key={h.ccy} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: h.c }} />
                      <span style={{ width: 48 }}>{h.ccy}</span>
                      <span className="mono" style={{ flex: 1 }}>{fmtNum(h.amt, h.dp)}</span>
                      <span className="mono" style={{ color: "var(--app-text-3)" }}>{holdTot ? fmtNum((h.usd / holdTot) * 100, 1) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <Section title={t("strat.dInfo")} />
              <div style={{ ...cardSt, ...grid2 }}>
                <Metric label={t("strat.dStratId")}><span style={{ fontSize: 12 }}>{detail.id}</span></Metric>
                <Metric label={t("strategy.type")}>{typeLabel[detail.strategy_type] ?? detail.strategy_type}</Metric>
                <Metric label={t("bot.startedAt")}><span style={{ fontSize: 12 }}>{live?.started_at ? new Date(live.started_at).toLocaleString() : DASH}</span></Metric>
                <Metric label={t("bot.netPosition")}><span style={{ color: pnlColor(live?.net_position) }}>{live ? fmtNum(live.net_position, 4) : DASH}</span></Metric>
              </div>

              <Section title={t("strat.dHistEvents")} />
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--card-border)", borderRadius: 8 }}>
                {logs.filter((l) => ["bot", "order", "risk", "strategy"].includes(l.category)).slice(0, 40).map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--card-border)", fontSize: 12.5 }}>
                    <span className="mono" style={{ color: "var(--app-text-3)", flex: "0 0 auto" }}>{fmtTime(l.created_at)}</span>
                    <Tag style={{ margin: 0 }}>{l.category}</Tag>
                    <span style={{ color: l.level === "ERROR" ? "var(--down)" : l.level === "WARN" || l.level === "WARNING" ? "#f0a020" : "var(--app-text)" }}>{l.message}</span>
                  </div>
                ))}
                {logs.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 20 }} />}
              </div>
            </div>
          );

          const fills = (
            <div>
              <div style={{ ...cardSt, ...grid2, marginTop: 8 }}>
                <Metric label={t("strat.dArbDaily")}>0</Metric>
                <Metric label={t("strat.dFillCount")}>{dTrades.length}</Metric>
                <Metric label={t("strat.dGridArbs")}>0</Metric>
                <Metric label={t("strat.dGridPnl")}>0</Metric>
              </div>
              <Section title={t("orders.trades")} />
              <Table<Trade> rowKey="id" size="small" pagination={{ pageSize: 10, size: "small" }} dataSource={dTrades}
                locale={{ emptyText: t("orders.noFills") }}
                columns={[
                  { title: t("common.time"), dataIndex: "created_at", render: (v) => <span className="mono">{fmtTime(v)}</span> },
                  { title: t("common.side"), dataIndex: "side", width: 60, render: (v) => <Tag color={v === "buy" ? "green" : "red"}>{v.toUpperCase()}</Tag> },
                  { title: t("orders.fillPx"), dataIndex: "fill_px", align: "right", render: (v) => <span className="mono">{fmtNum(v)}</span> },
                  { title: t("orders.fillSz"), dataIndex: "fill_sz", align: "right", render: (v) => <span className="mono">{fmtNum(v, 6)}</span> },
                  { title: t("orders.fee"), dataIndex: "fee", align: "right", render: (v, r) => <span className="mono">{v != null ? `${fmtNum(v, 6)} ${r.fee_ccy ?? ""}` : DASH}</span> },
                ]} />
            </div>
          );

          const detailTab = (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 12px", fontWeight: 600 }}>
                {detail.inst_id} <Tag>{typeLabel[detail.strategy_type] ?? detail.strategy_type}</Tag>
                {dPx != null && <span className="mono" style={{ color: "var(--up)" }}>{fmtNum(dPx)}</span>}
              </div>
              <div style={{ ...cardSt, ...grid2 }}>
                {isGrid ? (<>
                  <Metric label={t("strat.priceRange")}>{fmtNum(detail.grid_low, 0)} - {fmtNum(detail.grid_high, 0)}</Metric>
                  <Metric label={t("strategy.gridCount")}>{detail.grid_count}</Metric>
                  <Metric label={t("strat.dPerGridQty")}>{fmtNum(detail.order_size, 6)} {base}</Metric>
                  <Metric label={t("strat.dPerGridPct")}>{perGridPct ? `~${fmtNum(perGridPct, 2)}%` : DASH}</Metric>
                  <Metric label={t("strat.dGridMode")}>{t("strat.dArith")}</Metric>
                  <Metric label={t("strategy.maxPosition")}>{fmtNum(detail.max_position, 4)}</Metric>
                </>) : (<>
                  <Metric label={t("strategy.orderSize")}>{fmtNum(detail.order_size, 4)}</Metric>
                  <Metric label={t("strategy.maxPosition")}>{fmtNum(detail.max_position, 4)}</Metric>
                  <Metric label={t("strat.keyParams")}><span style={{ fontSize: 12 }}>{paramSummary(detail).split(" · ")[0]}</span></Metric>
                  <Metric label={t("strategy.refreshInterval")}>{detail.refresh_interval}s</Metric>
                </>)}
              </div>
              <div style={{ ...cardSt, ...grid2, marginTop: 12 }}>
                <Metric label={t("strat.dPreStart")}>{t("strat.dNotSet")}</Metric>
                <Metric label={t("strat.dPreStop")}>{t("strat.dNotSet")}</Metric>
                <Metric label={t("strat.dTp")}>{DASH}</Metric>
                <Metric label={t("strat.dSl")}>{DASH}</Metric>
              </div>
            </div>
          );

          return (
            <Tabs defaultActiveKey="basic" items={[
              { key: "basic", label: t("strat.dBasic"), children: basic },
              { key: "fills", label: t("orders.trades"), children: fills },
              { key: "detail", label: t("strat.dStratDetail"), children: detailTab },
            ]} />
          );
        })()}
      </Drawer>

      {/* 停止策略：停止并卖出 / 停止但不卖出（OKX 式二选） */}
      <Modal open={!!stopFor} onCancel={() => setStopFor(null)} footer={null} width={460}
        title={stopFor ? t("strat.stopTitle", { name: stopFor.name }) : ""}>
        {stopFor && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button type="button" className="strat-stop-opt" onClick={() => stop(stopFor, "cancel_close")}>
              <div style={{ fontWeight: 600 }}>{t("strat.stopSell")}</div>
              <div style={{ fontSize: 12, color: "var(--app-text-3)", marginTop: 4 }}>{t("strat.stopSellDesc")}</div>
            </button>
            <button type="button" className="strat-stop-opt" onClick={() => stop(stopFor, "cancel")}>
              <div style={{ fontWeight: 600 }}>{t("strat.stopKeep")}</div>
              <div style={{ fontSize: 12, color: "var(--app-text-3)", marginTop: 4 }}>{t("strat.stopKeepDesc")}</div>
            </button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("strat.stopNote")}</Typography.Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
