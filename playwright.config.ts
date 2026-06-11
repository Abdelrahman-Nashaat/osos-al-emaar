import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Load .env.local so specs (and the dev server) get the Supabase keys.
loadEnvConfig(process.cwd());

// Functional specs run once on desktop; the @mobile-tagged responsive/a11y specs
// fan out across the three mobile/tablet widths (Phase 4.5 B). Service workers
// are blocked everywhere except a future @pwa project (slice C) for stability.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], serviceWorkers: "block" },
      grepInvert: /@mobile/,
    },
    {
      name: "mobile-360",
      use: { viewport: { width: 360, height: 800 }, serviceWorkers: "block" },
      grep: /@mobile/,
    },
    {
      name: "mobile-390",
      use: { viewport: { width: 390, height: 844 }, serviceWorkers: "block" },
      grep: /@mobile/,
    },
    {
      // 767 = the widest MOBILE layout (Tailwind md: starts at 768 → desktop).
      name: "tablet-767",
      use: { viewport: { width: 767, height: 1024 }, serviceWorkers: "block" },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
