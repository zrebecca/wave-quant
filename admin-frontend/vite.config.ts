import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Admin console runs on its own port (5911) and proxies the API to the
// shared backend on :8910 — same backend as the trading dashboard.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5911,
    strictPort: true,
    proxy: {
      "/api": { target: "http://localhost:8910", changeOrigin: true },
    },
  },
});
