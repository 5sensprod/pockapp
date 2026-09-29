// frontend/modules/stick/labels/utils/dessin.js
//
// DESSIN À MAIN LEVÉE, porté de PocketStick (`src/editor/draw/path.js`,
// lot 0 : même calcul, voir PocketStick-docs/05-dessin.md).
//
// Une seule différence de fond : PocketStick fige le trait en SVG (data URL)
// et perd les points. Ici l'élément `dessin` GARDE ses points et ses réglages,
// et `dessinTrace` recalcule le contour — le même pour le canvas
// (`DessinNode`) et l'export planche (`exportPdfSheet.js`) ; l'export du
// canvas cloné hérite du nœud. Pas de Konva ici : testable sous Node.

import { getStroke } from 'perfect-freehand';

// Réglages de l'outil (en mémoire seulement). smoothing : adoucissement 0–1 ;
// thinning : épaisseur variable selon la vitesse 0–1 (0 = épaisseur constante).
export const DRAW_DEFAULTS = {
  brushType: 'brush',
  stroke: '#000000',
  strokeWidth: 5,
  opacity: 1,
  smoothing: 0.5,
  thinning: 0,
};
export const STROKE_WIDTH_RANGE = [1, 50];

// Changement de pinceau : le surligneur passe à 30 px et 50 % d'opacité, le
// pinceau garde son épaisseur (5 par défaut).
export const brushOptions = (brushType, current = DRAW_DEFAULTS) => ({
  brushType,
  opacity: brushType === 'highlighter' ? 0.5 : 1,
  strokeWidth: brushType === 'highlighter' ? 30 : current.strokeWidth || 5,
});

const unit = (v, fallback) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

// Contour du trait (polygone) calculé par perfect-freehand à partir des points.
// L'adoucissement agit à la fois sur le lissage de la courbe et sur l'inertie.
export const strokeOutline = (points, { strokeWidth, smoothing, thinning, last = true }) => {
  const soft = unit(smoothing, DRAW_DEFAULTS.smoothing);
  const thin = unit(thinning, 0) * 0.7;
  return getStroke(
    points.map((p) => [p.x, p.y]),
    { size: strokeWidth, smoothing: soft, streamline: 0.7 * soft, thinning: thin, simulatePressure: thin > 0, last },
  ).map(([x, y]) => ({ x, y }));
};

const round = (v) => Math.round(v * 100) / 100;

// Polygone fermé → chemin SVG : courbes quadratiques passant par les milieux des côtés.
export const outlineToPathData = (outline) => {
  const n = outline.length;
  if (n < 3) return '';
  const mid = (a, b) => `${round((a.x + b.x) / 2)},${round((a.y + b.y) / 2)}`;
  let d = `M ${mid(outline[0], outline[1])}`;
  for (let i = 1; i <= n; i++) {
    const p = outline[i % n];
    d += ` Q ${round(p.x)},${round(p.y)} ${mid(p, outline[(i + 1) % n])}`;
  }
  return `${d} Z`;
};

export const getBoundingBox = (points) => {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** Points de l'élément (plats, `[x0, y0, x1, y1…]`) → `{ x, y }`. */
export const pointsDe = (el) => {
  const plats = Array.isArray(el?.points) ? el.points : [];
  const pts = [];
  for (let i = 0; i + 1 < plats.length; i += 2) pts.push({ x: plats[i], y: plats[i + 1] });
  return pts;
};

const reglagesDe = (el) => ({
  strokeWidth: Number.isFinite(el?.strokeWidth) ? el.strokeWidth : DRAW_DEFAULTS.strokeWidth,
  smoothing: el?.smoothing,
  thinning: el?.thinning,
});

/**
 * Élément `dessin` créé au relâchement (null si le tracé n'a qu'un point).
 * Cadre = contour + 1 px, comme PocketStick ; points relatifs à ce cadre.
 */
export const elementDessin = (points, options) => {
  if (!points || points.length < 2) return null;
  const outline = strokeOutline(points, options);
  const box = getBoundingBox(outline);
  const x = Math.floor(box.x) - 1;
  const y = Math.floor(box.y) - 1;
  return {
    type: 'dessin',
    x,
    y,
    width: Math.ceil(box.x + box.width) + 1 - x,
    height: Math.ceil(box.y + box.height) + 1 - y,
    points: points.flatMap((p) => [round(p.x - x), round(p.y - y)]),
    brushType: options.brushType ?? DRAW_DEFAULTS.brushType,
    fill: options.stroke ?? DRAW_DEFAULTS.stroke,
    opacity: Number.isFinite(options.opacity) ? options.opacity : 1,
    strokeWidth: options.strokeWidth,
    smoothing: options.smoothing,
    thinning: options.thinning,
  };
};

// Le contour ne dépend que des points et des réglages : mis en cache par
// tableau de points (un élément modifié en reçoit un nouveau par le store).
const cache = new WeakMap();

/** Ce qu'il faut à un `Konva.Path` : UNE règle pour le canvas et les exports. */
export const dessinTrace = (el) => {
  const r = reglagesDe(el);
  const cle = `${r.strokeWidth}|${r.smoothing}|${r.thinning}`;
  const garde = Array.isArray(el?.points) ? cache.get(el.points) : null;
  let data = garde?.cle === cle ? garde.data : null;
  if (data === null) {
    data = outlineToPathData(strokeOutline(pointsDe(el), r));
    if (Array.isArray(el?.points)) cache.set(el.points, { cle, data });
  }
  return {
    data,
    fill: el?.fill ?? DRAW_DEFAULTS.stroke,
    opacity: Number.isFinite(el?.opacity) ? el.opacity : 1,
  };
};

const base64 = (s) => btoa(unescape(encodeURIComponent(s)));

// Valeur CSS du curseur de dessin ; size = épaisseur à l'écran (px).
export const brushCursor = (size, stroke, opacity) => {
  if (size > 100 || size < 4) return 'crosshair';
  const r = size / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${r}" cy="${r}" r="${r - 1}" fill="${stroke}" opacity="${opacity}" stroke="white" stroke-width="1"/><circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="black" stroke-width="1" opacity="0.3"/></svg>`;
  return `url("data:image/svg+xml;base64,${base64(svg)}") ${r} ${r}, crosshair`;
};
