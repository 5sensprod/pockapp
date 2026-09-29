// frontend/modules/stick/labels/components/MenuContourStylise.jsx
//
// Le menu « Contour stylisé » d'une FORME dans PropertyPanel : épaisseur
// variable, effilements, ondulation, tremblé (`utils/contourStylise.js`).
// `contourStyle` absent = contour Konva ordinaire, comme avant.

import React from 'react';
import { Waves } from 'lucide-react';
import MenuGroupe from './MenuGroupe';
import { CONTOUR_STYLISE_DEFAUT, ONDES_MAX, reglagesContour } from '../utils/contourStylise';

const CURSEURS = [
  ['variation', 'Épaisseur variable', 100],
  ['tremble', 'Tremblé', 100],
  ['ondulation', 'Ondulation', 100],
  ['ondes', 'Nombre d’ondes', ONDES_MAX],
  ['effilementDebut', 'Effiler le début', 100],
  ['effilementFin', 'Effiler la fin', 100],
];

const MenuContourStylise = ({ element, onChange }) => {
  const reglages = reglagesContour(element);
  const actif = !!reglages;
  const sansContour = !(Number(element.strokeWidth) > 0);
  const set = (cle, v) => onChange({ contourStyle: { ...reglages, [cle]: v } });

  return (
    <MenuGroupe icone={Waves} titre="Contour stylisé" actif={actif} largeur="17rem">
      <label className="flex items-center justify-between px-1 py-1 text-xs text-gray-700 dark:text-gray-300">
        <span>Contour à main levée</span>
        <input
          type="checkbox"
          checked={actif}
          onChange={(e) => onChange({ contourStyle: e.target.checked ? { ...CONTOUR_STYLISE_DEFAUT } : null })}
          className="accent-purple-600"
        />
      </label>
      {actif && sansContour && (
        <p className="px-1 pb-1 text-[11px] text-amber-700 dark:text-amber-400">
          Donnez une épaisseur au contour pour le voir.
        </p>
      )}
      {actif &&
        CURSEURS.map(([cle, libelle, max]) => {
          const entier = cle === 'ondes';
          const valeur = entier ? reglages[cle] : Math.round(reglages[cle] * 100);
          return (
            <label key={cle} className="flex items-center gap-2 px-1 pt-2 text-xs text-gray-600 dark:text-gray-300">
              <span className="w-28">{libelle}</span>
              <input
                type="range"
                min={entier ? 1 : 0}
                max={max}
                step={1}
                value={valeur}
                onChange={(e) => set(cle, entier ? Number(e.target.value) : Number(e.target.value) / 100)}
                className="flex-1"
              />
              <span className="w-8 text-right tabular-nums">{entier ? valeur : `${valeur}%`}</span>
            </label>
          );
        })}
    </MenuGroupe>
  );
};

export default MenuContourStylise;
