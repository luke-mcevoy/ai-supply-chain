import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "smoke",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1600, height: 950 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  webServer: { command: "npx vite preview --port 4173 --strictPort", port: 4173, reuseExistingServer: !process.env.CI },
});
