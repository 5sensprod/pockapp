// frontend/modules/stick/labels/components/templates/MediasPanel.jsx
//
// Onglet « Médias » de la barre latérale : les images du POSTE (importées à
// la main, `UploadTemplate`) et celles de POCKETSTOCK (entreprise, marques,
// catégories, `BibliothequeCatalogue`) et les images DÉTOURÉES (« Génération »,
// la même liste que « Mes images », filtrée), sous les onglets communs
// (`OngletsPanneau`).
import React from 'react';
import OngletsPanneau from './OngletsPanneau';
import UploadTemplate from './UploadTemplate';
import BibliothequeCatalogue from './BibliothequeCatalogue';

const MediasPanel = (props) => (
  <OngletsPanneau
    onglets={[
      { id: 'poste', libelle: 'Mes images', contenu: <UploadTemplate {...props} /> },
      { id: 'pocketstock', libelle: 'PocketStock', contenu: <BibliothequeCatalogue {...props} /> },
      { id: 'generation', libelle: 'Génération', contenu: <UploadTemplate {...props} origine="generation" /> },
    ]}
  />
);

export default MediasPanel;
