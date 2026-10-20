import { expect, test, type Page } from '@playwright/test';

const IDEA = 'A mobile app for Dhaka commuters to find safe parking with live availability alerts.';
const shots = process.env.SCREENSHOTS_DIR;

async function generate(page: Page) {
  await page.goto('/ideas');
  await page.getByLabel('Your idea').fill(IDEA);
  const reportResponse = page.waitForResponse('**/api/ideas/report');
  await page.getByRole('button', { name: 'Generate Idea Report' }).click();
  const report = await (await reportResponse).json();
  await expect(page.getByTestId('report-method')).toHaveText('Rule-based');
  return report;
}

test('IdeaMate defaults to 24 hours and the council falls back to the rule-based report without keys', async ({ page }) => {
  await page.goto('/ideas');
  await page.getByText('Customize context').click();
  await expect(page.getByLabel('Hours left')).toHaveValue('24');

  let runsCreated = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/ideas/runs')) runsCreated += 1; });
  await generate(page);
  const panel = page.getByTestId('council-panel');
  await expect(panel).toHaveAttribute('data-run-status', 'IDLE');
  expect(runsCreated).toBe(0);

  await page.getByRole('button', { name: 'Approve and run council' }).click();
  await expect(panel).toHaveAttribute('data-run-status', 'COMPLETED');
  await expect(panel).toContainText('No AI provider is configured on the server, so the rule-based report below stands.');
  await expect(page.getByTestId('report-method')).toHaveText('Rule-based');
  expect(runsCreated).toBe(1);
});

test('IdeaMate shows the live council transcript with provider badges, then the council report', async ({ page }) => {
  const base = await generate(page);
  const turn = (seq: number, round: string, role: string, extra: Record<string, unknown> = {}) => ({
    seq, round, role, status: 'ok', provider: seq === 5 ? 'gemini' : 'groq', model: seq === 5 ? 'gemini-flash' : 'gpt-oss-120b', reason: null,
    attempts: [], output: { summary: `${role} view` }, usage: { inputTokens: 100, outputTokens: 50 }, startedAt: new Date().toISOString(), durationMs: 1200, ...extra,
  });
  const turns = [
    turn(1, 'draft', 'feasibility'), turn(2, 'draft', 'market'),
    turn(3, 'draft', 'judge', { status: 'failed', provider: null, model: null, reason: 'RATE_LIMIT', output: null, usage: null, attempts: [{ provider: 'groq', model: 'gpt-oss-120b', reason: 'RATE_LIMIT' }] }),
    turn(4, 'critique', 'critic', { output: { objections: [{ target: 'market', point: 'Parking data is not public', severity: 'major' }], missingRisks: [] } }),
    turn(5, 'synthesis', 'chair'),
  ];
  const councilReport = {
    ...base, id: 'council-1', overallScore: base.overallScore - 7, verdict: 'Pivot',
    analysis: { ...base.analysis, method: 'council', council: { members: ['feasibility', 'market'], providers: ['groq', 'gemini'], calls: 6 } },
  };
  const run = { id: 'run-1', input: base.input, maxCalls: 5, fallback: null, error: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, providers: ['groq', 'gemini'] };
  let polls = 0;
  await page.route('**/api/ideas/runs', (r) => r.fulfill({ status: 201, json: { ...run, status: 'AWAITING_APPROVAL', report: null, turns: [] } }));
  await page.route('**/api/ideas/runs/run-1/approve', (r) => r.fulfill({ json: { ...run, status: 'RUNNING', report: null } }));
  await page.route('**/api/ideas/runs/run-1', (r) => {
    polls += 1;
    const done = polls >= 3;
    return r.fulfill({ json: { ...run, status: done ? 'COMPLETED' : 'RUNNING', report: done ? councilReport : null, turns: done ? turns : turns.slice(0, 2) } });
  });

  await page.getByRole('button', { name: 'Approve and run council' }).click();
  const panel = page.getByTestId('council-panel');
  await expect(panel).toContainText('Council is reviewing (2 of 5 turns)');
  await expect(page.getByRole('button', { name: 'Cancel council' })).toBeVisible();
  await expect(panel).toHaveAttribute('data-run-status', 'COMPLETED', { timeout: 10_000 });

  await expect(panel.locator('[data-turn-role]')).toHaveCount(5);
  await expect(panel.locator('[data-turn-role="feasibility"]').getByTestId('turn-provider')).toHaveText('groq · gpt-oss-120b');
  await expect(panel.locator('[data-turn-role="chair"]').getByTestId('turn-provider')).toHaveText('gemini · gemini-flash');
  await expect(panel.locator('[data-turn-role="judge"]')).toHaveAttribute('data-turn-status', 'failed');
  await expect(panel.locator('[data-turn-role="judge"]')).toContainText('Reason: RATE_LIMIT');
  await expect(panel.locator('[data-turn-role="critic"]')).toContainText('Parking data is not public');

  await expect(page.getByTestId('report-method')).toHaveText('AI council · groq, gemini');
  await expect(page.getByRole('heading', { name: 'Iteration comparison' })).toBeVisible();
  await expect(page.getByText('-7 points')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/council-transcript.png`, fullPage: true });
});
