// frontend/modules/stick/labels/components/ui/Interrupteur.jsx
//
// L'interrupteur de la barre latérale : activer ou couper un effet, tout de
// suite. Un `<button role="switch">`, pas un `<input>` : après un clic, les
// raccourcis du canvas (Suppr, H) restent actifs — ils ignorent toute cible
// `INPUT` (`KonvaCanvas`).

import React from 'react';

const Interrupteur = ({ actif, onActif, label, desactive = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={!!actif}
    aria-label={label}
    title={label}
    disabled={desactive}
    onClick={() => onActif(!actif)}
    className={`relative flex-none w-8 h-[18px] rounded-full transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
      actif ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
    }`}
  >
    <span
      className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
        actif ? 'translate-x-[14px]' : ''
      }`}
    />
  </button>
);

export default Interrupteur;
