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
| Run budget (`maxTasks`, `maxRuntimeMs`) | `maxCalls` real provider requests per run, retries included (default 5), on top of the provider RPM/RPD budgets in `FallbackChain`; one is reserved for the chair |
| Cancel | `AbortSignal`; an aborted run rejects with `LlmError` reason `ABORTED`, also when aborted before the first call, while the last call resolves, or from inside `onTurn` |
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
| A member returns no scores for its own criteria | Turn `failed` with reason `NO_SCORES` (off-focus scores are dropped before the turn is recorded) |
| Retries use up the budget | Only requests actually sent count (a `NOT_CONFIGURED` rejection is free). The chain stops with a `BUDGET` attempt; later drafts and the critique are skipped, the chair keeps its reserved request |
| Every member fails | Rule-based report, `fallback: 'NO_DRAFTS'`; critique and chair skipped |
| Critique fails or is over budget | Chair runs without it |
| Chair fails | Member scores are averaged; `analysis.council.note` says so |
| Chair omits some criteria | Those use member averages, or the heuristic score if no member covered them; the note lists them |

## Report mapping

The council replaces `criteria` (evidence label `Inferred`), `overallScore`, `verdict` (same thresholds as
`scoreIdea`), `topRisks`, `upgradeSuggestions` (any empty group keeps its rule-based items) and `judgeQuestions`.
The chair also generates the Idea Card during synthesis; if chair synthesis fails, the rule-based Idea Card remains.
Simulations, time-crunch plan, system design and UI/UX direction stay rule-based.
`analysis.method` is `'council'`, and `analysis.council` lists the members, providers and call count.
The IdeaMate page attributes the Idea Card and Solidity check to the successful chair provider/model when available. If the report uses the rule-based fallback, it is labeled as such; if chair synthesis fails but member drafts succeed, the page labels that council fallback and lists the successful providers/models.

## Schemas

Each schema is built once with small helpers (`server/src/council/schema.ts`), which produce the zod validator
and the strict JSON Schema together. Some strict structured-output modes reject `minimum`/`maxItems`, so bounds
are applied on our side instead: scores are clamped to 0–100, text is cut and lists are truncated.

## Runs, approval and persistence (Phase D)

`CouncilService` (`server/src/council/service.ts`) wraps `runCouncil` in an approval-gated run stored in SQLite
(`idea_runs`, `idea_run_turns`; migration `003_idea_runs`).

| Endpoint | Effect |
|---|---|
| `POST /api/ideas/runs` | Body: the IdeaMate input plus optional `maxCalls` (2–20, default 5). Creates a run `AWAITING_APPROVAL`; no LLM call |
| `POST /api/ideas/runs/:id/approve` | `AWAITING_APPROVAL` → `RUNNING`; the council runs in the background. Only one run at a time (`409 RUN_ACTIVE`) |
| `POST /api/ideas/runs/:id/cancel` | Open run → `CANCELLED`; a running council is aborted and stores no report |
| `GET /api/ideas/runs/:id` | Run, its turns in order (`seq`, role, provider, model, attempts, usage, output) and the providers configured now |
| `GET /api/ideas/runs` | Latest runs, newest first |

Each turn is written as it finishes, so a client can poll the transcript while the run is `RUNNING`. A run ends
`COMPLETED` with a report (council or rule-based fallback, see `fallback`), `CANCELLED`, or `FAILED`. Runs left
`RUNNING` by a restart are marked `FAILED` on boot. With no provider keys, an approved run completes immediately
with the rule-based report and `fallback: 'NOT_CONFIGURED'`, so mock mode and E2E stay deterministic.

The IdeaMate page creates a run before asking for approval, so the user can see configured providers and the
call budget before any model request. Quick mode sets `maxCalls` to 4 (three specialist drafts and the chair;
critique is skipped); Deep mode sets it to 5 (drafts, critique and chair). During execution the page polls the
persisted run and displays turn status plus provider/model attribution. Deep web research remains a separate,
explicit approval after the report is complete. Users may choose a rule-based template report instead of starting
the council.


## Plan review council (planning workspace, step 5)

A separate council reviews the whole plan before the human approves it. This is different from the idea council above, which assesses an idea on its own.

- **Endpoints:**
  - `POST /api/plans/reviews` with `{ spec, agents?, focus? }` starts a review in the background (202).
  - `GET /api/plans/reviews/:id` returns its turns and result.
  - `POST /api/plans/reviews/:id/cancel` stops it.
  - Reviews are kept in memory (the latest 50) and are lost on restart.
- **Agents:** `breaker` (Red-team engineer), `skeptic` (Skeptical judge), `builder` (Lead builder) and `user` (User advocate). The default is the first three. Each agent returns a stance, a 0–100 solidity score, pros, cons, and up to four attacks. Every attack has a severity and `holds` (whether the plan as written survives it).
- **Chair:** returns a summary, solidity, verdict, pros, cons, blockers and required changes.
- **Budget:** one model call per agent plus the chair, sent through the same provider chain and budgets as the idea council.
- **Verdict rule:** `approval-ready` needs solidity ≥ 70 and no unresolved high-severity attack. Otherwise it's `needs-changes` at ≥ 45, or `not-ready` below that. If the chair claims more than the rule allows, the verdict is downgraded and a note explains why.
- **Degradation:**
  - A failed agent is recorded and skipped.
  - A failed chair means the agents' opinions are combined without it.
  - No provider, or no agent answering, falls back to rule-based checks, labelled as such in the result (`method: "rule-based"`, `fallback`).
- **Safety:** the plan and the leader's focus question go to the model inside `<plan>`/`<focus>` tags as data, not instructions.
