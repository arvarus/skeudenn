/**
 * The achievements earned, as React state, and the trackers that earn them.
 * @module
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useLibrary } from '@/hooks/use-library';
import { useSettledValue } from '@/hooks/use-settled-value';
import { useReadingLists } from '@/hooks/use-reading-lists';
import { useSettings } from '@/hooks/use-settings';
import { appData } from '@/lib/app-data';
import { computeStats, earnedFromStats, eventAchievements, type AchievementStats } from '@/lib/achievements';
import type { UnlockedAchievement } from '@/shared/achievements';

const subscribe = (listener: () => void) => appData.subscribe('achievements', listener);

/** The achievements earned, the earliest first; `null` until the first load. */
export function useAchievements(): UnlockedAchievement[] | null {
  return useSyncExternalStore(subscribe, appData.getAchievements);
}

/**
 * How long the library has to stay unchanged before the rules count it again. Every page turned in
 * the reader saves the progress and so replaces the library; counting 20 000 books (about 25 ms) and
 * asking the main process for the folders at each of them would cost a hiccup per page for nothing,
 * since no achievement is time-critical.
 */
const SETTLE_MS = 1000;

/** What the rules count, or `null` while the library, the reading lists or the folders are loading. */
export function useAchievementStats(): AchievementStats | null {
  const library = useSettledValue(useLibrary(), SETTLE_MS);
  const lists = useReadingLists();
  const [folders, setFolders] = useState<number | null>(null);

  // A folder can only be added together with a library change (the scan), so the library is the trigger.
  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.library
      .listFolders()
      .then((list) => {
        if (!cancelled) setFolders(list.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [library]);

  return useMemo(
    () => (library && lists && folders !== null ? computeStats(library, lists, folders) : null),
    [library, lists, folders],
  );
}

/**
 * Earns the achievements the library, the reading lists and the folders now justify. Mounted
 * once, in the root layout; the main process remembers them and announces the new ones.
 */
export function useAchievementTracker(): void {
  const stats = useAchievementStats();
  const earned = useAchievements();

  useEffect(() => {
    if (!stats || !earned) return;
    const known = new Set(earned.map((achievement) => achievement.id));
    const fresh = earnedFromStats(stats).filter((id) => !known.has(id));
    if (fresh.length > 0) void window.skeudenn.achievements.unlock(fresh).catch(() => undefined);
  }, [stats, earned]);
}

/** Earns the achievements of opening a book now (at night, early, right to left); `bookId` changes with each book opened. */
export function useOpeningAchievements(bookId: string | null): void {
  const { settings } = useSettings();
  const direction = settings.readingDirection;
  const enabled = settings.achievementsEnabled;

  useEffect(() => {
    if (!bookId || !enabled) return;
    const ids = eventAchievements({ at: new Date(), direction });
    if (ids.length > 0) void window.skeudenn.achievements.unlock(ids).catch(() => undefined);
    // Only a new book counts: a change of direction while reading isn't an opening.
  }, [bookId]);
}
