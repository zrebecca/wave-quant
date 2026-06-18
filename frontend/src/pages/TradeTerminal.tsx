import { CameraOutlined, EditOutlined, LeftOutlined, ProfileOutlined, RightOutlined, SwapOutlined } from "@ant-design/icons";
import { Segmented, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "@/api/client";
import BottomPanel from "@/components/BottomPanel";
import CandleChart, { type ChartIndicators, type SubIndicator } from "@/components/CandleChart";
import OrderBookPanel from "@/components/OrderBookPanel";
import OrderEntryPanel from "@/components/OrderEntryPanel";
import WatchlistPanel from "@/components/WatchlistPanel";
import GlobalHeader from "@/components/terminal/GlobalHeader";
import PrimarySidebar from "@/components/terminal/PrimarySidebar";
import StatusFooter from "@/components/terminal/StatusFooter";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useFiat } from "@/store/PrefsContext";
import { useThemeMode } from "@/store/ThemeContext";
import { useWs } from "@/store/WsContext";
import { DASH, fmtNum } from "@/utils/format";

const BARS = ["1m", "5m", "15m", "30m", "1H", "2H", "4H", "1D", "1W"];

/** Compact label/value cell for the market summary bar. */
function HCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 56 }}>
      <span style={{ fontSize: 10, color: "var(--app-text-3)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: color ?? "var(--app-text)" }}>{value}</span>
    </div>
  );
}

/** Indicator toggle pill. */
function Tool({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className={`chart-tool${on ? " on" : ""}`} onClick={onClick}>{children}</button>;
}

/**
 * Full-bleed professional trading terminal (AiCoin-density): global header, 48px icon
 * rail, and a 4-column workspace (market · chart+bottom · order · book) filling the
 * viewport, plus a status bar. All wired to the OKX demo backend; own branding.
 */
export default function TradeTerminal() {
  const { t } = useI18n();
  const [inst, setInst] = useState("BTC-USDT-SWAP");
  const [bar, setBar] = useState("1H");
  const [ind, setInd] = useState<ChartIndicators>({ ma: true, ema: false, boll: false, log: false });
  const [sub, setSub] = useState<SubIndicator>("none");
  const [inject, setInject] = useState<{ price?: number; size?: number; nonce: number }>({ nonce: 0 });
  const [drawMode, setDrawMode] = useState(false);
  const [lines, setLines] = useState<number[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Show/hide the market list, order-book and order-entry panels, persisted.
  const [showMarket, setShowMarket] = useState(() => localStorage.getItem("tk_showMarket") !== "0");
  const [showBook, setShowBook] = useState(() => localStorage.getItem("tk_showBook") !== "0");
  const [showOrder, setShowOrder] = useState(() => localStorage.getItem("tk_showOrder") !== "0");
  useEffect(() => { localStorage.setItem("tk_showMarket", showMarket ? "1" : "0"); }, [showMarket]);
  useEffect(() => { localStorage.setItem("tk_showBook", showBook ? "1" : "0"); }, [showBook]);
  useEffect(() => { localStorage.setItem("tk_showOrder", showOrder ? "1" : "0"); }, [showOrder]);
  // Shortcuts: F9 toggles the order panel (下单面板); Ctrl/^+B toggles the market list (左侧行情).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // e.code is the physical key (independent of the fn/media mapping); check both.
      if (e.key === "F9" || e.code === "F9") { e.preventDefault(); setShowOrder((v) => !v); }
      else if (e.ctrlKey && (e.key === "b" || e.key === "B" || e.code === "KeyB")) { e.preventDefault(); setShowMarket((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const instRef = useRef<any>(null);

  // Resizable column widths (market / order / book), persisted to localStorage.
  const DEFAULT_COLS = { market: 220, order: 250, book: 286 };
  const [cols, setCols] = useState<typeof DEFAULT_COLS>(() => {
    try {
      return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem("tk_cols") || "{}") };
    } catch {
      return DEFAULT_COLS;
    }
  });
  useEffect(() => {
    localStorage.setItem("tk_cols", JSON.stringify(cols));
    // echarts-for-react only auto-resizes on window resize — reflow on column drag.
    instRef.current?.resize?.();
  }, [cols]);
  // Resizable bottom-panel height (drag the chart/panel divider up & down), persisted.
  const DEFAULT_BOTTOM_H = 264;
  const [bottomH, setBottomH] = useState<number>(() => {
    const v = Number(localStorage.getItem("tk_bottomH"));
    return v >= 120 && v <= 900 ? v : DEFAULT_BOTTOM_H;
  });
  useEffect(() => {
    localStorage.setItem("tk_bottomH", String(bottomH));
    instRef.current?.resize?.();
  }, [bottomH]);
  // Drag up → taller panel (dir is implicit: subtract the downward pointer delta).
  const startDragV = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = bottomH;
    const move = (ev: PointerEvent) => {
      setBottomH(Math.max(120, Math.min(900, startH - (ev.clientY - startY))));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "row-resize";
  };
  // dir: +1 when the resized panel is left of the splitter, -1 when right of it.
  const startDrag = (key: keyof typeof DEFAULT_COLS, dir: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = cols[key];
    const move = (ev: PointerEvent) => {
      const w = Math.max(170, Math.min(520, startW + (ev.clientX - startX) * dir));
      setCols((c) => ({ ...c, [key]: w }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
  };
  const { tickers } = useWs();
  const { mode } = useThemeMode();
  // 价格切换: scale 行情 prices for display (orders still use the instrument's real quote ccy).
  const { rate: fxRate } = useFiat();
  const fx = (v: number) => fmtNum(v * fxRate);
  // Prefer the live WS ticker for tracked instruments; fall back to REST polling for
  // any other OKX instrument the user adds to their watchlist.
  const fetchTicker = useCallback(() => api.getTicker(inst), [inst]);
  const { data: restTicker } = usePolling(fetchTicker, 4000, [inst]);
  const live = tickers[inst] ?? (restTicker?.inst_id === inst ? restTicker : undefined);
  // Price captured at the moment a watchlist row is clicked — bridges the gap
  // until the REST poll returns, so the order ticket fills instantly.
  const [picked, setPicked] = useState<{ inst: string; px: number | null } | null>(null);
  const selectInst = useCallback((id: string, px?: number | null) => {
    setPicked({ inst: id, px: px ?? null });
    setInst(id);
  }, []);
  const seedPx = picked?.inst === inst ? picked.px : null;

  const screenshot = () => {
    const inst2 = instRef.current;
    if (!inst2) return;
    const url = inst2.getDataURL({ pixelRatio: 2, backgroundColor: mode === "dark" ? "#0a0d12" : "#ffffff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inst}-${bar}.png`;
    a.click();
  };

  const fetchCandles = useCallback(() => api.getCandles(inst, bar, 200), [inst, bar]);
  const { data: candles } = usePolling(fetchCandles, 15000, [inst, bar]);
  const fetchStats = useCallback(() => api.getCandles(inst, "1H", 24), [inst]);
  const { data: stats } = usePolling(fetchStats, 30000, [inst]);

  const fetchStat = useCallback(() => api.getStats(inst), [inst]);
  const { data: stat } = usePolling(fetchStat, 15000, [inst]);
  const { data: rules } = usePolling(api.getInstrumentRules, 600000);
  const rule = useMemo(() => rules?.find((r) => r.inst_id === inst) ?? null, [rules, inst]);

  // 1s clock (funding countdown + status-bar time).
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((c) => c + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const funding = stat?.next_funding_time ? stat.next_funding_time - Date.now() : null;
  const fundingTxt = funding != null && funding > 0 ? `${Math.floor(funding / 3600000)}h ${Math.floor((funding % 3600000) / 60000)}m` : DASH;

  const pick = (price: number, size: number) => setInject((s) => ({ price, size, nonce: s.nonce + 1 }));

  // OHLC info line follows the crosshair (hovered candle), else the latest candle.
  const ohlc = useMemo(() => {
    const cs = candles?.candles ?? [];
    if (!cs.length) return null;
    const idx = hoverIdx != null && hoverIdx >= 0 && hoverIdx < cs.length ? hoverIdx : cs.length - 1;
    const [, o, h, l, c] = cs[idx];
    return { o, h, l, c, chg: o > 0 ? ((c - o) / o) * 100 : 0, amp: o > 0 ? ((h - l) / o) * 100 : 0 };
  }, [candles, hoverIdx]);

  // Stable props so the memoized chart doesn't re-init on hover-driven re-renders.
  const chartIndicators = useMemo<ChartIndicators>(() => ({ ...ind, sub }), [ind, sub]);
  const onAddLine = useCallback((p: number) => setLines((s) => [...s, p]), []);
  const onChartReady = useCallback((i: any) => (instRef.current = i), []);
  const onHover = useCallback((i: number | null) => setHoverIdx(i), []);

  const d24 = useMemo(() => {
    const cs = stats?.candles ?? [];
    if (!cs.length) return null;
    const open = cs[0][1];
    const high = Math.max(...cs.map((c) => c[2]));
    const low = Math.min(...cs.map((c) => c[3]));
    const lastPx = live?.last_px ?? cs[cs.length - 1][4];
    const chg = open > 0 ? ((lastPx - open) / open) * 100 : 0;
    return { high, low, chg };
  }, [stats, live]);
  const up = (d24?.chg ?? 0) >= 0;

  return (
    <div className="tk-app">
      <GlobalHeader />

      <div className="tk-body">
        <PrimarySidebar />

        <div className="tk-workspace">
          {/* Market list (自选区) — collapsible via the handle / Ctrl+B */}
          {showMarket && (
            <>
              <div className="tk-col" style={{ width: cols.market, flex: "0 0 auto" }}>
                <WatchlistPanel inst={inst} onSelect={selectInst} />
              </div>
              <div className="tk-split" onPointerDown={startDrag("market", 1)} onDoubleClick={() => setCols((c) => ({ ...c, market: 220 }))} />
            </>
          )}

          {/* Center: summary + chart + bottom */}
          <div className="tk-center" style={{ flex: 1, minWidth: 680, position: "relative" }}>
            {/* Collapse/expand handle for the market list (AiCoin) */}
            <Tooltip placement="left" title={
              <span className="tk-rail-tip">{t(showMarket ? "term.collapseMarket" : "term.expandMarket")} <kbd>^</kbd> + <kbd>B</kbd></span>
            }>
              <button type="button" className="tk-mkt-handle"
                aria-label={t(showMarket ? "term.collapseMarket" : "term.expandMarket")}
                onClick={() => setShowMarket((v) => !v)}>
                {showMarket ? <LeftOutlined /> : <RightOutlined />}
              </button>
            </Tooltip>
            <div className="tk-summary">
              <span style={{ fontSize: 14, fontWeight: 700 }}>{inst}</span>
              <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: "16px", padding: "0 5px" }}>{t("common.demoTrading")}</Tag>
              <HCell label={t("dash.last")} value={live?.last_px != null ? fx(live.last_px) : DASH} color={up ? "var(--up)" : "var(--down)"} />
              <HCell label={t("mkt.change24h")} value={d24 ? `${up ? "+" : ""}${fmtNum(d24.chg, 2)}%` : DASH} color={up ? "var(--up)" : "var(--down)"} />
              <HCell label={t("mkt.high24h")} value={d24 ? fx(d24.high) : DASH} />
              <HCell label={t("mkt.low24h")} value={d24 ? fx(d24.low) : DASH} />
              <HCell label={t("dash.vol24h")} value={live?.vol_24h != null ? fmtNum(live.vol_24h, 0) : DASH} />
              <HCell label={t("term.mark")} value={stat?.mark_px != null ? fx(stat.mark_px) : DASH} />
              <HCell label={t("term.index")} value={stat?.index_px != null ? fx(stat.index_px) : DASH} />
              <HCell label={t("term.funding")}
                value={stat?.funding_rate != null ? `${stat.funding_rate >= 0 ? "+" : ""}${fmtNum(stat.funding_rate * 100, 4)}%` : DASH}
                color={stat?.funding_rate != null ? (stat.funding_rate >= 0 ? "var(--up)" : "var(--down)") : undefined} />
              <HCell label={t("term.nextFunding")} value={fundingTxt} />
              <HCell label={t("term.oi")} value={stat?.open_interest != null ? fmtNum(stat.open_interest, 0) : DASH} />
            </div>

            <div className="tk-chart-wrap">
              <div className="chart-toolbar" style={{ padding: "4px 10px" }}>
                <Segmented value={bar} onChange={(v) => setBar(v as string)} options={BARS} size="small" />
                <div style={{ width: 10 }} />
                <Tool on={!!ind.ma} onClick={() => setInd((s) => ({ ...s, ma: !s.ma }))}>MA</Tool>
                <Tool on={!!ind.ema} onClick={() => setInd((s) => ({ ...s, ema: !s.ema }))}>EMA</Tool>
                <Tool on={!!ind.boll} onClick={() => setInd((s) => ({ ...s, boll: !s.boll }))}>BOLL</Tool>
                <Tool on={!!ind.log} onClick={() => setInd((s) => ({ ...s, log: !s.log }))}>{t("chart.log")}</Tool>
                <div style={{ width: 8 }} />
                <Segmented size="small" value={sub} onChange={(v) => setSub(v as SubIndicator)}
                  options={[{ label: t("chart.subOff"), value: "none" }, { label: "MACD", value: "macd" }, { label: "RSI", value: "rsi" }, { label: "KDJ", value: "kdj" }]} />
                <div style={{ width: 8 }} />
                <Tool on={drawMode} onClick={() => setDrawMode((v) => !v)}><EditOutlined /></Tool>
                {lines.length > 0 && <button type="button" className="chart-tool" onClick={() => setLines([])}>{t("chart.clear")}</button>}
                <button type="button" className="chart-tool" onClick={screenshot} title={t("chart.screenshot")}><CameraOutlined /></button>
              </div>
              {ohlc && (
                <div className="ohlc-line mono" style={{ padding: "2px 10px 4px" }}>
                  <span>{t("term.k.open")} <b>{fx(ohlc.o)}</b></span>
                  <span>{t("term.k.high")} <b style={{ color: "var(--up)" }}>{fx(ohlc.h)}</b></span>
                  <span>{t("term.k.low")} <b style={{ color: "var(--down)" }}>{fx(ohlc.l)}</b></span>
                  <span>{t("term.k.close")} <b>{fx(ohlc.c)}</b></span>
                  <span>{t("term.k.chg")} <b style={{ color: ohlc.chg >= 0 ? "var(--up)" : "var(--down)" }}>{ohlc.chg >= 0 ? "+" : ""}{fmtNum(ohlc.chg, 2)}%</b></span>
                  <span>{t("term.k.amp")} <b>{fmtNum(ohlc.amp, 2)}%</b></span>
                </div>
              )}
              <div className="tk-chart-fill">
                <CandleChart data={candles} height="100%" indicators={chartIndicators}
                  drawMode={drawMode} drawnLines={lines} onAddLine={onAddLine}
                  onReady={onChartReady} onHover={onHover} />
              </div>
            </div>

            <div className="tk-split-h" onPointerDown={startDragV} onDoubleClick={() => setBottomH(DEFAULT_BOTTOM_H)} />
            <div className="tk-bottom" style={{ flex: `0 0 ${bottomH}px`, height: bottomH }}>
              <BottomPanel inst={inst} bodyH={bottomH} />
            </div>
          </div>

          {/* Order entry — toggled from the right rail / F9 */}
          {showOrder && (
            <>
              <div className="tk-split" onPointerDown={startDrag("order", -1)} onDoubleClick={() => setCols((c) => ({ ...c, order: 250 }))} />
              <div className="tk-col" style={{ width: cols.order, flex: "0 0 auto" }}>
                <OrderEntryPanel inst={inst} lastPx={live?.last_px ?? seedPx} inject={inject} rule={rule} />
              </div>
            </>
          )}

          {/* Order book + trades (OKX-style integrated market panel) — toggled from the right rail */}
          {showBook && (
            <>
              <div className="tk-split" onPointerDown={startDrag("book", -1)} onDoubleClick={() => setCols((c) => ({ ...c, book: 286 }))} />
              <div className="tk-col" style={{ width: cols.book, flex: "0 0 auto" }}>
                <OrderBookPanel inst={inst} onPick={pick} stat={stat} rule={rule} live={live} />
              </div>
            </>
          )}
        </div>

        {/* Right icon rail: toggle the order-book / order-entry panels (AiCoin) */}
        <nav className="tk-rail-r">
          <Tooltip title={t("term.toggleBook")} placement="left">
            <button type="button" className={`tk-rail-btn${showBook ? " on" : ""}`}
              aria-label={t("term.toggleBook")} onClick={() => setShowBook((v) => !v)}>
              <ProfileOutlined />
            </button>
          </Tooltip>
          <Tooltip placement="left" title={
            <span className="tk-rail-tip">{t("term.toggleOrder")} <kbd>fn</kbd> + <kbd>F9</kbd></span>
          }>
            <button type="button" className={`tk-rail-btn${showOrder ? " on" : ""}`}
              aria-label={t("term.toggleOrder")} onClick={() => setShowOrder((v) => !v)}>
              <SwapOutlined />
            </button>
          </Tooltip>
        </nav>
      </div>

      {/* Status bar (AiCoin-style market metrics; no local clock — header has one) */}
      <StatusFooter inst={inst} stat={stat} />
    </div>
  );
}
