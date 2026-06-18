import { SearchOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { Input, Modal, Segmented } from "antd";
import { useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import type { Ticker } from "@/types";
import { DASH, fmtNum } from "@/utils/format";

const QUOTES = ["ALL", "USDT", "USD", "BTC", "ETH", "USDC"];

/** Locale-aware compact turnover (e.g. 2.3亿 in zh, 230M in en). */
function fmtBig(v: number | null | undefined): string {
  if (v == null) return DASH;
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

/**
 * "Add to watchlist" picker (AiCoin-style): search + quote filter, every OKX
 * instrument with a star toggle. Favorites are persisted by the parent.
 */
export default function AddWatchlistModal({
  open, onClose, tickers, favs, onToggle,
}: {
  open: boolean;
  onClose: () => void;
  tickers: Ticker[];
  favs: string[];
  onToggle: (inst: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [quote, setQuote] = useState("ALL");
  const favSet = useMemo(() => new Set(favs), [favs]);

  const rows = useMemo(() => {
    let list = tickers;
    if (quote !== "ALL") list = list.filter((r) => r.inst_id.split("-")[1] === quote);
    const kw = q.trim().toLowerCase();
    if (kw) list = list.filter((r) => r.inst_id.toLowerCase().includes(kw) || "okx 欧易".includes(kw));
    // Highest turnover first.
    return [...list].sort((a, b) => (b.vol_ccy_24h ?? 0) - (a.vol_ccy_24h ?? 0)).slice(0, 300);
  }, [tickers, quote, q]);

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={760} title={t("term.addFav")} styles={{ body: { paddingTop: 8 } }}>
      <Input allowClear size="middle" prefix={<SearchOutlined style={{ color: "var(--app-text-3)" }} />}
        placeholder={t("term.addSearch")} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span className="tk-tag">OKX</span>
        <Segmented size="small" value={quote} onChange={(v) => setQuote(v as string)}
          options={QUOTES.map((qc) => ({ label: qc === "ALL" ? t("term.allQuote") : qc, value: qc }))} />
      </div>

      <div className="awl-head">
        <span style={{ width: 28 }} />
        <span style={{ flex: 1.4 }}>{t("term.colPair")}</span>
        <span style={{ flex: 1.4 }}>{t("term.colVenue")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("dash.last")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("term.colChange")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("term.colTurnover")}</span>
      </div>
      <div className="awl-body">
        {rows.map((r) => {
          const [base, q2] = r.inst_id.split("-");
          const swap = r.inst_id.endsWith("-SWAP");
          const chg = r.change_24h_pct ?? null;
          const cUp = (chg ?? 0) >= 0;
          const fav = favSet.has(r.inst_id);
          return (
            <div key={r.inst_id} className={`awl-row${fav ? " fav" : ""}`} onClick={() => onToggle(r.inst_id)} style={{ cursor: "pointer" }}>
              <span style={{ width: 28 }}>
                {fav ? <StarFilled style={{ color: "#f0a020" }} /> : <StarOutlined style={{ color: "var(--app-text-3)" }} />}
              </span>
              <span style={{ flex: 1.4, fontWeight: 600 }}>{base}/{q2}{swap ? ` ${t("term.watch.swap")}` : ""}</span>
              <span style={{ flex: 1.4, color: "var(--app-text-2)", fontSize: 12 }}>OKX{swap ? ` ${q2}${t("term.watch.swap")}` : ""}</span>
              <span className="mono" style={{ flex: 1, textAlign: "right" }}>{fmtNum(r.last_px)}</span>
              <span className="mono" style={{ flex: 1, textAlign: "right", color: chg == null ? "var(--app-text)" : cUp ? "var(--up)" : "var(--down)" }}>
                {chg == null ? DASH : `${cUp ? "+" : ""}${fmtNum(chg, 2)}%`}
              </span>
              <span className="mono" style={{ flex: 1, textAlign: "right", color: "var(--app-text-2)" }}>{fmtBig(r.vol_ccy_24h)}</span>
            </div>
          );
        })}
        {rows.length === 0 && <div className="wl-empty">{t("term.noData")}</div>}
      </div>
    </Modal>
  );
}
