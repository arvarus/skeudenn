import { createFileRoute } from '@tanstack/react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { InfoTip } from '@/components/info-tip';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/hooks/use-settings';
import {
  HOME_SECTION_LAYOUTS,
  HOME_SECTION_MAX_COUNT,
  HOME_SECTION_MIN_COUNT,
} from '@/shared/settings';
import {
  clampHomeCount,
  moveHomeSection,
  resolveHomeSections,
  setHomeSectionOptions,
  setHomeSectionVisible,
} from '@/lib/home-sections';

/** One row of the table (header included): the five columns share the same widths. No scroll container: it would clip the info tips. */
const ROW =
  'grid grid-cols-[minmax(11rem,1fr)_5rem_minmax(8rem,12rem)_minmax(6rem,9rem)_5.5rem] items-center gap-x-4 px-3 py-2';

export const Route = createFileRoute('/settings/home')({
  component: HomeSettingsPage,
});

function HomeSettingsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'home' });
  const { settings, update } = useSettings();
  const sections = resolveHomeSections(settings.homeSections);

  return (
    <>
      <SettingsSection title={t('sectionsTitle')}>
        <p className="text-xs text-muted-foreground">{t('sectionsHint')}</p>
        <div className="w-full max-w-4xl rounded-md border">
          <ul className="flex flex-col divide-y">
            <li
              className={`${ROW} bg-muted/40 text-xs font-medium text-muted-foreground`}
            >
              <span>{t('columns.section')}</span>
              <span>{t('count')}</span>
              <span>{t('layout')}</span>
              <span>{t('hideWhenEmpty')}</span>
              <span>{t('columns.order')}</span>
            </li>
            {sections.map((section, index) => {
              const name = t(`sections.${section.id}`);
              return (
                <li key={section.id} className={ROW}>
                  <span className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={section.visible}
                      label={t('showNamed', { name })}
                      onChange={(visible) =>
                        update(
                          'homeSections',
                          setHomeSectionVisible(
                            settings.homeSections,
                            section.id,
                            visible,
                          ),
                        )
                      }
                    />
                    {name}
                    <InfoTip label={t('infoNamed', { name })}>
                      {t(`info.${section.id}`)}
                    </InfoTip>
                  </span>
                  <input
                    type="number"
                    className="h-8 w-16 rounded-md border bg-background px-2 text-sm"
                    min={HOME_SECTION_MIN_COUNT}
                    max={HOME_SECTION_MAX_COUNT}
                    step={1}
                    value={section.count}
                    aria-label={t('countNamed', { name })}
                    onChange={(event) => {
                      const count = event.target.valueAsNumber;
                      if (Number.isNaN(count)) return;
                      update(
                        'homeSections',
                        setHomeSectionOptions(
                          settings.homeSections,
                          section.id,
                          { count: clampHomeCount(count) },
                        ),
                      );
                    }}
                  />
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                    value={section.layout}
                    aria-label={t('layoutNamed', { name })}
                    onChange={(event) =>
                      update(
                        'homeSections',
                        setHomeSectionOptions(
                          settings.homeSections,
                          section.id,
                          {
                            layout: event.target
                              .value as (typeof HOME_SECTION_LAYOUTS)[number],
                          },
                        ),
                      )
                    }
                  >
                    {HOME_SECTION_LAYOUTS.map((layout) => (
                      <option key={layout} value={layout}>
                        {t(`layouts.${layout}`)}
                      </option>
                    ))}
                  </select>
                  <span>
                    <Switch
                      checked={section.hideWhenEmpty}
                      label={t('hideWhenEmptyNamed', { name })}
                      onChange={(hideWhenEmpty) =>
                        update(
                          'homeSections',
                          setHomeSectionOptions(
                            settings.homeSections,
                            section.id,
                            { hideWhenEmpty },
                          ),
                        )
                      }
                    />
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() =>
                        update(
                          'homeSections',
                          moveHomeSection(settings.homeSections, index, -1),
                        )
                      }
                      title={t('moveUp')}
                      aria-label={t('moveUpNamed', { name })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === sections.length - 1}
                      onClick={() =>
                        update(
                          'homeSections',
                          moveHomeSection(settings.homeSections, index, 1),
                        )
                      }
                      title={t('moveDown')}
                      aria-label={t('moveDownNamed', { name })}
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </SettingsSection>
    </>
  );
}
