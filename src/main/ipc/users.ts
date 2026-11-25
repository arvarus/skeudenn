import { readFile, stat } from 'node:fs/promises';

import { t } from '../../shared/i18n';
import {
  MAX_AVATAR_BYTES,
  MAX_AVATAR_SOURCE_BYTES,
  MAX_NICKNAME_LENGTH,
  avatarType,
  type PickAvatarResult,
  type UserResult,
  type UsersState,
} from '../../shared/users';
import { errorText } from '../../shared/errors';
import type { SettingsRepository } from '../db/settings-repository';
import type { UserRepository } from '../db/user-repository';
import { applyMainLanguage } from '../language';
import type { NotifyDataChange } from './data-changes';
import { openDialogFor } from './dialogs';
import { handle } from './handle';
import { args, expectBytes, expectString, idArg } from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const USER_CHANNELS = {
  list: 'users:list',
  create: 'users:create',
  switch: 'users:switch',
  rename: 'users:rename',
  pickAvatar: 'users:pick-avatar',
  setAvatar: 'users:set-avatar',
  removeAvatar: 'users:remove-avatar',
  remove: 'users:remove',
} as const;

const nicknameArg = (value: unknown) => expectString(value, 'nickname', MAX_NICKNAME_LENGTH * 4);

/**
 * The users: listing, adding, switching, and editing the profile of the active user (nobody edits
 * another user's nickname or picture). Every write announces `users`, which makes every window reload
 * what is personal when the active user changed.
 */
export function registerUserIpc(users: UserRepository, settings: SettingsRepository, notify: NotifyDataChange): void {
  const state = (): UsersState => ({ users: users.list(), activeId: users.activeId() });
  const written = (result: UserResult): UserResult => {
    if (result.status === 'ok') notify({ scope: 'users' });
    return result;
  };

  handle(USER_CHANNELS.list, args(), state);

  handle(USER_CHANNELS.create, args(nicknameArg), (_event, nickname) => written(users.create(nickname)));

  handle(USER_CHANNELS.switch, args(idArg), (_event, id): UserResult => {
    if (!users.switchTo(id)) return { status: 'error', message: t('errors:users.notFound') };
    // The language is a personal setting: the main process's messages follow the new user's.
    applyMainLanguage(settings.getAll().language);
    const user = users.get(id);
    notify({ scope: 'users' });
    return user ? { status: 'ok', user } : { status: 'error', message: t('errors:users.notFound') };
  });

  handle(USER_CHANNELS.rename, args(nicknameArg), (_event, nickname) =>
    written(users.rename(users.activeId(), nickname)),
  );

  // The renderer never names a path: the picture is picked in a native dialog, read here, and sent
  // back to the renderer to be shrunk (a few tens of kilobytes) before `users:set-avatar` stores it.
  handle(USER_CHANNELS.pickAvatar, args(), async (event): Promise<PickAvatarResult> => {
    const { canceled, filePaths } = await openDialogFor(event, {
      title: t('dialogs:pickAvatar'),
      properties: ['openFile'],
      filters: [{ name: t('dialogs:imageFiles'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (canceled || filePaths.length === 0) return { status: 'cancelled' };
    try {
      if ((await stat(filePaths[0])).size > MAX_AVATAR_SOURCE_BYTES) {
        return { status: 'error', message: t('errors:users.avatarTooLarge') };
      }
      const bytes = new Uint8Array(await readFile(filePaths[0]));
      if (!avatarType(bytes)) return { status: 'error', message: t('errors:users.avatarFormat') };
      return { status: 'ok', bytes };
    } catch (error) {
      return {
        status: 'error',
        message: t('errors:users.avatarUnreadable', { message: errorText(error) }),
      };
    }
  });

  handle(
    USER_CHANNELS.setAvatar,
    args((value) => expectBytes(value, 'avatar', MAX_AVATAR_BYTES)),
    (_event, bytes) => written(users.setAvatar(users.activeId(), bytes)),
  );

  handle(USER_CHANNELS.removeAvatar, args(), () => written(users.setAvatar(users.activeId(), null)));

  // Only the active user can be deleted (like the other profile edits); the app then moves to
  // another user, so the language follows as for a switch.
  handle(USER_CHANNELS.remove, args(), (): UserResult => {
    const result = users.remove(users.activeId());
    if (result.status === 'ok') applyMainLanguage(settings.getAll().language);
    return written(result);
  });
}
