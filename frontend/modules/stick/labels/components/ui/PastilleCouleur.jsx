// frontend/modules/stick/labels/components/ui/PastilleCouleur.jsx
//
// LA PASTILLE DE COULEUR UNIE de la barre latérale : le sélecteur maison
// (`GradientColorPicker`) réduit à une couleur — pastille, puis fenêtre avec
// les couleurs prêtes et le choix fin. Elle remplace les `<input
// type="color">` natifs, dont la fenêtre dépendait du système et dont la
// taille changeait d'un panneau à l'autre.
//
// - `opacite` absente : la valeur écrite reste `#rrggbb`, comme l'écrivait le
//   sélecteur natif — rien ne change pour le rendu ni les exports ;
// - `opacite` : la couleur peut porter une transparence (`#rrggbbaa`), là où
//   elle était déjà gardée (trait d'une forme, couleur du pinceau).
//
// Elle vit souvent DANS un `<label>` (libellé à gauche, pastille à droite) :
// un clic dans une zone vide de la fenêtre serait renvoyé par le label vers
// la pastille, qui se refermerait. On annule ce renvoi — sauf sur un `<input>`,
// dont le clic doit garder son effet (ouvrir le choix fin).

import React from 'react';
import GradientColorPicker from '../GradientColorPicker';

const PastilleCouleur = ({ couleur, onCouleur, label, opacite = false }) => (
  <span
    className="flex-none"
    onClick={(e) => {
      if (e.target?.tagName !== 'INPUT') e.preventDefault();
    }}
  >
    <GradientColorPicker
      color={couleur}
      gradient={null}
      onColorChange={onCouleur}
      title={label}
      uniSeulement
      sansOpacite={!opacite}
    />
  </span>
);

export default PastilleCouleur;
