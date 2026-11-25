import { beforeEach, describe, expect, it, vi } from 'vitest';

const stat = vi.fn();
vi.mock('node:fs/promises', () => ({ stat: (...args: unknown[]) => stat(...args) }));
vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {} }));

import { existingDirectory } from './dialogs';

describe('existingDirectory', () => {
  beforeEach(() => {
    stat.mockReset();
  });

  it('keeps a directory that exists', async () => {
    stat.mockResolvedValue({ isDirectory: () => true });

    await expect(existingDirectory('/comics')).resolves.toBe('/comics');
  });

  it('drops a path that is gone or is not a directory', async () => {
    stat.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    await expect(existingDirectory('/gone')).resolves.toBeUndefined();

    stat.mockResolvedValueOnce({ isDirectory: () => false });
    await expect(existingDirectory('/comics/one.cbz')).resolves.toBeUndefined();
  });

  it('gives undefined for nothing', async () => {
    await expect(existingDirectory('')).resolves.toBeUndefined();
    await expect(existingDirectory(null)).resolves.toBeUndefined();
    expect(stat).not.toHaveBeenCalled();
  });

  // Reaching a network path makes Windows send the user's credentials to that host.
  it.each(['\\\\host\\share', '//host/share', '\\\\?\\UNC\\host\\share', '\\/host/share'])(
    'never stats the network path %s',
    async (path) => {
      stat.mockResolvedValue({ isDirectory: () => true });

      await expect(existingDirectory(path)).resolves.toBeUndefined();
      expect(stat).not.toHaveBeenCalled();
    },
  );
});
