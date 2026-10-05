// frontend/modules/stick/labels/components/ui/ChampTexte.jsx
//
// LE CHAMP DE TEXTE LIBRE sur plusieurs lignes (une consigne). La matière de
// `CHAMP`, sans sa hauteur fixe. Avec `max`, le compteur n'apparaît qu'à
// l'approche de la limite. Ctrl+Entrée valide (`onValider`) ; Échap rend le
// focus, pour que Suppr et H du canvas reviennent.

import React from 'react';
import { AIDE, CHAMP } from './styles';

const ChampTexte = ({ valeur, onValeur, onValider, placeholder, label, max, lignes = 2, desactive = false }) => {
  const longueur = [...(valeur ?? '')].length;
  return (
    <div>
      <textarea
        value={valeur}
        onChange={(e) => onValeur(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
          else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onValider?.();
          }
        }}
        rows={lignes}
        maxLength={max}
        disabled={desactive}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className={`${CHAMP.replace('h-7 ', '').replace(' tabular-nums', '')} block w-full py-1.5 leading-snug resize-none`}
      />
      {max && longueur > max * 0.8 && (
        <p className={`${AIDE} text-right tabular-nums`}>
          {longueur} / {max}
        </p>
      )}
    </div>
  );
};

export default ChampTexte;
