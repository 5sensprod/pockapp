// frontend/modules/stick/labels/utils/ombreInterne.js
//
// OMBRE INTERNE d'un élément : l'ombre que son BORD projette vers l'intérieur.
// JS pur (testé sous Node) ; le filtre Konva qui l'appelle est dans
// `effetsKonva.js`, avec les autres effets en pixels — une seule fonction pour
// le canvas et les deux exports.
//
// Champs (unités du document) : `innerShadowEnabled`, `innerShadowColor`,
// `innerShadowOpacity`, `innerShadowBlur`, `innerShadowOffsetX`,
// `innerShadowOffsetY`.

const FLOU_MAX = 200;

/** Réglages effectifs, ou null si désactivée. */
export const ombreInterneDe = (el) => {
  if (!el?.innerShadowEnabled) return null;
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    color: typeof el.innerShadowColor === 'string' ? el.innerShadowColor : '#000000',
    opacity: Math.min(1, Math.max(0, n(el.innerShadowOpacity, 0.5))),
    blur: Math.min(FLOU_MAX, Math.max(0, n(el.innerShadowBlur, 8))),
    offsetX: n(el.innerShadowOffsetX, 2),
    offsetY: n(el.innerShadowOffsetY, 2),
  };
};

export const rgbDe = (couleur) => {
  const h = /^#?([0-9a-f]{6})$/i.exec(couleur || '') ?? /^#?([0-9a-f]{3})$/i.exec(couleur || '');
  if (!h) return [0, 0, 0];
  const x = h[1].length === 3 ? h[1].replace(/./g, (c) => c + c) : h[1];
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};

/**
 * Ombre les pixels d'`imageData` (`{ width, height, data }` RGBA). Le « vide »
 * autour de l'élément (alpha inversé), décalé de l'offset puis flouté par
 * `flouter(img, rayon)`, assombrit l'élément là où il le recouvre ; l'alpha
 * de l'élément ne change pas. `o` en unités du nœud, `ratio` : pixels du cache
 * par unité.
 */
export const ombrerPixels = (imageData, o, ratio, flouter) => {
  const { width: w, height: h, data } = imageData;
  const ox = Math.round(o.offsetX * ratio);
  const oy = Math.round(o.offsetY * ratio);
  const vide = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const vd = vide.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x - ox;
      const sy = y - oy;
      const a = sx >= 0 && sy >= 0 && sx < w && sy < h ? data[(sy * w + sx) * 4 + 3] : 0;
      vd[(y * w + x) * 4 + 3] = 255 - a;
    }
  }
  const r = Math.round(o.blur * ratio);
  if (r > 0 && flouter) flouter(vide, r);
  const [cr, cg, cb] = rgbDe(o.color);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const s = (vd[i + 3] / 255) * o.opacity;
    if (!s) continue;
    data[i] += (cr - data[i]) * s;
    data[i + 1] += (cg - data[i + 1]) * s;
    data[i + 2] += (cb - data[i + 2]) * s;
  }
  return imageData;
};
