import { App, AutoComplete, Button, Card, Col, Form, InputNumber, Popconfirm, Row, Select, Space, Table } from "antd";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useState } from "react";
import api from "@/api/client";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useThemeMode } from "@/store/ThemeContext";
import type { BacktestResult, BacktestRun } from "@/types";
import { fmtNum, pnlColor } from "@/utils/format";

// Popular OKX perpetuals shown in the dropdown — but the field is free-typed,
// so any OKX instrument (e.g. PEPE-USDT-SWAP, BTC-USDT spot) can be backtested.
const INSTRUMENTS = [
  "BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP", "XRP-USDT-SWAP",
  "DOGE-USDT-SWAP", "BNB-USDT-SWAP", "ADA-USDT-SWAP", "AVAX-USDT-SWAP",
  "LINK-USDT-SWAP", "TON-USDT-SWAP", "LTC-USDT-SWAP", "TRX-USDT-SWAP",
];
const BARS = ["15m", "1H", "4H", "1D"];

// Compact date+time for the history list (e.g. 06-17 20:47).
function fmtRunTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Backtest() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const { mode } = useThemeMode();
  const axisColor = mode === "light" ? "#8a97a5" : "#7d8896";
  const splitColor = mode === "light" ? "#eef1f4" : "#1a212b";
  const [form] = Form.useForm();
  const strategy = Form.useWatch("strategy", form) ?? "sma_cross";
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [resultCfg, setResultCfg] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<BacktestRun[]>([]);

  const loadHistory = useCallback(() => {
    api.getBacktestHistory({ limit: 100 }).then(setHistory).catch(() => {});
  }, []);
  useEffect(loadHistory, [loadHistory]);

  // On first open, restore the most recent saved run into 回测结果 (re-computed for its
  // curves — history only stores metrics — with save=false so it isn't re-logged).
  useEffect(() => {
    api.getBacktestHistory({ limit: 1 }).then((rows) => {
      if (!rows.length) return;
      form.setFieldsValue(rows[0].params);
      api.runBacktest(rows[0].params as any, { save: false }).then((r) => {
        setResult(r);
        setResultCfg(rows[0].params);
      }).catch(() => {});
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fill the form from a saved run's params so it can be reviewed / re-run.
  const loadParams = (params: Record<string, any>) => {
    form.setFieldsValue(params);
    message.success(t("backtest.paramsLoaded"));
  };

  // View a saved run: fill the form AND re-compute it (save=false) to show its full
  // result + charts in 回测结果 (history only stores metrics, not the curves).
  const viewRun = async (run: BacktestRun) => {
    setLoading(true);
    try {
      form.setFieldsValue(run.params);
      setResultCfg(run.params);
      setResult(await api.runBacktest(run.params as any, { save: false }));
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("backtest.failed"));
    } finally {
      setLoading(false);
    }
  };
  const deleteRun = async (id: number) => {
    try {
      await api.deleteBacktestRun(id);
      loadHistory();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("backtest.failed"));
    }
  };
  const clearHistory = async () => {
    try {
      await api.clearBacktestHistory();
      loadHistory();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("backtest.failed"));
    }
  };

  const runConfig = (values: any) =>
    api.runBacktest({
      inst_id: String(values.inst_id || "").trim().toUpperCase(),
      bar: values.bar,
      limit: values.limit,
      strategy: values.strategy,
      fast: values.fast,
      slow: values.slow,
      rsi_len: values.rsi_len,
      rsi_low: values.rsi_low,
      rsi_high: values.rsi_high,
      boll_len: values.boll_len,
      boll_k: values.boll_k,
      donchian_len: values.donchian_len,
      macd_fast: values.macd_fast,
      macd_slow: values.macd_slow,
      macd_signal: values.macd_signal,
      initial_capital: values.initial_capital,
      fee_rate: values.fee_rate,
      slippage_bp: values.slippage_bp,
    });

  // Strategy key → localized name (for the history table).
  const stratLabel = (s: string) => ({
    sma_cross: t("backtest.smaCross"), momentum: t("backtest.momentum"), rsi: t("backtest.rsi"),
    bollinger: t("backtest.bollinger"), donchian: t("backtest.donchian"), macd: t("backtest.macd"),
  }[s] ?? s);

  // Key params of a config, e.g. "10/30" or "14·30/70" — shown after the strategy name.
  const cfgParams = (c: Record<string, any>) => ({
    sma_cross: `${c.fast}/${c.slow}`,
    momentum: `${c.slow}`,
    rsi: `${c.rsi_len}·${c.rsi_low}/${c.rsi_high}`,
    bollinger: `${c.boll_len}/${c.boll_k}`,
    donchian: `${c.donchian_len}`,
    macd: `${c.macd_fast}/${c.macd_slow}/${c.macd_signal}`,
  }[c.strategy as string] ?? "");

  // One-line summary of what produced the displayed result.
  const describeCfg = (c: Record<string, any> | null) => {
    if (!c) return "";
    const inst = String(c.inst_id || "").toUpperCase();
    const pp = cfgParams(c);
    return `${inst} · ${stratLabel(c.strategy)}${pp ? `(${pp})` : ""} · ${c.bar} · ${c.limit}${t("backtest.barsUnit")}`;
  };

  const run = async (values: any) => {
    setLoading(true);
    try {
      setResult(await runConfig(values));
      setResultCfg(values);
      loadHistory();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("backtest.failed"));
    } finally {
      setLoading(false);
    }
  };

  const chartOption = result && {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    legend: { data: ["Equity", "Price"], textStyle: { color: axisColor } },
    grid: { left: 60, right: 60, top: 30, bottom: 40 },
    xAxis: { type: "category", data: result.equity_curve.map((p) => new Date(p[0]).toLocaleDateString()), axisLabel: { color: axisColor } },
    yAxis: [
      { type: "value", name: "Equity", scale: true, axisLabel: { color: axisColor }, splitLine: { lineStyle: { color: splitColor } } },
      { type: "value", name: "Price", scale: true, axisLabel: { color: axisColor }, splitLine: { show: false } },
    ],
    series: [
      { name: "Equity", type: "line", showSymbol: false, data: result.equity_curve.map((p) => p[1]), lineStyle: { color: "#1668dc", width: 2 }, areaStyle: { color: "rgba(22,104,220,0.12)" } },
      { name: "Price", type: "line", yAxisIndex: 1, showSymbol: false, data: result.price_series.map((p) => p[1]), lineStyle: { color: "#8a94a6", width: 1, type: "dashed" } },
    ],
  };

  const ddOption = result && {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v?.toFixed(2)}%` },
    grid: { left: 60, right: 60, top: 16, bottom: 30, containLabel: true },
    xAxis: { type: "category", data: result.drawdown_curve.map((p) => new Date(p[0]).toLocaleDateString()), axisLabel: { color: axisColor } },
    yAxis: { type: "value", inverse: true, axisLabel: { color: axisColor, formatter: "{value}%" }, splitLine: { lineStyle: { color: splitColor } } },
    series: [{ name: "Drawdown", type: "line", showSymbol: false, data: result.drawdown_curve.map((p) => p[1]), lineStyle: { color: "#ea3943", width: 1.5 }, areaStyle: { color: "rgba(234,57,67,0.15)" } }],
  };

  return (
    <Row gutter={16}>
      <Col xs={24} lg={7}>
        <Card title={t("backtest.setup")} variant="borderless">
          <Form
            form={form}
            layout="vertical"
            size="middle"
            className="bt-form"
            initialValues={{
              inst_id: INSTRUMENTS[0], bar: "1H", limit: 300, strategy: "sma_cross",
              fast: 10, slow: 30,
              rsi_len: 14, rsi_low: 30, rsi_high: 70,
              boll_len: 20, boll_k: 2,
              donchian_len: 20,
              macd_fast: 12, macd_slow: 26, macd_signal: 9,
              initial_capital: 10000, fee_rate: 0.05, slippage_bp: 1,
            }}
            onFinish={run}
          >
            <Form.Item name="inst_id" label={t("common.instrument")}>
              <AutoComplete
                options={INSTRUMENTS.map((i) => ({ value: i }))}
                // Show the whole list once a complete instrument is selected; only filter while typing a partial.
                filterOption={(input, opt) => {
                  const up = input.toUpperCase();
                  if (INSTRUMENTS.includes(up)) return true;
                  return (opt?.value ?? "").toUpperCase().includes(up);
                }}
                placeholder="BTC-USDT-SWAP"
              />
            </Form.Item>
            <Form.Item name="strategy" label={t("backtest.strategy")}>
              <Select options={[
                { value: "sma_cross", label: t("backtest.smaCross") },
                { value: "momentum", label: t("backtest.momentum") },
                { value: "rsi", label: t("backtest.rsi") },
                { value: "bollinger", label: t("backtest.bollinger") },
                { value: "donchian", label: t("backtest.donchian") },
                { value: "macd", label: t("backtest.macd") },
              ]} />
            </Form.Item>
            <Row gutter={8}>
              <Col span={12}><Form.Item name="bar" label={t("backtest.timeframe")}><Select options={BARS.map((b) => ({ value: b, label: b }))} /></Form.Item></Col>
              <Col span={12}><Form.Item name="limit" label={t("backtest.bars")}><InputNumber style={{ width: "100%" }} min={50} max={1000} /></Form.Item></Col>
            </Row>

            {/* Strategy-specific parameters. Hidden (not unmounted) so values persist when switching. */}
            <div style={{ display: strategy === "sma_cross" ? "block" : "none" }}>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="fast" label={t("backtest.fastWindow")}><InputNumber style={{ width: "100%" }} min={2} max={200} /></Form.Item></Col>
                <Col span={12}><Form.Item name="slow" label={t("backtest.slowWindow")}><InputNumber style={{ width: "100%" }} min={3} max={400} /></Form.Item></Col>
              </Row>
            </div>
            <div style={{ display: strategy === "momentum" ? "block" : "none" }}>
              <Form.Item name="slow" label={t("backtest.lookback")}><InputNumber style={{ width: "100%" }} min={3} max={400} /></Form.Item>
            </div>
            <div style={{ display: strategy === "rsi" ? "block" : "none" }}>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="rsi_len" label={t("backtest.rsiLen")}><InputNumber style={{ width: "100%" }} min={2} max={100} /></Form.Item></Col>
                <Col span={8}><Form.Item name="rsi_low" label={t("backtest.rsiLow")}><InputNumber style={{ width: "100%" }} min={1} max={50} /></Form.Item></Col>
                <Col span={8}><Form.Item name="rsi_high" label={t("backtest.rsiHigh")}><InputNumber style={{ width: "100%" }} min={50} max={99} /></Form.Item></Col>
              </Row>
            </div>
            <div style={{ display: strategy === "bollinger" ? "block" : "none" }}>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="boll_len" label={t("backtest.bollLen")}><InputNumber style={{ width: "100%" }} min={5} max={200} /></Form.Item></Col>
                <Col span={12}><Form.Item name="boll_k" label={t("backtest.bollK")}><InputNumber style={{ width: "100%" }} min={0.5} max={5} step={0.1} /></Form.Item></Col>
              </Row>
            </div>
            <div style={{ display: strategy === "donchian" ? "block" : "none" }}>
              <Form.Item name="donchian_len" label={t("backtest.donchianLen")}><InputNumber style={{ width: "100%" }} min={5} max={200} /></Form.Item>
            </div>
            <div style={{ display: strategy === "macd" ? "block" : "none" }}>
              <Row gutter={8}>
                <Col span={8}><Form.Item name="macd_fast" label={t("backtest.macdFast")}><InputNumber style={{ width: "100%" }} min={2} max={100} /></Form.Item></Col>
                <Col span={8}><Form.Item name="macd_slow" label={t("backtest.macdSlow")}><InputNumber style={{ width: "100%" }} min={3} max={200} /></Form.Item></Col>
                <Col span={8}><Form.Item name="macd_signal" label={t("backtest.macdSignal")}><InputNumber style={{ width: "100%" }} min={2} max={100} /></Form.Item></Col>
              </Row>
            </div>

            <Form.Item name="initial_capital" label={t("backtest.initialCapital")}><InputNumber style={{ width: "100%" }} min={100} /></Form.Item>
            <Row gutter={8}>
              <Col span={12}><Form.Item name="fee_rate" label={t("backtest.feeRate")}><InputNumber style={{ width: "100%" }} min={0} max={1} step={0.01} /></Form.Item></Col>
              <Col span={12}><Form.Item name="slippage_bp" label={t("backtest.slippage")}><InputNumber style={{ width: "100%" }} min={0} max={100} step={0.5} /></Form.Item></Col>
            </Row>
            <Button type="primary" htmlType="submit" block loading={loading}>{t("backtest.run")}</Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={17}>
        <Card variant="borderless" style={{ marginBottom: 16 }}
          title={
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 16 }}>
              {t("backtest.results")}
              {result && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-2)" }}>{describeCfg(resultCfg)}</span>}
            </span>
          }>
          {!result ? (
            <div style={{ color: "var(--app-text-3)", padding: 40, textAlign: "center" }}>{t("backtest.placeholder")}</div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "nowrap", columnGap: 16, marginBottom: 14, overflowX: "auto" }}>
                {[
                  { label: t("backtest.totalReturn"), value: `${fmtNum(result.total_return_pct, 2)}%`, color: pnlColor(result.total_return_pct) },
                  { label: t("backtest.annualized"), value: `${fmtNum(result.annualized_return_pct, 2)}%`, color: pnlColor(result.annualized_return_pct) },
                  { label: t("backtest.maxDrawdown"), value: `${fmtNum(result.max_drawdown_pct, 2)}%`, color: "#ea3943" },
                  { label: t("backtest.sharpe"), value: fmtNum(result.sharpe, 2) },
                  { label: t("backtest.trades"), value: String(result.trade_count) },
                  { label: t("backtest.winRate"), value: `${fmtNum(result.win_rate_pct, 2)}%` },
                  { label: t("backtest.profitFactor"), value: fmtNum(result.profit_factor, 2) },
                  { label: t("backtest.maxConsecLoss"), value: String(result.max_consecutive_losses) },
                  { label: t("backtest.totalFee"), value: `$${fmtNum(result.total_fee, 2)}`, color: "#ea3943" },
                  { label: t("backtest.avgHolding"), value: fmtNum(result.avg_holding_bars, 1) },
                  { label: t("backtest.finalEquity"), value: `$${fmtNum(result.final_equity, 2)}` },
                ].map((m) => (
                  <div key={m.label} style={{ flex: "1 1 0", minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: "var(--app-text-3)", marginBottom: 1, whiteSpace: "nowrap" }}>{m.label}</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", color: m.color ?? "var(--app-text)" }}>{m.value}</div>
                  </div>
                ))}
              </div>
              {chartOption && <ReactECharts option={chartOption} style={{ height: 230 }} notMerge />}
              {ddOption && (
                <>
                  <div className="section-title" style={{ marginTop: 12 }}>{t("backtest.drawdownCurve")}</div>
                  <ReactECharts option={ddOption} style={{ height: 130 }} notMerge />
                </>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--app-text-3)", textAlign: "center" }}>{t("backtest.disclaimer")}</div>
            </>
          )}
        </Card>

        <Card
          title={t("backtest.history")}
          variant="borderless"
          style={{ marginTop: 16 }}
          styles={{ body: { paddingTop: 4 } }}
          extra={isAdmin && history.length > 0 && (
            <Popconfirm title={t("backtest.clearAllConfirm")} onConfirm={clearHistory} okText={t("common.ok")} cancelText={t("common.cancel")}>
              <Button size="small" danger>{t("backtest.clearAll")}</Button>
            </Popconfirm>
          )}
        >
          {history.length === 0 ? (
            <div style={{ color: "var(--app-text-3)", padding: 24, textAlign: "center" }}>{t("backtest.noHistory")}</div>
          ) : (
            <Table<BacktestRun>
              rowKey="id"
              size="small"
              dataSource={history}
              pagination={{ pageSize: 10, hideOnSinglePage: true, size: "small" }}
              scroll={{ x: "max-content" }}
              columns={[
                { title: t("common.time"), render: (_, r) => <span className="mono" style={{ whiteSpace: "nowrap" }}>{fmtRunTime(r.created_at)}</span> },
                { title: t("common.instrument"), dataIndex: "inst_id", render: (v) => <span style={{ whiteSpace: "nowrap" }}>{v}</span> },
                { title: t("backtest.timeframe"), dataIndex: "bar" },
                { title: t("backtest.strategy"), render: (_, r) => stratLabel(r.strategy) },
                { title: t("backtest.totalReturn"), align: "right", render: (_, r) => <span className="mono" style={{ color: pnlColor(r.total_return_pct) }}>{fmtNum(r.total_return_pct, 2)}%</span> },
                { title: t("backtest.maxDrawdown"), align: "right", render: (_, r) => <span className="mono" style={{ color: "#ea3943" }}>{fmtNum(r.max_drawdown_pct, 2)}%</span> },
                { title: t("backtest.sharpe"), align: "right", render: (_, r) => <span className="mono">{fmtNum(r.sharpe, 2)}</span> },
                { title: t("backtest.winRate"), align: "right", render: (_, r) => <span className="mono">{fmtNum(r.win_rate_pct, 1)}%</span> },
                { title: t("backtest.trades"), align: "right", render: (_, r) => <span className="mono">{r.trade_count}</span> },
                {
                  title: "", align: "center", fixed: "right",
                  render: (_, r) => (
                    <Space size={2}>
                      <Button size="small" type="link" onClick={() => viewRun(r)}>{t("backtest.view")}</Button>
                      <Button size="small" type="link" onClick={() => loadParams(r.params)}>{t("backtest.loadParams")}</Button>
                      {isAdmin && (
                        <Popconfirm title={t("backtest.deleteConfirm")} onConfirm={() => deleteRun(r.id)} okText={t("common.ok")} cancelText={t("common.cancel")}>
                          <Button size="small" type="text" danger>×</Button>
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </Col>
    </Row>
  );
}
