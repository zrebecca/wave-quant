import { useEffect, useRef } from "react";
import api from "@/api/client";
import { useI18n } from "@/i18n";
import { useAuth } from "@/store/AuthContext";
import { usePrefs } from "@/store/PrefsContext";
import { useThemeMode } from "@/store/ThemeContext";

/**
 * Reconciles the display preferences (设置) with the server so they follow the
 * account across browsers/ports/devices. The DB is the source of truth; the
 * per-context localStorage writes are just an instant-render cache.
 *
 * On login we hydrate from the server (applying theme / 涨跌色 / 价格单位 / 语言 /
 * 币种图标 into their contexts). If the user has no row yet (`stored === false`)
 * we migrate the current local settings up instead of overwriting them. After
 * hydration, any change is debounced back to the server.
 *
 * Renders nothing — mount it once inside the providers it talks to.
 */
export default function PrefsSync() {
  const { isAuthenticated } = useAuth();
  const { mode, setMode } = useThemeMode();
  const { upDown, setUpDown, fiat, setFiat, coinIcons, setCoinIcons } = usePrefs();
  const { lang, setLang } = useI18n();

  // Latest values, readable inside async callbacks without re-subscribing.
  const cur = useRef({ mode, upDown, fiat, lang, coinIcons });
  cur.current = { mode, upDown, fiat, lang, coinIcons };

  const hydrated = useRef(false);

  // Hydrate (or migrate) when the auth state flips to logged-in.
  useEffect(() => {
    if (!isAuthenticated) {
      hydrated.current = false; // re-sync on next login
      return;
    }
    let cancelled = false;
    api.getPrefs()
      .then((p) => {
        if (cancelled) return;
        if (p.stored) {
          if (p.theme !== cur.current.mode) setMode(p.theme);
          if (p.up_down !== cur.current.upDown) setUpDown(p.up_down);
          if (p.fiat !== cur.current.fiat) setFiat(p.fiat);
          if (p.lang !== cur.current.lang) setLang(p.lang);
          if (p.coin_icons !== cur.current.coinIcons) setCoinIcons(p.coin_icons);
        } else {
          // No server row yet → push the current local settings up so they persist.
          const c = cur.current;
          api.savePrefs({
            theme: c.mode, up_down: c.upDown, fiat: c.fiat, lang: c.lang, coin_icons: c.coinIcons,
          }).catch(() => {});
        }
      })
      .catch(() => {}) // offline / not authed → keep local state
      .finally(() => { if (!cancelled) hydrated.current = true; });
    return () => { cancelled = true; };
  }, [isAuthenticated, setMode, setUpDown, setFiat, setLang, setCoinIcons]);

  // Persist changes back to the server (debounced) once hydrated.
  useEffect(() => {
    if (!isAuthenticated || !hydrated.current) return;
    const id = setTimeout(() => {
      api.savePrefs({ theme: mode, up_down: upDown, fiat, lang, coin_icons: coinIcons }).catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [isAuthenticated, mode, upDown, fiat, lang, coinIcons]);

  return null;
}
