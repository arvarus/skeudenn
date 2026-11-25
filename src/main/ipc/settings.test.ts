import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, ...raw: unknown[]) => unknown>();
vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: () => [] },
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...raw: unknown[]) => unknown) => handlers.set(channel, fn) },
}));

import { MAIN_PROCESS_SETTINGS } from '../../shared/settings';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import type { DecoderClient } from '../decoder/decoder-client';
import { SETTINGS_CHANNELS, registerSettingsIpc } from './settings';

describe('settings:set', () => {
  const notify = vi.fn();
  let repo: SettingsRepository;

  beforeEach(() => {
    handlers.clear();
    notify.mockClear();
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new SettingsRepository(db);
    registerSettingsIpc(repo, notify, { setSidecarCovers: vi.fn() } as unknown as DecoderClient);
  });

  const set = async (key: unknown, value: unknown) => handlers.get(SETTINGS_CHANNELS.set)?.({}, key, value);

  it('writes a setting the renderer may write and notifies it', async () => {
    await set('readerBackground', '#ffffff');

    expect(repo.getAll().readerBackground).toBe('#ffffff');
    expect(notify).toHaveBeenCalledWith({ scope: 'settings', values: { readerBackground: '#ffffff' } });
  });

  // The folder dialog stats `lastScanFolder`: a network path would send the user's credentials to that host.
  it.each(MAIN_PROCESS_SETTINGS)('refuses %s, which only the main process writes', async (key) => {
    const before = repo.getAll()[key];

    await expect(set(key, '\\\\host\\share')).rejects.toThrow();

    expect(repo.getAll()[key]).toBe(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it('counts lastScanFolder among the settings only the main process writes', () => {
    expect(MAIN_PROCESS_SETTINGS).toContain('lastScanFolder');
  });
});
