// frontend/modules/stick/labels/utils/carteTexture.js
//
// La carte d'une texture (`bruit.js`) en CANVAS : blanc, alpha = niveau. Prête
// à être composée en `destination-in` (masque, `imageForme.js`).
//
// COÛT : une carte se calcule pixel par pixel. Elle est donc mise en cache
// (LRU), par paramètres ET résolution, et la résolution est arrondie au palier
// de 64 px : un redimensionnement ou un zoom réutilise la même carte, étirée,
// tant qu'il ne change pas de palier. Plafond 1024 px à l'écran, 2048 à
// l'export (`plafond`). Le motif ne dépend pas de la résolution (coordonnées
// normalisées au cadre, `bruit.js`) : étirer une carte ne la fausse pas, elle
// ne fait que la rendre moins fine.

import { carteNiveaux, sanitizeTexture } from './bruit';

const PALIER = 64;
const MAX_CARTES = 32;
const cache = new Map();

/** Côté de carte pour `px` pixels réels : palier de 64, entre 64 et `plafond`. */
export const resolutionCarte = (px, plafond = 1024) =>
  Math.min(plafond, Math.max(PALIER, Math.ceil((Number(px) || 0) / PALIER) * PALIER));

/**
 * Le canvas de la carte, ou null. `pxL × pxH` : taille en pixels réels du
 * cadre masqué ; `aspect` : largeur / hauteur du cadre.
 */
export const carteTexture = (texture, pxL, pxH, aspect, plafond = 1024) => {
  const tex = sanitizeTexture(texture);
  if (!tex || typeof document === 'undefined') return null;
  const l = resolutionCarte(pxL, plafond);
  const h = resolutionCarte(pxH, plafond);
  const a = Math.round((aspect || 1) * 1000) / 1000;
  const cle = `${JSON.stringify(tex)}|${l}x${h}|${a}`;
  const trouve = cache.get(cle);
  if (trouve) {
    cache.delete(cle);
    cache.set(cle, trouve); // le plus récent en dernier
    return trouve;
  }
  const niveaux = carteNiveaux(tex, l, h, a);
  if (!niveaux) return null;
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(l, h);
  for (let i = 0; i < niveaux.length; i++) {
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = niveaux[i];
  }
  ctx.putImageData(img, 0, 0);
  cache.set(cle, canvas);
  if (cache.size > MAX_CARTES) cache.delete(cache.keys().next().value);
  return canvas;
};
