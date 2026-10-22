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
