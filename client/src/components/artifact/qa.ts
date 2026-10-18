/** Parses TeamMate's QA report markdown. Only returns what the report itself contains. */
export interface QaCheck { passed: boolean; name: string; detail: string; output: string | null }
export interface QaSummary {
  verdict: 'PASS' | 'FAIL';
  checksPassed: number | null;
  checksTotal: number | null;
  testsPassed: number | null;
  testsFailed: number | null;
  exit: string | null;
  command: string | null;
  checks: QaCheck[];
}

export function parseQa(content: string): QaSummary | null {
  const verdict = /\*\*Verdict: (PASS|FAIL)\*\*(?: \((\d+)\/(\d+) checks passed\))?/.exec(content);
  if (!verdict) return null;
  const raw = content.split('## Raw output')[1] ?? '';
  const outputs = new Map<string, string>();
  for (const part of raw.split(/^### /m).slice(1)) {
    const name = part.split('\n')[0].trim();
    const block = /```\n([\s\S]*?)\n```/.exec(part)?.[1] ?? null;
    if (block !== null) outputs.set(name, block);
  }
  const checks: QaCheck[] = [];
  for (const m of content.matchAll(/^\| (PASS|FAIL) \| (.+?) \| (.*) \|$/gm)) {
    checks.push({ passed: m[1] === 'PASS', name: m[2], detail: m[3].replace(/\\\|/g, '|'), output: outputs.get(m[2]) ?? null });
  }
  const runTests = outputs.get('run-tests') ?? '';
  const num = (re: RegExp) => { const x = re.exec(runTests); return x ? Number(x[1]) : null; };
  return {
    verdict: verdict[1] as 'PASS' | 'FAIL',
    checksPassed: verdict[2] ? Number(verdict[2]) : null,
    checksTotal: verdict[3] ? Number(verdict[3]) : null,
    testsPassed: num(/^# pass (\d+)/m),
    testsFailed: num(/^# fail (\d+)/m),
    exit: /^exit (\S+)/m.exec(runTests)?.[1] ?? null,
    command: /^\$ (.+)$/m.exec(runTests)?.[1] ?? null,
    checks,
  };
}
