import type en from '../en/stats';
import type { Translation } from '../types';

const stats: Translation<typeof en> = {
  title: 'Statistiques',
  intro: 'Votre bibliothèque et votre lecture. Les livres terminés et le temps de lecture sont enregistrés à partir de maintenant.',
  loadFailed: 'Impossible de charger les statistiques.',
  totals: {
    books: 'Livres',
    size: 'Taille de la bibliothèque',
    read: 'Livres lus',
    time: 'Temps de lecture',
  },
  period: {
    label: 'Regrouper par',
    week: 'Semaine',
    month: 'Mois',
    year: 'Année',
  },
  charts: {
    title: 'Statistiques par période',
    aria: 'Livres lus, livres dans la bibliothèque et temps de lecture par {{period}}',
    scaleNote: 'Chaque statistique est à l’échelle de sa plus haute barre ; survolez un groupe de barres pour les valeurs exactes.',
    booksRead: 'Livres lus',
    time: 'Temps de lecture',
    libraryGrowth: 'Livres dans la bibliothèque',
    libraryGrowthNote: 'Calculé d’après la date d’ajout de chaque livre ; les livres supprimés depuis ne sont pas comptés.',
    empty: 'Rien d’enregistré pour cette période.',
    periodWeek: 'semaine',
    periodMonth: 'mois',
    periodYear: 'année',
  },
  duration: {
    minutes: '{{count}} min',
    hours: '{{count}} h',
    hoursMinutes: '{{hours}} h {{minutes}} min',
  },
  barBooks_one: '{{count}} livre',
  barBooks_other: '{{count}} livres',
};

export default stats;
