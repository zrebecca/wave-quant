import {
  AppstoreOutlined, ControlOutlined, DollarCircleOutlined, LineChartOutlined,
  ReadOutlined, RetweetOutlined, TableOutlined, TeamOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import StrategyLibrary from "@/components/StrategyLibrary";
import { useI18n } from "@/i18n";
import StrategyParams from "@/pages/StrategyParams";

// ── Showcase data (UI demonstration only; we have no live strategy marketplace) ──
type Side = "long" | "short" | "neutral" | "buy";
const sideColor = (s: Side) => (s === "short" ? "var(--down)" : s === "neutral" ? "var(--app-text-3)" : "var(--up)");
const pc = (v: number) => (v >= 0 ? "var(--up)" : "var(--down)");

const DCA_CARDS = [
  { profit: 53.29, mode: "合约DCA 做空", scope: "市值前 50", coins: ["BTC", "ETH", "SOL"], extra: 29 },
  { profit: 121.1, mode: "合约DCA 做空", scope: "热门板块", coins: ["SOL", "DOGE", "XRP"], extra: 2 },
  { profit: 8.33, mode: "现货DCA 做多", scope: "市值前 10", coins: ["BTC", "ETH", "BNB"], extra: 3 },
  { profit: 24.65, mode: "现货DCA 做多", scope: "AI Agents", coins: ["SOL", "DOGE"], extra: 5 },
];
const SPOT_GRID = [
  { name: "BTC 低买高卖 · 3日", pair: "BTC/USDT", profit: 3.61, side: "buy" as Side, users: 3701 },
  { name: "ETH 低买高卖 · 7日", pair: "ETH/USDT", profit: 1.68, side: "buy" as Side, users: 2440 },
  { name: "SOL 低买高卖 · 1月", pair: "SOL/USDT", profit: 1.04, side: "buy" as Side, users: 3879 },
  { name: "BNB 低买高卖 · 3日", pair: "BNB/USDT", profit: 3.74, side: "buy" as Side, users: 2605 },
];
const FUT_GRID = [
  { name: "BTC 经典网格 · 3日", pair: "BTC/USDT 永续", profit: 10.41, side: "long" as Side, users: 2329 },
  { name: "ETH 经典网格 · 7日", pair: "ETH/USDT 永续", profit: 9.17, side: "short" as Side, users: 3300 },
  { name: "SOL 经典网格 · 3日", pair: "SOL/USDT 永续", profit: 8.67, side: "neutral" as Side, users: 2972 },
  { name: "DOGE 经典网格 · 3日", pair: "DOGE/USDT 永续", profit: 8.67, side: "short" as Side, users: 2333 },
];
const AI_GRID = [
  { coin: "TAO", term: "短期", profit: 15.03, side: "long" as Side, run: "3-7 天", grid: "2.14%-4.38%" },
  { coin: "LTC", term: "短中期", profit: 16.57, side: "short" as Side, run: "7-20 天", grid: "0.95%-2.95%" },
  { coin: "AXS", term: "短期", profit: 14.66, side: "neutral" as Side, run: "3-7 天", grid: "0.74%-1.04%" },
  { coin: "SAND", term: "短期", profit: 16.36, side: "short" as Side, run: "3-7 天", grid: "0.86%-1.25%" },
  { coin: "GRT", term: "短中期", profit: 14.91, side: "neutral" as Side, run: "7-20 天", grid: "0.69%-1.92%" },
  { coin: "BRETT", term: "短中期", profit: 14.97, side: "short" as Side, run: "7-20 天", grid: "0.77%-1.98%" },
];
// A few normalized sparkline series (0..1) for the indicator cards.
const SPARKS = [
  [.2, .3, .25, .45, .5, .42, .6, .7, .65, .82, .9],
  [.5, .55, .48, .6, .52, .66, .58, .72, .8, .76, .88],
  [.6, .5, .55, .4, .48, .35, .42, .3, .36, .28, .2],
  [.4, .45, .5, .47, .55, .6, .52, .58, .5, .54, .6],
];
const INDICATORS = [
  { name: "小币种马丁格尔牛市版", ret: 15.55, win: 88.33, author: "Blank", views: 3245, likes: 771, s: 0 },
  { name: "BTC 多空比马丁策略", ret: 18.66, win: 71.05, author: "QuantBridge", views: 138, likes: 54, s: 1 },
  { name: "EMA 共振指标", ret: 13.64, win: 56.34, author: "研究院", views: 2384, likes: 316, s: 1 },
  { name: "现货 BTC ETF 跟踪", ret: 38.51, win: 52.97, author: "小编", views: 6109, likes: 1951, s: 1 },
  { name: "TD 指标震荡策略", ret: -7.01, win: 59.38, author: "研究院", views: 5194, likes: 650, s: 2 },
  { name: "顺势而为 BTC 策略", ret: 0.96, win: 88.89, author: "Blank", views: 2575, likes: 976, s: 3 },
  { name: "短线 DCA 策略", ret: -25.55, win: 63.27, author: "小编", views: 5567, likes: 817, s: 2 },
  { name: "AI 中性网格", ret: -19.88, win: 68.42, author: "小编", views: 4137, likes: 585, s: 2 },
];
const COPY_TRADERS = [
  { name: "BTC 趋势巨鲸", ret: 524.31, win: 59.02, aum: 135150, s: 1 },
  { name: "Andrew Kang", ret: -3.4, win: 42.1, aum: 90, s: 2 },
  { name: "高频套利号", ret: 12.6, win: 61.3, aum: 67, s: 0 },
  { name: "稳健网格手", ret: 8.9, win: 70.5, aum: 100, s: 3 },
  { name: "量化中性 Alpha", ret: 21.4, win: 64.8, aum: 36, s: 1 },
  { name: "波段猎手", ret: -1.17, win: 77.2, aum: 101, s: 2 },
];
const ARB = [
  { coin: "UNI", combo: "卖 UNI/USD · 买 UNI/USDT", apr: 10.95, spread: 0.0, apr7: 10.25 },
  { coin: "DEXE", combo: "卖 DEXE/USDT · 买 DEXE/USDT", apr: 6.74, spread: 0.27, apr7: 42.99 },
  { coin: "SWARMS", combo: "卖 SWARMS/USDT · 买 SWARMS/USDT", apr: 5.39, spread: 0.04, apr7: 24.47 },
  { coin: "TST", combo: "卖 TST/USDT · 买 TST/USDT", apr: 4.1, spread: 0.0, apr7: 10.95 },
  { coin: "SAGA", combo: "卖 SAGA/USDT · 买 SAGA/USDT", apr: 4.1, spread: 0.0, apr7: 10.15 },
  { coin: "ACX", combo: "卖 ACX/USDT · 买 ACX/USDT", apr: 4.1, spread: 0.0, apr7: 10.95 },
  { coin: "VANA", combo: "卖 VANA/USDT · 买 VANA/USDT", apr: 4.1, spread: 0.0, apr7: 10.87 },
  { coin: "BLUR", combo: "卖 BLUR/USDT · 买 BLUR/USDT", apr: 4.1, spread: 0.0, apr7: 7.5 },
];

function CoinDot({ sym, i = 0 }: { sym: string; i?: number }) {
  const hue = (sym.charCodeAt(0) * 37 + i * 53) % 360;
  return <span className="st-coin" style={{ background: `hsl(${hue} 65% 55%)`, marginLeft: i ? -6 : 0, zIndex: 10 - i }}>{sym[0]}</span>;
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 120, h = 36;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - v * h}`).join(" ");
  return (
    <svg className="st-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

export default function Strategy() {
  const { t } = useI18n();
  const [tab, setTab] = useState("params");

  const nav: { key: string; icon: React.ReactNode; title: string; sub: string; hot?: boolean }[] = [
    { key: "params", icon: <ControlOutlined />, title: t("strat.nav.params"), sub: t("strat.nav.paramsSub") },
    { key: "classic", icon: <ReadOutlined />, title: t("strat.nav.classic"), sub: t("strat.nav.classicSub") },
    { key: "square", icon: <AppstoreOutlined />, title: t("strat.nav.square"), sub: t("strat.nav.squareSub") },
    { key: "arb", icon: <RetweetOutlined />, title: t("strat.nav.arb"), sub: t("strat.nav.arbSub"), hot: true },
    { key: "dca", icon: <DollarCircleOutlined />, title: t("strat.nav.dca"), sub: t("strat.nav.dcaSub") },
    { key: "aigrid", icon: <TableOutlined />, title: t("strat.nav.aigrid"), sub: t("strat.nav.aigridSub") },
    { key: "indicator", icon: <LineChartOutlined />, title: t("strat.nav.indicator"), sub: t("strat.nav.indicatorSub") },
    { key: "copy", icon: <TeamOutlined />, title: t("strat.nav.copy"), sub: t("strat.nav.copySub") },
  ];

  const runBtn = (label: string, primary = false) => (
    <button type="button" className={`st-run${primary ? " primary" : ""}`} onClick={() => setTab("params")}>{label}</button>
  );

  const sectionHead = (title: string) => (
    <div className="st-sec-h"><span>{title}</span><a className="st-more">{t("strat.more")} ›</a></div>
  );

  return (
    <div className="st-wrap">
      {/* Left sub-nav */}
      <div className="st-nav">
        {nav.map((n) => (
          <button key={n.key} type="button" className={`st-nav-item${tab === n.key ? " on" : ""}`} onClick={() => setTab(n.key)}>
            <span className="st-nav-ico">{n.icon}</span>
            <span className="st-nav-txt">
              <span className="st-nav-title">{n.title}{n.hot && <i className="st-hot">HOT</i>}</span>
              <span className="st-nav-sub">{n.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="st-main">
        {!["params", "classic"].includes(tab) && <div className="st-demo">{t("strat.demoNote")}</div>}

        {tab === "classic" && <StrategyLibrary />}

        {tab === "square" && (
          <>
            <h2 className="st-title">{t("strat.featured")}</h2>
            {sectionHead(t("strat.nav.dca"))}
            <div className="st-grid">
              {DCA_CARDS.map((c, i) => (
                <div className="st-card" key={i}>
                  <div className="st-card-top"><span className="st-lbl">{t("strat.monthProfit")}</span></div>
                  <div className="st-profit" style={{ color: pc(c.profit) }}>+{c.profit}%</div>
                  <div className="st-card-meta">
                    <span>{c.mode}</span>
                    <span className="st-coins">{c.coins.map((s, j) => <CoinDot key={j} sym={s} i={j} />)}<i className="st-more-n">+{c.extra}</i></span>
                  </div>
                  <div className="st-card-sub">{c.scope}</div>
                  {runBtn(t("strat.run"), i === 0)}
                </div>
              ))}
            </div>

            {sectionHead(t("strat.spotGrid"))}
            <div className="st-grid">{SPOT_GRID.map((c, i) => <GridCard key={i} c={c} t={t} run={runBtn} />)}</div>

            {sectionHead(t("strat.futGrid"))}
            <div className="st-grid">{FUT_GRID.map((c, i) => <GridCard key={i} c={c} t={t} run={runBtn} />)}</div>
          </>
        )}

        {tab === "dca" && (
          <>
            <h2 className="st-title">{t("strat.nav.dca")}</h2>
            <div className="st-grid">
              {[...DCA_CARDS, ...DCA_CARDS].map((c, i) => (
                <div className="st-card" key={i}>
                  <div className="st-card-top"><span className="st-lbl">{t("strat.monthProfit")}</span></div>
                  <div className="st-profit" style={{ color: pc(c.profit) }}>+{c.profit}%</div>
                  <div className="st-card-meta"><span>{c.mode}</span><span className="st-coins">{c.coins.map((s, j) => <CoinDot key={j} sym={s} i={j} />)}</span></div>
                  <div className="st-card-sub">{c.scope}</div>
                  {runBtn(t("strat.run"))}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "aigrid" && (
          <>
            <h2 className="st-title">{t("strat.nav.aigrid")}</h2>
            <div className="st-grid">
              {AI_GRID.map((c, i) => (
                <div className="st-card" key={i}>
                  <div className="st-card-top"><b>{c.coin}/USDT 永续</b><span style={{ color: sideColor(c.side), fontSize: 12 }}>{t(`strat.${c.side}`)}</span></div>
                  <div className="st-profit" style={{ color: pc(c.profit) }}>+{c.profit}%</div>
                  <div className="st-lbl" style={{ marginBottom: 8 }}>{t("strat.monthProfit")}</div>
                  <div className="st-kv"><span>{t("strat.maxRun")}</span><b>{c.run}</b></div>
                  <div className="st-kv"><span>{t("strat.perGrid")}</span><b>{c.grid}</b></div>
                  {runBtn(t("strat.run"))}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "indicator" && (
          <>
            <h2 className="st-title">{t("strat.community")}</h2>
            <div className="st-grid st-grid-5">
              {INDICATORS.map((c, i) => (
                <div className="st-card" key={i}>
                  <div className="st-ind-name">{c.name}</div>
                  <div className="st-lbl">{t("strat.monthProfit")}</div>
                  <div className="st-ind-row">
                    <span className="st-profit sm" style={{ color: pc(c.ret) }}>{c.ret >= 0 ? "+" : ""}{c.ret}%</span>
                    <Spark data={SPARKS[c.s]} color={pc(c.ret)} />
                  </div>
                  <div className="st-kv"><span>{t("strat.winRate")} {c.win}%</span><span className="st-meta-r">👁 {c.views} · ♥ {c.likes}</span></div>
                  <div className="st-card-sub">{c.author}</div>
                  <div className="st-btn-row">
                    <button type="button" className="st-run ghost" onClick={() => setTab("params")}>{t("strat.detail")}</button>
                    <button type="button" className="st-run" onClick={() => setTab("params")}>{t("strat.runLive")}</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "copy" && (
          <>
            <h2 className="st-title">{t("strat.nav.copy")}</h2>
            <div className="st-grid st-grid-5">
              {COPY_TRADERS.map((c, i) => (
                <div className="st-card" key={i}>
                  <div className="st-card-top"><CoinDot sym={c.name} /><b style={{ marginLeft: 8 }}>{c.name}</b></div>
                  <div className="st-lbl">{t("strat.return7d")}</div>
                  <div className="st-ind-row">
                    <span className="st-profit sm" style={{ color: pc(c.ret) }}>{c.ret >= 0 ? "+" : ""}{c.ret}%</span>
                    <Spark data={SPARKS[c.s]} color={pc(c.ret)} />
                  </div>
                  <div className="st-kv"><span>{t("strat.winRate")}</span><b>{c.win}%</b></div>
                  <div className="st-kv"><span>{t("strat.scale")}</span><b>${c.aum.toLocaleString()}</b></div>
                  {runBtn(t("strat.copyNow"))}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "arb" && (
          <>
            <h2 className="st-title">{t("strat.nav.arb")}</h2>
            <div className="st-table">
              <div className="st-tr st-th">
                <span>{t("strat.arb.coin")}</span><span className="l">{t("strat.arb.combo")}</span>
                <span className="r">{t("strat.arb.apr")}</span><span className="r">{t("strat.arb.spread")}</span>
                <span className="r">{t("strat.arb.apr7")}</span><span className="r">{t("strat.arb.go")}</span>
              </div>
              {ARB.map((r, i) => (
                <div className="st-tr" key={i}>
                  <span><CoinDot sym={r.coin} /> <b style={{ marginLeft: 6 }}>{r.coin}</b></span>
                  <span className="l st-combo">{r.combo}</span>
                  <span className="r mono" style={{ color: "var(--up)" }}>{r.apr}%</span>
                  <span className="r mono">{r.spread}%</span>
                  <span className="r mono" style={{ color: "var(--up)" }}>{r.apr7}%</span>
                  <span className="r">{runBtn(t("strat.arb.go"))}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "params" && <StrategyParams />}
      </div>
    </div>
  );
}


// Spot/futures grid card.
function GridCard({ c, t, run }: { c: { name: string; pair: string; profit: number; side: Side; users: number }; t: (k: string) => string; run: (l: string) => React.ReactNode }) {
  return (
    <div className="st-card">
      <div className="st-card-top"><b>{c.name}</b><span style={{ color: sideColor(c.side), fontSize: 12 }}>{t(`strat.${c.side}`)}</span></div>
      <div className="st-lbl">{t("strat.monthProfit")}</div>
      <div className="st-profit" style={{ color: pc(c.profit) }}>+{c.profit}%</div>
      <div className="st-kv"><span>{c.pair}</span><span className="st-meta-r">👥 {c.users.toLocaleString()}</span></div>
      {run(t("strat.run"))}
    </div>
  );
}
