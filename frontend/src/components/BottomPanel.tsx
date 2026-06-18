import { PlayCircleOutlined, StopOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Modal, Popconfirm, Table, Tabs, Tag } from "antd";
import { useCallback, useEffect, useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useWs } from "@/store/WsContext";
import { LIB_LABEL_EN as STRATEGY_LABEL_EN, LIB_LABEL_ZH as STRATEGY_LABEL_ZH } from "@/data/strategyLibrary";
import type { AccountDetail, ClosedPosition, Order, Position, StrategyConfig, Trade } from "@/types";
import { DASH, fmtDuration, fmtNum, fmtQty, pnlColor } from "@/utils/format";

/** Distance from mark price to liquidation price (%), with a risk colour. */
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

const stateColor: Record<string, string> = {
  live: "blue",
  partially_filled: "gold",
  filled: "green",
  canceled: "default",
};

// A strategy instance counts as running when the bot is bound to it and active.
const RUN_STATES = ["RUNNING", "PAUSED", "STARTING"];

const numSort = (k: string) => (a: any, b: any) => (Number(a[k]) || 0) - (Number(b[k]) || 0);
const timeSort = (k: string) => (a: any, b: any) => new Date(a[k] ?? 0).getTime() - new Date(b[k] ?? 0).getTime();
const ms = (v: number | null | undefined) => (v ? new Date(v).toLocaleString() : DASH);

/**
 * Bottom trade-info panel, OKX-style: current positions / open orders /
 * position history / order history / assets / strategy. Order History rows open
 * a fill-detail dialog. Admin can cancel orders and close positions.
 */
export default function BottomPanel({ inst, bodyH = 264 }: { inst: string; bodyH?: number }) {
  const { t, lang } = useI18n();
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const { lastPrivateTs } = useWs();
  const [active, setActive] = useState("positions");
  const [detail, setDetail] = useState<Order | null>(null);
  const [runningOnly, setRunningOnly] = useState(false);

  const fetchOpen = useCallback(() => api.getOrders({ open_only: true }), []);
  const fetchAll = useCallback(() => api.getOrders({}), []);
  const open = usePolling(fetchOpen, 4000);
  const all = usePolling(fetchAll, 8000);
  const trades = usePolling(api.getTrades, 8000);
  const positions = usePolling(api.getPositions, 5000);
  const posHistory = usePolling(() => api.getPositionsHistory(50), 20000);
  const account = usePolling(api.getAccount, 8000);
  const instances = usePolling(api.listStrategyInstances, 6000);
  const bot = usePolling(api.getBot, 4000);

  const isRunning = (name: string) =>
    bot.data?.strategy_name === name && RUN_STATES.includes(bot.data?.state ?? "");
  const typeLabel = lang === "en" ? STRATEGY_LABEL_EN : STRATEGY_LABEL_ZH;

  useEffect(() => {
    if (lastPrivateTs) {
      open.refresh();
      all.refresh();
      trades.refresh();
      positions.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPrivateTs]);

  const cancel = async (o: Order) => {
    try {
      await api.cancelOrder({ inst_id: o.inst_id, order_id: o.order_id ?? undefined });
      message.success(t("orders.cancelled"));
      open.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const cancelAll = async () => {
    try {
      await api.cancelAll(); // 全部品种的当前委托
      message.success(t("orders.cancelAll"));
      open.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const runInst = async (r: StrategyConfig) => {
    try {
      await api.runStrategyInstance(r.name);
      message.success(t("strat.runStarted"));
      instances.refresh();
      bot.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const stopInst = async (r: StrategyConfig) => {
    try {
      await api.stopStrategyInstance(r.name);
      message.success(t("strat.stopIt"));
      instances.refresh();
      bot.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };
  const closePos = async (p: Position) => {
    try {
      await api.closePosition(p.inst_id, p.pos_side, p.mgn_mode ?? "cross");
      message.success(t("pos.closing", { inst: p.inst_id }));
      positions.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("pos.closeFailed"));
    }
  };

  // ---- Order columns (shared by 当前委托 / 历史委托) -------------------------
  const orderCols = (action: "cancel" | "detail" | null) => [
    { title: t("common.time"), dataIndex: "created_at", width: 150, sorter: timeSort("created_at"), render: (v: string) => <span className="mono">{new Date(v).toLocaleString()}</span> },
    { title: t("common.instrument"), dataIndex: "inst_id", width: 130 },
    { title: t("common.side"), dataIndex: "side", width: 64, render: (v: string) => <Tag color={v === "buy" ? "green" : "red"}>{v.toUpperCase()}</Tag> },
    { title: t("common.type"), dataIndex: "ord_type", width: 70 },
    { title: t("common.price"), dataIndex: "price", align: "right" as const, sorter: numSort("price"), render: (v: number) => <span className="mono">{v ? fmtNum(v) : DASH}</span> },
    { title: t("orders.avgPx"), dataIndex: "avg_price", align: "right" as const, render: (v: number) => <span className="mono">{v ? fmtNum(v) : DASH}</span> },
    { title: t("common.size"), dataIndex: "size", align: "right" as const, sorter: numSort("size"), render: (v: number, o: Order) => <span className="mono">{fmtQty(v, o.inst_id)}</span> },
    { title: t("orders.filled"), dataIndex: "filled_size", align: "right" as const, sorter: numSort("filled_size"), render: (v: number, o: Order) => <span className="mono">{fmtQty(v, o.inst_id)}</span> },
    { title: t("orders.state"), dataIndex: "state", width: 110, render: (v: string) => <Tag color={stateColor[v] ?? "default"}>{v}</Tag> },
    { title: t("orders.src"), dataIndex: "source", width: 76, render: (v: string) => <Tag color={v === "bot" ? "purple" : "cyan"}>{v}</Tag> },
    ...(action === "cancel" && isAdmin
      ? [{
          title: t("common.action"), align: "center" as const, width: 80,
          render: (_: any, o: Order) => (
            <Popconfirm title={t("orders.cancelConfirm")} onConfirm={() => cancel(o)}>
              <Button danger size="small">{t("orders.cancel")}</Button>
            </Popconfirm>
          ),
        }]
      : []),
    ...(action === "detail"
      ? [{
          title: t("common.action"), align: "center" as const, width: 92,
          render: (_: any, o: Order) => (
            <Button size="small" onClick={() => setDetail(o)}>{t("orders.viewDetail")}</Button>
          ),
        }]
      : []),
  ];

  // ---- Current positions ----------------------------------------------------
  const posCols = [
    { title: t("common.instrument"), dataIndex: "inst_id", width: 140 },
    { title: t("common.side"), dataIndex: "pos_side", width: 64, render: (v: string) => <Tag color={v === "short" ? "red" : "green"}>{v}</Tag> },
    { title: t("pos.title"), dataIndex: "position", align: "right" as const, sorter: numSort("position"), render: (v: number, p: Position) => <span className="mono">{fmtQty(v, p.inst_id)}</span> },
    { title: t("pos.avgPrice"), dataIndex: "avg_px", align: "right" as const, sorter: numSort("avg_px"), render: (v: number) => <span className="mono">{fmtNum(v)}</span> },
    { title: t("pos.markPrice"), dataIndex: "mark_px", align: "right" as const, render: (v: number) => <span className="mono">{fmtNum(v)}</span> },
    { title: t("pos.unrealizedPnl"), dataIndex: "upl", align: "right" as const, sorter: numSort("upl"), render: (v: number) => <span className="mono" style={{ color: pnlColor(v) }}>{fmtNum(v, 2)}</span> },
    { title: t("pos.realizedPnl"), dataIndex: "realized_pnl", align: "right" as const, render: (v: number | null) => <span className="mono" style={{ color: pnlColor(v ?? 0) }}>{v != null ? fmtNum(v, 2) : DASH}</span> },
    { title: t("pos.margin"), dataIndex: "margin", align: "right" as const, render: (v: number | null) => <span className="mono">{v != null ? fmtNum(v, 2) : DASH}</span> },
    { title: t("pos.liqPx"), dataIndex: "liq_px", align: "right" as const, render: (v: number | null) => <span className="mono">{v ? fmtNum(v) : DASH}</span> },
    { title: t("pos.distLiq"), align: "right" as const, render: (_: any, p: Position) => { const d = distToLiq(p); return <span className="mono" style={{ color: distColor(d) }}>{d != null ? `${fmtNum(d, 2)}%` : DASH}</span>; } },
    { title: t("pos.lever"), dataIndex: "lever", width: 64, render: (v: string) => v ?? DASH },
    { title: t("pos.holdTime"), align: "right" as const, render: (_: any, p: Position) => fmtDuration(p.c_time) },
    ...(isAdmin
      ? [{
          title: t("common.action"), align: "center" as const, width: 90,
          render: (_: any, p: Position) => (
            <Popconfirm title={t("pos.closeConfirm", { inst: p.inst_id })} onConfirm={() => closePos(p)}>
              <Button danger size="small">{t("pos.close")}</Button>
            </Popconfirm>
          ),
        }]
      : []),
  ];

  // ---- Position history -----------------------------------------------------
  const posHistCols = [
    { title: t("common.instrument"), dataIndex: "inst_id", width: 140 },
    { title: t("common.side"), dataIndex: "pos_side", width: 64, render: (v: string) => <Tag color={v === "short" ? "red" : "green"}>{v}</Tag> },
    { title: t("pos.posState"), dataIndex: "close_type", width: 90, render: (v: string | null) => <Tag color={v === "3" ? "default" : "gold"}>{v === "3" ? t("pos.allClosed") : t("pos.partClosed")}</Tag> },
    { title: t("pos.openAvgPx"), dataIndex: "open_avg_px", align: "right" as const, render: (v: number) => <span className="mono">{v ? fmtNum(v) : DASH}</span> },
    { title: t("pos.closeAvgPx"), dataIndex: "close_avg_px", align: "right" as const, render: (v: number) => <span className="mono">{v ? fmtNum(v) : DASH}</span> },
    { title: t("pos.realizedPnl"), dataIndex: "realized_pnl", align: "right" as const, sorter: numSort("realized_pnl"), render: (v: number | null) => <span className="mono" style={{ color: pnlColor(v ?? 0) }}>{v != null ? fmtNum(v, 2) : DASH}</span> },
    { title: t("pos.realizedRatio"), dataIndex: "pnl_ratio", align: "right" as const, render: (v: number | null) => <span className="mono" style={{ color: pnlColor(v ?? 0) }}>{v != null ? `${fmtNum(v * 100, 2)}%` : DASH}</span> },
    { title: t("pos.maxPos"), dataIndex: "open_max_pos", align: "right" as const, render: (v: number | null, p: ClosedPosition) => <span className="mono">{v != null ? fmtQty(v, p.inst_id) : DASH}</span> },
    { title: t("pos.closedQty"), dataIndex: "close_total_pos", align: "right" as const, render: (v: number | null, p: ClosedPosition) => <span className="mono">{v != null ? fmtQty(v, p.inst_id) : DASH}</span> },
    { title: t("pos.lever"), dataIndex: "lever", width: 60, render: (v: string) => v ?? DASH },
    { title: t("pos.openTime"), dataIndex: "c_time", width: 150, sorter: timeSort("c_time"), render: (v: number | null) => <span className="mono">{ms(v)}</span> },
    { title: t("pos.closeTime"), dataIndex: "u_time", width: 150, sorter: timeSort("u_time"), render: (v: number | null) => <span className="mono">{ms(v)}</span> },
  ];

  // ---- Assets ---------------------------------------------------------------
  const assetCols = [
    { title: t("assets.ccy"), dataIndex: "ccy", width: 100, render: (v: string) => <strong>{v}</strong> },
    { title: t("assets.equity"), dataIndex: "eq", align: "right" as const, sorter: numSort("eq"), render: (v: number) => <span className="mono">{fmtNum(v, 6)}</span> },
    { title: t("assets.avail"), dataIndex: "avail_bal", align: "right" as const, render: (v: number) => <span className="mono">{fmtNum(v, 6)}</span> },
    { title: t("assets.frozen"), dataIndex: "frozen_bal", align: "right" as const, render: (v: number) => <span className="mono">{fmtNum(v, 6)}</span> },
    { title: t("assets.usd"), dataIndex: "eq_usd", align: "right" as const, sorter: numSort("eq_usd"), render: (v: number) => <span className="mono">{fmtNum(v, 2)}</span> },
    { title: t("assets.upl"), dataIndex: "upl", align: "right" as const, render: (v: number) => <span className="mono" style={{ color: pnlColor(v) }}>{fmtNum(v, 2)}</span> },
  ];

  // ---- Strategy instances (the bots you create & run on the Strategy page) ---
  const stratCols = [
    { title: t("strat.name"), dataIndex: "name", width: 150, render: (v: string) => <b>{v}</b> },
    { title: t("strategy.type"), dataIndex: "strategy_type", width: 120, render: (v: string) => <Tag>{typeLabel[v] ?? v}</Tag> },
    { title: t("common.instrument"), dataIndex: "inst_id", width: 150 },
    { title: t("strategy.orderSize"), dataIndex: "order_size", render: (v: number) => <span className="mono">{fmtNum(v, 4)}</span> },
    { title: t("strategy.maxPosition"), dataIndex: "max_position", render: (v: number) => <span className="mono">{fmtNum(v, 4)}</span> },
    { title: t("strat.statusCol"), key: "status", width: 90, render: (_: any, r: StrategyConfig) => (isRunning(r.name) ? <Tag color="green">{t("strat.running")}</Tag> : <Tag>{t("strat.stopped")}</Tag>) },
    ...(isAdmin
      ? [{
          title: t("common.action"), align: "center" as const, width: 96,
          render: (_: any, r: StrategyConfig) =>
            isRunning(r.name) ? (
              <Button size="small" danger icon={<StopOutlined />} onClick={() => stopInst(r)}>{t("strat.stopIt")}</Button>
            ) : (
              <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => runInst(r)}>{t("strat.runIt")}</Button>
            ),
        }]
      : []),
  ];
  const stratRows = (instances.data ?? []).filter((r) => !runningOnly || isRunning(r.name));

  // Table body tracks the panel height: subtract the tab bar (~36) + table header (~34).
  // No horizontal scroll — columns auto-fit the panel width (OKX/AiCoin density).
  const scrollY = Math.max(96, bodyH - 70);
  // scroll.x = "max-content": when columns don't fit, scroll horizontally instead of
  // wrapping numbers onto two lines (which bloated row height).
  const tableProps = { rowKey: "id", size: "small" as const, pagination: false as const, scroll: { x: "max-content" as const, y: scrollY } };

  const items = [
    {
      key: "positions",
      label: `${t("term.tabPosCur")} (${positions.data?.length ?? 0})`,
      children: <Table<Position> {...tableProps} rowKey={(p) => `${p.inst_id}-${p.pos_side}`} dataSource={positions.data ?? []} columns={posCols} locale={{ emptyText: t("pos.empty") }} />,
    },
    {
      key: "open",
      label: `${t("term.tabOrderCur")} (${open.data?.length ?? 0})`,
      children: (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isAdmin && (open.data?.length ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 6 }}>
              <Popconfirm title={t("orders.cancelAllConfirm")} okButtonProps={{ danger: true }} onConfirm={cancelAll}>
                <Button danger size="small">{t("orders.cancelAll")} ({open.data?.length ?? 0})</Button>
              </Popconfirm>
            </div>
          )}
          <Table<Order> {...tableProps} scroll={{ y: scrollY - 34 }} dataSource={open.data ?? []} columns={orderCols("cancel")} />
        </div>
      ),
    },
    {
      key: "posHistory",
      label: t("term.tabPosHist"),
      children: <Table<ClosedPosition> {...tableProps} rowKey={(p) => `${p.inst_id}-${p.pos_side}-${p.u_time}`} dataSource={posHistory.data ?? []} columns={posHistCols} locale={{ emptyText: t("pos.histEmpty") }} />,
    },
    {
      key: "history",
      label: t("term.tabOrderHist"),
      children: <Table<Order> {...tableProps} dataSource={all.data ?? []} columns={orderCols("detail")} />,
    },
    {
      key: "assets",
      label: t("term.tabAssets"),
      children: <Table<AccountDetail> {...tableProps} rowKey="ccy" dataSource={account.data?.details ?? []} columns={assetCols} locale={{ emptyText: t("assets.empty") }} />,
    },
    {
      key: "algo",
      label: `${t("term.tabStrategy")} (${instances.data?.length ?? 0})`,
      children: (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 12px" }}>
            <Checkbox checked={runningOnly} onChange={(e) => setRunningOnly(e.target.checked)}>
              {t("term.runningOnly")}
            </Checkbox>
          </div>
          <Table<StrategyConfig> {...tableProps} scroll={{ y: Math.max(72, scrollY - 28) }} rowKey="name" dataSource={stratRows} columns={stratCols} locale={{ emptyText: t("strat.empty") }} />
        </div>
      ),
    },
  ];

  // Fills belonging to the order opened in the detail dialog.
  const detailFills = detail
    ? (trades.data ?? []).filter((tr) => detail.order_id && tr.order_id === detail.order_id)
    : [];

  return (
    <div className="term-panel">
      <Tabs
        size="small"
        activeKey={active}
        onChange={setActive}
        items={items}
        tabBarStyle={{ margin: 0, paddingInline: 12 }}
      />
      <Modal
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={760}
        title={
          detail ? (
            <span>
              {detail.inst_id}{" "}
              <Tag color={detail.side === "buy" ? "green" : "red"}>{detail.side.toUpperCase()}</Tag>
              <Tag color={stateColor[detail.state] ?? "default"}>{detail.state}</Tag>
              <span style={{ color: "var(--text-muted, #888)", fontWeight: 400, fontSize: 12 }}>
                {t("orders.orderNo")}: {detail.order_id ?? DASH}
              </span>
            </span>
          ) : null
        }
      >
        <Table<Trade>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={detailFills}
          locale={{ emptyText: t("orders.noFills") }}
          columns={[
            { title: t("common.time"), dataIndex: "created_at", render: (v: string) => <span className="mono">{new Date(v).toLocaleString()}</span> },
            { title: t("orders.fillSz"), dataIndex: "fill_sz", align: "right", render: (v: number) => <span className="mono">{fmtNum(v, 6)}</span> },
            { title: t("common.price"), dataIndex: "fill_px", align: "right", render: (v: number) => <span className="mono">{fmtNum(v)}</span> },
            { title: t("orders.amount"), align: "right", render: (_: any, r: Trade) => <span className="mono">{fmtNum(r.fill_px * r.fill_sz, 2)}</span> },
            { title: t("orders.liquidity"), dataIndex: "exec_type", align: "center", render: (v: string | null) => (v ? <Tag color={v === "M" ? "green" : "default"}>{v === "M" ? t("orders.maker") : t("orders.taker")}</Tag> : DASH) },
            { title: t("pos.realizedPnl"), dataIndex: "fill_pnl", align: "right", render: (v: number | null) => <span className="mono" style={{ color: pnlColor(v ?? 0) }}>{v != null ? fmtNum(v, 4) : DASH}</span> },
            { title: t("orders.fee"), dataIndex: "fee", align: "right", render: (v: number | null, r: Trade) => <span className="mono">{v != null ? `${fmtNum(v, 6)} ${r.fee_ccy ?? ""}` : DASH}</span> },
          ]}
        />
      </Modal>
    </div>
  );
}
