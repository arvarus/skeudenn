import { Navigate, createFileRoute } from '@tanstack/react-router';
import { Copy, Eraser, FileArchive, FolderMinus, FolderTree, RefreshCw, Trash2, Wrench, type LucideIcon } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';

import { CleanupDialog } from '@/components/cleanup-dialog';
import { DuplicatesDialog } from '@/components/duplicates-dialog';
import { Deflate64Dialog } from '@/components/organization/deflate64-dialog';
import { ResyncDialog } from '@/components/organization/resync-dialog';
import {
  CleanFoldersDialog,
  ConvertCbrDialog,
  EmptyDeletedDialog,
  OrganizeAllDialog,
  type ActionDialogProps,
} from '@/components/organization/simple-run-dialogs';
import { SettingCheckbox } from '@/components/setting-checkbox';
import { SETTINGS_SELECT_CLASS, SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { resyncStepLabel } from '@/lib/resync-step';
import { isOrganizationOn } from '@/lib/settings-nav';
import { useLibrary } from '@/hooks/use-library';
import { useScanProgress } from '@/hooks/use-scan-progress';
import { useSettings } from '@/hooks/use-settings';
import { formatArticleList, isArticleList, parseArticleList } from '@/shared/articles';
import { fileNameExample, levelChoices, setLevel, structureExample } from '@/lib/library-structure';
import { cn } from '@/lib/utils';
import {
  FILE_NAME_FIELDS,
  MAX_FILE_NAME_TEMPLATE_LENGTH,
  MAX_VOLUME_PREFIX_LENGTH,
  fileNameTemplateError,
  isVolumePrefix,
} from '@/shared/file-name-template';
import {
  MAX_LIBRARY_LEVELS,
  MAX_TRASH_RETENTION_DAYS,
  isLibraryStructure,
  type LibraryLevel,
  type LibraryOrganization,
} from '@/shared/settings';

export const Route = createFileRoute('/settings/organization')({
  component: OrganizationSettingsGuard,
});

/** The page only exists while the organized library is enabled (Paramètres › Bibliothèque). */
function OrganizationSettingsGuard() {
  const { settings } = useSettings();
  return isOrganizationOn(settings) ? <OrganizationSettingsPage /> : <Navigate to="/settings/library" replace />;
}

/** The actions of the page, in the order they are listed; each opens its dialog. */
const ACTIONS = [
  { id: 'resync', icon: RefreshCw, needsFolder: false },
  { id: 'organizeAll', icon: FolderTree, needsFolder: true },
  { id: 'convertCbr', icon: FileArchive, needsFolder: true },
  { id: 'convertDeflate64', icon: Wrench, needsFolder: false },
  { id: 'cleanup', icon: Eraser, needsFolder: false },
  { id: 'duplicates', icon: Copy, needsFolder: false },
  { id: 'cleanFolders', icon: FolderMinus, needsFolder: true },
  { id: 'emptyDeleted', icon: Trash2, needsFolder: true },
] as const satisfies readonly { id: string; icon: LucideIcon; needsFolder: boolean }[];

type ActionId = (typeof ACTIONS)[number]['id'];

/** The dialogs that take nothing but `onClose`; the cleanup and the duplicates get their books from the page. */
const SIMPLE_DIALOGS: Partial<Record<ActionId, ComponentType<ActionDialogProps>>> = {
  resync: ResyncDialog,
  organizeAll: OrganizeAllDialog,
  convertCbr: ConvertCbrDialog,
  convertDeflate64: Deflate64Dialog,
  cleanFolders: CleanFoldersDialog,
  emptyDeleted: EmptyDeletedDialog,
};

/**
 * How the library's files are laid out, shared by every user, then the maintenance actions. The folder the
 * files are moved to is each user's own choice (Paramètres › Bibliothèque). Each action runs in its own
 * dialog (`RunDialog`): description and start, progress and stop, then the report.
 */
function OrganizationSettingsPage() {
  const { t, i18n } = useTranslation('settings', { keyPrefix: 'library' });
  const { settings, update } = useSettings();
  const library = useLibrary();
  // Any run over the library files of this window (or the resynchronization started at launch): the editors
  // wait for it, and the actions too, except the resynchronization's, whose dialog then follows the one going.
  const progress = useScanProgress();
  const busy = progress !== null;
  const resyncStep = progress?.step ?? null;
  const [openAction, setOpenAction] = useState<ActionId | null>(null);
  const organizationReady = settings.libraryOrganization !== 'off' && Boolean(settings.libraryOrganizationFolder);

  const lastResync = settings.lastResyncAt
    ? t('lastResync', { date: new Date(settings.lastResyncAt).toLocaleString(i18n.language) })
    : t('neverResynced');

  const disabled = (id: ActionId, needsFolder: boolean) => {
    if (needsFolder && !organizationReady) return true;
    if (id === 'duplicates' && library === null) return true;
    return busy && !(id === 'resync' && resyncStep !== null);
  };

  const close = () => setOpenAction(null);
  const SimpleDialog = openAction ? SIMPLE_DIALOGS[openAction] : undefined;

  return (
    <>
      <SettingsSection title={t('organization')}>
        <p className="text-sm text-muted-foreground">{t('organizationHint')}</p>
        <div className="flex items-center gap-2">
          <label htmlFor="library-organization" className="text-sm">
            {t('organizationMode')}
          </label>
          <select
            id="library-organization"
            className={SETTINGS_SELECT_CLASS}
            value={settings.libraryOrganization}
            onChange={(event) => update('libraryOrganization', event.target.value as LibraryOrganization)}
          >
            <option value="ask">{t('organizationAsk')}</option>
            <option value="always">{t('organizationAlways')}</option>
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          {settings.libraryOrganizationFolder ? t('organizationFolderIs', { folder: settings.libraryOrganizationFolder }) : t('organizationFolderNone')}
        </p>
        <StructureEditor disabled={busy} />
        <FileNameEditor disabled={busy} />
        <ArticlesEditor disabled={busy} />
        <SettingCheckbox
          label={t('sidecarCovers')}
          hint={t('sidecarCoversHint')}
          checked={settings.librarySidecarCovers}
          onChange={(checked) => update('librarySidecarCovers', checked)}
        />
        <SettingCheckbox
          label={t('writeNfo')}
          hint={t('writeNfoHint')}
          checked={settings.libraryWriteNfo}
          onChange={(checked) => update('libraryWriteNfo', checked)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <SettingCheckbox
            label={t('trashAutoEmpty')}
            checked={settings.trashAutoEmpty}
            disabled={settings.libraryOrganization === 'off'}
            onChange={(checked) => update('trashAutoEmpty', checked)}
          />
          {settings.trashAutoEmpty && (
            <label className="flex items-center gap-2 text-sm">
              {t('trashRetentionDays')}
              <input
                type="number"
                className="h-8 w-16 rounded-md border bg-background px-2"
                min={1}
                max={MAX_TRASH_RETENTION_DAYS}
                step={1}
                value={settings.trashRetentionDays}
                onChange={(event) => {
                  const days = event.target.valueAsNumber;
                  if (Number.isNaN(days)) return;
                  update('trashRetentionDays', Math.min(MAX_TRASH_RETENTION_DAYS, Math.max(1, Math.round(days))));
                }}
              />
            </label>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('trashAutoEmptyHint')}</p>
      </SettingsSection>
      <SettingsSection title={t('resync')}>
        <SettingCheckbox
          label={t('resyncOnStartup')}
          checked={settings.resyncOnStartup}
          onChange={(checked) => update('resyncOnStartup', checked)}
        />
        <p className="text-sm text-muted-foreground">{lastResync}</p>
      </SettingsSection>
      <SettingsSection title={t('actionsTitle')}>
        <p className="text-sm text-muted-foreground">{t('actionsHint')}</p>
        <ul className="flex flex-col divide-y rounded-md border">
          {ACTIONS.map(({ id, icon: Icon, needsFolder }) => (
            <li key={id} className="flex items-center gap-3 p-3">
              <Icon className={cn('size-4 shrink-0 text-muted-foreground', id === 'resync' && resyncStep && 'animate-spin')} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{t(`actions.${id}.title`)}</span>
                <span className="text-sm text-muted-foreground">
                  {id === 'resync' && resyncStep ? resyncStepLabel(resyncStep) : t(`actions.${id}.description`)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={t('actionsOpenLabel', { action: t(`actions.${id}.title`) })}
                onClick={() => setOpenAction(id)}
                disabled={disabled(id, needsFolder)}
              >
                {t('actionsOpen')}
              </Button>
            </li>
          ))}
        </ul>
      </SettingsSection>
      {SimpleDialog && <SimpleDialog onClose={close} />}
      {openAction === 'cleanup' && <CleanupDialog ids={[]} onClose={close} />}
      {openAction === 'duplicates' && <DuplicatesDialog entries={library ?? []} onClose={close} />}
    </>
  );
}

/**
 * The organized folder's tree: up to three levels, each a `<select>`. A tree the setting can't hold
 * yet (a letter grouping without a second level) stays a local draft until it is completed.
 */
function StructureEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState<LibraryLevel[]>(settings.libraryStructure);
  // Follows a change of the setting, whoever makes it (this page, another window, a data import);
  // React's "adjust state while rendering" pattern, so the selects never show a stale tree.
  const [stored, setStored] = useState(settings.libraryStructure);
  if (stored !== settings.libraryStructure) {
    setStored(settings.libraryStructure);
    setDraft(settings.libraryStructure);
  }

  const change = (index: number, value: string) => {
    const next = setLevel(draft, index, value === '' ? null : (value as LibraryLevel));
    setDraft(next);
    if (isLibraryStructure(next)) update('libraryStructure', next);
  };

  const example = structureExample(
    draft,
    settings.libraryFileName,
    settings.libraryVolumePrefix,
    settings.libraryVolumePrefixNumericOnly,
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">{t('structure')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: MAX_LIBRARY_LEVELS }, (_, index) => {
          const choices = levelChoices(draft, index);
          return (
            <select
              key={index}
              aria-label={t('structureLevel', { level: index + 1 })}
              className={SETTINGS_SELECT_CLASS}
              value={draft[index] ?? ''}
              disabled={disabled || choices.length === 0}
              onChange={(event) => change(index, event.target.value)}
            >
              <option value="">{index === 0 ? t('structurePerComic') : t('structureNone')}</option>
              {choices.map((level) => (
                <option key={level} value={level}>
                  {t(`levels.${level}`)}
                </option>
              ))}
            </select>
          );
        })}
      </div>
      {!isLibraryStructure(draft) ? (
        <p className="text-sm text-destructive">{t('structureLetterNeedsNext')}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {example ? t('structureExample', { path: example }) : t('structurePerComicHint')}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t('structureHint')}</p>
    </div>
  );
}

/**
 * The file name template: a text field saved as it is typed, as long as it is valid; an invalid one
 * (a `/`, an unknown field) stays a local draft, with its error, until it is fixed.
 */
function FileNameEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(settings.libraryFileName);
  // Follows a change of the setting made elsewhere, like the tree above.
  const [stored, setStored] = useState(settings.libraryFileName);
  if (stored !== settings.libraryFileName) {
    setStored(settings.libraryFileName);
    setDraft(settings.libraryFileName);
  }

  const change = (value: string) => {
    setDraft(value);
    if (fileNameTemplateError(value) === null) update('libraryFileName', value);
  };

  const error = fileNameTemplateError(draft);
  const fields = FILE_NAME_FIELDS.map((field) => `{${field}}`).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="library-file-name" className="text-sm">
        {t('fileName')}
      </label>
      <input
        id="library-file-name"
        type="text"
        spellCheck={false}
        autoComplete="off"
        maxLength={MAX_FILE_NAME_TEMPLATE_LENGTH}
        placeholder={t('fileNamePlaceholder')}
        className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 font-mono text-sm"
        value={draft}
        disabled={disabled}
        aria-invalid={error !== null}
        onChange={(event) => change(event.target.value)}
      />
      {error ? (
        <p className="text-sm text-destructive">{t(`fileNameErrors.${error}`, { fields })}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('structureExample', { path: fileNameExample(draft, settings.libraryVolumePrefix, settings.libraryVolumePrefixNumericOnly) })}</p>
      )}
      <p className="text-sm text-muted-foreground">{t('fileNameHint', { fields })}</p>
      <label htmlFor="library-volume-prefix" className="text-sm">
        {t('volumePrefix')}
      </label>
      <input
        id="library-volume-prefix"
        type="text"
        spellCheck={false}
        autoComplete="off"
        maxLength={MAX_VOLUME_PREFIX_LENGTH}
        placeholder={t('volumePrefixPlaceholder')}
        className="w-full max-w-xs rounded-md border bg-background px-3 py-1.5 font-mono text-sm"
        value={settings.libraryVolumePrefix}
        disabled={disabled}
        onChange={(event) => {
          if (isVolumePrefix(event.target.value)) update('libraryVolumePrefix', event.target.value);
        }}
      />
      <SettingCheckbox
        label={t('volumePrefixNumericOnly')}
        hint={t('volumePrefixNumericOnlyHint')}
        checked={settings.libraryVolumePrefixNumericOnly}
        disabled={disabled}
        onChange={(checked) => update('libraryVolumePrefixNumericOnly', checked)}
      />
      <p className="text-sm text-muted-foreground">{t('volumePrefixHint')}</p>
    </div>
  );
}

/**
 * The option to file names under their first real word, and its list of articles: a comma-separated text
 * saved as it is typed while every article is valid (an invalid text stays a local draft, with its error).
 */
function ArticlesEditor({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState(formatArticleList(settings.libraryArticles));
  // Follows a change of the setting made elsewhere (an import), like the tree above.
  const [stored, setStored] = useState(settings.libraryArticles);
  if (stored !== settings.libraryArticles) {
    setStored(settings.libraryArticles);
    setDraft(formatArticleList(settings.libraryArticles));
  }

  const change = (value: string) => {
    setDraft(value);
    const articles = parseArticleList(value);
    if (articles !== null && isArticleList(articles)) update('libraryArticles', articles);
  };

  const invalid = parseArticleList(draft) === null;

  return (
    <div className="flex flex-col gap-2">
      <SettingCheckbox
        label={t('ignoreArticles')}
        hint={t('ignoreArticlesHint')}
        checked={settings.libraryIgnoreArticles}
        disabled={disabled}
        onChange={(checked) => update('libraryIgnoreArticles', checked)}
      />
      {settings.libraryIgnoreArticles && (
        <>
          <label htmlFor="library-articles" className="text-sm">
            {t('articles')}
          </label>
          <input
            id="library-articles"
            type="text"
            spellCheck={false}
            autoComplete="off"
            className="w-full max-w-md rounded-md border bg-background px-3 py-1.5 text-sm"
            value={draft}
            disabled={disabled}
            aria-invalid={invalid}
            onChange={(event) => change(event.target.value)}
          />
          {invalid ? (
            <p className="text-sm text-destructive">{t('articlesError')}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('articlesHint')}</p>
          )}
        </>
      )}
    </div>
  );
}
