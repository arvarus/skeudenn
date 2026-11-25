import { describe, expect, it } from 'vitest';

import { errorText } from './errors';

describe('errorText', () => {
  it("gives an Error's message", () => {
    expect(errorText(new Error('boom'))).toBe('boom');
    expect(errorText(new TypeError('bad type'))).toBe('bad type');
  });

  it('turns anything else into a string', () => {
    expect(errorText('plain')).toBe('plain');
    expect(errorText(42)).toBe('42');
    expect(errorText(undefined)).toBe('undefined');
    expect(errorText(null)).toBe('null');
  });
});
