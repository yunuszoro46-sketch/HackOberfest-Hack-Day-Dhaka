import { describe, expect, it } from 'vitest';
import { IDEA_CRITERIA, IDEA_EVIDENCE_LABELS, IDEA_VERDICTS, scoreIdea } from '../../shared/idea-report';
import { makeApp } from './helpers';

describe('idea report scoring', () => {
  it('builds a structured idea report from a short idea', () => {
    const report = scoreIdea({
      idea: 'A mobile app for commuters to find safe, cheap parking in Dhaka with live availability alerts and route suggestions.',
      theme: 'real life local problems',
      hoursLeft: 150,
      teamSkills: '2 people, React + Node',
      targetJudges: 'local city leaders and startup judges',
      mode: 'quick',
    });

    expect(report.verdict).toBe('Build');
    expect(report.overallScore).toBeGreaterThanOrEqual(60);
    expect(report.criteria).toHaveLength(IDEA_CRITERIA.length);
    expect(report.ideaCard.problem.length).toBeGreaterThan(10);
    expect(report.criteria.every((criterion) => criterion.score >= 0 && criterion.score <= 100)).toBe(true);
    expect(report.criteria.every((criterion) => IDEA_EVIDENCE_LABELS.includes(criterion.evidenceLabel))).toBe(true);
    expect(IDEA_VERDICTS.includes(report.verdict)).toBe(true);
    expect(report.topRisks).toHaveLength(3);
    expect(report.analysis.method).toBe('rule-based');
    expect(report.upgradeSuggestions.mustFix.length).toBeGreaterThan(0);
    expect(report.upgradeSuggestions.niceToHave).toHaveLength(2);
    expect(report.upgradeSuggestions.wowFactor).toHaveLength(2);
    expect(Object.values(report.upgradeSuggestions).flat().every((suggestion) => suggestion.effortHours > 0 && suggestion.impact)).toBe(true);
    expect(report.userSimulations).toHaveLength(3);
    expect(report.judgeQuestions).toHaveLength(8);
    expect(report.failureSimulations).toHaveLength(4);
    expect(report.timeCrunch.cutLineHours).toBe(75);
    expect(report.timeCrunch.keep.length).toBeGreaterThan(0);
    expect(report.timeCrunch.cut.length).toBeGreaterThan(0);
    expect(report.impactScenarios.map((scenario) => scenario.outcome)).toEqual(['best', 'expected', 'worst']);
  });

  it('supports the quick idea-in report-out API flow', async () => {
    const { http } = makeApp();
    const res = await http.post('/api/ideas/report').send({
      idea: 'A platform that helps students compare nearby study spaces by price, noise level, and Wi-Fi quality.',
      theme: 'student life',
      hoursLeft: 72,
      teamSkills: 'Frontend + API',
      mode: 'quick',
    });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('quick');
    expect(res.body.overallScore).toBeGreaterThanOrEqual(0);
    expect(res.body.criteria).toHaveLength(7);
    expect(res.body.ideaCard.targetUser).toBeTruthy();
    expect(IDEA_VERDICTS.includes(res.body.verdict)).toBe(true);
    expect(res.body.judgeQuestions).toHaveLength(8);
    expect(res.body.failureSimulations).toHaveLength(4);
  });
});
