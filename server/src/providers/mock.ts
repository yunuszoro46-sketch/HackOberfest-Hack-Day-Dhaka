// MockProvider (D1/D4): deterministic templates, but every tool call is real.
// Frontend writes runnable files, QA really runs them, Docs really reads the project data.
import { ROLES } from '../agents/roles';
import { rulePlan, SIMULATED_FAILURE_TITLE } from '../agents/planner';
import type { ToolBox, CommandResult } from '../tools/toolbox';
import type { AgentProvider, PlanContext, RunContext, RunResult } from './types';
import { bookingModule, bookingTests, mockNote, roomAvailabilityComponent } from './templates';

const UI_RE = /\b(interface|ui|page|screen|component|view|display|form|layout|calendar|widget|frontend)s?\b/i;
const LOGIC_RE = /\b(valid\w*|logic|rules?|conflicts?|booking|schedul\w*|tests?)\b/i;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

export class MockProvider implements AgentProvider {
  readonly name = 'mock';

  async plan(ctx: PlanContext) {
    return rulePlan(ctx.command, ctx.team);
  }

  async run(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
    if (ctx.task.title === SIMULATED_FAILURE_TITLE) return simulatedFailure(ctx);
    switch (ctx.task.role) {
      case 'frontend':
        return runFrontend(ctx, tools);
      case 'qa':
        return runQa(ctx, tools);
      case 'docs':
        return runDocs(ctx, tools);
      default: {
        const role = ROLES[ctx.task.role];
        const file = `notes/${ctx.task.role}-${slug(ctx.task.title)}.md`;
        tools.writeFile(file, mockNote(ctx.project, ctx.task, role.title, role.responsibilities));
        return { ok: true, summary: `Wrote a labelled mock note (${file}). No model was used for this role.`, kinds: { [file]: 'note' } };
      }
    }
  }
}

function simulatedFailure(ctx: RunContext): RunResult {
  if (ctx.attempt === 1) {
    throw new Error('Simulated failure on attempt 1 (demo). Press Retry: attempt 2 succeeds.');
  }
  return { ok: true, summary: `Simulated task succeeded on attempt ${ctx.attempt} (demo, no real work done).` };
}

async function runFrontend(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
  const ui = UI_RE.test(ctx.task.title);
  const logic = LOGIC_RE.test(ctx.task.title);
  const wantUi = ui || !logic;
  const wantLogic = logic || !ui;
  const written: string[] = [];
  const kinds: RunResult['kinds'] = {};

  // The component depends on the booking module, so make sure it exists.
  if (wantLogic || !tools.exists('src/booking.ts')) {
    tools.writeFile('src/booking.ts', bookingModule(ctx.project, ctx.task));
    written.push('src/booking.ts');
    kinds['src/booking.ts'] = 'code';
  }
  if (wantLogic) {
    tools.writeFile('tests/booking.test.mjs', bookingTests(ctx.project, ctx.task));
    written.push('tests/booking.test.mjs');
    kinds['tests/booking.test.mjs'] = 'test';
  }
  if (wantUi) {
    tools.writeFile('src/RoomAvailability.tsx', roomAvailabilityComponent(ctx.project, ctx.task));
    written.push('src/RoomAvailability.tsx');
    kinds['src/RoomAvailability.tsx'] = 'code';
  }

  // Self-check what we wrote before handing over.
  for (const f of written.filter((f) => /\.(ts|mjs)$/.test(f))) {
    const r = await tools.runApproved('syntax-check', f);
    if (r.exitCode !== 0) return { ok: false, summary: `Syntax check failed for ${f}`, error: `${f}: ${firstLine(r.stderr)}`, kinds };
  }
  return {
    ok: true,
    summary: `Wrote ${written.join(', ')} from the Frontend role template and syntax-checked the scripts.`,
    kinds,
  };
}

const firstLine = (s: string) => s.split('\n').find((l) => l.trim()) ?? '';

interface Check {
  name: string;
  passed: boolean;
  detail: string;
  output?: string;
}

const fmtCmd = (r: CommandResult) =>
  `$ ${r.argv.map((a) => (a.includes(' ') ? JSON.stringify(a.length > 40 ? '<ts-parse script>' : a) : a)).join(' ')}\n` +
  `exit ${r.timedOut ? 'TIMEOUT' : r.exitCode} · ${r.durationMs}ms\n` +
  (r.stdout ? `--- stdout ---\n${r.stdout.trimEnd()}\n` : '') +
  (r.stderr ? `--- stderr ---\n${r.stderr.trimEnd()}\n` : '');

/** QA (T8): only approved commands, raw output in the report, PASS only if everything passed. */
export async function runQa(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
  const files = tools.listFiles().filter((f) => !f.startsWith('reports/') && !f.startsWith('docs/'));
  const checks: Check[] = [];

  for (const f of files.filter((f) => /\.(ts|mjs|js)$/.test(f))) {
    const r = await tools.runApproved('syntax-check', f);
    checks.push({ name: `syntax-check ${f}`, passed: r.exitCode === 0 && !r.timedOut, detail: r.exitCode === 0 ? 'parses' : firstLine(r.stderr), output: fmtCmd(r) });
  }

  for (const f of files.filter((f) => f.endsWith('.tsx'))) {
    const src = tools.readFile(f);
    const problems: string[] = [];
    if (!/export\s+default\s+/.test(src)) problems.push('no default export');
    if (/\b(TODO|FIXME)\b/.test(src)) problems.push('contains TODO/FIXME');
    if (!/aria-[a-z]+=/.test(src)) problems.push('no aria-* attributes');
    if (!/(No \w+ (match|found)|empty)/i.test(src)) problems.push('no empty state');
    checks.push({
      name: `static review ${f}`,
      passed: problems.length === 0,
      detail: problems.length ? problems.join('; ') : 'default export, aria attributes, empty state, no TODOs',
    });
  }

  const testFiles = files.filter((f) => /^tests\/.+\.test\.mjs$/.test(f));
  if (testFiles.length) {
    const r = await tools.runApproved('run-tests');
    const pass = /^# pass (\d+)/m.exec(r.stdout)?.[1];
    const fail = /^# fail (\d+)/m.exec(r.stdout)?.[1];
    checks.push({
      name: 'run-tests',
      passed: r.exitCode === 0 && !r.timedOut,
      detail: r.timedOut ? 'timed out' : `${pass ?? '?'} passed, ${fail ?? '?'} failed`,
      output: fmtCmd(r),
    });
  } else {
    checks.push({ name: 'run-tests', passed: false, detail: 'No test files found under tests/ — nothing was executed.' });
  }

  if (files.length === 0) checks.push({ name: 'workspace', passed: false, detail: 'Workspace is empty; nothing to verify.' });

  const failed = checks.filter((c) => !c.passed);
  const verdict = failed.length === 0 ? 'PASS' : 'FAIL';
  const report = [
    `# QA report — ${ctx.project.name}`,
    '',
    `**Verdict: ${verdict}** (${checks.length - failed.length}/${checks.length} checks passed)`,
    '',
    `- Task: ${ctx.task.title} (attempt ${ctx.attempt})`,
    `- Produced by: QA Engineer (provider: mock role template — the checks below were really executed)`,
    `- Files inspected: ${files.length ? files.join(', ') : '(none)'}`,
    '',
    '## Checks',
    '',
    '| Result | Check | Detail |',
    '|---|---|---|',
    ...checks.map((c) => `| ${c.passed ? 'PASS' : 'FAIL'} | ${c.name} | ${c.detail.replace(/\|/g, '\\|')} |`),
    '',
    '## Raw output',
    '',
    ...checks.filter((c) => c.output).flatMap((c) => [`### ${c.name}`, '', '```', c.output!.trimEnd(), '```', '']),
  ].join('\n');
  tools.writeFile('reports/qa-report.md', report);

  const kinds = { 'reports/qa-report.md': 'report' as const };
  if (failed.length) {
    return {
      ok: false,
      summary: `QA verdict FAIL: ${failed.length} of ${checks.length} checks failed.`,
      error: `QA failed: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}`.slice(0, 500),
      kinds,
    };
  }
  return { ok: true, summary: `QA verdict PASS: ${checks.length}/${checks.length} checks passed. Report in reports/qa-report.md.`, kinds };
}

/** Docs (T9): built only from project data, results, the file list and the QA report. */
export async function runDocs(ctx: RunContext, tools: ToolBox): Promise<RunResult> {
  const files = tools.listFiles().filter((f) => f !== 'docs/README.md');
  let qaVerdict = 'No QA report exists in the workspace yet.';
  if (files.includes('reports/qa-report.md')) {
    const qa = tools.readFile('reports/qa-report.md');
    qaVerdict = /\*\*Verdict: [^*]+\*\*[^\n]*/.exec(qa)?.[0] ?? 'QA report found, but it has no verdict line.';
  }
  const producedBy = new Map<string, string>();
  for (const r of ctx.priorResults) for (const a of r.artifacts) producedBy.set(a.path, `${ROLES[r.role].title} — "${r.title}"`);

  const testCmd = files.some((f) => /^tests\/.+\.test\.mjs$/.test(f)) ? 'node --test "tests/**/*.test.mjs"' : null;
  const readme = [
    `# ${ctx.project.name}`,
    '',
    `> Written by the TeamMate Documentation agent (provider: mock role template) from project data only.`,
    '> Anything not recorded in the project is listed as unknown rather than guessed.',
    '',
    '## Goal',
    ctx.project.goal || '_No goal recorded._',
    '',
    '## Constraints',
    ctx.project.constraints || '_No constraints recorded._',
    '',
    '## Decisions',
    ctx.decisions.length ? ctx.decisions.map((d) => `- **${d.title}** — ${d.rationale || 'no rationale recorded'} _(by ${d.madeBy})_`).join('\n') : '_No decisions recorded yet._',
    '',
    '## What the team delivered',
    ctx.priorResults.length
      ? ctx.priorResults.map((r) => `- **${r.title}** (${ROLES[r.role].title}, ${r.status}): ${r.summary ?? 'no summary'}`).join('\n')
      : '_No completed tasks yet._',
    '',
    '## Files',
    files.length ? files.map((f) => `- \`${f}\`${producedBy.has(f) ? ` — ${producedBy.get(f)}` : ''}`).join('\n') : '_The workspace is empty._',
    '',
    '## Quality status',
    qaVerdict,
    '',
    '## Running the tests',
    testCmd ? `From the workspace folder:\n\n\`\`\`\n${testCmd}\n\`\`\`` : '_No test suite exists in the workspace._',
    '',
    '## Unknowns',
    '- Deployment, hosting and data storage are not recorded in this project.',
    '',
  ].join('\n');
  tools.writeFile('docs/README.md', readme);
  return { ok: true, summary: `Wrote docs/README.md from ${files.length} workspace file(s), ${ctx.decisions.length} decision(s) and ${ctx.priorResults.length} teammate result(s).`, kinds: { 'docs/README.md': 'doc' } };
}
