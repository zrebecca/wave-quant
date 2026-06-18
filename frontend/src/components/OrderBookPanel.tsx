import { Dropdown, Select } from "antd";
import { CaretDownOutlined, SettingOutlined } from "@ant-design/icons";
import { useCallback, useMemo, useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useFiat } from "@/store/PrefsContext";
import { useWs } from "@/store/WsContext";
import type { InstrumentRule, InstrumentStat, OrderBookLevel, Ticker } from "@/types";
import { DASH, fmtNum, fmtTime, spreadStats } from "@/utils/format";

// Price aggregation tick options (AiCoin set): 1位小数 / 0位小数 / 1·2·3位整数.
const DEC_OPTS = [
  { value: "0.1", kind: "dec", n: 1 },
  { value: "1", kind: "dec", n: 0 },
  { value: "10", kind: "int", n: 1 },
  { value: "100", kind: "int", n: 2 },
  { value: "1000", kind: "int", n: 3 },
];

// 深度刷新 (gear menu): how often to poll the order book. 实时 = fastest (sec=null).
const REFRESH_OPTS = [
  { key: "rt", sec: null as number | null, ms: 800 },
  { key: "0.5", sec: 0.5, ms: 500 },
  { key: "1", sec: 1, ms: 1000 },
  { key: "2", sec: 2, ms: 2000 },
  { key: "3", sec: 3, ms: 3000 },
  { key: "4", sec: 4, ms: 4000 },
  { key: "5", sec: 5, ms: 5000 },
];
// 盘口深度 (gear menu): how many book levels to request (全量 = OKX max 400).
const DEPTH_OPTS = [
  { key: "20", n: 20 },
  { key: "50", n: 50 },
  { key: "100", n: 100 },
  { key: "200", n: 200 },
  { key: "full", n: 400 },
];
// Rise/fall colours via CSS vars so the 涨跌颜色 setting swaps them globally.
const UP = "var(--up)";
const DOWN = "var(--down)";

// Quantity-column unit: contracts (张) / base coin (BTC) / quote-ccy notional (USDT).
type SizeUnit = "cont" | "coin" | "cost";

/** Decimals implied by a tick like 0.1 → 1. */
function dp(tick: number): number {
  if (tick >= 1) return 0;
  return (tick.toString().split(".")[1] ?? "").length;
}
/** Compact K/M/B for USDT amounts (e.g. 552.134K). */
function abbr(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(3) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(3) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(3) + "K";
  return v.toFixed(3);
}
/** Chinese 万/亿/万亿 for big $ figures. */
function cnUnit(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "万亿";
  if (a >= 1e8) return (v / 1e8).toFixed(3) + "亿";
  if (a >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(2);
}

/** Aggregate raw book levels into price buckets of `tick`. */
function aggregate(levels: OrderBookLevel[], tick: number, side: "bid" | "ask"): OrderBookLevel[] {
  if (!tick) return levels;
  const buckets = new Map<number, number>();
  for (const l of levels) {
    const k = side === "bid" ? Math.floor(l.price / tick) * tick : Math.ceil(l.price / tick) * tick;
    buckets.set(k, (buckets.get(k) ?? 0) + l.size);
  }
  const arr = [...buckets.entries()].map(([price, size]) => ({ price, size }));
  arr.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return arr;
}

/** OKX-style integrated market panel: instrument header + metrics, order book
 *  (价格 / 数量 / 委托额 with per-row depth bars), and the public trade tape. */
export default function OrderBookPanel({ inst, onPick, stat, rule, live }: {
  inst: string;
  onPick?: (price: number, size: number) => void;
  stat?: InstrumentStat | null;
  rule?: InstrumentRule | null;
  live?: Ticker;
}) {
  const { t } = useI18n();
  const { tickers } = useWs();
  const [decStr, setDecStr] = useState("0.1");
  const [view, setView] = useState<"both" | "asks" | "bids">("both");
  const [tradeTab, setTradeTab] = useState<"latest" | "big">("latest");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("cost");
  // Gear menu (深度刷新 / 盘口深度): polling interval + book depth.
  const [refreshKey, setRefreshKey] = useState("rt");
  const [depthKey, setDepthKey] = useState("50");
  const curRefresh = REFRESH_OPTS.find((o) => o.key === refreshKey) ?? REFRESH_OPTS[0];
  const curDepth = DEPTH_OPTS.find((o) => o.key === depthKey) ?? DEPTH_OPTS[1];
  const refreshMs = curRefresh.ms;
  const depthN = curDepth.n;
  const refreshLabel = (o: (typeof REFRESH_OPTS)[number]) => (o.sec == null ? t("ob.realtime") : `${o.sec} S`);
  const depthLabel = (o: (typeof DEPTH_OPTS)[number]) => (o.n >= 400 ? t("ob.full") : t("ob.nLevels", { n: o.n }));

  const fetchBook = useCallback(() => api.getOrderbook(inst, depthN), [inst, depthN]);
  const { data } = usePolling(fetchBook, refreshMs, [inst, depthN]);
  const fetchTrades = useCallback(() => api.getPublicTrades(inst, 60), [inst]);
  const { data: tradesData } = usePolling(fetchTrades, 2000, [inst]);

  const tick = Number(decStr);
  const pxDp = dp(tick);
  const coinPerCt = (rule?.ct_val ?? 1) * (rule?.ct_mult ?? 1);
  const lastPx = tickers[inst]?.last_px ?? live?.last_px ?? null;

  // Notional (USDT) of a contract qty at a price.
  const notion = useCallback((price: number, size: number) => price * size * coinPerCt, [coinPerCt]);

  // Switchable 数量 column. SWAP book size is in contracts (张); coinPerCt → base coin (BTC);
  // ×price → quote-ccy notional. SPOT has no contracts, so 张 is hidden.
  const isSwap = inst.endsWith("SWAP");
  const baseCoin = inst.split("-")[0];
  const quoteCcy = inst.split("-")[1] ?? "USDT";
  // 价格切换 (USD/CNY): convert display-only monetary values; raw prices feed orders unchanged.
  const { fiat, rate, symbol } = useFiat();
  const ccyLabel = fiat === "CNY" ? "CNY" : quoteCcy;
  const sizeUnitSafe: SizeUnit = !isSwap && sizeUnit === "cont" ? "cost" : sizeUnit;
  const unitLabel = (u: SizeUnit) => (u === "cont" ? t("term.cont") : u === "coin" ? baseCoin : ccyLabel);
  const sizeVal = useCallback((price: number, size: number) => {
    if (sizeUnitSafe === "cont") return size;
    if (sizeUnitSafe === "coin") return size * coinPerCt;
    return price * size * coinPerCt * rate;          // cost → fiat notional
  }, [sizeUnitSafe, coinPerCt, rate]);
  const unitItems = (isSwap ? (["cont", "coin", "cost"] as const) : (["coin", "cost"] as const))
    .map((u) => ({ key: u, label: unitLabel(u) }));
  // 数量 column header rendered as a unit-switch dropdown (张/BTC/USDT), like AiCoin.
  // NB: must be an inline function call (not a <Component/>), otherwise the 1.5s polling
  // re-render gives it a new component identity and remounts it — closing the dropdown.
  const renderSizeHeader = () => (
    <Dropdown trigger={["click"]} menu={{
      selectable: true, selectedKeys: [sizeUnitSafe], items: unitItems,
      onClick: ({ key }) => setSizeUnit(key as SizeUnit),
    }}>
      <span className="ob-size-hd" style={{ flex: 1, textAlign: "right", cursor: "pointer", userSelect: "none" }}>
        {t("ob.size")}({unitLabel(sizeUnitSafe)}) <CaretDownOutlined style={{ fontSize: 9 }} />
      </span>
    </Dropdown>
  );

  const aggAsks = useMemo(() => aggregate(data?.asks ?? [], tick, "ask"), [data, tick]);
  const aggBids = useMemo(() => aggregate(data?.bids ?? [], tick, "bid"), [data, tick]);

  const rowCount = view === "both" ? 8 : 17;
  const asks = aggAsks.slice(0, view === "bids" ? 0 : rowCount);
  const bids = aggBids.slice(0, view === "asks" ? 0 : rowCount);

  const maxNot = Math.max(
    1,
    ...asks.map((l) => notion(l.price, l.size)),
    ...bids.map((l) => notion(l.price, l.size)),
  );

  // 委比 / 委差 over the displayed levels (in USDT notional).
  const askNot = asks.reduce((s, l) => s + notion(l.price, l.size), 0);
  const bidNot = bids.reduce((s, l) => s + notion(l.price, l.size), 0);
  const ratio = bidNot + askNot > 0 ? ((bidNot - askNot) / (bidNot + askNot)) * 100 : 0;
  const diff = bidNot - askNot;

  const sp = spreadStats(data?.bids[0]?.price, data?.asks[0]?.price);
  const chgPct = live?.change_24h_pct ?? null;
  const chgAbs = live?.open_24h && lastPx != null ? lastPx - live.open_24h : null;
  const up = (chgPct ?? 0) >= 0;

  // Header metrics.
  const settleTxt = useMemo(() => {
    const nf = stat?.next_funding_time ?? stat?.funding_time;
    if (!nf) return DASH;
    const ms = nf - Date.now();
    if (ms <= 0) return t("term.k.now") || "—";
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    return h > 0 ? `${h}小时${m}分后` : `${m}分钟后`;
  }, [stat, t]);
  const basis = stat?.mark_px != null && stat?.index_px != null ? stat.mark_px - stat.index_px : null;
  const basisPct = basis != null && stat?.index_px ? (basis / stat.index_px) * 100 : null;
  const turnover = live?.vol_ccy_24h ?? null;
  const oiUsd = stat?.open_interest_ccy != null && lastPx != null ? stat.open_interest_ccy * lastPx : null;

  const Metric = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10.5, lineHeight: "18px" }}>
      <span className="ob-metric-lbl">{label}</span>
      <span className="mono" style={{ color: color ?? "var(--app-text)" }}>{value}</span>
    </div>
  );

  // One book side. Asks render highest→lowest (best near the middle); bars grow from the right.
  const Side = ({ rows, side }: { rows: OrderBookLevel[]; side: "ask" | "bid" }) => {
    const color = side === "bid" ? UP : DOWN;
    const rgb = side === "bid" ? "var(--up-rgb)" : "var(--down-rgb)";
    const list = side === "ask" ? [...rows].reverse() : rows;
    return (
      <div className="mono" style={{ fontSize: 11 }}>
        {list.map((l, i) => {
          const nv = notion(l.price, l.size);
          return (
            <div key={i} className="ob-row" onClick={() => onPick?.(l.price, l.size)}
              style={{ position: "relative", display: "flex", alignItems: "center", padding: "0 10px", height: 19, cursor: onPick ? "pointer" : "default" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: `${(nv / maxNot) * 70}%`, background: `rgba(${rgb},0.14)` }} />
              <span style={{ flex: 1.05, color, zIndex: 1 }}>{fmtNum(l.price * rate, pxDp)}</span>
              <span style={{ flex: 1, textAlign: "right", zIndex: 1, color: "var(--app-text)" }}>{abbr(sizeVal(l.price, l.size))}</span>
              <span style={{ flex: 1, textAlign: "right", zIndex: 1, color: "var(--app-text)" }}>{abbr(nv * rate)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const allTrades = tradesData?.trades ?? [];
  const trades = (tradeTab === "big"
    ? allTrades.filter((tr) => notion(tr.price, tr.size) >= 10000)
    : allTrades).slice(0, 30);

  return (
    <div className="ob-panel" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      {/* Instrument header */}
      <div style={{ padding: "10px 10px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{inst.split("-").slice(0, 2).join("/")}{t("term.watch.swap")}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "var(--accent)" }}>OKX ›</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16, marginTop: 8 }}>
          <Metric label={t("ob.toSettle")} value={settleTxt} />
          <Metric label={t("ob.turnover")} value={cnUnit(turnover)} />
          <Metric label={t("ob.fundingRate")}
            value={stat?.funding_rate != null ? `${stat.funding_rate >= 0 ? "+" : ""}${fmtNum(stat.funding_rate * 100, 4)}%` : DASH}
            color={stat?.funding_rate != null ? (stat.funding_rate >= 0 ? UP : DOWN) : undefined} />
          <Metric label={t("ob.oiUsd")} value={cnUnit(oiUsd)} />
          <Metric label={t("ob.basis")}
            value={basis != null ? `${fmtNum(basis, 1)}${basisPct != null ? ` (${basisPct >= 0 ? "+" : ""}${fmtNum(basisPct, 3)}%)` : ""}` : DASH}
            color={basis != null ? (basis >= 0 ? UP : DOWN) : undefined} />
          <Metric label={t("ob.mktCap")} value={DASH} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {[t("ob.alert"), t("ob.faved"), t("ob.strategy"), t("ob.brief")].map((b) => (
            <button key={b} type="button" className="ob-hbtn">{b}</button>
          ))}
        </div>
      </div>

      {/* Toolbar: view modes (都看 / 只看绿 / 只看红) + decimals.
          Rendered inline (not a nested component) so the 1.5s polling re-render
          can't remount the buttons and swallow clicks. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderTop: "1px solid var(--card-border)" }}>
        {(["both", "bids", "asks"] as const).map((m) => (
          <button key={m} type="button" className={`ob-view${view === m ? " on" : ""}`} onClick={() => setView(m)}>
            <span style={{ display: "block", height: 6, background: m === "bids" ? UP : DOWN, borderRadius: "2px 2px 0 0" }} />
            <span style={{ display: "block", height: 6, background: m === "asks" ? DOWN : UP, borderRadius: "0 0 2px 2px" }} />
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <Select size="small" value={decStr} onChange={setDecStr} style={{ width: 88 }}
          className="ob-dec-sel" popupClassName="ob-dec-dd" popupMatchSelectWidth={false}
          options={DEC_OPTS.map((o) => ({ value: o.value, label: t(o.kind === "int" ? "ob.intDigits" : "ob.decimals", { n: o.n }) }))} />
        <Dropdown trigger={["click"]} placement="bottomRight" overlayClassName="ob-cfg"
          menu={{
            selectable: true, multiple: true,
            selectedKeys: [`r:${refreshKey}`, `d:${depthKey}`],
            onClick: ({ key }) => {
              const i = key.indexOf(":");
              const g = key.slice(0, i), k = key.slice(i + 1);
              if (g === "r") setRefreshKey(k);
              else if (g === "d") setDepthKey(k);
            },
            items: [
              {
                key: "refresh", popupClassName: "ob-cfg-sub",
                label: <span className="ob-cfg-row"><span>{t("ob.depthRefresh")}</span><span className="ob-cfg-val">{refreshLabel(curRefresh)}</span></span>,
                children: REFRESH_OPTS.map((o) => ({ key: `r:${o.key}`, label: refreshLabel(o) })),
              },
              {
                key: "depth", popupClassName: "ob-cfg-sub",
                label: <span className="ob-cfg-row"><span>{t("ob.bookDepth")}</span><span className="ob-cfg-val">{depthLabel(curDepth)}</span></span>,
                children: DEPTH_OPTS.map((o) => ({ key: `d:${o.key}`, label: depthLabel(o) })),
              },
            ],
          }}>
          <button type="button" className="ob-cfg-gear" aria-label="settings"><SettingOutlined /></button>
        </Dropdown>
      </div>

      {/* 委比 / 委差 */}
      <div style={{ display: "flex", gap: 18, padding: "5px 10px 3px", fontSize: 11, color: "var(--app-text-3)" }}>
        <span>{t("ob.bidAskRatio")} <b className="mono" style={{ color: ratio >= 0 ? UP : DOWN }}>{ratio >= 0 ? "+" : ""}{fmtNum(ratio, 2)}%</b></span>
        <span>{t("ob.bidAskDiff")} <b className="mono" style={{ color: diff >= 0 ? UP : DOWN }}>{diff >= 0 ? "+" : ""}{abbr(diff * rate)}</b></span>
      </div>

      {/* Column header */}
      <div className="mono" style={{ display: "flex", padding: "2px 10px 3px", fontSize: 10.5, color: "var(--app-text-3)" }}>
        <span style={{ flex: 1.05 }}>{t("ob.price")}({live ? ccyLabel : ""})</span>
        {renderSizeHeader()}
        <span style={{ flex: 1, textAlign: "right" }}>{t("ob.orderValue")}</span>
      </div>

      {view !== "bids" && <Side rows={asks} side="ask" />}

      {/* Mid block */}
      <div style={{ display: "flex", alignItems: "baseline", padding: "6px 10px", borderTop: "1px solid var(--card-border)", borderBottom: "1px solid var(--card-border)" }}>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: up ? UP : DOWN, lineHeight: 1.1 }}>
            {lastPx != null ? fmtNum(lastPx * rate, pxDp) : DASH}
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--app-text-3)" }}>{symbol}{lastPx != null ? fmtNum(lastPx * rate, pxDp) : DASH}</div>
        </div>
        <div className="mono" style={{ textAlign: "right", color: up ? UP : DOWN, fontSize: 11 }}>
          <div>{chgPct != null ? `${up ? "+" : ""}${fmtNum(chgPct, 2)}%` : DASH}</div>
          <div>{chgAbs != null ? `${chgAbs >= 0 ? "+" : ""}${fmtNum(chgAbs * rate, pxDp)}` : DASH}</div>
        </div>
      </div>

      {view !== "asks" && <Side rows={bids} side="bid" />}

      {/* Trades */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 10px 4px", borderTop: "6px solid var(--app-bg-2, rgba(0,0,0,0.03))", marginTop: 4 }}>
        <span className={`ob-ttab${tradeTab === "latest" ? " on" : ""}`} onClick={() => setTradeTab("latest")}>{t("ob.tabLatest")}</span>
        <span className={`ob-ttab${tradeTab === "big" ? " on" : ""}`} onClick={() => setTradeTab("big")}>{t("ob.tabBig")}</span>
      </div>
      <div className="mono" style={{ display: "flex", padding: "2px 10px 3px", fontSize: 10.5, color: "var(--app-text-3)" }}>
        <span style={{ flex: 1.05 }}>{t("ob.price")}({ccyLabel})</span>
        {renderSizeHeader()}
        <span style={{ flex: 1, textAlign: "right" }}>{t("ob.tradeTime")}</span>
      </div>
      <div className="mono" style={{ fontSize: 11 }}>
        {trades.map((tr, i) => (
          <div key={i} className="ob-row" style={{ display: "flex", alignItems: "center", padding: "0 10px", height: 19 }}>
            <span style={{ flex: 1.05, color: tr.side === "buy" ? UP : DOWN }}>{fmtNum(tr.price * rate, pxDp)}</span>
            <span style={{ flex: 1, textAlign: "right", color: "var(--app-text)" }}>{abbr(sizeVal(tr.price, tr.size))}</span>
            <span style={{ flex: 1, textAlign: "right", color: "var(--app-text-3)" }}>{fmtTime(tr.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
