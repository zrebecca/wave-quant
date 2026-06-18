import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ThemeMode } from "@/theme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: "dark", setMode: () => {} });

export const useThemeMode = () => useContext(ThemeContext);

const STORAGE_KEY = "okx_theme";

function detectInitial(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

/** Render-prop provider so the parent can feed `mode` into Ant Design's ConfigProvider. */
export function ThemeProvider({ children }: { children: (mode: ThemeMode) => ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(detectInitial);

  const setMode = useCallback((m: ThemeMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    setModeState(m);
  }, []);

  // Drive CSS variables (used by inline styles outside Antd components).
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return <ThemeContext.Provider value={value}>{children(mode)}</ThemeContext.Provider>;
}
