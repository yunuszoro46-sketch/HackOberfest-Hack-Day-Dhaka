// Stage 5 — Prompt Compiler. Template-filled, never freeform: the same card always compiles to the same Markdown.
// Targets change headings and tone, not content.
import { toSql } from "../architecture/sql";
import { archetypeById } from "../archetypes";
import { findScreens } from "../preview/sanitize";
import { chosenDirection, PERSONAS, type Endpoint, type IdeaCard, type PromptTarget, type Service } from "../schema/ideaCard";
import { councilVerdict } from "../verdict";
import { outOfScopeOf } from "./common";
import { PERSONA_BRIEFS } from "./council";

export const SECTION_KEYS = [
  "project", "problem", "core", "direction", "outOfScope", "stack", "dataModel", "api", "screens", "services", "deployment", "acceptance", "workOrder", "risks",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const HEADINGS: Record<PromptTarget, Record<SectionKey, string>> = {
  generic: {
    project: "Project", problem: "Problem & User", core: "Core Action", direction: "Chosen Direction", outOfScope: "Out of Scope", stack: "Stack",
    dataModel: "Data Model", api: "API Surface", screens: "Screens", services: "Services & Env Vars", deployment: "Deployment",
    acceptance: "Acceptance Criteria", workOrder: "Work Order", risks: "Risks to Watch",
  },
  "claude-code": {
    project: "Project", problem: "Problem & User", core: "Core Action", direction: "Chosen Direction", outOfScope: "Out of Scope (do not build)", stack: "Stack (fixed)",
    dataModel: "Data Model", api: "API Surface", screens: "Screens", services: "Services & Env Vars", deployment: "Deployment",
    acceptance: "Acceptance Criteria (verify each)", workOrder: "Work Order (one step at a time)", risks: "Risks to Watch",
  },
  cursor: {
    project: "Context", problem: "Problem & User", core: "Core Action", direction: "Product Direction", outOfScope: "Never Implement", stack: "Tech Stack Rules",
    dataModel: "Data Model", api: "API Contract", screens: "Screens", services: "Services & Env Vars", deployment: "Deployment",
    acceptance: "Definition of Done", workOrder: "Implementation Order", risks: "Known Risks",
  },
  lovable: {
    project: "What we're building", problem: "Who it's for", core: "The one thing users do", direction: "The angle", outOfScope: "Please don't add",
    stack: "Tech choices", dataModel: "Data to store", api: "Backend endpoints", screens: "Screens to build", services: "Services & secrets",
    deployment: "Publishing", acceptance: "It works when…", workOrder: "Build it in this order", risks: "Watch out for",
  },
};

const INTRO: Record<PromptTarget, string> = {
  "claude-code": "You are Claude Code working in an empty repository. Build the MVP described below. Work step by step through the Work Order. After each step, run the build and tests, verify the step's acceptance criteria, and tell me what you built and how you verified it before moving on. Do not add anything listed under Out of Scope. If something is ambiguous, choose the option that keeps the main flow shortest and say so.",
  cursor: "Use these rules for every change in this project. Follow the Implementation Order; keep each change small; never implement anything under Never Implement.",
  lovable: "Please build this app. Keep it simple and focused on the one main flow below.",
  generic: "Build the MVP described below, following the Work Order. Treat Out of Scope as hard limits.",
};

const TITLE: Record<PromptTarget, string> = {
  "claude-code": "Build prompt for Claude Code",
  cursor: ".cursorrules — project rules",
  lovable: "Build request for Lovable",
  generic: "Build prompt",
};

const list = (items: string[], empty = "_None recorded._") => (items.length ? items.map((i) => `- ${i}`).join("\n") : empty);
const or = (s: string, fallback = "_Not set._") => (s.trim() ? s.trim() : fallback);

export function projectName(card: IdeaCard): string {
  return chosenDirection(card)?.title || card.coreAction.value.split(/\s+/).slice(0, 5).join(" ") || "Untitled project";
}

/** Env var name for a third-party service, e.g. "Turso" → TURSO_API_KEY. */
export const envVarFor = (s: Service) => `${s.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase() || "SERVICE"}_API_KEY`;

export function screensOf(card: IdeaCard): { id: string; title: string }[] {
  const html = chosenDirection(card)?.previewHtml;
  return html ? findScreens(html) : [];
}

export interface AcceptanceItem {
  /** Stable within one compile: AC-01, AC-02, … (screens first, then endpoints). */
  id: string;
  text: string;
  kind: "screen" | "endpoint";
  screen?: { id: string; title: string };
  endpoint?: Endpoint;
}

export function acceptanceItems(card: IdeaCard): AcceptanceItem[] {
  const screens = screensOf(card).map((s) => ({ kind: "screen" as const, screen: s, text: `Screen "${s.title}" renders with realistic data, has loading, empty and error states, and its primary action works.` }));
  const endpoints = (card.architecture?.apiSurface.value ?? []).map((e) => ({
    kind: "endpoint" as const,
    endpoint: e,
    text: `\`${e.method} ${e.path}\` returns ${e.response || "the documented response"}${e.note ? ` (${e.note})` : ""}, and rejects invalid input with a 4xx.`,
  }));
  return [...screens, ...endpoints].map((x, i) => ({ ...x, id: `AC-${String(i + 1).padStart(2, "0")}` }));
}

export function acceptanceCriteria(card: IdeaCard): string[] {
  return acceptanceItems(card).map((a) => a.text);
}

export function workOrder(card: IdeaCard): string[] {
  const a = card.architecture;
  const stack = a?.candidates.find((c) => c.id === a.chosenId);
  const steps = [`Scaffold the project with ${stack ? stack.stack.join(", ") : "the chosen stack"}; add a README with setup steps.`];
  if (a?.dataModel.value.length) steps.push(`Create the data model (${a.dataModel.value.map((e) => e.name).join(", ")}) from the SQL below, plus labelled seed data.`);
  for (const e of a?.apiSurface.value ?? []) steps.push(`Implement \`${e.method} ${e.path}\` with input validation and a test.`);
  for (const s of screensOf(card)) steps.push(`Build the "${s.title}" screen and wire it to the API.`);
  if (a?.services.value.length) steps.push(`Integrate ${a.services.value.map((s) => s.name).join(", ")} behind server-side env vars.`);
  if (acceptanceItems(card).length) steps.push("Make `tests/acceptance.spec.ts` pass (Playwright, `baseURL` = the dev server). Each test is named by its AC id; replace its TODO with the real flow, never delete a test.");
  steps.push(`Deploy to ${a?.deployment.value?.target ?? "the chosen host"} and run every acceptance criterion against the live URL.`);
  steps.push("Finish with a build report: one line per criterion, `AC-01 PASS` or `AC-01 FAIL — reason`, then the test summary. Paste it into TeamMate's Verify stage.");
  return steps;
}

function verdictLine(card: IdeaCard): string {
  const v = councilVerdict(card);
  return v ? `\n\nCouncil verdict: ${v.summary}` : "";
}

function visualDirection(card: IdeaCard): string {
  const a = archetypeById(card.archetypeId);
  if (!a) return "";
  return `**Visual direction: ${a.name}** — ${a.tagline}\n- Palette: ${a.palette.map((p) => `${p.name} \`${p.hex}\``).join(", ")}\n- Type: display ${a.typography.display}; body ${a.typography.body}; numbers ${a.typography.data}\n${a.principles.map((p) => `- ${p}`).join("\n")}`;
}

function sections(card: IdeaCard): Record<SectionKey, string> {
  const dir = chosenDirection(card);
  const a = card.architecture;
  const stack = a?.candidates.find((c) => c.id === a.chosenId);
  const c = card.constraints;
  const screens = screensOf(card);
  const services = a?.services.value ?? [];
  const needsDb = (a?.dataModel.value.length ?? 0) > 0;
  return {
    project: [
      `**${projectName(card)}** — ${or(card.coreAction.value)}`,
      `Constraints: team of ${c.teamSize}, ${c.deadlineDays} day(s) to the deadline, budget $${c.budgetUSD}.`,
      c.skills.length ? `Builder skills: ${c.skills.join(", ")}.` : "",
      c.mustUse.length ? `Must use: ${c.mustUse.join(", ")}.` : "",
      c.mustAvoid.length ? `Must avoid: ${c.mustAvoid.join(", ")}.` : "",
    ].filter(Boolean).join("\n"),
    problem: `**Problem:** ${or(card.problem.value)}\n\n**Target user:** ${or(card.targetUser.value)}\n\n**Why now:** ${or(card.whyNow.value)}`,
    core: or(card.coreAction.value),
    direction: dir
      ? [`**${dir.title}** — ${or(dir.oneLiner)}`, "", or(dir.rationale), card.council ? `\nThe council's objections this direction must answer:\n${list(PERSONAS.map((p) => `${PERSONA_BRIEFS[p].title} (${card.council![p].verdict}, solidity ${card.council![p].solidity}/5): ${card.council![p].strongest_objection}`))}${verdictLine(card)}` : ""].join("\n")
      : "_No direction chosen._",
    outOfScope: list(outOfScopeOf(card)),
    stack: stack ? `**${stack.name}**\n${list(stack.stack)}\n\nWhy: ${stack.why}\nWatch: ${stack.whyNot}` : "_No stack chosen._",
    dataModel: a?.dataModel.value.length
      ? `${a.dataModel.value.map((e) => `**${e.name}**: ${e.fields.map((f) => `${f.name} (${f.type})`).join(", ")}${e.relations.length ? `; ${e.relations.join("; ")}` : ""}`).join("\n")}\n\n\`\`\`sql\n${toSql(a.dataModel.value)}\n\`\`\``
      : "_No data model._",
    api: a?.apiSurface.value.length
      ? `| Method | Path | Request | Response | Note |\n|---|---|---|---|---|\n${a.apiSurface.value.map((e) => `| ${e.method} | \`${e.path}\` | ${e.request || "—"} | ${e.response || "—"} | ${e.note || ""} |`).join("\n")}`
      : "_No endpoints._",
    screens: [
      screens.length ? screens.map((s, i) => `${i + 1}. **${s.title}** (\`${s.id}\`)`).join("\n") + "\n\nA clickable HTML mockup of these screens is in `preview.html`." : "_No preview generated; derive screens from the core action._",
      visualDirection(card),
    ].filter(Boolean).join("\n\n"),
    services: [
      services.length ? services.map((s) => `- **${s.name}** — ${s.reason}. Free tier: ${s.freeTier}. Env var: \`${envVarFor(s)}\``).join("\n") : "- No third-party services.",
      needsDb ? "- Database connection: `DATABASE_URL`" : "",
      "\nAll keys are server-side env vars; never expose them to the browser.",
    ].filter(Boolean).join("\n"),
    deployment: a?.deployment.value
      ? `Target: **${a.deployment.value.target}** · estimated $${a.deployment.value.estCostPerMonth}/month · about ${a.deployment.value.estHoursToFirstDeploy} hour(s) to the first deploy.`
      : "_No deployment target chosen._",
    acceptance: list(acceptanceItems(card).map((x) => `[ ] **${x.id}** ${x.text}`), "_Generate a preview and an API surface to get criteria._"),
    workOrder: workOrder(card).map((s, i) => `${i + 1}. ${s}`).join("\n"),
    risks: a?.risks.value.length ? list(a.risks.value.map((r) => `**${r.risk}** (${r.likelihood}) — ${r.mitigation}`)) : "_No risks recorded._",
  };
}

/** The CLAUDE.md file content: standing instructions for Claude Code in the new repo. */
export function claudeMd(card: IdeaCard): string {
  const a = card.architecture;
  const stack = a?.candidates.find((c) => c.id === a.chosenId);
  return `# CLAUDE.md — ${projectName(card)}

## What this is
${or(card.coreAction.value)}
Target user: ${or(card.targetUser.value)}

## Rules
- Work step by step through the Work Order in PROMPT.md. After each step run the build and tests and verify that step's acceptance criteria before moving on.
- Stack is fixed: ${stack ? stack.stack.join(", ") : "see ARCHITECTURE.md"}. Do not add frameworks.
- Never build anything listed under Out of Scope:
${outOfScopeOf(card).map((o) => `  - ${o}`).join("\n") || "  - (none recorded)"}
- Keys and secrets live in server-side env vars only.
- Prefer the shortest path to a working main flow; say when you make a judgment call.
`;
}

export function compilePrompt(card: IdeaCard, target: PromptTarget): string {
  const h = HEADINGS[target];
  const s = sections(card);
  const body = SECTION_KEYS.map((k) => `## ${h[k]}\n\n${s[k]}`).join("\n\n");
  const extra = target === "claude-code" ? `\n\n## CLAUDE.md\n\nCreate this file at the repository root first:\n\n\`\`\`markdown\n${claudeMd(card)}\`\`\`\n` : "\n";
  return `# ${TITLE[target]}: ${projectName(card)}\n\n${INTRO[target]}\n\n${body}${extra}`;
}
