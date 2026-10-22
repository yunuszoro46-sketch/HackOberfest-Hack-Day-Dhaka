import { expect, test } from "@playwright/test";

const IDEA = "Students on my campus waste time walking around looking for a free study room. I want an app that shows which rooms are free right now and lets them book one.";
const ANSWERS = [
  "Students book a free study room in two taps.",
  "Undergraduates in exam weeks; today they walk floor to floor checking doors.",
  "The library installed room sensors this term and nobody uses the data.",
  "Solo, 2 days, $0 budget, I know React and TypeScript, avoid native mobile.",
  "Not a calendar app, no payments",
];

test("demo path", async ({ page }) => {
  // 1. Home → New idea → paste a paragraph
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TeamMate gets you to a prompt you trust — not to code." })).toBeVisible();
  await page.locator("#raw").fill(IDEA);
  await page.getByTestId("new-idea").click();

  // 2. Five questions → card → lock core action
  for (const [i, a] of ANSWERS.entries()) {
    await expect(page.getByText(`Question ${i + 1} of 5`)).toBeVisible();
    await page.locator("#answer").fill(a);
    if (i < 4) await page.getByRole("button", { name: "Next" }).click();
  }
  await page.getByTestId("build-card").click();
  await expect(page.getByTestId("idea-card")).toBeVisible();
  await expect(page.locator("#field-coreAction")).toHaveValue(ANSWERS[0]);
  await page.locator('[data-lock="Core action — the one thing the user does"]').click();
  await expect(page.getByRole("button", { name: /Regenerate Core action/ })).toBeDisabled();
  await expect(page.getByTestId("readiness")).toContainText("Readiness 23");

  // 3. Council & Directions → critiques, competitors, three directions → pick one
  await page.getByRole("button", { name: /Next: Council & Directions/ }).click();
  await page.getByTestId("run-council").click();
  await expect(page.locator("[data-persona]")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId("competitors").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("no-live-search")).toBeVisible(); // no TAVILY_API_KEY in this run
  await expect(page.locator("[data-direction]")).toHaveCount(3);
  await page.getByRole("radio", { name: /Choose Narrow to one moment/ }).check();
  await expect(page.getByRole("button", { name: /Next: Preview/ })).toBeEnabled();
  if (process.env.SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.SCREENSHOTS_DIR}/council.png`, fullPage: true });

  // Upstream edit → downstream stale → regenerate keeps the pick
  await page.locator('[data-stage="interrogate"]').click();
  await page.locator("#field-problem").fill("Students lose 20 minutes per exam-week day looking for a quiet room");
  await expect(page.getByTestId("stale-banner")).toContainText("Council & Directions");
  await expect(page.locator('[data-stage="council"]')).toHaveAttribute("data-status", "stale");
  await page.getByRole("button", { name: "Regenerate stale" }).click();
  await expect(page.getByTestId("stale-banner")).toHaveCount(0, { timeout: 30_000 });
  await page.locator('[data-stage="council"]').click();
  await expect(page.getByRole("radio", { name: /Choose Narrow to one moment/ })).toBeChecked();

  // autosaved: the home page lists it
  await page.goto("/");
  await expect(page.getByTestId("idea-list")).toContainText(ANSWERS[0]);
});
