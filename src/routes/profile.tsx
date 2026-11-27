import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { useActiveUser, useUsers } from '@/hooks/use-users';
import { shrinkAvatar } from '@/lib/avatar';
import { formatDuration } from '@/lib/reading-stats';
import type { ReadingHistoryEntry } from '@/shared/stats';
import { MAX_NICKNAME_LENGTH, type UserProfile } from '@/shared/users';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  const user = useActiveUser();
  // Keyed by user: a switch of user starts the form again, with no leftover message.
  return user ? <ProfileForm key={user.id} user={user} /> : null;
}

function ProfileForm({ user }: { user: UserProfile }) {
  const { t } = useTranslation('users', { keyPrefix: 'profile' });
  const [nickname, setNickname] = useState(user.nickname);
  const [storedNickname, setStoredNickname] = useState(user.nickname);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const canDelete = (useUsers()?.users.length ?? 0) > 1;

  // The field follows the stored nickname when it changes elsewhere (another window).
  if (storedNickname !== user.nickname) {
    setStoredNickname(user.nickname);
    setNickname(user.nickname);
  }

  const saveNickname = async () => {
    setBusy(true);
    try {
      const result = await window.skeudenn.users.rename(nickname);
      setMessage(result.status === 'ok' ? { kind: 'ok', text: t('saved') } : { kind: 'error', text: result.message });
    } finally {
      setBusy(false);
    }
  };

  const chooseImage = async () => {
    setBusy(true);
    try {
      const picked = await window.skeudenn.users.pickAvatar();
      if (picked.status === 'cancelled') return;
      if (picked.status === 'error') {
        setMessage({ kind: 'error', text: picked.message });
        return;
      }
      let small: Uint8Array;
      try {
        small = await shrinkAvatar(picked.bytes);
      } catch {
        setMessage({ kind: 'error', text: t('imageError') });
        return;
      }
      const result = await window.skeudenn.users.setAvatar(small);
      setMessage(result.status === 'ok' ? { kind: 'ok', text: t('saved') } : { kind: 'error', text: result.message });
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      await window.skeudenn.users.removeAvatar();
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async () => {
    const confirmed = await confirm({
      title: t('deleteTitle', { nickname: user.nickname }),
      message: t('deleteMessage'),
      action: t('deleteAction'),
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await window.skeudenn.users.remove();
      if (result.status === 'error') setMessage({ kind: 'error', text: result.message });
      // The app is now on another user: the page shown belonged to the deleted one.
      else void navigate({ to: '/' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <section className="flex items-center gap-4">
        <UserAvatar user={user} className="size-24" />
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('picture')}</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void chooseImage()}>
              {t('chooseImage')}
            </Button>
            {user.avatar && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void removeImage()}>
                {t('removeImage')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void saveNickname();
        }}
      >
        <label htmlFor="nickname" className="text-sm font-medium">
          {t('nickname')}
        </label>
        <div className="flex gap-2">
          <input
            id="nickname"
            value={nickname}
            maxLength={MAX_NICKNAME_LENGTH}
            onChange={(event) => setNickname(event.target.value)}
            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <Button type="submit" disabled={busy || nickname.trim() === '' || nickname.trim() === user.nickname}>
            {t('save')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('nicknameHint')}</p>
      </form>

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {message.text}
        </p>
      )}

      <ReadingHistory />

      <p className="text-sm text-muted-foreground">{t('shared')}</p>
      <p className="text-sm text-muted-foreground">{t('sharedSettings')}</p>

      <section className="flex flex-col items-start gap-2 border-t pt-4">
        <Button variant="destructive" size="sm" disabled={busy || !canDelete} onClick={() => void deleteUser()}>
          {t('deleteButton')}
        </Button>
        {!canDelete && <p className="text-sm text-muted-foreground">{t('deleteOnlyUser')}</p>}
      </section>
      {confirmDialog}
    </div>
  );
}

function ReadingHistory() {
  const { t } = useTranslation('users', { keyPrefix: 'profile.history' });
  const { confirm, dialog } = useConfirm();
  const [entries, setEntries] = useState<ReadingHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.stats.history().then((history) => {
      if (!cancelled) setEntries(history);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = async () => {
    const confirmed = await confirm({
      title: t('confirmTitle'),
      message: t('confirmMessage'),
      action: t('confirmAction'),
    });
    if (!confirmed) return;
    await window.skeudenn.stats.clearHistory();
    setEntries([]);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('title')}</h2>
        {entries && entries.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => void clear()}>
            {t('clear')}
          </Button>
        )}
      </div>
      {entries?.length === 0 && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
      {entries && entries.length > 0 && (
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border text-sm">
          {entries.map((entry) => (
            <li key={`${entry.day}:${entry.libraryId}`} className="flex items-baseline gap-3 px-3 py-2">
              <span className="w-24 shrink-0 text-muted-foreground">{entry.day}</span>
              <span className={entry.title ? 'flex-1 truncate' : 'flex-1 truncate italic text-muted-foreground'}>
                {entry.title ?? t('removedBook')}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatDuration(entry.seconds)}</span>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </section>
  );
}
