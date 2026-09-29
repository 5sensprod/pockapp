// frontend/modules/stick/labels/utils/typo.js
//
// TYPOGRAPHIE d'un texte : espacement des lettres, interligne, hauteur des
// lettres. Une seule lecture, bornée, pour le canvas (`TextNode`), le
// redimensionnement (`KonvaCanvas`) et l'export planche (`exportPdfSheet`).
//
//   letterSpacing  px du document entre deux lettres (négatif = resserré)
//   lineHeight     interligne, multiple de la taille (Konva : 1 par défaut)
//   charHeight     hauteur des lettres, % (100 = normale) : un étirement
//                  VERTICAL du nœud, multiplié à son `scaleY`. Le cadre suit.

export const TYPO_BORNES = {
  letterSpacing: { min: -20, max: 100, defaut: 0 },
  lineHeight: { min: 0.5, max: 4, defaut: 1 },
  charHeight: { min: 25, max: 400, defaut: 100 },
  curve: { min: -100, max: 100, defaut: 0 }, // courbure (`utils/texteCourbe.js`)
};

const borne = (v, { min, max, defaut }) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
};

/** `{ letterSpacing, lineHeight, hauteur, curve }` (hauteur en facteur, 1 = normale). */
export const typoTexte = (el) => ({
  letterSpacing: borne(el?.letterSpacing, TYPO_BORNES.letterSpacing),
  lineHeight: borne(el?.lineHeight, TYPO_BORNES.lineHeight),
  hauteur: borne(el?.charHeight, TYPO_BORNES.charHeight) / 100,
  curve: borne(el?.curve, TYPO_BORNES.curve),
});
