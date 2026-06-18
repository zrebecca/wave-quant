import { useCallback } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useWs } from "@/store/WsContext";
import type { InstrumentStat } from "@/types";
import { DASH, fmtNum, fmtTime } from "@/utils/format";

// Status (connection) green/red — fixed regardless of the 涨跌颜色 setting.
const OK = "#16c784";
const BAD = "#ea3943";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="sf-cell">
      <span className="sf-label">{label}</span>
      {children}
    </span>
  );
}

function Pct({ v, digits = 2 }: { v: number; digits?: number }) {
  return (
    <span className="mono" style={{ color: v >= 0 ? "var(--up)" : "var(--down)" }}>
      {v >= 0 ? "+" : ""}{fmtNum(v, digits)}%
    </span>
  );
}

/** AiCoin-style bottom status bar: connection · F&G index · perp tickers ·
 *  premium · funding · OI · feed time · demo tag. (No local clock — the
 *  header already shows one.) */
export default function StatusFooter({ inst = "BTC-USDT-SWAP", stat: statProp }: { inst?: string; stat?: InstrumentStat | null }) {
  const { t } = useI18n();
  const { tickers, connected, lastTickerTs } = useWs();
  // Pages that already poll stats pass them in; otherwise poll here.
  const fetchStat = useCallback(() => api.getStats(inst), [inst]);
  const { data: polled } = usePolling(statProp === undefined ? fetchStat : async () => null, 15000);
  const stat = statProp !== undefined ? statProp : polled;
  const perps = Object.keys(tickers).sort().slice(0, 2);
  const prem =
    stat?.mark_px != null && stat?.index_px ? ((stat.mark_px - stat.index_px) / stat.index_px) * 100 : null;

  return (
    <div className="tk-status">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span className="sb-dot" style={{ background: connected ? OK : BAD }} />
        <b style={{ color: connected ? OK : BAD }}>{connected ? t("status.normal") : t("status.abnormal")}</b>
      </span>

      {perps.map((id) => {
        const tk = tickers[id];
        if (!tk?.last_px) return null;
        return (
          <Cell key={id} label={`${id.split("-")[0]}/${id.split("-")[1]}`}>
            {tk.change_24h_pct != null && <Pct v={tk.change_24h_pct} />}
            <span className="mono" style={{ color: "var(--app-text)" }}>{fmtNum(tk.last_px)}</span>
          </Cell>
        );
      })}

      {prem != null && stat?.mark_px != null && stat?.index_px != null && (
        <Cell label={`${inst.split("-")[0]} ${t("sf.premium")}`}>
          <Pct v={prem} />
          <span className="mono">{fmtNum(stat.mark_px - stat.index_px, 2)}</span>
        </Cell>
      )}

      {stat?.funding_rate != null && (
        <Cell label={t("term.funding")}>
          <Pct v={stat.funding_rate * 100} digits={4} />
        </Cell>
      )}

      {stat?.open_interest != null && (
        <Cell label={t("term.oi")}>
          <span className="mono">{fmtNum(stat.open_interest, 0)}</span>
        </Cell>
      )}

      <Cell label={t("status.feed")}>
        <span className="mono">{lastTickerTs ? fmtTime(lastTickerTs) : DASH}</span>
      </Cell>

      <div style={{ flex: 1 }} />
      <span className="tk-tag demo">{t("common.demoTrading")}</span>
    </div>
  );
}
