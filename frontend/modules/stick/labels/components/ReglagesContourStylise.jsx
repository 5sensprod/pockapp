// frontend/modules/stick/labels/components/ReglagesContourStylise.jsx
//
// Les réglages du « Contour à main levée » d'une FORME, d'un TEXTE ou d'un
// TRACÉ, affichés à plat dans `ReglagesPanel` : épaisseur variable,
// effilements, ondulation, tremblé (`utils/contourStylise.js`,
// `utils/texteContourStylise.js`, `utils/dessin.js`).
// `contourStyle` absent = contour ordinaire, comme avant.
// Pour un texte (`texte`) : pas d'effilements — sur un contour de lettre
// fermé, ils amincissent le trait n'importe où —, et `ondes` est une densité.
// Pour un tracé (`dessin`) : tremblé et ondulation seulement — épaisseur
// variable et effilements sont déjà des réglages du tracé —, et `ondes` est
// une densité par épaisseur de trait (`pointsDeformes`, dessin.js).

import React from 'react';
import Curseur from './ui/Curseur';
import Interrupteur from './ui/Interrupteur';
import { LIGNE } from './ui/styles';
import { CONTOUR_STYLISE_DEFAUT, ONDES_MAX, reglagesContour } from '../utils/contourStylise';

const CURSEURS = [
  ['variation', 'Épaisseur variable', 100],
  ['tremble', 'Tremblé', 100],
  ['ondulation', 'Ondulation du contour', 100],
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

const ReglagesContourStylise = ({ element, onChange, texte = false, dessin = false }) => {
  const reglages = reglagesContour(element);
  const actif = !!reglages;
  const sansContour = !(Number(element.strokeWidth) > 0);
  const set = (cle, v) => onChange({ contourStyle: { ...reglages, [cle]: v } });

  return (
    <>
      <div className={LIGNE}>
        <span>Contour à main levée</span>
        <Interrupteur
          actif={actif}
          onActif={(v) => onChange({ contourStyle: v ? { ...CONTOUR_STYLISE_DEFAUT } : null })}
          label="Contour à main levée"
        />
      </div>
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
            <Curseur
              key={cle}
              label={libelle}
              largeurLabel="w-32"
              className="px-1 pt-2"
              min={entier ? 1 : 0}
              max={max}
              valeur={valeur}
              affichage={entier ? valeur : `${valeur}%`}
              onValeur={(v) => set(cle, entier ? v : v / 100)}
            />
          );
        })}
    </>
  );
};

export default ReglagesContourStylise;
