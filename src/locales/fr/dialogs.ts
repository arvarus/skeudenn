import type en from '../en/dialogs';
import type { Translation } from '../types';

const dialogs: Translation<typeof en> = {
  openComic: 'Ouvrir une BD',
  comicFiles: 'Comics et PDF',
  addFile: 'Ajouter une BD',
  addFolders: 'Ajouter des dossiers de BD',
  chooseDatabaseFolder: 'Choisir le dossier de la base de données',
  chooseOrganizationFolder: 'Choisir le dossier de la bibliothèque organisée',
  relinkFolder: 'Où se trouve le dossier « {{folder}} » sur cet ordinateur ?',
  exportData: 'Exporter les données',
  importData: 'Importer des données',
  pickAvatar: 'Choisir une photo de profil',
  imageFiles: 'Images',
};

export default dialogs;
