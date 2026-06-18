import {
  DollarOutlined,
  FundOutlined,
  UnorderedListOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { Alert, Card, Col, Empty, Row, Space, Table } from "antd";
import { useCallback, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import api from "@/api/client";
import EquityCurve from "@/components/EquityCurve";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useWs } from "@/store/WsContext";
import type { AccountDetail, Ticker } from "@/types";
import { DASH, fmtNum, fmtQty, fmtTime, fmtUsd, pnlColor } from "@/utils/format";

export default function Dashboard() {
  const { t } = useI18n();
  const { data: account, error, lastUpdated } = usePolling(api.getAccount, 6000);
  const { tickers } = useWs();

  const fetchEquity = useCallback(() => api.getEquityHistory(200), []);
  const { data: equity } = usePolling(fetchEquity, 15000);

  const tickerRows = useMemo<Ticker[]>(() => Object.values(tickers), [tickers]);

  // Period change + peak/trough over the loaded equity window — gives the hero
  // metric and the equity curve some context (up or down? how far it swung).
  const equityStats = useMemo(() => {
    if (!equity || equity.length < 2) return null;
    const vals = equity.map((p) => p.total_equity);
    const first = vals[0];
    const last = vals[vals.length - 1];
    const diff = last - first;
    return {
      diff,
      pct: first ? (diff / first) * 100 : 0,
      peak: Math.max(...vals),
      trough: Math.min(...vals),
    };
  }, [equity]);

  const equityDelta = equityStats && (
    <span style={{ color: pnlColor(equityStats.diff) }}>
      {equityStats.diff >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(equityStats.diff))}
      <span style={{ marginLeft: 6 }}>
        ({equityStats.diff >= 0 ? "+" : "-"}
        {fmtNum(Math.abs(equityStats.pct))}%)
      </span>
    </span>
  );

  // All six account metrics in one compact strip — no wasted card whitespace.
  const metrics: {
    key: string;
    label: string;
    value: number;
    prefix?: string;
    precision: number;
    tone: string;
    icon: ReactNode;
    valueColor?: string;
    delta?: ReactNode;
  }[] = [
    { key: "equity", label: t("dash.totalEquity"), value: account?.total_equity ?? 0, prefix: "$", precision: 2, tone: "#10b981", icon: <DollarOutlined />, delta: equityDelta },
    { key: "avail", label: t("dash.availableBalance"), value: account?.available_balance ?? 0, prefix: "$", precision: 2, tone: "#06b6d4", icon: <WalletOutlined /> },
    { key: "upl", label: t("dash.unrealizedPnl"), value: account?.unrealized_pnl ?? 0, prefix: "$", precision: 2, tone: "#f59e0b", icon: <FundOutlined />, valueColor: pnlColor(account?.unrealized_pnl) },
    { key: "pos", label: t("dash.openPositions"), value: account?.position_count ?? 0, precision: 0, tone: "#0ea5e9", icon: <FundOutlined /> },
    { key: "ord", label: t("dash.openOrders"), value: account?.open_order_count ?? 0, precision: 0, tone: "#14b8a6", icon: <UnorderedListOutlined /> },
    { key: "margin", label: t("dash.marginRatio"), value: account?.margin_ratio ?? 0, precision: 4, tone: "#f472b6", icon: <DollarOutlined /> },
  ];

  return (
    <div>
      <Alert
        type="warning"
        showIcon
        banner
        message={t("dash.banner")}
        style={{ marginBottom: 16 }}
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <div className="section-title">{t("dash.overview")}</div>
      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        <div className="metric-strip">
          {metrics.map((m) => (
            <div className="metric-cell" key={m.key} style={{ "--accent": m.tone } as CSSProperties}>
              <span className="metric-ico">{m.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="metric-label">{m.label}</div>
                <div className="metric-val" style={{ color: m.valueColor }}>
                  {m.prefix && <span className="metric-prefix">{m.prefix}</span>}
                  {m.value.toLocaleString(undefined, {
                    minimumFractionDigits: m.precision,
                    maximumFractionDigits: m.precision,
                  })}
                </div>
                {m.delta && <div className="metric-delta">{m.delta}</div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={16}>
          <Card
            title={t("dash.equityCurve")}
            variant="borderless"
            styles={{ body: { padding: 12 } }}
            extra={
              equityStats && (
                <Space size={18} style={{ fontSize: 12, color: "var(--app-text-3)" }}>
                  <span>
                    {t("dash.periodChange")}{" "}
                    <b className="mono" style={{ fontWeight: 600 }}>{equityDelta}</b>
                  </span>
                  <span>
                    {t("dash.peak")}{" "}
                    <b className="mono" style={{ color: "var(--app-text-2)", fontWeight: 600 }}>{fmtUsd(equityStats.peak)}</b>
                  </span>
                  <span>
                    {t("dash.trough")}{" "}
                    <b className="mono" style={{ color: "var(--app-text-2)", fontWeight: 600 }}>{fmtUsd(equityStats.trough)}</b>
                  </span>
                </Space>
              )
            }
          >
            {equity && equity.length > 1 ? (
              <EquityCurve data={equity} height={240} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("dash.waiting")} style={{ padding: 40 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title={t("assets.title")}
            variant="borderless"
            styles={{ body: { padding: "4px 0" } }}
            extra={<span style={{ fontSize: 11, color: "var(--app-text-3)" }}>{t("common.updated")} {fmtTime(lastUpdated)}</span>}
          >
            <Table<AccountDetail>
              rowKey="ccy"
              size="small"
              pagination={false}
              dataSource={account?.details ?? []}
              locale={{ emptyText: DASH }}
              columns={[
                { title: t("assets.ccy"), dataIndex: "ccy" },
                {
                  title: t("assets.usd"),
                  dataIndex: "eq_usd",
                  align: "right",
                  render: (v) => <span className="mono">{fmtUsd(v)}</span>,
                },
                {
                  title: t("assets.avail"),
                  dataIndex: "avail_bal",
                  align: "right",
                  render: (v, r) => <span className="mono">{fmtQty(v, r.ccy)}</span>,
                },
                {
                  title: t("assets.frozen"),
                  dataIndex: "frozen_bal",
                  align: "right",
                  render: (v, r) => <span className="mono">{fmtQty(v, r.ccy)}</span>,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("dash.liveMarkets")} style={{ marginTop: 24 }} variant="borderless">
        <Table<Ticker>
          rowKey="inst_id"
          size="middle"
          pagination={false}
          dataSource={tickerRows}
          locale={{ emptyText: t("dash.waiting") }}
          columns={[
            { title: t("common.instrument"), dataIndex: "inst_id" },
            {
              title: t("dash.last"),
              dataIndex: "last_px",
              align: "right",
              render: (v) => <span className="mono">{fmtNum(v)}</span>,
            },
            {
              title: t("dash.bid"),
              dataIndex: "bid_px",
              align: "right",
              render: (v) => <span className="mono up">{fmtNum(v)}</span>,
            },
            {
              title: t("dash.ask"),
              dataIndex: "ask_px",
              align: "right",
              render: (v) => <span className="mono down">{fmtNum(v)}</span>,
            },
            {
              title: t("dash.spread"),
              dataIndex: "spread_pct",
              align: "right",
              render: (v) => <span className="mono">{v != null ? `${fmtNum(v, 3)}%` : DASH}</span>,
            },
            {
              title: t("dash.vol24h"),
              dataIndex: "vol_24h",
              align: "right",
              render: (v) => <span className="mono">{fmtUsd(v, 0)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
