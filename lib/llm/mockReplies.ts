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
    },
    user: {
      strongest_objection: `As ${user}, I would try it once, but I will not install another app for this.`,
      what_would_change_my_mind: "If it worked from a link in under ten seconds with no sign-up.",
      one_question: "What makes me open it the second time?",
    },
    engineer: {
      strongest_objection: "The data the core action depends on is the hard part, and the plan assumes it is clean and live.",
      what_would_change_my_mind: "A seeded dataset and a fallback path that keeps the demo working offline.",
      one_question: "Where does the real-time data come from, and what happens when it is wrong?",
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
    { title: "Narrow to one moment", oneLiner: `Only for the exact moment someone needs to ${core.toLowerCase().replace(/\.$/, "")}: open a link, act, done.`, rationale: "Answers the Target User: no install, no sign-up, works from a link in seconds.", citations: ["Target User"] },
    { title: "Invert the mechanic", oneLiner: "Instead of users searching, the app pushes the one best option the moment it appears.", rationale: "Answers the Skeptical Investor by owning a moment the general tools ignore.", citations: ["Skeptical Investor"] },
    { title: "Offline-first data", oneLiner: "Ship with a seeded dataset and crowd-confirmed updates instead of live integrations.", rationale: "Answers the Senior Engineer: the data source is the hard part, so remove the dependency.", citations: ["Senior Engineer"] },
  ];
  const kept = /These directions stay[^\n]*\n((?:- .*\n?)*)/.exec(req.user)?.[1] ?? "";
  const fresh = all.filter((d) => !kept.includes(`- ${d.title}:`));
  return JSON.stringify({ directions: fresh.slice(0, Math.max(1, Math.min(3, count))) });
});
