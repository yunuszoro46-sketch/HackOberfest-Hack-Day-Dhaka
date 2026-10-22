// The export bundle's files, built from the card. Pure, so it is unit-tested; zipping happens in the browser.
import { toSql } from "../architecture/sql";
import { claudeMd, compilePrompt, projectName, screensOf } from "../prompts/compile";
import { outOfScopeOf } from "../prompts/common";
import { PERSONA_BRIEFS } from "../prompts/council";
import { chosenDirection, PERSONAS, type IdeaCard } from "../schema/ideaCard";

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "_None._");

export function prdMarkdown(card: IdeaCard): string {
  const dir = chosenDirection(card);
  return `# PRD — ${projectName(card)}

## Problem
${card.problem.value || "_Not set._"}

## Target user
${card.targetUser.value || "_Not set._"}

## Core action
${card.coreAction.value || "_Not set._"}

## Why now
${card.whyNow.value || "_Not set._"}

## Direction
${dir ? `**${dir.title}** — ${dir.oneLiner}\n\n${dir.rationale}` : "_None chosen._"}

## Council
${card.council ? PERSONAS.map((p) => `### ${PERSONA_BRIEFS[p].title}\n- Strongest objection: ${card.council![p].strongest_objection}\n- What would change their mind: ${card.council![p].what_would_change_my_mind}\n- Question: ${card.council![p].one_question}`).join("\n\n") : "_Not run._"}

## Competitors
${card.competitors.length ? `| Name | What they solve | Gap | Source |\n|---|---|---|---|\n${card.competitors.map((c) => `| ${c.url ? `[${c.name}](${c.url})` : c.name} | ${c.whatTheySolve} | ${c.gap} | ${c.source} |`).join("\n")}` : "_None._"}

## Screens
${list(screensOf(card).map((s) => s.title))}

## Out of scope
${list(outOfScopeOf(card))}

## Constraints
Team of ${card.constraints.teamSize}, ${card.constraints.deadlineDays} day(s), budget $${card.constraints.budgetUSD}. Skills: ${card.constraints.skills.join(", ") || "none listed"}.
`;
}

export function architectureMarkdown(card: IdeaCard): string {
  const a = card.architecture;
  const stack = a?.candidates.find((c) => c.id === a.chosenId);
  if (!a || !stack) return `# Architecture — ${projectName(card)}\n\n_No architecture chosen yet._\n`;
  return `# Architecture — ${projectName(card)}

## Stack: ${stack.name}
${list(stack.stack)}

Why: ${stack.why}
Why not: ${stack.whyNot}

## Candidates considered
| Stack | Speed | Fit | Skills | Cost | Hackathon |
|---|---|---|---|---|---|
${a.candidates.map((c) => `| ${c.name}${c.id === a.chosenId ? " (chosen)" : ""} | ${c.scores.speed} | ${c.scores.fit} | ${c.scores.skills} | ${c.scores.cost} | ${c.scores.hackathon} |`).join("\n")}

## Components
\`\`\`mermaid
${a.diagramMermaid.value}
\`\`\`

## Data model
\`\`\`sql
${toSql(a.dataModel.value)}
\`\`\`

## API surface
| Method | Path | Request | Response | Note |
|---|---|---|---|---|
${a.apiSurface.value.map((e) => `| ${e.method} | \`${e.path}\` | ${e.request || "—"} | ${e.response || "—"} | ${e.note} |`).join("\n")}

## Services
${list(a.services.value.map((s) => `**${s.name}** — ${s.reason} (free tier: ${s.freeTier})`))}

## Deployment
${a.deployment.value ? `${a.deployment.value.target}, ~$${a.deployment.value.estCostPerMonth}/month, ~${a.deployment.value.estHoursToFirstDeploy}h to first deploy.` : "_Not set._"}

## Risks
${list(a.risks.value.map((r) => `**${r.risk}** (${r.likelihood}) — ${r.mitigation}`))}
`;
}

/** File name → content for the "Download bundle" zip. */
export function bundleFiles(card: IdeaCard): Record<string, string> {
  const prompt = card.prompt?.markdown ?? compilePrompt(card, card.prompt?.target ?? "claude-code");
  return {
    "PRD.md": prdMarkdown(card),
    "ARCHITECTURE.md": architectureMarkdown(card),
    "PROMPT.md": prompt,
    "preview.html": chosenDirection(card)?.previewHtml ?? "<!doctype html><title>No preview</title><p>No preview was generated.</p>",
    "CLAUDE.md": claudeMd(card),
    "idea-card.json": JSON.stringify(card, null, 2),
  };
}
