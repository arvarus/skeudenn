import { Link } from '@tanstack/react-router';
import { Award, BarChart3, BookOpen, ChevronLeft, ChevronRight, Home, Info, Library, ListOrdered, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/utils';

import { LibrarySyncStatus } from './library-sync-status';
import { ReadingListsNav } from './reading-lists-nav';
import { SettingsNav } from './settings-nav';
import { activeLinkClass, linkClass } from './sidebar-styles';

const nav = [
  { to: '/', label: 'home', icon: Home },
  { to: '/library', label: 'library', icon: Library },
  { to: '/lists', label: 'readingLists', icon: ListOrdered },
  { to: '/authors', label: 'authors', icon: PenLine },
  { to: '/reader', label: 'reader', icon: BookOpen },
  { to: '/stats', label: 'stats', icon: BarChart3 },
  { to: '/achievements', label: 'achievements', icon: Award },
] as const;

/**
 * The navigation column: the pages, the foldable settings and reading lists, the synchronization
 * status and the user menu. `collapsed` (a setting) turns it into an icon-only rail; it is hidden
 * while the reader is fullscreen, without touching that preference.
 */
export function Sidebar() {
  const { t } = useTranslation(['nav', 'common']);
  const { settings, update } = useSettings();
  const collapsed = settings.sidebarCollapsed;
  const { fullscreen } = useFullscreen();

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-150',
        collapsed ? 'w-14 items-center' : 'w-56',
        fullscreen && 'hidden',
      )}
    >
      <div className={cn('flex items-center py-3', collapsed ? 'justify-center' : 'justify-between px-2')}>
        {!collapsed && <span className="text-lg font-semibold tracking-tight">{t('common:appName')}</span>}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => update('sidebarCollapsed', !collapsed)}
          title={collapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>
      {nav
        .filter(
          ({ to }) =>
            (to !== '/' || settings.homeEnabled) &&
            (to !== '/stats' || settings.statsEnabled) &&
            (to !== '/achievements' || settings.achievementsEnabled),
        ).map(({ to, label, icon: Icon }) =>
        to === '/lists' ? (
          <ReadingListsNav key={to} collapsed={collapsed} />
        ) : (
          <Link
          key={to}
          to={to}
          className={linkClass(collapsed)}
          activeProps={{ className: activeLinkClass }}
          activeOptions={{ exact: to === '/' }}
          title={collapsed ? t(label) : undefined}
        >
          <Icon className="size-4" />
          {!collapsed && t(label)}
        </Link>
        ),
      )}
      <SettingsNav collapsed={collapsed} />
      <Link
        to="/about"
        className={linkClass(collapsed)}
        activeProps={{ className: activeLinkClass }}
        title={collapsed ? t('about') : undefined}
      >
        <Info className="size-4" />
        {!collapsed && t('about')}
      </Link>
      <div className="mt-auto flex flex-col gap-2 pt-2">
        <LibrarySyncStatus collapsed={collapsed} />
        <UserMenu collapsed={collapsed} />
      </div>
</aside>
  );
}
