import { beforeAll, describe, expect, it } from 'vitest';

import { applyLanguage } from '@/shared/i18n';
import type { ScanResult } from '@/shared/library';
import { fileAddParts, folderScanParts } from './folder-scan';

type Ok = Extract<ScanResult, { status: 'ok' }>;

const base: Ok = {
  status: 'ok',
  directory: '/bd',
  folders: 1,
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

  it('counts the folders instead of naming one when several were added', () => {
    expect(folderScanParts({ ...base, folders: 3, added: 5, skipped: 1, total: 6 })).toEqual(['5 BD ajoutées depuis 3 dossiers', '1 déjà présente']);
    expect(folderScanParts({ ...base, folders: 2, added: 0, total: 0 })).toEqual(['Aucune BD trouvée dans ces 2 dossiers']);
    expect(folderScanParts({ ...base, folders: 2, added: 1, total: 4, cancelled: true })).toEqual([
      'Analyse arrêtée avant la fin',
      '1 BD ajoutée depuis 2 dossiers',
    ]);
  });
});

describe('fileAddParts', () => {
  it('says nothing when the dialog was cancelled', () => {
    expect(fileAddParts({ status: 'cancelled' })).toBeNull();
  });

  it('names the file added', () => {
    expect(
      fileAddParts({ status: 'added', title: 'Astérix', organization: { moved: 0, failed: 0, pending: null } }),
    ).toEqual(['« Astérix » ajouté à la bibliothèque']);
  });

  it('names the file already in the library', () => {
    expect(fileAddParts({ status: 'exists', title: 'Astérix' })).toEqual(['« Astérix » est déjà dans la bibliothèque']);
  });

  it('shows the error as it came', () => {
    expect(fileAddParts({ status: 'error', message: 'Fichier illisible' })).toEqual(['Fichier illisible']);
  });
});
