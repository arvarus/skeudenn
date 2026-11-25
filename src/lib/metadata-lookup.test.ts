import { describe, expect, it } from 'vitest';

import {
  enterAppliesReview,
  type EnterKeyEvent,
  INITIAL_LOOKUP,
  type KeyTarget,
  type LookupSourceSettings,
  lookupReducer,
  lookupSources,
  type LookupState,
  type LookupStep,
} from './metadata-lookup';
import type { MetadataReview } from './metadata-review';
import type { MetadataApiSource, MetadataCandidate } from '@/shared/metadata';

const candidate = { source: 'comicvine', sourceId: '1', title: 'A', credits: [] } as unknown as MetadataCandidate;
const review: MetadataReview = { fields: [], credits: [], coverUrl: null, coverAccepted: false };
const results: LookupStep = { kind: 'results', candidates: [candidate], errors: [] };

describe('lookupReducer', () => {
  it('starts on the options', () => {
    expect(INITIAL_LOOKUP.step.kind).toBe('options');
  });

  it('shows the answer of the awaited search', () => {
    const searching = lookupReducer(INITIAL_LOOKUP, { type: 'searchStarted', id: 1 });
    expect(searching.step.kind).toBe('searching');
    const done = lookupReducer(searching, { type: 'searchDone', id: 1, step: results });
    expect(done.step).toEqual(results);
    expect(done.searchId).toBeNull();
  });

  it('ignores the answer of a search that was stopped', () => {
    const searching = lookupReducer(INITIAL_LOOKUP, { type: 'searchStarted', id: 1 });
    const stopped = lookupReducer(searching, { type: 'reset' });
    expect(stopped.step.kind).toBe('options');
    expect(lookupReducer(stopped, { type: 'searchDone', id: 1, step: results })).toBe(stopped);
  });

  it('ignores the answer of an earlier search once another one started', () => {
    let state = lookupReducer(INITIAL_LOOKUP, { type: 'searchStarted', id: 1 });
    state = lookupReducer(state, { type: 'searchStarted', id: 2 });
    expect(lookupReducer(state, { type: 'searchDone', id: 1, step: results })).toBe(state);
    expect(lookupReducer(state, { type: 'searchDone', id: 2, step: results }).step).toEqual(results);
  });

  it('goes from the results to a review, edits it and comes back', () => {
    const atResults: LookupState = { step: results, searchId: null };
    const reviewing = lookupReducer(atResults, { type: 'picked', review });
    expect(reviewing.step).toEqual({ kind: 'review', candidates: [candidate], review });
    const edited = { ...review, credits: [] };
    expect(lookupReducer(reviewing, { type: 'reviewChanged', review: edited }).step).toMatchObject({ review: edited });
    expect(lookupReducer(reviewing, { type: 'backToResults' }).step).toEqual(results);
  });

  it('ignores actions that do not fit the step', () => {
    expect(lookupReducer(INITIAL_LOOKUP, { type: 'picked', review })).toBe(INITIAL_LOOKUP);
    expect(lookupReducer(INITIAL_LOOKUP, { type: 'reviewChanged', review })).toBe(INITIAL_LOOKUP);
    expect(lookupReducer(INITIAL_LOOKUP, { type: 'backToResults' })).toBe(INITIAL_LOOKUP);
  });
});

describe('lookupSources', () => {
  const all: LookupSourceSettings = { comicVineEnabled: true, googleBooksEnabled: true, bedethequeSearchByDefault: false };
  const none = new Set<MetadataApiSource>();

  it('offers and ticks the enabled APIs, in display order', () => {
    expect(lookupSources(all, none, null)).toEqual({
      offered: ['comicvine', 'googlebooks'],
      bedethequeTicked: false,
      sources: ['comicvine', 'googlebooks'],
    });
  });

  it('leaves out an API disabled in the settings', () => {
    expect(lookupSources({ ...all, comicVineEnabled: false }, none, null).offered).toEqual(['googlebooks']);
    expect(lookupSources({ ...all, googleBooksEnabled: false }, none, null).offered).toEqual(['comicvine']);
  });

  it('keeps an unticked API offered but out of the search', () => {
    const result = lookupSources(all, new Set<MetadataApiSource>(['comicvine']), null);
    expect(result.offered).toEqual(['comicvine', 'googlebooks']);
    expect(result.sources).toEqual(['googlebooks']);
  });

  it('ticks Bédéthèque as the setting says until the user chooses', () => {
    expect(lookupSources({ ...all, bedethequeSearchByDefault: true }, none, null)).toMatchObject({
      bedethequeTicked: true,
      sources: ['comicvine', 'googlebooks', 'bedetheque'],
    });
  });

  it("follows the user's choice for Bédéthèque over the setting", () => {
    expect(lookupSources({ ...all, bedethequeSearchByDefault: true }, none, false).sources).not.toContain('bedetheque');
    expect(lookupSources(all, none, true).sources).toContain('bedetheque');
  });

  it('offers nothing and leaves Bédéthèque unticked before the settings are loaded', () => {
    expect(lookupSources(null, none, null)).toEqual({ offered: [], bedethequeTicked: false, sources: [] });
  });
});

describe('enterAppliesReview', () => {
  const enter: EnterKeyEvent = {
    key: 'Enter',
    defaultPrevented: false,
    isComposing: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  };
  /** An element matching the given selectors (as `closest()` would, from itself or an ancestor). */
  const element = (...matches: string[]): KeyTarget => ({
    closest: (selectors: string) => (selectors.split(/,\s*/).some((selector) => matches.includes(selector)) ? {} : null),
  });
  const body = element();
  const field = element('[role="dialog"]');

  it('saves on a plain Enter in a field of the dialog', () => {
    expect(enterAppliesReview(enter, field, body)).toBe(true);
  });

  it('saves on a plain Enter with nothing focused', () => {
    expect(enterAppliesReview(enter, body, body)).toBe(true);
    expect(enterAppliesReview(enter, null, body)).toBe(true);
  });

  it('ignores another key', () => {
    expect(enterAppliesReview({ ...enter, key: 'a' }, field, body)).toBe(false);
  });

  it('ignores an Enter already handled or composing', () => {
    expect(enterAppliesReview({ ...enter, defaultPrevented: true }, field, body)).toBe(false);
    expect(enterAppliesReview({ ...enter, isComposing: true }, field, body)).toBe(false);
  });

  it('ignores an Enter with a modifier', () => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) {
      expect(enterAppliesReview({ ...enter, [modifier]: true }, field, body)).toBe(false);
    }
  });

  it('leaves their Enter to a button, link, list, text area or tab', () => {
    for (const own of ['button', 'a', 'select', 'textarea', '[role="tab"]']) {
      expect(enterAppliesReview(enter, element(own, '[role="dialog"]'), body)).toBe(false);
    }
  });

  it('ignores an Enter typed outside any dialog', () => {
    expect(enterAppliesReview(enter, element(), body)).toBe(false);
  });
});
