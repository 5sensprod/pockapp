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
import { remplissage } from './fillStyle';

// Réglages de l'outil (en mémoire seulement). smoothing : adoucissement 0–1 ;
// thinning : épaisseur variable selon la vitesse 0–1 (0 = épaisseur constante).
export const DRAW_DEFAULTS = {
  brushType: 'brush',
  stroke: '#000000',
  strokeWidth: 5,
  opacity: 1,
  smoothing: 0.5,
  thinning: 0,
  // D'où vient l'épaisseur variable (lot 2) : 'vitesse' (simulée, comme
  // PocketStick) ou 'stylet' (pression réelle, si le trait est tracé au
  // stylet ; souris et doigt restent alors en vitesse).
  variation: 'vitesse',
  // Lot 3 — courbe assistée. `stabilisation` : inertie du tracé (streamline
  // de perfect-freehand), séparée d'« Adoucir » ; 0,35 = 0,7 × 0,5, soit
  // exactement ce que donnait l'adoucissement par défaut. `simplification` :
  // Ramer-Douglas-Peucker au relâchement, 0 = aucun point retiré.
  stabilisation: 0.35,
  simplification: 0,
  // Lot 4 — effilement du début et de la fin, 0–1 ; 1 = sur
  // `EFFILEMENT_MAX` fois l'épaisseur. 0 = bout rond, comme avant.
  effilementDebut: 0,
  effilementFin: 0,
};

/**
 * Lot 5 — MODE DE FUSION d'un trait. Le surligneur multiplie (`multiply`) :
 * il fonce ce qu'il recouvre au lieu de le voiler, comme un vrai feutre.
 * Un élément sans `fusion` (d'avant le lot 5) reste en fusion normale.
 */
export const FUSIONS = ['multiply'];
export const fusionDe = (el) => (FUSIONS.includes(el?.fusion) ? el.fusion : 'source-over');

/** Longueur d'effilement à 100 %, en épaisseurs de trait. */
export const EFFILEMENT_MAX = 10;

/** Distance minimale entre deux points relevés, en pixels ÉCRAN. */
export const DISTANCE_MIN_ECRAN = 1.5;
/** Tolérance de la simplification à 100 %, en fraction de l'épaisseur. */
export const SIMPLIFICATION_MAX = 0.5;
export const VARIATIONS = [
  { id: 'vitesse', label: 'Vitesse' },
  { id: 'stylet', label: 'Pression du stylet' },
];
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
// `pression` : les points portent la pression RÉELLE du stylet (`p.pressure`,
// 0–1) ; sinon elle est simulée par la vitesse, comme dans PocketStick.
// `stabilisation` absente (éléments d'avant le lot 3) : 0,7 × adoucir, la
// règle de PocketStick.
// `effilementDebut` / `effilementFin` absents = 0 : bouts ronds (lot 0).
export const strokeOutline = (
  points,
  { strokeWidth, smoothing, thinning, stabilisation, effilementDebut, effilementFin, pression = false, last = true },
) => {
  const effile = (v) => unit(v, 0) * EFFILEMENT_MAX * (strokeWidth || DRAW_DEFAULTS.strokeWidth);
  const soft = unit(smoothing, DRAW_DEFAULTS.smoothing);
  const thin = unit(thinning, 0) * 0.7;
  const stream = unit(stabilisation, 0.7 * soft);
  return getStroke(
    points.map((p) => (pression ? [p.x, p.y, unit(p.pressure, 0.5)] : [p.x, p.y])),
    {
      size: strokeWidth,
      smoothing: soft,
      streamline: stream,
      thinning: thin,
      simulatePressure: !pression && thin > 0,
      start: { taper: effile(effilementDebut) },
      end: { taper: effile(effilementFin) },
      last,
    },
  ).map(([x, y]) => ({ x, y }));
};

/**
 * Faut-il garder ce point ? Non s'il est à moins de `distanceMin` du dernier
 * gardé : le tremblement d'une main posée n'apporte que du bruit et du coût.
 */
export const pointUtile = (dernier, p, distanceMin) =>
  !dernier || Math.hypot(p.x - dernier.x, p.y - dernier.y) >= distanceMin;

const distanceAuSegment = (p, a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * Ramer-Douglas-Peucker : retire les points à moins de `tolerance` de la
 * corde qui les enjambe. Premier et dernier toujours gardés ; les points
 * gardés gardent leur pression. Itératif (pas de récursion profonde).
 */
export const simplifier = (points, tolerance) => {
  if (!(tolerance > 0) || points.length < 3) return points;
  const garde = new Uint8Array(points.length);
  garde[0] = 1;
  garde[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [i, j] = pile.pop();
    let max = 0;
    let k = -1;
    for (let m = i + 1; m < j; m++) {
      const d = distanceAuSegment(points[m], points[i], points[j]);
      if (d > max) {
        max = d;
        k = m;
      }
    }
    if (k >= 0 && max > tolerance) {
      garde[k] = 1;
      pile.push([i, k], [k, j]);
    }
  }
  return points.filter((_, i) => garde[i]);
};

/** Tolérance RDP en unités du document, pour les réglages d'un trait. */
export const toleranceDe = ({ simplification, strokeWidth }) =>
  unit(simplification, 0) * SIMPLIFICATION_MAX * (strokeWidth || DRAW_DEFAULTS.strokeWidth);

/** Le trait utilise-t-il la pression réelle ? Stylet ET mode « stylet ». */
export const pressionReelle = (pointerType, variation) => pointerType === 'pen' && variation === 'stylet';

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

/**
 * Points de l'élément (plats, `[x0, y0, x1, y1…]`) → `{ x, y }`, avec
 * `pressure` quand l'élément porte `pressions` (un nombre par point, tracé
 * au stylet). Un élément du lot 0 n'en a pas : inchangé.
 */
export const pointsDe = (el) => {
  const plats = Array.isArray(el?.points) ? el.points : [];
  const pressions = Array.isArray(el?.pressions) ? el.pressions : null;
  const pts = [];
  for (let i = 0; i + 1 < plats.length; i += 2) {
    const p = { x: plats[i], y: plats[i + 1] };
    if (pressions) p.pressure = pressions[i / 2];
    pts.push(p);
  }
  return pts;
};

const reglagesDe = (el) => ({
  strokeWidth: Number.isFinite(el?.strokeWidth) ? el.strokeWidth : DRAW_DEFAULTS.strokeWidth,
  smoothing: el?.smoothing,
  thinning: el?.thinning,
  stabilisation: el?.stabilisation,
  effilementDebut: el?.effilementDebut,
  effilementFin: el?.effilementFin,
  pression: Array.isArray(el?.pressions),
});

/**
 * Élément `dessin` créé au relâchement (null si le tracé n'a qu'un point).
 * Cadre = contour + 1 px, comme PocketStick ; points relatifs à ce cadre.
 */
export const elementDessin = (brut, options) => {
  if (!brut || brut.length < 2) return null;
  const points = simplifier(brut, toleranceDe(options));
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
    ...(options.pression ? { pressions: points.map((p) => Math.round(unit(p.pressure, 0.5) * 1000) / 1000) } : {}),
    brushType: options.brushType ?? DRAW_DEFAULTS.brushType,
    fill: options.stroke ?? DRAW_DEFAULTS.stroke,
    opacity: Number.isFinite(options.opacity) ? options.opacity : 1,
    strokeWidth: options.strokeWidth,
    smoothing: options.smoothing,
    thinning: options.thinning,
    ...(Number.isFinite(options.stabilisation) ? { stabilisation: options.stabilisation } : {}),
    ...(options.brushType === 'highlighter' ? { fusion: 'multiply' } : {}),
    ...(options.effilementDebut > 0 ? { effilementDebut: options.effilementDebut } : {}),
    ...(options.effilementFin > 0 ? { effilementFin: options.effilementFin } : {}),
  };
};

// Le contour ne dépend que des points et des réglages : mis en cache par
// tableau de points (un élément modifié en reçoit un nouveau par le store).
const cache = new WeakMap();

/**
 * Ce qu'il faut à un `Konva.Path` : UNE règle pour le canvas et les exports.
 * Remplissage : couleur `fill` ou dégradé `fillGradient`, par la même
 * fonction que les formes (`remplissage`, `fillStyle.js`), sur le cadre
 * `width × height` de l'élément — l'origine du Path est son coin haut gauche.
 */
export const dessinTrace = (el) => {
  const r = reglagesDe(el);
  const cle = `${r.strokeWidth}|${r.smoothing}|${r.thinning}|${r.stabilisation}|${r.effilementDebut}|${r.effilementFin}|${el?.pressions?.length ?? ''}`;
  const garde = Array.isArray(el?.points) ? cache.get(el.points) : null;
  let data = garde?.cle === cle ? garde.data : null;
  if (data === null) {
    data = outlineToPathData(strokeOutline(pointsDe(el), r));
    if (Array.isArray(el?.points)) cache.set(el.points, { cle, data });
  }
  return {
    data,
    ...remplissage(el?.fillGradient ?? null, el?.width, el?.height, el?.fill ?? DRAW_DEFAULTS.stroke),
    opacity: Number.isFinite(el?.opacity) ? el.opacity : 1,
    globalCompositeOperation: fusionDe(el),
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
