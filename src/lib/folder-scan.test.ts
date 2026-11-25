import { beforeAll, describe, expect, it } from 'vitest';

import { applyLanguage } from '@/shared/i18n';
import type { ScanResult } from '@/shared/library';
import { folderScanParts } from './folder-scan';

type Ok = Extract<ScanResult, { status: 'ok' }>;

const base: Ok = {
  status: 'ok',
  directory: '/bd',
  added: 2,
  skipped: 0,
  failed: 0,
  failures: [],
  total: 2,
  cancelled: false,
  organization: { moved: 0, failed: 0, pending: null },
};

beforeAll(() => applyLanguage('fr'));

describe('folderScanParts', () => {
  it('counts what a complete scan did', () => {
    expect(folderScanParts({ ...base, added: 2, skipped: 1, failed: 1, total: 4 })).toEqual([
      '2 BD ajoutées depuis /bd',
      '1 déjà présente',
      '1 illisible',
    ]);
  });

  it('says first that a stopped scan was stopped, then what it did', () => {
    expect(folderScanParts({ ...base, added: 1, total: 5, cancelled: true })).toEqual([
      'Analyse arrêtée avant la fin',
      '1 BD ajoutée depuis /bd',
    ]);
  });

  it('says when the folder held no comics', () => {
    expect(folderScanParts({ ...base, added: 0, total: 0 })).toEqual(['Aucune BD trouvée dans /bd']);
  });
});
