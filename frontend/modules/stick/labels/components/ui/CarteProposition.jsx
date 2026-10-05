// frontend/modules/stick/labels/components/ui/CarteProposition.jsx
//
// CE QU'UN PANNEAU PROPOSE D'AJOUTER (un titre, une forme, un champ de la
// fiche). Douze écritures de la carte encadrée à gros padding ; ici, deux
// dispositions, sans bordure ni ombre :
//
// - `tuile` : 64 px, centrée — un `apercu` (ou une `icone`) et un nom dessous
//   (`haute` : 84 px, pour une miniature, un nom ET un détail) ;
// - `ligne` : pleine largeur, 40 px au moins — icône à gauche, `titre`, `detail`.
// - `produit` : ce qui vient de la fiche — titre et survol orange ;
// - `actif` : la proposition en cours (le format de la page), en bleu léger.

import React from 'react';
import { TUILE, TUILE_PRODUIT } from './styles';

const CarteProposition = ({
  titre,
  detail,
  apercu,
  icone: Icone,
  disposition = 'tuile',
  produit = false,
  actif = false,
  haute = false,
  desactive = false,
  titreInfobulle,
  onAjout,
  className = '',
}) => {
  const couleurTitre = produit
    ? 'text-orange-600 dark:text-orange-400'
    : actif
      ? 'text-blue-700 dark:text-blue-300'
      : 'text-gray-800 dark:text-gray-200';

  if (disposition === 'ligne') {
    return (
      <button
        type="button"
        onClick={onAjout}
        disabled={desactive}
        title={titreInfobulle}
        className={`w-full min-h-10 px-2 py-1 flex items-center gap-2 text-left rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none ${
          produit ? 'hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        } ${className}`}
      >
        {apercu ?? (Icone && <Icone className={`h-4 w-4 flex-none ${produit ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400'}`} />)}
        <span className="flex-1 min-w-0">
          <span className={`block truncate text-xs ${couleurTitre}`}>{titre}</span>
          {detail && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{detail}</span>}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAjout}
      disabled={desactive}
      title={titreInfobulle}
      className={`${produit ? TUILE_PRODUIT : TUILE} ${
        actif ? 'bg-blue-100 dark:bg-blue-900/50' : ''
      } ${haute ? 'h-[84px]' : 'h-16'} min-w-0 px-2 flex flex-col items-center justify-center gap-1 ${className}`}
    >
      {apercu ?? (Icone && <Icone className="h-5 w-5 text-gray-600 dark:text-gray-300" />)}
      <span className={`max-w-full truncate text-[11px] leading-tight ${couleurTitre}`}>{titre}</span>
      {detail && <span className="max-w-full truncate text-[11px] leading-tight text-gray-500 dark:text-gray-400">{detail}</span>}
    </button>
  );
};

export default CarteProposition;
