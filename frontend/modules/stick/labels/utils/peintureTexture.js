// frontend/modules/stick/labels/utils/peintureTexture.js
//
// PEINTURE TEXTURE : `{ type: 'noise-gradient', noise, stops }` (`paint.js`).
// La carte de bruit (`bruit.js`) sert de POSITION dans les arrêts du dégradé :
// couleur(x, y) = dégradé(carte(x, y)). Konva n'a que des dégradés linéaires et
// radiaux : la peinture devient un CANVAS colorisé, posé en motif
// (`fillPatternImage`) pour le remplissage, en `CanvasPattern` pour le contour
// (Konva pose `stroke` tel quel en `strokeStyle`, `Context.js` `_stroke`) et
// sur le QR (`degradeCanvas2D`).
//
// La table des 256 couleurs est lue sur un dégradé DESSINÉ par le navigateur
// (canvas 256 × 1) : même interpolation qu'un dégradé CSS/Konva, et toute
// couleur CSS acceptée sans analyseur maison.
//
// Mêmes règles que les cartes de masque (`carteTexture.js`) : coordonnées
// normalisées au cadre (même motif quelle que soit la résolution), résolution
// au palier de 64 px, cache LRU. Hors navigateur (tests Node) : null.

import { carteNiveaux } from './bruit';
import { resolutionCarte } from './carteTexture';

const MAX = 32;
const cache = new Map();

const garder = (cle, valeur) => {
  cache.set(cle, valeur);
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return valeur;
};

const tableCouleurs = (stops) => {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 1;
  const ctx = cv.getContext('2d');
  const grd = ctx.createLinearGradient(0, 0, 256, 0);
  for (const s of stops) grd.addColorStop(s.offset, s.color);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
};

/**
 * Le canvas colorisé d'une peinture texture pour un cadre `w × h` (unités du
 * nœud), à `ratio` pixels par unité. null hors navigateur ou cadre vide.
 */
export const motifTexture = (paint, w, h, ratio = 2, plafond = 1024) => {
  if (typeof document === 'undefined' || !paint?.noise || !(w > 0) || !(h > 0)) return null;
  const l = resolutionCarte(w * ratio, plafond);
  const ht = resolutionCarte(h * ratio, plafond);
  const aspect = Math.round((w / h) * 1000) / 1000;
  const cle = `${JSON.stringify(paint)}|${l}x${ht}|${aspect}`;
  const trouve = cache.get(cle);
  if (trouve) {
    cache.delete(cle);
    return garder(cle, trouve);
  }
  const niveaux = carteNiveaux(paint.noise, l, ht, aspect);
  if (!niveaux) return null;
  const lut = tableCouleurs(paint.stops);
  const cv = document.createElement('canvas');
  cv.width = l;
  cv.height = ht;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(l, ht);
  for (let i = 0; i < niveaux.length; i++) {
    const k = niveaux[i] * 4;
    img.data[i * 4] = lut[k];
    img.data[i * 4 + 1] = lut[k + 1];
    img.data[i * 4 + 2] = lut[k + 2];
    img.data[i * 4 + 3] = lut[k + 3];
  }
  ctx.putImageData(img, 0, 0);
  return garder(cle, cv);
};

/**
 * `CanvasPattern` couvrant le cadre `w × h` (origine décalée de `dx, dy`), ou
 * null. Pour le contour et pour un canvas 2D (QR).
 */
export const patternTexture = (paint, w, h, { ratio = 2, plafond = 1024, dx = 0, dy = 0 } = {}) => {
  const cv = motifTexture(paint, w, h, ratio, plafond);
  if (!cv) return null;
  const pattern = cv.getContext('2d').createPattern(cv, 'no-repeat');
  pattern?.setTransform?.(new DOMMatrix().translate(-dx, -dy).scale(w / cv.width, h / cv.height));
  return pattern;
};

/**
 * Après un `clone()` (export du canvas) : chaque nœud peint d'une texture
 * (`textureRemplissage` / `textureContour`, posés par `remplissageKonva` / `contourKonva`) reçoit sa
 * peinture recalculée à la résolution d'export — sinon il garderait celle de
 * l'écran, étirée.
 */
export const retexturer = (racine, ratioExport = 3) => {
  const noeuds = [racine, ...(racine.find?.(() => true) ?? [])];
  for (const n of noeuds) {
    const f = n.getAttr?.('textureRemplissage');
    if (f) {
      const cv = motifTexture(f.paint, f.w, f.h, ratioExport, 2048);
      if (cv) n.setAttrs({ fillPatternImage: cv, fillPatternScaleX: f.w / cv.width, fillPatternScaleY: f.h / cv.height });
    }
    const c = n.getAttr?.('textureContour');
    if (c) {
      const p = patternTexture(c.paint, c.w, c.h, { ratio: ratioExport, plafond: 2048, dx: c.dx, dy: c.dy });
      if (p) n.stroke(p);
    }
  }
};
