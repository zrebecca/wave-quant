import { Alert } from "antd";
import type { ReactNode } from "react";
import GlobalHeader from "@/components/terminal/GlobalHeader";
import PrimarySidebar from "@/components/terminal/PrimarySidebar";
import StatusFooter from "@/components/terminal/StatusFooter";
import { useI18n } from "@/i18n";
import { useWs } from "@/store/WsContext";
import { fmtTime } from "@/utils/format";

/**
 * Terminal chrome (global header + icon rail + status footer) for regular
 * pages — the same shell as /market, so every module looks consistent.
 */
export default function TerminalShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { connected, lastTickerTs } = useWs();

  return (
    <div className="tk-app">
      <GlobalHeader />
      <div className="tk-body">
        <PrimarySidebar />
        <div className="tk-page">
          {!connected && (
            <Alert
              type="warning"
              showIcon
              banner
              style={{ marginBottom: 12, borderRadius: 8 }}
              message={t("conn.frozen", { time: fmtTime(lastTickerTs) })}
            />
          )}
          <div className="tk-page-inner">{children}</div>
        </div>
      </div>
      <StatusFooter />
    </div>
  );
}
