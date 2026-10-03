// frontend/modules/stick/labels/utils/positionFlottante.js
//
// OÙ POSER UNE FENÊTRE FLOTTANTE de la barre d'options (menu, sélecteur de
// couleur, liste des polices) pour qu'elle reste DANS l'écran. Une seule
// règle : il y en avait trois copies, chacune avec ses oublis (pas de borne à
// gauche, pas de hauteur maximale, largeur supposée en dur).
//
// - sous le bouton, alignée sur son bord gauche ; ramenée dans l'écran si elle
//   dépasse à droite ou à gauche ;
// - au-dessus du bouton si le bas manque de place ET que le haut en a plus ;
// - `maxHeight` : la place réellement disponible — le contenu défile dedans.
// Fonction pure : testable sous Node.

export const MARGE_ECRAN = 8;

/**
 * @param ancre   rectangle du bouton, en coordonnées écran `{ left, top, bottom }`
 * @param panneau taille de la fenêtre `{ width, height }` (son contenu entier)
 * @param ecran   `{ width, height }` de la fenêtre du navigateur
 * @param ecart   espace entre le bouton et la fenêtre
 * @returns `{ top, left, maxHeight, auDessus }`
 */
export const positionFlottante = (ancre, panneau, ecran, ecart = 6) => {
  const m = MARGE_ECRAN;
  const left = Math.max(m, Math.min(ancre.left, ecran.width - panneau.width - m));

  const placeDessous = ecran.height - (ancre.bottom + ecart) - m;
  const placeDessus = ancre.top - ecart - m;
  const auDessus = panneau.height > placeDessous && placeDessus > placeDessous;
  const maxHeight = Math.max(80, auDessus ? placeDessus : placeDessous);
  const hauteur = Math.min(panneau.height, maxHeight);
  const top = auDessus ? Math.max(m, ancre.top - ecart - hauteur) : ancre.bottom + ecart;
  return { top, left, maxHeight, auDessus };
};
