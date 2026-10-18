import { describe, expect, it } from 'vitest';
import { rulePlan, SIMULATED_FAILURE_TITLE } from '../src/agents/planner';
import { DEMO_COMMAND } from './helpers';

describe('rule planner', () => {
  it('splits the demo command into frontend ×2, qa, docs', () => {
    const plan = rulePlan(DEMO_COMMAND, ['frontend', 'qa']);
    expect(plan.tasks.map((t) => t.role)).toEqual(['frontend', 'frontend', 'qa', 'docs']);
    expect(plan.note).toMatch(/Documentation Writer/);
  });

  it('nouns outrank verbs: validation goes to backend when one exists', () => {
    const plan = rulePlan('implement booking validation, design the landing page', ['frontend', 'backend']);
    expect(plan.tasks.map((t) => t.role)).toEqual(['backend', 'frontend']);
  });

  it('keeps tasks for missing specialist roles and orders qa/docs last', () => {
    const plan = rulePlan('write the readme, test the api, build a signup form', ['frontend']);
    expect(plan.tasks.map((t) => t.role)).toEqual(['frontend', 'qa', 'docs']);
  });

  it('adds a deliberate failure task on "simulate a failure"', () => {
    const plan = rulePlan('simulate a failure', ['frontend', 'qa']);
    expect(plan.tasks).toHaveLength(1);
    expect(plan.tasks[0]).toMatchObject({ role: 'frontend', title: SIMULATED_FAILURE_TITLE });
  });

  it('returns no tasks for an empty command', () => {
    expect(rulePlan('  ', ['qa']).tasks).toEqual([]);
  });
});
