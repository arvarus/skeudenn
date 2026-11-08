import type en from '../en/nav';
import type { Translation } from '../types';

const nav: Translation<typeof en> = {
  home: 'Accueil',
  library: 'Bibliothèque',
  readingLists: 'Listes de lecture',
  achievements: 'Accomplissements',
  reader: 'Lecteur',
  stats: 'Statistiques',
  settings: 'Paramètres',
  about: 'À propos',
  expandSidebar: 'Développer le panneau latéral',
  collapseSidebar: 'Réduire le panneau latéral',
  syncRunning: 'Synchronisation…',
  syncProgress: 'Synchronisation… {{processed}} / {{total}}',
  syncLast: 'Dernière synchronisation : {{date}}',
  syncNever: 'Jamais synchronisée',
  syncStart: 'Synchroniser la bibliothèque',
  syncStop: 'Arrêter la synchronisation',
  syncStopping: 'Arrêt en cours…',
  syncStopped: 'Synchronisation arrêtée',
  syncCount: '{{processed}} / {{total}}',
  syncStep: 'Étape {{index}}/{{count}} : {{name}}',
  syncSteps: {
    scan: 'parcours de {{folder}}',
    nfo: 'écriture des fichiers .nfo',
    covers: 'extraction des couvertures',
    missing: 'vérification des BD ajoutées une par une',
  },
};

export default nav;
