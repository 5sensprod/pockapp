// frontend/modules/stick/labels/utils/formeLibre.js
//
// FERMER UN TRACÉ pour en faire une forme (mission « Améliorer les dessins »,
// lot 2). Le tracé devient une forme `shape: 'libre'` : remplissage et
// contour comme une forme géométrique, par `dessinForme` (ShapeNode.jsx),
// donc à l'écran et dans les deux exports.
//
// Ses points sont NORMALISÉS (0–1) dans son cadre, champ `pointsLibres`
// (plats, `[x0, y0, x1, y1…]`) : redimensionner ne change que `width` et
// `height`, comme pour toute forme (`handleTransformEnd`), et les points
// suivent. Pas de retour au tracé, hors Ctrl+Z.
// Pas de Konva ici : testable sous Node.

import { DRAW_DEFAULTS, getBoundingBox, ligneDuTrait, pointsDe, simplifier } from './dessin';

/** Remplissage d'une forme née d'un tracé : transparent (`#rrggbbaa`). */
export const REMPLISSAGE_FERME = '#ffffff00';

/** Tolérance de simplification avant lissage, en pixels du tracé. */
const TOLERANCE = 0.25;
/** Passes de Chaikin : chacune double les points et arrondit les angles. */
const PASSES = 2;

/** Lissage de Chaikin sur une polyligne FERMÉE (le dernier point rejoint le premier). */
export const chaikinFerme = (points, passes = PASSES) => {
  let pts = points;
  for (let k = 0; k < passes && pts.length >= 3; k++) {
    const sortie = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      sortie.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      sortie.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    pts = sortie;
  }
  return pts;
};

const arrondi = (v) => Math.round(v * 10000) / 10000;

/** Points normalisés de la forme → points dans son cadre `width × height`. */
export const pointsDansCadre = (pointsLibres, width, height) => {
  const plats = Array.isArray(pointsLibres) ? pointsLibres : [];
  const pts = [];
  for (let i = 0; i + 1 < plats.length; i += 2) pts.push({ x: plats[i] * width, y: plats[i + 1] * height });
  return pts;
};

// Champs propres au tracé, retirés de la forme
const CHAMPS_DESSIN = [
  'points',
  'pressions',
  'brushType',
  'smoothing',
  'thinning',
  'stabilisation',
  'effilementDebut',
  'effilementFin',
  'fusion',
  'fillGradient',
];

/** Réglages de lissage qu'une forme libre garde réglables. */
export const REGLAGES_LISSAGE = ['smoothing', 'stabilisation'];

/**
 * LA géométrie d'une forme libre, partagée par la fermeture et par le
 * relissage : `brut` (points d'origine du tracé, dans le repère local de
 * l'élément, échelle déjà appliquée) → ligne stabilisée (`ligneDuTrait`,
 * celle que suit le trait à l'écran) → à peine simplifiée → lissée (Chaikin)
 * → cadrée. Un `Konva.Line` sans tension et le contour stylisé dessinent
 * ainsi la même chose. `signe` : l'échelle ±1 du nœud, qui retourne le
 * décalage du cadre. Rend les mises à jour de position, de taille et de
 * points, ou null si le tracé n'a pas de surface.
 */
const poserLibre = (el, brut, lissage, signe) => {
  const ligne = simplifier(ligneDuTrait(brut, { strokeWidth: 1, ...lissage }), TOLERANCE);
  if (ligne.length < 3) return null;
  const pts = chaikinFerme(ligne);
  const box = getBoundingBox(pts);
  const bw = box.width || 1;
  const bh = box.height || 1;
  const a = ((el.rotation || 0) * Math.PI) / 180;
  const ox = box.x * signe.x;
  const oy = box.y * signe.y;
  const norme = (p) => [arrondi((p.x - box.x) / bw), arrondi((p.y - box.y) / bh)];
  return {
    x: (el.x || 0) + ox * Math.cos(a) - oy * Math.sin(a),
    y: (el.y || 0) + ox * Math.sin(a) + oy * Math.cos(a),
    width: Math.max(1, bw),
    height: Math.max(1, bh),
    pointsLibres: pts.flatMap(norme),
    // Le tracé d'origine, dans le MÊME repère normalisé (il peut déborder
    // de 0–1 : la ligne stabilisée est plus courte que lui), et ses réglages
    traceLibre: {
      points: brut.flatMap(norme),
      ...Object.fromEntries(REGLAGES_LISSAGE.filter((c) => Number.isFinite(lissage[c])).map((c) => [c, lissage[c]])),
    },
  };
};

/**
 * Les mises à jour qui changent un `dessin` en forme libre (un seul
 * `updateElement` : un seul pas d'historique, même `id` — le tremblé du
 * contour stylisé garde sa graine). null si le tracé ne ferme rien.
 *
 * - géométrie : `poserLibre` ; la forme GARDE le tracé d'origine et ses
 *   réglages de lissage (`traceLibre`), réglables après coup (`relisser`) ;
 * - le trait devient le contour : sa couleur (`dessin.fill`) et son
 *   épaisseur ; `contourStyle` est gardé ; le remplissage est transparent ;
 * - position, rotation et échelle : la forme se pose au même endroit, à
 *   l'échelle ±1, l'échelle du tracé passant dans sa taille.
 * Perdus : pression, épaisseur variable, effilements, fusion, dégradé du trait.
 */
export const formeDepuisDessin = (el) => {
  if (el?.type !== 'dessin') return null;
  const sx = Number.isFinite(el.scaleX) && el.scaleX ? el.scaleX : 1;
  const sy = Number.isFinite(el.scaleY) && el.scaleY ? el.scaleY : 1;
  // L'échelle du tracé passe dans ses points : la forme est à l'échelle ±1
  const brut = pointsDe(el).map((p) => ({ x: p.x * Math.abs(sx), y: p.y * Math.abs(sy) }));
  const pose = poserLibre(el, brut, { smoothing: el.smoothing, stabilisation: el.stabilisation }, { x: Math.sign(sx), y: Math.sign(sy) });
  if (!pose) return null;
  return {
    ...Object.fromEntries(CHAMPS_DESSIN.map((c) => [c, undefined])),
    ...pose,
    type: 'shape',
    shape: 'libre',
    scaleX: Math.sign(sx),
    scaleY: Math.sign(sy),
    fill: REMPLISSAGE_FERME,
    stroke: el.fill ?? DRAW_DEFAULTS.stroke,
    strokeWidth: Number.isFinite(el.strokeWidth) ? el.strokeWidth : DRAW_DEFAULTS.strokeWidth,
  };
};

/**
 * RELISSER une forme libre avec d'autres réglages (`maj` : `smoothing`,
 * `stabilisation`) : son tracé d'origine repasse par `poserLibre`, à la
 * taille ACTUELLE de la forme (un redimensionnement est donc gardé). Le cadre
 * change avec la courbe ; la forme ne bouge pas à l'écran.
 * null si la forme n'a pas gardé de tracé (fermée avant ce réglage).
 */
export const relisser = (el, maj) => {
  const trace = el?.traceLibre;
  if (el?.shape !== 'libre' || !Array.isArray(trace?.points) || trace.points.length < 6) return null;
  const w = el.width || 1;
  const h = el.height || 1;
  const brut = [];
  for (let i = 0; i + 1 < trace.points.length; i += 2) brut.push({ x: trace.points[i] * w, y: trace.points[i + 1] * h });
  const lissage = { smoothing: trace.smoothing, stabilisation: trace.stabilisation, ...maj };
  const signe = { x: Math.sign(el.scaleX || 1), y: Math.sign(el.scaleY || 1) };
  return poserLibre(el, brut, lissage, signe);
};

/** Réglage de lissage d'une forme libre, avec la règle par défaut du tracé. */
export const lissageDe = (el) => {
  const t = el?.traceLibre ?? {};
  const smoothing = Number.isFinite(t.smoothing) ? t.smoothing : DRAW_DEFAULTS.smoothing;
  return { smoothing, stabilisation: Number.isFinite(t.stabilisation) ? t.stabilisation : 0.7 * smoothing };
};
