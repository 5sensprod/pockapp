// frontend/modules/stick/labels/utils/paint.js
//
// LE DÉGRADÉ, modèle de PocketStick (I:\pocketstick, src/editor/store/paint.js),
// repris le 29/09/2026 : linéaire (angle CSS) ou radial (centre, rayon), de 2 à
// 16 arrêts de couleur.
//
//   { type: 'linear-gradient', angle, stops: [{ offset, color }, …] }
//   { type: 'radial-gradient', center: { x, y }, radius, stops: [...] }
//
// Repris À L'IDENTIQUE : `sanitizeGradient`, `linearPoints`, `paintToCss`,
// `paintToKonva`, les deux dégradés par défaut. Deux écarts, voulus :
// - la validation d'une couleur ne passe pas par `culori` (non installé ici) :
//   `couleurValide`, qui demande au navigateur (`CSS.supports`) ;
// - `mixPaint` (interpolation pour l'animation) n'est pas repris : pas
//   d'animation dans l'éditeur d'affiches.
//
// AJOUTS PocketApp : `versPeinture` lit aussi l'ANCIEN dégradé
// `{ from, to, angle }` (0° = vers la droite) des templates déjà enregistrés,
// sans migration ; `contourKonva` pose le dégradé sur le CONTOUR — linéaire
// seulement, Konva ne sait pas dessiner un contour radial
// (`konva/lib/Context.js`, `_stroke`) : un radial y est rendu en linéaire à
// 180°, du centre vers le bord ; `centrer` décale les points pour un nœud
// dont l'origine est le centre (Ellipse, Étoile, Polygone).

export const MAX_GRADIENT_STOPS = 16;
export const isGradient = (value) => value?.type === 'linear-gradient' || value?.type === 'radial-gradient';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONCTION = /^(rgba?|hsla?)\([^)]*\)$/i;
/** Une couleur CSS lisible : le navigateur tranche, un motif sinon (tests). */
export const couleurValide = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', value);
  return HEX.test(value) || FONCTION.test(value) || /^[a-z]+$/i.test(value);
};
const cleanColor = (value) => (couleurValide(value) ? value : null);

export const sanitizeGradient = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isGradient(value)) return null;
  if (!Array.isArray(value.stops) || value.stops.length < 2 || value.stops.length > MAX_GRADIENT_STOPS) return null;
  const stops = value.stops.map((stop) => {
    if (!stop || typeof stop !== 'object' || !finite(stop.offset)) return null;
    const color = cleanColor(stop.color);
    return color ? { offset: clamp(stop.offset, 0, 1), color } : null;
  });
  if (stops.some((stop) => !stop)) return null;
  stops.sort((a, b) => a.offset - b.offset);
  if (value.type === 'linear-gradient') {
    if (!finite(value.angle)) return null;
    return { type: value.type, angle: ((value.angle % 360) + 360) % 360, stops };
  }
  if (!value.center || !finite(value.center.x) || !finite(value.center.y) || !finite(value.radius)) return null;
  return {
    type: value.type,
    center: { x: clamp(value.center.x, 0, 1), y: clamp(value.center.y, 0, 1) },
    radius: clamp(value.radius, 0.01, 2),
    stops,
  };
};

export const DEFAULT_LINEAR_GRADIENT = {
  type: 'linear-gradient',
  angle: 90,
  stops: [{ offset: 0, color: '#2563eb' }, { offset: 1, color: '#ec4899' }],
};

export const DEFAULT_RADIAL_GRADIENT = {
  type: 'radial-gradient',
  center: { x: 0.5, y: 0.5 },
  radius: 0.5,
  stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: 'rgba(37, 99, 235, 0)' }],
};

/**
 * Le dégradé d'un élément, quel que soit son format enregistré : le modèle
 * PocketStick, ou l'ancien `{ from, to, angle }`. null si aucun ou illisible.
 */
export const versPeinture = (value) => {
  if (!value || typeof value !== 'object') return null;
  if (isGradient(value)) return sanitizeGradient(value);
  if (value.from && value.to) {
    return sanitizeGradient({
      type: 'linear-gradient',
      angle: (Number(value.angle) || 0) + 90, // ancien 0° = vers la droite = CSS 90°
      stops: [{ offset: 0, color: value.from }, { offset: 1, color: value.to }],
    });
  }
  return null;
};

/** Première couleur d'un dégradé (repli : édition d'un texte, aperçu uni). */
export const premiereCouleur = (value) => versPeinture(value)?.stops[0]?.color ?? null;

export const paintToCss = (paint) => {
  if (typeof paint === 'string') return paint;
  if (!isGradient(paint)) return 'transparent';
  const stops = paint.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 1000) / 10}%`).join(', ');
  return paint.type === 'linear-gradient'
    ? `linear-gradient(${paint.angle}deg, ${stops})`
    : `radial-gradient(circle at ${paint.center.x * 100}% ${paint.center.y * 100}%, ${stops})`;
};

const stopsArray = (gradient) => gradient.stops.flatMap((stop) => [stop.offset, stop.color]);

// Angle CSS : 0° vers le haut, 90° vers la droite.
export const linearPoints = (width, height, angle) => {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const extent = (Math.abs(dx) * width) / 2 + (Math.abs(dy) * height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return {
    start: { x: cx - dx * extent, y: cy - dy * extent },
    end: { x: cx + dx * extent, y: cy + dy * extent },
  };
};

export const paintToKonva = (paint, width, height) => {
  if (!isGradient(paint)) return { fill: paint };
  if (paint.type === 'linear-gradient') {
    const points = linearPoints(width, height, paint.angle);
    return {
      fillPriority: 'linear-gradient',
      fillLinearGradientStartPoint: points.start,
      fillLinearGradientEndPoint: points.end,
      fillLinearGradientColorStops: stopsArray(paint),
    };
  }
  const center = { x: paint.center.x * width, y: paint.center.y * height };
  return {
    fillPriority: 'radial-gradient',
    fillRadialGradientStartPoint: center,
    fillRadialGradientEndPoint: center,
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndRadius: paint.radius * Math.hypot(width, height),
    fillRadialGradientColorStops: stopsArray(paint),
  };
};

const decaler = (p, dx, dy) => (p ? { x: p.x - dx, y: p.y - dy } : p);

/**
 * Props Konva de REMPLISSAGE : couleur unie `color`, ou le dégradé. Toujours
 * explicites (`fillPriority`) : repasser en uni doit éteindre un dégradé déjà
 * dessiné, pas seulement cesser de le décrire.
 * @returns {Record<string, any>}
 */
export const remplissageKonva = (gradient, width, height, color, centrer = false) => {
  const paint = versPeinture(gradient);
  if (!paint) return { fill: color, fillPriority: 'color' };
  const props = { fill: color, ...paintToKonva(paint, width || 0, height || 0) };
  if (!centrer) return props;
  const dx = (width || 0) / 2;
  const dy = (height || 0) / 2;
  for (const cle of [
    'fillLinearGradientStartPoint',
    'fillLinearGradientEndPoint',
    'fillRadialGradientStartPoint',
    'fillRadialGradientEndPoint',
  ]) {
    if (props[cle]) props[cle] = decaler(props[cle], dx, dy);
  }
  return props;
};

/**
 * Props Konva de CONTOUR : couleur unie, ou dégradé (linéaire, voir en-tête).
 * @returns {Record<string, any>}
 */
export const contourKonva = (gradient, width, height, color, centrer = false) => {
  const paint = versPeinture(gradient);
  if (!paint) return { stroke: color, strokeLinearGradientColorStops: null };
  const angle = paint.type === 'linear-gradient' ? paint.angle : 180;
  const { start, end } = linearPoints(width || 0, height || 0, angle);
  const dx = centrer ? (width || 0) / 2 : 0;
  const dy = centrer ? (height || 0) / 2 : 0;
  return {
    stroke: color || paint.stops[0].color,
    strokeLinearGradientStartPoint: decaler(start, dx, dy),
    strokeLinearGradientEndPoint: decaler(end, dx, dy),
    strokeLinearGradientColorStops: stopsArray(paint),
  };
};

/**
 * Le dégradé sur un canvas 2D (QR code) : un `CanvasGradient` couvrant
 * `width × height`, ou null si pas de dégradé.
 */
export const degradeCanvas2D = (ctx, gradient, width, height) => {
  const paint = versPeinture(gradient);
  if (!paint) return null;
  let grd;
  if (paint.type === 'linear-gradient') {
    const { start, end } = linearPoints(width, height, paint.angle);
    grd = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  } else {
    const cx = paint.center.x * width;
    const cy = paint.center.y * height;
    grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, paint.radius * Math.hypot(width, height));
  }
  for (const stop of paint.stops) grd.addColorStop(stop.offset, stop.color);
  return grd;
};
