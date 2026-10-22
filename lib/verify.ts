// Verify: judge a build report against the acceptance criteria. Rules first (the report names AC ids, or a test
// runner printed them); a model only fills in criteria the report never names by id, and every model verdict must
// quote a line that is really in the report.
import { acceptanceItems, type AcceptanceItem } from "./prompts/compile";
import type { BuildCheck, CheckResult, CheckStatus, IdeaCard } from "./schema/ideaCard";

const PASS = /(\bpass(?:ed|es)?\b|\bok\b|\bdone\b|✓|✔|☑|\[x\])/i;
const FAIL = /(\bfail(?:ed|s|ing|ure)?\b|\berror\b|\bbroken\b|✗|✘|×|❌|\btimed? ?out\b)/i;

/** "AC-01", "AC 1", "ac_01" … for one id. */
const idPattern = (id: string) => new RegExp(`\\bAC[-_ ]?0*${Number(id.replace(/\D/g, ""))}(?!\\d)`, "i");

const statusOf = (line: string): CheckStatus | null => {
  // "AC-03 FAIL — reason" or "✘ … AC-03": a failure word wins over an incidental "ok" in the reason.
  if (FAIL.test(line)) return "fail";
  if (PASS.test(line)) return "pass";
  return null;
};

const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Results from lines that name an AC id. The last line mentioning an id wins (later runs override earlier ones). */
export function parseReport(report: string, items: AcceptanceItem[]): CheckResult[] {
  const lines = report.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return items.map((a) => {
    const re = idPattern(a.id);
    let found: { status: CheckStatus; line: string } | null = null;
    for (const line of lines) {
      if (!re.test(line)) continue;
      const st = statusOf(line);
      if (st) found = { status: st, line };
    }
    return { acId: a.id, criterion: a.text, status: found?.status ?? "unknown", evidence: found ? clip(found.line) : "", by: "rules" as const };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Applies the model's answers to the criteria the rules left unknown. A pass or fail without a quote that really
 * appears in the report is downgraded to unknown: the model may not invent evidence.
 */
export function mergeModel(rules: CheckResult[], model: { id: string; status: CheckStatus; evidence: string }[], report: string): CheckResult[] {
  const hay = norm(report);
  return rules.map((r) => {
    if (r.status !== "unknown") return r;
    const m = model.find((x) => x.id.toUpperCase() === r.acId);
    if (!m || m.status === "unknown") return r;
    const quote = m.evidence.trim();
    if (!quote || !hay.includes(norm(quote))) return r;
    return { ...r, status: m.status, evidence: clip(quote), by: "model" as const };
  });
}

export const checkItems = (card: IdeaCard) => acceptanceItems(card);

export function summarize(results: CheckResult[]) {
  const n = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return { pass: n("pass"), fail: n("fail"), unknown: n("unknown"), total: results.length };
}

export const latestCheck = (card: IdeaCard): BuildCheck | null => card.buildChecks.at(-1) ?? null;

/** Done when the latest check ran on the current prompt and every criterion passed. */
export const buildVerified = (card: IdeaCard) => {
  const c = latestCheck(card);
  if (!c || !card.prompt || c.promptVersion !== card.prompt.version) return false;
  const s = summarize(c.results);
  return s.total > 0 && s.pass === s.total;
};
