import type { AgentRole, Task } from '../../../shared/types';
import { ROLES } from './roles';

export interface PlannedTask {
  role: AgentRole;
  title: string;
  description: string;
}

export interface Plan {
  tasks: PlannedTask[];
  note: string;
  /** Who made the plan when it was a model, e.g. "gemini:gemini-2.5-flash". */
  by?: string;
}

/** Roles that write code. QA, docs and research never do. */
export const BUILDER_ROLES: readonly AgentRole[] = ['frontend', 'backend', 'aiml'];

const SIMULATE_RE = /simulate\s+(a\s+)?failure/i;

/**
 * Demo fault injection. "simulate a failure" no longer adds a fake task: it marks the first build task so its
 * first attempt ships one real bug, and QA has to catch it with a real test run. The marker is visible in the
 * task description, so the plan the leader approves says exactly what will happen.
 */
export const FAULT_MARKER = '[Demo fault injection]';
/** Tasks the orchestrator creates when the leader sends a QA failure back to a builder. */
export const FIX_MARKER = '[QA fix]';

export const isFaultInjected = (t: Pick<Task, 'description'>) => t.description.includes(FAULT_MARKER);
export const isFixTask = (t: Pick<Task, 'description'>) => t.description.startsWith(FIX_MARKER);

/** Strips "simulate a failure" from a command and reports whether it was there. */
export function parseFaultInjection(text: string): { text: string; inject: boolean } {
  const inject = SIMULATE_RE.test(text);
  return { inject, text: inject ? text.replace(SIMULATE_RE, '').replace(/^[\s,;.]+|[\s,;]+$/g, '').trim() : text };
}

/** Marks the first build task for fault injection and makes sure a QA task runs after it. */
export function withFaultInjection(plan: Plan, team: AgentRole[]): Plan {
  const tasks = plan.tasks.map((t) => ({ ...t }));
  let i = tasks.findIndex((t) => BUILDER_ROLES.includes(t.role));
  if (i < 0) {
    const role = BUILDER_ROLES.find((r) => team.includes(r)) ?? 'frontend';
    tasks.unshift({ role, title: 'Implement booking validation', description: 'Pure validation module (validateBooking, findConflicts, isRoomFree) plus a node:test suite covering edge cases.' });
    i = 0;
  }
  tasks[i].description = `${tasks[i].description}\n\n${FAULT_MARKER} The first attempt of this task deliberately ships one realistic bug, so QA can catch it with a real test run and the team can show recovery. Later attempts and fixes do not.`;
  const lastBuild = tasks.reduce((at, t, k) => (BUILDER_ROLES.includes(t.role) ? k : at), i);
  if (!tasks.slice(lastBuild + 1).some((t) => t.role === 'qa')) {
    tasks.splice(lastBuild + 1, 0, { role: 'qa', title: 'Test edge cases', description: 'Syntax-check every script, inspect components, run the test suite and write reports/qa-report.md with the raw output.' });
  }
  const note = `${plan.note} Demo fault injection: "${tasks[i].title}" plants one bug on its first attempt for QA to catch.`.trim();
  return { ...plan, tasks, note };
}

// Nouns outrank verbs: "implement booking validation" is about validation, not about implementing UI.
const NOUN_WEIGHT = 2;
const VERB_WEIGHT = 1;

const SIGNALS: Record<AgentRole, { nouns: RegExp; verbs: RegExp }> = {
  frontend: {
    nouns: /\b(interface|ui|ux|page|screen|component|view|layout|form|button|frontend|front-end|css|style|landing|display|calendar|widget)s?\b/i,
    verbs: /\b(render|style|lay out|animate)\b/i,
  },
  backend: {
    nouns: /\b(api|endpoint|server|database|db|schema|backend|back-end|validation|auth|authentication|storage|persistence|route|webhook)s?\b/i,
    verbs: /\b(implement|store|persist|expose|migrate)\b/i,
  },
  aiml: {
    nouns: /\b(ai|ml|model|prompt|llm|recommendation|classifier|embedding|prediction|gemma|agent)s?\b/i,
    verbs: /\b(train|predict|classify|recommend|fine-tune)\b/i,
  },
  qa: {
    nouns: /\b(tests?|edge cases?|qa|bugs?|coverage|regressions?)\b/i,
    verbs: /\b(test|verify|check|validate)\b/i,
  },
  researcher: {
    nouns: /\b(research|competitors?|users?|surveys?|market|prior art|alternatives?|interviews?)\b/i,
    verbs: /\b(research|investigate|explore|compare|analy[sz]e)\b/i,
  },
  docs: {
    nouns: /\b(docs?|documentation|readme|guide|manual|changelog)\b/i,
    verbs: /\b(document|write up|explain|summari[sz]e)\b/i,
  },
};

/** Engineering roles can cover for each other; specialist roles cannot. */
const SUBSTITUTES: Partial<Record<AgentRole, AgentRole[]>> = {
  backend: ['frontend'],
  frontend: ['backend'],
  aiml: ['backend', 'frontend'],
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function splitClauses(text: string): string[] {
  return text
    .split(/,|;|\.\s|\n|\band then\b|\bthen\b|\band\b/i)
    .map((c) => c.trim().replace(/^(and|then|also|please)\s+/i, '').replace(/[.!]+$/, '').trim())
    .filter((c) => c.length > 2);
}

export function scoreClause(clause: string): Record<AgentRole, number> {
  const out = {} as Record<AgentRole, number>;
  for (const [role, sig] of Object.entries(SIGNALS) as [AgentRole, (typeof SIGNALS)[AgentRole]][]) {
    out[role] = (sig.nouns.test(clause) ? NOUN_WEIGHT : 0) + (sig.verbs.test(clause) ? VERB_WEIGHT : 0);
  }
  return out;
}

function pickRole(clause: string, team: AgentRole[]): { role: AgentRole; substitutedFor?: AgentRole } {
  const scores = scoreClause(clause);
  const ranked = (Object.keys(scores) as AgentRole[])
    .filter((r) => scores[r] > 0)
    // Higher score first; on a tie, prefer roles that are actually on the team.
    .sort((a, b) => scores[b] - scores[a] || Number(team.includes(b)) - Number(team.includes(a)));
  if (ranked.length === 0) {
    const builder = team.find((r) => r !== 'qa' && r !== 'docs') ?? team[0] ?? 'frontend';
    return { role: builder };
  }
  const best = ranked[0];
  if (team.includes(best)) return { role: best };
  const sub = SUBSTITUTES[best]?.find((r) => team.includes(r));
  if (sub) return { role: sub, substitutedFor: best };
  return { role: best }; // will be created BLOCKED by the orchestrator
}

const DEMO_RE = /room availability/i;

/** Exact split for the scripted demo command, so the stage demo is deterministic. */
function demoPlan(text: string, team: AgentRole[]): PlannedTask[] | null {
  if (!(DEMO_RE.test(text) && /booking validation/i.test(text) && /edge cases/i.test(text) && /document/i.test(text))) return null;
  const builder: AgentRole = team.includes('frontend') ? 'frontend' : team.includes('backend') ? 'backend' : 'frontend';
  return [
    { role: builder, title: 'Build room availability interface', description: 'React + TypeScript component listing rooms with live availability, including loading, empty and error states and accessible markup.' },
    { role: builder, title: 'Implement booking validation', description: 'Pure validation module (validateBooking, findConflicts, isRoomFree) plus a node:test suite covering edge cases.' },
    { role: 'qa', title: 'Test edge cases', description: 'Syntax-check every script, inspect the component, run the test suite and write reports/qa-report.md with the raw output.' },
    { role: 'docs', title: 'Document the result', description: 'Write docs/README.md from the project goal, constraints, decisions, teammates\' results and the QA report.' },
  ];
}

/** Rule-based planner (D3). Pure function: no DB, no network. */
export function rulePlan(text: string, team: AgentRole[]): Plan {
  const cleaned = text.trim();
  const notes: string[] = [];

  let tasks = demoPlan(cleaned, team);
  if (tasks) {
    notes.push('Matched the demo scenario: 2 build tasks, QA, then docs.');
  } else {
    tasks = splitClauses(cleaned).map((clause) => {
      const { role, substitutedFor } = pickRole(clause, team);
      if (substitutedFor) notes.push(`"${clause}" fits a ${ROLES[substitutedFor].title}; assigned to ${ROLES[role].title} instead.`);
      return {
        role,
        title: capitalize(clause).slice(0, 120),
        description: `From the leader's command: "${clause}". ${ROLES[role].instructions}`,
      };
    });
    // QA and docs depend on others' output, so they run last.
    const weight = (r: AgentRole) => (r === 'qa' ? 1 : r === 'docs' ? 2 : 0);
    tasks = tasks.map((t, i) => ({ t, i })).sort((a, b) => weight(a.t.role) - weight(b.t.role) || a.i - b.i).map((x) => x.t);
    if (tasks.length) notes.push(`Split the command into ${tasks.length} task(s) by keyword.`);
  }

  const missing = [...new Set(tasks.filter((t) => !team.includes(t.role)).map((t) => ROLES[t.role].title))];
  if (missing.length) notes.push(`Blocked until added to the team: ${missing.join(', ')}.`);
  return { tasks, note: notes.join(' ') };
}
