import { Segmented, Switch } from "antd";
import { useI18n } from "@/i18n";
import type { Lang } from "@/i18n/messages";
import { usePrefs } from "@/store/PrefsContext";
import { useThemeMode } from "@/store/ThemeContext";
import type { ThemeMode } from "@/theme";

/** One AiCoin-style settings row: label (+ optional hint) on the left, control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span>{label}</span>
        {hint && <span className="set-hint">{hint}</span>}
      </div>
      <div className="set-ctrl">{children}</div>
    </div>
  );
}

/** Light/dark preview tile (AiCoin 亮白/暗黑 cards). */
function ThemeTile({ tone, active, label, onClick }: { tone: ThemeMode; active: boolean; label: string; onClick: () => void }) {
  const dark = tone === "dark";
  const bg = dark ? "#0e141b" : "#ffffff";
  const bar = dark ? "#222b38" : "#e9ecf1";
  return (
    <button type="button" className={`set-tile${active ? " on" : ""}`} onClick={onClick}>
      <span className="set-tile-prev" style={{ background: bg, borderColor: bar }}>
        <span className="set-tile-bar" style={{ background: "var(--up)" }} />
        <span className="set-tile-bar sm" style={{ background: bar }} />
        <span className="set-tile-dot" style={{ background: "var(--up)" }} />
        <span className="set-tile-dot" style={{ background: "var(--down)", left: 26 }} />
      </span>
      <span className="set-tile-label">{label}</span>
    </button>
  );
}

/** The settings rows themselves — reused by the standalone page and the rail dialog. */
export function SettingsContent() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useThemeMode();
  const { upDown, setUpDown, fiat, setFiat, coinIcons, setCoinIcons } = usePrefs();

  return (
    <div className="set-rows">
      <Row label={t("settings.theme")}>
          <div className="set-tiles">
            <ThemeTile tone="light" active={mode === "light"} label={t("settings.light")} onClick={() => setMode("light")} />
            <ThemeTile tone="dark" active={mode === "dark"} label={t("settings.dark")} onClick={() => setMode("dark")} />
          </div>
        </Row>

        <Row label={t("settings.upDownColor")}>
          <Segmented value={upDown} onChange={(v) => setUpDown(v as "green" | "red")}
            options={[
              { label: t("settings.greenUp"), value: "green" },
              { label: t("settings.redUp"), value: "red" },
            ]} />
        </Row>

        <Row label={t("settings.priceUnit")} hint={t("settings.priceUnitHint")}>
          <Segmented value={fiat} onChange={(v) => setFiat(v as "USD" | "CNY")}
            options={[{ label: "USD", value: "USD" }, { label: "CNY", value: "CNY" }]} />
        </Row>

        <Row label={t("settings.language")}>
          <Segmented value={lang} onChange={(v) => setLang(v as Lang)}
            options={[
              { label: "English", value: "en" },
              { label: "简体", value: "zh" },
              { label: "繁體", value: "zh-TW" },
            ]} />
        </Row>

      <Row label={t("settings.klineSide")}>
        <span className="set-switch">
          <span>{t("settings.showCoinIcons")}</span>
          <Switch checked={coinIcons} onChange={setCoinIcons} />
        </span>
      </Row>
    </div>
  );
}

/** Standalone settings page (still routable); the rail dialog reuses SettingsContent. */
export default function Settings() {
  const { t } = useI18n();
  return (
    <div className="set-page">
      <div className="set-card">
        <div className="set-card-h">{t("settings.general")}</div>
        <SettingsContent />
      </div>
    </div>
  );
}
