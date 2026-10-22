
# TeamMate — Build With AI Teammates

**Don't just chat with AI. Build with AI teammates.**

TeamMate is a supervised AI development workspace built at **HackOberfest Hack Day Dhaka**. It explores a different way to work with AI: instead of getting a single answer from a chatbot, you give a project goal to a team of specialized AI teammates, review their plan, supervise execution, and inspect the resulting files and test reports.

### How TeamMate differs from a coding agent

Most coding agents are one agent that plans, writes, tests and reports its own success. You review at the end. TeamMate is built around the human supervising a team:

| Typical coding agent | TeamMate |
|---|---|
| The agent reports its own success | A separate QA teammate runs real commands; the verdict comes from exit codes, never from a model |
| You review a finished diff at the end | You approve the plan before anything runs, and decide every failure |
| Context lives in one long chat | Structured handoffs: the files passed on, the checks the sender actually ran, and open questions |
| Hard to tell what the model did | Every run and file is labelled: which model wrote it, or that a template or deterministic code did |

---

## The Problem

Building software involves more than writing code. Developers must break ideas into tasks, assign responsibilities, coordinate work, test results, and recover when something fails.

Traditional chat-based AI tools are useful for individual questions, but they don't necessarily provide a persistent workflow for managing tasks, tracking artifacts, or supervising execution.

**TeamMate explores a more structured approach:** a workspace where AI teammates receive assigned tasks, produce inspectable outputs, run permitted checks, and report their progress while a human stays in control.

## What You Can Do

- **Create projects:** Define a project goal and constraints.
- **Assess hackathon ideas:** Use IdeaMate's Quick or Deep report, review the model-call estimate, and approve council runs before they start. Rule-based fallback output is labeled; Deep web research needs separate approval.
- **Build a specialized team:** Choose from six roles—Frontend Engineer, Backend Engineer, AI/ML Engineer, QA Engineer, Researcher, and Documentation Writer.
- **Plan with natural language:** Turn a command into an ordered set of tasks.
- **Approve before execution:** Review a proposed plan before any task starts.
- **Supervise runs:** Pause, resume, or cancel execution.
- **Handle failures:** Review a failed task, provide additional instructions, and retry or skip it.
- **Inspect artifacts:** View generated files and review actual QA output.
- **Track team activity:** Follow task updates, recorded handoffs, decisions, files, and tool activity.
- **Continue after restarts:** Project state, tasks, artifacts, and activity are persisted in SQLite.
- **Use mobile supervision:** Monitor runs and manage decisions from a phone-sized interface.

## Interface

The app uses the **TEAM:MATE console design**: an amber-on-black palette with LCD-style readouts and hexagon identity, in **Console** and **Dim (3 a.m.)** themes.
- `/` is the planning workspace. It takes an idea through seven steps: **Idea → Assess → Explore → Plan → Council → Approve → Prompt**.
  - **Customize in every step.** You can edit the assessment's idea card, scores and risks, build your own visual style, and type your own stack. Features, constraints, non-goals and decisions can be added, renamed, re-prioritised or removed, and the final prompt is editable too. Anything you change is labelled **Edited by you**.
  - **Council (step 5).** You pick a few agents and can point them at a concern. The agents are a Red-team engineer, a Skeptical judge, a Lead builder and a User advocate. Each one tries to break the plan; then a chair weighs them up. You get pros, cons, every attack (with whether the plan already survives it), blockers, the changes they ask for, a 0–100 solidity score, and a verdict: **approval-ready**, **needs changes** or **not ready**.
  - **The verdict rule.** Approval-ready needs solidity 70+ and no open high-severity attack, even if the chair says otherwise.
  - **Without a model.** The council runs labelled rule-based checks instead, such as scope vs. hours left, demo-data fallback, and pitch vs. existing tools.
  - **Approve (step 6)** shows the verdict. Approving a plan the council hasn't cleared, or one changed since the review, needs a written reason, and that reason goes into the prompt. Editing the plan after approval asks for a new sign-off.
- `/dashboard` and `/projects/...` hold the supervised AI team projects.
- `/teammate` explains how TeamMate works.
- Press **⌘K / Ctrl+K** anywhere to open the command palette.

## How It Works

1. **Create a project.** Set a goal and define constraints.
2. **Choose teammates.** Select the roles relevant to your project.
3. **Give a command.** Describe what you want the team to accomplish.
4. **Review the plan.** Inspect the proposed tasks and approve or discard the plan.
5. **Supervise execution.** Follow task status, activity, and recorded handoffs. Pause or resume the run when needed.
6. **Review the results.** Inspect generated files, QA verdicts, test counts, exit codes, and raw output.

The workflow is designed around human supervision: a proposed plan cannot execute until it is approved.

## See It in Action

The repository includes screenshots in `docs/screenshots/`. Add or update the images below to match the actual filenames in that directory.

<!-- Replace these paths with the exact screenshot filenames in docs/screenshots/. -->
<!--
<p align="center">
  <img src="docs/screenshots/workspace.png" alt="TeamMate workspace" width="800">
</p>
-->

Recommended screenshots:
- Workspace and agent mission map
- Plan approval and task board
- QA report and generated artifacts
- Mobile supervision interface

## How Much of This Is AI?

TeamMate has three execution modes, set with `AGENT_PROVIDER`. Every agent run records who actually did the work, and the interface shows it on each task, file and handoff.

| Capability | `mock` (default, offline) | `gemma` | `llm` (model-driven) |
|---|---|---|---|
| Task planning | Rule-based planner | Gemma, rule-based fallback | Model via the provider chain (Gemini, Groq, OpenRouter or Ollama), rule-based fallback |
| Builder roles (frontend, backend, AI/ML) | Built-in templates | Built-in templates | **The model writes the files**, then the runner syntax-checks them |
| Researcher | Labelled placeholder note | Same | The model writes `notes/*.md` |
| QA | Real checks and `node --test` | Same | Same: deterministic on purpose, no model |
| Documentation | Built from stored project data | Same | Same: deterministic, no model |
| Fix after a QA failure | Template restores the logic and re-runs the tests | Same | The model gets the QA report, current code and your note, then must pass the tests before handing back |
| Approval, supervision, handoffs | Supported | Supported | Supported |

In `llm` mode the model can only answer with files. Every path is validated before anything is written: builders may write `src/**`, `tests/<name>.test.mjs` and `notes/*.md`. They can't write `reports/`, `docs/`, or anything outside the project workspace. A reply with one bad path writes nothing and the task fails with the reason, so you can retry it with a note. If no model key is configured, `llm` mode falls back to templates and says so in the workspace header.

The orchestration, persistence, approval flow, permitted tool execution, and QA reporting are separate from the model provider.

## Demo: One Task From Plan to Recovery

This is the end-to-end path: real files, real tests, a real failure and a supervised recovery.

1. Start with a model: `AGENT_PROVIDER=llm` and `GEMINI_API_KEY=...` (see [Model-driven execution](#model-driven-execution-gemini)). The workspace header shows `Builders: gemini:gemini-2.5-flash · QA: real checks`. Without a key, the same flow runs offline with templates.
2. Create a project with a **Frontend Engineer** and a **QA Engineer**.
3. Send: `simulate a failure, implement booking validation and test edge cases`.
   - "simulate a failure" is a labelled demo switch. The plan you approve marks the first build task with **[Demo fault injection]**. Its first attempt ships one realistic bug; with a model, the model is told to plant it and to list it under "unknowns".
4. Approve the plan. The builder writes `src/*.ts` and `tests/*.test.mjs`, and the handoff to QA lists the files, the syntax checks that ran, and the unknowns.
5. QA runs `node --test` for real. The tests fail and the run **pauses**. The decision card shows the failing test names and proposes **Send back to fix**.
6. Add a note (for example, "back-to-back bookings must be allowed") and send it back.
   - A fix task is inserted before QA. The builder receives QA's failure report, the current code and your note.
   - It must pass the test suite itself before handing back. QA then re-runs every check and writes a PASS report with the raw output.
7. The **Handoffs & recovery** panel shows the whole chain: handoff → failure → your decision → fix → re-verified handoff.

## Safety and Reliability

TeamMate includes several safeguards:

- Plans require human approval before execution.
- Tasks follow defined lifecycle transitions.
- Agent file operations are restricted to the project workspace.
- Command execution uses a limited allowlist.
- Tool activity and task outcomes are recorded.
- QA reports expose command output and report success only when the required checks pass.
- Run limits restrict task count and execution duration.
- SQLite persistence supports recovery after server restarts.

These are prototype-level safeguards, not a guarantee of complete isolation. Generated code is not protected by a dedicated operating-system sandbox, so use caution when running the application with sensitive files or credentials.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express 5 |
| Database | SQLite with `better-sqlite3` |
| Validation | Zod |
| Shared types | TypeScript |
| Browser testing | Playwright |
| AI planning | Optional Gemma integration through Google AI Studio |

## Getting Started

### Prerequisites

- Node.js **22.18 or newer**
- npm
- Git

The default mode does not require an API key or a separate database server.

### 1. Clone the repository

```bash
git clone https://github.com/yunuszoro46-sketch/HackOberfest-Hack-Day-Dhaka.git
cd HackOberfest-Hack-Day-Dhaka
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. The development API runs on port `3001`, and the frontend proxies API requests to it.

### 4. Run a production build

```bash
npm run build
npm start
```

The production server serves the built frontend and API. Check the terminal output for the local address.

### 5. Run tests

```bash
npm test
```

Use the repository's Playwright configuration and scripts for browser tests. Consult `package.json` for the available test commands.

## Model-Driven Execution (Gemini)

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` (or set these as deployment secrets):

   ```bash
   AGENT_PROVIDER=llm
   GEMINI_API_KEY=your-key
   LLM_PROVIDERS=gemini        # optional; add groq,openrouter for fallback
   # GEMINI_MODEL=gemini-2.5-flash
   ```

3. Restart the server. On startup it prints `runner: llm`, and `GET /api/health` reports `execution.mode: "model"` with the model list (keys are never returned).

Each task can take up to 3 minutes in this mode (one model call plus the checks). Rate limits, quota errors and invalid replies fail the task with a short reason code; the run then pauses for your retry or skip decision.

**Never commit API keys or expose them in frontend code.**

### Optional Gemma planning only

`AGENT_PROVIDER=gemma` with `GEMMA_API_KEY` uses Gemma for planning only. Templates still execute, and the rule-based planner takes over if Gemma is unavailable.

## Optional LLM Providers

A provider layer for IdeaMate's optional model-backed report runs lives in `server/src/llm/`. It does not change TeamMate's default mock behaviour.

- Supported: Groq, Google AI Studio (Gemini), OpenRouter free models, and a local Ollama server.
- Providers are tried in `LLM_PROVIDERS` order; a provider that is rate limited, over its request budget, or failing is skipped.
- Every reply must be JSON that matches a zod schema.
- Variable names and free-tier defaults are in `.env.example`. `GET /api/llm/status` shows which providers are configured and their usage (never keys).
- The idea council (`server/src/council/`) drafts, critiques and synthesises an idea assessment across these providers, falling back to the rule-based report. Design and degradation rules: [docs/council.md](docs/council.md).
- IdeaMate Quick mode uses a budget of up to four council calls; Deep uses up to five. The page displays the configured providers and estimated call budget before approval, then shows progress and provider/model details as turns complete.
- Council runs are approval-gated and stored: `POST /api/ideas/runs` creates one, `POST /api/ideas/runs/:id/approve` starts it, `GET /api/ideas/runs/:id` returns its status and turn-by-turn transcript. The chair generates the Idea Card and Solidity check when synthesis succeeds; simulations, system design and UI/UX remain rule-based.

## IdeaMate Progress and Remaining Work

**Status snapshot: 2026-10-21.** The latest verified repository commit is `6f881fc` (`feat: connect IdeaMate to approved council runs`). That implementation was pushed to `main`.

### Delivered milestones

| Commit | Milestone |
|---|---|
| `9c798ce` | Idea Card, scoring model and report endpoint |
| `9468fc4` | Official-API reference research, approval and link checks |
| `f7bbc7e` | Upgrade suggestions and scenario simulations |
| `db5d04c` | System-design and UI/UX recommendations |
| `712394d` | IdeaMate report UI, modes, rerun comparison and E2E coverage |
| `855eb62` | Optional LLM provider layer and fallback chain |
| `64acd0f` | Multi-role council drafts, critique, synthesis and fallback |
| `d3cf2b0` | Approval-gated, SQLite-persisted council runs and turn transcripts |
| `6f881fc` | Connect IdeaMate UI to council approval/progress; add chair-generated Idea Card |

### Implemented

| Area | Current state |
|---|---|
| Idea input and report model | Shared TypeScript types and a validated report endpoint accept an idea plus optional theme, time, team skills, judges and Quick/Deep mode. |
| Idea Card and solidity score | Rule-based report generation provides a fallback. With successful council synthesis, the chair generates the Idea Card and scores seven criteria, then supplies the verdict, risks, recommendations and judge questions. Council criterion scores are marked `Inferred`. |
| Reference research | Deep mode offers separately approved research through the official GitHub Search API and configured YouTube Data API. Returned links are checked, failures are shown, and short original summaries are stored in the result. Results use an in-memory six-hour cache. |
| Suggestions and scenarios | Reports include grouped upgrade suggestions, user walkthroughs, judge questions, failure plans, a time-crunch cut line and best/expected/worst impact scenarios. These sections remain rule-based. |
| System and UI/UX direction | Reports include architecture options, a selected option, Mermaid diagram, data model, suggested endpoints, decision record, design principles, screens, flow, components and design references. These sections remain rule-based. |
| Report experience | IdeaMate presents the report, offers Quick and Deep modes, gates research behind separate approval and compares the score with the preceding report in the current page session. |
| Model provider layer and council | Optional Groq, Gemini, OpenRouter and Ollama clients use structured JSON validated against schemas, provider fallback and request budgets. The council runs draft → critique → synthesis, records turns and falls back to rule-based output when necessary. |
| Run approval and persistence | A council run is created awaiting approval; approval starts model calls. Runs and turn transcripts persist in SQLite, cancellation is supported, and runs interrupted by a server restart are marked failed. |
| Existing TeamMate foundation | The project/task workflow, human approvals, supervision, artifacts, activity tracking and SQLite-backed project state remain in the repository. TeamMate has not been removed. |

### Not implemented or still needing a decision

- **Give-me-ideas mode:** Generate five candidate ideas from the theme, show one-line pitches and let the user select one.
- **Build and Pitch Plan:** Add an hour-by-hour schedule, team roles, MVP cut line, demo script and five-slide pitch outline.
- **Export:** Add Markdown or PDF export for a completed report.
- **Quick/Deep distinction:** Both modes currently show the same full report sections. Quick mainly uses a smaller council budget (up to four calls); Deep allows up to five and offers separately approved reference research. A genuinely concise, faster Quick output is still needed to meet the original ~60-second goal.
- **Report history in the UI:** Runs and transcripts are stored and API endpoints exist, but the page does not provide a history list or restore a previous run/report after reload. Score comparison is page-session state, not a saved iteration history.
- **Research quality and coverage:** External research is limited to GitHub repositories and YouTube videos. Similarity is estimated with token overlap, and summaries are based on API metadata rather than substantive source review. Design references are static recommendations; design sites are not bulk-scraped.
- **Evidence and model quality:** The chair generates the Idea Card when synthesis succeeds; if it fails, the Idea Card falls back to rule-based output while scores/recommendations may use member drafts. Simulations, system design and UI/UX remain deterministic/rule-based. Add source-backed evidence where needed and preserve explicit uncertainty and fallback labels.
- **Provider policy and operations:** Review provider ordering, model availability and quotas, privacy/terms suitability for the intended audience, persistent cache/rate-limit behavior and monitoring before production use. Keep credentials in environment/deployment secrets; do not commit keys.
- **TeamMate keep/remove decision:** The original TeamMate system is intentionally still present. Decide which legacy workflows remain part of the product before removing or rebranding them.
- **Remaining TeamMate prototype limits:** Most teammate artifact generation is template-based, task execution is sequential, and there is no dedicated OS-level sandbox. These are separate from IdeaMate report generation.
- **License:** No license has been selected or added. Decide the license before inviting reuse or describing the repository as licensed for reuse.

### Last verification

After adding model-driven TeamMate execution, the real QA → fix → re-test recovery loop, and the handoffs panel: `npm test` passed (84 tests), `npm run build` passed (client production build and server typecheck), and `npm run test:e2e` passed (5 browser tests). The model path is tested with a scripted fake model, so no API key is needed. A live run against Gemini has not been recorded in this repository yet.

## Project Structure

```text
HackOberfest-Hack-Day-Dhaka/
├── client/              # React frontend
├── server/              # Express API, agents, tools and SQLite
├── shared/              # Shared types and task/run states
├── e2e/                 # Playwright browser tests
├── docs/
│   └── screenshots/     # Project screenshots
├── .env.example         # Example configuration (copy to .env)
├── package.json         # Scripts and dependencies
└── README.md
```

## Contributing

Contributions, bug reports, and practical suggestions are welcome.

1. Fork this repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/your-change
   ```

3. Make a focused change.
4. Run the relevant tests and verify the application.
5. Commit your work:

   ```bash
   git add .
   git commit -m "Describe your change"
   ```

6. Push your branch and open a pull request.

Please keep contributions focused, document behavior changes, and never commit secrets or private data.

## Credits

Built for **HackOberfest Hack Day Dhaka**.

TeamMate is an experiment in making AI-assisted software development more structured, observable, and human-supervised.

## License

A license has not been specified in this README. Add a `LICENSE` file and identify the chosen license before describing the project as licensed for reuse.
