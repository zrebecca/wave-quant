import { App } from "antd";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/i18n";
import type { BotStatus, LogEntry, OrderBook, Ticker, WsEvent } from "@/types";

// Enum-ish toast vars get translated before substitution (buy → 买入, etc.).
const ENUM_VARS = new Set(["side", "type", "mode"]);

interface WsState {
  connected: boolean;
  tickers: Record<string, Ticker>;
  orderbooks: Record<string, OrderBook>;
  bot: Partial<BotStatus> | null;
  lastLog: LogEntry | null;
  /** epoch ms of the last ticker received — used to show "data frozen at HH:mm:ss". */
  lastTickerTs: number | null;
  /** epoch ms of the last private (order/fill) event — pages refresh on change. */
  lastPrivateTs: number | null;
}

const WsContext = createContext<WsState>({
  connected: false,
  tickers: {},
  orderbooks: {},
  bot: null,
  lastLog: null,
  lastTickerTs: null,
  lastPrivateTs: null,
});

export const useWs = () => useContext(WsContext);

const NOTIF_KIND: Record<string, "success" | "info" | "warning" | "error"> = {
  success: "success",
  info: "info",
  warning: "warning",
  error: "error",
};

export function WsProvider({ children }: { children: ReactNode }) {
  const { notification } = App.useApp();
  const { t } = useI18n();
  // The WS handler is set up once; keep the latest `t` in a ref so toasts always
  // localize in the current language without reconnecting the socket.
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [state, setState] = useState<WsState>({
    connected: false,
    tickers: {},
    orderbooks: {},
    bot: null,
    lastLog: null,
    lastTickerTs: null,
    lastPrivateTs: null,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setState((s) => ({ ...s, connected: true }));
      };
      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (!stopped) {
          retryRef.current = Math.min(retryRef.current + 1, 6);
          setTimeout(connect, 1000 * retryRef.current);
        }
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        let evt: WsEvent;
        try {
          evt = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (evt.type) {
          case "ticker":
            setState((s) => ({
              ...s,
              tickers: { ...s.tickers, [evt.payload.inst_id]: evt.payload },
              lastTickerTs: Date.now(),
            }));
            break;
          case "orderbook":
            setState((s) => ({
              ...s,
              orderbooks: { ...s.orderbooks, [evt.payload.inst_id]: evt.payload },
            }));
            break;
          case "bot":
            setState((s) => ({ ...s, bot: { ...s.bot, ...evt.payload } }));
            break;
          case "log":
            setState((s) => ({ ...s, lastLog: evt.payload }));
            break;
          case "order":
          case "fill":
          case "position":
          case "account":
            setState((s) => ({ ...s, lastPrivateTs: Date.now() }));
            break;
          case "notification": {
            const p = evt.payload;
            const tt = tRef.current;
            let message = p.title;
            if (p.key) {
              // Localize enum-ish vars (side/type/mode/action) before substitution.
              const vars: Record<string, string | number> = { ...(p.vars ?? {}) };
              for (const k of Object.keys(vars)) {
                if (ENUM_VARS.has(k)) vars[k] = tt(`toast.${k}.${vars[k]}`);
              }
              message = tt(p.key, vars);
            }
            // `description` is the category; localize when it's a known one.
            const catKey = `toast.cat.${p.description}`;
            const cat = tt(catKey);
            notification[NOTIF_KIND[p.kind] ?? "info"]({
              message,
              description: cat === catKey ? p.description : cat,
              placement: "topRight",
              duration: 3,            // auto-dismiss after 3s
            });
            break;
          }
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WsContext.Provider value={state}>{children}</WsContext.Provider>;
}
