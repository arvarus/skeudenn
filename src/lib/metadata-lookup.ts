/**
 * The steps of the metadata lookup dialog as a state machine.
 * @module
 */
import type { MetadataReview } from '@/lib/metadata-review';
import type { MetadataApiSource, MetadataCandidate } from '@/shared/metadata';
import type { PublicSettings } from '@/shared/settings';

/** Where the dialog is: choosing options, waiting for an answer, picking a result or reviewing one. */
export type LookupStep =
  | { kind: 'options' }
  | { kind: 'searching' }
  | { kind: 'results'; candidates: MetadataCandidate[]; errors: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'review'; candidates: MetadataCandidate[]; review: MetadataReview };

/** The dialog's state: the step, and which search (if any) may still change it. */
export interface LookupState {
  step: LookupStep;
  /** The search whose answer is awaited; `null` when none is, so any late answer is ignored. */
  searchId: number | null;
}

/** Everything that can happen in the dialog. */
export type LookupAction =
  /** A search was sent; `id` is unique to it. */
  | { type: 'searchStarted'; id: number }
  /** The answer of search `id`, as the step it leads to; ignored unless that search is the awaited one. */
  | { type: 'searchDone'; id: number; step: LookupStep }
  /** The user stopped the search, or changed the way to look the book up: back to the options. */
  | { type: 'reset' }
  /** A result was picked: its review replaces the results. */
  | { type: 'picked'; review: MetadataReview }
  /** The user edited the review. */
  | { type: 'reviewChanged'; review: MetadataReview }
  /** Back from the review to the results it came from. */
  | { type: 'backToResults' };

/** The dialog before anything is searched. */
export const INITIAL_LOOKUP: LookupState = { step: { kind: 'options' }, searchId: null };

/**
 * The next state of the lookup dialog. A search's answer only counts while that search is the one
 * awaited: stopping, starting another or changing mode drops the awaited id, so a slower, earlier
 * answer can never show stale results. Actions that don't fit the current step change nothing.
 */
export function lookupReducer(state: LookupState, action: LookupAction): LookupState {
  switch (action.type) {
    case 'searchStarted':
      return { step: { kind: 'searching' }, searchId: action.id };
    case 'searchDone':
      return action.id === state.searchId ? { step: action.step, searchId: null } : state;
    case 'reset':
      return INITIAL_LOOKUP;
    case 'picked':
      return state.step.kind === 'results'
        ? { ...state, step: { kind: 'review', candidates: state.step.candidates, review: action.review } }
        : state;
    case 'reviewChanged':
      return state.step.kind === 'review' ? { ...state, step: { ...state.step, review: action.review } } : state;
    case 'backToResults':
      return state.step.kind === 'review'
        ? { ...state, step: { kind: 'results', candidates: state.step.candidates, errors: [] } }
        : state;
  }
}

/** The APIs that are offered once enabled in the settings, in display order. */
const API_SOURCES: readonly MetadataApiSource[] = ['comicvine', 'googlebooks'];

/** The settings the source choice depends on. */
export type LookupSourceSettings = Pick<PublicSettings, 'comicVineEnabled' | 'googleBooksEnabled' | 'bedethequeSearchByDefault'>;

/** What the dialog's source boxes show, and what a search is sent with. */
export interface LookupSources {
  /** The APIs enabled in the settings, each offered as a box, in display order. */
  offered: MetadataApiSource[];
  /** Whether Bédéthèque's box is ticked. */
  bedethequeTicked: boolean;
  /** The sources a search queries: the offered APIs still ticked, then Bédéthèque when ticked. */
  sources: MetadataApiSource[];
}

/**
 * The sources of a lookup. The APIs enabled in the settings are offered and ticked unless the user
 * unticked them (`unticked`). Bédéthèque has no switch in the settings: its box is always there,
 * ticked as the user chose (`bedethequeChoice`) or, until they do (`null`), as
 * `bedethequeSearchByDefault` says. Settings not loaded yet offer nothing and leave Bédéthèque unticked.
 */
export function lookupSources(
  settings: LookupSourceSettings | null | undefined,
  unticked: ReadonlySet<MetadataApiSource>,
  bedethequeChoice: boolean | null,
): LookupSources {
  const offered = API_SOURCES.filter((source) =>
    source === 'comicvine' ? settings?.comicVineEnabled : settings?.googleBooksEnabled,
  );
  const bedethequeTicked = bedethequeChoice ?? settings?.bedethequeSearchByDefault ?? false;
  const sources: MetadataApiSource[] = [
    ...offered.filter((source) => !unticked.has(source)),
    ...(bedethequeTicked ? (['bedetheque'] as const) : []),
  ];
  return { offered, bedethequeTicked, sources };
}

/** The part of a DOM element `enterAppliesReview()` reads (`Element` fits). */
export interface KeyTarget {
  /** The element itself or its closest ancestor matching `selectors`, or a falsy value when none does. */
  closest(selectors: string): unknown;
}

/** The part of a keyboard event `enterAppliesReview()` reads (`KeyboardEvent` fits). */
export type EnterKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'defaultPrevented' | 'isComposing' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'
>;

/** The elements that keep their own Enter: a focused one of these never saves the review. */
const OWN_ENTER = 'button, a, select, textarea, [role="tab"]';

/**
 * Whether a key press saves the review of the lookup dialog: a plain Enter (no modifier, not
 * composing, not already handled), from inside a dialog or from the page body (nothing focused,
 * after a click on a result). A focused button, link, list, text area or tab keeps its own Enter,
 * and a key typed outside any dialog (with the focus elsewhere than the body) is left alone.
 * `target` is the event's target when it is an element, else `null`; `body` is `document.body`.
 */
export function enterAppliesReview(event: EnterKeyEvent, target: KeyTarget | null, body: unknown): boolean {
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return false;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  if (target?.closest(OWN_ENTER)) return false;
  if (target && !target.closest('[role="dialog"]') && target !== body) return false;
  return true;
}
