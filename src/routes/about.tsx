import { createFileRoute } from '@tanstack/react-router';
import { BookText, Bug, Check, Code, Copy, Download, MessageCircle, RefreshCw, Scale, Tag, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';
import { formatAppInfo, type AppInfo, type AppLink, type UpdateCheckResult } from '@/shared/app';

export const Route = createFileRoute('/about')({
  component: AboutPage,
});

/** Each link's label is the `settings:about.<link>` translation. The license has its own section. */
const LINKS: { link: Exclude<AppLink, 'license'>; icon: LucideIcon }[] = [
  { link: 'documentation', icon: BookText },
  { link: 'repository', icon: Code },
  { link: 'releases', icon: Tag },
  { link: 'issues', icon: Bug },
  { link: 'discord', icon: MessageCircle },
];

function AboutPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'about' });
  const [info, setInfo] = useState<AppInfo | null>(null);
  const { settings, update } = useSettings();
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.app.getInfo().then((result) => {
      if (!cancelled) setInfo(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(formatAppInfo(info));
    setCopied(true);
  };

  const checkNow = async () => {
    setChecking(true);
    setUpdateResult(null);
    setUpdateResult(await window.skeudenn.app.checkUpdate());
    setChecking(false);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <SettingsSection title={t('version')}>
        {info && (
          <>
            <p className="text-sm">
              <span className="font-medium">{info.name}</span> {info.version}
            </p>
            <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Electron</dt>
              <dd>{info.electron}</dd>
              <dt className="text-muted-foreground">Chromium</dt>
              <dd>{info.chrome}</dd>
              <dt className="text-muted-foreground">Node.js</dt>
              <dd>{info.node}</dd>
              <dt className="text-muted-foreground">V8</dt>
              <dd>{info.v8}</dd>
              <dt className="text-muted-foreground">{t('system')}</dt>
              <dd>
                {info.platform} {info.arch}
              </dd>
            </dl>
            <div>
              <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? t('copied') : t('copy')}
              </Button>
            </div>
          </>
        )}
      </SettingsSection>

      <SettingsSection title={t('updates')}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.checkUpdatesOnStartup}
            onChange={(event) => update('checkUpdatesOnStartup', event.target.checked)}
          />
          {t('checkOnStartup')}
        </label>
        <p className="text-sm text-muted-foreground">{t('updatesHint')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={checking} onClick={() => void checkNow()}>
            <RefreshCw />
            {checking ? t('checking') : t('checkNow')}
          </Button>
          {updateResult?.status === 'up-to-date' && <span className="text-sm">{t('upToDate')}</span>}
          {updateResult?.status === 'error' && <span className="text-sm text-destructive">{updateResult.message}</span>}
          {updateResult?.status === 'available' && (
            <>
              <span className="text-sm">{t('updateAvailable', { version: updateResult.version })}</span>
              <Button size="sm" onClick={() => void window.skeudenn.app.openLink('releases')}>
                <Download />
                {t('download')}
              </Button>
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={t('links')}>
        <div className="flex flex-wrap gap-2">
          {LINKS.map(({ link, icon: Icon }) => (
            <Button key={link} variant="outline" onClick={() => void window.skeudenn.app.openLink(link)}>
              <Icon />
              {t(link)}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t('linksHint')}</p>
      </SettingsSection>

      <SettingsSection title={t('license')}>
        <p className="text-sm">{t('licenseName')}</p>
        <p className="text-sm text-muted-foreground">{t('disclaimer')}</p>
        <div>
          <Button variant="outline" size="sm" onClick={() => void window.skeudenn.app.openLink('license')}>
            <Scale />
            {t('licenseLink')}
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}
