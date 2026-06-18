import { SearchOutlined, WarningFilled } from "@ant-design/icons";
import { Input, Segmented, Table, Tag, Tooltip } from "antd";
import { useMemo, useState } from "react";
import {
  CAT_LABEL_EN, CAT_LABEL_ZH, CORE_IDS, LIB_CATEGORIES, STRATEGIES, isHighRiskStrategy, templateType,
  type Difficulty, type Direction, type Risk, type TemplateType, type Strategy,
} from "@/data/strategyLibrary";
import { useI18n } from "@/i18n";

// 经典策略库 — 策略百科 / 模板展示 / 学习参考。8 大类、产品化字段、筛选/搜索、可展开详情。
// 仅供浏览、学习、理解、筛选、对比、查看风险；不涉及执行 / 下单 / 回测 / 模拟盘 / 实盘 / 创建实例。

const RISK_META: Record<Risk, [string, string]> = {
  1: ["strat.lib.riskLow", "#16c784"],
  2: ["strat.lib.riskMid", "#f0a020"],
  3: ["strat.lib.riskHigh", "#ea3943"],
};
const DIFF_KEY: Record<Difficulty, string> = {
  1: "strat.lib.diffEasy", 2: "strat.lib.diffMid", 3: "strat.lib.diffHard",
};
const DIR_KEY: Record<Direction, string> = {
  long: "strat.lib.dirLong", short: "strat.lib.dirShort", both: "strat.lib.dirBoth", neutral: "strat.lib.dirNeutral",
};
// 模板类型 → [i18n key, tag color]（空字符串 = 默认灰底）。
const TEMPLATE_META: Record<TemplateType, [string, string]> = {
  core: ["strat.lib.tCore", "#16c784"],
  classic: ["strat.lib.tClassic", ""],
  advanced: ["strat.lib.tAdvanced", "#f0a020"],
  reference: ["strat.lib.tReference", ""],
  highrisk: ["strat.lib.tHighRisk", "#ea3943"],
};

export default function StrategyLibrary() {
  const { t, lang } = useI18n();
  const zh = lang !== "en";
  const [cat, setCat] = useState<string>("all");
  const [risk, setRisk] = useState<string>("all");
  const [dir, setDir] = useState<string>("all");
  const [coreOnly, setCoreOnly] = useState(false);
  const [q, setQ] = useState("");

  const name = (s: Strategy) => (zh ? s.nameZh : s.nameEn);
  const catName = (k: string) => (zh ? CAT_LABEL_ZH[k] : CAT_LABEL_EN[k]);
  const dirColor = (d: Direction) => (d === "short" ? "var(--down)" : d === "neutral" ? "var(--app-text-3)" : d === "long" ? "var(--up)" : "var(--app-text)");

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return STRATEGIES.filter((s) =>
      (cat === "all" || s.category === cat) &&
      (risk === "all" || String(s.risk) === risk) &&
      (dir === "all" || s.direction === dir) &&
      (!coreOnly || CORE_IDS.has(s.id)) &&
      (!kw || `${s.nameZh} ${s.nameEn} ${s.coreIndicators.join(" ")} ${s.tags.join(" ")} ${s.principle} ${s.marketCondition}`.toLowerCase().includes(kw))
    );
  }, [cat, risk, dir, coreOnly, q]);

  // Per-category counts for the tab labels.
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of STRATEGIES) m[s.category] = (m[s.category] || 0) + 1;
    return m;
  }, []);

  const riskTag = (r: Risk) => {
    const [k, c] = RISK_META[r];
    return <Tag color={c} style={{ borderRadius: 6, margin: 0 }}>{t(k)}</Tag>;
  };

  const detail = (s: Strategy) => {
    const block = (title: string, body: React.ReactNode) =>
      body == null || (Array.isArray(body) && body.length === 0) ? null : (
        <div className="stlib-d-block">
          <div className="stlib-d-h">{title}</div>
          <div className="stlib-d-b">{body}</div>
        </div>
      );
    const list = (items?: string[]) => items && items.length ? <ul className="stlib-d-ul">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null;
    return (
      <div className="stlib-detail">
        {isHighRiskStrategy(s) && (
          <div className="stlib-warn">
            <WarningFilled />
            <div>
              <div>{t("strat.lib.highRiskWarn")}</div>
              {s.id === "martingale" && <div className="stlib-warn-extra">{t("strat.lib.martingaleWarn")}</div>}
            </div>
          </div>
        )}
        <div className="stlib-d-grid">
          {block(t("strat.lib.dSummary"), s.summary || s.principle)}
          {block(t("strat.lib.dMarket"), s.marketCondition)}
          {block(t("strat.lib.dNotFit"), s.notSuitable)}
          {block(t("strat.lib.dIndicators"), <div className="stlib-chips">{s.coreIndicators.map((x, i) => <span key={i} className="stlib-chip">{x}</span>)}</div>)}
          {block(t("strat.lib.dEntry"), list(s.entryRules))}
          {block(t("strat.lib.dExit"), list(s.exitRules))}
          {block(t("strat.lib.dTpSl"), s.tpSl)}
          {block(t("strat.lib.dPos"), s.positionMgmt)}
          {block(t("strat.lib.dRisk"), s.riskNotes)}
          {block(t("strat.lib.dExample"), s.exampleSignal)}
          {s.parameters?.length ? block(t("strat.lib.dParams"),
            <div className="stlib-params">
              {s.parameters.map((p) => (
                <div className="stlib-param" key={p.key}>
                  <span className="stlib-param-k">{p.label}</span>
                  <span className="stlib-param-v">{p.default}{p.unit ? ` ${p.unit}` : ""}</span>
                </div>
              ))}
            </div>) : null}
          {block(t("strat.lib.dMarkets"),
            <div className="stlib-chips">
              {s.suitableMarkets.map((x, i) => <span key={i} className="stlib-chip ghost">{x}</span>)}
            </div>)}
          {block(t("strat.lib.dUseFor"),
            <div className="stlib-chips">
              {t("strat.lib.useForList").split(" / ").map((x) => <span key={x} className="stlib-chip">{x}</span>)}
            </div>)}
        </div>
      </div>
    );
  };

  return (
    <div className="stlib">
      <div className="stlib-head">
        <h2 className="st-title" style={{ margin: 0 }}>{t("strat.lib.title")}</h2>
        <span className="stlib-sub">{t("strat.lib.subtitle")}</span>
        <span style={{ flex: 1 }} />
        <Input allowClear size="small" prefix={<SearchOutlined style={{ color: "var(--app-text-3)" }} />}
          placeholder={t("strat.lib.search")} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
      </div>

      {/* Category tabs */}
      <div className="stlib-tabs">
        <button type="button" className={`stlib-tab${cat === "all" ? " on" : ""}`} onClick={() => setCat("all")}>
          {t("strat.lib.allCat")}<i>{STRATEGIES.length}</i>
        </button>
        {LIB_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={`stlib-tab${cat === c.key ? " on" : ""}`} onClick={() => setCat(c.key)}>
            {catName(c.key)}<i>{counts[c.key] || 0}</i>
          </button>
        ))}
      </div>

      {cat !== "all" && <div className="stlib-catdesc">{LIB_CATEGORIES.find((c) => c.key === cat)?.desc}</div>}

      {/* Filters */}
      <div className="stlib-filters">
        <span className="stlib-flbl">{t("strat.tbl.risk")}</span>
        <Segmented size="small" value={risk} onChange={(v) => setRisk(v as string)}
          options={[
            { label: t("strat.tbl.all"), value: "all" },
            { label: t("strat.lib.riskLow"), value: "1" },
            { label: t("strat.lib.riskMid"), value: "2" },
            { label: t("strat.lib.riskHigh"), value: "3" },
          ]} />
        <span className="stlib-flbl">{t("strat.tbl.dir")}</span>
        <Segmented size="small" value={dir} onChange={(v) => setDir(v as string)}
          options={[
            { label: t("strat.tbl.all"), value: "all" },
            { label: t("strat.lib.dirLong"), value: "long" },
            { label: t("strat.lib.dirShort"), value: "short" },
            { label: t("strat.lib.dirBoth"), value: "both" },
            { label: t("strat.lib.dirNeutral"), value: "neutral" },
          ]} />
        <button type="button" className={`stlib-core${coreOnly ? " on" : ""}`} onClick={() => setCoreOnly((v) => !v)}>
          {t("strat.lib.coreOnly")}
        </button>
      </div>

      <Table<Strategy> rowKey="id" size="small" pagination={false} className="st-classic stlib-table"
        dataSource={rows}
        expandable={{ expandedRowRender: detail, expandRowByClick: true, rowExpandable: () => true }}
        columns={[
          {
            title: t("strat.tbl.name"), dataIndex: "nameZh", width: 190,
            render: (_: string, s: Strategy) => (
              <div>
                <div style={{ fontWeight: 600, color: "var(--app-text)", display: "flex", alignItems: "center", gap: 6 }}>
                  {name(s)}
                  {isHighRiskStrategy(s) && <Tooltip title={t("strat.lib.highRiskWarn")}><WarningFilled style={{ color: "#ea3943", fontSize: 12 }} /></Tooltip>}
                </div>
                <div style={{ fontSize: 11, color: "var(--app-text-3)" }}>{zh ? s.nameEn : s.nameZh}</div>
              </div>
            ),
          },
          { title: t("strat.lib.colCat"), dataIndex: "category", width: 110, render: (v: string) => <Tag style={{ borderRadius: 6 }}>{catName(v)}</Tag> },
          { title: t("strat.tbl.regime"), dataIndex: "marketCondition", width: 130, render: (v: string) => <span style={{ color: "var(--app-text-2)" }}>{v}</span> },
          { title: t("strat.tbl.ind"), dataIndex: "coreIndicators", width: 220, render: (v: string[]) => <span style={{ color: "var(--app-text-2)", fontSize: 12 }}>{v.join(" · ")}</span> },
          { title: t("strat.tbl.dir"), dataIndex: "direction", width: 76, render: (v: Direction) => <span style={{ color: dirColor(v), fontWeight: 600 }}>{t(DIR_KEY[v])}</span> },
          { title: t("strat.tbl.risk"), dataIndex: "risk", width: 70, sorter: (a: Strategy, b: Strategy) => a.risk - b.risk, render: (v: Risk) => riskTag(v) },
          { title: t("strat.lib.colDiff"), dataIndex: "difficulty", width: 72, sorter: (a: Strategy, b: Strategy) => a.difficulty - b.difficulty, render: (v: Difficulty) => <span style={{ color: "var(--app-text-2)" }}>{t(DIFF_KEY[v])}</span> },
          {
            title: t("strat.lib.colTemplate"), key: "templateType", width: 92,
            render: (_: unknown, s: Strategy) => {
              const [k, c] = TEMPLATE_META[templateType(s)];
              return c
                ? <Tag color={c} style={{ borderRadius: 6, margin: 0 }}>{t(k)}</Tag>
                : <Tag style={{ borderRadius: 6, margin: 0 }}>{t(k)}</Tag>;
            },
          },
          { title: t("strat.lib.colTags"), dataIndex: "tags", width: 200, render: (v: string[]) => <span className="stlib-tagrow">{v.slice(0, 3).map((x, i) => <span key={i} className="stlib-minichip">{x}</span>)}</span> },
          // Trailing filler: absorbs leftover width so the data columns end at a fixed
          // edge (= --stlib-cols), which the header search box is aligned to.
          { title: "", key: "_filler", render: () => null },
        ]} />
    </div>
  );
}
