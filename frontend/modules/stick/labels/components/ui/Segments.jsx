// frontend/modules/stick/labels/components/ui/Segments.jsx
//
// LE CONTRÔLE SEGMENTÉ : 2 à 4 choix exclusifs, d'un seul tenant (sens d'une
// ondulation, Remplir / Contenir). Au-delà, une liste déroulante. Des
// boutons, pas des `<input>` : les raccourcis du canvas restent actifs.
//
// `options` : [{ id, label, titre? }].

import React from 'react';

const Segments = ({ options, valeur, onValeur, label }) => (
  <div className="flex p-0.5 rounded-md bg-gray-100 dark:bg-gray-700" role="group" aria-label={label}>
    {options.map((o) => {
      const actif = o.id === valeur;
      return (
        <button
          key={String(o.id)}
          type="button"
          aria-pressed={actif}
          title={o.titre}
          onClick={() => onValeur(o.id)}
          className={`flex-1 h-6 px-2 text-xs rounded transition-colors ${
            actif
              ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-white shadow-sm font-medium'
              : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

export default Segments;
