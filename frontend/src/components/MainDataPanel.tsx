import { useCallback } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { DASH, fmtNum, fmtQty } from "@/utils/format";

/**
 * "Main data" tab — first-pass microstructure stats derived purely from the live order
 * book (bid/ask ratio, diff, side volumes). Trade-tape-based active buy/sell and OI
 * deltas need a reliable algorithm and are deferred; we do not fake them.
 */
export default function MainDataPanel({ inst }: { inst: string }) {
  const { t } = useI18n();
  const fetchBook = useCallback(() => api.getOrderbook(inst, 50), [inst]);
  const { data } = usePolling(fetchBook, 2000);

  const bidVol = (data?.bids ?? []).reduce((s, l) => s + l.size, 0);
  const askVol = (data?.asks ?? []).reduce((s, l) => s + l.size, 0);
  const tot = bidVol + askVol;
  const ratio = tot > 0 ? ((bidVol - askVol) / tot) * 100 : null;
  const diff = tot > 0 ? bidVol - askVol : null;

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid var(--card-border)", fontSize: 12.5 }}>
      <span style={{ color: "var(--app-text-2)" }}>{label}</span>
      <span className="mono" style={{ color: color ?? "var(--app-text)" }}>{value}</span>
    </div>
  );

  return (
    <div className="term-panel" style={{ overflowY: "auto" }}>
      <Row label={t("ob.bidAskRatio")} value={ratio != null ? `${fmtNum(ratio, 2)}%` : DASH} color={ratio != null && ratio >= 0 ? "var(--up)" : "var(--down)"} />
      <Row label={t("ob.bidAskDiff")} value={diff != null ? fmtQty(diff, inst) : DASH} color={diff != null && diff >= 0 ? "var(--up)" : "var(--down)"} />
      <Row label={t("term.bidVol")} value={fmtQty(bidVol, inst)} color="var(--up)" />
      <Row label={t("term.askVol")} value={fmtQty(askVol, inst)} color="var(--down)" />
      <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--app-text-3)", lineHeight: 1.6 }}>
        {t("term.mainDataNote")}
      </div>
    </div>
  );
}
