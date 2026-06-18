import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  RobotOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Popconfirm,
  Result,
  Row,
  Space,
  Tag,
} from "antd";
import { useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useWs } from "@/store/WsContext";
import type { BotStopMode } from "@/types";
import { fmtNum, fmtTime, fmtUsd, pnlColor } from "@/utils/format";

const stateColor: Record<string, string> = {
  RUNNING: "success",
  STARTING: "processing",
  PAUSED: "warning",
  STOPPING: "processing",
  STOPPED: "default",
  ERROR: "error",
  RISK_STOPPED: "error",
};

export default function Bot() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const { data, refresh } = usePolling(api.getBot, 5000);
  const { data: rt, refresh: refreshRt } = usePolling(api.getBotRuntime, 5000);
  const { bot } = useWs();
  const [busy, setBusy] = useState(false);

  const state = bot?.state ?? data?.state ?? "STOPPED";
  const cycles = bot?.cycles ?? data?.cycles ?? 0;
  const heartbeat = bot?.last_heartbeat ?? data?.last_heartbeat ?? null;
  const lastQuote = bot?.last_quote_ts ?? data?.last_quote_ts ?? null;
  const stateLabel = t(`bot.state.${state}`);

  const running = state === "RUNNING" || state === "STARTING";
  const paused = state === "PAUSED";
  const active = running || paused; // bot thread alive

  const action = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    try {
      await fn();
      message.success(`${t("menu.bot")} ${label}`);
      refresh();
      refreshRt();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    } finally {
      setBusy(false);
    }
  };

  const stopItems = [
    { key: "keep", label: t("bot.stopKeep") },
    { key: "cancel", label: t("bot.stopCancel") },
    { key: "cancel_close", label: t("bot.stopCancelClose") },
  ];

  const controls = (
    <Space wrap>
      {!active && (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={busy}
          onClick={() => action(api.startBot, t("bot.started"))}
        >
          {t("bot.start")}
        </Button>
      )}
      {running && (
        <Button
          icon={<PauseCircleOutlined />}
          loading={busy}
          onClick={() => action(api.pauseBot, t("bot.paused"))}
        >
          {t("bot.pause")}
        </Button>
      )}
      {paused && (
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={busy}
          onClick={() => action(api.resumeBot, t("bot.resumed"))}
        >
          {t("bot.resume")}
        </Button>
      )}
      {active && (
        <Dropdown
          menu={{
            items: stopItems,
            onClick: ({ key }) => action(() => api.stopBot(key as BotStopMode), t("bot.stopped")),
          }}
        >
          <Button danger icon={<PoweroffOutlined />} loading={busy}>
            {t("bot.stopOptions")}
          </Button>
        </Dropdown>
      )}
      {active && (
        <Button loading={busy} onClick={() => action(api.applyStrategy, t("bot.applied"))}>
          {t("bot.applyStrategy")}
        </Button>
      )}
      <Button icon={<ReloadOutlined />} loading={busy} onClick={() => action(api.restartBot, t("bot.restarted"))}>
        {t("bot.restart")}
      </Button>
    </Space>
  );

  return (
    <Row gutter={16}>
      <Col xs={24} lg={10}>
        <Card variant="borderless">
          <Result
            icon={<RobotOutlined style={{ color: "#1668dc" }} />}
            title={
              <Tag color={stateColor[state] ?? "default"} style={{ fontSize: 16, padding: "5px 16px" }}>
                {stateLabel}
              </Tag>
            }
            subTitle={data?.message ?? t("bot.subtitle")}
            extra={isAdmin ? controls : <Alert type="info" showIcon message={t("auth.viewerHint")} />}
          />
        </Card>

        {isAdmin && (
          <Card
            variant="borderless"
            style={{ marginTop: 16, borderColor: "rgba(234,57,67,0.4)" }}
            title={
              <span style={{ color: "#ea3943" }}>
                <WarningOutlined /> {t("bot.danger")}
              </span>
            }
          >
            <Space wrap>
              <Popconfirm
                title={t("bot.confirmEmergencyStop")}
                okButtonProps={{ danger: true }}
                onConfirm={() => action(api.emergencyStop, t("bot.stopped"))}
              >
                <Button danger icon={<PoweroffOutlined />} loading={busy}>
                  {t("bot.emergencyStop")}
                </Button>
              </Popconfirm>
              <Popconfirm
                title={t("bot.confirmEmergencyClose")}
                okButtonProps={{ danger: true }}
                onConfirm={() => action(api.emergencyClose, t("bot.stopped"))}
              >
                <Button danger icon={<WarningOutlined />} loading={busy}>
                  {t("bot.emergencyClose")}
                </Button>
              </Popconfirm>
            </Space>
          </Card>
        )}
      </Col>

      <Col xs={24} lg={14}>
        <Card title={t("bot.runtimeDetail")} variant="borderless">
          {active && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("bot.pinnedHint")} />
          )}
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label={t("bot.state")}>
              <Tag color={stateColor[state] ?? "default"}>{stateLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.instrument")}>{rt?.inst_id ?? "--"}</Descriptions.Item>
            <Descriptions.Item label={t("bot.strategy")}>
              {rt?.strategy_name ?? data?.strategy_name ?? "default"}
              {rt?.strategy_version != null && <Tag color="blue" style={{ marginLeft: 6 }}>v{rt.strategy_version}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.cyclesCompleted")}>{cycles}</Descriptions.Item>
            <Descriptions.Item label={t("bot.openBuy")}>
              <span className="mono up">{rt?.open_buy ?? 0}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.openSell")}>
              <span className="mono down">{rt?.open_sell ?? 0}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.todayFills")}>{rt?.today_fills ?? 0}</Descriptions.Item>
            <Descriptions.Item label={t("bot.makerRatio")}>
              {rt?.maker_ratio != null ? `${fmtNum(rt.maker_ratio * 100, 1)}%` : "--"}
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.netPosition")}>
              <span className="mono" style={{ color: pnlColor(rt?.net_position) }}>{fmtNum(rt?.net_position ?? 0, 4)}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.grossExposure")}>
              <span className="mono">{fmtUsd(rt?.gross_exposure ?? 0)}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.todayFee")}>
              <span className="mono">{fmtNum(rt?.today_fee ?? 0, 6)}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.lastQuote")}>{fmtTime(lastQuote)}</Descriptions.Item>
            <Descriptions.Item label={t("bot.lastHeartbeat")}>{fmtTime(heartbeat)}</Descriptions.Item>
            <Descriptions.Item label={t("bot.startedAt")}>
              {data?.started_at ? new Date(data.started_at).toLocaleString() : "--"}
            </Descriptions.Item>
            <Descriptions.Item label={t("bot.lastError")} span={2}>
              <span style={{ color: rt?.last_error ? "#ea3943" : "var(--app-text-3)" }}>{rt?.last_error ?? "--"}</span>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
    </Row>
  );
}
