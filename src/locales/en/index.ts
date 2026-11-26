// Every namespace of this locale. A namespace is one area of the app (a page, a dialog, the main
// process's messages), so each file stays small and a change touches only the area it is about.
import achievements from './achievements';
import authors from './authors';
import book from './book';
import bookEdit from './book-edit';
import common from './common';
import dialogs from './dialogs';
import errors from './errors';
import home from './home';
import lists from './lists';
import library from './library';
import menu from './menu';
import metadata from './metadata';
import nav from './nav';
import reader from './reader';
import settings from './settings';
import stats from './stats';
import users from './users';

export default { achievements, authors, book, bookEdit, common, dialogs, errors, home, library, lists, menu, metadata, nav, reader, settings, stats, users };
