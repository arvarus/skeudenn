import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, ...raw: unknown[]) => unknown>();
const showOpenDialog = vi.fn();
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...raw: unknown[]) => unknown) => handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: (options: unknown) => showOpenDialog(options) },
  app: { getPreferredSystemLanguages: () => ['en'] },
}));

import type { ClearLibraryResult, ImportResult } from '../../shared/data';
import { applyLanguage } from '../../shared/i18n';
import { buildExport } from '../db/export-service';
import { LibraryRepository } from '../db/library-repository';
import { ReadingListRepository } from '../db/reading-list-repository';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import type { DecoderClient } from '../decoder/decoder-client';
import type { ImageStatsScanner } from '../services/image-stats-scanner';
import { createLibraryRunLock, type LibraryRunLock } from '../services/library-organization';
import { DATA_CHANNELS, registerDataIpc } from './data';

const BOOK = path.resolve('/comics/book.cbz');

describe('data:clear-library and data:import', () => {
  const decoder = {
    pruneThumbnails: vi.fn(async () => undefined),
    rebuildThumbnails: vi.fn(async () => undefined),
    setSidecarCovers: vi.fn(),
  };
  const notify = vi.fn();
  let library: LibraryRepository;
  let lock: LibraryRunLock;
  let dir: string;
  let exportFile: string;

  beforeEach(() => {
    applyLanguage('en');
    handlers.clear();
    vi.clearAllMocks();
    const db = new DatabaseSync(':memory:');
    migrate(db);
    library = new LibraryRepository(db);
    const settings = new SettingsRepository(db);
    const lists = new ReadingListRepository(db);
    library.register(BOOK, 'book', 3, 3, 1);
    lock = createLibraryRunLock();
    registerDataIpc({
      db,
      libraryRepo: library,
      settingsRepo: settings,
      readingListRepo: lists,
      decoder: decoder as unknown as DecoderClient,
      notify,
      imageScanner: { kick: vi.fn() } as unknown as ImageStatsScanner,
      lock,
    });

    dir = mkdtempSync(path.join(tmpdir(), 'data-ipc-'));
    exportFile = path.join(dir, 'export.json');
    writeFileSync(exportFile, JSON.stringify(buildExport(library, settings, lists)));
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [exportFile] });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const clear = () => handlers.get(DATA_CHANNELS.clearLibrary)!({}) as Promise<ClearLibraryResult>;
  const importData = () => handlers.get(DATA_CHANNELS.import)!({ sender: {} }) as Promise<ImportResult>;

  it('refuses to clear the library while another run holds the lock', async () => {
    lock.tryStart('resync');

    expect(await clear()).toEqual({ status: 'error', message: 'A resynchronization is already running.' });
    expect(library.list()).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
    expect(decoder.pruneThumbnails).not.toHaveBeenCalled();
  });

  it('clears the library and releases the lock', async () => {
    expect(await clear()).toEqual({ status: 'cleared', entries: 1, readingLists: 0 });
    expect(library.list()).toHaveLength(0);
    expect(lock.tryStart('resync')).not.toBeNull();
  });

  it('releases the lock when the clearing fails', async () => {
    decoder.pruneThumbnails.mockRejectedValueOnce(new Error('boom'));

    expect((await clear()).status).toBe('error');
    expect(lock.tryStart('resync')).not.toBeNull();
  });

  it('holds the lock while clearing, so another run is refused with the data message', async () => {
    let busy: string | null = null;
    decoder.pruneThumbnails.mockImplementationOnce(async () => {
      busy = lock.tryStart('resync') ? null : lock.busyMessage();
    });

    await clear();
    expect(busy).toBe('The library is being cleared or imported.');
  });

  it('refuses to import while another run holds the lock, after the dialog was answered', async () => {
    lock.tryStart('organize');
    library.clear();

    const result = await importData();
    expect(result.status).toBe('error');
    expect(showOpenDialog).toHaveBeenCalledOnce();
    expect(library.list()).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('imports and releases the lock', async () => {
    library.clear();

    expect(await importData()).toEqual({ status: 'imported', filePath: exportFile, added: 1, updated: 0 });
    expect(library.list()).toHaveLength(1);
    expect(lock.tryStart('resync')).not.toBeNull();
  });

  it('releases the lock when the import fails', async () => {
    writeFileSync(exportFile, 'not json');

    expect((await importData()).status).toBe('error');
    expect(lock.tryStart('resync')).not.toBeNull();
  });

  it('takes no lock when the dialog is cancelled', async () => {
    lock.tryStart('resync');
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });

    expect(await importData()).toEqual({ status: 'cancelled' });
  });
});
