import { afterEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '@/shared/i18n';

import { folderName, resyncStepLabel } from './resync-step';

afterEach(() => applyLanguage('en'));

describe('folderName', () => {
  it('keeps the last segment, whatever the separator', () => {
    expect(folderName('/data/Comics')).toBe('Comics');
    expect(folderName('C:\\Users\\me\\BD\\')).toBe('BD');
    expect(folderName('Comics')).toBe('Comics');
  });
});

describe('resyncStepLabel', () => {
  it('names the step and its place', () => {
    expect(resyncStepLabel({ index: 2, count: 5, name: 'scan', folder: '/data/Comics' })).toBe(
      'Step 2/5: looking through Comics',
    );
    expect(resyncStepLabel({ index: 4, count: 5, name: 'covers', folder: '' })).toBe('Step 4/5: extracting the covers');
  });

  it('follows the interface language', () => {
    applyLanguage('fr');
    expect(resyncStepLabel({ index: 3, count: 3, name: 'missing', folder: '' })).toBe(
      'Étape 3/3 : vérification des BD ajoutées une par une',
    );
  });
});
