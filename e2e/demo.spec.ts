import fs from "node:fs";
import JSZip from "jszip";
import { expect, test } from "@playwright/test";

const IDEA = "Students on my campus waste time walking around looking for a free study room. I want an app that shows which rooms are free right now and lets them book one.";
const ANSWERS = [
  "Students book a free study room in two taps.",
  "Undergraduates in exam weeks; today they walk floor to floor checking doors.",
  "The library installed room sensors this term and nobody uses the data.",
  "Solo, 2 days, $0 budget, I know React and TypeScript, avoid native mobile.",
  "Not a calendar app, no payments",
];

test("demo path", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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

  // 4. Preview → click through 3 screens → regenerate with "mobile-first" → compare
  await page.getByRole("button", { name: /Next: Preview/ }).click();
  await page.getByTestId("generate-preview").click();
  const frame = page.frameLocator('[data-testid="preview-frame"]').first();
  await expect(frame.locator('[data-screen="home"]')).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('[data-screen="pick"]')).toBeHidden();
  await frame.getByRole("button", { name: "Pick a room" }).click();
  await expect(frame.locator('[data-screen="pick"]')).toBeVisible();
  await frame.getByRole("button", { name: /Book Library 2.14/ }).click();
  await expect(frame.locator('[data-screen="done"]')).toBeVisible();
  await frame.locator('[data-tm-tab="home"]').click(); // bottom switcher bar
  await expect(frame.locator('[data-screen="home"]')).toBeVisible();
  // the sandbox has no same-origin access to TeamMate
  await expect(page.locator('[data-testid="preview-frame"]').first()).toHaveAttribute("sandbox", "allow-scripts");
  await page.locator("#preview-note").fill("mobile-first");
  await page.getByRole("button", { name: "Apply note" }).click();
  await expect(frame.locator(".max-w-sm")).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "Invert the mechanic" }).click();
  await expect(page.getByTestId("compare-pane").locator("iframe")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="preview-frame"]')).toHaveCount(2);
  if (process.env.SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.SCREENSHOTS_DIR}/preview.png`, fullPage: true });

  // 5. Architecture → pick the recommended stack → diagram, data model, API table
  await page.getByRole("button", { name: /Next: Architecture/ }).click();
  await page.getByTestId("suggest-stacks").click();
  const rows = page.getByTestId("candidates").locator("tbody tr");
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(rows.first()).toContainText("recommended");
  await rows.first().getByRole("button", { name: /Choose/ }).click();
  await expect(page.getByTestId("design")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mermaid-view").locator("svg")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("sql")).toContainText("create table booking");
  await expect(page.getByTestId("api-table").locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Lock Risk register" }).click();
  await expect(page.getByRole("button", { name: "Regenerate Risk register" })).toBeDisabled();
  await page.locator("#mermaid-src").fill("flowchart LR\n  A[Phone] --> B[Booking API]");
  await expect(page.getByTestId("mermaid-view")).toContainText("Booking API");
  if (process.env.SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.SCREENSHOTS_DIR}/architecture.png`, fullPage: true });

  // 6. Prompt → toggle to Claude Code → copy → download bundle
  await page.getByRole("button", { name: /Next: Prompt/ }).click();
  await page.getByTestId("compile").click();
  await page.locator('[data-target="generic"]').click();
  await expect(page.locator("#prompt-md")).toHaveValue(/^# Build prompt: Narrow to one moment/);
  await page.locator('[data-target="claude-code"]').click();
  await expect(page.locator("#prompt-md")).toHaveValue(/^# Build prompt for Claude Code: /);
  await expect(page.locator("#prompt-md")).toHaveValue(/## CLAUDE\.md/);
  await page.getByTestId("copy-prompt").click();
  await expect(page.getByTestId("copy-prompt")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^# Build prompt for Claude Code/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-bundle").click()]);
  expect(download.suggestedFilename()).toBe("narrow-to-one-moment-bundle.zip");
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  expect(Object.keys(zip.files).sort()).toEqual(["ARCHITECTURE.md", "CLAUDE.md", "PRD.md", "PROMPT.md", "idea-card.json", "preview.html"]);
  expect(await zip.file("PROMPT.md")!.async("string")).toMatch(/^# Build prompt for Claude Code/);
  expect(await zip.file("preview.html")!.async("string")).toContain('data-screen="home"');
  await expect(page.getByTestId("readiness")).toContainText(/Readiness (8\d|9\d|100)/);
  if (process.env.SCREENSHOTS_DIR) await page.screenshot({ path: `${process.env.SCREENSHOTS_DIR}/prompt.png`, fullPage: true });

  // autosaved: the home page lists it
  await page.goto("/");
  await expect(page.getByTestId("idea-list")).toContainText(ANSWERS[0]);
});
