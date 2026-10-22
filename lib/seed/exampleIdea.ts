// A complete example idea, so the demo can be shown instantly if the live model is slow. Every stage is filled and
// stamped (nothing reads as stale); the user can still re-run any stage. Labelled as an example in the raw text.
import { sanitizePreview } from "../preview/sanitize";
import { emptyArchitecture, newIdeaCard, type IdeaCard } from "../schema/ideaCard";
import { stamp } from "../stale";
import { logChanges } from "../log";
import { withReadiness } from "../readiness";
import { LIVE_SCRIPT, reactRoomsScript, SHOWCASE_STYLE, staticRooms } from "../preview/showcase";

const ROOMS = [
  { name: "Room 2.14 · 4 seats", meta: "free until 15:00" },
  { name: "Room 2.09 · 6 seats", meta: "free until 16:30" },
  { name: "Room 1.03 · 2 seats", meta: "busy" },
];

/** Counts the hold down from 15:00 on the Hold screen. */
const COUNTDOWN = `<script>
  (function () {
    var left = 15 * 60 - 8;
    var el = document.querySelector("[data-countdown]");
    setInterval(function () { if (!el || left <= 0) return; left -= 1; el.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); }, 1000);
  })();
</script>`;

const PREVIEW = `<!doctype html><html><head><title>StudySpot</title>${SHOWCASE_STYLE}</head>
<body class="bg-slate-50 text-slate-900"><div class="mx-auto max-w-md min-h-screen bg-white">
<section data-screen="rooms" data-title="Free now">
  <header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><span class="font-semibold">StudySpot</span><nav class="text-sm text-slate-600"><a href="#" data-goto="mine">My booking</a></nav></header>
  <main class="space-y-3 p-4">
    <div class="tm-hero rounded-2xl p-5 text-white">
      <p class="text-xs opacity-80"><span class="tm-live">●</span> Main library · updated <span data-ago>just now</span></p>
      <h2 class="mt-1 text-xl font-semibold">2 rooms free right now</h2>
      <div class="tm-glass mt-3 rounded-xl px-3 py-2 text-sm">Nearest: Room 2.14, 40 m away</div>
    </div>
    ${staticRooms(ROOMS)}
    <button type="button" data-goto="hold" class="tm-cta w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white">Hold Room 2.14 for 15 min</button>
  </main>
</section>
<section data-screen="hold" data-title="Hold">
  <header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><span class="font-semibold">StudySpot</span><nav class="text-sm text-slate-600"><a href="#" data-goto="rooms">Rooms</a></nav></header>
  <main class="space-y-3 p-4">
    <div class="rounded-xl border border-slate-200 p-4 shadow-sm"><h3 class="font-medium">Room 2.14 is held for you</h3><p class="mt-1 text-sm text-slate-600">Walk there and tap “I'm here” within <span data-countdown class="font-mono">14:52</span>.</p></div>
    <form class="space-y-3"><label class="block text-sm font-medium text-slate-700">How many people?<input class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="3"></label></form>
    <button type="button" data-goto="mine" class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">I'm here</button>
  </main>
</section>
<section data-screen="mine" data-title="My booking">
  <header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><span class="font-semibold">StudySpot</span><nav class="text-sm text-slate-600"><a href="#" data-goto="rooms">Rooms</a></nav></header>
  <main class="space-y-3 p-4">
    <div class="rounded-xl border border-slate-200 p-4 shadow-sm"><h3 class="font-medium">Room 2.14 · until 15:00</h3><p class="mt-1 text-sm text-slate-600">Checked in 14:05 · 3 people</p></div>
    <div class="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p class="font-medium">No other bookings today</p><p class="mt-1 text-sm text-slate-500">Free rooms show up on the first screen.</p></div>
    <button type="button" data-goto="rooms" class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Release the room</button>
  </main>
</section>
</div>${LIVE_SCRIPT}${COUNTDOWN}${reactRoomsScript(ROOMS)}</body></html>`;

export function exampleIdea(now = new Date().toISOString()): IdeaCard {
  let c = newIdeaCard(
    "Example idea: students on campus waste time walking floor to floor looking for a free study room. I want an app that shows which rooms are free right now and lets them hold one.",
    now,
  );
  c.answers = [
    "Students hold a free study room near them in two taps.",
    "Undergraduates in exam weeks; today they walk floor to floor checking doors.",
    "The library installed room occupancy sensors this term and nobody uses the data.",
    "Solo, 2 days, $0 budget, I know React and TypeScript, avoid native mobile.",
    "Not a calendar app, no payments, not campus-wide scheduling",
  ];
  c.problem = { value: "Students lose 15-20 minutes per exam-week day hunting for a free study room.", locked: true };
  c.targetUser = { value: "Undergraduates in exam weeks who walk floor to floor checking doors today.", locked: false };
  c.coreAction = { value: "Hold a free study room near you in two taps.", locked: true };
  c.whyNow = { value: "The library installed occupancy sensors this term and the data is unused.", locked: false };
  c.constraints = { teamSize: 1, deadlineDays: 2, budgetUSD: 0, skills: ["React", "TypeScript"], mustUse: [], mustAvoid: ["native mobile"] };
  c.outOfScope = { value: ["A calendar app", "Payments", "Campus-wide scheduling"], locked: false };
  c = stamp(c, "interrogate");

  c.council = {
    investor: {
      strongest_objection: "The university will not pay for this, and students will not either; it is a feature of the library's own system.",
      what_would_change_my_mind: "The library agreeing to link it from their homepage during exam week.",
      one_question: "Who keeps it running after the hackathon?",
      verdict: "approve",
      solidity: 3,
    },
    user: {
      strongest_objection: "If the app says a room is free and it is not, I stop trusting it after one walk.",
      what_would_change_my_mind: "Seeing it right three times in a row, without logging in.",
      one_question: "What happens when I get there and someone is in the room?",
      verdict: "reject",
      solidity: 2,
    },
    engineer: {
      strongest_objection: "Sensor data is noisy and may not be reachable from a hackathon app.",
      what_would_change_my_mind: "A seeded dataset plus a 15-minute hold that does not depend on sensors.",
      one_question: "What is the source of truth when sensors and holds disagree?",
      verdict: "conditional",
      solidity: 4,
    },
  };
  c.competitors = [
    { name: "LibCal", url: "", whatTheySolve: "Room booking systems libraries already run.", gap: "Built for advance booking, not 'free right now near me'.", source: "model-knowledge" },
    { name: "Google Calendar resources", url: "", whatTheySolve: "Room calendars inside an organisation.", gap: "Needs accounts and admin setup; no walk-up flow.", source: "model-knowledge" },
    { name: "Walking around", url: "", whatTheySolve: "The current workaround.", gap: "Slow and unreliable in exam weeks.", source: "user" },
  ];
  c.competitorSearch = { mode: "none", queries: ["study room availability software", "alternatives to library room booking", "hold a study room app"], ranAt: now };
  c.directions = [
    { id: "dir-hold", title: "Walk-up hold", oneLiner: "Hold the nearest free room for 15 minutes from a QR link on the door; no account.", rationale: "Answers the Target User's trust problem: a hold is a promise, not a guess, and LibCal's advance booking leaves the walk-up moment open.", citations: ["Target User", "Senior Engineer"], previewHtml: sanitizePreview(PREVIEW).html },
    { id: "dir-signal", title: "Library dashboard only", oneLiner: "A big screen at the library entrance showing free rooms, no phones.", rationale: "Answers the Skeptical Investor: the library owns it and keeps it running.", citations: ["Skeptical Investor"] },
    { id: "dir-crowd", title: "Crowd-confirmed rooms", oneLiner: "Students confirm 'still free' when they pass a room; no sensors needed.", rationale: "Answers the Senior Engineer: removes the sensor dependency.", citations: ["Senior Engineer"] },
  ];
  c.chosenDirectionId = "dir-hold";
  c.previewApprovedId = "dir-hold";
  c.archetypeId = "soft-gradient";
  c = stamp(c, "council");
  c = stamp(c, "preview");

  const a = emptyArchitecture([
    { id: "stack-next", name: "Next.js + SQLite", stack: ["Next.js 15", "SQLite (Turso)", "Vercel"], scores: { speed: 5, fit: 4, skills: 5, cost: 5, hackathon: 5 }, why: "One repo, one deploy; matches React + TypeScript.", whyNot: "Holds expiring needs a cron or check-on-read." },
    { id: "stack-supabase", name: "React + Supabase", stack: ["React (Vite)", "Supabase", "Netlify"], scores: { speed: 4, fit: 4, skills: 4, cost: 5, hackathon: 4 }, why: "Hosted Postgres with realtime.", whyNot: "Row-level security setup eats time." },
    { id: "stack-express", name: "Express + React", stack: ["Express", "React", "Postgres (Neon)", "Render"], scores: { speed: 3, fit: 4, skills: 4, cost: 4, hackathon: 3 }, why: "Clear API boundary.", whyNot: "Two deploys for a two-day build." },
  ]);
  a.chosenId = "stack-next";
  a.diagramMermaid = { value: "flowchart LR\n  Q[QR on room door] --> W[Next.js app]\n  W --> A[API routes]\n  A --> D[(SQLite: rooms, holds)]\n  A -. optional .-> S[Occupancy sensors]", locked: false };
  a.dataModel = {
    value: [
      { name: "Room", fields: [{ name: "id", type: "uuid", note: "" }, { name: "name", type: "text", note: "e.g. 2.14" }, { name: "seats", type: "int", note: "" }], relations: [] },
      { name: "Hold", fields: [{ name: "id", type: "uuid", note: "" }, { name: "roomId", type: "uuid", note: "" }, { name: "expiresAt", type: "timestamp", note: "15 minutes after creation" }, { name: "checkedIn", type: "bool", note: "" }], relations: ["Hold.roomId -> Room.id"] },
    ],
    locked: false,
  };
  a.apiSurface = {
    value: [
      { method: "GET", path: "/api/rooms?free=now", request: "", response: "Room[] with freeUntil", note: "First screen" },
      { method: "POST", path: "/api/holds", request: "{ roomId }", response: "Hold", note: "409 if already held" },
      { method: "POST", path: "/api/holds/:id/check-in", request: "{ people }", response: "Hold", note: "Must be before expiresAt" },
    ],
    locked: false,
  };
  a.services = { value: [{ name: "Turso", reason: "Hosted SQLite", freeTier: "Free tier is enough for a demo" }], locked: false };
  a.deployment = { value: { target: "Vercel", estCostPerMonth: 0, estHoursToFirstDeploy: 1 }, locked: false };
  a.risks = {
    value: [
      { risk: "Two students hold the same room at once", likelihood: "medium", mitigation: "Insert the hold in a transaction; return 409" },
      { risk: "Sensor feed unavailable on demo day", likelihood: "high", mitigation: "Seed rooms; availability works from holds alone" },
      { risk: "Expired holds block rooms", likelihood: "medium", mitigation: "Treat holds past expiresAt as free on every read" },
    ],
    locked: true,
  };
  c.architecture = a;
  c = stamp(c, "architecture");
  // The example is hand-written, not model output; every block says so.
  const seed = { kind: "mock" as const, model: "example seed", at: now };
  c.provenance = { interrogate: seed, council: seed, competitors: seed, directions: seed, "preview:dir-hold": seed, architecture: seed, "architecture-details": seed };
  // A believable decision log for the example: what the builder would have recorded getting here.
  c.log = logChanges(newIdeaCard(c.raw, now), c, now);
  return withReadiness(c);
}
