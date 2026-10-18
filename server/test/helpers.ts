import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type AppOptions } from '../src/app';

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'teammate-test-'));
}

export function makeApp(opts: AppOptions & { dir?: string } = {}) {
  const dir = opts.dir ?? tmpDir();
  const created = createApp({ dbFile: path.join(dir, 'test.db'), workspaceRoot: path.join(dir, 'ws'), serveClient: false, ...opts });
  return { ...created, dir, http: request(created.app) };
}

export const DEMO_COMMAND = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';

export async function createDemoProject(http: ReturnType<typeof request>, roles = ['frontend', 'qa']) {
  const p = await http.post('/api/projects').send({ name: 'StudySpace', goal: 'Book study rooms on campus', constraints: 'React + TypeScript, no external services' });
  await http.put(`/api/projects/${p.body.id}/agents`).send({ agents: roles.map((role) => ({ role })) });
  return p.body.id as string;
}

/** Sends a command, approves the resulting plan, and waits for the run's loop to go idle. */
export async function commandAndRun(app: { http: ReturnType<typeof request>; orch: { idle(pid: string): Promise<void> } }, pid: string, text: string) {
  const cmd = await app.http.post(`/api/projects/${pid}/commands`).send({ text });
  if (cmd.status !== 202) throw new Error(`command failed: ${cmd.status} ${JSON.stringify(cmd.body)}`);
  const ok = await app.http.post(`/api/runs/${cmd.body.run.id}/approve`);
  if (ok.status !== 200) throw new Error(`approve failed: ${ok.status} ${JSON.stringify(ok.body)}`);
  await app.orch.idle(pid);
  return cmd;
}
