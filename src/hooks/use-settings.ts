/**
 * App settings as React state.
 * @module
 */
import { useCallback, useSyncExternalStore } from 'react';

import { appData } from '@/lib/app-data';
import { isDarkTheme } from '@/lib/theme';
import { applyLanguage, type Language, type LanguageSetting, resolveLanguage } from '@/shared/i18n';
import type { AppSettings, PublicSettings } from '@/shared/settings';

/** The OS's preferred languages, from the main process (see {@link loadSystemLanguages}). */
let systemLanguages: readonly string[] = navigator.languages;

/**
 * Fetches the OS's preferred languages from the main process, so the `system` setting resolves to
 * the same language on both sides. Until then (or if it fails), `navigator.languages` stands in.
 */
export async function loadSystemLanguages(): Promise<void> {
  try {
    systemLanguages = await window.skeudenn.app.getSystemLanguages();
  } catch {
    // Keeps `navigator.languages`.
  }
}

/** The language the `system` setting currently stands for. */
export function systemLanguage(): Language {
  return resolveLanguage('system', systemLanguages);
}

/**
 * Switches the renderer to the language the `language` setting resolves to (the OS's for
 * `system`), and sets `<html lang>` to match. Components using `useTranslation()` re-render on
 * their own.
 */
export function applyInterfaceLanguage(setting: LanguageSetting): void {
  const language = resolveLanguage(setting, systemLanguages);
  applyLanguage(language);
  document.documentElement.lang = language;
}

/**
 * Keeps the interface language on the `language` setting from now on, whoever changes it (the
 * picker, a data import). The first application is the caller's, before the first render.
 */
export function keepInterfaceLanguageInSync(): void {
  let applied = appData.getSettings().language;
  appData.subscribe('settings', () => {
    const { language } = appData.getSettings();
    if (language === applied) return;
    applied = language;
    applyInterfaceLanguage(language);
  });
}

/**
 * Applies the `theme` setting from now on: toggles the `dark` class of `<html>` (the design tokens
 * of `index.css`) and follows the OS scheme while the setting is `system`. Call it before the first
 * render so the UI never shows up in the wrong scheme.
 */
export function keepThemeInSync(): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const dark = isDarkTheme(appData.getSettings().theme, media.matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  };
  apply();
  media.addEventListener('change', apply);
  appData.subscribe('settings', apply);
}

const subscribe = (listener: () => void) => appData.subscribe('settings', listener);

/** The app settings, shared by every component, and the function that changes one. */
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, appData.getSettings);

  const update = useCallback(<K extends keyof PublicSettings>(key: K, value: AppSettings[K] & PublicSettings[K]) => {
    // A refused write is rolled back by the store; nothing more to show here.
    void appData.updateSetting(key, value, () => window.skeudenn.settings.set(key, value)).catch(() => undefined);
  }, []);

  return {
    settings,
    /** Updates one setting in every view immediately and persists it in the background. */
    update,
  };
}
