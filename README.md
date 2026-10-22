# TeamMate

**TeamMate gets you to a prompt you trust. Not to code.**

Built for **HackOberfest Hack Day Dhaka** for hackathon participants and solo builders who have an idea but no team. TeamMate does not build your app. It:

1. **interrogates** the idea with five fixed questions,
2. lets a **council** of three critics attack it and **searches for real competitors**,
3. proposes **2–3 different product directions** and shows a **small clickable preview** of the one you pick,
4. helps you **choose an architecture** (scored stacks, diagram, data model, API, services, deployment, risks),
5. **compiles a build prompt** for Claude Code, Cursor, Lovable or your own hands, plus a downloadable bundle.

Everything TeamMate produces is **editable and lockable**. A locked field is passed downstream verbatim and is never regenerated. Every generated block carries a **provenance badge** (model, source-verified search, rule-based, mock, or locked by you), and nothing is compiled until a human **signs off** the three decisions the plan rests on.

| | |
|---|---|
| ![Ideas home](docs/screenshots/1-ideas.png) | ![Stage 1, Idea](docs/screenshots/2-idea.png) |
| **Ideas.** Saved cards with readiness and stage. | **1 · Idea.** Five fixed questions; the card fills as you answer. |
| ![Stage 2, Council](docs/screenshots/3-council.png) | ![Stage 3, Preview](docs/screenshots/4-preview.png) |
| **2 · Council.** Three critics, competitors with a gap summary, directions. | **3 · Preview.** A sandboxed clickable mockup and a verdict. |
| ![Stage 4, Architecture](docs/screenshots/5-architecture.png) | ![Stage 5, Prompt](docs/screenshots/6-prompt.png) |
| **4 · Architecture.** Scored stacks; lockable diagram, data model, API. | **5 · Prompt.** Signed, compiled, exported; a v2 loop for rework. |

Screenshots are from the example idea in the `console` theme (`npm run screenshots`). They were taken in a sandbox that blocks the Tailwind CDN, so the preview frame shows unstyled HTML; in a normal browser it is styled.

## Demo path (about 90 seconds)

1. Home → **New idea** → paste a paragraph. To skip waiting on the model, click **Load example** instead.
2. Answer the five questions; the card fills in as you go. **Build card**, then **lock** "Core action".
3. **Run Council**: three critiques, a competitor table (with real links when `TAVILY_API_KEY` is set) with a gap summary, and three direction cards. Tick one.
4. **Preview this direction**: click through the screens, regenerate with the note "mobile-first", compare another direction, then **Approve direction**.
5. **Architecture** → choose the recommended stack: the diagram, data model with SQL, and API table appear.
6. **Sign off and compile** → the **Human Sign-Off Checkpoint** lists the product bet, the stack and what is out of scope → **Sign and compile** → toggle the target → **Copy prompt** → **Download bundle** (PRD.md, ARCHITECTURE.md, PROMPT.md, preview.html, CLAUDE.md, idea-card.json).
7. Optional: write what went wrong in a build and click **Diff against card → Prompt v2** for a new version with a change list.

The top-right **Build readiness** score (0–100) rises as you go: lock 3+ fields 15, council run 20, direction picked 15, preview approved 20, stack chosen 15, prompt compiled 15. A stale stage counts half. Hover it to see each contributor.

## Setup

Requires Node.js 22.18 or newer (the contrast check runs TypeScript directly).

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev                  # http://localhost:3000
```

To try it with no keys at all, set `LLM_PROVIDER=mock`. Every stage then returns canned replies built from what you typed, and the UI labels them **mock replies**.

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `LLM_PROVIDER` | `gemma` | `gemma`, `gemini`, or `mock` (canned replies, no key needed). |
| `GEMINI_API_KEY` | — | Google AI Studio key, used by both Gemma and Gemini (`GOOGLE_API_KEY` also works). |
| `GEMMA_MODEL` | `gemma-4-26b-a4b-it` | Gemma model name. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model name. With `LLM_PROVIDER=gemini`, competitor research can use Google Search grounding. |
| `TAVILY_API_KEY` | — | Live web search for competitors. Without it, Stage 2 shows a labelled "no live search" fallback instead of failing. |
| `RATE_LIMIT_PER_10_MIN` | `30` | Requests per IP per 10 minutes on the stage routes. |

All keys stay on the server. The browser never sees them. `GET /api/health` reports the provider, the model, and whether search is configured.

### Deploy

Import the repository into Vercel and set the environment variables; no other configuration is needed. Stage routes set `maxDuration = 60`.

### Checks

```bash
npm run typecheck
npm run test         # Vitest: schemas, readiness, staleness, store, adapter retry, every stage route, sanitizer, compiler, bundle
npm run build        # runs npm run contrast first: fails if any theme pair is below WCAG AA
npm run test:e2e     # Playwright: the full demo path, the error UI with no key, and 390px / 400px no-horizontal-scroll passes
npm run screenshots  # refreshes docs/screenshots/
```

The browser tests build once and start two servers: one with mock replies for the demo path, and one with Gemma and no key to check the error panels.

## Architecture overview

```
app/
  page.tsx                       Ideas home: card grid, start from a paragraph, example, duplicate, inline delete
  idea/[id]/page.tsx             The workspace: stepper rail, top bar, the five stages
  api/health/route.ts            Provider + search status
  api/stage/<name>/route.ts      interrogate · council · competitors · directions · preview · architecture
components/stages/               Workspace shell and the five stage screens
components/console/              Design-system pieces: Panel, Chip, LockableField, ProvenanceBadge, StepperRail, TopBar,
                                 ReadinessMeter, StageStatus (running line, skeleton, error, empty), Toast, MermaidView,
                                 hexagon identity, segment displays, visual archetypes
components/ui/                   shadcn/ui primitives (button, dialog, collapsible, tooltip), restyled to the tokens
scripts/contrast.ts              WCAG contrast gate over the three themes
lib/
  schema/ideaCard.ts             The Idea Card (Zod) and Lockable<T>; the spine of the app
  stale.ts                       Stage fingerprints → "stale" banners and "Regenerate stale"
  readiness.ts                   Build-Readiness score, computed (never from a model)
  signoff.ts                     Human sign-off: the three decisions and the plan fingerprint the signature covers
  archetypes.ts                  Visual archetypes for the preview and the prompt's visual section
  store/                         IdeaStore interface, localStorage implementation, Supabase stub
  llm/adapter.ts                 generate() / generateHtml(): Zod validation, one retry with the error, then 422
  llm/gemma.ts, gemini.ts, mock.ts   Providers (google.ts wraps @google/genai)
  prompts/<stage>.ts             One prompt template per stage; compile.ts is the template-filled prompt compiler;
                                 v2.ts diffs a prompt against a fresh compile for the Prompt v2 loop
  preview/sanitize.ts            Preview HTML sanitizer
  search/tavily.ts               Competitor search
  export/bundle.ts               Files in the download bundle
  seed/exampleIdea.ts            The example idea
```

- **One Idea Card.** Every stage receives only the card (never chat history) and returns a Zod-validated patch. Locked values go into prompts as fixed facts. The server leaves them out of patches, and the client refuses to overwrite them.
- **Staleness.** When a stage runs, it stores a fingerprint of its upstream inputs. Editing an upstream field changes that fingerprint, so the downstream stages show as stale in the stepper and banner, and **Regenerate stale** re-runs them in order. Locked fields, your own directions and your chosen direction survive regeneration.
- **Model output** is always parsed with Zod. A bad reply is retried once with the parse error appended. A second failure returns 422 with the raw text, which the UI shows in a collapsible panel next to Retry.
- **Competitor URLs** are never typed by the model. It picks search results by number and the server copies those results' URLs. With Gemini grounding, a URL is kept only if its site came back from the search. Otherwise the entry is marked "model knowledge" and has no link.
- **Previews:**
  - **Rebuilt from an allow-list.** The sanitizer drops every script the model writes, event handlers, `javascript:` links, frames, external images, styles and fonts, and CSS `url()`, `@import` and `expression()`.
  - **Two scripts injected.** It adds only the Tailwind CDN and TeamMate's own screen-switcher script, plus a bottom screen bar and a Content-Security-Policy that blocks all other loading.
  - **Sandboxed.** The result is shown in `<iframe sandbox="allow-scripts">` with no same-origin access.
- **Prompt compiler.** A fixed template with sections from Project through Risks to Watch. The four targets change headings and tone, not content. It's deterministic: the same card always gives the same prompt.
- **Hygiene.** Per-IP in-memory rate limit, one JSON log line per model call (stage, provider, latency, tokens, outcome; never prompts or keys), loading states that name the running stage and its elapsed seconds, and autosave on every change.

## Design system

The look follows the TeamMate design prompt: a dark instrument console with one amber accent.

- **Three themes** (`console`, `dim`, `paper`) are CSS custom properties on `<html data-theme>`, saved in localStorage and applied before first paint. Tailwind reads them through `@theme` in `app/globals.css`, so components never use raw palette colours.
- **Two tokens differ from the spec** because the spec values failed the contrast gate: `dim --fg-faint` is `#65615A` (spec `#5E5A52` gave 2.7:1) and `paper --amber` is `#A06000` (spec `#B86E00` gave 3.7:1 for button text).
- **Fonts are self-hosted** with `@fontsource` (Chakra Petch for display, IBM Plex Sans for body at 15px, JetBrains Mono for data), because Google Fonts was blocked in the build environment.
- **Status is never colour alone**: chips carry a symbol (`✓ ! ✕ ⊙ ●`) and text; avatars carry `$`, `U`, `</>`.
- **Glow and scanlines only on `.lcd-display`** (the signed readout). Loading uses skeletons and a running line, never spinners. No `alert`, `confirm` or `prompt`; confirmations are inline.
- **Keyboard:** a 2px amber focus ring everywhere; keys 1–5 jump between stages on the rail; Enter picks a focused direction card.
- **Theme and Voice controls** live in the top bar (and in the Console sheet below 1024px). Voice reads stage results aloud when on; **Read aloud** on the prompt works regardless.

## Choices made where the spec was open

- **Default model is `gemma-4-26b-a4b-it`**, the model verified on this project's AI Studio key, instead of `gemma-3-27b-it`. Change it with `GEMMA_MODEL`. Gemma 4 runs with minimal thinking so each call takes seconds.
- **Stage 2 is three routes** (`council`, `competitors`, `directions`) that the client calls in order. Each stays well inside serverless time limits, and the UI shows which part is running.
- **Mock provider.** `LLM_PROVIDER=mock` exists so the demo, the tests and anyone without a key can run the whole flow. Its output is always labelled.
- **Structured architecture blocks** (data model, API, services, risks) are edited as JSON, validated by the same Zod schemas the model output must pass. The diagram, the deployment fields and all text fields are edited inline. The SQL is derived from the data model by code.
- **Your direction survives regeneration.** Re-running directions keeps both your own directions and the one you picked; only the others are replaced.
- **Rate limits and saved reviews are per server instance and in memory**, which is fine for a demo. Ideas live in this browser's localStorage, and a Supabase store is stubbed behind the same interface.
- **The design prompt's file paths** (`client/src/...`) are from the earlier Vite app; the design was applied to this Next.js app instead, since the build prompt decides scope.
- **Sign-off covers three decisions** (product bet, stack, out of scope). Editing any of them later voids the signature, and the prompt shows "Sign again".
- **Preview approval** is per direction: picking another direction or regenerating its preview clears it.
- **The example idea** is labelled as mock output everywhere (it is hand-written, not from a model).
- **shadcn/ui components were added from shadcn's source by hand**, because the shadcn registry host was blocked in the build environment. They are standard shadcn components (`components.json` is included).

## Not built (on purpose)

Code generation, deploying your app, multi-user teams, authentication, cloud persistence (the interface only), a command palette, agent orchestration, ops/incident features, more than 3 directions or 5 preview screens, and chat-style conversation at any stage.

## History

The earlier TeamMate (a supervised multi-agent workspace on Express and Vite) is preserved on the `legacy-teammate` branch.
