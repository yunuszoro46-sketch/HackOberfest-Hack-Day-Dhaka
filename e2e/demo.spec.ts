import fs from "node:fs";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";

const IDEA = "Students on my campus waste time walking around looking for a free study room. I want an app that shows which rooms are free right now and lets them book one.";
const ANSWERS = [
  "Students book a free study room in two taps.",
  "Undergraduates in exam weeks; today they walk floor to floor checking doors.",
  "The library installed room sensors this term and nobody uses the data.",
  "Solo, 2 days, $0 budget, I know React and TypeScript, avoid native mobile.",
  "Not a calendar app, no payments",
];

/** The stage list renders twice (rail, and a strip below 860px); click the visible one. */
const stage = (page: Page, id: string) => page.locator(`[data-stage="${id}"]:visible`);

test("demo path", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // 1. Home → Start from a paragraph
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TeamMate gets you to a prompt you trust. Not to code." })).toBeVisible();
  await page.getByTestId("new-idea-top").click();
  await page.locator("#raw").fill(IDEA);
  await page.getByTestId("new-idea").click();

  // 2. Five questions → the card fills as you answer → build → lock core action
  for (const [i, a] of ANSWERS.entries()) {
    await expect(page.getByTestId("question-count")).toHaveText(`Question ${i + 1} of 5`);
    await page.locator("#answer").fill(a);
    if (i < 4) await page.getByRole("button", { name: "Next" }).click();
  }
  await expect(page.locator("#field-coreAction")).toHaveValue(ANSWERS[0]);
  await expect(page.getByTestId("run-council-from-idea")).toBeEnabled();
  await page.getByTestId("build-card").click();
  await expect(page.getByTestId("idea-card").locator("[data-provenance]")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-lock="Core action"]').click();
  await expect(page.getByRole("button", { name: "Regenerate Core action" })).toBeDisabled();
  await expect(page.getByTestId("readiness-value")).toHaveText("5");

  // 3. Council → critiques, competitors, three directions → pick one
  await page.getByTestId("run-council-from-idea").click();
  await page.getByTestId("run-council").click();
  await expect(page.locator("[data-persona]")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId("competitors").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("no-live-search")).toBeVisible(); // no TAVILY_API_KEY in this run
  await expect(page.locator("[data-direction]")).toHaveCount(3);
  await expect(page.locator('[data-direction="Narrow to one moment"]')).toContainText("NARROW THE USER");
  // The mock investor rejects; no direction is picked yet, so the council blocks.
  await expect(page.getByTestId("council-verdict")).toHaveAttribute("data-status", "blocked");
  await expect(page.locator('[data-persona="investor"] [data-verdict="reject"]')).toBeVisible();
  await page.getByRole("checkbox", { name: "Choose Narrow to one moment" }).check();
  await expect(page.getByTestId("to-preview")).toBeEnabled();

  // Edit a critique in place
  await page.getByRole("button", { name: "Edit Senior Engineer" }).click();
  await page.locator("#engineer-one_question").fill("Where does live room data come from?");
  await page.getByRole("button", { name: "Edit Senior Engineer" }).click();
  await expect(page.locator('[data-persona="engineer"]')).toContainText("Where does live room data come from?");

  // Upstream edit → downstream stale → regenerate keeps the pick
  await stage(page, "interrogate").click();
  await page.locator("#field-problem").fill("Students lose 20 minutes per exam-week day looking for a quiet room");
  await expect(page.getByTestId("stale-banner")).toContainText("Council");
  await expect(stage(page, "council")).toHaveAttribute("data-status", "stale");
  await page.getByRole("button", { name: "Regenerate stale" }).click();
  await expect(page.getByTestId("stale-banner")).toHaveCount(0, { timeout: 30_000 });
  await stage(page, "council").click();
  await expect(page.getByRole("checkbox", { name: "Choose Narrow to one moment" })).toBeChecked();

  // 4. Preview → click through 3 screens → regenerate with a note → compare → approve
  await page.getByTestId("to-preview").click();
  await expect(page.getByRole("heading", { name: /What it would look like if you chose Narrow to one moment/ })).toBeVisible();
  await page.getByTestId("generate-preview").click();
  const frame = page.frameLocator('[data-testid="preview-frame"]').first();
  await expect(frame.locator('[data-screen="home"]')).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('[data-screen="pick"]')).toBeHidden();
  // React (served by TeamMate, not a CDN) renders a filterable list inside the sandbox.
  await frame.getByTestId("room-filter").fill("sci");
  await expect(frame.locator("#tm-rooms li")).toHaveCount(1);
  await expect(frame.locator(".tm-hero")).toHaveCSS("background-image", /radial-gradient/);
  // JS off: the static list is shown instead, and screen switching still works.
  await page.getByTestId("preview-scripts").first().click();
  await expect(frame.getByTestId("room-filter")).toHaveCount(0);
  await expect(frame.locator("#tm-rooms li")).toHaveCount(3);
  await page.getByTestId("preview-scripts").first().click();
  await expect(frame.getByTestId("room-filter")).toBeVisible();
  await frame.getByRole("button", { name: "Pick a room" }).click();
  await expect(frame.locator('[data-screen="pick"]')).toBeVisible();
  await frame.getByRole("button", { name: /Book Library 2.14/ }).click();
  await expect(frame.locator('[data-screen="done"]')).toBeVisible();
  await frame.locator('[data-tm-tab="home"]').click(); // bottom switcher bar
  await expect(frame.locator('[data-screen="home"]')).toBeVisible();
  await expect(page.getByTestId("screen-list").locator("li")).toHaveCount(3);
  // the sandbox has no same-origin access to TeamMate
  await expect(page.locator('[data-testid="preview-frame"]').first()).toHaveAttribute("sandbox", "allow-scripts");
  await page.locator("#preview-note").fill("mobile-first");
  await page.getByRole("button", { name: "Apply note" }).click();
  await expect(frame.locator(".max-w-sm")).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole("button", { name: "Invert the mechanic" }).click();
  await expect(page.getByTestId("compare-pane").locator("iframe")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="preview-frame"]')).toHaveCount(2);
  await page.getByTestId("compare-pane").getByRole("button", { name: "Close" }).click();
  await page.getByTestId("approve-direction").click();
  // 5 (one lock) + 15 council (model-memory competitors) + 15 direction + 20 approved preview
  await expect(page.getByTestId("readiness-value")).toHaveText("55");

  // 5. Architecture → pick the recommended stack → diagram, data model, API table
  await page.getByTestId("to-architecture").click();
  await page.getByTestId("suggest-stacks").click();
  const rows = page.locator("[data-candidate]");
  await expect(rows).toHaveCount(3, { timeout: 30_000 });
  await expect(rows.first()).toContainText("Recommended");
  await rows.first().click();
  await expect(page.getByTestId("design")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("mermaid-view").locator("svg")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("sql")).toContainText("create table booking");
  await expect(page.getByTestId("api-table").locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Lock Risk register" }).click();
  await expect(page.getByRole("button", { name: "Regenerate Risk register" })).toBeDisabled();
  await page.locator("#mermaid-src").fill("flowchart LR\n  A[Phone] --> B[Booking API]");
  await expect(page.getByTestId("mermaid-view")).toContainText("Booking API");

  // 6. Sign-off checkpoint → compile → targets → copy → download bundle → v2
  await page.getByTestId("to-prompt").click();
  await expect(page.getByTestId("prompt-editor")).toHaveCount(0); // nothing compiled before sign-off
  await page.getByTestId("compile").click();
  const dialog = page.getByTestId("signoff-dialog");
  await expect(dialog).toContainText("Human Sign-Off Checkpoint");
  await expect(dialog).toContainText("Narrow to one moment");
  await expect(dialog).toContainText("Next.js + SQLite");
  await page.getByTestId("sign-and-compile").click();
  await expect(page.getByTestId("signed-readout")).toContainText(/Specification signed & unlocked/i);
  const editor = page.getByTestId("prompt-editor");
  await expect(editor).toContainText("# Build prompt for Claude Code: Narrow to one moment");
  await page.locator('[data-target="generic"]').click();
  await expect(editor).toContainText("# Build prompt: Narrow to one moment");
  await page.locator('[data-target="claude-code"]').click();
  await expect(editor).toContainText("## CLAUDE.md");
  await page.getByTestId("copy-prompt").click();
  await expect(page.getByTestId("toast")).toContainText("Prompt copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^# Build prompt for Claude Code/);
  await expect(page.getByTestId("bundle-files").locator("li")).toHaveCount(9);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-bundle").click()]);
  expect(download.suggestedFilename()).toBe("narrow-to-one-moment-bundle.zip");
  const zip = await JSZip.loadAsync(fs.readFileSync((await download.path())!));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  expect(names).toEqual(["ACCEPTANCE.md", "ARCHITECTURE.md", "CLAUDE.md", "DECISIONS.md", "PRD.md", "PROMPT.md", "idea-card.json", "preview.html", "tests/acceptance.spec.ts"]);
  expect(await zip.file("tests/acceptance.spec.ts")!.async("string")).toContain('test("AC-01');
  expect(await zip.file("DECISIONS.md")!.async("string")).toContain("Signed the plan: Narrow to one moment");
  expect(await zip.file("PROMPT.md")!.async("string")).toMatch(/^# Build prompt for Claude Code/);
  expect(await zip.file("preview.html")!.async("string")).toContain('data-screen="home"');
  await page.locator("#v2-notes").fill("The agent skipped the 409 on double holds.");
  await page.getByTestId("prompt-v2").click();
  await expect(editor).toContainText("## Changes since v1");
  await expect(editor).toContainText("> The agent skipped the 409 on double holds.");
  await expect(page.getByTestId("readiness-value")).toHaveText(/^(8\d|9\d|100)$/);

  // 7. Verify → paste a (labelled sample) build report → check → write the fix prompt
  await page.getByTestId("to-verify").click();
  await expect(page.getByTestId("verify-stage")).toBeVisible();
  await page.getByTestId("sample-report").click();
  await expect(page.locator("#build-report")).toHaveValue(/AC-01 PASS\nAC-02 FAIL/);
  await page.getByTestId("check-build").click();
  const results = page.getByTestId("check-results");
  await expect(results.locator('[data-ac="AC-01"]')).toHaveAttribute("data-status", "pass", { timeout: 30_000 });
  await expect(results.locator('[data-ac="AC-02"]')).toHaveAttribute("data-status", "fail");
  await expect(results.locator('[data-ac="AC-04"]')).toContainText("matched by model"); // endpoint line without an id
  await page.getByTestId("write-fix").click();
  await expect(editor).toContainText("## Fix these first (build check of prompt v2)");
  await expect(editor).toContainText("**AC-02**");
  await expect(stage(page, "verify")).toHaveAttribute("data-status", "stale"); // the new prompt needs a new check

  // Decision log
  await page.getByTestId("open-log").click();
  const log = page.getByTestId("decision-log");
  await expect(log).toContainText("Checked the build of prompt v2: ");
  await expect(log).toContainText("Wrote prompt v3");
  await expect(log).toContainText("Picked direction: Narrow to one moment");
  await page.keyboard.press("Escape");

  // 8. Share for review → reviewer questions a decision → reply link → review lands in the idea
  await page.getByTestId("share-link").click();
  const shareUrl = await page.getByTestId("share-url").inputValue();
  expect(shareUrl).toMatch(/\/review#card=v1\./);
  const reviewer = await context.newPage();
  await reviewer.goto(shareUrl);
  await expect(reviewer.getByTestId("review-page")).toContainText("Review the plan for Narrow to one moment");
  await reviewer.locator("#reviewer").fill("Mentor Rahim");
  await reviewer.locator('[data-decision="1"]').getByRole("radio", { name: "? Question it" }).click();
  await reviewer.getByLabel(/Comment on: Which stack/).fill("SQLite on Vercel needs Turso; say so.");
  await reviewer.locator('[data-verdict="changes"]').click();
  await reviewer.getByTestId("make-reply").click();
  const replyUrl = await reviewer.locator("#reply-link").inputValue();
  await reviewer.close();
  expect(replyUrl).toContain("#review=v1.");
  await page.goto(replyUrl);
  await expect(page.getByTestId("incoming-review")).toContainText("Review from Mentor Rahim: approved with changes");
  await page.getByTestId("add-review").click();
  await stage(page, "prompt").click();
  await expect(page.getByTestId("reviews")).toContainText("SQLite on Vercel needs Turso; say so.");

  // autosaved: the home page lists it
  await page.goto("/");
  await expect(page.getByTestId("idea-list")).toContainText(ANSWERS[0]);
});
