import { defineConfig, devices } from "@playwright/test";

const PORT = 3400;

/** Demo-path browser check. Runs the production build with canned (mock) model replies; no keys needed. */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { LLM_PROVIDER: "mock", TAVILY_API_KEY: "" },
  },
});
