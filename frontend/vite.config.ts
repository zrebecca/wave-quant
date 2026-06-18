import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// In dev, proxy API + WebSocket to the backend on :8000.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Handles REST (/api/...) and the WebSocket upgrade at /api/ws.
      "/api": { target: "http://localhost:8000", changeOrigin: true, ws: true },
    },
  },
});
