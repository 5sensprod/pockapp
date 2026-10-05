// frontend/modules/stick/labels/components/ui/ChampRecherche.jsx
//
// LA RECHERCHE d'un panneau (modèles, marques, polices) : quatre écritures, de
// 30 à 38 px. Ici 28 px, sur `CHAMP`, loupe à gauche, croix quand il y a un
// texte. Échap vide le champ, puis rend le focus : Suppr et H du canvas
// reviennent.

import React from 'react';
import { Search, X } from 'lucide-react';
import { CHAMP } from './styles';

const ChampRecherche = ({ valeur, onValeur, placeholder = 'Chercher…', label, autoFocus = false, className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
    <input
      type="text"
      value={valeur}
      onChange={(e) => onValeur(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        if (valeur) onValeur('');
        else e.currentTarget.blur();
      }}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={label ?? placeholder}
      className={`${CHAMP} w-full pl-7 pr-7`}
    />
    {valeur && (
      <button
        type="button"
        onClick={() => onValeur('')}
        title="Effacer"
        aria-label="Effacer la recherche"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-600"
      >
        <X className="h-3 w-3" />
      </button>
    )}
  </div>
);

export default ChampRecherche;
