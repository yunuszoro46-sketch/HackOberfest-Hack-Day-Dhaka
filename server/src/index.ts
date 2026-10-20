import { createApp } from './app';

const port = Number(process.env.PORT) || 3001;
const { app, recovered, providers, council } = createApp();

const server = app.listen(port, () => {
  console.log(`TeamMate API on http://localhost:${port} (planner: ${providers.planner.name}, runner: ${providers.runner.name})`);
  if (recovered.length) console.log(`Recovered ${recovered.length} interrupted task(s) → FAILED`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    council.stop();
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
