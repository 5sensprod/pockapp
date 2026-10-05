// frontend/modules/stick/labels/components/templates/PagePanel.jsx
//
// L'onglet « Page » : la page elle-même — sa taille (`FormatPanel`) puis son
// fond (`FondPanel`), dans UN panneau (3 octobre 2026). Autrefois deux
// onglets, puis deux sous-onglets : le fond était à un clic de plus pour une
// seule rangée. Puis « Embellir par IA » (`EmbellirPage`, 6 octobre 2026), qui
// a besoin du groupe du document pour rendre la page ; absent en planche.
import React from 'react';
import FormatPanel from './FormatPanel';
import FondPanel from './FondPanel';
import EmbellirPage from './EmbellirPage';
import { PANNEAU } from '../ui/styles';

const PagePanel = ({ onOpenTool, docNode }) => (
  <div className={PANNEAU}>
    <FormatPanel onOpenTool={onOpenTool} />
    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
      <FondPanel />
    </div>
    <EmbellirPage docNode={docNode} />
  </div>
);

export default PagePanel;
