// frontend/modules/stick/labels/components/templates/PagePanel.jsx
//
// L'onglet « Page » : la page elle-même — sa taille (`FormatPanel`) puis son
// fond (`FondPanel`), dans UN panneau (3 octobre 2026). Autrefois deux
// onglets, puis deux sous-onglets : le fond était à un clic de plus pour une
// seule rangée.
import React from 'react';
import FormatPanel from './FormatPanel';
import FondPanel from './FondPanel';
import { PANNEAU } from '../ui/styles';

const PagePanel = ({ onOpenTool }) => (
  <div className={PANNEAU}>
    <FormatPanel onOpenTool={onOpenTool} />
    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
      <FondPanel />
    </div>
  </div>
);

export default PagePanel;
