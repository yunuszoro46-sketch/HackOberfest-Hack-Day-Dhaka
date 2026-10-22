import { defineConfig, devices } from "@playwright/test";

const PORT = 3400;

/** Demo-path browser check on a production build with canned (mock) replies, plus an error-UI check with no key. */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
  webServer: {
    command: `node e2e/serve.mjs`,
    url: `http://localhost:${PORT + 1}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { PORT: String(PORT) },
  },
});
