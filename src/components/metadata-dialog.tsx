import { ArrowLeft, ChevronDown, ChevronRight, Globe, Loader2, Search, SkipForward, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Tabs } from 'radix-ui';

import { BookCover } from '@/components/book-cover';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useSettings } from '@/hooks/use-settings';
import {
  buildReview,
  creditRoleLabel,
  isEmptyUpdate,
  type MetadataReview,
  reviewFieldLabel,
  reviewToUpdate,
} from '@/lib/metadata-review';
import { bumpCoverRevision } from '@/lib/cover-revisions';
import { hasFiche } from '@/lib/library-filter';
import { INITIAL_LOOKUP, lookupReducer } from '@/lib/metadata-lookup';
import { forgetRule, initialLookupQuery, initialRuleState, offeredRules, queryFromRule, rememberRule } from '@/lib/lookup-query';
import { cn, formatLanguage } from '@/lib/utils';
import { fileNameTemplateError } from '@/shared/file-name-template';
import { CREDIT_ROLES, type CreditRole, type LibraryEntry } from '@/shared/library';
import {
  METADATA_SOURCE_LABELS,
  type MetadataApiSource,
  type MetadataCandidate,
  type MetadataQuery,
  pageSourceOf,
} from '@/shared/metadata';
import { formatPersonName } from '@/shared/title-parsing';

/** How to look the book up: in the public APIs, or from the link of a page of a supported site. */
type Mode = 'api' | 'site';

/** The APIs that are ticked per search once enabled in the settings, in display order. */
const API_SOURCES: MetadataApiSource[] = ['comicvine', 'googlebooks'];

const INPUT_CLASS =
  'h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Looks a library entry up, lets the user pick the right book among the results (each shows its
 * source), then accept, edit or refuse each proposed change before writing it. Nothing is searched
 * on opening: the user picks how (the enabled public APIs, or the link of a page of Bédéthèque,
 * BDfugue or Nautiljon, which skips the results and goes straight to the review), ticks the
 * options, starts the search and can stop it. Saving also updates the `.nfo` and the cover.
 *
 * Within a series (several selected books), `position` shows which book this is and `onDone` is
 * called once its details are saved (or there is nothing to change), where the caller moves on to
 * the next book, as does `onSkip` ("Skip", saving nothing); `onClose` (the cross, "Cancel") stops the series.
 */
export function MetadataDialog({
  entry,
  onClose,
  onApplied,
  position,
  onDone,
  onSkip,
}: {
  entry: LibraryEntry;
  onClose: () => void;
  onApplied: (entry: LibraryEntry) => void;
  position?: { index: number; total: number };
  onDone?: () => void;
  onSkip?: () => void;
}) {
  const { t } = useTranslation(['metadata', 'common']);
  const { settings, update } = useSettings();
  const [mode, setMode] = useState<Mode>('api');
  // A book with no information yet starts from its file name: a rule can read it into the fields,
  // and the last rule used that fits is applied at once. A book that has some starts from them, but
  // the rule zone stays available to search from the file name instead.
  const [initial] = useState(() =>
    !hasFiche(entry)
      ? initialRuleState(entry, settings?.fileNameRules ?? [])
      : { rule: '', query: initialLookupQuery(entry) },
  );
  const [query, setQuery] = useState<MetadataQuery>(initial.query);
  const [pageUrl, setPageUrl] = useState('');
  const rules = offeredRules(settings?.fileNameRules ?? [], settings?.libraryFileName ?? '');
  const [rule, setRule] = useState(initial.rule);
  const [ruleMisses, setRuleMisses] = useState(false);
  const ruleCollapsed = settings?.lookupRuleCollapsed ?? false;
  const ruleError = rule === '' ? null : fileNameTemplateError(rule);
  const applyRule = () => {
    const found = queryFromRule(entry, rule);
    setRuleMisses(found === null);
    if (!found) return;
    setQuery(found);
    update('fileNameRules', rememberRule(settings?.fileNameRules ?? [], rule));
  };
  const enabledSources = API_SOURCES.filter((source) =>
    source === 'comicvine' ? settings?.comicVineEnabled : settings?.googleBooksEnabled,
  );
  const [unticked, setUnticked] = useState<Set<MetadataApiSource>>(new Set());
  // Bédéthèque has no key to enable: its box is always there, starting as the setting says.
  const [bedethequeChoice, setBedethequeChoice] = useState<boolean | null>(null);
  const bedethequeTicked = bedethequeChoice ?? settings?.bedethequeSearchByDefault ?? false;
  const sources: MetadataApiSource[] = [
    ...enabledSources.filter((source) => !unticked.has(source)),
    ...(bedethequeTicked ? (['bedetheque'] as const) : []),
  ];
  const [picking, setPicking] = useState(false);
  // Nothing is searched until the user asks: the dialog opens on the options. Only the awaited search
  // may update the dialog, so an earlier, slower answer never shows stale results; stopping a search
  // (or closing the dialog) abandons it.
  const [{ step }, dispatch] = useReducer(lookupReducer, INITIAL_LOOKUP);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const searchCount = useRef(0);
  const queryInput = useRef<HTMLInputElement>(null);
  const pageUrlInput = useRef<HTMLInputElement>(null);
  // Closing the dialog gives up what it is waiting for: the requests to the sites are aborted, not just ignored.
  useEffect(() => () => void window.tankobon.metadata.cancel(), []);
  const stop = () => {
    dispatch({ type: 'reset' });
    void window.tankobon.metadata.cancel();
  };

  const runSearch = async () => {
    const id = ++searchCount.current;
    dispatch({ type: 'searchStarted', id });
    try {
      if (mode === 'site') {
        const result = await window.tankobon.metadata.fromPage(pageUrl.trim());
        dispatch({
          type: 'searchDone',
          id,
          step:
            result.status === 'ok'
              ? { kind: 'review', candidates: [result.candidate], review: buildReview(entry, result.candidate) }
              : { kind: 'error', message: result.message },
        });
        return;
      }
      const result = await window.tankobon.metadata.search({ ...query, sources });
      dispatch({
        type: 'searchDone',
        id,
        step:
          result.status === 'ok'
            ? { kind: 'results', candidates: result.candidates, errors: result.errors }
            : { kind: 'error', message: result.message },
      });
    } catch {
      // The call itself failed (refused arguments, main process error): without this the dialog waited forever.
      dispatch({ type: 'searchDone', id, step: { kind: 'error', message: t('searchFailed') } });
    }
  };

  const canSearch = mode === 'site' ? pageSourceOf(pageUrl) !== null : query.text.trim() !== '' && sources.length > 0;

  // A line of a Bédéthèque series list has no credits yet: the album's own page is read when it is picked.
  const pick = async (candidate: MetadataCandidate) => {
    if (candidate.source !== 'bedetheque' || candidate.credits.length > 0 || !candidate.sourceUrl) {
      dispatch({ type: 'picked', review: buildReview(entry, candidate) });
      return;
    }
    setPicking(true);
    try {
      const result = await window.tankobon.metadata.fromPage(candidate.sourceUrl);
      dispatch({ type: 'picked', review: buildReview(entry, result.status === 'ok' ? result.candidate : candidate) });
    } catch {
      // The album page couldn't be read: the list line's own information is reviewed instead.
      dispatch({ type: 'picked', review: buildReview(entry, candidate) });
    } finally {
      setPicking(false);
    }
  };

  const apply = async (review: MetadataReview) => {
    const update = reviewToUpdate(entry, review);
    const finish = onDone ?? onClose;
    const coverUrl = review.coverAccepted ? review.coverUrl : null;
    if (isEmptyUpdate(update) && coverUrl === null) {
      finish();
      return;
    }
    setApplying(true);
    setApplyFailed(false);
    let updated: LibraryEntry | null;
    try {
      updated = await window.tankobon.metadata.apply(entry.id, update, coverUrl);
    } catch {
      // Nothing was saved: the review stays open, with what the user accepted, and says so.
      setApplying(false);
      setApplyFailed(true);
      return;
    }
    setApplying(false);
    if (coverUrl !== null) bumpCoverRevision(entry.id);
    if (updated) onApplied(updated);
    finish();
  };

  // On the review, Enter saves, wherever the focus is (a field, or nowhere after a click on a result);
  // a focused button, link or list keeps its own Enter, and a dialog opened over this one is left alone.
  // A layout effect, so the listener is there as soon as the review is: a passive effect runs a task later,
  // and an Enter pressed in between (or fired by a test right after the review appears) was lost.
  const reviewToApply = step.kind === 'review' && !applying ? step.review : null;
  useLayoutEffect(() => {
    if (!reviewToApply) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button, a, select, textarea, [role="tab"]')) return;
      if (target && !target.closest('[role="dialog"]') && target !== document.body) return;
      event.preventDefault();
      void apply(reviewToApply);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `apply` is recreated each render and reads only `entry` and the callbacks
  }, [reviewToApply]);

  // Only while another book follows: on the last one there is nothing to move on to.
  const skip =
    onSkip && position && position.index < position.total ? (
      <Button variant="outline" size="sm" onClick={onSkip} disabled={applying || picking}>
        <SkipForward />
        {t('skip')}
      </Button>
    ) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={position ? t('seriesTitle', position) : t('title')}
      description={entry.path}
      className="max-w-3xl"
      // A series of lookups would be lost by an awkward click outside.
      closeOnOutsideClick={false}
      // Enter must start the search, not hit the close button that would take the focus first.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        (mode === 'site' ? pageUrlInput : queryInput).current?.focus();
      }}
    >
      {/* Everything but the footer scrolls together: the options can fill a short window, and the results below must stay reachable. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
          <BookCover entryId={entry.id} title={entry.title} className="h-20 w-14" />
          <p className="min-w-0 truncate text-sm font-medium" title={entry.title}>
            {entry.title}
          </p>
        </div>

        {/* Two views: the search (options and results), then the review of the picked result, which goes back to the results. */}
        {step.kind !== 'review' && (
          // The two modes are tabs (arrow keys move between them and select), each controlling its panel of options.
          <Tabs.Root
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              dispatch({ type: 'reset' });
            }}
            className="flex flex-col gap-4"
          >
          <Tabs.List aria-label={t('modeLabel')} className="flex gap-1">
            {(['api', 'site'] as const).map((value) => (
              <Tabs.Trigger key={value} value={value} disabled={step.kind === 'searching'} asChild>
                <Button size="sm" variant={mode === value ? 'secondary' : 'ghost'}>
                  {value === 'api' ? <Search /> : <Globe />}
                  {t(value === 'api' ? 'modeApi' : 'modeSite')}
                </Button>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSearch && step.kind !== 'searching') void runSearch();
            }}
          >
            <Tabs.Content value="api" className="flex flex-col gap-3 outline-none data-[state=inactive]:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={queryInput}
                    aria-label={t('queryLabel')}
                    placeholder={t('queryPlaceholder')}
                    className={cn(INPUT_CLASS, 'min-w-48 flex-1')}
                    value={query.text}
                    onChange={(event) => setQuery({ ...query, text: event.target.value })}
                  />
                  <input
                    aria-label={t('volumeLabel')}
                    placeholder={t('volumePlaceholder')}
                    className={cn(INPUT_CLASS, 'w-24')}
                    value={query.volume ?? ''}
                    onChange={(event) => setQuery({ ...query, volume: event.target.value || null })}
                  />
                </div>
                <div className="flex flex-col gap-1 rounded-md border p-2">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                    aria-expanded={!ruleCollapsed}
                    onClick={() => update('lookupRuleCollapsed', !ruleCollapsed)}
                  >
                    {ruleCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    {t('ruleLabel')}
                  </button>
                  {!ruleCollapsed && <span className="text-xs text-muted-foreground">{t('ruleHint')}</span>}
                  {!ruleCollapsed && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label={t('ruleLabel')}
                      placeholder={t('rulePlaceholder')}
                      className={cn(INPUT_CLASS, 'min-w-48 flex-1 font-mono')}
                      value={rule}
                      onChange={(event) => {
                        setRule(event.target.value);
                        setRuleMisses(false);
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={rule === '' || ruleError !== null}
                      onClick={applyRule}
                    >
                      {t('applyRule')}
                    </Button>
                  </div>
                  )}
                  {!ruleCollapsed && rules.length > 0 && (
                    <ul className="flex flex-wrap gap-1" aria-label={t('previousRules')}>
                      {rules.map((previous) => (
                        <li key={previous} className="flex items-center rounded-md border text-xs">
                          <button
                            type="button"
                            className="px-2 py-0.5 font-mono hover:bg-accent"
                            onClick={() => {
                              setRule(previous);
                              setRuleMisses(false);
                            }}
                          >
                            {previous}
                          </button>
                          {(settings?.fileNameRules ?? []).includes(previous) && (
                            <button
                              type="button"
                              className="px-1 py-0.5 text-muted-foreground hover:text-foreground"
                              aria-label={t('forgetRule', { rule: previous })}
                              title={t('forgetRule', { rule: previous })}
                              onClick={() => update('fileNameRules', forgetRule(settings?.fileNameRules ?? [], previous))}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!ruleCollapsed && ruleError && <p className="text-xs text-destructive">{t('ruleInvalid')}</p>}
                  {!ruleCollapsed && ruleMisses && <p className="text-xs text-destructive">{t('ruleNoMatch')}</p>}
                </div>
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <legend className="sr-only">{t('sourcesLabel')}</legend>
                  <span className="text-muted-foreground">{t('sourcesLabel')}</span>
                  {enabledSources.length === 0 && <span className="text-muted-foreground">{t('noApiEnabled')}</span>}
                  {enabledSources.map((source) => (
                    <label key={source} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!unticked.has(source)}
                        onChange={(event) =>
                          setUnticked((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.delete(source);
                            else next.add(source);
                            return next;
                          })
                        }
                      />
                      {METADATA_SOURCE_LABELS[source]}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={bedethequeTicked}
                      onChange={(event) => setBedethequeChoice(event.target.checked)}
                    />
                    {METADATA_SOURCE_LABELS.bedetheque}
                  </label>
                </fieldset>
            </Tabs.Content>
            <Tabs.Content value="site" className="flex flex-col gap-1 outline-none data-[state=inactive]:hidden">
                <input
                  ref={pageUrlInput}
                  aria-label={t('pageUrlLabel')}
                  placeholder={t('pageUrlPlaceholder')}
                  className={cn(INPUT_CLASS, 'w-full')}
                  value={pageUrl}
                  onChange={(event) => setPageUrl(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('pageSitesHint')}</p>
            </Tabs.Content>
            <div className="flex justify-end gap-2">
              {step.kind === 'searching' ? (
                <Button type="button" size="sm" variant="outline" onClick={stop}>
                  <Square />
                  {t('stop')}
                </Button>
              ) : (
                <Button type="submit" size="sm" variant="outline" disabled={!canSearch}>
                  {mode === 'site' ? <Globe /> : <Search />}
                  {t(mode === 'site' ? 'readPage' : 'search')}
                </Button>
              )}
            </div>
          </form>
          </Tabs.Root>
        )}

        <div>
          {step.kind === 'searching' && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {/* Clipped: a rotating icon's bounding box grows past its own, which made the scroll area's scrollbar appear and disappear. */}
              <span className="inline-flex size-4 shrink-0 overflow-hidden">
                <Loader2 className="size-4 animate-spin" />
              </span>
              {mode === 'site' ? t('readingPage') : t('searching')}
            </p>
          )}
          {step.kind === 'error' && <p className="text-sm whitespace-pre-line text-destructive">{step.message}</p>}
          {step.kind === 'results' && (
            <CandidateList
              candidates={step.candidates}
              errors={step.errors}
              disabled={picking}
              onPick={(candidate) => void pick(candidate)}
            />
          )}
          {step.kind === 'review' && (
            <ReviewForm review={step.review} onChange={(review) => dispatch({ type: 'reviewChanged', review })} />
          )}
        </div>
      </div>

      {step.kind === 'review' && applyFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('applyFailed')}
        </p>
      )}

      {step.kind !== 'review' && skip && (
        <div className="flex justify-end">{skip}</div>
      )}

      {step.kind === 'review' && (
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'backToResults' })}>
            <ArrowLeft />
            {t('otherResults')}
          </Button>
          <div className="flex gap-2">
            {skip}
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('common:cancel')}
            </Button>
            <Button size="sm" onClick={() => void apply(step.review)} disabled={applying}>
              {t('apply')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function candidateHeading(candidate: MetadataCandidate, t: TFunction<'metadata'>): string {
  const series = [candidate.series, candidate.volume && `#${candidate.volume}`].filter(Boolean).join(' ');
  return [series, candidate.title].filter(Boolean).join(' — ') || t('untitled');
}

function CandidateList({
  candidates,
  errors,
  disabled,
  onPick,
}: {
  candidates: MetadataCandidate[];
  errors: string[];
  disabled: boolean;
  onPick: (candidate: MetadataCandidate) => void;
}) {
  const { t } = useTranslation('metadata');
  return (
    <div className="flex flex-col gap-2">
      {errors.map((error) => (
        <p key={error} className="text-sm text-destructive">
          {error}
        </p>
      ))}
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noResults')}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {candidates.map((candidate) => (
            <li key={`${candidate.source}-${candidate.sourceId}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(candidate)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent disabled:opacity-60"
              >
                {candidate.coverUrl ? (
                  <img src={candidate.coverUrl} alt="" className="h-16 w-11 shrink-0 rounded-sm object-cover" />
                ) : (
                  <div className="h-16 w-11 shrink-0 rounded-sm bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{candidateHeading(candidate, t)}</span>
                    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {METADATA_SOURCE_LABELS[candidate.source]}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[candidate.releaseDate, formatLanguage(candidate.language)].filter(Boolean).join(' · ')}
                  </p>
                  {candidate.credits.length > 0 && (
                    <p className="truncate text-xs text-muted-foreground">
                      {[...new Set(candidate.credits.map(formatPersonName))].join(', ')}
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({ review, onChange }: { review: MetadataReview; onChange: (review: MetadataReview) => void }) {
  const { t } = useTranslation('metadata');
  const setField = (index: number, patch: Partial<MetadataReview['fields'][number]>) =>
    onChange({ ...review, fields: review.fields.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const setCredit = (index: number, patch: Partial<MetadataReview['credits'][number]>) =>
    onChange({ ...review, credits: review.credits.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <div className="flex flex-col gap-4">
      {review.coverUrl && (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={review.coverAccepted}
            onChange={(event) => onChange({ ...review, coverAccepted: event.target.checked })}
          />
          <img src={review.coverUrl} alt="" className="h-16 w-11 shrink-0 rounded-sm object-cover" />
          {t('useCover')}
        </label>
      )}
      {review.fields.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 pb-1 font-normal">
                <span className="sr-only">{t('accept')}</span>
              </th>
              <th className="pb-1 font-normal">{t('field')}</th>
              <th className="pb-1 font-normal">{t('current')}</th>
              <th className="pb-1 font-normal">{t('proposed')}</th>
            </tr>
          </thead>
          <tbody>
            {review.fields.map((row, index) => (
              <tr key={row.field} className={cn(!row.accepted && 'text-muted-foreground')}>
                <td className="py-1">
                  <input
                    type="checkbox"
                    aria-label={t('acceptField', { field: reviewFieldLabel(row.field) })}
                    checked={row.accepted}
                    onChange={(event) => setField(index, { accepted: event.target.checked })}
                  />
                </td>
                <td className="py-1 pr-2 whitespace-nowrap">{reviewFieldLabel(row.field)}</td>
                <td className="max-w-48 truncate py-1 pr-2" title={row.current ?? undefined}>
                  {row.current ?? '—'}
                </td>
                <td className="py-1">
                  <input
                    aria-label={t('proposedValue', { field: reviewFieldLabel(row.field) })}
                    className={cn(INPUT_CLASS, 'w-full')}
                    value={row.proposed}
                    // Editing a value means the user wants it.
                    onChange={(event) => setField(index, { proposed: event.target.value, accepted: true })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t('authors')}</h3>
        {review.credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noAuthors')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {review.credits.map((credit, index) => (
              <li key={credit.key} className={cn('flex items-center gap-2', !credit.accepted && 'opacity-60')}>
                <input
                  type="checkbox"
                  aria-label={t(credit.origin === 'current' ? 'keepAuthor' : 'addAuthor', { name: formatPersonName(credit) })}
                  checked={credit.accepted}
                  onChange={(event) => setCredit(index, { accepted: event.target.checked })}
                />
                <input
                  aria-label={t('firstName')}
                  placeholder={t('firstName')}
                  className={cn(INPUT_CLASS, 'w-36')}
                  value={credit.firstName}
                  onChange={(event) => setCredit(index, { firstName: event.target.value })}
                />
                <input
                  aria-label={t('lastName')}
                  placeholder={t('lastName')}
                  className={cn(INPUT_CLASS, 'w-40')}
                  value={credit.lastName}
                  onChange={(event) => setCredit(index, { lastName: event.target.value })}
                />
                <select
                  aria-label={t('role')}
                  className={cn(INPUT_CLASS, 'w-32')}
                  value={credit.role}
                  onChange={(event) => setCredit(index, { role: event.target.value as CreditRole })}
                >
                  {CREDIT_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {creditRoleLabel(role)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {credit.origin === 'current' ? t('currentTag') : t('proposedTag')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
