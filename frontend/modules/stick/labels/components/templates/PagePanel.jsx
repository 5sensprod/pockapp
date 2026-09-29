// frontend/modules/stick/labels/components/templates/PagePanel.jsx
//
// L'onglet « Format et fond » : la page elle-même — sa taille (`FormatPanel`)
// et son fond (`FondPanel`). Autrefois deux onglets ; les deux panneaux sont
// repris TELS QUELS, sous les onglets communs (`OngletsPanneau`).
import React from 'react';
import OngletsPanneau from './OngletsPanneau';
import FormatPanel from './FormatPanel';
import FondPanel from './FondPanel';

const PagePanel = () => (
  <OngletsPanneau
    onglets={[
      { id: 'format', libelle: 'Taille', contenu: <FormatPanel /> },
      {
        id: 'fond',
        libelle: 'Fond',
        // FondPanel n'a presque pas de marge intérieure : alignée sur Taille
        contenu: (
          <div className="p-3">
            <FondPanel />
          </div>
        ),
      },
    ]}
  />
);

export default PagePanel;
