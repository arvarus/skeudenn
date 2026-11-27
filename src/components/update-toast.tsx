import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';

/** Set once the check has run in this window, so it happens at launch and not again on a remount. */
let checkedThisSession = false;

/**
 * Asks, once at launch and unless the `checkUpdatesOnStartup` setting is off, whether a newer
 * release exists, and offers to open the releases page. A failed check (offline…) stays silent.
 */
export function UpdateToast() {
  const { t } = useTranslation('common');
  const { settings } = useSettings();
  const enabled = settings.checkUpdatesOnStartup;
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || checkedThisSession) return;
    checkedThisSession = true;
    void window.skeudenn.app.checkUpdate().then((result) => {
      if (result.status === 'available') setVersion(result.version);
    });
  }, [enabled]);

  if (!version) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[60] flex max-w-sm items-start gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg" role="status" aria-live="polite">
      <Download className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('update.available', { version })}</p>
        <Button
          size="sm"
          className="mt-2"
          onClick={() => {
            void window.skeudenn.app.openLink('releases');
            setVersion(null);
          }}
        >
          {t('update.download')}
        </Button>
      </div>
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setVersion(null)} aria-label={t('close')}>
        <X className="size-4" />
      </button>
    </div>
  );
}
