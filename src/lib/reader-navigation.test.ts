import { describe, expect, it } from 'vitest';

import {
  directionalControls,
  disabledControls,
  pageTurnForKey,
  scrollEdgeAfterMove,
  scrollEdgeAfterTurn,
  type PageTurnKeyEvent,
} from './reader-navigation';

describe('directionalControls', () => {
  it('advances forward and retreats backward in left-to-right order', () => {
    expect(directionalControls('ltr', 'next', 'prev')).toEqual({ advance: 'next', retreat: 'prev' });
  });

  it('swaps them in right-to-left order', () => {
    expect(directionalControls('rtl', 'next', 'prev')).toEqual({ advance: 'prev', retreat: 'next' });
  });
});

describe('disabledControls', () => {
  it('disables the left zone on the first page and the right zone on the last in LTR', () => {
    expect(disabledControls('ltr', 0, 10)).toEqual({ isPrevDisabled: true, isNextDisabled: false });
    expect(disabledControls('ltr', 9, 10)).toEqual({ isPrevDisabled: false, isNextDisabled: true });
    expect(disabledControls('ltr', 4, 10)).toEqual({ isPrevDisabled: false, isNextDisabled: false });
  });

  it('swaps the sides in RTL', () => {
    expect(disabledControls('rtl', 0, 10)).toEqual({ isPrevDisabled: false, isNextDisabled: true });
    expect(disabledControls('rtl', 9, 10)).toEqual({ isPrevDisabled: true, isNextDisabled: false });
  });

  it('disables both on a single-page book', () => {
    expect(disabledControls('ltr', 0, 1)).toEqual({ isPrevDisabled: true, isNextDisabled: true });
  });
});

describe('scrollEdgeAfterTurn', () => {
  it('lands on the top when moving toward the end of the book', () => {
    expect(scrollEdgeAfterTurn(3, 4)).toBe('top');
  });

  it('lands on the bottom when going back', () => {
    expect(scrollEdgeAfterTurn(4, 3)).toBe('bottom');
  });
});

describe('scrollEdgeAfterMove', () => {
  it('follows the turn within a book', () => {
    expect(scrollEdgeAfterMove({ bookId: 'a', page: 3 }, { bookId: 'a', page: 4 })).toBe('top');
    expect(scrollEdgeAfterMove({ bookId: 'a', page: 4 }, { bookId: 'a', page: 3 })).toBe('bottom');
  });

  it('asks for nothing when the reader did not move', () => {
    expect(scrollEdgeAfterMove({ bookId: 'a', page: 3 }, { bookId: 'a', page: 3 })).toBeNull();
  });

  it('opens another book at the top, even at an earlier page than the previous book', () => {
    expect(scrollEdgeAfterMove({ bookId: 'a', page: 12 }, { bookId: 'b', page: 2 })).toBe('top');
    expect(scrollEdgeAfterMove({ bookId: 'a', page: 12 }, { bookId: 'b', page: 12 })).toBe('top');
  });
});

describe('pageTurnForKey', () => {
  const press = (key: string, rest: Partial<PageTurnKeyEvent> = {}): PageTurnKeyEvent => ({
    key,
    defaultPrevented: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    target: { tagName: 'BODY' },
    ...rest,
  });

  it('maps the reading keys to a turn', () => {
    expect(pageTurnForKey(press('ArrowRight'))).toBe('advance');
    expect(pageTurnForKey(press('PageDown'))).toBe('advance');
    expect(pageTurnForKey(press(' '))).toBe('advance');
    expect(pageTurnForKey(press('ArrowLeft'))).toBe('retreat');
    expect(pageTurnForKey(press('PageUp'))).toBe('retreat');
    expect(pageTurnForKey(press('a'))).toBeNull();
  });

  it('leaves a key with Ctrl, Alt or Meta to the browser (Alt+← is "back")', () => {
    expect(pageTurnForKey(press('ArrowLeft', { altKey: true }))).toBeNull();
    expect(pageTurnForKey(press('ArrowRight', { ctrlKey: true }))).toBeNull();
    expect(pageTurnForKey(press('ArrowRight', { metaKey: true }))).toBeNull();
  });

  it('ignores a key already handled elsewhere or typed in a field or a list', () => {
    expect(pageTurnForKey(press('ArrowRight', { defaultPrevented: true }))).toBeNull();
    expect(pageTurnForKey(press('ArrowRight', { target: { tagName: 'select' } }))).toBeNull();
    expect(pageTurnForKey(press(' ', { target: { tagName: 'INPUT' } }))).toBeNull();
    expect(pageTurnForKey(press(' ', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
  });

  it('lets Space activate a focused button or link, while arrows still turn the page', () => {
    expect(pageTurnForKey(press(' ', { target: { tagName: 'BUTTON' } }))).toBeNull();
    expect(pageTurnForKey(press(' ', { target: { tagName: 'A' } }))).toBeNull();
    expect(pageTurnForKey(press('ArrowRight', { target: { tagName: 'BUTTON' } }))).toBe('advance');
  });
});
