// frontend/modules/stick/labels/components/ui/ChampValide.jsx
//
// LE CHAMP NUMÉRIQUE de l'éditeur. UN NOMBRE SAISI AU CLAVIER, validé à Entrée
// ou en sortant du champ — un BROUILLON local d'ici là. Borner à chaque frappe
// rendait « 36 » intapable : « 3 » était aussitôt remonté au minimum, 4, et
// l'on obtenait 46.
//
// - **deux flèches DANS le champ**, à droite : ±`pas` (Maj : ×10). Ce sont les
//   mêmes partout — les `<input type="number">` montraient celles du
//   navigateur, différentes d'un poste à l'autre, et d'autres champs n'en
//   avaient aucune. `sansPas` les retire quand le champ est déjà encadré de
//   « − » et « + » (taille de la police, quantité) ;
// - flèches haut / bas du clavier : pareil, appliqué tout de suite ;
// - Entrée et Échap rendent le focus : Suppr et H du canvas reviennent ;
// - `vide` : la valeur écrite quand on vide le champ (ex. `undefined` pour
//   « automatique ») ; sans elle, vider le champ ne change rien ;
// - `valeur` peut être `''` (rien de réglé) : `placeholder` s'affiche ;
// - `className` : la LARGEUR (`w-14`), portée par le cadre.

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CHAMP } from './styles';

const borner = (v, min, max) => Math.min(max, Math.max(min, v));
// 1,5 + 0,5 doit faire 2, pas 2,0000000000000004
const net = (v) => Math.round(v * 1e6) / 1e6;
const SANS = Symbol('sans');

const FLECHE =
  'flex-1 w-3.5 flex items-center justify-center rounded-sm text-gray-400 hover:text-gray-800 hover:bg-gray-200 dark:hover:text-white dark:hover:bg-gray-600';

const ChampValide = ({
  valeur,
  onValeur,
  min = -Infinity,
  max = Infinity,
  pas = 1,
  titre,
  placeholder,
  vide = SANS,
  desactive = false,
  sansPas = false,
  className = '',
}) => {
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
  /** Un pas, vers le haut (+1) ou le bas (−1) ; Maj : dix pas. */
  const avancer = (sens, dix) => {
    setBrouillon(null);
    const depart = Number.isFinite(Number(valeur)) && valeur !== '' ? Number(valeur) : Number.isFinite(min) ? min : 0;
    onValeur(borner(net(depart + sens * pas * (dix ? 10 : 1)), min, max));
  };
  const fleche = (sens, Icone, libelle) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={libelle}
      // Le champ ne prend pas le focus : Suppr et H du canvas restent actifs
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        avancer(sens, e.shiftKey);
      }}
      className={FLECHE}
    >
      <Icone className="h-2.5 w-2.5" strokeWidth={3} />
    </button>
  );
  const fleches = !sansPas && !desactive;
  return (
    <span className={`relative inline-flex flex-none ${className}`}>
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
            avancer(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
          }
        }}
        disabled={desactive}
        title={titre}
        aria-label={titre}
        className={`${CHAMP} w-full min-w-0 text-center ${fleches ? 'pl-1.5 pr-[18px]' : 'px-1.5'}`}
      />
      {fleches && (
        <span className="absolute right-0.5 inset-y-0.5 flex flex-col" title="Un pas de plus ou de moins (Maj : dix)">
          {fleche(1, ChevronUp, 'Augmenter')}
          {fleche(-1, ChevronDown, 'Diminuer')}
        </span>
      )}
    </span>
  );
};

export default ChampValide;
