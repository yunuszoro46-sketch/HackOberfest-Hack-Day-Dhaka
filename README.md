# TeamMate

**Don't just chat with AI. Build with AI teammates.**

A hackathon team leader creates a project, picks specialised AI teammates, types one command in plain language, and watches it become assigned tasks with real deliverables: files written to disk, tests actually executed, a QA report with the raw output, and docs generated from the project's own data.

## Quick start

Requires **Node 22.18+** (check with `node -v`). QA runs the generated tests with Node's built-in TypeScript support, which older 22.x releases don't enable by default — on older versions QA will correctly report FAIL.

```bash
npm install
npm run dev          # API on :3001, UI on http://localhost:5173
```

Production-style (one process, UI served by the API):

```bash
npm run build
npm start            # http://localhost:3001
```

Tests:

```bash
npm test             # vitest: unit, API, orchestration, supervised runs, full acceptance scenario
npm run test:e2e     # Playwright browser smoke test (builds and starts its own server)
```

## Environment

Copy `.env.example` to `.env` (optional — everything works with no `.env`).

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_PROVIDER` | `mock` | `mock`: rule planner + role templates. `gemma`: Gemma plans the tasks; role templates still execute them. |
| `GEMMA_API_KEY` | — | Google AI Studio key. Sent only in the `x-goog-api-key` header, never in the URL or logs. |
| `GEMMA_MODEL` | `gemma-3-27b-it` | Pick an id your key can use: `GET https://generativelanguage.googleapis.com/v1beta/models`. |
| `PORT` | `3001` | API port. |
| `TEAMMATE_DB` | `server/data/teammate.db` | SQLite file. |
| `TEAMMATE_WORKSPACE` | `server/workspace/` | Where agents write files (one folder per project). |

## Architecture

```
client/   Vite + React 19 + Tailwind v4     polls GET /api/projects/:id/snapshot (1.5s busy, 6s idle)
server/   Express 5 + better-sqlite3 + Zod  run with tsx
shared/   types.ts — the API contract, task states and legal transitions
```

- **Planner** (`server/src/agents/planner.ts`) splits the command into clauses and scores each against per-role keyword patterns (nouns outrank verbs). Tasks for roles not on the team are created **BLOCKED** ("No Documentation Writer on the team"), never dropped. With `AGENT_PROVIDER=gemma`, Gemma plans instead. If Gemma errors or times out (12s), the rule planner takes over, and the command is labelled `rules (fallback: gemma — <reason>)`.
- **Orchestrator** (`server/src/agents/orchestrator.ts`) runs one sequential loop per project, in planner order. Each task is claimed with a SQL compare-and-swap (`UPDATE … WHERE status='QUEUED'`), so a task can't run twice. Later agents receive earlier agents' summaries and files.
- **Tools** (`server/src/tools/toolbox.ts`) are confined to `server/workspace/<projectId>/`. Absolute paths and `..` escapes are rejected. Agents can run only two named commands: `syntax-check` and `run-tests`. There is no free-form shell. Commands time out after 15s, and every tool call is logged to the activity feed.
- **State machine** (`shared/types.ts`): `QUEUED → IN_PROGRESS | BLOCKED`, `IN_PROGRESS → REVIEW | FAILED | BLOCKED`, `REVIEW → COMPLETED`, `FAILED → QUEUED` (retry), `BLOCKED → QUEUED` (unblock). The leader can never set `IN_PROGRESS`. Illegal moves return `409 INVALID_TRANSITION`.
- **Persistence**: SQLite (WAL) with tracked migrations. Artifact contents are stored in the DB as well as on disk. If the workspace folder is deleted, the next run restores it from the DB. On boot, any task left `IN_PROGRESS` becomes `FAILED ("Interrupted by restart")`.

## What is real vs. mock

Each run row records its provider, and the UI shows it as a badge.

| Part | With `mock` | With `gemma` |
|---|---|---|
| Turning a command into tasks | Rule-based planner | **Gemma model** (rule planner as fallback) |
| Frontend files | Role templates, using the project's name and goal and the task title | same |
| Running the files | **Real**: `node --check` / TS parse and `node --test` | same |
| QA report | **Real** results and raw output; PASS only if every check passed | same |
| Docs README | **Real** project data: goal, constraints, decisions, results, file list, QA verdict | same |
| Backend / AI-ML / Researcher | A note marked as mock output | same |

No model writes code in this version. The demo says so, and every artifact shows the `mock · template` badge.

## Demo script (4 minutes)

- [ ] 1. Landing → **Build Your Team**
- [ ] 2. Create **StudySpace** — goal "Book study rooms on campus", constraints "React + TypeScript, no external services"
- [ ] 3. Select **Frontend Engineer** + **QA Engineer** → Continue to workspace
- [ ] 4. Paste (or click "Use demo command"): *Build a room availability interface, implement booking validation, test edge cases, and document the result.*
- [ ] 5. Point at the plan waiting for approval: 4 tasks in order. Docs shows "blocked: No Documentation Writer on the team". Nothing has run yet. Click **Approve plan**
- [ ] 6. Watch Frontend write files and QA run the tests (tool calls appear in the activity feed); open `reports/qa-report.md` → **Verdict: PASS**, 7 tests passed
- [ ] 7. **Approve** one task → COMPLETED
- [ ] 8. Stop the server (Ctrl+C), `npm start` again, reload — everything is still there
- [ ] 9. Open **Supervise** (works at phone width). Command: *simulate a failure* → **Approve plan** → the task FAILS and the run PAUSES with a decision card → **Approve (retry)** → REVIEW (attempt 2, both runs kept), or **Reject (skip)** → the run continues and completes
- [ ] 10. **Edit team** → add Documentation Writer → **Unblock** Docs → open `docs/README.md`, generated from the project data
- [ ] 11. Context page: add a decision, show the command history with the planner label
- [ ] 12. (Optional) `AGENT_PROVIDER=gemma npm start` and repeat step 4: the planner badge reads `gemma`

## Supervised autonomy — what is implemented

- **Runs with an approval gate.** Every command creates a run in `AWAITING_APPROVAL`. Its tasks are `BLOCKED` ("Awaiting plan approval") until the leader approves the plan. Nothing executes before approval. The leader can also discard the plan.
- **Run controls:** pause, resume and cancel. Pause stops new tasks from starting; the current task finishes first. Cancel moves queued tasks to `BLOCKED` ("Run cancelled"). Illegal moves return `409`. Only one active run per project (`409 RUN_ACTIVE`).
- **Limits.** Before each task starts, the run is re-read. A task starts only if the run is `RUNNING`, under `max_tasks` task runs (default 12) and within `max_runtime_ms` (default 2 h). Over a limit, the run becomes `FAILED` with "Budget exhausted: …". When nothing is left to start, the run is `COMPLETED`.
- **Failure → decision gate.** When a task fails inside a run, the run pauses and a decision opens: "Task X failed: … Retry or skip?". Approve retries the task; reject marks it "Skipped by leader". Either way the run continues. Optional instructions are stored on the decision, saved as a leader note on the task and passed to the next attempt's context. The mock templates don't read them. The outcome is also recorded on the Context page.
- **Handoff messages.** When a task in a run reaches REVIEW, a `handoff` message goes to the next queued task's role: "Artifacts ready: … Summary: …". Execution is sequential, so there is no file locking.
- **Mobile supervise page** (`/projects/:id/supervise`). It shows run status, progress, elapsed time and budget, the valid controls, the decision inbox, agents, tasks, the last 10 activity rows, deliverables and a command field. The command field is locked, with the reason shown, while a run is active. The inbox is **in-app only — an in-app approval inbox, not push notifications**. The page polls every 2 s while running and every 6 s otherwise.
- **Restart.** Tasks left `IN_PROGRESS` become `FAILED` ("Interrupted by restart"). Every `RUNNING` run restarts its loop on boot, so its queued work resumes.
- **Provenance.** Run, decision and handoff rows store the provider name (`mock` here). The UI shows the `mock · template` badge on agent output.
- **Leader actions on a finished run.** Unblocking or retrying a task of a `COMPLETED`/`FAILED` run reopens that run. They are refused while the plan awaits approval or after cancel.

**Not implemented:**
- a per-task dependency graph (tasks run sequentially in planner order instead)
- running more than one task at a time
- file locking
- plan revision or versioning, and re-approval after a plan change
- decision types other than task failure
- push notifications
- a deadline field
- SSE or live push (the page polls instead)
- Gemma `run()`

A task interrupted by a restart doesn't open a decision. Retry it from the board.

## API

`GET /api/health` · `GET /api/roles` · `GET|POST /api/projects` · `GET /api/projects/:id` · `GET /api/projects/:id/snapshot` · `PUT /api/projects/:id/agents` · `POST /api/projects/:id/decisions` · `POST /api/projects/:id/commands` (202) · `GET /api/projects/:id/tasks` · `GET|PATCH /api/tasks/:id` · `POST /api/tasks/:id/retry` · `GET /api/projects/:id/activity` · `GET /api/projects/:id/artifacts` · `GET /api/artifacts/:id` · `GET /api/activity/recent` · `GET /api/runs/:id` · `POST /api/runs/:id/approve|pause|resume|cancel` · `POST /api/decisions/:id` `{action: "approve"|"reject", instructions?}`. The snapshot also returns `run` and `pendingDecisions`; commands accept optional `maxTasks` and `maxRuntimeMs`.

Errors always look like `{ "error": { "code", "message", "details?" } }`. Codes: `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `INVALID_TRANSITION` / `NO_AGENTS` / `STALE` / `RUN_ACTIVE` 409, `EMPTY_PLAN` 422, `INTERNAL` 500.

## Known limitations

- Gemma only plans. Execution always uses the role templates (`run()` with Gemma isn't built yet).
- Only the Frontend, QA and Docs roles produce substantive output. Backend, AI/ML and Researcher write a labelled placeholder note.
- Execution is sequential within a project, with no dependency graph. QA and Docs are always ordered last. There is no file locking, because only one task runs at a time.
- There is no auth and only one user. Updates come from polling, not websockets.
- QA's component check reads the `.tsx` file statically. It is not rendered or type-checked.
