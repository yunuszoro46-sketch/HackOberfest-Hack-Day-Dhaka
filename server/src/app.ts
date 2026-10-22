import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AGENT_ROLES, TASK_STATUSES, type ProjectSnapshot } from '../../shared/types';
import { scoreIdea } from '../../shared/idea-report';
import { Orchestrator } from './agents/orchestrator';
import { ROLE_LIST } from './agents/roles';
import { openDb, SERVER_ROOT, type DB } from './db/db';
import { Repo } from './db/repo';
import { ApiErr, notFound } from './http/errors';
import { createProviders, type Providers } from './providers';
import { createIdeaResearchService, type IdeaResearchService } from './research/idea-research';
import { createLlm, describeLlm, type LlmSetup } from './llm/registry';
import { IdeaRunRepo } from './db/idea-runs';
import { CouncilService } from './council/service';
import { DEFAULT_COUNCIL_CALLS } from './council/runner';
import { PlanReviewService } from './council/plan-review-service';
import { DEFAULT_REVIEW_AGENTS, REVIEW_AGENT_IDS } from '../../shared/plan-review';

export interface AppOptions {
  dbFile?: string;
  workspaceRoot?: string;
  providers?: Providers;
  serveClient?: boolean;
  runTimeoutMs?: number;
  researchService?: IdeaResearchService;
  llm?: LlmSetup;
}

const ProjectBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  goal: z.string().trim().max(2000).default(''),
  constraints: z.string().trim().max(2000).default(''),
});
const AgentsBody = z.object({
  agents: z
    .array(z.object({ role: z.enum(AGENT_ROLES) }))
    .max(AGENT_ROLES.length)
    .refine((a) => new Set(a.map((x) => x.role)).size === a.length, 'Each role can only be added once'),
});
const DecisionBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  rationale: z.string().trim().max(2000).default(''),
  madeBy: z.string().trim().min(1).max(60).default('leader'),
});
const CommandBody = z.object({
  text: z.string().trim().min(1, 'Command text is required').max(2000),
  maxTasks: z.number().int().min(1).max(100).optional(),
  maxRuntimeMs: z.number().int().min(1000).max(24 * 60 * 60 * 1000).optional(),
});
const DecisionResolve = z.object({ action: z.enum(['approve', 'reject']), instructions: z.string().trim().max(2000).optional() });
const IdeaBody = z.object({
  idea: z.string().trim().min(1, 'Idea is required').max(500),
  theme: z.string().trim().max(200).optional().nullable(),
  hoursLeft: z.number().int().min(1).max(1000).optional().nullable(),
  teamSkills: z.string().trim().max(200).optional().nullable(),
  targetJudges: z.string().trim().max(200).optional().nullable(),
  mode: z.enum(['quick', 'deep']).default('quick'),
});
const IdeaRunBody = IdeaBody.extend({
  maxCalls: z.number().int().min(2).max(20).default(DEFAULT_COUNCIL_CALLS),
});
const IdeaResearchBody = IdeaBody.extend({
  confirmed: z.literal(true, { message: 'Confirm before starting external research' }),
});
const line = (max = 300) => z.string().trim().min(1).max(max);
const PlanReviewBody = z.object({
  spec: z.object({
    idea: IdeaBody.extend({ idea: z.string().trim().min(1, 'Idea is required').max(2000) }),
    ideaCard: z.object({ problem: z.string().trim().max(500), targetUser: z.string().trim().max(300), solution: z.string().trim().max(500) }).optional(),
    assessmentScore: z.number().int().min(0).max(100).optional(),
    visualDirection: z.string().trim().max(300).optional(),
    techStack: z.record(z.string().max(60), z.string().trim().max(200)).default({}),
    features: z.array(z.object({ title: line(), priority: z.enum(['P0', 'P1', 'P2']) })).max(30).default([]),
    constraints: z.array(line()).max(20).default([]),
    nonGoals: z.array(line()).max(20).default([]),
    decisions: z.array(z.object({ question: line(), answer: line(500) })).max(20).default([]),
    knownRisks: z.array(line()).max(10).optional(),
  }),
  agents: z.array(z.enum(REVIEW_AGENT_IDS)).min(1, 'Pick at least one agent').max(REVIEW_AGENT_IDS.length)
    .refine((a) => new Set(a).size === a.length, 'Each agent can only sit once').default(DEFAULT_REVIEW_AGENTS),
  focus: z.string().trim().max(500).optional().nullable(),
});
const TaskPatch = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    blockedReason: z.string().max(500).optional(),
    note: z.string().max(2000).optional(),
  })
  .refine((b) => b.status || b.note, 'Provide status or note');

function parse<T>(schema: z.ZodType<T, any, any>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new ApiErr('VALIDATION_ERROR', r.error.issues[0]?.message ?? 'Invalid request', r.error.issues);
  return r.data;
}

export function createApp(opts: AppOptions = {}) {
  const { db } = openDb(opts.dbFile);
  const repo = new Repo(db);
  const workspaceRoot = opts.workspaceRoot ?? process.env.TEAMMATE_WORKSPACE ?? path.join(SERVER_ROOT, 'workspace');
  const llm = opts.llm ?? createLlm();
  const providers = opts.providers ?? createProviders(undefined, llm.chain);
  const researchService = opts.researchService ?? createIdeaResearchService();
  const orch = new Orchestrator(repo, providers, workspaceRoot, { runTimeoutMs: opts.runTimeoutMs });
  const recovered = orch.boot();
  const council = new CouncilService(new IdeaRunRepo(db), llm.chain);
  const recoveredIdeaRuns = council.boot();
  const planReviews = new PlanReviewService(llm.chain);

  const app = express();
  app.disable('x-powered-by');
  // Artifacts are agent-written text: never let a browser sniff them into something executable.
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  const project = (id: string) => repo.getProject(id) ?? (() => { throw notFound('Project'); })();

  app.get('/api/health', (_req, res) => {
    const modelRun = providers.runner.name === 'llm';
    res.json({
      ok: true, plannerProvider: providers.planner.name, runnerProvider: providers.runner.name,
      // What will execute tasks, so the UI can say it before anything runs. Never includes keys.
      execution: {
        mode: modelRun ? 'model' : 'templates',
        models: modelRun ? llm.chain.status().map((m) => `${m.provider}:${m.model}`) : [],
        ...(providers.warning ? { warning: providers.warning } : {}),
      },
    });
  });

  app.post('/api/ideas/report', (req, res) => {
    const body = parse(IdeaBody, req.body);
    res.status(201).json(scoreIdea(body));
  });

  app.post('/api/ideas/research', async (req, res) => {
    const body = parse(IdeaResearchBody, req.body);
    const { confirmed: _confirmed, ...input } = body;
    res.status(200).json(await researchService.research(input));
  });

  app.get('/api/llm/status', (_req, res) => { res.json(describeLlm(llm)); });

  // Idea council runs: created awaiting approval; no LLM call happens until approve.
  app.get('/api/ideas/runs', (req, res) => {
    res.json(council.list(Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)));
  });
  app.post('/api/ideas/runs', (req, res) => {
    const { maxCalls, ...input } = parse(IdeaRunBody, req.body);
    res.status(201).json(council.detail(council.create(input, maxCalls).id));
  });
  app.get('/api/ideas/runs/:id', (req, res) => { res.json(council.detail(req.params.id)); });
  app.post('/api/ideas/runs/:id/approve', (req, res) => { res.json(council.approve(req.params.id)); });
  app.post('/api/ideas/runs/:id/cancel', (req, res) => { res.json(council.cancel(req.params.id)); });

  // Plan review council: started by the leader's click in the planning workspace; poll for turns and the verdict.
  app.post('/api/plans/reviews', (req, res) => {
    const body = parse(PlanReviewBody, req.body);
    res.status(202).json(planReviews.start(body.spec, body.agents, body.focus?.trim() || null));
  });
  app.get('/api/plans/reviews/:id', (req, res) => { res.json(planReviews.get(req.params.id)); });
  app.post('/api/plans/reviews/:id/cancel', (req, res) => { res.json(planReviews.cancel(req.params.id)); });

  app.get('/api/roles', (_req, res) => { res.json(ROLE_LIST); });

  app.get('/api/projects', (_req, res) => { res.json(repo.listProjects()); });

  app.post('/api/projects', (req, res) => {
    const body = parse(ProjectBody, req.body);
    res.status(201).json(repo.createProject(body));
  });

  app.get('/api/projects/:id', (req, res) => {
    const p = project(req.params.id);
    res.json({ ...p, agents: repo.listAgents(p.id), decisions: repo.listDecisions(p.id), taskCounts: repo.taskCounts(p.id) });
  });

  app.get('/api/projects/:id/snapshot', (req, res) => {
    const p = project(req.params.id);
    const snap: ProjectSnapshot = {
      project: p,
      agents: repo.listAgents(p.id),
      tasks: repo.listTasks(p.id),
      runs: repo.listRunsForProject(p.id),
      artifacts: repo.listArtifacts(p.id),
      activity: repo.listActivity(p.id, 150),
      trail: repo.listTrail(p.id),
      decisions: repo.listDecisions(p.id),
      commands: repo.listCommands(p.id),
      busy: orch.isBusy(p.id),
      run: repo.latestSupRun(p.id),
      pendingDecisions: repo.listPending(p.id),
    };
    res.json(snap);
  });

  app.put('/api/projects/:id/agents', (req, res) => {
    const p = project(req.params.id);
    const body = parse(AgentsBody, req.body);
    res.json(repo.setAgents(p.id, body.agents.map((a) => a.role)));
  });

  app.post('/api/projects/:id/decisions', (req, res) => {
    const p = project(req.params.id);
    const body = parse(DecisionBody, req.body);
    res.status(201).json(repo.addDecision(p.id, body.title, body.rationale, body.madeBy));
  });

  app.post('/api/projects/:id/commands', async (req, res) => {
    const p = project(req.params.id);
    const body = parse(CommandBody, req.body);
    res.status(202).json(await orch.submitCommand(p.id, body.text, { maxTasks: body.maxTasks, maxRuntimeMs: body.maxRuntimeMs }));
  });

  app.get('/api/runs/:id', (req, res) => {
    const r = repo.getSupRun(req.params.id);
    if (!r) throw notFound('Run');
    res.json(r);
  });
  app.post('/api/runs/:id/approve', (req, res) => { res.json(orch.approveRun(req.params.id)); });
  app.post('/api/runs/:id/pause', (req, res) => { res.json(orch.pauseRun(req.params.id)); });
  app.post('/api/runs/:id/resume', (req, res) => { res.json(orch.resumeRun(req.params.id)); });
  app.post('/api/decisions/:id', (req, res) => {
    const body = parse(DecisionResolve, req.body);
    res.json(orch.resolveDecision(req.params.id, body.action, body.instructions));
  });
  app.post('/api/runs/:id/cancel', (req, res) => { res.json(orch.cancelRun(req.params.id)); });

  app.get('/api/projects/:id/tasks', (req, res) => { res.json(repo.listTasks(project(req.params.id).id)); });

  app.get('/api/tasks/:id', (req, res) => {
    const t = repo.getTask(req.params.id);
    if (!t) throw notFound('Task');
    res.json({ ...t, runs: repo.listRunsForTask(t.id), messages: repo.listMessagesForTask(t.id), artifacts: repo.listArtifactsForTask(t.id) });
  });

  app.patch('/api/tasks/:id', (req, res) => {
    const body = parse(TaskPatch, req.body);
    res.json(orch.updateTask(req.params.id, body));
  });

  app.post('/api/tasks/:id/retry', (req, res) => { res.status(202).json(orch.retry(req.params.id)); });

  app.get('/api/projects/:id/activity', (req, res) => {
    const p = project(req.params.id);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(repo.listActivity(p.id, limit));
  });

  app.get('/api/projects/:id/artifacts', (req, res) => { res.json(repo.listArtifacts(project(req.params.id).id)); });

  app.get('/api/artifacts/:id', (req, res) => {
    const a = repo.getArtifact(req.params.id);
    if (!a) throw notFound('Artifact');
    res.json({ ...a, run: repo.getRun(a.runId), task: repo.getTask(a.taskId) });
  });

  app.get('/api/activity/recent', (_req, res) => { res.json(repo.recentActivity(30)); });

  app.use('/api', (_req, _res, next) => next(notFound('Route')));

  const clientDist = path.resolve(SERVER_ROOT, '../client/dist');
  if ((opts.serveClient ?? process.env.NODE_ENV === 'production') && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiErr) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } });
      return;
    }
    if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });

  return { app, repo, orch, db: db as DB, recovered, providers, llm, council, recoveredIdeaRuns, planReviews };
}
