import { describe, expect, it } from 'vitest';

import { fitScale, stepZoom, zoomScale } from './reader-zoom';

describe('fitScale', () => {
  it('makes the content fit on its tightest side', () => {
    expect(fitScale({ width: 1000, height: 500 }, { width: 400, height: 400 })).toBe(1.25);
    expect(fitScale({ width: 400, height: 1000 }, { width: 400, height: 400 })).toBe(1);
    expect(fitScale({ width: 200, height: 1000 }, { width: 400, height: 400 })).toBe(0.5);
  });

  it('is 1 for content without a size', () => {
    expect(fitScale({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe(1);
  });
});

describe('zoomScale', () => {
  it('uses a level as it is, and fits for "fit" once the container is known', () => {
    expect(zoomScale(0.75, null, { width: 10, height: 10 })).toBe(0.75);
    expect(zoomScale('fit', { width: 100, height: 50 }, { width: 10, height: 10 })).toBe(5);
    expect(zoomScale('fit', null, { width: 10, height: 10 })).toBe(1);
  });
});

describe('stepZoom', () => {
  it('steps through the menu levels', () => {
    expect(stepZoom(1, 1, null)).toBe(1.1);
    expect(stepZoom(1, -1, null)).toBe(0.9);
    expect(stepZoom(2, 1, null)).toBe(2);
    expect(stepZoom(0.5, -1, null)).toBe(0.5);
  });

  it('puts "fit" where its factor falls among the levels', () => {
    // Fit is 0.6: between 0.5 and 0.75.
    expect(stepZoom(0.75, -1, 0.6)).toBe('fit');
    expect(stepZoom('fit', -1, 0.6)).toBe(0.5);
    expect(stepZoom('fit', 1, 0.6)).toBe(0.75);
    expect(stepZoom(0.5, 1, 0.6)).toBe('fit');
  });

  it('steps from "fit" to the next level above its factor', () => {
    expect(stepZoom('fit', 1, 1.3)).toBe(1.5);
    expect(stepZoom('fit', -1, 1.3)).toBe(1.25);
  });

  it('stays on "fit" while its factor is unknown', () => {
    expect(stepZoom('fit', 1, null)).toBe('fit');
    expect(stepZoom('fit', -1, null)).toBe('fit');
  });

  it('does not move at either end', () => {
    expect(stepZoom('fit', 1, 3)).toBe('fit');
    expect(stepZoom('fit', -1, 0.2)).toBe('fit');
  });
});
