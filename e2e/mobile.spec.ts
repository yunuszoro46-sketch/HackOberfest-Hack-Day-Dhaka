import { expect, test } from "@playwright/test";

test("mobile (390px): every stage of the example idea fits without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("readiness")).toBeVisible();
  for (const stage of ["interrogate", "council", "preview", "architecture", "prompt"]) {
    await page.locator(`[data-stage="${stage}"]`).click();
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const widest = overflow > 0
      ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(-3).map((e) => `${e.tagName}.${(e.getAttribute("class") ?? "").slice(0, 60)}`).join(" | "))
      : "";
    expect(overflow, `horizontal overflow on ${stage}: ${widest}`).toBeLessThanOrEqual(0);
    if (process.env.SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.SCREENSHOTS_DIR}/mobile-${stage}.png`, fullPage: true });
  }
});
