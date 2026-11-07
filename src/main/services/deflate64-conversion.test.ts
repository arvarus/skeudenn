import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { createDeflate64Converter, type Deflate64Decoder } from './deflate64-conversion';
import { createLibraryRunLock } from './library-organization';

applyLanguage('fr');

describe('createDeflate64Converter', () => {
  let dir: string;
  let repo: LibraryRepository;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-deflate64-conversion-'));
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function addBook(name: string): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, 'data');
    repo.register(file, name, 3, 4, 4);
    return file;
  }

  function setup(broken: string[] = []) {
    const notify = vi.fn();
    const decoder: Deflate64Decoder = {
      hasDeflate64: vi.fn(async (file: string) => file.includes('d64')),
      convertDeflate64: vi.fn(async (file: string) => {
        if (broken.includes(file)) throw new Error('nope');
        return { fileCount: 7 };
      }),
      removeThumbnail: vi.fn(async () => undefined),
    };
    const lock = createLibraryRunLock();
    return { converter: createDeflate64Converter(repo, decoder, notify, lock), decoder, notify, lock };
  }

  it('counts only the CBZ that use Deflate64', async () => {
    await addBook('a-d64.cbz');
    await addBook('b.cbz');
    await addBook('c-d64.cbr');
    const { converter, decoder } = setup();
    expect(await converter.count()).toEqual({ status: 'ok', count: 1 });
    expect(decoder.hasDeflate64).toHaveBeenCalledTimes(2);
  });

  it('rewrites them in place, updates the entry and notifies', async () => {
    const file = await addBook('a-d64.cbz');
    await addBook('b.cbz');
    const { converter, decoder, notify, lock } = setup();
    expect(await converter.convert()).toEqual({ status: 'ok', converted: 1, failed: 0 });
    expect(decoder.convertDeflate64).toHaveBeenCalledWith(file);
    expect(repo.get(repo.idOfPath(file)!)?.fileCount).toBe(7);
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(lock.tryStart('convert')).toBe(true);
  });

  it('counts a failed rewrite and leaves the entry alone', async () => {
    const file = await addBook('a-d64.cbz');
    const { converter, notify } = setup([file]);
    expect(await converter.convert()).toEqual({ status: 'ok', converted: 0, failed: 1 });
    expect(repo.get(repo.idOfPath(file)!)?.fileCount).toBe(4);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses to run while another run holds the lock', async () => {
    await addBook('a-d64.cbz');
    const { converter, lock } = setup();
    lock.tryStart('resync');
    const result = await converter.convert();
    expect(result.status).toBe('error');
  });
});
