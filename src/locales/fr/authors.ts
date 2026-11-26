import type en from '../en/authors';
import type { Translation } from '../types';

const authors: Translation<typeof en> = {
  title: 'Auteurs',
  intro: 'Toutes les personnes créditées sur un livre de la bibliothèque.',
  searchLabel: 'Rechercher un auteur',
  searchPlaceholder: 'Rechercher un auteur…',
  noMatch: 'Aucun auteur ne correspond à « {{search}} ».',
  empty: 'Aucun livre n’a de crédits pour le moment. Ajoute-les avec « Rechercher les infos » ou « Modifier la fiche » sur un livre de la bibliothèque.',
  bookCount_one: '{{count}} livre',
  bookCount_other: '{{count}} livres',
  letterHeading: 'Auteurs commençant par {{letter}}',
  backToIndex: 'Auteurs',
  notFound: 'Auteur introuvable',
  notFoundDetail: 'Cette personne n’est plus créditée sur aucun livre de la bibliothèque.',
  roles: 'Rôles : {{roles}}',
  readCount: 'Lus : {{read}} / {{count}}',
  roleFilter: 'Filtrer par rôle',
  allRoles: 'Tous',
  rolesOnBook: 'Rôle : {{roles}}',
};

export default authors;
