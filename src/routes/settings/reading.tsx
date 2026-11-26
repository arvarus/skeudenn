import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { SettingCheckbox } from '@/components/setting-checkbox';
import { SETTINGS_SELECT_CLASS, SettingsSection } from '@/components/settings-section';
import { useSettings } from '@/hooks/use-settings';

export const Route = createFileRoute('/settings/reading')({
  component: ReadingSettingsPage,
});

function ReadingSettingsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'reading' });
  const { settings, update } = useSettings();

  return (
    <>
      <SettingsSection title={t('direction')} htmlFor="reading-direction">
        <select
          id="reading-direction"
          className={SETTINGS_SELECT_CLASS}
          value={settings.readingDirection}
          onChange={(event) => update('readingDirection', event.target.value as 'ltr' | 'rtl')}
        >
          <option value="ltr">{t('ltr')}</option>
          <option value="rtl">{t('rtl')}</option>
        </select>
      </SettingsSection>

      <SettingsSection title={t('scroll')} htmlFor="scroll-direction">
        <select
          id="scroll-direction"
          className={SETTINGS_SELECT_CLASS}
          value={settings.scrollDirection}
          onChange={(event) => update('scrollDirection', event.target.value as 'standard' | 'inverted')}
        >
          <option value="standard">{t('scrollStandard')}</option>
          <option value="inverted">{t('scrollInverted')}</option>
        </select>
      </SettingsSection>

      <SettingsSection title={t('mode')} htmlFor="reading-mode">
        <select
          id="reading-mode"
          className={SETTINGS_SELECT_CLASS}
          value={settings.readingMode}
          onChange={(event) => update('readingMode', event.target.value as 'single' | 'continuous' | 'book')}
        >
          <option value="single">{t('modeSingle')}</option>
          <option value="continuous">{t('modeContinuous')}</option>
          <option value="book">{t('modeBook')}</option>
        </select>

        {settings.readingMode === 'continuous' && (
          <div className="flex items-center gap-2 pt-1">
            <label htmlFor="page-spacing" className="text-sm text-muted-foreground">
              {t('pageSpacing')}
            </label>
            <input
              id="page-spacing"
              type="number"
              min={0}
              step={4}
              className="w-20 rounded-md border bg-background px-3 py-1.5 text-sm"
              value={settings.pageSpacing}
              onChange={(event) => update('pageSpacing', Math.max(0, Number(event.target.value) || 0))}
            />
            <span className="text-sm text-muted-foreground">{t('pixels')}</span>
          </div>
        )}

        {settings.readingMode === 'book' && (
          <SettingCheckbox
            label={t('bookCoverAlone')}
            hint={t('bookCoverAloneHint')}
            checked={settings.bookCoverAlone}
            onChange={(checked) => update('bookCoverAlone', checked)}
          />
        )}
      </SettingsSection>

      <SettingsSection title={t('autoAdd')}>
        <SettingCheckbox
          label={t('autoAddLabel')}
          hint={t('autoAddHint')}
          checked={settings.addOpenedBooksToLibrary}
          onChange={(checked) => update('addOpenedBooksToLibrary', checked)}
        />
      </SettingsSection>
    </>
  );
}
