import { Card, Col, Input, Row, Segmented, Select, Table, Tag, Tooltip } from "antd";
import { useCallback, useEffect, useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useWs } from "@/store/WsContext";
import type { LogEntry, OperationAudit, RiskEvent } from "@/types";

const levelColor: Record<string, string> = { INFO: "blue", WARN: "gold", WARNING: "gold", ERROR: "red", CRITICAL: "red" };
const catColor: Record<string, string> = {
  order: "cyan",
  trade: "green",
  strategy: "geekblue",
  risk: "volcano",
  bot: "purple",
  system: "default",
  error: "red",
  admin: "magenta",
};

function RunLogs() {
  const { t } = useI18n();
  const [level, setLevel] = useState<string | undefined>();
  const [category, setCategory] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const { lastLog } = useWs();

  const fetcher = useCallback(
    () => api.getLogs({ level, category, search: search || undefined, limit: 300 }),
    [level, category, search]
  );
  const { data, refresh } = usePolling(fetcher, 8000);
  useEffect(() => {
    if (lastLog) refresh();
  }, [lastLog, refresh]);

  return (
    <>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col>
          <Select allowClear placeholder={t("logs.level")} style={{ width: 130 }} value={level} onChange={setLevel}
            options={["INFO", "WARN", "ERROR"].map((v) => ({ value: v, label: v }))} />
        </Col>
        <Col>
          <Select allowClear placeholder={t("logs.category")} style={{ width: 150 }} value={category} onChange={setCategory}
            options={["order", "trade", "strategy", "risk", "bot", "system", "error", "admin"].map((v) => ({ value: v, label: v }))} />
        </Col>
        <Col flex="auto">
          <Input.Search allowClear placeholder={t("logs.search")} onSearch={setSearch}
            onChange={(e) => !e.target.value && setSearch("")} />
        </Col>
      </Row>
      <Table<LogEntry>
        rowKey="id"
        size="small"
        dataSource={data ?? []}
        pagination={{ pageSize: 15 }}
        columns={[
          { title: t("common.time"), dataIndex: "created_at", width: 180, render: (v) => new Date(v).toLocaleString() },
          { title: t("logs.level"), dataIndex: "level", width: 90, render: (v) => <Tag color={levelColor[v] ?? "default"}>{v}</Tag> },
          { title: t("logs.category"), dataIndex: "category", width: 110, render: (v) => <Tag color={catColor[v] ?? "default"}>{v}</Tag> },
          { title: t("logs.message"), dataIndex: "message" },
        ]}
      />
    </>
  );
}

function AuditLogs() {
  const { t } = useI18n();
  const fetcher = useCallback(() => api.getAudits({ limit: 300 }), []);
  const { data } = usePolling(fetcher, 10000);
  return (
    <Table<OperationAudit>
      rowKey="id"
      size="small"
      dataSource={data ?? []}
      pagination={{ pageSize: 15 }}
      columns={[
        { title: t("common.time"), dataIndex: "created_at", width: 180, render: (v) => (v ? new Date(v).toLocaleString() : "--") },
        { title: t("audit.actor"), dataIndex: "actor", width: 120 },
        { title: t("audit.action"), dataIndex: "action", width: 150, render: (v) => <Tag color="geekblue">{v}</Tag> },
        { title: t("audit.target"), dataIndex: "target", width: 130, render: (v) => v ?? "--" },
        { title: t("audit.result"), dataIndex: "result", width: 80, render: (v) => <Tag color={v === "ok" ? "green" : "red"}>{v}</Tag> },
        {
          title: t("audit.change"),
          render: (_, r) => (
            <Tooltip title={`${r.before ?? "--"} → ${r.after ?? "--"}`}>
              <span style={{ color: "var(--app-text-3)", cursor: "help" }}>
                {(r.after ?? r.before ?? "--").slice(0, 60)}
              </span>
            </Tooltip>
          ),
        },
      ]}
    />
  );
}

function RiskEvents() {
  const { t } = useI18n();
  const fetcher = useCallback(() => api.getRiskEvents(200), []);
  const { data } = usePolling(fetcher, 10000);
  return (
    <Table<RiskEvent>
      rowKey="id"
      size="small"
      dataSource={data ?? []}
      pagination={{ pageSize: 15 }}
      columns={[
        { title: t("common.time"), dataIndex: "created_at", width: 180, render: (v) => (v ? new Date(v).toLocaleString() : "--") },
        { title: t("logs.level"), dataIndex: "level", width: 100, render: (v) => <Tag color={levelColor[v] ?? "default"}>{v}</Tag> },
        { title: t("risk.onBreachAction"), dataIndex: "action", width: 120, render: (v) => t(`risk.act.${v}`) || v },
        { title: t("logs.message"), dataIndex: "message" },
      ]}
    />
  );
}

export default function Logs() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"run" | "audit" | "risk">("run");

  // Audit is admin-only on the backend; hide the tab for viewers.
  const options = [
    { label: t("logs.tabRun"), value: "run" },
    ...(isAdmin ? [{ label: t("logs.tabAudit"), value: "audit" }] : []),
    { label: t("logs.tabRisk"), value: "risk" },
  ];

  return (
    <Card
      variant="borderless"
      title={
        <Segmented value={tab} onChange={(v) => setTab(v as typeof tab)} options={options} />
      }
    >
      {tab === "run" && <RunLogs />}
      {tab === "audit" && isAdmin && <AuditLogs />}
      {tab === "risk" && <RiskEvents />}
    </Card>
  );
}
