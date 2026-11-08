import { describe, expect, it, vi } from 'vitest';

import { StartupOrganization } from './startup-organization';

const offer = { moved: 0, failed: 0, pending: { token: 't', count: 2, folder: '/bd' } };

describe('StartupOrganization', () => {
  it('keeps an outcome for the first window that takes it, and says so', () => {
    const notify = vi.fn();
    const startup = new StartupOrganization(notify);

    startup.offer(offer);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(startup.take()).toEqual(offer);
    expect(startup.take()).toBeNull();
  });

  it('keeps what was moved too, but nothing when there is nothing to say', () => {
    const notify = vi.fn();
    const startup = new StartupOrganization(notify);

    startup.offer({ moved: 0, failed: 0, pending: null });
    expect(notify).not.toHaveBeenCalled();
    expect(startup.take()).toBeNull();

    startup.offer({ moved: 3, failed: 1, pending: null });
    expect(startup.take()).toEqual({ moved: 3, failed: 1, pending: null });
  });

  it('keeps only the latest', () => {
    const startup = new StartupOrganization(() => undefined);
    startup.offer({ moved: 1, failed: 0, pending: null });
    startup.offer(offer);
    expect(startup.take()).toEqual(offer);
  });
});
