import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/db';
import { IllegalTransitionError, Repo } from '../src/db/repo';
import { tmpDir } from './helpers';

describe('db', () => {
  it('migrations apply once; second open is a no-op; rows survive reopen', () => {
    const file = path.join(tmpDir(), 'a.db');
    const first = openDb(file);
    expect(first.applied).toEqual(['001_init']);
    const p = new Repo(first.db).createProject({ name: 'X', goal: 'g', constraints: '' });
    first.db.close();

    const second = openDb(file);
    expect(second.applied).toEqual([]);
    expect(new Repo(second.db).getProject(p.id)?.name).toBe('X');
    second.db.close();
  });

  it('transition is a compare-and-swap and rejects illegal moves', () => {
    const { db } = openDb(':memory:');
    const repo = new Repo(db);
    const p = repo.createProject({ name: 'X', goal: '', constraints: '' });
    const t = repo.createTask({ projectId: p.id, commandId: null, role: 'qa', title: 't', description: '', status: 'QUEUED' });
    expect(() => repo.transition(t.id, 'QUEUED', 'COMPLETED')).toThrow(IllegalTransitionError);
    expect(repo.claimNextQueued(p.id)?.status).toBe('IN_PROGRESS');
    // A second claimer finds nothing; a stale CAS changes nothing.
    expect(repo.claimNextQueued(p.id)).toBeNull();
    expect(repo.transition(t.id, 'QUEUED', 'IN_PROGRESS')).toBeNull();
    expect(repo.getTask(t.id)?.attempts).toBe(1);
  });

  it('recoverInterrupted fails IN_PROGRESS tasks', () => {
    const { db } = openDb(':memory:');
    const repo = new Repo(db);
    const p = repo.createProject({ name: 'X', goal: '', constraints: '' });
    const t = repo.createTask({ projectId: p.id, commandId: null, role: 'qa', title: 't', description: '', status: 'QUEUED' });
    repo.claimNextQueued(p.id);
    repo.recoverInterrupted();
    expect(repo.getTask(t.id)).toMatchObject({ status: 'FAILED', lastError: 'Interrupted by restart' });
  });
});
