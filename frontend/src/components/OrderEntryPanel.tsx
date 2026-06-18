import { App, Button, Checkbox, Dropdown, InputNumber, Modal, Popover, Radio, Segmented, Slider, Tooltip } from "antd";
import { CaretDownOutlined, EditOutlined, SettingOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/api/client";
import { usePolling } from "@/hooks/usePolling";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { useWs } from "@/store/WsContext";
import type { InstrumentRule } from "@/types";
import { DASH, fmtNum, pnlColor } from "@/utils/format";

// Quick-fill price mode: manual entry or one of the three derived prices (queue/over/counter).
type PriceMode = "manual" | "queue" | "over" | "counter";
// Customizable params for derived prices, persisted per client.
interface PriceCfg { queueTicks: number; overPct: number }
const DEFAULT_PRICE_CFG: PriceCfg = { queueTicks: 0, overPct: 1 };
const PRICE_CFG_KEY = "oe.priceCfg";
function loadPriceCfg(): PriceCfg {
  try {
    const p = JSON.parse(localStorage.getItem(PRICE_CFG_KEY) || "");
    return {
      queueTicks: typeof p.queueTicks === "number" && p.queueTicks >= 0 ? p.queueTicks : 0,
      overPct: typeof p.overPct === "number" && p.overPct > 0 ? p.overPct : 1,
    };
  } catch {
    return DEFAULT_PRICE_CFG;
  }
}

// Size input unit. SWAP: 张/BTC/USDT; SPOT: BTC/USDT (no contracts).
type SizeUnit = "cont" | "coin" | "cost";

// AiCoin-style "常用下单数量" (quick order-size presets). Three modes, persisted per client.
type SizeMode = "pct" | "fixed" | "slider";
interface SizePresets {
  mode: SizeMode;
  pct: number[];               // five percentages, e.g. 10/20/50/75/100
  fixed: (number | null)[];    // five fixed quantities (contracts / coin); null = unset
}
const DEFAULT_PCT = [10, 20, 50, 75, 100];
// Slider mode uses a fixed, non-editable node set (0/25/50/75/100), like AiCoin.
const SLIDER_NODES = [0, 25, 50, 75, 100];
const DEFAULT_FIXED: (number | null)[] = [null, null, null, null, null];
const DEFAULT_PRESETS: SizePresets = { mode: "pct", pct: DEFAULT_PCT, fixed: DEFAULT_FIXED };
const PRESETS_KEY = "oe.sizePresets";

function loadPresets(): SizePresets {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const p = JSON.parse(raw);
    return {
      mode: p.mode === "fixed" || p.mode === "slider" ? p.mode : "pct",
      pct: Array.isArray(p.pct) && p.pct.length === 5 ? p.pct : DEFAULT_PCT,
      fixed: Array.isArray(p.fixed) && p.fixed.length === 5
        ? p.fixed.map((v: unknown) => (typeof v === "number" && v > 0 ? v : null))
        : DEFAULT_FIXED,
    };
  } catch {
    return DEFAULT_PRESETS;
  }
}

/** Number of decimals implied by a step like 0.01 → 2 (defaults to 2). */
function decimals(step: number | null | undefined, fallback = 2): number {
  if (!step || step <= 0) return fallback;
  if (step >= 1) return 0;
  return (step.toString().split(".")[1] ?? "").length || fallback;
}

/** AiCoin "常用下单数量" editor: pick a mode and edit the five preset values. */
function SizePresetModal({ open, presets, onClose, onSave }: {
  open: boolean; presets: SizePresets; onClose: () => void; onSave: (p: SizePresets) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<SizeMode>(presets.mode);
  const [pct, setPct] = useState<number[]>(presets.pct);
  const [fixed, setFixed] = useState<(number | null)[]>(presets.fixed);

  // Re-seed the draft from the saved presets each time the dialog opens.
  useEffect(() => {
    if (open) { setMode(presets.mode); setPct(presets.pct); setFixed(presets.fixed); }
  }, [open, presets]);

  const isFixed = mode === "fixed";
  const isSlider = mode === "slider";
  // Slider mode shows the fixed node set read-only; pct/fixed modes are editable.
  const values = isFixed ? fixed : isSlider ? SLIDER_NODES : pct;
  const setValueAt = (i: number, v: number | null) => {
    if (isFixed) {
      const next = [...fixed];
      next[i] = v;                      // null = leave the box empty
      setFixed(next);
    } else {
      const next = [...pct];
      next[i] = v == null ? 0 : v;
      setPct(next);
    }
  };
  const restore = () => {
    setPct(DEFAULT_PCT);
    setFixed(DEFAULT_FIXED);
  };
  const save = () => onSave({ mode, pct, fixed });

  return (
    <Modal open={open} onCancel={onClose} title={t("term.sizePresetTitle")} footer={null} width={560} centered destroyOnClose>
      <div className="sp-modes">
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio value="pct">{t("term.sizeModePct")}</Radio>
          <Radio value="fixed">{t("term.sizeModeFixed")}</Radio>
          <Radio value="slider">{t("term.sizeModeSlider")}</Radio>
        </Radio.Group>
      </div>

      <div className="sp-grid">
        {values.map((v, i) => (
          <div className={`sp-cell${isFixed ? " sp-cell-fixed" : ""}${isSlider ? " sp-cell-ro" : ""}`} key={i}>
            <InputNumber variant="borderless" controls={false} min={0} max={isFixed ? undefined : 100} value={v} stringMode
              disabled={isSlider}
              placeholder={isFixed ? t("term.enterValue") : undefined}
              onChange={(nv) => setValueAt(i, nv as number | null)} />
            {!isFixed && <span className="sp-cell-unit">%</span>}
          </div>
        ))}
      </div>

      <div className="sp-actions">
        <Button className="sp-restore" onClick={restore}>{t("term.restoreDefault")}</Button>
        <Button type="primary" className="sp-save" onClick={save}>{t("common.save")}</Button>
      </div>
    </Modal>
  );
}

/**
 * Order entry panel (AiCoin-style, phase 1): cross/isolated margin, open/close tabs,
 * limit/market, quick-fill price (last/bid/ask), percent sizing, account summary.
 * Wired to the existing /order and /positions endpoints; demo-only. Viewers read-only.
 * Advanced types (TP/SL, conditional, Post-Only, leverage/position-mode setters) need
 * backend endpoints and are deferred to later phases rather than faked.
 */
export default function OrderEntryPanel({ inst, lastPx, inject, rule, halted }: { inst: string; lastPx: number | null; inject?: { price?: number; size?: number; nonce: number }; rule?: InstrumentRule | null; halted?: boolean }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const { tickers } = useWs();
  const tk = tickers[inst];
  const isSwap = inst.endsWith("SWAP");

  const [tab, setTab] = useState<"open" | "close" | "trigger">("open");
  const [margin, setMargin] = useState<"cross" | "isolated">("cross");
  const [ordType, setOrdType] = useState<"limit" | "market">("limit");
  // Execution modifier: when the checkbox is on, apply the selected mode (Post Only / FOK / IOC).
  const [postOnly, setPostOnly] = useState(false);
  const [execMod, setExecMod] = useState<"post_only" | "fok" | "ioc">("post_only");
  const [price, setPrice] = useState<number | null>(null);
  // Quick-fill price mode (queue/over/counter) + its customizable params.
  const [priceMode, setPriceMode] = useState<PriceMode>("manual");
  const [priceCfg, setPriceCfg] = useState<PriceCfg>(loadPriceCfg);
  const [priceCfgOpen, setPriceCfgOpen] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<"" | "buy" | "sell">("");
  // Quick order-size presets (AiCoin "常用下单数量").
  const [presets, setPresets] = useState<SizePresets>(loadPresets);
  const [presetOpen, setPresetOpen] = useState(false);
  const [activePct, setActivePct] = useState<number | null>(null);
  // Size input unit: contracts (张) / base coin (BTC) / cost value (quote ccy, USDT).
  // `size` holds the raw number shown in the box, interpreted per `unit`.
  const [unit, setUnit] = useState<SizeUnit>("cont");
  // Conditional (trigger) order fields.
  const [trigPx, setTrigPx] = useState<number | null>(null);
  const [trigMarket, setTrigMarket] = useState(true);
  const [trigOrd, setTrigOrd] = useState<number | null>(null);
  // Account config: position mode (hedge/one-way) + per-instrument leverage.
  const [posMode, setPosMode] = useState<string | null>(null);
  const [lever, setLever] = useState<number | null>(null);
  const [levOpen, setLevOpen] = useState(false);
  const [levDraft, setLevDraft] = useState(3);
  const [levBusy, setLevBusy] = useState(false);

  useEffect(() => {
    api.getAccountConfig().then((c) => setPosMode(c.pos_mode)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!isSwap) return;
    api.getLeverage(inst, margin).then((l) => setLever(l.lever || null)).catch(() => setLever(null));
  }, [inst, margin, isSwap]);

  const togglePosMode = async () => {
    const prev = posMode;
    const next = posMode === "long_short_mode" ? "net_mode" : "long_short_mode";
    setPosMode(next); // optimistic — the OKX round-trip takes ~0.7s
    try {
      const c = await api.setPositionMode(next);
      setPosMode(c.pos_mode);
    } catch (e: any) {
      setPosMode(prev); // roll back on failure (e.g. open positions/orders)
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    }
  };

  const submitLever = async () => {
    setLevBusy(true);
    try {
      const l = await api.setLeverage({ inst_id: inst, lever: levDraft, mgn_mode: margin });
      setLever(l.lever || levDraft);
      setLevOpen(false);
      message.success(t("common.saved"));
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("common.failed"));
    } finally {
      setLevBusy(false);
    }
  };

  const { data: account } = usePolling(api.getAccount, 6000);
  const positions = usePolling(api.getPositions, 5000);
  const avail = account?.available_balance ?? null;
  const ccy = account?.currency ?? "USDT";
  const myPos = (positions.data ?? []).filter((p) => p.inst_id === inst && Math.abs(p.position) > 0);

  const refPx = ordType === "limit" ? price ?? lastPx : lastPx;

  // Precision/limits from instrument rules (phase 2).
  const pxStep = rule?.tick_sz ?? 0.01;
  const szStep = rule?.lot_sz ?? 0.01;
  const minSz = rule?.min_sz ?? 0;
  const pxDp = decimals(rule?.tick_sz);
  const szDp = decimals(rule?.lot_sz);

  // Base-coin amount per contract (张). For BTC-USDT-SWAP this is ct_val × ct_mult = 0.01.
  // SPOT has no contracts, so it stays 1 (the "size" is already a base-coin amount).
  const ctVal = isSwap ? (rule?.ct_val ?? 1) * (rule?.ct_mult ?? 1) : 1;
  const baseCoin = inst.split("-")[0];

  // Convert a value in `unit` to a base-coin amount, and back. Cost needs a price.
  const toBaseCoin = useCallback((v: number, u: SizeUnit): number | null => {
    if (u === "coin") return v;
    if (u === "cont") return v * ctVal;
    return refPx && refPx > 0 ? v / refPx : null;       // cost → base coin
  }, [ctVal, refPx]);
  const fromBaseCoin = useCallback((b: number, u: SizeUnit): number | null => {
    if (u === "coin") return b;
    if (u === "cont") return ctVal > 0 ? b / ctVal : null;
    return refPx && refPx > 0 ? b * refPx : null;        // base coin → cost
  }, [ctVal, refPx]);
  const unitDp = (u: SizeUnit) => (u === "cost" ? 2 : u === "coin" ? 6 : szDp);

  // Max openable cost in quote ccy (USDT): available × leverage. The 可开多/可开空 figure.
  const maxCost = useMemo(() => (avail != null ? Number((avail * (lever ?? 1)).toFixed(2)) : null), [avail, lever]);
  // Quote-ccy cost per unit of effSize (张 for SWAP, base coin for SPOT) = ct_val × price.
  const costPerSize = refPx && refPx > 0 ? (isSwap ? ctVal * refPx : refPx) : null;
  // When a percentage is active, the field shows a 买入/卖出 preview derived from max openable.
  const previewCost = useMemo(
    () => (activePct != null && maxCost != null ? Number((maxCost * activePct / 100).toFixed(2)) : null),
    [activePct, maxCost]
  );
  const previewSize = useMemo(
    () => (previewCost != null && costPerSize ? Number((previewCost / costPerSize).toFixed(szDp)) : null),
    [previewCost, costPerSize, szDp]
  );

  // The quantity the backend wants: contracts for SWAP, base-coin amount for SPOT.
  const effSize = useMemo(() => {
    if (activePct != null) return previewSize;          // percentage preview drives the order
    if (size == null) return null;
    const b = toBaseCoin(size, unit);
    if (b == null) return null;
    const s = isSwap ? (ctVal > 0 ? b / ctVal : null) : b;
    return s == null ? null : Number(s.toFixed(szDp));
  }, [activePct, previewSize, size, unit, toBaseCoin, isSwap, ctVal, szDp]);

  // Switch unit while keeping the same underlying position (convert the displayed value).
  const switchUnit = (next: SizeUnit) => {
    if (next === unit) return;
    setActivePct(null);
    if (size != null) {
      const b = toBaseCoin(size, unit);
      const nv = b == null ? null : fromBaseCoin(b, next);
      setSize(nv == null ? null : Number(nv.toFixed(unitDp(next))));
    }
    setUnit(next);
  };

  // Percentage preset: just mark it active — the 买入/卖出 preview is computed from it.
  const applyPct = (pct: number) => { if (avail != null) setActivePct(pct); };

  // Fixed preset: set the box directly to the configured value (in the current unit).
  const applyFixed = (val: number) => {
    setActivePct(null);
    setSize(Number(val.toFixed(unitDp(unit))));
  };

  // AiCoin size field: a 数量/成本价值 dropdown on the left + a 张/BTC/USDT unit dropdown on the right.
  const unitLabel = (u: SizeUnit) => (u === "cont" ? t("term.cont") : u === "coin" ? baseCoin : ccy);
  const qtyUnit: SizeUnit = isSwap ? "cont" : "coin";          // default unit for the "数量" category
  const unitItems = (isSwap ? (["cont", "coin", "cost"] as const) : (["coin", "cost"] as const))
    .map((u) => ({ key: u, label: unitLabel(u) }));
  // Contract/coin equivalent of the current input, shown as a hint when not already in that unit.
  const backendUnit = isSwap ? t("term.cont") : baseCoin;

  // Closeable contracts per side: 可平多 (long) / 可平空 (short). Buy closes short, sell closes long.
  const closeableLong = myPos.reduce((s, p) => s + ((p.pos_side === "long" || (p.pos_side === "net" && p.position > 0)) ? Math.abs(p.position) : 0), 0);
  const closeableShort = myPos.reduce((s, p) => s + ((p.pos_side === "short" || (p.pos_side === "net" && p.position < 0)) ? Math.abs(p.position) : 0), 0);
  // Contracts to close for a side: percentage of the closeable side, or the manual size.
  const closeSizeFor = (side: "buy" | "sell") => {
    const base = side === "buy" ? closeableShort : closeableLong;
    if (activePct != null) return Number((base * (activePct / 100)).toFixed(szDp));
    return effSize ?? 0;
  };
  // 买入/卖出 preview values per side. Open: shared from buying power. Close: per-side closeable.
  const previewFor = (side: "buy" | "sell"): { cost: number | null; size: number | null } => {
    if (tab === "close") {
      const sz = closeSizeFor(side);
      return { cost: costPerSize != null ? Number((sz * costPerSize).toFixed(2)) : null, size: sz };
    }
    return { cost: previewCost, size: previewSize };
  };
  const showPreview = activePct != null && (tab === "close" || previewCost != null);
  // One side (买入/卖出) of the preview: cost in USDT ≈ contracts.
  const bsRow = (cls: "buy" | "sell", label: string, p: { cost: number | null; size: number | null }) => (
    <div className={`oe-bs-row ${cls}`}>
      <span className="oe-bs-tag">{label}</span>
      <span className="oe-bs-val mono">{p.cost != null ? fmtNum(p.cost) : DASH}</span>
      <span className="oe-bs-unit">{ccy}</span>
      <span className="oe-bs-approx">≈ {p.size != null ? p.size : DASH} {backendUnit}</span>
    </div>
  );
  const renderSizeField = () => (
    <>
      <div className={`oe-field oe-field-step${showPreview ? " oe-field-bs" : ""}`}>
        <Dropdown trigger={["click"]} menu={{
          selectable: true, selectedKeys: [unit === "cost" ? "cost" : "qty"],
          items: [
            { key: "qty", label: t("term.sizeByQty") },
            { key: "cost", label: t("term.sizeByCost") },
          ],
          onClick: ({ key }) => switchUnit(key === "cost" ? "cost" : qtyUnit),
        }}>
          <span className="oe-size-label">
            {unit === "cost" ? t("term.sizeByCost") : t("term.sizeByQty")}<CaretDownOutlined />
          </span>
        </Dropdown>
        {showPreview ? (
          <div className="oe-bs">
            {bsRow("buy", t("common.buy"), previewFor("buy"))}
            {bsRow("sell", t("common.sell"), previewFor("sell"))}
          </div>
        ) : (
          <>
            <InputNumber variant="borderless" controls={false} style={{ width: "100%" }}
              value={size} onChange={(v) => { setSize(v as number | null); setActivePct(null); }}
              min={0} step={unit === "cost" ? 1 : unit === "coin" ? ctVal : szStep} stringMode
              placeholder={unit === "cont" && minSz ? `≥ ${minSz}` : "0"} />
            {unit === "cost" ? (
              // Cost mode: the unit is fixed to the quote currency (USDT) — no picker.
              <span className="oe-field-unit">{ccy}</span>
            ) : (
              <Dropdown trigger={["click"]} menu={{
                selectable: true, selectedKeys: [unit],
                items: unitItems,
                onClick: ({ key }) => switchUnit(key as SizeUnit),
              }}>
                <span className={`oe-field-unit oe-unit-pick${isSwap ? " accent" : ""}`}>
                  {unitLabel(unit)}<CaretDownOutlined />
                </span>
              </Dropdown>
            )}
          </>
        )}
        <span className="oe-step">
          <button type="button" aria-label="increase" onClick={() => stepSize(1)}>▲</button>
          <button type="button" aria-label="decrease" onClick={() => stepSize(-1)}>▼</button>
        </span>
      </div>
      {!showPreview && unit !== qtyUnit && (
        <div className="oe-size-conv">{t("term.approxQty")} ≈ {effSize != null ? effSize : DASH} {backendUnit}</div>
      )}
    </>
  );

  // AiCoin "常用下单数量" row: percentage / fixed-qty buttons or a slider, plus an edit pencil.
  const renderSizePresets = () => (
    <div className="oe-pcts-row" style={{ marginTop: 6 }}>
      {presets.mode === "slider" ? (
        <div className="oe-size-slider">
          <Slider min={0} max={100} step={1} value={activePct ?? 0} tooltip={{ formatter: (v) => `${v}%` }}
            marks={Object.fromEntries(SLIDER_NODES.map((v) => [v, " "]))}
            onChange={(v) => applyPct(v as number)} />
          <span className="oe-slider-pct mono">{activePct ?? 0}%</span>
        </div>
      ) : presets.mode === "fixed" ? (
        <div className="oe-pcts">
          {presets.fixed.filter((v): v is number => v != null && v > 0).map((v, i) => (
            <button type="button" key={i} onClick={() => applyFixed(v)}>{v}</button>
          ))}
        </div>
      ) : (
        <div className="oe-pcts">
          {presets.pct.map((v, i) => (
            <button type="button" key={i} className={activePct === v ? "on" : ""} onClick={() => applyPct(v)}>{v}%</button>
          ))}
        </div>
      )}
      <button type="button" className="oe-pcts-edit" title={t("term.editPresets")} aria-label={t("term.editPresets")} onClick={() => setPresetOpen(true)}>
        <EditOutlined />
      </button>
    </div>
  );

  // Persist the derived-price params (queue ticks / over %).
  const savePriceCfg = (cfg: PriceCfg) => {
    setPriceCfg(cfg);
    try { localStorage.setItem(PRICE_CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore quota */ }
  };
  // Pick a quick price mode: snapshot the current price (buy-side reference) straight into the box.
  const pickPriceMode = (m: PriceMode) => {
    setOrdType("limit");
    setPriceMode(m);
    const snap = computePrice(m, "buy") ?? lastPx;
    setPrice(snap != null ? Number(snap.toFixed(pxDp)) : null);
  };

  const isMarket = ordType === "market";
  // Settings popover (queue ticks + over %), reachable from the quick-price row.
  const cfgPopover = (
    <div className="oe-pricecfg">
      <label>{t("term.queueTicksLabel")}
        <InputNumber size="small" min={0} step={1} value={priceCfg.queueTicks} style={{ width: "100%" }}
          onChange={(v) => v != null && savePriceCfg({ ...priceCfg, queueTicks: Number(v) })} />
      </label>
      <label>{t("term.overPctLabel")}
        <InputNumber size="small" min={0.01} step={0.1} value={priceCfg.overPct} style={{ width: "100%" }}
          onChange={(v) => v != null && savePriceCfg({ ...priceCfg, overPct: Number(v) })} />
      </label>
    </div>
  );
  // AiCoin "说明" tooltip for one price mode, with the live N / P% folded in.
  const noteFor = (m: PriceMode) => {
    const text =
      m === "queue" ? t("term.qQueueNote").split("{n}").join(String(priceCfg.queueTicks))
      : m === "over" ? t("term.qOverNote").split("{p}").join(String(priceCfg.overPct))
      : t("term.qCounterNote");
    return (
      <div className="oe-price-note">
        <div className="oe-price-note-title">{t("term.priceTipTitle")}</div>
        {text.split("\n").map((line, i) => <div key={i}>{line}</div>)}
      </div>
    );
  };
  const renderPriceField = () => (
    <div>
      <div className="oe-field oe-field-step">
        <span className="oe-field-label">{t("common.price")}</span>
        {isMarket ? (
          <span className="oe-price-ro mono">{price != null ? fmtNum(price) : DASH}</span>
        ) : (
          <InputNumber variant="borderless" controls={false} style={{ width: "100%" }} value={price}
            onChange={(v) => { setPrice(v as number | null); setPriceMode("manual"); }}
            min={0} step={pxStep} stringMode placeholder="0" />
        )}
        <span className="oe-field-unit">{ccy}</span>
        <span className="oe-step">
          <button type="button" aria-label="increase" onClick={() => stepPrice(1)}>▲</button>
          <button type="button" aria-label="decrease" onClick={() => stepPrice(-1)}>▼</button>
        </span>
      </div>
      <div className="oe-quick" style={{ marginTop: 6, paddingLeft: 2, gap: 16 }}>
        <Tooltip color="#fff" placement="top" overlayClassName="oe-price-note-tip" title={noteFor("queue")}>
          <a className={!isMarket && priceMode === "queue" ? "on" : ""} onClick={() => pickPriceMode("queue")}>{t("term.qQueue")}</a>
        </Tooltip>
        <Tooltip color="#fff" placement="top" overlayClassName="oe-price-note-tip" title={noteFor("over")}>
          <a className={!isMarket && priceMode === "over" ? "on" : ""} onClick={() => pickPriceMode("over")}>{t("term.qOver")}</a>
        </Tooltip>
        <Tooltip color="#fff" placement="top" overlayClassName="oe-price-note-tip" title={noteFor("counter")}>
          <a className={!isMarket && priceMode === "counter" ? "on" : ""} onClick={() => pickPriceMode("counter")}>{t("term.qCounter")}</a>
        </Tooltip>
        <a className={isMarket ? "on" : ""} onClick={() => {
          setPriceMode("manual");
          if (isMarket) { setOrdType("limit"); }
          else { setOrdType("market"); if (lastPx != null) setPrice(Number(lastPx.toFixed(pxDp))); }  // freeze the price at click time
        }}>{t("common.market")}</a>
        <Popover trigger="click" placement="bottomRight" title={t("term.priceCfgTitle")} content={cfgPopover}>
          <a className="oe-price-cfg"><SettingOutlined />{t("term.priceCfg")}</a>
        </Popover>
      </div>
    </div>
  );

  // Execution-modifier row: a checkbox + dropdown (Post Only / FOK / IOC). Limit orders only.
  const execLabel = execMod === "fok" ? t("term.execFok") : execMod === "ioc" ? t("term.execIoc") : t("term.execPostOnly");
  const renderExecMode = () => (
    ordType === "limit" ? (
      <div className="oe-exec">
        <Checkbox checked={postOnly} onChange={(e) => setPostOnly(e.target.checked)} />
        <Dropdown trigger={["click"]} menu={{
          selectable: true, selectedKeys: [execMod],
          items: [
            { key: "post_only", label: t("term.execPostOnly") },
            { key: "fok", label: t("term.execFok") },
            { key: "ioc", label: t("term.execIoc") },
          ],
          onClick: ({ key }) => setExecMod(key as "post_only" | "fok" | "ioc"),
        }}>
          <span className="oe-exec-label">{execLabel}<CaretDownOutlined /></span>
        </Dropdown>
      </div>
    ) : null
  );

  // Resolve a derived price for one side; manual mode just returns the typed price.
  const computePrice = (mode: PriceMode, side: "buy" | "sell"): number | null => {
    const round = (x: number) => Number(x.toFixed(pxDp));
    if (mode === "queue") {
      const off = priceCfg.queueTicks * pxStep;          // N ticks behind the queue
      if (side === "buy") return tk?.bid_px != null ? round(Math.max(0, tk.bid_px - off)) : null;
      return tk?.ask_px != null ? round(tk.ask_px + off) : null;
    }
    if (mode === "counter") {
      if (side === "buy") return tk?.ask_px != null ? round(tk.ask_px) : null;   // hit the ask
      return tk?.bid_px != null ? round(tk.bid_px) : null;                       // hit the bid
    }
    if (mode === "over") {
      if (lastPx == null) return null;
      const f = priceCfg.overPct / 100;
      return side === "buy" ? round(lastPx * (1 + f)) : round(lastPx * (1 - f));
    }
    return price;  // manual
  };

  // Price stepper (custom ▲▼): nudge the (already snapshotted) price by one tick.
  const stepPrice = (dir: 1 | -1) => {
    setOrdType("limit");
    setPriceMode("manual");
    const base = price ?? lastPx ?? 0;
    setPrice(Number(Math.max(0, base + dir * pxStep).toFixed(pxDp)));
  };

  // Size stepper (▲▼): nudge by one lot (szStep contracts), exiting the % preview into a manual value.
  const stepSize = (dir: 1 | -1) => {
    const nextContracts = Math.max(0, (effSize ?? 0) + dir * szStep);
    const v = fromBaseCoin(isSwap ? nextContracts * ctVal : nextContracts, unit);
    setActivePct(null);
    setSize(v == null ? null : Number(v.toFixed(unitDp(unit))));
  };

  const td_mode = isSwap ? margin : "cash";

  // Resolve the single OKX ord_type from base type + Post-Only + time-in-force.
  const effType: "limit" | "market" | "post_only" | "ioc" | "fok" =
    ordType === "market" ? "market" : postOnly ? execMod : "limit";

  const submit = async (side: "buy" | "sell") => {
    if (!effSize || effSize <= 0) return message.warning(t("common.size"));
    if (minSz && effSize < minSz) return message.warning(t("term.minSize", { min: minSz }));
    const effPrice = ordType === "market" ? undefined : price ?? undefined;
    if (effType !== "market" && (!effPrice || effPrice <= 0)) return message.warning(t("common.price"));
    setSubmitting(side);
    try {
      await api.placeOrder({ inst_id: inst, side, ord_type: effType, size: effSize, price: effType !== "market" ? effPrice : undefined, td_mode });
      message.success(t("orders.submitted"));
      setSize(null);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("orders.orderFailed"));
    } finally {
      setSubmitting("");
    }
  };

  // Close order: buy closes a short, sell closes a long. Hedge mode → posSide; net mode → reduceOnly.
  const submitClose = async (side: "buy" | "sell") => {
    const sz = closeSizeFor(side);
    if (!sz || sz <= 0) return message.warning(t("term.noPosition"));
    const effPrice = ordType === "market" ? undefined : price ?? undefined;
    if (effType !== "market" && (!effPrice || effPrice <= 0)) return message.warning(t("common.price"));
    setSubmitting(side);
    try {
      const hedge = posMode === "long_short_mode";
      await api.placeOrder({
        inst_id: inst, side, ord_type: effType, size: sz,
        price: effType !== "market" ? effPrice : undefined, td_mode,
        ...(hedge ? { pos_side: side === "buy" ? "short" : "long" } : { reduce_only: true }),
      });
      message.success(t("orders.submitted"));
      setSize(null);
      setActivePct(null);
      positions.refresh();
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("orders.orderFailed"));
    } finally {
      setSubmitting("");
    }
  };

  const submitTrigger = async (side: "buy" | "sell") => {
    if (!effSize || effSize <= 0) return message.warning(t("common.size"));
    if (minSz && effSize < minSz) return message.warning(t("term.minSize", { min: minSz }));
    if (!trigPx || trigPx <= 0) return message.warning(t("term.triggerPx"));
    if (!trigMarket && (!trigOrd || trigOrd <= 0)) return message.warning(t("term.orderPx"));
    setSubmitting(side);
    try {
      await api.placeTrigger({
        inst_id: inst,
        side,
        size: effSize,
        td_mode,
        trigger_px: trigPx,
        order_px: trigMarket ? undefined : trigOrd!,
      });
      message.success(t("orders.submitted"));
      setSize(null);
    } catch (e: any) {
      message.error(e?.response?.data?.detail ?? t("orders.orderFailed"));
    } finally {
      setSubmitting("");
    }
  };

  // Order value in quote ccy = contracts × (ct_val × price). costPerSize already folds in ct_val.
  const notional = useMemo(() => (effSize != null && costPerSize != null ? Number((effSize * costPerSize).toFixed(2)) : null), [effSize, costPerSize]);

  // Default the limit price to last when it first arrives.
  useEffect(() => {
    if (price == null && lastPx != null) setPrice(Number(lastPx.toFixed(pxDp)));
  }, [lastPx, price, pxDp]);

  // Switching instrument: drop the stale price/size and seed with the price
  // at the moment of selection (the effect above fills it once it arrives).
  useEffect(() => {
    setPrice(lastPx != null ? Number(lastPx.toFixed(pxDp)) : null);
    setSize(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst]);

  // Click-to-fill from the order book: set price (and size) and switch to open/limit.
  useEffect(() => {
    if (!inject) return;
    setTab("open");
    setOrdType("limit");
    if (inject.price != null) setPrice(Number(inject.price.toFixed(pxDp)));
    if (inject.size != null) { setUnit(isSwap ? "cont" : "coin"); setSize(Number(inject.size.toFixed(szDp))); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inject?.nonce]);

  if (!isAdmin) {
    return <div className="term-panel" style={{ padding: 14, color: "var(--app-text-2)", fontSize: 13 }}>{t("auth.viewerHint")}</div>;
  }

  return (
    <div className="term-panel" style={{ padding: "10px 14px", gap: 9, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      {/* Margin mode | leverage + position mode pills (AiCoin top row) */}
      {isSwap && (
        <div className="oe-pills">
          <span className="oe-pill oe-pill-grp">
            <button type="button" onClick={() => setMargin(margin === "cross" ? "isolated" : "cross")}>
              {t(margin === "cross" ? "term.cross" : "term.isolated")} <span className="chev">›</span>
            </button>
            <i className="sep">|</i>
            <button type="button" onClick={() => { setLevDraft(lever ?? 3); setLevOpen(true); }}>
              {lever ? `${fmtNum(lever, 0)}X` : DASH} <span className="chev">›</span>
            </button>
          </span>
          <button type="button" className="oe-pill" onClick={togglePosMode}>
            {posMode == null ? DASH : posMode === "long_short_mode" ? t("term.posMode") : t("term.posModeNet")} <span className="chev">›</span>
          </button>
        </div>
      )}

      {/* Leverage dialog (AiCoin-style: presets + slider + input) */}
      <Modal title={t("term.setLever")} open={levOpen} onCancel={() => setLevOpen(false)} onOk={submitLever}
        confirmLoading={levBusy} width={320} okText={t("common.save")} destroyOnHidden>
        <div className="oe-pcts" style={{ margin: "12px 0 4px" }}>
          {[1, 2, 3, 5, 10, 20, 50, 100].map((x) => (
            <button type="button" key={x} className={levDraft === x ? "on" : ""} onClick={() => setLevDraft(x)}>{x}X</button>
          ))}
        </div>
        <Slider min={1} max={100} value={levDraft} onChange={(v) => setLevDraft(v as number)} />
        <InputNumber style={{ width: "100%" }} min={1} max={125} value={levDraft}
          onChange={(v) => v != null && setLevDraft(Number(v))} addonAfter="X" />
        <div style={{ fontSize: 11, color: "var(--app-text-3)", marginTop: 8 }}>
          {inst} · {t(margin === "cross" ? "term.cross" : "term.isolated")}
        </div>
      </Modal>

      <SizePresetModal open={presetOpen} presets={presets}
        onClose={() => setPresetOpen(false)}
        onSave={(p) => {
          setPresets(p);
          try { localStorage.setItem(PRESETS_KEY, JSON.stringify(p)); } catch { /* ignore quota errors */ }
          setActivePct(null);
          setPresetOpen(false);
        }} />

      {/* Available balance + selected instrument */}
      <div className="oe-acct">
        <div className="r2">
          <span style={{ fontWeight: 600 }}>{inst.split("-")[0]}/{inst.split("-")[1]}</span>
          <span className="lbl">OKX {isSwap ? `${inst.split("-")[1]}${t("term.watch.swap")}` : t("term.watch.spot")}</span>
          <span style={{ flex: 1 }} />
          <span className="lbl">{t("term.avail")}({ccy})</span>
          <b className="mono">{avail != null ? fmtNum(avail) : DASH}</b>
        </div>
      </div>

      <div className="oe-tabs">
        <button type="button" className={tab === "open" ? "on-open" : ""} onClick={() => setTab("open")}>{t("term.open")}</button>
        <button type="button" className={tab === "close" ? "on-close" : ""} onClick={() => setTab("close")}>{t("term.close")}</button>
      </div>

      {tab === "open" ? (
        <>
          {renderPriceField()}

          <div>
            {renderSizeField()}
            {renderSizePresets()}
          </div>

          <div className="oe-can">
            <span>{t("common.size")} <b className="mono">{notional != null ? fmtNum(notional) : DASH}</b> {ccy}</span>
            <span>{t("common.size")} <b className="mono">{notional != null ? fmtNum(notional) : DASH}</b> {ccy}</span>
          </div>

          {maxCost != null && (
            <div className="oe-can">
              <span>{t("term.canLong")} <b className="mono">{fmtNum(maxCost)}</b> {ccy}</span>
              <span>{t("term.canShort")} <b className="mono">{fmtNum(maxCost)}</b> {ccy}</span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button block disabled={halted} loading={submitting === "buy"} onClick={() => submit("buy")}
              style={halted ? { height: 36, fontSize: 13 } : { background: "var(--up)", borderColor: "var(--up)", color: "#fff", fontWeight: 600, height: 36, borderRadius: 4, fontSize: 13, whiteSpace: "nowrap", padding: "0 4px" }}>{t("term.buyLong")}</Button>
            <Button block disabled={halted} loading={submitting === "sell"} onClick={() => submit("sell")}
              style={halted ? { height: 36, fontSize: 13 } : { background: "var(--down)", borderColor: "var(--down)", color: "#fff", fontWeight: 600, height: 36, borderRadius: 4, fontSize: 13, whiteSpace: "nowrap", padding: "0 4px" }}>{t("term.sellShort")}</Button>
          </div>
          {renderExecMode()}
          {halted && <div style={{ fontSize: 11, color: "#ea3943" }}>{t("term.halted")}</div>}
        </>
      ) : tab === "close" ? (
        <>
          {renderPriceField()}

          <div>
            {renderSizeField()}
            {renderSizePresets()}
          </div>

          <div className="oe-can">
            <span>{t("term.canCloseShort")} <b className="mono">{fmtNum(closeableShort, szDp)}</b></span>
            <span>{t("term.canCloseLong")} <b className="mono">{fmtNum(closeableLong, szDp)}</b></span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button block disabled={halted} loading={submitting === "buy"} onClick={() => submitClose("buy")}
              style={halted ? { height: 36, fontSize: 13 } : { background: "var(--up)", borderColor: "var(--up)", color: "#fff", fontWeight: 600, height: 36, borderRadius: 4, fontSize: 13, whiteSpace: "nowrap", padding: "0 4px" }}>{t("term.buyCloseShort")}</Button>
            <Button block disabled={halted} loading={submitting === "sell"} onClick={() => submitClose("sell")}
              style={halted ? { height: 36, fontSize: 13 } : { background: "var(--down)", borderColor: "var(--down)", color: "#fff", fontWeight: 600, height: 36, borderRadius: 4, fontSize: 13, whiteSpace: "nowrap", padding: "0 4px" }}>{t("term.sellCloseLong")}</Button>
          </div>
          {renderExecMode()}
          {halted && <div style={{ fontSize: 11, color: "#ea3943" }}>{t("term.halted")}</div>}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div className="oe-field">
            <span className="oe-field-label">{t("term.triggerPx")}</span>
            <InputNumber variant="borderless" controls={false} style={{ width: "100%" }} value={trigPx}
              onChange={(v) => setTrigPx(v as number | null)} min={0} step={pxStep} stringMode placeholder="0" />
            <span className="oe-field-unit">{ccy}</span>
          </div>
          <Segmented size="small" block value={trigMarket ? "market" : "limit"} onChange={(v) => setTrigMarket(v === "market")}
            options={[{ label: t("common.limit"), value: "limit" }, { label: t("common.market"), value: "market" }]} />
          {!trigMarket && (
            <div className="oe-field">
              <span className="oe-field-label">{t("term.orderPx")}</span>
              <InputNumber variant="borderless" controls={false} style={{ width: "100%" }} value={trigOrd}
                onChange={(v) => setTrigOrd(v as number | null)} min={0} step={pxStep} stringMode placeholder="0" />
              <span className="oe-field-unit">{ccy}</span>
            </div>
          )}
          <div>
            {renderSizeField()}
            {renderSizePresets()}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Button block disabled={halted} loading={submitting === "buy"} onClick={() => submitTrigger("buy")}
              style={halted ? { height: 38 } : { background: "var(--up)", borderColor: "var(--up)", color: "#fff", fontWeight: 600, height: 38 }}>{t("common.buy")}</Button>
            <Button block disabled={halted} loading={submitting === "sell"} onClick={() => submitTrigger("sell")}
              style={halted ? { height: 38 } : { background: "var(--down)", borderColor: "var(--down)", color: "#fff", fontWeight: 600, height: 38 }}>{t("common.sell")}</Button>
          </div>
          <div style={{ fontSize: 11, color: "var(--app-text-3)" }}>{t("term.triggerNote")}</div>
        </div>
      )}

      {/* Account summary (AiCoin sections: contract mode + assets) */}
      <div className="oe-account">
        <div className="oe-sec-h"><span>{t("term.account")}</span></div>
        {isSwap && (
          <>
            <div className="oe-sec-div" />
            <div className="oe-sec-h" style={{ fontSize: 12.5 }}><span>{t("term.ctMode")}</span></div>
            <div className="oe-meta"><span>{t("term.type")}</span><span>{ccy}{t(margin === "cross" ? "term.cross" : "term.isolated")}</span></div>
            <div className="oe-meta">
              <span>{t("term.mmr")}</span>
              <span className="mono">{account?.margin_ratio != null ? `${fmtNum(account.margin_ratio * 100, 2)}%` : t("term.noPosVal")}</span>
            </div>
          </>
        )}
        <div className="oe-sec-div" />
        <div className="oe-sec-h" style={{ fontSize: 12.5 }}>
          <span>{t("term.assets")}</span>
          <span className="lbl">{t("term.unit")}: {ccy}</span>
        </div>
        <div className="oe-meta"><span>{t("term.totalAsset")}</span><span className="mono">{account ? fmtNum(account.total_equity) : DASH}</span></div>
        <div className="oe-meta"><span>{t("term.upl")}</span><span className="mono" style={{ color: pnlColor(account?.unrealized_pnl) }}>{account ? fmtNum(account.unrealized_pnl, 2) : DASH}</span></div>
        <div className="oe-meta"><span>{t("term.avail")}</span><span className="mono">{avail != null ? fmtNum(avail) : DASH}</span></div>
      </div>

      <div style={{ fontSize: 11, color: "var(--app-text-3)" }}>{t("term.demoNote")}</div>
    </div>
  );
}
