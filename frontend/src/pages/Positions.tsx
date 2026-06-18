import { App, Button, Card, Empty, Popconfirm, Table, Tag } from "antd";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useWs } from "@/store/WsContext";
import type { Position } from "@/types";
import { DASH, fmtDuration, fmtNum, fmtQty, fmtUsd, pnlColor } from "@/utils/format";

/** Distance from mark price to liquidation price, as a percentage. */
function distToLiq(p: Position): number | null {
  if (!p.liq_px || !p.mark_px) return null;
  return (Math.abs(p.mark_px - p.liq_px) / p.mark_px) * 100;
}

function distColor(d: number | null): string {
  if (d === null) return "var(--app-text-2)";
  if (d < 5) return "#ea3943";
  if (d < 15) return "#f0a020";
  return "var(--app-text)";
}

export default function Positions() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { lastPrivateTs } = useWs();
  const { data, refresh } = usePolling(api.getPositions, 5000);

  // Refresh on fills pushed over the private channel.
  useEffect(() => {
    if (lastPrivateTs) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPrivateTs]);

  const close = async (p: Position) => {
    try {
      const mgn = p.mgn_mode || (p.inst_id.endsWith("SWAP") ? "cross" : "cash");
      await api.closePosition(p.inst_id, p.pos_side, mgn);
      message.success(t("pos.closing", { inst: p.inst_id }));
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("pos.closeFailed"));
    }
  };

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <Card title={t("pos.title")} variant="borderless">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("pos.empty")}
          style={{ padding: "40px 0" }}
        >
          <Button type="primary" onClick={() => navigate("/bot")}>
            {t("pos.goBot")}
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <Card title={t("pos.title")} variant="borderless">
      <Table<Position>
        rowKey={(r) => `${r.inst_id}-${r.pos_side}`}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1100 }}
        columns={[
          { title: t("common.instrument"), dataIndex: "inst_id", fixed: "left", width: 150 },
          {
            title: t("common.side"),
            dataIndex: "pos_side",
            width: 90,
            render: (v, r) => {
              const long = r.position >= 0;
              return (
                <Tag color={long ? "green" : "red"}>
                  {long ? "▲ " : "▼ "}
                  {(v && v !== "net" ? v : long ? "long" : "short").toUpperCase()}
                </Tag>
              );
            },
          },
          { title: t("common.size"), dataIndex: "position", align: "right", width: 110, render: (v, r) => <span className="mono">{fmtQty(v, r.inst_id)}</span> },
          { title: t("pos.avgPrice"), dataIndex: "avg_px", align: "right", width: 110, render: (v) => <span className="mono">{fmtNum(v)}</span> },
          { title: t("pos.markPrice"), dataIndex: "mark_px", align: "right", width: 110, render: (v) => <span className="mono">{fmtNum(v)}</span> },
          {
            title: t("pos.unrealizedPnl"),
            dataIndex: "upl",
            align: "right",
            width: 120,
            render: (v) => <span className="mono" style={{ color: pnlColor(v) }}>{fmtUsd(v)}</span>,
          },
          {
            title: t("pos.pnlPct"),
            dataIndex: "upl_ratio",
            align: "right",
            width: 90,
            render: (v) => <span className="mono" style={{ color: pnlColor(v) }}>{v != null ? `${fmtNum(v * 100, 2)}%` : DASH}</span>,
          },
          {
            title: t("pos.realizedPnl"),
            dataIndex: "realized_pnl",
            align: "right",
            width: 110,
            render: (v) => <span className="mono" style={{ color: pnlColor(v) }}>{v != null ? fmtUsd(v) : DASH}</span>,
          },
          { title: t("pos.margin"), dataIndex: "margin", align: "right", width: 100, render: (v) => <span className="mono">{v != null ? fmtUsd(v) : DASH}</span> },
          { title: t("pos.mgnMode"), dataIndex: "mgn_mode", width: 90, render: (v) => v ?? DASH },
          { title: t("pos.lever"), dataIndex: "lever", align: "right", width: 70, render: (v) => (v ? `${v}x` : DASH) },
          { title: t("pos.liqPx"), dataIndex: "liq_px", align: "right", width: 110, render: (v) => <span className="mono">{v != null ? fmtNum(v) : DASH}</span> },
          {
            title: t("pos.distLiq"),
            align: "right",
            width: 100,
            render: (_, r) => {
              const d = distToLiq(r);
              return <span className="mono" style={{ color: distColor(d) }}>{d != null ? `${fmtNum(d, 2)}%` : DASH}</span>;
            },
          },
          { title: t("pos.holdTime"), align: "right", width: 90, render: (_, r) => fmtDuration(r.c_time) },
          ...(isAdmin
            ? [
                {
                  title: t("common.action"),
                  align: "center" as const,
                  fixed: "right" as const,
                  width: 100,
                  render: (_: unknown, r: Position) => (
                    <Popconfirm
                      title={t("pos.closeConfirm", { inst: r.inst_id })}
                      description={
                        <div style={{ maxWidth: 260 }}>
                          {t("pos.closeDetail", {
                            inst: r.inst_id,
                            side: r.position >= 0 ? t("common.buy") : t("common.sell"),
                          })}
                          <div style={{ color: "#d48806", marginTop: 4 }}>{t("pos.demoHint")}</div>
                        </div>
                      }
                      okButtonProps={{ danger: true }}
                      onConfirm={() => close(r)}
                    >
                      <Button danger size="small">{t("pos.close")}</Button>
                    </Popconfirm>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}
