// frontend/modules/stick/labels/utils/effetsKonva.js
//
// EFFETS en pixels d'un élément (flou ; luminosité, sépia, noir et blanc et
// filtres réglables pour une image),
// appliqués à SON nœud Konva. Une SEULE fonction pour le canvas
// (`KonvaCanvas`, effet après rendu), l'export planche (`createDocumentImage`)
// et l'export du canvas cloné (`exportPdf`, par `recacherFiltres`) : deux
// calculs, ce serait deux dessins.
//
// Konva n'applique un filtre QUE sur un nœud mis en cache : le nœud est
// rastérisé avec une marge (le flou déborde), à `pixelRatio`, et le rayon du
// flou est exprimé dans les pixels de ce cache — d'où `rayon × ratio`, comme
// dans PocketStick (`canvas/elements.jsx`, `useGroupEffects`).

import Konva from 'konva';
import { effectFilters, sanitizeFilters } from './effetsImage';

export const FLOU_MAX = 200;

/** Le flou effectif d'un élément, en unités du document ; 0 si aucun. */
export const rayonFlou = (el) => {
  if (!el?.blurEnabled) return 0;
  const r = Number(el.blurRadius);
  return Number.isFinite(r) ? Math.min(FLOU_MAX, Math.max(0, r)) : 0;
};

/** Luminosité effective, dans [-1, 1] ; 0 si désactivée. */
export const luminosite = (el) => {
  if (!el?.brightnessEnabled) return 0;
  const b = Number(el.brightness);
  return Number.isFinite(b) ? Math.min(1, Math.max(-1, b)) : 0;
};

/**
 * Les filtres Konva d'un élément (liste vide si aucun effet), dans l'ordre de
 * PocketStick (`canvas/effects-render.js`, `baseFilterNames`) : flou,
 * luminosité, sépia, noir et blanc, puis les filtres réglables
 * (`effetsImage.js`, champ `filters`).
 */
export const filtresDe = (el) => {
  if (!el) return [];
  return [
    rayonFlou(el) > 0 && Konva.Filters.Blur,
    luminosite(el) !== 0 && Konva.Filters.Brighten,
    el.sepiaEnabled && Konva.Filters.Sepia,
    el.grayscaleEnabled && Konva.Filters.Grayscale,
    ...effectFilters(sanitizeFilters(el.filters) || {}),
  ].filter(Boolean);
};

/**
 * Pose (ou retire) les effets de `el` sur `node`.
 * `echelle` : unités du document → unités du nœud (1 sur le canvas, `scale`
 * à l'export planche). `ratio` : résolution du cache.
 */
export const appliquerEffets = (node, el, { echelle = 1, ratio = 1 } = {}) => {
  if (!node) return;
  const filtres = filtresDe(el);
  if (node.isCached?.()) node.clearCache();
  if (!filtres.length) {
    node.filters?.([]);
    return;
  }
  const rayon = rayonFlou(el) * echelle;
  node.filters(filtres);
  node.blurRadius(rayon * ratio);
  node.brightness(luminosite(el));
  node.setAttr('rayonFlouNoeud', rayon); // relu par `recacherFiltres` sur un clone
  // Un nœud vide (image pas encore chargée) ne se met pas en cache
  const r = node.getClientRect({ skipTransform: true });
  if (!(r.width > 0 && r.height > 0)) return;
  node.cache({ pixelRatio: ratio, offset: Math.ceil(rayon) + 2 });
};

/**
 * Après un `clone()` (export du canvas) : le cache ne suit pas le clone, les
 * filtres si. On remet en cache chaque nœud filtré, à la résolution d'export.
 */
export const recacherFiltres = (racine, ratioExport = 3) => {
  const noeuds = [racine, ...(racine.find?.(() => true) ?? [])];
  for (const n of noeuds) {
    const f = n.filters?.();
    if (!f?.length) continue;
    const rayon = n.getAttr('rayonFlouNoeud') ?? 0;
    n.blurRadius(rayon * ratioExport);
    n.cache({ pixelRatio: ratioExport, offset: Math.ceil(rayon) + 2 });
  }
};
