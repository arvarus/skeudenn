import type en from '../en/common';
import type { Translation } from '../types';

const common: Translation<typeof en> = {
  appName: 'Skeudenn',
  cancel: 'Annuler',
  close: 'Fermer',
  open: 'Ouvrir',
  save: 'Enregistrer',
  loading: 'Chargement…',
  pageOf: 'Page {{page}} / {{total}}',
  coverOf: 'Couverture de {{title}}',
  labelValue: '{{label}} : {{value}}',
  update: {
    available: 'La version {{version}} est disponible.',
    download: 'Télécharger',
  },
  sizeUnits: {
    b: 'o',
    kb: 'Ko',
    mb: 'Mo',
    gb: 'Go',
    tb: 'To',
  },
};

export default common;
