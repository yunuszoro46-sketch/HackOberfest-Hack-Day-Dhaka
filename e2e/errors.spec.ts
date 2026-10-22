import { expect, test } from "@playwright/test";

// This server runs Gemma with no API key, so every model stage fails. The UI must explain it, never go blank.
test.use({ baseURL: "http://localhost:3401" });

test("a failing stage shows the error, the raw details and Retry", async ({ page }) => {
  await page.goto("/");
  await page.locator("#raw").fill("An app that helps students find free study rooms.");
  await page.getByTestId("new-idea").click();
  await expect(page.getByText("No model key on the server")).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.locator("#answer").fill(`Answer ${i + 1}`);
    if (i < 4) await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByTestId("build-card").click();
  const err = page.getByTestId("stage-error");
  await expect(err).toBeVisible();
  await expect(err).toContainText("No Google AI Studio key is set (GEMINI_API_KEY)");
  await err.getByRole("button", { name: "Raw error" }).click();
  await expect(err).toContainText("HTTP 503");
  await err.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("stage-error")).toBeVisible();
  // The answers are kept; the example idea still works without a model.
  await page.goto("/");
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("readiness")).toContainText("Readiness 69");
});
