// Ordered, append-only migrations. Each runs once and is recorded in _migrations.
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_init',
    sql: `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  constraints TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE project_agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, role)
);
CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  planner_provider TEXT NOT NULL,
  planner_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  command_id TEXT REFERENCES commands(id),
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  position INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,
  last_error TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_project ON tasks(project_id, position);
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL,
  provider TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_runs_task ON agent_runs(task_id);
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  made_by TEXT NOT NULL DEFAULT 'leader',
  created_at TEXT NOT NULL
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id);
CREATE TABLE activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  task_id TEXT,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_project ON activity_events(project_id, id);
`,
  },
  {
    // Supervised autonomy: runs with approval + limits, failure decisions, handoff messages. Additive only.
    name: '002_runs_decisions_handoff',
    sql: `
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  command_id TEXT,
  status TEXT NOT NULL,
  max_tasks INTEGER NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  planner_provider TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  last_progress_at TEXT,
  finished_at TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_runs_project ON runs(project_id, created_at);
ALTER TABLE tasks ADD COLUMN run_id TEXT;
CREATE TABLE decisions_pending (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  question TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  proposed TEXT NOT NULL,
  alternatives TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  resolved_by TEXT,
  resolution TEXT,
  instructions TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX idx_decisions_pending_project ON decisions_pending(project_id, status);
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE messages ADD COLUMN to_role TEXT;
ALTER TABLE messages ADD COLUMN provider TEXT;
`,
  },
];
