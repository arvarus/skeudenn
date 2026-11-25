import { describe, expect, it } from 'vitest';

import { exportFileName } from './export-service';

describe('exportFileName', () => {
  it('includes the local date and time, zero-padded', () => {
    expect(exportFileName(new Date(2026, 9, 2, 14, 30, 59))).toBe(
      'tankobon-export-2026-10-02-14h30.json',
    );
    expect(exportFileName(new Date(2026, 0, 5, 7, 4))).toBe(
      'tankobon-export-2026-01-05-07h04.json',
    );
  });

  it('uses the local day, not the UTC one, around midnight', () => {
    expect(exportFileName(new Date(2026, 11, 31, 23, 59))).toBe(
      'tankobon-export-2026-12-31-23h59.json',
    );
    expect(exportFileName(new Date(2027, 0, 1, 0, 0))).toBe(
      'tankobon-export-2027-01-01-00h00.json',
    );
  });
});
