import { expect, test } from '@playwright/test';

const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';
const shots = process.env.SCREENSHOTS_DIR;

test('landing → create → team → command → QA report says PASS', async ({ page }) => {
  await page.goto('/');
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

  const qaCard = page.locator('[data-task-title="Test edge cases"]');
  await expect(qaCard).toHaveAttribute('data-task-status', 'REVIEW', { timeout: 30_000 });
  await expect(page.locator('[data-task-title="Document the result"]')).toHaveAttribute('data-task-status', 'BLOCKED');
  if (shots) await page.screenshot({ path: `${shots}/3-workspace.png`, fullPage: true });

  await page.locator('[data-artifact="reports/qa-report.md"]').click();
  await expect(page.getByTestId('artifact-content')).toContainText('PASS');
  if (shots) await page.screenshot({ path: `${shots}/4-qa-report.png` });
});

test('workspace has no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/dashboard');
  const res = await page.request.post('/api/projects', { data: { name: 'Mobile', goal: 'g' } });
  const p = await res.json();
  await page.request.put(`/api/projects/${p.id}/agents`, { data: { agents: [{ role: 'frontend' }, { role: 'qa' }] } });
  await page.request.post(`/api/projects/${p.id}/commands`, { data: { text: DEMO } });
  for (const path of ['/', '/dashboard', `/projects/${p.id}`, `/projects/${p.id}/agents`, `/projects/${p.id}/context`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
  if (shots) await page.screenshot({ path: `${shots}/5-mobile.png`, fullPage: true });
});
