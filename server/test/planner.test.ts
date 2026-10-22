import { describe, expect, it } from 'vitest';
import { FAULT_MARKER, isFaultInjected, parseFaultInjection, rulePlan, withFaultInjection } from '../src/agents/planner';
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

  it('"simulate a failure" is stripped from the work and switches fault injection on', () => {
    expect(parseFaultInjection('simulate a failure, build a signup form')).toEqual({ inject: true, text: 'build a signup form' });
    expect(parseFaultInjection('build a signup form')).toEqual({ inject: false, text: 'build a signup form' });
    expect(parseFaultInjection('Simulate failure')).toEqual({ inject: true, text: '' });
  });

  it('fault injection marks the first build task and makes sure QA runs after it', () => {
    const plan = withFaultInjection(rulePlan('build a signup form, write the readme', ['frontend', 'qa', 'docs']), ['frontend', 'qa', 'docs']);
    expect(plan.tasks.map((t) => t.role)).toEqual(['frontend', 'qa', 'docs']);
    expect(plan.tasks[0].description).toContain(FAULT_MARKER);
    expect(plan.tasks.filter(isFaultInjected)).toHaveLength(1);
    expect(plan.note).toMatch(/Demo fault injection/);
    // Nothing to build: a build task is added for the builder on the team.
    const empty = withFaultInjection(rulePlan('', ['backend', 'qa']), ['backend', 'qa']);
    expect(empty.tasks.map((t) => [t.role, t.title])).toEqual([['backend', 'Implement booking validation'], ['qa', 'Test edge cases']]);
  });

  it('returns no tasks for an empty command', () => {
    expect(rulePlan('  ', ['qa']).tasks).toEqual([]);
  });
});
