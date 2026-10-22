// Test launcher: one production build, two servers.
//   PORT     — mock model replies (the demo path)
//   PORT + 1 — Gemma with no key (every stage fails; checks the error UI)
import { spawn, spawnSync } from "node:child_process";

const port = Number(process.env.PORT || 3400);
const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: process.env });
if (build.status !== 0) process.exit(build.status ?? 1);

const start = (p, env) => spawn("npx", ["next", "start", "-p", String(p)], { stdio: "inherit", env: { ...process.env, ...env } });
const children = [
  start(port, { LLM_PROVIDER: "mock", TAVILY_API_KEY: "" }),
  start(port + 1, { LLM_PROVIDER: "gemma", GEMINI_API_KEY: "", GOOGLE_API_KEY: "", TAVILY_API_KEY: "" }),
];
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
