import { expect, test } from "@playwright/test";

for (const width of [390, 400]) {
  test(`mobile (${width}px): home and every stage of the example fit without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const check = async (where: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const widest = overflow > 0
        ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(-3).map((e) => `${e.tagName}.${(e.getAttribute("class") ?? "").slice(0, 60)}`).join(" | "))
        : "";
      expect(overflow, `horizontal overflow on ${where}: ${widest}`).toBeLessThanOrEqual(0);
    };
    await page.goto("/");
    await page.getByTestId("load-example").click();
    await expect(page.getByTestId("readiness")).toBeVisible();
    for (const stage of ["interrogate", "council", "preview", "architecture", "prompt"]) {
      await page.locator(`[data-stage="${stage}"]:visible`).click();
      await page.waitForTimeout(300);
      await check(stage);
    }
    await page.goto("/");
    await expect(page.getByTestId("idea-list")).toBeVisible();
    await check("home");
  });
}
