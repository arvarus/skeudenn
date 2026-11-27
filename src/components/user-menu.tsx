import { useNavigate } from '@tanstack/react-router';
import { Check, Plus, UserPen } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NewUserDialog } from '@/components/new-user-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { useActiveUser, useUsers } from '@/hooks/use-users';
import { cn } from '@/lib/utils';

const itemClass =
  'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground';

/**
 * The sidebar's user button: the active user's picture (or their nickname beside it), opening a menu
 * to switch to another user, add one, or edit one's own profile. Switching returns to the start page,
 * since what the current page shows (a book being read, a list) belongs to the previous user.
 */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('users', { keyPrefix: 'menu' });
  const state = useUsers();
  const active = useActiveUser();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);

  if (!state || !active) return null;

  const switchTo = async (id: string) => {
    const result = await window.skeudenn.users.switch(id).catch(() => null);
    if (result?.status === 'ok') void navigate({ to: '/' });
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-md py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center px-1' : 'px-2',
            )}
            aria-label={t('label', { nickname: active.nickname })}
            title={collapsed ? active.nickname : undefined}
          >
            <UserAvatar user={active} className="size-7" />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{active.nickname}</span>}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="top"
            align="start"
            sideOffset={6}
            className="z-50 min-w-56 rounded-md border bg-background p-1 text-foreground shadow-md"
          >
            <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">{t('heading')}</DropdownMenu.Label>
            {state.users.map((user) =>
              user.id === state.activeId ? (
                // The current user's own entry leads to their profile.
                <DropdownMenu.Item
                  key={user.id}
                  className={itemClass}
                  onSelect={() => void navigate({ to: '/profile' })}
                  title={t('editProfile')}
                >
                  <UserAvatar user={user} className="size-6" />
                  <span className="min-w-0 flex-1 truncate font-medium">{user.nickname}</span>
                  <Check className="size-4" aria-label={t('current')} />
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item key={user.id} className={itemClass} onSelect={() => void switchTo(user.id)}>
                  <UserAvatar user={user} className="size-6" />
                  <span className="min-w-0 flex-1 truncate" title={t('switchTo', { nickname: user.nickname })}>
                    {user.nickname}
                  </span>
                </DropdownMenu.Item>
              ),
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item className={itemClass} onSelect={() => void navigate({ to: '/profile' })}>
              <UserPen className="size-4" />
              {t('editProfile')}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={() => setAdding(true)}>
              <Plus className="size-4" />
              {t('add')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <NewUserDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}
