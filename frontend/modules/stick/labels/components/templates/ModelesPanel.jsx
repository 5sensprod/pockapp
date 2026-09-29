// frontend/modules/stick/labels/components/templates/ModelesPanel.jsx
//
// L'onglet « Templates » : les templates du poste (`TemplateManager`) et les
// designs d'usine (`DesignTemplates`), autrefois deux onglets. Les deux
// composants sont repris TELS QUELS, côte à côte.
//
// Les deux restent MONTÉS, l'inactif seulement masqué (`OngletsPanneau`) : `TemplateManager`
// écoute `request-template-save` (envoyé par `LabelPage` pour enregistrer un
// document neuf). Démonté parce que l'on regardait les designs, il ne
// l'entendrait pas.
import React, { useState } from 'react';
import TemplateManager from './TemplateManager';
import DesignTemplates from './DesignTemplates';
import OngletsPanneau from './OngletsPanneau';

const ModelesPanel = ({ stageRef, docNode, onClose }) => {
  const [vue, setVue] = useState('mine');

  // Enregistrer un document neuf ramène sur « Mes templates »
  React.useEffect(() => {
    const versMine = () => setVue('mine');
    window.addEventListener('request-template-save', versMine);
    return () => window.removeEventListener('request-template-save', versMine);
  }, []);

  return (
    <OngletsPanneau
      actif={vue}
      onChange={setVue}
      onglets={[
        {
          id: 'mine',
          libelle: 'Mes templates',
          contenu: <TemplateManager stageRef={stageRef} docNode={docNode} onClose={onClose} />,
        },
        {
          id: 'designs',
          libelle: 'Designs',
          contenu: <DesignTemplates stageRef={stageRef} docNode={docNode} onClose={onClose} />,
        },
      ]}
    />
  );
};

export default ModelesPanel;
