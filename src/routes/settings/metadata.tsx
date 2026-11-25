import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingCheckbox } from '@/components/setting-checkbox';
import { SettingsSection } from '@/components/settings-section';
import { useSettings } from '@/hooks/use-settings';
import type { ApiKeys, ApiKeySetting } from '@/shared/settings';

export const Route = createFileRoute('/settings/metadata')({
  component: MetadataSettingsPage,
});

const KEY_INPUT_CLASS = 'w-full max-w-md rounded-md border bg-background px-3 py-1.5 font-mono text-sm';

function MetadataSettingsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'metadata' });
  const { settings, update } = useSettings();
  // The keys aren't part of the settings every view loads: this page asks for them on its own.
  const [apiKeys, setApiKeys] = useState<ApiKeys | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.tankobon.settings.getApiKeys().then((keys) => {
      if (!cancelled) setApiKeys(keys);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateApiKey = (key: ApiKeySetting, value: string) => {
    setApiKeys((keys) => (keys ? { ...keys, [key]: value } : keys));
    void window.tankobon.settings.set(key, value);
  };

  return (
    <>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>

      <SettingsSection title={t('comicVine')}>
        <SettingCheckbox
          label={t('comicVineEnable')}
          checked={settings.comicVineEnabled}
          onChange={(checked) => update('comicVineEnabled', checked)}
        />
        <ApiKeyInput
          id="comic-vine-key"
          label={t('comicVineKey')}
          value={apiKeys?.comicVineApiKey ?? ''}
          disabled={apiKeys === null}
          settingKey="comicVineApiKey"
          update={updateApiKey}
        />
        <p className="text-sm text-muted-foreground">{t('comicVineHint')}</p>
      </SettingsSection>

      <SettingsSection title={t('googleBooks')}>
        <SettingCheckbox
          label={t('googleBooksEnable')}
          checked={settings.googleBooksEnabled}
          onChange={(checked) => update('googleBooksEnabled', checked)}
        />
        <ApiKeyInput
          id="google-books-key"
          label={t('googleBooksKey')}
          value={apiKeys?.googleBooksApiKey ?? ''}
          disabled={apiKeys === null}
          settingKey="googleBooksApiKey"
          update={updateApiKey}
        />
        <p className="text-sm text-muted-foreground">{t('googleBooksHint')}</p>
      </SettingsSection>

      <SettingsSection title={t('bedetheque')}>
        <SettingCheckbox
          label={t('bedethequeDefault')}
          checked={settings.bedethequeSearchByDefault}
          onChange={(checked) => update('bedethequeSearchByDefault', checked)}
        />
        <p className="text-sm text-muted-foreground">{t('bedethequeHint')}</p>
      </SettingsSection>
    </>
  );
}

function ApiKeyInput({
  id,
  label,
  value,
  disabled,
  settingKey,
  update,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  settingKey: ApiKeySetting;
  update: (key: ApiKeySetting, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className={KEY_INPUT_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => update(settingKey, event.target.value.trim())}
      />
    </div>
  );
}
