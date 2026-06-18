import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Admin console runs on its own port (5174) and proxies the API to the
// shared backend on :8000 — same backend as the trading dashboard.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});
