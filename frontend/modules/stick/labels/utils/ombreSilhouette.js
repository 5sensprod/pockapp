// frontend/modules/stick/labels/utils/ombreSilhouette.js
//
// UNE SEULE OMBRE pour un dessin fait de plusieurs remplissages : la
// silhouette entière est peinte sur un canvas à part, puis posée d'un seul
// `drawImage` — une seule image, une seule ombre, pas d'ombre du trait sur le
// remplissage. Partagée par les formes à contour stylisé
// (`canvas/ShapeNode.jsx`) et par les lettres à contour stylisé
// (`utils/texteContourStylise.js`).
//
// La silhouette est dessinée LOIN hors du canvas, l'ombre ramenée à sa place
// en compensant le décalage : `shadowOffset` est en pixels de l'appareil, le
// déplacement en unités locales — la transformation courante fait le lien,
// zoom et rotation compris.

const LOIN = 20000;

/**
 * Pose l'ombre de la silhouette, si une ombre est active sur `ctx` (Konva l'y
 * a allumée avant la sceneFunc). `peindre(s)` remplit la silhouette en noir
 * sur un contexte 2D, dans le repère local ; `cadre` borne ce qu'il peint.
 * Rend false s'il n'y a pas d'ombre : l'appelant dessine alors normalement.
 * Rend true : l'ombre est posée, l'appelant dessine SANS ombre.
 */
export const ombreDeSilhouette = (ctx, cadre, peindre) => {
  const n = ctx._context;
  const couleur = String(n?.shadowColor ?? '');
  const transparente = !couleur || couleur === 'transparent' || /,\s*0(\.0*)?\s*\)$/.test(couleur);
  if (transparente || !(n.shadowBlur || n.shadowOffsetX || n.shadowOffsetY)) return false;
  const t = n.getTransform();
  const k = Math.hypot(t.a, t.b) || 1; // pixels de l'appareil par unité
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(cadre.width * k) + 2);
  cv.height = Math.max(1, Math.ceil(cadre.height * k) + 2);
  const s = cv.getContext('2d');
  s.scale(k, k);
  s.translate(-cadre.x + 1 / k, -cadre.y + 1 / k);
  s.fillStyle = '#000';
  peindre(s);
  n.save();
  n.shadowOffsetX -= t.a * LOIN;
  n.shadowOffsetY -= t.b * LOIN;
  n.translate(LOIN, 0);
  n.drawImage(cv, cadre.x - 1 / k, cadre.y - 1 / k, cv.width / k, cv.height / k);
  n.restore();
  return true;
};
