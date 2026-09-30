// frontend/modules/stick/labels/components/MenuContourStylise.jsx
//
// Le menu « Contour stylisé » d'une FORME ou d'un TEXTE dans PropertyPanel :
// épaisseur variable, effilements, ondulation, tremblé
// (`utils/contourStylise.js`, `utils/texteContourStylise.js`).
// `contourStyle` absent = contour Konva ordinaire, comme avant.
// Pour un texte (`texte`) : pas d'effilements — sur un contour de lettre
// fermé, ils amincissent le trait n'importe où —, et `ondes` est une densité.
// Pour un tracé (`dessin`) : tremblé et ondulation seulement — épaisseur
// variable et effilements sont déjà des réglages du tracé (DessinPanel) —, et
// `ondes` est une densité par épaisseur de trait (`pointsDeformes`, dessin.js).

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

// Texte : ni effilements, et les ondes suivent la longueur de chaque lettre.
const CURSEURS_TEXTE = CURSEURS.filter(([cle]) => !cle.startsWith('effilement')).map((c) =>
  c[0] === 'ondes' ? ['ondes', 'Densité des ondes', ONDES_MAX] : c
);

// Tracé : ce que perfect-freehand ne donne pas déjà.
const CURSEURS_DESSIN = CURSEURS_TEXTE.filter(([cle]) => cle !== 'variation');

const MenuContourStylise = ({ element, onChange, texte = false, dessin = false }) => {
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
      {actif && sansContour && !dessin && (
        <p className="px-1 pb-1 text-[11px] text-amber-700 dark:text-amber-400">
          Donnez une épaisseur au contour pour le voir.
        </p>
      )}
      {actif &&
        (dessin ? CURSEURS_DESSIN : texte ? CURSEURS_TEXTE : CURSEURS).map(([cle, libelle, max]) => {
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
