import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { LanguageFlag } from '@/components/language-flag';
import { SettingCheckbox } from '@/components/setting-checkbox';
import { SETTINGS_SELECT_CLASS, SettingsSection } from '@/components/settings-section';
import { systemLanguage, useSettings } from '@/hooks/use-settings';
import { cn } from '@/lib/utils';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type LanguageSetting } from '@/shared/i18n';
import { READER_BACKGROUND_PRESETS, THEME_SETTINGS, type ThemeSetting } from '@/shared/settings';

const THEME_LABELS = { system: 'themeSystem', light: 'themeLight', dark: 'themeDark' } as const;

export const Route = createFileRoute('/settings/appearance')({
  component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'appearance' });
  const { settings, update } = useSettings();

  return (
    <>
    <SettingsSection title={t('language')} htmlFor="language">
      <div className="flex items-center gap-2">
      <LanguageFlag code={settings.language === 'system' ? systemLanguage() : settings.language} className="h-4" />
      <select
        id="language"
        className={SETTINGS_SELECT_CLASS}
        value={settings.language}
        onChange={(event) => update('language', event.target.value as LanguageSetting)}
      >
        <option value="system">{t('languageSystem', { language: LANGUAGE_NAMES[systemLanguage()] })}</option>
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {LANGUAGE_NAMES[language]}
          </option>
        ))}
      </select>
      </div>
      <p className="text-sm text-muted-foreground">{t('languageHint')}</p>
    </SettingsSection>

    <SettingsSection title={t('theme')} htmlFor="theme">
      <select
        id="theme"
        className={SETTINGS_SELECT_CLASS}
        value={settings.theme}
        onChange={(event) => update('theme', event.target.value as ThemeSetting)}
      >
        {THEME_SETTINGS.map((theme) => (
          <option key={theme} value={theme}>
            {t(THEME_LABELS[theme])}
          </option>
        ))}
      </select>
    </SettingsSection>

    <SettingsSection title={t('readerBackground')} htmlFor="reader-background">
      <div className="flex flex-wrap items-center gap-2">
        {READER_BACKGROUND_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={t(`backgrounds.${preset.name}`)}
            aria-label={t(`backgrounds.${preset.name}`)}
            aria-pressed={settings.readerBackground === preset.value}
            onClick={() => update('readerBackground', preset.value)}
            className={cn(
              'size-8 rounded-md border-2',
              settings.readerBackground === preset.value ? 'border-primary' : 'border-border hover:border-foreground/40',
            )}
            style={{ backgroundColor: preset.value }}
          />
        ))}
        <input
          id="reader-background"
          type="color"
          className="h-8 w-12 cursor-pointer rounded-md border bg-background"
          title={t('customColor')}
          value={settings.readerBackground}
          onChange={(event) => update('readerBackground', event.target.value)}
        />
        <span className="text-sm text-muted-foreground">{settings.readerBackground}</span>
      </div>
    </SettingsSection>

      <SettingsSection title={t('features')}>
        <SettingCheckbox
          label={t('homeEnabled')}
          checked={settings.homeEnabled}
          onChange={(checked) => update('homeEnabled', checked)}
        />
        <SettingCheckbox
          label={t('statsEnabled')}
          checked={settings.statsEnabled}
          onChange={(checked) => update('statsEnabled', checked)}
        />
        <SettingCheckbox
          label={t('achievementsEnabled')}
          checked={settings.achievementsEnabled}
          onChange={(checked) => update('achievementsEnabled', checked)}
        />
        <p className="text-sm text-muted-foreground">{t('featuresHint')}</p>
      </SettingsSection>

      <SettingsSection title={t('askUser')}>
        <SettingCheckbox
          label={t('askUserOnStartup')}
          hint={t('askUserHint')}
          checked={settings.askUserOnStartup}
          onChange={(checked) => update('askUserOnStartup', checked)}
        />
      </SettingsSection>
    </>
  );
}
