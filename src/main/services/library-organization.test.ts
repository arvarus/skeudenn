import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryOrganization } from '../../shared/settings';
import { LibraryFolderRepository } from '../db/library-folder-repository';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import type { DecoderClient } from '../decoder/decoder-client';
import type { ImageStatsScanner } from './image-stats-scanner';
import {
  createLibraryOrganizer,
  createLibraryRunLock,
  type LibraryRun,
  createResynchronizer,
  NOTHING_ORGANIZED,
  type LibraryOrganizer,
} from './library-organization';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function folderWith(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tankobon-organization-'));
  roots.push(root);
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), '');
  }
  return root;
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

describe('createLibraryRunLock', () => {
  it('lets one run at a time and says which one holds it', () => {
    const lock = createLibraryRunLock();
    expect(lock.tryStart('resync')).toBe(true);
    expect(lock.tryStart('organize')).toBe(false);
    expect(lock.busyMessage()).toBe(createBusyMessage('resync'));

    lock.end();
    expect(lock.tryStart('organize')).toBe(true);
    expect(lock.busyMessage()).not.toBe(createBusyMessage('resync'));
  });
});

/** The message of the lock while `run` holds it. */
function createBusyMessage(run: LibraryRun): string {
  const lock = createLibraryRunLock();
  lock.tryStart(run);
  return lock.busyMessage();
}

describe('library organization and resynchronization', () => {
  let db: DatabaseSync;
  let repo: LibraryRepository;
  let settings: SettingsRepository;
  let folders: LibraryFolderRepository;
  const decoder = { thumbnail: vi.fn(async () => new Uint8Array([1])), removeThumbnail: vi.fn(async () => undefined), inspect: vi.fn(async () => ({ pageCount: 10, fileCount: 10 })) };
  const imageScanner = { kick: vi.fn() };
  const notify = vi.fn();
  let organizer: LibraryOrganizer;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
    settings = new SettingsRepository(db);
    folders = new LibraryFolderRepository(db);
    organizer = createLibraryOrganizer(repo, settings, decoder as unknown as DecoderClient, notify);
  });

  function configure(mode: LibraryOrganization, root: string): void {
    settings.set('libraryOrganization', mode);
    settings.set('libraryOrganizationFolder', root);
  }

  /** Registers a file of the library, like a scan does, and returns what `afterAdd` takes. */
  function register(filePath: string): { id: string; path: string } {
    repo.register(filePath, path.basename(filePath, '.cbz'), 10, 10, 1);
    return { id: repo.idOfPath(filePath)!, path: filePath };
  }

  describe('watchedFolders', () => {
    it('adds the organized folder only while the organization is on', () => {
      expect(organizer.watchedFolders(['/a'])).toEqual(['/a']);

      configure('ask', '/organized');
      expect(organizer.watchedFolders(['/a'])).toEqual(['/a', '/organized']);
      expect(organizer.watchedFolders(['/organized'])).toEqual(['/organized']);

      configure('off', '/organized');
      expect(organizer.watchedFolders(['/a'])).toEqual(['/a']);
    });
  });

  describe('afterAdd', () => {
    it('does nothing when the organization is off', async () => {
      const source = await folderWith(['a.cbz']);
      const added = register(path.join(source, 'a.cbz'));

      expect(await organizer.afterAdd([added])).toEqual(NOTHING_ORGANIZED);
      expect(repo.get(added.id)?.path).toBe(added.path);
    });

    it('moves the added comics at once with "always", forgetting their old thumbnail', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      configure('always', root);
      const added = register(path.join(source, 'a.cbz'));

      const outcome = await organizer.afterAdd([added]);

      expect(outcome).toEqual({ moved: 1, failed: 0, pending: null });
      const moved = repo.get(added.id)!.path;
      expect(moved).toBe(path.join(root, `a (${added.id})`, 'a.cbz'));
      expect(await exists(moved)).toBe(true);
      expect(await exists(added.path)).toBe(false);
      expect(notify).toHaveBeenCalledWith({ scope: 'library' });
      expect(decoder.removeThumbnail).toHaveBeenCalledWith(added.path);
    });

    it('with "ask", moves what is already in the organized folder and offers the rest', async () => {
      const source = await folderWith(['outside.cbz']);
      const root = await folderWith(['inside.cbz']);
      configure('ask', root);
      const outside = register(path.join(source, 'outside.cbz'));
      const inside = register(path.join(root, 'inside.cbz'));

      const outcome = await organizer.afterAdd([outside, inside]);

      expect(outcome).toMatchObject({ moved: 1, failed: 0, pending: { count: 1, folder: root } });
      expect(repo.get(inside.id)?.path).toBe(path.join(root, `inside (${inside.id})`, 'inside.cbz'));
      expect(repo.get(outside.id)?.path).toBe(outside.path);
    });

    it('counts the comics as failed, and offers nothing, when the organized folder is unreachable', async () => {
      const source = await folderWith(['a.cbz']);
      configure('ask', path.join(source, 'unplugged'));
      const added = register(path.join(source, 'a.cbz'));

      expect(await organizer.afterAdd([added])).toEqual({ moved: 0, failed: 1, pending: null });
    });
  });

  describe('organize', () => {
    it('moves the offered comics once: the token works a single time', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      configure('ask', root);
      const added = register(path.join(source, 'a.cbz'));
      const { pending } = await organizer.afterAdd([added]);

      expect(await organizer.organize(pending!.token)).toEqual({ status: 'ok', moved: 1, failed: 0 });
      expect(repo.get(added.id)?.path).toBe(path.join(root, `a (${added.id})`, 'a.cbz'));
      expect((await organizer.organize(pending!.token)).status).toBe('error');
    });

    it('refuses a token it never gave', async () => {
      configure('ask', await folderWith([]));
      expect((await organizer.organize('made-up')).status).toBe('error');
    });

    it('keeps the offer when the organized folder is not there, so it can be accepted later', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      configure('ask', root);
      const { pending } = await organizer.afterAdd([register(path.join(source, 'a.cbz'))]);

      await rm(root, { recursive: true });
      expect((await organizer.organize(pending!.token)).status).toBe('error');

      await mkdir(root);
      expect(await organizer.organize(pending!.token)).toMatchObject({ status: 'ok', moved: 1 });
    });

    it('remembers only the last 20 offers', async () => {
      const source = await folderWith(Array.from({ length: 21 }, (_, i) => `${i}.cbz`));
      configure('ask', await folderWith([]));
      const tokens: string[] = [];
      for (let i = 0; i < 21; i += 1) {
        const outcome = await organizer.afterAdd([register(path.join(source, `${i}.cbz`))]);
        tokens.push(outcome.pending!.token);
      }

      expect((await organizer.organize(tokens[0])).status).toBe('error');
      expect((await organizer.organize(tokens[20])).status).toBe('ok');
    });
  });

  describe('organizeAll and countUnorganized', () => {
    it('fail when the organization is off', async () => {
      expect((await organizer.countUnorganized()).status).toBe('error');
      expect((await organizer.organizeAll()).status).toBe('error');
    });

    it('count, then move, every comic not in place, reporting progress', async () => {
      const source = await folderWith(['a.cbz', 'b.cbz']);
      const root = await folderWith([]);
      configure('ask', root);
      register(path.join(source, 'a.cbz'));
      register(path.join(source, 'b.cbz'));

      expect(await organizer.countUnorganized()).toEqual({ status: 'ok', count: 2, folder: root });
      const progress = vi.fn();
      expect(await organizer.organizeAll(progress)).toEqual({ status: 'ok', moved: 2, failed: 0 });
      expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'done' }));
      expect(await organizer.countUnorganized()).toMatchObject({ count: 0 });
    });

    it('refuses an offer while another run holds the lock, and keeps it for later', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      configure('ask', root);
      const outcome = await organizer.afterAdd([register(path.join(source, 'a.cbz'))]);
      const token = outcome.pending!.token;

      expect(organizer.lock.tryStart('add')).toBe(true);
      expect((await organizer.organize(token)).status).toBe('error');
      organizer.lock.end();

      expect(await organizer.organize(token)).toEqual({ status: 'ok', moved: 1, failed: 0 });
      expect(organizer.lock.tryStart('add')).toBe(true);
    });

    it('refuse to start while a resynchronization holds the lock, and release it afterwards', async () => {
      configure('ask', await folderWith([]));
      expect(organizer.lock.tryStart('resync')).toBe(true);
      const refused = await organizer.organizeAll();
      expect(refused.status).toBe('error');

      organizer.lock.end();
      expect((await organizer.organizeAll()).status).toBe('ok');
      expect(organizer.lock.tryStart('resync')).toBe(true);
    });
  });

  describe('resynchronizer', () => {
    function resynchronizer() {
      return createResynchronizer(
        repo,
        folders,
        settings,
        decoder as unknown as DecoderClient,
        notify,
        imageScanner as unknown as ImageStatsScanner,
        organizer,
      );
    }

    it('adds new comics, stores the date of the run and tells the views', async () => {
      const source = await folderWith(['a.cbz', 'b.cbz']);
      folders.add(source);

      const result = await resynchronizer().run();

      expect(result).toMatchObject({ status: 'ok', added: 2, removed: 0, nfoWritten: 2, organization: NOTHING_ORGANIZED });
      expect(repo.list()).toHaveLength(2);
      expect(settings.getAll().lastResyncAt).not.toBe('');
      expect(notify).toHaveBeenCalledWith({ scope: 'library' });
      expect(imageScanner.kick).toHaveBeenCalled();
    });

    it('removes the comics whose file is gone, with their thumbnail, and refreshes the reading lists', async () => {
      const source = await folderWith(['a.cbz']);
      folders.add(source);
      const gone = register(path.join(source, 'gone.cbz'));

      const result = await resynchronizer().run();

      expect(result).toMatchObject({ status: 'ok', removed: 1 });
      expect(repo.get(gone.id)).toBeNull();
      expect(decoder.removeThumbnail).toHaveBeenCalledWith(gone.path);
      expect(notify).toHaveBeenCalledWith({ scope: 'readingLists' });
    });

    it('leaves the date and the organization alone when the app was switched to another user meanwhile', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      folders.add(source);
      configure('always', root);
      let user = 'first';
      // The user is switched while the first file is being opened.
      const switching = {
        ...decoder,
        inspect: async (...args: Parameters<typeof decoder.inspect>) => {
          user = 'second';
          return decoder.inspect(...args);
        },
      };
      const resync = createResynchronizer(
        repo,
        folders,
        settings,
        switching as unknown as DecoderClient,
        notify,
        imageScanner as unknown as ImageStatsScanner,
        organizer,
        () => user,
      );

      const result = await resync.run();

      expect(result).toMatchObject({ status: 'ok', added: 1, organization: NOTHING_ORGANIZED });
      expect(settings.getAll().lastResyncAt).toBe('');
      expect(repo.list()[0].path.startsWith(root)).toBe(false);
    });

    it('stops when cancelled: keeps what it added, stores no date and organizes nothing', async () => {
      const source = await folderWith(['a.cbz', 'b.cbz']);
      const root = await folderWith([]);
      folders.add(source);
      configure('always', root);
      let resync: ReturnType<typeof createResynchronizer> | null = null;
      // Stopped while the first file is being opened.
      const stopping = {
        ...decoder,
        inspect: async (...args: Parameters<typeof decoder.inspect>) => {
          expect(resync!.cancel()).toBe(true);
          return decoder.inspect(...args);
        },
      };
      resync = createResynchronizer(
        repo,
        folders,
        settings,
        stopping as unknown as DecoderClient,
        notify,
        imageScanner as unknown as ImageStatsScanner,
        organizer,
      );

      const result = await resync.run();

      expect(result).toMatchObject({ status: 'ok', added: 1, cancelled: true, organization: NOTHING_ORGANIZED });
      expect(settings.getAll().lastResyncAt).toBe('');
      expect(repo.list()[0].path.startsWith(root)).toBe(false);
      expect(notify).toHaveBeenCalledWith({ scope: 'library' });
      // Nothing left to stop, and the next run is free to start and complete.
      expect(resync.cancel()).toBe(false);
      expect(organizer.lock.tryStart('add')).toBe(true);
      organizer.lock.end();
    });

    it('has nothing to cancel when no run is going', () => {
      expect(resynchronizer().cancel()).toBe(false);
    });

    it('refuses to run while the lock is held, and releases it when it is done', async () => {
      organizer.lock.tryStart('organize');
      expect((await resynchronizer().run()).status).toBe('error');

      organizer.lock.end();
      expect((await resynchronizer().run()).status).toBe('ok');
      expect(organizer.lock.tryStart('organize')).toBe(true);
    });

    it('hands the comics it added to the organizer, which moves them with "always"', async () => {
      const source = await folderWith(['a.cbz']);
      const root = await folderWith([]);
      folders.add(source);
      configure('always', root);

      const result = await resynchronizer().run();

      expect(result).toMatchObject({ status: 'ok', added: 1, organization: { moved: 1 } });
      expect(repo.list()[0].path.startsWith(root)).toBe(true);
    });
  });
});
