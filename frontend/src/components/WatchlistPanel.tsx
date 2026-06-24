import { CaretDownOutlined, CaretUpOutlined, PlusOutlined, PushpinFilled, SearchOutlined } from "@ant-design/icons";
import { App, Dropdown, Input, Segmented } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "@/api/client";
import AddWatchlistModal from "@/components/AddWatchlistModal";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useFiat, usePrefs } from "@/store/PrefsContext";
import { useWs } from "@/store/WsContext";
import type { Ticker } from "@/types";
import { DASH, fmtNum, pnlColor } from "@/utils/format";

type SortKey = "name" | "price" | "change";

/** Coin logo (spothq icon set via CDN), falling back to a lettered badge when missing.
 *  Module-level so the watchlist's polling re-renders don't remount/refetch it. */
function CoinIcon({ symbol }: { symbol: string }) {
  const [err, setErr] = useState(false);
  if (err || !symbol) return <span className="wl-coin wl-coin-fb">{(symbol || "?").slice(0, 1)}</span>;
  return (
    <img className="wl-coin" alt="" loading="lazy" onError={() => setErr(true)}
      src={`https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${symbol.toLowerCase()}.svg`} />
  );
}

const FAV_KEY = "tk_favorites";
const PIN_KEY = "tk_pinned";
const DEFAULT_FAVS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"];

/** Format an OKX instId into a display pair + kind ("BTC-USDT-SWAP" → BTC/USDT · 永续). */
function parsePair(inst: string, t: (k: string) => string) {
  const [base, quote] = inst.split("-");
  const swap = inst.endsWith("-SWAP");
  return { pair: `${base}/${quote}`, quote, kind: swap ? t("term.watch.swap") : t("term.watch.spot"), swap };
}

function Arrow({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  const c = active ? "var(--accent)" : "var(--app-text-3)";
  return dir === "asc" && active ? <CaretUpOutlined style={{ fontSize: 9, color: c }} /> : <CaretDownOutlined style={{ fontSize: 9, color: c }} />;
}

/**
 * Left market / watchlist panel (AiCoin layout). Tabs: favorites (persisted) + spot /
 * contract positions. Two-line rows, sortable header, and an "add to watchlist" picker.
 */
export default function WatchlistPanel({ inst, onSelect }: { inst: string; onSelect: (i: string, px?: number | null) => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { tickers: ws } = useWs();
  const { coinIcons } = usePrefs();
  const { rate: fxRate, symbol: fxSym } = useFiat();
  const [tab, setTab] = useState("fav");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [addOpen, setAddOpen] = useState(false);

  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(FAV_KEY) || "null");
      return Array.isArray(s) && s.length ? s : DEFAULT_FAVS;
    } catch {
      return DEFAULT_FAVS;
    }
  });
  useEffect(() => localStorage.setItem(FAV_KEY, JSON.stringify(favs)), [favs]);
  const toggleFav = useCallback((id: string) => {
    setFavs((f) => {
      const has = f.includes(id);
      message.success(t(has ? "term.favRemoved" : "term.favAdded", { sym: id }));
      return has ? f.filter((x) => x !== id) : [...f, id];
    });
  }, [message, t]);

  // Pinned favorites float to the top (when no column sort is active).
  const [pinned, setPinned] = useState<string[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
      return Array.isArray(s) ? s : [];
    } catch {
      return [];
    }
  });
  useEffect(() => localStorage.setItem(PIN_KEY, JSON.stringify(pinned)), [pinned]);
  const pinSet = useMemo(() => new Set(pinned), [pinned]);

  // Server-side watchlist (per user). The DB is the source of truth; localStorage above
  // is just an instant-render cache / offline fallback. On mount we hydrate from the
  // server; if the user has no row yet we seed it from the current local list (migrating
  // any pre-existing localStorage favorites). After hydration, changes are debounced
  // back to the server.
  const favsRef = useRef(favs);
  favsRef.current = favs;
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const hydrated = useRef(false);
  useEffect(() => {
    let cancelled = false;
    api.getWatchlist()
      .then((wl) => {
        if (cancelled) return;
        if (wl.favorites?.length) {
          setFavs(wl.favorites);
          setPinned(wl.pinned ?? []);
        } else {
          // No server row yet → push the current local list up so it persists.
          api.saveWatchlist({ favorites: favsRef.current, pinned: pinnedRef.current }).catch(() => {});
        }
      })
      .catch(() => {}) // offline / not authed → keep local state
      .finally(() => { if (!cancelled) hydrated.current = true; });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    const id = setTimeout(() => {
      api.saveWatchlist({ favorites: favs, pinned }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [favs, pinned]);

  // Context-menu actions for a favorite row.
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const moveFront = (id: string) => setFavs((f) => [id, ...f.filter((x) => x !== id)]);
  const moveLast = (id: string) => setFavs((f) => [...f.filter((x) => x !== id), id]);
  const removeFav = (id: string) => {
    setFavs((f) => f.filter((x) => x !== id));
    setPinned((p) => p.filter((x) => x !== id));
    message.success(t("term.favRemoved", { sym: id }));
  };
  const rowMenu = (id: string) => ({
    className: "wl-ctx",
    items: [
      { key: "pin", label: t(pinSet.has(id) ? "term.ctxUnpin" : "term.ctxPin"), onClick: () => togglePin(id) },
      { key: "front", label: t("term.ctxFront"), onClick: () => moveFront(id) },
      { key: "last", label: t("term.ctxLast"), onClick: () => moveLast(id) },
      { type: "divider" as const },
      { key: "del", label: t("term.ctxDelete"), danger: true, onClick: () => removeFav(id) },
    ],
  });

  // Full SWAP ticker list — drives both the picker and the favorites display.
  const { data: allSwap } = usePolling(() => api.getAllTickers("SWAP"), 5000);
  const { data: positions } = usePolling(api.getPositions, 5000);
  const isPos = tab === "spotPos" || tab === "contractPos";
  const bySym = useMemo<Record<string, Ticker>>(
    () => Object.fromEntries((allSwap ?? []).map((tk) => [tk.inst_id, tk])),
    [allSwap]
  );

  const rows = useMemo<Ticker[]>(() => {
    let list = favs
      .map((id) => {
        const base = bySym[id];
        return base ? { ...base, last_px: ws[id]?.last_px ?? base.last_px } : null;
      })
      .filter(Boolean) as Ticker[];
    if (q.trim()) list = list.filter((r) => r.inst_id.toLowerCase().includes(q.trim().toLowerCase()));
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const va = sortKey === "name" ? a.inst_id : sortKey === "price" ? a.last_px : a.change_24h_pct ?? 0;
        const vb = sortKey === "name" ? b.inst_id : sortKey === "price" ? b.last_px : b.change_24h_pct ?? 0;
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    } else {
      // No column sort → pinned favorites float to the top (stable within groups).
      list = [...list].sort((a, b) => (pinSet.has(b.inst_id) ? 1 : 0) - (pinSet.has(a.inst_id) ? 1 : 0));
    }
    return list;
  }, [favs, bySym, ws, q, sortKey, sortDir, pinSet]);

  const posRows = useMemo(() => {
    const want = tab === "contractPos";
    return (positions ?? []).filter((p) => Math.abs(p.position) > 0 && p.inst_id.endsWith("-SWAP") === want);
  }, [positions, tab]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <div className="wl">
      <div style={{ padding: "7px 8px 6px" }}>
        <Segmented value={tab} onChange={(v) => setTab(v as string)} size="small" block
          options={[
            { label: t("term.watch.fav"), value: "fav" },
            { label: t("term.watch.spotPos"), value: "spotPos" },
            { label: t("term.watch.contractPos"), value: "contractPos" },
          ]} />
        {!isPos && (
          <Input size="small" allowClear prefix={<SearchOutlined style={{ color: "var(--app-text-3)" }} />}
            placeholder={t("term.search")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 7 }} />
        )}
      </div>

      <div className="wl-head">
        <span className="wl-c-name" onClick={() => !isPos && toggleSort("name")}>{t("term.colName")}{!isPos && <Arrow active={sortKey === "name"} dir={sortDir} />}</span>
        <span className="wl-c-px" onClick={() => !isPos && toggleSort("price")}>{isPos ? t("term.colPos") : t("dash.last")}{!isPos && <Arrow active={sortKey === "price"} dir={sortDir} />}</span>
        <span className="wl-c-chg" onClick={() => !isPos && toggleSort("change")}>{isPos ? t("term.colPnl") : t("term.colChange")}{!isPos && <Arrow active={sortKey === "change"} dir={sortDir} />}</span>
      </div>

      <div className="wl-list">
        {isPos ? (
          posRows.length === 0 ? (
            <div className="wl-empty">{t("term.noPos")}</div>
          ) : posRows.map((p) => {
            const { pair, kind, swap } = parsePair(p.inst_id, t);
            return (
              <div key={`${p.inst_id}-${p.pos_side}`} className={`wl-row${p.inst_id === inst ? " active" : ""}`} onClick={() => onSelect(p.inst_id, p.mark_px)}>
                <div className="wl-c-name">
                  {coinIcons && <CoinIcon symbol={p.inst_id.split("-")[0]} />}
                  <div className="wl-c-text">
                    <div className="wl-pair">{pair}</div>
                    <div className="wl-sub" style={{ color: p.pos_side === "short" ? "var(--down)" : "var(--up)" }}>{p.pos_side.toUpperCase()} · OKX{swap ? ` ${kind}` : ""}</div>
                  </div>
                </div>
                <div className="wl-c-px">
                  <div className="mono" style={{ fontWeight: 600 }}>{fmtNum(p.position, 4)}</div>
                  <div className="mono wl-fiat">{p.mark_px != null ? `${fxSym}${fmtNum(p.mark_px * fxRate)}` : DASH}</div>
                </div>
                <div className="wl-c-chg">
                  <span className="wl-pill" style={{ color: pnlColor(p.upl), background: p.upl >= 0 ? "rgba(var(--up-rgb),.12)" : "rgba(var(--down-rgb),.12)" }}>
                    {p.upl >= 0 ? "+" : ""}{fmtNum(p.upl, 2)}
                  </span>
                </div>
              </div>
            );
          })
        ) : rows.length === 0 ? (
          <div className="wl-empty">{t("term.noFav")}</div>
        ) : rows.map((r) => {
          const { pair, quote, kind, swap } = parsePair(r.inst_id, t);
          const chg = r.change_24h_pct ?? null;
          const cUp = (chg ?? 0) >= 0;
          const color = chg == null ? "var(--app-text)" : cUp ? "var(--up)" : "var(--down)";
          return (
            <Dropdown key={r.inst_id} menu={rowMenu(r.inst_id)} trigger={["contextMenu"]} overlayClassName="wl-ctx">
              <div className={`wl-row${r.inst_id === inst ? " active" : ""}`} onClick={() => onSelect(r.inst_id, r.last_px)}>
                <div className="wl-c-name">
                  {coinIcons && <CoinIcon symbol={r.inst_id.split("-")[0]} />}
                  <div className="wl-c-text">
                    <div className="wl-pair">
                      {pinSet.has(r.inst_id) && <PushpinFilled style={{ color: "#f0a020", fontSize: 10, marginRight: 3 }} />}
                      {pair}
                    </div>
                    <div className="wl-sub">{swap ? `OKX ${quote}${kind}` : "OKX"}</div>
                  </div>
                </div>
                <div className="wl-c-px">
                  <div className="mono" style={{ color, fontWeight: 600 }}>{r.last_px != null ? fmtNum(r.last_px * fxRate) : DASH}</div>
                  <div className="mono wl-fiat">{r.last_px != null ? `${fxSym}${fmtNum(r.last_px * fxRate)}` : DASH}</div>
                </div>
                <div className="wl-c-chg">
                  <span className="wl-pill" style={{ color, background: chg == null ? "transparent" : cUp ? "rgba(var(--up-rgb),.12)" : "rgba(var(--down-rgb),.12)" }}>
                    {chg == null ? DASH : `${cUp ? "+" : ""}${fmtNum(chg, 2)}%`}
                  </span>
                </div>
              </div>
            </Dropdown>
          );
        })}
      </div>

      <div className="wl-foot">
        <button onClick={() => setAddOpen(true)}><PlusOutlined /> {t("term.addFav")}</button>
      </div>

      <AddWatchlistModal open={addOpen} onClose={() => setAddOpen(false)} tickers={allSwap ?? []} favs={favs} onToggle={toggleFav} />
    </div>
  );
}
