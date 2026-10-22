import { expect, test, type Page } from '@playwright/test';
import type { IdeaInput, IdeaReport } from '../shared/idea-report';
import type { IdeaRunDetail } from '../shared/idea-run';

const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';
const shots = process.env.SCREENSHOTS_DIR;

async function mockIdeaRuns(page: Page) {
  let run: IdeaRunDetail | null = null;
  let report: IdeaReport | null = null;

  await page.route('**/api/ideas/runs**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    if (method === 'POST' && url.pathname === '/api/ideas/runs') {
      const input = request.postDataJSON() as IdeaInput & { maxCalls: number };
      const response = await route.fetch({
        url: new URL('/api/ideas/report', request.url()).toString(),
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        postData: JSON.stringify(input),
      });
      report = await response.json() as IdeaReport;
      report.ideaCard = {
        problem: 'Commuters struggle to find affordable parking.',
        targetUser: 'Drivers in Dhaka.',
        solution: 'An app with verified parking availability.',
        whyNow: 'A one-district pilot is feasible in the hackathon window.',
        hackathonConstraints: 'Use seeded availability data for the demo.',
      };
      report.analysis = {
        method: 'council',
        limitation: 'Mocked council result for browser testing.',
        council: { members: ['chair'], providers: ['mock-provider'], calls: input.maxCalls },
      };
      run = {
        id: 'mock-idea-run',
        status: 'AWAITING_APPROVAL',
        input,
        maxCalls: input.maxCalls,
        report: null,
        fallback: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        turns: [],
        providers: ['mock-provider'],
      };
      await route.fulfill({ status: 201, json: run });
      return;
    }

    if (!run) {
      await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Run not found' } } });
      return;
    }

    if (method === 'POST' && url.pathname.endsWith('/approve')) {
      run.status = 'RUNNING';
      await route.fulfill({ status: 200, json: run });
      return;
    }
    if (method === 'POST' && url.pathname.endsWith('/cancel')) {
      run.status = 'CANCELLED';
      await route.fulfill({ status: 200, json: run });
      return;
    }

    if (method === 'GET' && url.pathname.endsWith(run.id)) {
      run.status = 'COMPLETED';
      run.report = report;
      run.startedAt = new Date().toISOString();
      run.finishedAt = new Date().toISOString();
      run.turns = [{ seq: 1, round: 'synthesis', role: 'chair', status: 'ok', provider: 'mock-provider', model: 'mock-model', reason: null, attempts: [], output: null, usage: null, startedAt: new Date().toISOString(), durationMs: 1 }];
      await route.fulfill({ status: 200, json: run });
      return;
    }

    await route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Run not found' } } });
  });
}

test('landing → create → team → command → QA report says PASS', async ({ page }) => {
  // Home is the TEAM:MATE planning workspace; the team overview is one click away.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Define the Core Concept & Parameters' })).toBeVisible();
  await page.getByRole('link', { name: 'How it works' }).click();
  await expect(page.getByRole('heading', { name: /Build with AI teammates/ })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/1-landing.png` });
  await page.getByRole('link', { name: 'Build Your Team' }).click();

  await page.getByLabel('Project name').fill('StudySpace');
  await page.getByLabel('Goal').fill('Book study rooms on campus');
  await page.getByLabel('Constraints').fill('React + TypeScript, no external services');
  await page.getByRole('button', { name: /Continue to team/ }).click();

  const cont = page.getByRole('button', { name: /Continue to workspace/ });
  await expect(cont).toBeDisabled();
  await page.locator('[data-role="frontend"]').click();
  await page.locator('[data-role="qa"]').click();
  if (shots) await page.screenshot({ path: `${shots}/2-agents.png`, fullPage: true });
  await cont.click();

  await page.getByLabel('Command for your team').fill(DEMO);
  await page.getByRole('button', { name: /Send to team/ }).click();
  await expect(page.getByTestId('planner-note')).toContainText('Documentation Writer');
  await expect(page.getByTestId('plan-approval')).toContainText('blocked: No Documentation Writer on the team');
  await page.getByRole('button', { name: 'Approve plan' }).click();

  const qaCard = page.locator('[data-task-title="Test edge cases"]');
  await expect(qaCard).toHaveAttribute('data-task-status', 'REVIEW', { timeout: 30_000 });
  await expect(page.locator('[data-task-title="Document the result"]')).toHaveAttribute('data-task-status', 'BLOCKED');
  if (shots) await page.screenshot({ path: `${shots}/3-workspace.png`, fullPage: true });

  await page.locator('[data-artifact="reports/qa-report.md"]').click();
  await expect(page.getByTestId('artifact-content')).toContainText('PASS');
  if (shots) await page.screenshot({ path: `${shots}/4-qa-report.png` });
});

test('IdeaMate generates a report and compares an edited rerun', async ({ page }) => {
  await mockIdeaRuns(page);
  await page.goto('/ideas');
  await expect(page.getByRole('heading', { name: 'IdeaMate' })).toBeVisible();
  await page.getByLabel('Your idea').fill('A mobile app for Dhaka commuters to find safe parking with live availability alerts.');
  await page.getByRole('button', { name: 'Generate Idea Report' }).click();
  await expect(page.getByRole('heading', { name: 'Approve AI council run?' })).toBeVisible();
  await expect(page.getByText(/up to 4 model calls/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve and run' }).click();
  await expect(page.getByRole('heading', { name: 'Idea verdict' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System design recommendation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'UI/UX direction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iteration comparison' })).toHaveCount(0);

  await page.getByLabel('Your idea').fill('A mobile app for Dhaka commuters to find safe parking with live availability alerts, route suggestions, and verified community reports.');
  await page.getByRole('button', { name: 'Re-run with this idea' }).click();
  await page.getByRole('button', { name: 'Approve and run' }).click();
  await expect(page.getByRole('heading', { name: 'Iteration comparison' })).toBeVisible();
  await expect(page.getByText('Current', { exact: true })).toBeVisible();
});

test('IdeaMate Deep mode gates research behind approval and fits mobile width', async ({ page }) => {
  await mockIdeaRuns(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/ideas');
  await page.getByLabel('Your idea').fill('A study room finder for university students with live availability.');
  await page.getByRole('radio').nth(1).click();
  let researchRequested = false;
  await page.route('**/api/ideas/research', async (route) => {
    researchRequested = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'unavailable',
        cached: false,
        completedAt: new Date().toISOString(),
        references: [],
        providers: [
          { provider: 'github', status: 'failed', message: 'Unavailable in test.', resultCount: 0 },
          { provider: 'youtube', status: 'unavailable', message: 'Not configured.', resultCount: 0 },
        ],
        unreachable: [],
      }),
    });
  });
  await page.getByRole('button', { name: 'Generate Idea Report' }).click();
  await expect(page.getByRole('heading', { name: 'Approve AI council run?' })).toBeVisible();
  await expect(page.getByText(/up to 5 model calls/)).toBeVisible();
  await page.getByRole('button', { name: 'Approve and run' }).click();
  await expect(page.getByRole('heading', { name: 'Approve reference research?' })).toBeVisible();
  expect(researchRequested).toBe(false);
  await page.getByRole('button', { name: 'Approve and start research' }).click();
  await expect(page.getByRole('heading', { name: 'Reference research' })).toBeVisible();
  expect(researchRequested).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('workspace has no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/dashboard');
  const res = await page.request.post('/api/projects', { data: { name: 'Mobile', goal: 'g' } });
  const p = await res.json();
  await page.request.put(`/api/projects/${p.id}/agents`, { data: { agents: [{ role: 'frontend' }, { role: 'qa' }] } });
  await page.request.post(`/api/projects/${p.id}/commands`, { data: { text: DEMO } });
  for (const path of ['/', '/teammate', '/dashboard', '/ideas', `/projects/${p.id}`, `/projects/${p.id}/agents`, `/projects/${p.id}/context`, `/projects/${p.id}/supervise`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  if (shots) await page.screenshot({ path: `${shots}/5-mobile.png`, fullPage: true });
});
