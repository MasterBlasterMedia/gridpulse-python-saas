import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // A configurable asset prefix supports both GitHub project Pages and local preview.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    proxy: {
      "/docs": process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
      "/openapi.json": process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
      "/api": process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
      "/health": process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.tsx", "src/test-setup.ts", "src/main.tsx"],
    },
  },
});
