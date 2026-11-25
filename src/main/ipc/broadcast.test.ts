import { describe, expect, it, vi } from 'vitest';

const getAllWindows = vi.fn();
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => getAllWindows() } }));

import { broadcast } from './broadcast';

function fakeWindow(windowDestroyed = false, contentsDestroyed = false) {
  const send = vi.fn();
  return {
    send,
    window: {
      isDestroyed: () => windowDestroyed,
      webContents: { isDestroyed: () => contentsDestroyed, send },
    },
  };
}

describe('broadcast', () => {
  it('sends the channel and its arguments to every live window', () => {
    const first = fakeWindow();
    const second = fakeWindow();
    getAllWindows.mockReturnValue([first.window, second.window]);

    broadcast('data:changed', { scope: 'library' }, 2);

    expect(first.send).toHaveBeenCalledWith('data:changed', { scope: 'library' }, 2);
    expect(second.send).toHaveBeenCalledWith('data:changed', { scope: 'library' }, 2);
  });

  it('sends an announcement without payload', () => {
    const only = fakeWindow();
    getAllWindows.mockReturnValue([only.window]);

    broadcast('app:launch-file');

    expect(only.send).toHaveBeenCalledWith('app:launch-file');
  });

  it('skips a window being closed', () => {
    const closed = fakeWindow(true);
    const contentsGone = fakeWindow(false, true);
    const live = fakeWindow();
    getAllWindows.mockReturnValue([closed.window, contentsGone.window, live.window]);

    broadcast('library:scan-progress', {});

    expect(closed.send).not.toHaveBeenCalled();
    expect(contentsGone.send).not.toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledOnce();
  });
});
