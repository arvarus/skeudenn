// @vitest-environment jsdom
// The leading `-` keeps the router plugin from taking this file for a route.
import { installSkeudenn, renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appData } from '@/lib/app-data';
import { DEFAULT_SETTINGS, toPublicSettings } from '@/shared/settings';
import { Route } from './__root';

vi.mock('@tanstack/react-router', () => ({
  createRootRoute: (options: object) => ({ options }),
  Outlet: () => null,
}));
// The layout's own children are not under test: only the keys of what it renders.
vi.mock('@/components/layout/image-scan-bar', () => ({ ImageScanBar: () => null }));
vi.mock('@/components/layout/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/user-chooser', () => ({ UserChooser: () => null }));
vi.mock('@/components/update-toast', () => ({ UpdateToast: () => null }));
vi.mock('@/components/achievement-toasts', () => ({ AchievementToasts: () => null }));
vi.mock('@/hooks/use-achievements', () => ({ useAchievementTracker: () => undefined }));
vi.mock('@/hooks/use-launch-file', () => ({ useLaunchFile: () => undefined }));
vi.mock('@/hooks/use-scroll-to-top-on-navigation', () => ({ useScrollToTopOnNavigation: () => undefined }));
vi.mock('@/hooks/use-fullscreen', () => ({ useFullscreen: () => ({ fullscreen: false }) }));

afterEach(cleanup);

describe('root layout', () => {
  it('renders the per-user achievement parts without two children sharing a key', async () => {
    const fake = {
      settings: { getAll: () => Promise.resolve(toPublicSettings(DEFAULT_SETTINGS)) },
      library: { list: () => Promise.resolve([]) },
      readingLists: { list: () => Promise.resolve([]) },
      achievements: { list: () => Promise.resolve([]) },
      users: {
        list: () => Promise.resolve({ users: [{ id: 'default', nickname: 'Anne', avatar: null, avatarType: null }], activeId: 'default' }),
      },
    };
    installSkeudenn(fake);
    appData.start();
    await appData.ready;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const RootLayout = Route.options.component as () => React.ReactNode;

    renderWithSkeudenn(<RootLayout />, fake);

    expect(errors.mock.calls.map((call) => String(call[0]))).not.toContainEqual(expect.stringContaining('same key'));
    errors.mockRestore();
  });
});
