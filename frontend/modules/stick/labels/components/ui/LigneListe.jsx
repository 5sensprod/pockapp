// frontend/modules/stick/labels/components/ui/LigneListe.jsx
//
// UNE RANGÉE DE LISTE (calques, produits du tirage, éléments liés) : 32 px,
// 40 avec un `detail`. La rangée active est en bleu LÉGER — l'aplat reste à
// l'onglet ouvert et au bouton principal — ou en orange léger si `produit`.
//
// - `avant` : ce qui précède l'icône (une poignée, un point) ;
// - `etats` : à droite, TOUJOURS visibles (verrouillé, masqué, lié) ;
// - `actions` : à droite, au survol et au focus seulement ;
// - `attenue` : titre en gris (un calque masqué) — pas toute la rangée ;
// - le reste des props va à la rangée : `draggable`, `onDragStart`…
//
// Un `div` et non un `<button>` : `etats` et `actions` portent des boutons.

import React from 'react';

const LigneListe = ({
  icone: Icone,
  titre,
  detail,
  actif = false,
  produit = false,
  attenue = false,
  avant,
  etats,
  actions,
  onClic,
  className = '',
  ...reste
}) => {
  const fond = actif
    ? produit
      ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';
  return (
    <div
      onClick={onClic}
      className={`group ${detail ? 'h-10' : 'h-8'} px-2 flex items-center gap-2 rounded-md cursor-pointer transition-colors ${fond} ${className}`}
      {...reste}
    >
      {avant}
      {Icone && <Icone className="h-4 w-4 flex-none" />}
      <span className="flex-1 min-w-0">
        <span className={`block truncate text-xs ${attenue ? 'text-gray-400 dark:text-gray-500' : ''}`} title={typeof titre === 'string' ? titre : undefined}>
          {titre}
        </span>
        {detail && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{detail}</span>}
      </span>
      {actions && <span className="hidden group-hover:flex group-focus-within:flex items-center flex-none">{actions}</span>}
      {etats && <span className="flex items-center flex-none">{etats}</span>}
    </div>
  );
};

export default LigneListe;
