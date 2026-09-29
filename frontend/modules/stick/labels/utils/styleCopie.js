// frontend/modules/stick/labels/utils/styleCopie.js
//
// COPIER / COLLER LE STYLE d'un élément, et ORDRE EN PROFONDEUR. Fonctions
// pures, lues par le store (`copierStyle`, `collerStyle`, `deplacerEnProfondeur`)
// et par l'étiquette de la sélection (`components/EtiquetteSelection.jsx`).
//
// Le STYLE, c'est tout ce qui n'est ni la géométrie, ni le contenu, ni le lien
// au produit, ni l'état d'édition (`HORS_STYLE`). Au collage :
// - même type : tout le style copié ;
// - types différents : les réglages COMMUNS (opacité, ombre, flou, effets),
//   plus la PEINTURE (remplissage, dégradé, contour) entre texte et forme.
// Une police ne se colle donc pas sur une image, ni une couleur de barres sur
// un QR.

const HORS_STYLE = new Set([
  'id', 'type', 'name', 'shape', 'section',
  'x', 'y', 'width', 'height', 'size', 'rotation', 'scaleX', 'scaleY', 'aspectRatio',
  'text', 'title', 'qrValue', 'barcodeValue', 'format', 'src',
  'dataBinding', 'textOverrides', 'textOverridesSource',
  'cropX', 'cropY', 'cropWidth', 'cropHeight',
  'visible', 'locked', 'shadowExpanded', 'role', // être le fond n'est pas un style
  'flipX', 'flipY', // le miroir est une orientation, pas un style
]);

/** Réglages qui ont un sens sur tout élément, quel que soit son type. */
export const STYLE_COMMUN = [
  'opacity',
  'shadowEnabled', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity',
  'blurEnabled', 'blurRadius', 'blurFade',
  'ondulationEffet',
  'innerShadowEnabled', 'innerShadowColor', 'innerShadowOpacity', 'innerShadowBlur',
  'innerShadowOffsetX', 'innerShadowOffsetY',
];

/** La peinture, partagée par le texte et la forme. */
const PEINTURE = ['fillGradient', 'stroke', 'strokeWidth', 'strokeGradient'];
const PEINTS = new Set(['text', 'shape']);
/** Le champ de la couleur de remplissage : `color` pour un texte, `fill` sinon. */
const champCouleur = (type) => (type === 'text' ? 'color' : 'fill');

/** Le style d'un élément : `{ type, props }`, ou null. */
export const extraireStyle = (el) => {
  if (!el) return null;
  const props = {};
  for (const [cle, valeur] of Object.entries(el)) {
    if (!HORS_STYLE.has(cle) && valeur !== undefined) props[cle] = valeur;
  }
  return { type: el.type, props };
};

/** Ce que le style copié change sur `cible` (objet à fusionner). */
export const styleApplicable = (style, cible) => {
  if (!style || !cible) return {};
  if (style.type === cible.type) return { ...style.props };
  const cles = new Set(STYLE_COMMUN);
  const peints = PEINTS.has(style.type) && PEINTS.has(cible.type);
  if (peints) PEINTURE.forEach((c) => cles.add(c));
  const maj = {};
  for (const cle of cles) if (cle in style.props) maj[cle] = style.props[cle];
  // La couleur change de nom d'un type à l'autre (texte `color`, forme `fill`)
  const source = champCouleur(style.type);
  if (peints && source in style.props) maj[champCouleur(cible.type)] = style.props[source];
  return maj;
};

/**
 * Déplace `ids` en profondeur. L'ordre du tableau est l'ordre de dessin : le
 * DERNIER est au premier plan. `sens` : 'avant' (d'un cran), 'arriere' (d'un
 * cran), 'devant' (tout devant), 'derriere' (tout derrière). Les éléments
 * déplacés gardent leur ordre relatif. Rend le même tableau si rien ne bouge.
 */
export const reordonner = (elements, ids, sens) => {
  const choisis = new Set(ids);
  if (!elements.some((e) => choisis.has(e.id))) return elements;
  const pris = elements.filter((e) => choisis.has(e.id));
  const autres = elements.filter((e) => !choisis.has(e.id));
  let res;
  if (sens === 'devant') res = [...autres, ...pris];
  else if (sens === 'derriere') res = [...pris, ...autres];
  else {
    res = [...elements];
    const pas = sens === 'avant' ? 1 : -1;
    // On parcourt depuis le bord vers lequel on va, pour ne pas sauter
    // par-dessus un autre élément choisi.
    const indices = res.map((e, i) => (choisis.has(e.id) ? i : -1)).filter((i) => i >= 0);
    if (pas > 0) indices.reverse();
    for (const i of indices) {
      const j = i + pas;
      if (j < 0 || j >= res.length || choisis.has(res[j].id)) continue;
      [res[i], res[j]] = [res[j], res[i]];
    }
  }
  return res.every((e, i) => e === elements[i]) ? elements : res;
};
