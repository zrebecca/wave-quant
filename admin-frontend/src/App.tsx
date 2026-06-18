import { Spin } from "antd";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminLayout from "@/components/Layout";
import { useAuth } from "@/auth";
import Login from "@/pages/Login";
import Members from "@/pages/Members";
import Settings from "@/pages/Settings";

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAdmin>
            <AdminLayout>
              <Routes>
                <Route path="/" element={<Members />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AdminLayout>
          </RequireAdmin>
        }
      />
    </Routes>
  );
}
