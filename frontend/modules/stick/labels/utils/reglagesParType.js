// frontend/modules/stick/labels/utils/reglagesParType.js
//
// QUEL RÉGLAGE VA OÙ, par type d'élément (refonte de l'interface, octobre
// 2026). La barre d'options portait jusqu'à 16 contrôles pour un texte et
// défilait sur 1 500 px ; elle ne garde que le NOYAU — ce qu'on touche à
// chaque affiche —, et le reste part dans l'onglet « Réglages » de la barre
// latérale, qui a la place d'afficher des curseurs sans menu déroulant.
//
// Cette carte est la seule décision : `PropertyPanel` (barre) et le panneau
// « Réglages » la lisent tous les deux, un réglage n'est donc jamais aux deux
// endroits ni nulle part. Des identifiants de SECTION, pas de composants :
// module pur, testable sous Node.

/** Le noyau de la barre et les sections du panneau, dans l'ordre d'affichage. */
const CARTE = {
  text: {
    barre: ['police', 'taille', 'styleTexte', 'alignementTexte', 'couleur'],
    panneau: ['espacement', 'barreSurlignage', 'contour', 'contourStylise', 'masque'],
  },
  shape: {
    barre: ['remplissage', 'contour'],
    panneau: ['contourStylise', 'arrondi', 'lissage', 'masque'],
  },
  dessin: {
    barre: ['couleur'],
    panneau: ['trace', 'contourStylise', 'fermerTrace'],
  },
  image: {
    barre: ['ajustement', 'recadrage'],
    panneau: ['miroir', 'opacite', 'masque', 'dimensions'],
  },
  qrcode: {
    barre: ['couleur'],
    panneau: ['contenuQr'],
  },
  barcode: {
    barre: ['couleur', 'fond'],
    panneau: ['barres', 'numero'],
  },
  fiche: {
    barre: ['sectionFiche', 'police', 'taille'],
    panneau: ['titreFiche', 'lignesFiche', 'styleTableau'],
  },
};

/** Sections qui ne valent que pour certaines formes. */
const SELON_FORME = {
  arrondi: (el) => (el.shape ?? 'rectangle') === 'rectangle',
  // Forme née d'un tracé fermé, qui a gardé son tracé d'origine (`formeLibre.js`)
  lissage: (el) => el.shape === 'libre' && !!el.traceLibre,
  // Un trait n'a ni surface ni masque
  masque: (el) => el.type !== 'shape' || el.shape !== 'line',
};

/** Dans le panneau pour tout élément, après ses sections propres. */
export const SECTIONS_COMMUNES = ['donneeProduit', 'remplirCanvas'];

/** Toujours dans la barre, après le noyau. */
export const ACTIONS_BARRE = ['position', 'supprimer', 'reglages', 'effets'];

const garder = (el) => (id) => !SELON_FORME[id] || SELON_FORME[id](el);

/**
 * Pour un élément : `{ barre, panneau }`, deux listes ordonnées de sections.
 * Type inconnu : rien de propre, seulement le commun.
 */
export const reglagesDe = (el) => {
  const carte = CARTE[el?.type] ?? { barre: [], panneau: [] };
  return {
    barre: carte.barre.filter(garder(el)),
    panneau: [...carte.panneau.filter(garder(el)), ...SECTIONS_COMMUNES],
  };
};

/** Les types qui ont des réglages propres. */
export const TYPES_REGLABLES = Object.keys(CARTE);
