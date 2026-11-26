import { describe, expect, it } from 'vitest';

import { PickedFolders } from './picked-folders';

describe('PickedFolders', () => {
  it('hands the folders back once', () => {
    const picked = new PickedFolders();
    const token = picked.add(['/a', '/b']);
    expect(picked.take(token)).toEqual(['/a', '/b']);
    expect(picked.take(token)).toBeUndefined();
  });

  it('knows nothing of a token it never issued', () => {
    expect(new PickedFolders().take('made-up')).toBeUndefined();
  });

  it('keeps each pick apart', () => {
    const picked = new PickedFolders();
    const first = picked.add(['/a']);
    const second = picked.add(['/b']);
    expect(first).not.toBe(second);
    expect(picked.take(second)).toEqual(['/b']);
    expect(picked.take(first)).toEqual(['/a']);
  });

  it('keeps only the latest picks', () => {
    const picked = new PickedFolders();
    const oldest = picked.add(['/old']);
    for (let i = 0; i < 5; i += 1) picked.add([`/new-${i}`]);
    expect(picked.take(oldest)).toBeUndefined();
  });
});
