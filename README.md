# TeamMate

**Don't just chat with AI. Build with AI teammates.**

A hackathon team leader creates a project, picks specialised AI teammates, types one command in plain language, and watches it become assigned tasks with real deliverables: files written to disk, tests actually executed, a QA report with the raw output, and docs generated from the project's own data.

## Quick start

Requires Node 22+.

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
npm test             # vitest: unit, API, orchestration, full acceptance scenario
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
- [ ] 5. Point at the planner note and the 4 tasks — Docs is **BLOCKED**: "No Documentation Writer on the team"
- [ ] 6. Watch Frontend write files and QA run the tests (tool calls appear in the activity feed); open `reports/qa-report.md` → **Verdict: PASS**, 7 tests passed
- [ ] 7. **Approve** one task → COMPLETED
- [ ] 8. Stop the server (Ctrl+C), `npm start` again, reload — everything is still there
- [ ] 9. Command: *simulate a failure* → FAILED → **Retry** → REVIEW (attempt 2, both runs kept)
- [ ] 10. **Edit team** → add Documentation Writer → **Unblock** Docs → open `docs/README.md`, generated from the project data
- [ ] 11. Context page: add a decision, show the command history with the planner label
- [ ] 12. (Optional) `AGENT_PROVIDER=gemma npm start` and repeat step 4: the planner badge reads `gemma`

## API

`GET /api/health` · `GET /api/roles` · `GET|POST /api/projects` · `GET /api/projects/:id` · `GET /api/projects/:id/snapshot` · `PUT /api/projects/:id/agents` · `POST /api/projects/:id/decisions` · `POST /api/projects/:id/commands` (202) · `GET /api/projects/:id/tasks` · `GET|PATCH /api/tasks/:id` · `POST /api/tasks/:id/retry` · `GET /api/projects/:id/activity` · `GET /api/projects/:id/artifacts` · `GET /api/artifacts/:id` · `GET /api/activity/recent`

Errors always look like `{ "error": { "code", "message", "details?" } }`. Codes: `VALIDATION_ERROR` 400, `NOT_FOUND` 404, `INVALID_TRANSITION` / `NO_AGENTS` / `STALE` 409, `EMPTY_PLAN` 422, `INTERNAL` 500.

## Known limitations

- Gemma only plans. Execution always uses the role templates (`run()` with Gemma isn't built yet).
- Only the Frontend, QA and Docs roles produce substantive output. Backend, AI/ML and Researcher write a labelled placeholder note.
- Execution is sequential within a project, with no dependency graph. QA and Docs are always ordered last.
- There is no auth and only one user. Updates come from polling, not websockets.
- QA's component check reads the `.tsx` file statically. It is not rendered or type-checked.
