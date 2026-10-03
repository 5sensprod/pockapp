// frontend/modules/stick/labels/components/ui/ChampValide.jsx
//
// UN NOMBRE SAISI AU CLAVIER, validé à Entrée ou en sortant du champ — un
// BROUILLON local d'ici là. Borner à chaque frappe rendait « 36 » intapable :
// « 3 » était aussitôt remonté au minimum, 4, et l'on obtenait 46.
//
// - flèches haut / bas : ±`pas` (Maj : ×10), appliqué tout de suite ;
// - Entrée et Échap rendent le focus : Suppr et H du canvas reviennent ;
// - `vide` : la valeur écrite quand on vide le champ (ex. `undefined` pour
//   « automatique ») ; sans elle, vider le champ ne change rien ;
// - `valeur` peut être `''` (rien de réglé) : `placeholder` s'affiche.

import React, { useEffect, useState } from 'react';
import { CHAMP } from './styles';

const borner = (v, min, max) => Math.min(max, Math.max(min, v));
const SANS = Symbol('sans');

const ChampValide = ({ valeur, onValeur, min = -Infinity, max = Infinity, pas = 1, titre, placeholder, vide = SANS, className = '' }) => {
  const [brouillon, setBrouillon] = useState(null);
  useEffect(() => setBrouillon(null), [valeur]);
  const valider = () => {
    if (brouillon === null) return;
    const texte = String(brouillon).trim();
    setBrouillon(null);
    if (texte === '') {
      if (vide !== SANS) onValeur(vide);
      return;
    }
    const n = Number.parseFloat(texte.replace(',', '.'));
    if (Number.isFinite(n)) onValeur(borner(n, min, max));
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={brouillon ?? valeur ?? ''}
      placeholder={placeholder}
      onChange={(e) => setBrouillon(e.target.value)}
      onBlur={valider}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setBrouillon(null);
          e.currentTarget.blur();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          setBrouillon(null);
          const depart = Number.isFinite(Number(valeur)) && valeur !== '' ? Number(valeur) : Number.isFinite(min) ? min : 0;
          onValeur(borner(depart + (e.key === 'ArrowUp' ? 1 : -1) * pas * (e.shiftKey ? 10 : 1), min, max));
        }
      }}
      title={titre}
      aria-label={titre}
      className={`${CHAMP} text-center ${className}`}
    />
  );
};

export default ChampValide;
