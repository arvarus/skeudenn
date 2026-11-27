import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MAX_NICKNAME_LENGTH } from '@/shared/users';

/** Asks for a nickname, creates the user and switches to them (they then land on the start page). */
export function NewUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation(['users', 'common']);
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setNickname('');
      setError(null);
    }
    onOpenChange(next);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await window.skeudenn.users.create(nickname);
      if (created.status === 'error') {
        setError(created.message);
        return;
      }
      const switched = await window.skeudenn.users.switch(created.user.id);
      if (switched.status === 'error') {
        setError(switched.message);
        return;
      }
      close(false);
      void navigate({ to: '/' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('users:newUser.title')}
      description={t('users:newUser.description')}
      className="max-w-md"
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('users:newUser.nickname')}
          <input
            autoFocus
            value={nickname}
            maxLength={MAX_NICKNAME_LENGTH}
            onChange={(event) => setNickname(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" disabled={busy || nickname.trim() === ''}>
            {t('users:newUser.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
