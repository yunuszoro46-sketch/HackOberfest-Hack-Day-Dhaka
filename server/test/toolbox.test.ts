import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ToolBox, ToolError } from '../src/tools/toolbox';
import { tmpDir } from './helpers';

describe('toolbox', () => {
  const all = ['write_file', 'read_file', 'list_files', 'run_approved'] as const;

  it('jails paths', () => {
    const tb = new ToolBox(tmpDir(), [...all]);
    expect(() => tb.writeFile('../x', 'a')).toThrow(ToolError);
    expect(() => tb.writeFile('a/../../x', 'a')).toThrow(/escapes/);
    expect(() => tb.writeFile(path.resolve('/etc/passwd'), 'a')).toThrow(/Absolute/);
    tb.writeFile('src/ok.ts', 'export const a = 1;\n');
    expect(tb.listFiles()).toEqual(['src/ok.ts']);
  });

  it('enforces per-agent tool permissions', () => {
    const tb = new ToolBox(tmpDir(), ['read_file']);
    expect(() => tb.writeFile('a.txt', 'a')).toThrow(/not permitted/);
  });

  it('rejects unknown commands and runs syntax-check for real', async () => {
    const logs: string[] = [];
    const tb = new ToolBox(tmpDir(), [...all], (_t, s) => logs.push(s));
    await expect(tb.runApproved('rm -rf /')).rejects.toThrow(/allowlist/);
    tb.writeFile('bad.mjs', 'export function (\n');
    tb.writeFile('bad.ts', 'export function f( {\n');
    tb.writeFile('good.ts', 'export function f(a: number): number { return a }\n');
    expect((await tb.runApproved('syntax-check', 'bad.mjs')).exitCode).not.toBe(0);
    expect((await tb.runApproved('syntax-check', 'bad.ts')).exitCode).not.toBe(0);
    expect((await tb.runApproved('syntax-check', 'good.ts')).exitCode).toBe(0);
    await expect(tb.runApproved('syntax-check', '../outside.ts')).rejects.toThrow(/escapes/);
    expect(logs.some((l) => l.startsWith('run syntax-check bad.mjs'))).toBe(true);
  });
});
