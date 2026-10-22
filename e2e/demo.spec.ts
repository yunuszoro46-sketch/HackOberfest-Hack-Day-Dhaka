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

  // autosaved: the home page lists it
  await page.goto("/");
  await expect(page.getByTestId("idea-list")).toContainText(ANSWERS[0]);
});
