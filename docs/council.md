# Idea council (Phase C)

## C0 decision: separate council runner, not the task orchestrator

`server/src/agents/orchestrator.ts` runs **project tasks**: rows in `tasks`, one sequential loop per project,
tool runs in a per-project workspace, artifacts, handoffs, and run budgets counted in *task runs*. An idea council
run has none of that. It is about five LLM calls that produce JSON and finish in under a minute, with no files,
tools or project. Routing it through the orchestrator would mean fake projects, agents and tasks for every idea.
Those would leak into the Supervise UI and the snapshot API, and the `AgentProvider.plan/run` contract would have
to grow a JSON-opinion method that the mock and Gemma providers don't need.

The council therefore uses its own small runner (`server/src/council/runner.ts`). It reuses the orchestrator's
**patterns**, not its code:

| Orchestrator concept | Council equivalent |
|---|---|
| Plan approval gate (`AWAITING_APPROVAL` → `RUNNING`) | Idea run created awaiting approval; LLM calls only start after the user approves (Phase D2 API) |
| Run budget (`maxTasks`, `maxRuntimeMs`) | `maxCalls` per run (default 5) on top of the provider RPM/RPD budgets in `FallbackChain` |
| Cancel | `AbortSignal`; an aborted run rejects with `LlmError` reason `ABORTED` |
| Restart recovery | Persisted runs left `RUNNING` are marked failed on boot (Phase D1) |
| Activity log / handoffs | `onTurn` callback emits each `CouncilTurn` in order for persistence and the transcript UI |
| Rule-based planner fallback | Rule-based `scoreIdea` report fallback |

## Rounds

1. **Drafts.** The feasibility engineer, the market and user analyst, and the hackathon judge each score only
   their own criteria and add risks, suggestions and judge questions (`DraftSchema`).
2. **Critique.** The critic flags inflated scores, contradictions and missing risks (`CritiqueSchema`).
3. **Synthesis.** The chair scores all seven criteria and writes the final risks, suggestions and questions
   (`SynthesisSchema`).

Turns run one at a time. This is gentler on free-tier limits (Groq allows 8K tokens/min) and keeps the transcript
in a fixed order. Each role sets a `prefer` provider so the council spreads across models: Groq for the members,
OpenRouter for the critic, Gemini for the chair. The chain falls back to other providers as usual.

## Degradation (never a hard failure)

| Situation | Result |
|---|---|
| No providers configured | Rule-based report, `fallback: 'NOT_CONFIGURED'`, no calls |
| `maxCalls < 2` | Rule-based report, `fallback: 'BUDGET'` |
| A member fails on every provider | Turn `failed`; the council continues with the other members |
| Every member fails | Rule-based report, `fallback: 'NO_DRAFTS'`; critique and chair skipped |
| Critique fails or is over budget | Chair runs without it |
| Chair fails | Member scores are averaged; `analysis.council.note` says so |

## Report mapping

The council replaces `criteria` (evidence label `Inferred`), `overallScore`, `verdict` (same thresholds as
`scoreIdea`), `topRisks`, `upgradeSuggestions` (any empty group keeps its rule-based items) and `judgeQuestions`.
The idea card, simulations, time-crunch plan, system design and UI/UX direction stay rule-based.
`analysis.method` is `'council'`, and `analysis.council` lists the members, providers and call count.

## Schemas

Each schema is built once with small helpers (`server/src/council/schema.ts`), which produce the zod validator
and the strict JSON Schema together. Some strict structured-output modes reject `minimum`/`maxItems`, so bounds
are applied on our side instead: scores are clamped to 0–100, text is cut and lists are truncated.
