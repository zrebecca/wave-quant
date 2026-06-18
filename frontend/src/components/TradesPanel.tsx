import { Empty } from "antd";
import { useCallback } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { fmtNum, fmtQty, fmtTime } from "@/utils/format";

/** Recent fills for this account on `inst` (OKX "最新成交" style list). */
export default function TradesPanel({ inst }: { inst: string }) {
  const { t } = useI18n();
  const fetchTrades = useCallback(() => api.getTrades(inst), [inst]);
  const { data } = usePolling(fetchTrades, 5000);

  const rows = (data ?? []).slice(0, 40);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="mono" style={{ display: "flex", padding: "0 12px 6px", fontSize: 11, color: "var(--app-text-3)" }}>
        <span style={{ flex: 1 }}>{t("ob.price")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("ob.size")}</span>
        <span style={{ flex: 1, textAlign: "right" }}>{t("common.time")}</span>
      </div>
      {rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("mkt.noTrades")} style={{ marginTop: 40 }} />
      ) : (
        <div className="mono" style={{ fontSize: 12 }}>
          {rows.map((tr) => {
            const buy = tr.side === "buy";
            return (
              <div key={tr.id} className="ob-row" style={{ display: "flex", alignItems: "center", padding: "0 12px", height: 22 }}>
                <span style={{ flex: 1, color: buy ? "var(--up)" : "var(--down)" }}>{fmtNum(tr.fill_px)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "var(--app-text)" }}>{fmtQty(tr.fill_sz, inst)}</span>
                <span style={{ flex: 1, textAlign: "right", color: "var(--app-text-3)" }}>{fmtTime(tr.ts ?? tr.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
