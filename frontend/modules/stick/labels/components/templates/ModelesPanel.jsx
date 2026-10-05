// frontend/modules/stick/labels/components/templates/ModelesPanel.jsx
//
// L'onglet « Modèles » : les modèles du poste (`TemplateManager`) et les
// modèles prêts, livrés avec l'éditeur (`DesignTemplates`), autrefois deux
// onglets. Les deux partagent la même grille (`ui/TemplateGrid`).
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

  // Enregistrer un document neuf ramène sur « Mes modèles »
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
          libelle: 'Mes modèles',
          contenu: <TemplateManager stageRef={stageRef} docNode={docNode} onClose={onClose} />,
        },
        {
          id: 'designs',
          libelle: 'Modèles prêts',
          contenu: <DesignTemplates stageRef={stageRef} docNode={docNode} onClose={onClose} />,
        },
      ]}
    />
  );
};

export default ModelesPanel;
