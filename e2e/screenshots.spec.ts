import { expect, test } from "@playwright/test";

// Saves the six screens (console theme) to docs/screenshots/ for the README. Run: npm run screenshots
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to refresh docs/screenshots");

const DIR = "docs/screenshots";

test("the screens in the console theme", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("teammate:theme", "console"));
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("readiness")).toBeVisible();

  await page.goto("/");
  await expect(page.getByTestId("idea-list").locator("[data-idea]")).toHaveCount(1);
  await page.screenshot({ path: `${DIR}/1-ideas.png` });
  await page.locator("[data-idea] a").first().click();

  const shots: [string, string][] = [["interrogate", "2-idea"], ["council", "3-council"], ["preview", "4-preview"], ["architecture", "5-architecture"]];
  for (const [stage, name] of shots) {
    await page.locator(`[data-stage="${stage}"]:visible`).click();
    await page.waitForTimeout(stage === "architecture" ? 1200 : 500);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${DIR}/${name}.png` });
  }

  await page.locator('[data-stage="prompt"]:visible').click();
  await page.getByTestId("compile").click();
  await page.getByTestId("sign-and-compile").click();
  await expect(page.getByTestId("prompt-editor")).toContainText("# Build prompt");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/6-prompt.png` });

  await page.locator('[data-stage="verify"]:visible').click();
  await page.getByTestId("sample-report").click();
  await page.getByTestId("check-build").click();
  await expect(page.locator("[data-ac]").first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/7-verify.png` });

  await page.locator('[data-stage="prompt"]:visible').click();
  await page.getByTestId("share-link").click();
  const url = await page.getByTestId("share-url").inputValue();
  await page.goto(url);
  await expect(page.getByTestId("review-page")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/8-review.png` });
});
