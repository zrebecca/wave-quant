import { App, Alert, Button, Card, Col, Form, InputNumber, Popconfirm, Progress, Row, Select, Space, Statistic, Switch, Table, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import type { RiskEvent } from "@/types";
import { fmtNum, fmtUsd, pnlColor } from "@/utils/format";

const ACTIONS = ["alert", "pause", "cancel", "stop", "stop_close"] as const;

const levelColor: Record<string, string> = {
  INFO: "blue",
  WARNING: "gold",
  ERROR: "red",
  CRITICAL: "red",
};

function usagePct(v?: number): number {
  return Math.min(100, Math.round((v ?? 0) * 100));
}

/** Tiered colour for a usage bar: green (safe) → amber (≥70%) → red (≥90%). */
function usageColor(pct: number): string {
  if (pct >= 90) return "#ea3943";
  if (pct >= 70) return "#f0a020";
  return "#16c784";
}

export default function Risk() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const { data, refresh } = usePolling(api.getRisk, 5000);
  const [levelFilter, setLevelFilter] = useState<string>("");
  const fetchEvents = useCallback(() => api.getRiskEvents(50, levelFilter), [levelFilter]);
  const { data: events, refresh: refreshEvents } = usePolling(fetchEvents, 8000, [levelFilter]);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const enforcementOff = data?.config && !data.config.enabled;

  const clearEvents = async () => {
    try {
      await api.clearRiskEvents();
      refreshEvents();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };

  useEffect(() => {
    if (data?.config) form.setFieldsValue(data.config);
  }, [data, form]);

  const save = async (values: any) => {
    setSaving(true);
    try {
      await api.updateRisk(values);
      message.success(t("risk.saved"));
      refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    } finally {
      setSaving(false);
    }
  };

  const u = data?.usage ?? {};
  const usageRows = [
    { key: "position", label: t("risk.maxPosition") },
    { key: "net_long", label: t("risk.maxNetLong") },
    { key: "net_short", label: t("risk.maxNetShort") },
    { key: "gross_exposure", label: t("risk.maxGrossExposure") },
    { key: "open_orders", label: t("risk.maxOpenOrders") },
    { key: "daily_loss", label: t("risk.maxDailyLoss") },
    { key: "order_rate", label: t("risk.orderRate") },
    { key: "cancel_rate", label: t("risk.cancelRate") },
    { key: "consecutive_losses", label: t("risk.consecLosses") },
    { key: "drawdown", label: t("risk.drawdown") },
  ];

  return (
    <Row gutter={16}>
      <Col xs={24} lg={14}>
        <Card title={t("risk.liveStatus")} variant="borderless" style={{ marginBottom: 16 }}>
          {enforcementOff ? (
            <Alert type="warning" showIcon message={t("risk.enforcementOff")} description={t("risk.enforcementOffHint")} style={{ marginBottom: 16 }} />
          ) : data?.triggered ? (
            <Alert type="error" showIcon message={t("risk.breached")} description={data.breaches.join("; ")} style={{ marginBottom: 16 }} />
          ) : (
            <Alert type="success" showIcon message={t("risk.allWithin")} style={{ marginBottom: 16 }} />
          )}
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title={t("risk.grossExposure")} value={data?.gross_exposure ?? 0} precision={2} prefix="$" />
            </Col>
            <Col span={8}>
              <Statistic title={t("risk.netPosition")} value={data?.net_position ?? 0} precision={4} valueStyle={{ color: pnlColor(data?.net_position) }} />
            </Col>
            <Col span={8}>
              <Statistic title={t("risk.dailyPnl")} value={data?.daily_pnl ?? 0} precision={2} prefix="$" valueStyle={{ color: pnlColor(data?.daily_pnl) }} />
            </Col>
          </Row>

          <div style={{ marginTop: 16, fontWeight: 600, fontSize: 12.5, color: "var(--app-text-2)" }}>{t("risk.usage")}</div>
          {usageRows.map((r) => {
            const pct = usagePct(u[r.key]);
            return (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7 }}>
                <span style={{ width: 132, fontSize: 12, color: "var(--app-text-3)" }}>{r.label}</span>
                <Progress
                  percent={pct}
                  size="small"
                  strokeColor={usageColor(pct)}
                  style={{ flex: 1, marginBottom: 0 }}
                />
              </div>
            );
          })}
        </Card>

        <Card
          title={t("risk.events")}
          variant="borderless"
          extra={
            <Space size={8}>
              <Select
                size="small"
                value={levelFilter}
                onChange={setLevelFilter}
                style={{ width: 110 }}
                options={[
                  { value: "", label: t("risk.allLevels") },
                  { value: "INFO", label: "INFO" },
                  { value: "WARNING", label: "WARNING" },
                  { value: "ERROR", label: "ERROR" },
                  { value: "CRITICAL", label: "CRITICAL" },
                ]}
              />
              {isAdmin && (events?.length ?? 0) > 0 && (
                <Popconfirm title={t("risk.clearConfirm")} onConfirm={clearEvents} okText={t("common.ok")} cancelText={t("common.cancel")}>
                  <Button size="small" danger>{t("risk.clearEvents")}</Button>
                </Popconfirm>
              )}
            </Space>
          }
        >
          <Table<RiskEvent>
            rowKey="id"
            size="small"
            dataSource={events ?? []}
            pagination={{ pageSize: 8 }}
            locale={{ emptyText: t("risk.noEvents") }}
            columns={[
              { title: t("common.time"), dataIndex: "created_at", width: 160, render: (v) => (v ? new Date(v).toLocaleString() : "--") },
              { title: t("risk.events"), dataIndex: "level", width: 90, render: (v) => <Tag color={levelColor[v] ?? "default"}>{v}</Tag> },
              { title: t("risk.onBreachAction"), dataIndex: "action", width: 110, render: (v) => t(`risk.act.${v}`) || v },
              { title: t("bot.message"), dataIndex: "message" },
            ]}
          />
        </Card>
      </Col>

      <Col xs={24} lg={10}>
        <Card title={t("risk.limits")} variant="borderless">
          {!isAdmin && <Alert type="info" showIcon message={t("auth.viewerHint")} style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" size="middle" className="bt-form" onFinish={save} disabled={!isAdmin}>
            <Form.Item name="max_position" label={t("risk.maxPosition")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="max_net_long" label={t("risk.maxNetLong")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="max_net_short" label={t("risk.maxNetShort")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="max_order_notional" label={t("risk.maxOrderNotional")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
            <Form.Item name="max_gross_exposure" label={t("risk.maxGrossExposure")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
            <Form.Item name="max_open_orders" label={t("risk.maxOpenOrders")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={1} />
            </Form.Item>
            <Form.Item name="max_daily_loss" label={t("risk.maxDailyLoss")} rules={[{ required: true }]}>
              <InputNumber style={{ width: "100%" }} min={0} />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="max_order_rate" label={t("risk.maxOrderRate")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="max_cancel_rate" label={t("risk.maxCancelRate")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="max_drawdown" label={t("risk.maxDrawdown")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={0} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="max_market_delay_sec" label={t("risk.maxMarketDelay")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="max_consecutive_losses" label={t("risk.maxConsecLosses")} rules={[{ required: true }]}>
                  <InputNumber style={{ width: "100%" }} min={1} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="on_breach_action" label={t("risk.onBreachAction")} rules={[{ required: true }]}>
              <Select options={ACTIONS.map((a) => ({ value: a, label: t(`risk.act.${a}`) }))} />
            </Form.Item>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <Form.Item name="enabled" label={t("risk.enableEnforcement")} valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
              {isAdmin && (
                <Button type="primary" htmlType="submit" loading={saving}>
                  {t("risk.saveLimits")}
                </Button>
              )}
            </div>
          </Form>
        </Card>
      </Col>
    </Row>
  );
}
