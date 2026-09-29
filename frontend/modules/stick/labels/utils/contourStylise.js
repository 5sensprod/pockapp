// frontend/modules/stick/labels/utils/contourStylise.js
//
// CONTOUR STYLISÉ D'UNE FORME (lot A, voir PocketStick-docs/05-dessin.md) :
// le contour de la forme est converti en ligne de points, déformé
// (ondulation, tremblé), puis épaissi par perfect-freehand — le moteur de
// l'outil Dessin — avec une épaisseur variable et des effilements.
//
// Tout est calculé dans le repère LOCAL de la forme, coin haut gauche en
// (0, 0), cadre `width × height` ; les formes centrées (cercle, triangle,
// étoile) sont posées par `offset` dans `dessinForme`. Même géométrie que
// Konva : `RegularPolygon` et `Star` commencent par un sommet en haut.
//
// Déterministe : le tremblé et l'épaisseur variable viennent d'un bruit
// PÉRIODIQUE (il se referme sur le contour) tiré de l'identifiant de
// l'élément — l'écran et les deux exports dessinent le même trait.
// Pas de Konva ici : testable sous Node.

import { getStroke } from 'perfect-freehand';
import { EFFILEMENT_MAX } from './dessin';

/** Les réglages, 0–1 sauf `ondes` (nombre d'ondes sur tout le contour). */
export const CONTOUR_STYLISE_DEFAUT = {
  variation: 0.5,
  effilementDebut: 0,
  effilementFin: 0,
  ondulation: 0,
  ondes: 12,
  tremble: 0.3,
};
export const ONDES_MAX = 60;

/** Amplitudes à 100 %, en épaisseurs de contour. */
const ONDULATION_MAX = 3;
const TREMBLE_MAX = 1.5;

const unit = (v, d = 0) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

/** Réglages lus sur l'élément (absent ou non-objet = pas de contour stylisé). */
export const reglagesContour = (el) => {
  const c = el?.contourStyle;
  if (!c || typeof c !== 'object') return null;
  const d = CONTOUR_STYLISE_DEFAUT;
  return {
    variation: unit(c.variation, d.variation),
    effilementDebut: unit(c.effilementDebut, d.effilementDebut),
    effilementFin: unit(c.effilementFin, d.effilementFin),
    ondulation: unit(c.ondulation, d.ondulation),
    ondes: Math.max(1, Math.min(ONDES_MAX, Math.round(Number.isFinite(c.ondes) ? c.ondes : d.ondes))),
    tremble: unit(c.tremble, d.tremble),
  };
};

// --- géométrie de base -----------------------------------------------------

const arc = (cx, cy, rx, ry, a0, a1, n) =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

/**
 * Contour de la forme, repère local. `ferme` : false pour le trait.
 * Même cadre et mêmes sommets que les primitives Konva de `dessinForme`.
 */
export const contourDeBase = ({ shape = 'rectangle', width = 160, height = 160, cornerRadius = 0 }) => {
  const w = width;
  const h = height;
  const cx = w / 2;
  const cy = h / 2;
  if (shape === 'line') return { ferme: false, points: [{ x: 0, y: cy }, { x: w, y: cy }] };
  if (shape === 'circle') return { ferme: true, points: arc(cx, cy, w / 2, h / 2, -Math.PI / 2, (3 * Math.PI) / 2, 96) };
  if (shape === 'triangle' || shape === 'star') {
    const r = Math.min(w, h) / 2;
    const n = shape === 'star' ? 10 : 3;
    return {
      ferme: true,
      points: Array.from({ length: n }, (_, i) => {
        const rayon = shape === 'star' && i % 2 ? r / 2 : r;
        const a = (i * 2 * Math.PI) / n;
        return { x: cx + rayon * Math.sin(a), y: cy - rayon * Math.cos(a) };
      }),
    };
  }
  // Rectangle, coins arrondis comme Konva (rayon borné à la moitié du petit côté)
  const r = Math.max(0, Math.min(Number(cornerRadius) || 0, w / 2, h / 2));
  if (!r) return { ferme: true, points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }] };
  const q = Math.PI / 2;
  return {
    ferme: true,
    points: [
      ...arc(w - r, r, r, r, -q, 0, 12),
      ...arc(w - r, h - r, r, r, 0, q, 12),
      ...arc(r, h - r, r, r, q, 2 * q, 12),
      ...arc(r, r, r, r, 2 * q, 3 * q, 12),
    ],
  };
};

/** Points régulièrement espacés de `pas` le long du contour, avec abscisse `s`. */
export const reechantillonner = (points, ferme, pas) => {
  const pts = ferme ? [...points, points[0]] : points;
  const sortie = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(l / pas));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      sortie.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: s + l * t });
    }
    s += l;
  }
  if (!ferme) sortie.push({ ...pts[pts.length - 1], s });
  return { points: sortie, longueur: s };
};

// --- bruit périodique déterministe ------------------------------------------

/** Graine entière tirée d'une chaîne (FNV-1a). */
export const graineDe = (texte) => {
  let h = 2166136261;
  for (const c of String(texte ?? '')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hasard = (graine, i) => {
  let x = (Math.imul(graine ^ Math.imul(i, 374761393), 668265263) + 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
};

/** Bruit lisse dans [-1, 1], de période `n` : `t` va de 0 à n. */
export const bruitPeriodique = (graine, n, t) => {
  const i = Math.floor(t);
  const f = t - i;
  const a = hasard(graine, ((i % n) + n) % n) * 2 - 1;
  const b = hasard(graine, (((i + 1) % n) + n) % n) * 2 - 1;
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
};

// --- contour stylisé ---------------------------------------------------------

const cache = new Map();
const CACHE_MAX = 64;

/**
 * Le contour stylisé d'une forme : `ligne` (le milieu du trait, déformé — le
 * remplissage le suit) et `outline` (le polygone du trait épaissi). null si
 * la forme n'en a pas (pas de réglages, ou pas d'épaisseur).
 */
export const contourStylise = ({ shape, width, height, cornerRadius, strokeWidth, contourStyle, id }) => {
  const r = reglagesContour({ contourStyle });
  const ep = Number(strokeWidth) || 0;
  if (!r || !(ep > 0) || !(width > 0) || !(height > 0)) return null;
  const cle = JSON.stringify([shape, width, height, cornerRadius, ep, r, id]);
  if (cache.has(cle)) return cache.get(cle);

  const { ferme, points: base } = contourDeBase({ shape, width, height, cornerRadius });
  const { points, longueur } = reechantillonner(base, ferme, Math.max(1.5, ep / 3));
  const graine = graineDe(id);
  const nTremble = Math.max(4, Math.round(longueur / (6 * ep)));
  const nPression = Math.max(3, Math.round(longueur / (10 * ep)));
  const n = points.length;

  const ligne = points.map((p, i) => {
    // Normale : perpendiculaire à la corde des voisins
    const av = points[ferme ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const ap = points[ferme ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = ap.x - av.x;
    const ty = ap.y - av.y;
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    const u = p.s / (longueur || 1);
    const d =
      r.ondulation * ONDULATION_MAX * ep * Math.sin(2 * Math.PI * r.ondes * u) +
      r.tremble * TREMBLE_MAX * ep * bruitPeriodique(graine, nTremble, u * nTremble);
    const pression = 0.5 + 0.5 * bruitPeriodique(graine + 1, nPression, u * nPression);
    return { x: p.x + nx * d, y: p.y + ny * d, pressure: pression };
  });

  const effile = (v) => v * EFFILEMENT_MAX * ep;
  const trace = ferme ? [...ligne, ligne[0]] : ligne;
  const outline = getStroke(
    trace.map((p) => [p.x, p.y, p.pressure]),
    {
      size: ep,
      thinning: r.variation * 0.9,
      smoothing: 0.5,
      streamline: 0,
      simulatePressure: false,
      start: { taper: effile(r.effilementDebut) },
      end: { taper: effile(r.effilementFin) },
      last: true,
    },
  ).map(([x, y]) => ({ x, y }));

  // Cadre RÉEL du dessin : le trait déborde de `width × height` (demi
  // épaisseur, ondulation). Konva s'en sert pour le cache des effets —
  // sinon le flou ou l'ombre couperaient ce qui dépasse — et le Transformer.
  const xs = [...outline, ...ligne].map((p) => p.x);
  const ys = [...outline, ...ligne].map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const cadre = { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
  const resultat = { ferme, ligne, outline, cadre };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cle, resultat);
  return resultat;
};

/**
 * Trace `outline` sur un contexte canvas (Konva ou 2D) : les mêmes courbes
 * quadratiques par les milieux que `outlineToPathData` (`dessin.js`).
 */
export const tracerOutline = (ctx, outline) => {
  const n = outline.length;
  if (n < 3) return;
  const mid = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];
  ctx.moveTo(...mid(outline[0], outline[1]));
  for (let i = 1; i <= n; i++) {
    const p = outline[i % n];
    ctx.quadraticCurveTo(p.x, p.y, ...mid(p, outline[(i + 1) % n]));
  }
  ctx.closePath();
};

/** Trace la ligne (fermée) sur laquelle le remplissage s'appuie. */
export const tracerLigne = (ctx, ligne) => {
  if (!ligne.length) return;
  ctx.moveTo(ligne[0].x, ligne[0].y);
  for (let i = 1; i < ligne.length; i++) ctx.lineTo(ligne[i].x, ligne[i].y);
  ctx.closePath();
};
