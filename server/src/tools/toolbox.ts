import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ApprovedCommand, ToolName } from '../../../shared/types';

export const COMMAND_TIMEOUT_MS = 15_000;
const MAX_OUTPUT = 20_000;

// `node --check` silently accepts broken .ts files, so TypeScript is parsed with Node's own
// type stripper instead (throws on any syntax error). Fixed script; the file is passed as argv.
const TS_CHECK_SCRIPT =
  'require("node:module").stripTypeScriptTypes(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log("ok: " + process.argv[1])';

/** The allowlist (D5). Agents pick a command by name; there is no string → shell path. */
const APPROVED: Record<ApprovedCommand, (arg?: string) => string[]> = {
  'syntax-check': (file) => {
    if (!file) throw new ToolError('syntax-check needs a file');
    if (/\.(ts|mts|cts)$/.test(file)) return ['-e', TS_CHECK_SCRIPT, file];
    if (/\.(js|mjs|cjs)$/.test(file)) return ['--check', file];
    throw new ToolError(`syntax-check supports .js/.mjs/.ts files, not ${file}`);
  },
  'run-tests': () => ['--test', 'tests/**/*.test.mjs'],
};

export interface CommandResult {
  command: ApprovedCommand;
  argv: string[];
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type ToolLogger = (tool: ToolName, summary: string, data: Record<string, unknown>) => void;

export class ToolError extends Error {}

export class ToolBox {
  readonly root: string;
  private readonly allowed: Set<ToolName>;
  private readonly log: ToolLogger;
  readonly written: string[] = [];

  constructor(root: string, allowed: ToolName[], log: ToolLogger = () => {}) {
    this.root = path.resolve(root);
    this.allowed = new Set(allowed);
    this.log = log;
    fs.mkdirSync(this.root, { recursive: true });
  }

  private guard(tool: ToolName) {
    if (!this.allowed.has(tool)) {
      this.log(tool, `denied: ${tool} is not permitted for this agent`, { denied: true });
      throw new ToolError(`Tool "${tool}" is not permitted for this agent`);
    }
  }

  /** Resolves a workspace-relative path, refusing anything that escapes the jail. */
  resolve(rel: string): string {
    if (typeof rel !== 'string' || rel.length === 0) throw new ToolError('Path is required');
    if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) throw new ToolError(`Absolute paths are not allowed: ${rel}`);
    const full = path.resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new ToolError(`Path escapes the workspace: ${rel}`);
    return full;
  }

  writeFile(rel: string, content: string): void {
    this.guard('write_file');
    const full = this.resolve(rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    this.written.push(rel);
    this.log('write_file', `write_file ${rel} (${Buffer.byteLength(content)} bytes)`, { path: rel, bytes: Buffer.byteLength(content) });
  }

  readFile(rel: string): string {
    this.guard('read_file');
    const full = this.resolve(rel);
    if (!fs.existsSync(full)) {
      this.log('read_file', `read_file ${rel} → not found`, { path: rel, found: false });
      throw new ToolError(`File not found: ${rel}`);
    }
    const content = fs.readFileSync(full, 'utf8');
    this.log('read_file', `read_file ${rel} (${content.length} chars)`, { path: rel, found: true });
    return content;
  }

  exists(rel: string): boolean {
    try {
      return fs.existsSync(this.resolve(rel));
    } catch {
      return false;
    }
  }

  listFiles(): string[] {
    this.guard('list_files');
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(path.relative(this.root, full).split(path.sep).join('/'));
      }
    };
    walk(this.root);
    out.sort();
    this.log('list_files', `list_files → ${out.length} file(s)`, { count: out.length });
    return out;
  }

  async runApproved(name: string, arg?: string): Promise<CommandResult> {
    this.guard('run_approved');
    if (!Object.hasOwn(APPROVED, name)) {
      this.log('run_approved', `denied: "${name}" is not an approved command`, { command: name, denied: true });
      throw new ToolError(`Command "${name}" is not on the allowlist`);
    }
    const command = name as ApprovedCommand;
    if (arg !== undefined) this.resolve(arg); // file arguments must stay inside the jail too
    const argv = APPROVED[command](arg);
    const started = Date.now();
    const result = await new Promise<CommandResult>((resolve) => {
      const child = spawn(process.execPath, argv, {
        cwd: this.root,
        env: { PATH: process.env.PATH ?? '', NODE_NO_WARNINGS: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
      child.stderr.on('data', (d) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, COMMAND_TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ command, argv: ['node', ...argv], exitCode: code, timedOut, stdout, stderr, durationMs: Date.now() - started });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ command, argv: ['node', ...argv], exitCode: -1, timedOut, stdout, stderr: String(err), durationMs: Date.now() - started });
      });
    });
    this.log('run_approved', `run ${command}${arg ? ` ${arg}` : ''} → exit ${result.timedOut ? 'timeout' : result.exitCode} (${result.durationMs}ms)`, {
      command, arg: arg ?? null, exitCode: result.exitCode, timedOut: result.timedOut, durationMs: result.durationMs,
    });
    return result;
  }
}
