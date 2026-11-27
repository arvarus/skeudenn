import { EventEmitter } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BackupInfo } from '../../shared/data';
import {
  BackupFailedError,
  BackupWorkerUnavailableError,
  createBackupMaker,
  createBackupRunner,
  type BackupJob,
  type BackupWorker,
  type BackupWorkerMessage,
} from './backup-runner';

const job: BackupJob = { databaseFile: '/data/skeudenn.db', directory: '/data' };
const info: BackupInfo = { name: 'skeudenn-20260102-030405.db', createdAt: '2026-01-02T03:04:05.000Z', size: 10 };

/** A worker the test drives by hand. */
function fakeWorker() {
  const emitter = new EventEmitter();
  const terminate = vi.fn(async () => 0);
  const worker: BackupWorker = {
    on: (event: string, listener: (...args: never[]) => void) => emitter.on(event, listener as never),
    terminate,
  } as BackupWorker;
  return {
    worker,
    terminate,
    say: (message: BackupWorkerMessage) => emitter.emit('message', message),
    fail: (error: Error) => emitter.emit('error', error),
    exit: (code: number) => emitter.emit('exit', code),
  };
}

describe('createBackupRunner', () => {
  it('resolves with the copy the worker made, then ends the worker', async () => {
    const fake = fakeWorker();
    const spawn = vi.fn(() => fake.worker);
    const promise = createBackupRunner(spawn).run(job);
    fake.say({ ok: true, backup: info });
    await expect(promise).resolves.toEqual(info);
    expect(spawn).toHaveBeenCalledWith(job);
    expect(fake.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with the worker\'s reason when the copy fails', async () => {
    const fake = fakeWorker();
    const promise = createBackupRunner(() => fake.worker).run(job);
    fake.say({ ok: false, message: 'disk full' });
    await expect(promise).rejects.toThrow(BackupFailedError);
    await expect(promise).rejects.toThrow('disk full');
  });

  it('reports a worker that cannot run, or dies without answering, as unavailable', async () => {
    const broken = fakeWorker();
    const first = createBackupRunner(() => broken.worker).run(job);
    broken.fail(new Error('Cannot find module backup-worker.cjs'));
    await expect(first).rejects.toThrow(BackupWorkerUnavailableError);

    const dying = fakeWorker();
    const second = createBackupRunner(() => dying.worker).run(job);
    dying.exit(1);
    await expect(second).rejects.toThrow(BackupWorkerUnavailableError);

    const spawnFails = createBackupRunner(() => {
      throw new Error('no thread');
    }).run(job);
    await expect(spawnFails).rejects.toThrow(BackupWorkerUnavailableError);
  });

  it('settles once: a late exit after the answer changes nothing', async () => {
    const fake = fakeWorker();
    const promise = createBackupRunner(() => fake.worker).run(job);
    fake.say({ ok: true, backup: info });
    fake.exit(0);
    await expect(promise).resolves.toEqual(info);
  });

  it('gives a call made during a copy the answer of that copy, and allows the next one after it', async () => {
    const fake = fakeWorker();
    const spawn = vi.fn(() => fake.worker);
    const runner = createBackupRunner(spawn);
    const first = runner.run(job);
    const second = runner.run(job);
    expect(spawn).toHaveBeenCalledTimes(1);
    fake.say({ ok: true, backup: info });
    expect(await first).toBe(await second);

    const next = fakeWorker();
    spawn.mockReturnValueOnce(next.worker);
    const third = runner.run(job);
    next.say({ ok: true, backup: info });
    await third;
    expect(spawn).toHaveBeenCalledTimes(2);
  });
});

describe('createBackupMaker', () => {
  let root = '';
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function database() {
    root = mkdtempSync(path.join(tmpdir(), 'skeudenn-backup-maker-'));
    const file = path.join(root, 'skeudenn.db');
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('one')");
    return { db, file };
  }

  it('asks the worker for the copy of the open database file', async () => {
    const { db, file } = database();
    const run = vi.fn(async () => info);
    expect(await createBackupMaker({ run }, db)('/where')).toBe(info);
    expect(run).toHaveBeenCalledWith({ databaseFile: file, directory: '/where' });
    db.close();
  });

  it('makes the copy itself when the worker cannot run', async () => {
    const { db } = database();
    const run = vi.fn(async () => Promise.reject(new BackupWorkerUnavailableError('no worker')));
    const backup = await createBackupMaker({ run }, db)(root);
    expect(readdirSync(path.join(root, '.skeudenn'))).toEqual([backup.name]);
    db.close();
  });

  it('does not retry a copy that failed', async () => {
    const { db } = database();
    const run = vi.fn(async () => Promise.reject(new BackupFailedError('disk full')));
    await expect(createBackupMaker({ run }, db)(root)).rejects.toThrow('disk full');
    db.close();
  });

  it('copies an in-memory database itself, since it has no file for a worker', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'skeudenn-backup-maker-'));
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE t (v TEXT)');
    const run = vi.fn();
    const backup = await createBackupMaker({ run }, db)(root);
    expect(run).not.toHaveBeenCalled();
    expect(readdirSync(path.join(root, '.skeudenn'))).toEqual([backup.name]);
    db.close();
  });
});
