// Canned replies for LLM_PROVIDER=mock. They are built from the prompt text (so they reflect what the user typed),
// but they are not model output and the UI labels them "mock".
import { registerMock } from "./mock";

const between = (text: string, tag: string) => new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(text)?.[1] ?? "";
const answer = (text: string, n: number) => new RegExp(`A${n}: ([^\\n]*)`).exec(between(text, "answers"))?.[1]?.trim() ?? "";
const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s/)[0] || s).trim();
const known = (s: string, fallback: string) => (s && s !== "(no answer)" ? s : fallback);
const lockedValue = (text: string, key: string) => {
  const m = new RegExp(`^- ${key}: (.*)$`, "m").exec(text);
  try {
    return m ? JSON.parse(m[1]) : undefined;
  } catch {
    return undefined;
  }
};

registerMock("interrogate", (req) => {
  const u = req.user;
  const para = between(u, "paragraph");
  const a = [1, 2, 3, 4, 5].map((n) => answer(u, n));
  const days = /(\d+)\s*(?:day|d\b)/i.exec(a[3])?.[1];
  const hours = /(\d+)\s*(?:hour|h\b)/i.exec(a[3])?.[1];
  const team = /team of (\d+)|(\d+)\s*(?:people|devs|person)/i.exec(a[3]);
  const budget = /\$\s?(\d+)/.exec(a[3])?.[1];
  const tech = a[3].match(/\b(React|Next\.js|Node(?:\.js)?|TypeScript|Python|Flutter|Supabase|Firebase|Tailwind|Postgres(?:QL)?|SQLite)\b/gi) ?? [];
  const avoid = /avoid ([^.;]+)/i.exec(a[3])?.[1];
  return JSON.stringify({
    problem: lockedValue(u, "problem") ?? known(firstSentence(a[1] || para), "unknown"),
    targetUser: lockedValue(u, "targetUser") ?? known(a[1], "unknown"),
    coreAction: lockedValue(u, "coreAction") ?? known(a[0], firstSentence(para)),
    whyNow: lockedValue(u, "whyNow") ?? known(a[2], "unknown"),
    constraints: {
      teamSize: team ? Number(team[1] ?? team[2]) : 1,
      deadlineDays: days ? Number(days) : hours ? Math.max(1, Math.round(Number(hours) / 24)) : 2,
      budgetUSD: budget ? Number(budget) : 0,
      skills: [...new Set(tech.map((t) => t.trim()))],
      mustUse: [],
      mustAvoid: avoid ? [avoid.trim()] : [],
    },
    outOfScope: lockedValue(u, "outOfScope") ?? (a[4] ? a[4].split(/[,;]|\band\b/).map((s) => s.trim()).filter(Boolean).slice(0, 6) : ["unknown"]),
  });
});

const cardLine = (text: string, label: string) => new RegExp(`^${label}(?: \\[LOCKED[^\\]]*\\])?: (.*)$`, "m").exec(between(text, "card"))?.[1] ?? "";

registerMock("council", (req) => {
  const core = cardLine(req.user, "Core action") || "the core action";
  const user = cardLine(req.user, "Target user") || "the target user";
  return JSON.stringify({
    investor: {
      strongest_objection: `Nobody pays for "${core}" when a free workaround exists; it is a feature of a bigger platform, not a business.`,
      what_would_change_my_mind: "Ten users who come back three times in the first week without a reminder.",
      one_question: "Who pays, and what would they stop paying for to afford this?",
      verdict: "reject",
      solidity: 2,
    },
    user: {
      strongest_objection: `As ${user}, I would try it once, but I will not install another app for this.`,
      what_would_change_my_mind: "If it worked from a link in under ten seconds with no sign-up.",
      one_question: "What makes me open it the second time?",
      verdict: "conditional",
      solidity: 3,
    },
    engineer: {
      strongest_objection: "The data the core action depends on is the hard part, and the plan assumes it is clean and live.",
      what_would_change_my_mind: "A seeded dataset and a fallback path that keeps the demo working offline.",
      one_question: "Where does the real-time data come from, and what happens when it is wrong?",
      verdict: "conditional",
      solidity: 3,
    },
  });
});

registerMock("competitors", (req) => {
  const results = [...between(req.user, "results").matchAll(/^\[(\d+)\] (.*)$/gm)].slice(0, 3);
  if (results.length) {
    return JSON.stringify({
      competitors: results.map(([, n, title]) => ({ name: title.split(/[-|:]/)[0].trim(), result: Number(n), whatTheySolve: `What "${title}" covers.`, gap: "Not built for this exact user and moment." })),
    });
  }
  return JSON.stringify({
    competitors: [
      { name: "Google Calendar", result: null, whatTheySolve: "General scheduling and room resources for organisations.", gap: "Needs admin setup; not a two-tap flow for an individual." },
      { name: "Notion", result: null, whatTheySolve: "Shared docs and simple databases teams use as ad-hoc trackers.", gap: "Manual upkeep; no live state." },
      { name: "Spreadsheets", result: null, whatTheySolve: "The default workaround for tracking anything shared.", gap: "Stale the moment it is written; no booking flow." },
    ],
  });
});

registerMock("directions", (req) => {
  const count = Number(/Propose exactly (\d+)/.exec(req.user)?.[1] ?? 3);
  const core = cardLine(req.user, "Core action") || "the core action";
  const all = [
    { tag: "NARROW THE USER", title: "Narrow to one moment", oneLiner: `Only for the exact moment someone needs to ${core.toLowerCase().replace(/\.$/, "")}: open a link, act, done.`, rationale: "Answers the Target User: no install, no sign-up, works from a link in seconds.", citations: ["Target User"] },
    { tag: "INVERT THE MECHANIC", title: "Invert the mechanic", oneLiner: "Instead of users searching, the app pushes the one best option the moment it appears.", rationale: "Answers the Skeptical Investor by owning a moment the general tools ignore.", citations: ["Skeptical Investor"] },
    { tag: "REMOVE A DEPENDENCY", title: "Offline-first data", oneLiner: "Ship with a seeded dataset and crowd-confirmed updates instead of live integrations.", rationale: "Answers the Senior Engineer: the data source is the hard part, so remove the dependency.", citations: ["Senior Engineer"] },
  ];
  const kept = /These directions stay[^\n]*\n((?:- .*\n?)*)/.exec(req.user)?.[1] ?? "";
  const fresh = all.filter((d) => !kept.includes(`- ${d.title}:`));
  return JSON.stringify({ directions: fresh.slice(0, Math.max(1, Math.min(3, count))) });
});

registerMock("preview", (req) => {
  const u = req.user;
  const dir = between(u, "direction").split("\n")[0] ?? "Direction";
  const note = between(u, "note").toLowerCase();
  const core = cardLine(u, "Core action") || "Do the main thing";
  const mobile = /mobile/.test(note);
  const dark = /dark/.test(note);
  const shell = mobile ? "mx-auto max-w-sm min-h-screen border-x border-slate-200" : "mx-auto max-w-3xl";
  const bg = dark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900";
  const nav = (title: string) => `<header class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3"><span class="font-semibold text-slate-900">${title}</span><nav class="flex gap-3 text-sm text-slate-600"><a href="#" data-goto="home">Home</a></nav></header>`;
  return `<!doctype html><html><head><title>${dir}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="${bg}"><div class="${shell}">
<section data-screen="home" data-title="Home">${nav("StudySpot")}<main class="space-y-3 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 class="font-medium text-slate-900">${core}</h3><p class="mt-1 text-sm text-slate-600">3 rooms free near you · updated 1 min ago</p></div><ul class="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white"><li class="flex items-center justify-between px-4 py-3"><span class="text-sm text-slate-900">Library 2.14 · 4 seats</span><span class="text-xs text-slate-500">free until 15:00</span></li><li class="flex items-center justify-between px-4 py-3"><span class="text-sm text-slate-900">Science 1.03 · 6 seats</span><span class="text-xs text-slate-500">free until 16:30</span></li></ul><button type="button" data-goto="pick" class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Pick a room</button></main></section>
<section data-screen="pick" data-title="Pick a time">${nav("StudySpot")}<main class="space-y-3 p-4"><form class="space-y-3"><label class="block text-sm font-medium text-slate-700">Start<input class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="14:00"></label><label class="block text-sm font-medium text-slate-700">People<input class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="3"></label></form><button type="button" data-goto="done" class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Book Library 2.14</button></main></section>
<section data-screen="done" data-title="Booked">${nav("StudySpot")}<main class="space-y-3 p-4"><div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 class="font-medium text-slate-900">Booked: Library 2.14</h3><p class="mt-1 text-sm text-slate-600">Today 14:00–15:00 · 3 people · code 4821</p></div><div class="rounded-xl border border-dashed border-slate-300 p-8 text-center"><p class="font-medium">No other bookings today</p><p class="mt-1 text-sm text-slate-500">Free rooms appear on Home.</p></div><button type="button" data-goto="home" class="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Back to rooms</button></main></section>
</div></body></html>`;
});

registerMock("architecture-candidates", () =>
  JSON.stringify({
    candidates: [
      { name: "Supabase + Vue", stack: ["Vue 3", "Supabase (Postgres, auth)", "Netlify"], scores: { speed: 4, fit: 4, skills: 2, cost: 5, hackathon: 4 }, why: "Hosted Postgres with realtime out of the box.", whyNot: "The builder listed React, not Vue." },
      { name: "Next.js + SQLite", stack: ["Next.js 15", "SQLite (Turso)", "Vercel"], scores: { speed: 5, fit: 4, skills: 5, cost: 5, hackathon: 5 }, why: "One repo, one deploy, matches React + TypeScript skills.", whyNot: "Realtime availability needs polling or a hosted SQLite with webhooks." },
      { name: "Express API + React SPA", stack: ["React (Vite)", "Express", "Postgres (Neon)", "Render"], scores: { speed: 3, fit: 4, skills: 4, cost: 4, hackathon: 3 }, why: "Clear client/server split.", whyNot: "Two deploys and CORS for a two-day build." },
    ],
  }),
);

registerMock("architecture-details", () =>
  JSON.stringify({
    diagramMermaid: "flowchart LR\n  U[Student browser] --> W[Next.js app]\n  W --> A[API routes]\n  A --> D[(SQLite: rooms, bookings)]\n  A --> S[Room sensor feed]",
    dataModel: [
      { name: "Room", fields: [{ name: "id", type: "uuid", note: "" }, { name: "name", type: "text", note: "e.g. Library 2.14" }, { name: "capacity", type: "int", note: "" }], relations: [] },
      { name: "Booking", fields: [{ name: "id", type: "uuid", note: "" }, { name: "roomId", type: "uuid", note: "" }, { name: "startsAt", type: "timestamp", note: "" }, { name: "endsAt", type: "timestamp", note: "" }, { name: "people", type: "int", note: "" }], relations: ["Booking.roomId -> Room.id"] },
    ],
    apiSurface: [
      { method: "GET", path: "/api/rooms?free=now", request: "", response: "Room[] with freeUntil", note: "Main screen" },
      { method: "POST", path: "/api/bookings", request: "{ roomId, startsAt, endsAt, people }", response: "Booking", note: "409 on overlap" },
      { method: "DELETE", path: "/api/bookings/:id", request: "", response: "204", note: "Cancel" },
    ],
    services: [{ name: "Turso", reason: "Hosted SQLite for the bookings table", freeTier: "Free tier covers a demo" }],
    deployment: { target: "Vercel", estCostPerMonth: 0, estHoursToFirstDeploy: 1 },
    risks: [
      { risk: "Two people book the same room at once", likelihood: "medium", mitigation: "Check overlap inside a transaction; return 409" },
      { risk: "Sensor data is missing during the demo", likelihood: "high", mitigation: "Seed rooms and fall back to booking-based availability" },
      { risk: "Time zones shift bookings", likelihood: "low", mitigation: "Store UTC, show campus local time" },
    ],
  }),
);

// Verify: a mock that only answers when a report line mentions the criterion's screen title or path, and quotes it.
registerMock("verify", (req) => {
  const report = between(req.user, "report");
  const lines = report.split("\n").map((l) => l.trim()).filter(Boolean);
  const crit = [...req.user.matchAll(/^- (AC-\d+): (.*)$/gm)];
  const results = crit.map(([, id, text]) => {
    const key = (/Screen "([^"]+)"/.exec(text)?.[1] ?? /`[A-Z]+ ([^`]+)`/.exec(text)?.[1] ?? "").toLowerCase();
    const line = key ? lines.find((l) => l.toLowerCase().includes(key)) : undefined;
    if (!line) return { id, status: "unknown", evidence: "" };
    const status = /fail|error|broken|crash|missing/i.test(line) ? "fail" : /works|pass|done|ok/i.test(line) ? "pass" : "unknown";
    return { id, status, evidence: status === "unknown" ? "" : line };
  });
  return JSON.stringify({ results });
});
