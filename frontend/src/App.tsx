import { Spin } from "antd";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import TerminalShell from "./components/terminal/TerminalShell";
import Backtest from "./pages/Backtest";
import Bot from "./pages/Bot";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Logs from "./pages/Logs";
import Positions from "./pages/Positions";
import Risk from "./pages/Risk";
import Settings from "./pages/Settings";
import Strategy from "./pages/Strategy";
import TradeTerminal from "./pages/TradeTerminal";
import { useAuth } from "./store/AuthContext";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* The pro terminal renders full-bleed, outside the standard dashboard chrome. */}
      <Route path="/market" element={<RequireAuth><TradeTerminal /></RequireAuth>} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <TerminalShell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/terminal" element={<Navigate to="/market" replace />} />
                <Route path="/orderbook" element={<Navigate to="/market" replace />} />
                <Route path="/positions" element={<Positions />} />
                {/* Orders live in the terminal bottom panel (OKX-style); keep the path as a redirect. */}
                <Route path="/orders" element={<Navigate to="/market" replace />} />
                <Route path="/bot" element={<Bot />} />
                <Route path="/strategy" element={<Strategy />} />
                <Route path="/risk" element={<Risk />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/backtest" element={<Backtest />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </TerminalShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
