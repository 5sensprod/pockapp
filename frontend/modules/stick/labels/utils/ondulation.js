// frontend/modules/stick/labels/utils/ondulation.js
//
// EFFET « ONDULATION » (lot B, voir PocketStick-docs/05-dessin.md) : l'image
// d'un élément — texte, forme, image, dessin — est déformée par une onde
// sinusoïdale. En PIXELS, sur le cache Konva, comme le flou : un seul chemin
// (`appliquerEffets`, `utils/effetsKonva.js`) pour le canvas et les deux
// exports. Il ondule l'élément ENTIER, remplissage compris ; le contour seul
// d'une lettre demanderait son dessin vectoriel (opentype.js, écarté pour
// l'instant).
//
// `el.ondulationEffet` : `{ amplitude, longueur, sens }`, amplitude et
// longueur d'onde en unités du document ; absent = pas d'effet.
// Pur (pas de Konva) : testable sous Node.

export const SENS_ONDULATION = [
  { id: 'horizontal', label: 'Horizontale' },
  { id: 'vertical', label: 'Verticale' },
  { id: 'deux', label: 'Les deux' },
];
export const AMPLITUDE_MAX = 50;
export const LONGUEUR_MIN = 4;
export const LONGUEUR_MAX = 400;
export const ONDULATION_DEFAUT = { amplitude: 6, longueur: 60, sens: 'horizontal' };

const borne = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);

/** Réglages de l'élément, bornés ; null si pas d'ondulation (ou amplitude nulle). */
export const ondulationDe = (el) => {
  const o = el?.ondulationEffet;
  if (!o || typeof o !== 'object') return null;
  const amplitude = borne(Number(o.amplitude), 0, AMPLITUDE_MAX, ONDULATION_DEFAUT.amplitude);
  if (!(amplitude > 0)) return null;
  return {
    amplitude,
    longueur: borne(Number(o.longueur), LONGUEUR_MIN, LONGUEUR_MAX, ONDULATION_DEFAUT.longueur),
    sens: SENS_ONDULATION.some((s) => s.id === o.sens) ? o.sens : ONDULATION_DEFAUT.sens,
  };
};

// Lecture bilinéaire ; hors de l'image = transparent.
const lire = (src, w, h, x, y, sortie, j) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 4; c++) sortie[j + c] = 0;
  for (const [dx, dy, poids] of [
    [0, 0, (1 - fx) * (1 - fy)],
    [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy],
    [1, 1, fx * fy],
  ]) {
    const xi = x0 + dx;
    const yi = y0 + dy;
    if (!poids || xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
    const i = (yi * w + xi) * 4;
    for (let c = 0; c < 4; c++) sortie[j + c] += src[i + c] * poids;
  }
};

/**
 * Déforme `imageData` en place. `o` en unités du NŒUD ; `ratio` : pixels par
 * unité (résolution du cache) ; `marge` : marge du cache en unités, pour
 * mesurer la phase depuis le coin du CONTENU — le même point à l'écran et
 * dans les exports, quelle que soit la résolution.
 * Horizontale : chaque ligne est décalée de côté selon sa hauteur (l'onde
 * se lit sur les bords verticaux) ; verticale : chaque colonne selon sa
 * position ; les deux se cumulent.
 */
export const onduler = (imageData, o, ratio = 1, marge = 0) => {
  const { width: w, height: h, data } = imageData;
  const A = o.amplitude * ratio;
  const L = o.longueur * ratio;
  if (!(A > 0) || !(L > 0)) return imageData;
  const src = new Uint8ClampedArray(data);
  const pixel = new Float32Array(4);
  const m = marge * ratio;
  const horizontal = o.sens === 'horizontal' || o.sens === 'deux';
  const vertical = o.sens === 'vertical' || o.sens === 'deux';
  const k = (2 * Math.PI) / L;
  for (let y = 0; y < h; y++) {
    const decalX = horizontal ? A * Math.sin(k * (y - m)) : 0;
    for (let x = 0; x < w; x++) {
      const decalY = vertical ? A * Math.sin(k * (x - m)) : 0;
      lire(src, w, h, x - decalX, y - decalY, pixel, 0);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) data[i + c] = pixel[c];
    }
  }
  return imageData;
};
