import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Converter } from "opencc-js";
import { type BaseLang, type Lang, messages } from "./messages";

// 繁體 is generated from the 简体 dictionary at runtime (Simplified → Traditional, Taiwan).
const s2t = Converter({ from: "cn", to: "tw" });
const twCache = new Map<string, string>();
const toTW = (s: string): string => {
  let v = twCache.get(s);
  if (v === undefined) { v = s2t(s); twCache.set(s, v); }
  return v;
};

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a key; supports {name} placeholder substitution. */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export const useI18n = () => useContext(I18nContext);

const STORAGE_KEY = "okx_lang";

function detectInitial(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "zh" || saved === "zh-TW") return saved;
  return "en";
}

export function I18nProvider({ children }: { children: (lang: Lang) => ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const base: BaseLang = lang === "en" ? "en" : "zh";
      let str = messages[base][key] ?? messages.en[key] ?? key;
      if (lang === "zh-TW") str = toTW(str);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  // children is a render-prop so the parent (main.tsx) can feed `lang` into
  // Ant Design's ConfigProvider locale.
  return <I18nContext.Provider value={value}>{children(lang)}</I18nContext.Provider>;
}
