import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import type { ScanProgress } from '../../shared/library';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { resyncLibrary } from './library-sync';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tree(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tankobon-sync-'));
  roots.push(root);
  for (const file of files) {
    const fullPath = path.join(root, file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, '');
  }
  return root;
}

function repository(): LibraryRepository {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return new LibraryRepository(db);
}

const inspect = async () => ({ pageCount: 10, fileCount: 10 });
const noProgress = () => undefined;

describe('resyncLibrary', () => {
  it('adds new files and removes entries whose file is gone', async () => {
    const root = await tree(['new.cbz', 'kept.cbz']);
    const repo = repository();
    repo.register(path.join(root, 'kept.cbz'), 'kept', 10, 10, 0);
    repo.register(path.join(root, 'gone.cbz'), 'gone', 10, 10, 0);

    const summary = await resyncLibrary(repo, [root], noProgress, inspect);

    expect(summary).toMatchObject({ added: 1, removed: 1, failed: 0, unreachable: 0 });
    expect(repo.list().map((entry) => path.basename(entry.path)).sort()).toEqual(['kept.cbz', 'new.cbz']);
    expect(summary.removedEntries.map((entry) => path.basename(entry.path))).toEqual(['gone.cbz']);
  });

  it('writes the missing .nfo of the comics in the folders, and keeps an existing one', async () => {
    const root = await tree(['a.cbz', 'b.cbz']);
    const alone = await tree(['c.cbz']);
    await writeFile(path.join(root, 'b.nfo'), '<title>Mien</title>');
    const repo = repository();
    for (const file of [path.join(root, 'a.cbz'), path.join(root, 'b.cbz'), path.join(alone, 'c.cbz')]) {
      repo.register(file, path.basename(file, '.cbz'), 10, 10, 0);
    }

    const summary = await resyncLibrary(repo, [root], noProgress, inspect);

    expect(summary.nfoWritten).toBe(1);
    expect(await readFile(path.join(root, 'a.nfo'), 'utf8')).toContain('<title>a</title>');
    expect(await readFile(path.join(root, 'b.nfo'), 'utf8')).toBe('<title>Mien</title>');
    await expect(readFile(path.join(alone, 'c.nfo'))).rejects.toThrow();
  });

  it('writes no .nfo when asked not to', async () => {
    const root = await tree(['a.cbz']);
    const repo = repository();
    repo.register(path.join(root, 'a.cbz'), 'a', 10, 10, 0);

    const summary = await resyncLibrary(repo, [root], noProgress, inspect, async () => false, false);

    expect(summary.nfoWritten).toBe(0);
    await expect(readFile(path.join(root, 'a.nfo'))).rejects.toThrow();
  });

  it('removes a standalone entry whose file is gone from a directory that still exists', async () => {
    const root = await tree(['a.cbz']);
    const alone = await tree(['present.cbz']);
    const repo = repository();
    repo.register(path.join(alone, 'present.cbz'), 'present', 10, 10, 0);
    repo.register(path.join(alone, 'gone.cbz'), 'gone', 10, 10, 0);

    const summary = await resyncLibrary(repo, [root], noProgress, inspect);

    expect(summary.removedEntries.map((entry) => path.basename(entry.path))).toEqual(['gone.cbz']);
    expect(repo.hasPath(path.join(alone, 'present.cbz'))).toBe(true);
  });

  it('keeps a standalone entry whose directory is unreachable', async () => {
    const root = await tree(['a.cbz']);
    const repo = repository();
    repo.register('/elsewhere/missing.cbz', 'elsewhere', 10, 10, 0);

    const summary = await resyncLibrary(repo, [root], noProgress, inspect);

    expect(summary.removed).toBe(0);
    expect(repo.hasPath('/elsewhere/missing.cbz')).toBe(true);
  });

  it('checks standalone entries even when there is no folder', async () => {
    const alone = await tree([]);
    const repo = repository();
    repo.register(path.join(alone, 'gone.cbz'), 'gone', 10, 10, 0);

    const summary = await resyncLibrary(repo, [], noProgress, inspect);

    expect(summary.removed).toBe(1);
    expect(repo.list()).toHaveLength(0);
  });

  it('skips a folder that cannot be read instead of emptying it', async () => {
    const missingRoot = path.join(tmpdir(), 'tankobon-sync-unplugged');
    const repo = repository();
    repo.register(path.join(missingRoot, 'a.cbz'), 'a', 10, 10, 0);

    const summary = await resyncLibrary(repo, [missingRoot], noProgress, inspect);

    expect(summary).toMatchObject({ added: 0, removed: 0, unreachable: 1 });
    expect(repo.list()).toHaveLength(1);
  });

  it('reports a single final "done" for all the folders', async () => {
    const first = await tree(['a.cbz']);
    const second = await tree(['b.cbz']);
    const phases: string[] = [];

    await resyncLibrary(repository(), [first, second], (progress) => phases.push(progress.phase), inspect);

    expect(phases.filter((phase) => phase === 'done')).toEqual(['done']);
    expect(phases.at(-1)).toBe('done');
  });
});

describe('resyncLibrary covers', () => {
  it('extracts the missing covers of the comics in the folders only', async () => {
    const root = await tree(['a.cbz', 'b.cbz']);
    const alone = await tree(['c.cbz']);
    const repo = repository();
    for (const file of [path.join(root, 'a.cbz'), path.join(root, 'b.cbz'), path.join(alone, 'c.cbz')]) {
      repo.register(file, path.basename(file, '.cbz'), 10, 10, 0);
    }
    const asked: string[] = [];
    const extractCover = async (file: string) => {
      asked.push(path.basename(file));
      return file.endsWith('a.cbz');
    };

    const summary = await resyncLibrary(repo, [root], noProgress, inspect, extractCover);

    expect(asked.sort()).toEqual(['a.cbz', 'b.cbz']);
    expect(summary.coversExtracted).toBe(1);
  });

  // A book whose library folder has no path on this machine keeps its stored form (`root:<id>/…`); its absence
  // says nothing, even when the stored form happens to name a readable directory relative to the working directory.
  it('keeps the books of a folder that is not linked on this machine', async () => {
    const root = await tree(['elsewhere/root:abc/.keep']);
    const folder = await tree(['one.cbz']);
    const repo = repository();
    repo.register('root:abc/gone.cbz', 'gone', 10, 10, 0);
    const previous = process.cwd();
    process.chdir(path.join(root, 'elsewhere'));
    try {
      const summary = await resyncLibrary(repo, [folder], noProgress, inspect);
      expect(summary.removed).toBe(0);
    } finally {
      process.chdir(previous);
    }
    expect(repo.hasPath('root:abc/gone.cbz')).toBe(true);
  });
});

describe('resyncLibrary steps', () => {
  it('tags every progress with its step: one scan per folder, then nfo, covers and missing', async () => {
    const first = await tree(['a.cbz']);
    const second = await tree(['b.cbz']);
    const progress: ScanProgress[] = [];

    await resyncLibrary(repository(), [first, second], (p) => progress.push(p), inspect);

    const steps = progress.filter((p) => p.phase !== 'done').map((p) => p.step!);
    expect(steps.every((step) => step.count === 5)).toBe(true);
    const started = steps.filter((step, index) => index === 0 || steps[index - 1]!.index !== step.index);
    expect(started.map((step) => [step.index, step.name, step.folder])).toEqual([
      [1, 'scan', first],
      [2, 'scan', second],
      [3, 'nfo', ''],
      [4, 'covers', ''],
      [5, 'missing', ''],
    ]);
    expect(progress.at(-1)).toMatchObject({ phase: 'done' });
    expect(progress.filter((p) => p.phase === 'done')).toHaveLength(1);
  });

  it('has no nfo step when the .nfo are not written', async () => {
    const root = await tree(['a.cbz']);
    const names = new Set<string>();

    await resyncLibrary(repository(), [root], (p) => p.step && names.add(`${p.step.index}/${p.step.count} ${p.step.name}`), inspect, async () => false, false);

    expect([...names]).toEqual(['1/3 scan', '2/3 covers', '3/3 missing']);
  });
});

describe('resyncLibrary cancellation', () => {
  it('stops between two files, keeps what it added and says so', async () => {
    const root = await tree(['a.cbz', 'b.cbz', 'c.cbz']);
    const repo = repository();
    const controller = new AbortController();
    // The first file opened stops the run: the scan finishes it, then goes no further.
    const stoppingInspect = async () => {
      controller.abort();
      return { pageCount: 10, fileCount: 10 };
    };
    const progress: ScanProgress[] = [];

    const summary = await resyncLibrary(repo, [root], (p) => progress.push(p), stoppingInspect, async () => false, true, controller.signal);

    expect(summary).toMatchObject({ added: 1, cancelled: true });
    expect(repo.list()).toHaveLength(1);
    expect(progress.some((p) => p.step && p.step.name !== 'scan')).toBe(false);
    expect(progress.at(-1)).toMatchObject({ phase: 'done' });
  });

  it('removes nothing once stopped', async () => {
    const root = await tree(['kept.cbz']);
    const repo = repository();
    repo.register(path.join(root, 'gone.cbz'), 'gone', 10, 10, 0);
    const controller = new AbortController();
    controller.abort();

    const summary = await resyncLibrary(repo, [root], noProgress, inspect, async () => false, true, controller.signal);

    expect(summary).toMatchObject({ added: 0, removed: 0, cancelled: true });
    expect(repo.list()).toHaveLength(1);
  });

  it('is not cancelled when the signal is never aborted', async () => {
    const root = await tree(['a.cbz']);
    const summary = await resyncLibrary(repository(), [root], noProgress, inspect, async () => false, true, new AbortController().signal);
    expect(summary.cancelled).toBe(false);
  });
});
