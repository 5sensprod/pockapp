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

/**
 * LA CASSE d'un texte (`el.casse`) : tout en majuscules, tout en minuscules,
 * ou une majuscule à chaque mot. C'est un STYLE, appliqué au moment du dessin
 * (`appliquerCasse`) : le texte saisi — ou lu dans la fiche produit — n'est
 * jamais réécrit, et revenir à « Normal » le rend tel quel. Même règle pour le
 * canvas (`TextNode`) et l'export planche (`exportPdfSheet`).
 */
export const CASSES = [
  { id: 'normale', label: 'Aa…', titre: 'Normal : le texte tel qu’il est écrit' },
  { id: 'majuscules', label: 'AA', titre: 'TOUT EN MAJUSCULES' },
  { id: 'minuscules', label: 'aa', titre: 'tout en minuscules' },
  { id: 'capitales', label: 'Aa', titre: 'Une Majuscule À Chaque Mot' },
];
export const casseDe = (el) => (CASSES.some((c) => c.id === el?.casse) ? el.casse : 'normale');

/** Le texte dans la casse demandée (règles du français : é → É). */
export const appliquerCasse = (texte, casse) => {
  const t = texte == null ? '' : String(texte);
  if (casse === 'majuscules') return t.toLocaleUpperCase('fr-FR');
  if (casse === 'minuscules') return t.toLocaleLowerCase('fr-FR');
  if (casse === 'capitales') {
    // Tout en minuscules d'abord : « GUITARE FOLK » devient « Guitare Folk ».
    // Une lettre est « en début de mot » après un blanc, une apostrophe, un
    // tiret, une barre ou une parenthèse — ou en tête du texte.
    return t
      .toLocaleLowerCase('fr-FR')
      .replace(/(^|[\s'’\-/(«"])(\p{L})/gu, (_, avant, lettre) => avant + lettre.toLocaleUpperCase('fr-FR'));
  }
  return t;
};

/** `{ letterSpacing, lineHeight, hauteur, curve }` (hauteur en facteur, 1 = normale). */
export const typoTexte = (el) => ({
  letterSpacing: borne(el?.letterSpacing, TYPO_BORNES.letterSpacing),
  lineHeight: borne(el?.lineHeight, TYPO_BORNES.lineHeight),
  hauteur: borne(el?.charHeight, TYPO_BORNES.charHeight) / 100,
  curve: borne(el?.curve, TYPO_BORNES.curve),
});
