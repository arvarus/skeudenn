/**
 * Runs a database copy in a worker thread, so a large library's `VACUUM INTO` (synchronous in
 * `node:sqlite`) doesn't hold up the main process's IPC for its whole duration (ADR 0024). Free of
 * Electron and of any real thread: the main process passes the function that starts the worker.
 * @module
 */
import type { DatabaseSync } from 'node:sqlite';

import type { BackupInfo } from '../../shared/data';
import { errorText } from '../../shared/errors';
import { createBackup } from './backup-service';

/** What the worker is told: the open database's file and the folder the copy goes in. */
export interface BackupJob {
  /** The database file to copy (read through a connection of its own). */
  databaseFile: string;
  /** The database's folder: the copy goes to its `.skeudenn` subfolder. */
  directory: string;
}

/** What the worker answers, once. */
export type BackupWorkerMessage = { ok: true; backup: BackupInfo } | { ok: false; message: string };

/** The part of a `worker_threads` `Worker` the runner uses. */
export interface BackupWorker {
  /** The worker's answer (it sends one). */
  on(event: 'message', listener: (message: BackupWorkerMessage) => void): unknown;
  /** The worker could not load, or threw. */
  on(event: 'error', listener: (error: Error) => void): unknown;
  /** The worker ended, with its exit code. */
  on(event: 'exit', listener: (code: number) => void): unknown;
  /** Ends the worker (once it has answered). */
  terminate(): Promise<number> | void;
}

/** The copy itself failed (read-only folder, full disk…): the worker ran and said why. */
export class BackupFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFailedError';
  }
}

/** The worker could not run (its script is missing or cannot be loaded, it died without answering): nothing was copied. */
export class BackupWorkerUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackupWorkerUnavailableError';
  }
}

/** Makes one copy at a time. */
export interface BackupRunner {
  /**
   * Copies the database in a worker thread, one worker per copy, ended afterwards. A call made while one
   * runs gets the answer of that one. Rejects with {@link BackupFailedError} or {@link BackupWorkerUnavailableError}.
   */
  run(job: BackupJob): Promise<BackupInfo>;
}

/** Builds the runner around `spawn`, which starts a worker thread for a job. */
export function createBackupRunner(spawn: (job: BackupJob) => BackupWorker): BackupRunner {
  let inFlight: Promise<BackupInfo> | null = null;

  const start = (job: BackupJob) =>
    new Promise<BackupInfo>((resolve, reject) => {
      let worker: BackupWorker;
      try {
        worker = spawn(job);
      } catch (error) {
        reject(new BackupWorkerUnavailableError(errorText(error), { cause: error }));
        return;
      }
      let settled = false;
      const settle = (finish: () => void) => {
        if (settled) return;
        settled = true;
        finish();
        void Promise.resolve(worker.terminate()).catch(() => undefined);
      };
      worker.on('message', (message) =>
        settle(() => (message.ok ? resolve(message.backup) : reject(new BackupFailedError(message.message)))),
      );
      worker.on('error', (error) =>
        settle(() => reject(new BackupWorkerUnavailableError(error.message, { cause: error }))),
      );
      worker.on('exit', (code) =>
        settle(() => reject(new BackupWorkerUnavailableError(`The backup worker exited (code ${code}) without answering`))),
      );
    });

  return {
    run(job) {
      inFlight ??= start(job).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

/**
 * The function `runBackup` calls: the copy goes through the worker thread; if the worker can't run at all (its
 * bundle is missing, it cannot be loaded from the package), the copy is made on the calling thread, as it was
 * before the worker existed, so a backup is never lost to it. A failure of the copy itself is not retried.
 * An in-memory database, which has no file for the worker to open, is copied on the calling thread too.
 */
export function createBackupMaker(runner: BackupRunner, db: DatabaseSync): (directory: string) => Promise<BackupInfo> {
  return async (directory) => {
    const databaseFile = db.location();
    if (databaseFile === null) return createBackup(db, directory);
    try {
      return await runner.run({ databaseFile, directory });
    } catch (error) {
      if (error instanceof BackupWorkerUnavailableError) return createBackup(db, directory);
      throw error;
    }
  };
}
