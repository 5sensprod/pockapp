// frontend/modules/stick/labels/utils/planche.js
//
// LA TAILLE D'UNE CASE de la planche, en points. Sorti du rendu de
// `SheetPanel` sans changer le calcul : la feuille moins ses deux marges et
// ses écarts, partagée entre les cases, arrondie à l'entier inférieur.

export const tailleCase = (feuille, { rows, cols, margin, spacing }) => {
  const largeur = feuille.width - 2 * margin - (cols - 1) * spacing;
  const hauteur = feuille.height - 2 * margin - (rows - 1) * spacing;
  return {
    width: Math.max(0, Math.floor(largeur / cols)),
    height: Math.max(0, Math.floor(hauteur / rows)),
  };
};
