import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Market-display preferences (AiCoin-style settings), persisted per client.
// - upDown: which side is green. "green" = 绿涨红跌 (rise green), "red" = 红涨绿跌 (rise red).
// - fiat:   quote display currency for 行情 prices. Trading stays in the instrument's real ccy.
// - coinIcons: show coin logos in the left watchlist.
export type UpDown = "green" | "red";
export type Fiat = "USD" | "CNY";

interface PrefsContextValue {
  upDown: UpDown;
  setUpDown: (v: UpDown) => void;
  fiat: Fiat;
  setFiat: (v: Fiat) => void;
  coinIcons: boolean;
  setCoinIcons: (v: boolean) => void;
}

const PrefsContext = createContext<PrefsContextValue>({
  upDown: "green", setUpDown: () => {},
  fiat: "USD", setFiat: () => {},
  coinIcons: false, setCoinIcons: () => {},
});

export const usePrefs = () => useContext(PrefsContext);

// Fixed USD→CNY rate for the 价格切换 toggle. The demo is USDT-quoted, so CNY is an
// approximation (≈ rate × USDT); kept as a constant rather than faking a live FX feed.
export const CNY_RATE = 7.2;

const GREEN = "#16c784";
const RED = "#ea3943";
const GREEN_RGB = "22,199,132";
const RED_RGB = "234,57,67";

/** Resolved rise/fall colours for canvas drawing (echarts) where CSS vars can't reach. */
export function useColors() {
  const { upDown } = usePrefs();
  return useMemo(() => (upDown === "red"
    ? { up: RED, down: GREEN, upRgb: RED_RGB, downRgb: GREEN_RGB }
    : { up: GREEN, down: RED, upRgb: GREEN_RGB, downRgb: RED_RGB }
  ), [upDown]);
}

/** Fiat display helper: rate + symbol + label for the current 价格切换 setting. */
export function useFiat() {
  const { fiat } = usePrefs();
  return useMemo(() => (fiat === "CNY"
    ? { fiat, rate: CNY_RATE, symbol: "¥", label: "CNY" as const }
    : { fiat, rate: 1, symbol: "$", label: "USD" as const }
  ), [fiat]);
}

const K_UPDOWN = "okx_updown";
const K_FIAT = "okx_fiat";
const K_COINICONS = "okx_coinicons";

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [upDown, setUpDownState] = useState<UpDown>(
    () => (localStorage.getItem(K_UPDOWN) === "red" ? "red" : "green"));
  const [fiat, setFiatState] = useState<Fiat>(
    () => (localStorage.getItem(K_FIAT) === "CNY" ? "CNY" : "USD"));
  const [coinIcons, setCoinIconsState] = useState<boolean>(
    () => localStorage.getItem(K_COINICONS) === "1");

  // Drive the CSS var swap (--up / --down …) used by inline styles and stylesheet.
  useEffect(() => { document.documentElement.dataset.updown = upDown; }, [upDown]);

  const setUpDown = useCallback((v: UpDown) => { localStorage.setItem(K_UPDOWN, v); setUpDownState(v); }, []);
  const setFiat = useCallback((v: Fiat) => { localStorage.setItem(K_FIAT, v); setFiatState(v); }, []);
  const setCoinIcons = useCallback((v: boolean) => { localStorage.setItem(K_COINICONS, v ? "1" : "0"); setCoinIconsState(v); }, []);

  const value = useMemo(
    () => ({ upDown, setUpDown, fiat, setFiat, coinIcons, setCoinIcons }),
    [upDown, setUpDown, fiat, setFiat, coinIcons, setCoinIcons]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
