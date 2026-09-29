/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ["test/**/*.test.ts"] }, // smoke/ is Playwright's
});
