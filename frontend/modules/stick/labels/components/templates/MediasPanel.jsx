// frontend/modules/stick/labels/components/templates/MediasPanel.jsx
//
// Onglet « Médias » de la barre latérale : les images du POSTE (importées à
// la main, `UploadTemplate`) et celles de POCKETSTOCK (entreprise, marques,
// catégories, `BibliothequeCatalogue`) et les images DÉTOURÉES (« Génération »,
// la même liste que « Mes images », filtrée), et les PHOTOS d'une banque
// d'images (« Photos » : le mini-chat `PhotosChat`, et dessous les photos
// gardées), sous les onglets communs (`OngletsPanneau`).
import React from 'react';
import OngletsPanneau from './OngletsPanneau';
import UploadTemplate from './UploadTemplate';
import BibliothequeCatalogue from './BibliothequeCatalogue';
import GenererImage from './GenererImage';
import PhotosChat from './PhotosChat';

const MediasPanel = (props) => (
  <OngletsPanneau
    onglets={[
      { id: 'poste', libelle: 'Mes images', contenu: <UploadTemplate {...props} /> },
      { id: 'pocketstock', libelle: 'PocketStock', contenu: <BibliothequeCatalogue {...props} /> },
      { id: 'generation', libelle: 'Génération', contenu: <UploadTemplate {...props} origine="generation" entete={<GenererImage />} /> },
      { id: 'photos', libelle: 'Photos', contenu: <UploadTemplate {...props} origine="photo" entete={<PhotosChat />} /> },
    ]}
  />
);

export default MediasPanel;
