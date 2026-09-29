// frontend/modules/stick/labels/utils/placement.js
//
// OÙ POSER un élément qu'on AJOUTE : centré dans le canvas ACTUEL, quelle que
// soit sa taille. Avant, chaque panneau posait ses coordonnées en dur
// (`x: 50, y: 50 + elements.length * 30`), qui ne suivaient ni la taille du
// canvas ni celle de l'élément.
//
// Ne sert QU'À l'ajout (`addElementCentre` du store). La restauration d'un
// template ou d'un design garde ses positions (`addElement`), et la
// duplication reste à +20 px de son original.
//
// Pas de Konva ici : la mesure d'un texte est injectée (`mesurerTexte`), pour
// que ce module se teste sans canvas.

/** Décalage d'un ajout qui tomberait EXACTEMENT sur un élément existant. */
export const PAS_DECALAGE = 16;
const ESSAIS_MAX = 20;

/**
 * La taille du cadre d'un élément au moment de l'ajout (coin haut gauche =
 * origine, comme le dessinent tous les nœuds du canvas).
 * `mesurerTexte(el) → {width, height}` n'est appelée que pour un texte.
 */
export const tailleInitiale = (el, mesurerTexte) => {
  if (el.type === 'qrcode') {
    const s = el.size || 160;
    return { width: s, height: s };
  }
  if (el.type === 'text' && !(el.width > 0 && el.height > 0)) {
    const m = mesurerTexte ? mesurerTexte(el) : null;
    return { width: m?.width || el.width || 0, height: m?.height || el.fontSize || 0 };
  }
  return { width: el.width || 0, height: el.height || 0 };
};

/** Le coin haut gauche qui centre un cadre `taille` dans `canvas`. */
export const positionCentree = (taille, canvas) => {
  const cw = canvas?.width || 800;
  const ch = canvas?.height || 600;
  return {
    x: Math.round((cw - taille.width) / 2),
    y: Math.round((ch - taille.height) / 2),
  };
};

/**
 * Décale en diagonale tant qu'un élément occupe EXACTEMENT la même position :
 * deux ajouts successifs ne se superposent pas au pixel près. Plafonné, pour
 * ne jamais partir loin du centre.
 */
export const eviterSuperposition = (pos, elements = []) => {
  const occupe = (x, y) => elements.some((e) => e.x === x && e.y === y);
  let { x, y } = pos;
  for (let i = 0; i < ESSAIS_MAX && occupe(x, y); i++) {
    x += PAS_DECALAGE;
    y += PAS_DECALAGE;
  }
  return { x, y };
};

/** Position finale d'un élément ajouté ; `taille` impose le cadre si fournie. */
export const placerAuCentre = (el, { canvas, elements, mesurerTexte, taille } = {}) =>
  eviterSuperposition(
    positionCentree(taille || tailleInitiale(el, mesurerTexte), canvas),
    elements
  );

/**
 * REMPLIR LE CANVAS : le cadre qui fait couvrir tout le canvas à `el`, sans
 * rotation ni mise à l'échelle. Un QR reste carré (le plus petit côté, centré) ;
 * une image garde ses proportions par son recadrage (`ImageNode`), comme
 * lorsqu'on étire son cadre à la main.
 */
export const cadreDuCanvas = (el, canvas) => {
  const cw = canvas?.width || 800;
  const ch = canvas?.height || 600;
  const base = { rotation: 0, scaleX: 1, scaleY: 1 };
  if (el?.type === 'qrcode') {
    const s = Math.min(cw, ch);
    return { ...base, x: Math.round((cw - s) / 2), y: Math.round((ch - s) / 2), size: s };
  }
  return { ...base, x: 0, y: 0, width: cw, height: ch };
};

/** Le FOND d'un document : l'élément marqué `role: 'fond'`, ou null. */
export const fondDe = (elements = []) => elements.find((e) => e.role === 'fond') ?? null;
