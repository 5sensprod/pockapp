// frontend/modules/stick/labels/components/ui/Bouton.jsx
//
// LE bouton des panneaux. Huit écritures du bouton principal en quatre teintes
// (bleu-500, bleu-600, vert, indigo) : ici, les quatre variantes du système.
//
// - `principal` : aplat bleu — UN seul par panneau ;
// - `secondaire` : bordure grise, le défaut ;
// - `discret` : un lien ;
// - `destructif` : icône rouge seule, jamais d'aplat (`titre` obligatoire).
// - `grand` : 32 px au lieu de 28, pour le pied collant d'un panneau ;
// - `plein` : toute la largeur.

import React from 'react';
import { BOUTON_ACTION, BOUTON_DESTRUCTIF, BOUTON_DISCRET, BOUTON_PRINCIPAL } from './styles';

const VARIANTES = {
  principal: `${BOUTON_PRINCIPAL} disabled:opacity-50 disabled:cursor-not-allowed`,
  secondaire: BOUTON_ACTION,
  discret: BOUTON_DISCRET,
  destructif: `${BOUTON_DESTRUCTIF} disabled:opacity-50 disabled:cursor-not-allowed`,
};

const Bouton = ({
  variante = 'secondaire',
  icone: Icone,
  plein = false,
  grand = false,
  titre,
  desactive = false,
  onClic,
  className = '',
  children,
}) => {
  const base = VARIANTES[variante] ?? VARIANTES.secondaire;
  const classes = grand ? base.replace('h-7', 'h-8') : base;
  return (
    <button
      type="button"
      onClick={onClic}
      disabled={desactive}
      title={titre}
      aria-label={children ? undefined : titre}
      className={`${classes} ${plein ? 'w-full' : ''} ${className}`}
    >
      {Icone && <Icone className={variante === 'discret' ? 'inline h-3 w-3 mr-1' : 'h-4 w-4 flex-none'} />}
      {children}
    </button>
  );
};

export default Bouton;
