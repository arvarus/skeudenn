/**
 * Entry of the backup worker thread (its own bundle, `backup-worker.cjs`, next to `main.cjs`): opens the
 * database file with a connection of its own and writes one copy of it, so the main process isn't held
 * up while SQLite copies a large library. It touches nothing else and imports nothing from Electron.
 * @module
 */
import { parentPort, workerData } from 'node:worker_threads';

import { errorText } from '../../shared/errors';
import { backupDatabaseFile } from './backup-service';
import type { BackupJob, BackupWorkerMessage } from './backup-runner';

const job = workerData as BackupJob;

function answer(message: BackupWorkerMessage): void {
  parentPort?.postMessage(message);
}

try {
  answer({ ok: true, backup: backupDatabaseFile(job.databaseFile, job.directory) });
} catch (error) {
  answer({ ok: false, message: errorText(error) });
}
