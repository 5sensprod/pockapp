// frontend/modules/stick/labels/utils/ajustementImage.js
//
// AJUSTEMENT d'une image dans son cadre : `el.fit`.
//
// - absent ou 'cover' (Remplir) : le comportement d'origine — l'image couvre
//   le cadre et son recadrage (`utils/crop.js`) dit quelle partie on voit.
// - 'contain' (Contenir) : l'image ENTIÈRE, centrée, à ses proportions ; le
//   cadre est une zone réservée, les marges restent vides. Le recadrage est
//   ignoré (conservé dans l'élément : repasser en Remplir le retrouve).
//
// Pourquoi : une photo LIÉE au produit change de proportions d'un produit à
// l'autre, alors que le cadre garde celles du premier. En Remplir, on ne
// voyait qu'un bout de la photo, et le recadrage réglé sur la photo A
// s'appliquait tel quel à la photo B.
//
// Séparé de `crop.js`, qui est une copie à l'identique de PocketStick. Le
// dessin passe par `sceneImage` (`imageForme.js`) : canvas, export par clone
// et export planche, une seule fonction.

/** L'image est-elle en mode Contenir ? */
export const estContenu = (el) => el?.fit === 'contain';

/** Les nouvelles images naissent en Contenir. */
export const AJUSTEMENT_NOUVELLE_IMAGE = { fit: 'contain' };

/**
 * Le rectangle où dessiner une image `nw × nh` contenue dans un cadre `w × h`,
 * centrée. Sans taille connue : le cadre entier.
 */
export const rectContenu = (w, h, nw, nh) => {
  if (!(w > 0 && h > 0 && nw > 0 && nh > 0)) return { x: 0, y: 0, width: w, height: h };
  const k = Math.min(w / nw, h / nh);
  const width = nw * k;
  const height = nh * k;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
};
