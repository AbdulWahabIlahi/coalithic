import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mockApi } from "./mock-api.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      // Stands down when the real backend is mounted in front of /api.
      // ws: true forwards the /api/ws upgrade used by the escalation push channel.
      // /uploads serves field photos + report exports straight from the backend.
      "/api": { target: "http://localhost:8001", ws: true },
      "/uploads": { target: "http://localhost:8001" },
    },
  },
});
