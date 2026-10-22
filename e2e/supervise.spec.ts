import { expect, test } from '@playwright/test';

const DEMO = 'Build a room availability interface, implement booking validation, test edge cases, and document the result.';

test('375px: plan approval → run → QA failure → send back to fix → QA passes → reload intact', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const shots = process.env.SCREENSHOTS_DIR;

  await page.goto('/projects/new');
  await page.getByLabel('Project name').fill('StudySpace');
  await page.getByLabel('Goal').fill('Book study rooms on campus');
  await page.getByLabel('Constraints').fill('React + TypeScript, no external services');
  await page.getByRole('button', { name: /Continue to team/ }).click();
  await page.locator('[data-role="frontend"]').click();
  await page.locator('[data-role="qa"]').click();
  await page.getByRole('button', { name: /Continue to workspace/ }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const pid = page.url().split('/projects/')[1];

  // Command → plan shown, nothing runs yet
  await page.getByLabel('Command for your team').fill(DEMO);
  await page.getByRole('button', { name: /Send to team/ }).click();
  const plan = page.getByTestId('plan-approval');
  await expect(plan).toBeVisible();
  await expect(plan.locator('[data-plan-task]')).toHaveCount(4);
  await expect(page.getByTestId('command-lock')).toContainText('Approve or discard');
  if (shots) await page.screenshot({ path: `${shots}/s1-plan-375.png`, fullPage: true });

  // Approve on the supervise page and watch it auto-execute
  await page.getByRole('link', { name: /Supervise/ }).first().click();
  await page.getByTestId('plan-approval').getByRole('button', { name: 'Approve plan' }).click();
  await expect(page.locator('[data-run-status="COMPLETED"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('run-progress')).toHaveText('3/4 tasks');

  // Fault injection → QA really fails → decision card → send back to fix → QA re-runs → run completes
  await page.getByRole('textbox', { name: 'New command' }).fill('simulate a failure, build a signup form');
  await page.getByRole('button', { name: 'Plan it' }).click();
  const plan2 = page.getByTestId('plan-approval');
  await expect(plan2.locator('[data-plan-task]')).toHaveCount(2);
  await plan2.getByRole('button', { name: 'Approve plan' }).click();
  const card = page.getByTestId('decision-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveAttribute('data-decision-kind', 'fix');
  await expect(card).toContainText('allows back-to-back bookings');
  await expect(card).toContainText('Send it back to the Frontend Engineer to fix');
  await expect(page.locator('[data-run-status="PAUSED"]').first()).toBeVisible();
  // One polite live region announces the change (clocks are not live regions).
  await expect(page.getByTestId('announcer')).toContainText('1 item needs your decision');
  expect(await page.locator('[aria-live], [role=status]').count()).toBe(1);
  if (shots) await page.screenshot({ path: `${shots}/s2-decision-375.png`, fullPage: true });
  await card.getByLabel(/Note for the builder/).fill('Back-to-back bookings must be allowed');
  await card.getByRole('button', { name: /Send back to fix/ }).click();
  await expect(page.locator('[data-run-status="COMPLETED"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('decision-card')).toHaveCount(0);
  await expect(page.locator('[data-task-title="Fix what QA found in \\"Build a signup form\\""]')).toHaveAttribute('data-task-status', 'REVIEW');
  await expect(page.locator('[data-task-title="Test edge cases"]')).toHaveAttribute('data-task-status', 'REVIEW');
  const trail = page.getByTestId('handoff-trail');
  await expect(trail.locator('[data-trail="sent-back"]')).toContainText('Back-to-back bookings must be allowed');
  await expect(trail.locator('[data-trail="decision"]')).toContainText('Approved fix');
  if (shots) await page.screenshot({ path: `${shots}/s3-recovered-375.png`, fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Reload: state intact
  await page.reload();
  await expect(page.locator('[data-run-status="COMPLETED"]').first()).toBeVisible();
  await expect(page.locator('[data-task-title="Build a signup form"]')).toHaveAttribute('data-task-status', 'REVIEW');
  await expect(page.locator('[data-task-title="Test edge cases"]')).toHaveAttribute('data-task-status', 'REVIEW');
  await expect(page.getByTestId('handoff-trail').locator('[data-trail="sent-back"]')).toHaveCount(1);
  expect(pid).toBeTruthy();
});
