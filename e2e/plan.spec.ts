import { expect, test } from '@playwright/test';

test('planning workspace: customize every step, council tries to break it, approval needs a reason against the verdict', async ({ page }) => {
  const shots = process.env.SCREENSHOTS_DIR;
  await page.goto('/');
  await page.getByRole('button', { name: /Campus Study Room Booking/ }).click();
  await page.getByRole('button', { name: /ASSESS THIS CONCEPT/ }).click();

  // Step 2: customize the assessment
  await expect(page.getByRole('heading', { name: 'Idea Feasibility & Evaluation Matrix' })).toBeVisible();
  await page.getByRole('button', { name: /Customize/ }).click();
  await page.getByLabel('New risk').fill('Campus Wi-Fi drops during the demo');
  await page.getByTestId('assess-editor').getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Edited by you').first()).toBeVisible();
  await page.getByRole('button', { name: /EXPLORE VISUAL ARCHETYPES/ }).click();

  // Step 3: your own style
  await page.getByRole('button', { name: /Customize your own style/ }).click();
  await page.getByTestId('style-editor').getByLabel('Style name').fill('Campus Calm');
  await page.getByRole('button', { name: /Use my custom style/ }).click();
  await expect(page.getByText('Selected: Campus Calm')).toBeVisible();
  await page.getByRole('button', { name: /FORMULATE PROJECT PLAN/ }).click();

  // Step 4: features come from the assessment and can be edited
  await expect(page.locator('[data-feature^="Main demo path: StudySpace"]')).toBeVisible();
  await page.getByLabel('New non-goal').fill('Payments');
  await page.getByRole('button', { name: 'Add' }).last().click();
  await page.getByRole('button', { name: /SEND TO THE COUNCIL/ }).click();

  // Step 5: council (no model configured in e2e → labelled rule-based checks)
  await expect(page.getByTestId('council-estimate')).toContainText('rule-based checks');
  await page.getByRole('button', { name: /Convene council/ }).click();
  const result = page.getByTestId('council-result');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('council-verdict')).toHaveText('NEEDS CHANGES');
  await expect(page.getByTestId('break-attempts').locator('li')).not.toHaveCount(0);
  await expect(result).toContainText('Pros');
  if (shots) await page.screenshot({ path: `${shots}/plan-council.png`, fullPage: true });
  await page.getByRole('button', { name: /Continue to approval/ }).click();

  // Step 6: approval is blocked until the leader gives a reason to go against the council
  const confirm = page.getByRole('button', { name: /CONFIRM & GENERATE PROMPT/ });
  await expect(page.getByTestId('approve-council')).toContainText('NEEDS CHANGES');
  await expect(confirm).toBeDisabled();
  await page.getByRole('checkbox', { name: /approve anyway/ }).check();
  await page.getByLabel('Reason for approving anyway').fill('Solidity 67 is fine for a 48h demo');
  await confirm.click();

  // Step 7: the prompt carries the council review and the override; the leader can edit it
  const prompt = page.getByTestId('prompt-text');
  await expect(prompt).toContainText('COUNCIL REVIEW');
  await expect(prompt).toContainText('Reason: Solidity 67 is fine for a 48h demo');
  await expect(prompt).toContainText('DO NOT BUILD: Payments');
  await expect(prompt).toContainText('Archetype Selected: Campus Calm');
  await page.getByTestId('edit-prompt').click();
  await page.getByLabel('Edit the prompt').fill('My own prompt');
  await page.getByTestId('edit-prompt').click();
  await expect(prompt).toHaveText('My own prompt');
});
