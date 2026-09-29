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
import { ombreInterneDe, ombrePorteeDe, ombrePorteePixels, ombrerPixels } from './ombreInterne';
import { dessinerMasque, reglagesMasque } from './imageForme';

export { ombreInterneDe };

export const FLOU_MAX = 200;

/** Le flou effectif d'un élément, en unités du document ; 0 si aucun. */
export const rayonFlou = (el) => {
  if (!el?.blurEnabled) return 0;
  const r = Number(el.blurRadius);
  return Number.isFinite(r) ? Math.min(FLOU_MAX, Math.max(0, r)) : 0;
};

/**
 * FLOU DÉGRADÉ (`blurFade`) : le flou apparaît progressivement le long d'une
 * direction. `{ angle, from, to }` — angle CSS (0° vers le haut, 90° vers la
 * droite, comme les dégradés), net avant `from`, pleinement flou après `to`
 * (fractions du cadre, 0 à 1). null ou absent : flou uniforme.
 */
export const fonduFlou = (el) => {
  const f = el?.blurFade;
  if (!f || typeof f !== 'object') return null;
  const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const from = Math.min(1, Math.max(0, n(f.from, 0.3)));
  const to = Math.min(1, Math.max(0, n(f.to, 0.8)));
  return { angle: n(f.angle, 180), from: Math.min(from, to), to: Math.max(from, to) };
};

/** Poids du flou en `t` (0 à 1 le long de la direction), lissé. */
export const poidsFondu = (t, from, to) => {
  if (to - from < 1e-6) return t >= to ? 1 : 0;
  const u = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return u * u * (3 - 2 * u);
};

// Filtre Konva : l'image floutée (Konva.Filters.Blur sur une copie) mêlée à
// l'image nette, pixel par pixel, selon le poids du fondu.
const filtreFlouDegrade = (fondu) =>
  function flouDegrade(imageData) {
    const { width: w, height: h, data } = imageData;
    const floue = new ImageData(new Uint8ClampedArray(data), w, h);
    Konva.Filters.Blur.call(this, floue);
    const rad = (fondu.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const etendue = (Math.abs(dx) * w) / 2 + (Math.abs(dy) * h) / 2 || 1;
    const fd = floue.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = (((x - w / 2) * dx + (y - h / 2) * dy) / etendue + 1) / 2;
        const p = poidsFondu(t, fondu.from, fondu.to);
        if (p === 0) continue;
        const i = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) data[i + c] = data[i + c] + (fd[i + c] - data[i + c]) * p;
      }
    }
    return imageData;
  };

/**
 * Filtre Konva de l'OMBRE INTERNE (`utils/ombreInterne.js`). Les réglages sont
 * LUS SUR LE NŒUD (`ombreInterneNoeud`, unités du nœud, et `ratioCache`) et
 * non figés dans le filtre : `recacherFiltres` change la résolution du cache
 * à l'export.
 */
function ombreInterne(imageData) {
  const o = this.getAttr?.('ombreInterneNoeud');
  if (!o) return imageData;
  ombrerPixels(imageData, o, this.getAttr?.('ratioCache') ?? 1, (img, r) =>
    Konva.Filters.Blur.call({ blurRadius: () => r }, img)
  );
  return imageData;
}

/**
 * MASQUE d'un élément qui n'est pas une image (une forme) : même réglages et
 * même construction que l'image (`dessinerMasque`, `utils/imageForme.js`),
 * mais appliqués par FILTRE sur le cache — une forme n'a pas de `sceneFunc`
 * unique à détourner (Rect, Ellipse, Étoile…). Le cadre du masque est la
 * GÉOMÉTRIE du nœud, contour et ombre exclus (`masqueNoeud`), placé dans le
 * cache par `cacheOrigine` (même calcul que `Konva.Node.cache`).
 */
function masqueForme(imageData) {
  const m = this.getAttr?.('masqueNoeud');
  const o = this.getAttr?.('cacheOrigine');
  const reglages = m && reglagesMasque(m.champs);
  if (!reglages || !o || !(m.w > 0 && m.h > 0) || typeof document === 'undefined') return imageData;
  const ratio = this.getAttr?.('ratioCache') ?? 1;
  const { width: w, height: h, data } = imageData;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const a = cv.getContext('2d');
  a.translate((m.x - o.x) * ratio, (m.y - o.y) * ratio);
  dessinerMasque(a, reglages, m.w * ratio, m.h * ratio, m.w / m.h, ratio >= 3 ? 2048 : 1024);
  const alpha = a.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) data[i] = (data[i] * alpha[i]) / 255;
  return imageData;
}

/**
 * Ombre portée d'un élément masqué par filtre (`ombrePorteePixels`) : lue sur
 * le nœud (`ombrePorteeNoeud`), en unités du nœud — celles de Konva pour
 * `shadowOffset` et `shadowBlur`.
 */
function ombrePortee(imageData) {
  const o = this.getAttr?.('ombrePorteeNoeud');
  if (!o) return imageData;
  ombrePorteePixels(imageData, o, this.getAttr?.('ratioCache') ?? 1, (img, r) =>
    Konva.Filters.Blur.call({ blurRadius: () => r }, img)
  );
  return imageData;
}

// Allume ou éteint l'ombre de Konva sur le nœud et ses formes (un groupe à
// l'export planche porte l'ombre sur son enfant).
const ombreKonva = (node, actif) => {
  for (const n of [node, ...(node.find?.('Shape') ?? [])]) n.shadowEnabled?.(actif);
};

/** Les champs de masque d'un élément non-image, ou null s'il n'en a pas. */
const champsMasque = (el) =>
  el && el.type !== 'image' && reglagesMasque(el)
    ? { mask: el.mask, maskPadding: el.maskPadding, maskFeather: el.maskFeather, maskTexture: el.maskTexture }
    : null;

// Met en cache en retenant où commence la zone cachée (voir `Konva.Node.cache`)
const cacher = (node, ratio, marge) => {
  const r = node.getClientRect({ skipTransform: true, relativeTo: node.getParent?.() || undefined });
  node.setAttr('cacheOrigine', { x: Math.floor(r.x) - marge, y: Math.floor(r.y) - marge });
  node.cache({ pixelRatio: ratio, offset: marge });
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
    champsMasque(el) && masqueForme,
    ombreInterneDe(el) && ombreInterne,
    champsMasque(el) && ombrePorteeDe(el) && ombrePortee,
    rayonFlou(el) > 0 && (fonduFlou(el) ? filtreFlouDegrade(fonduFlou(el)) : Konva.Filters.Blur),
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
  // Élément masqué par filtre : l'ombre de Konva serait coupée par le masque,
  // elle est éteinte et refaite en pixels (`ombrePortee`). Rallumée sinon.
  const ombreRefaite = champsMasque(el) ? ombrePorteeDe(el) : null;
  if (champsMasque(el)) {
    ombreKonva(node, false);
    node.setAttr('ombreKonvaEteinte', true);
  } else if (node.getAttr?.('ombreKonvaEteinte')) {
    ombreKonva(node, !!el.shadowEnabled);
    node.setAttr('ombreKonvaEteinte', false);
  }
  node.setAttr?.('ombrePorteeNoeud', ombreRefaite);
  if (!filtres.length) {
    node.filters?.([]);
    return;
  }
  const rayon = rayonFlou(el) * echelle;
  node.filters(filtres);
  node.blurRadius(rayon * ratio);
  node.brightness(luminosite(el));
  node.setAttr('rayonFlouNoeud', rayon); // relu par `recacherFiltres` sur un clone
  const ombre = ombreInterneDe(el);
  node.setAttr(
    'ombreInterneNoeud',
    ombre && {
      ...ombre,
      blur: ombre.blur * echelle,
      offsetX: ombre.offsetX * echelle,
      offsetY: ombre.offsetY * echelle,
    }
  );
  node.setAttr('ratioCache', ratio);
  const champs = champsMasque(el);
  if (champs) {
    const g = node.getClientRect({ skipTransform: true, skipStroke: true, skipShadow: true });
    node.setAttr('masqueNoeud', { champs, x: g.x, y: g.y, w: g.width, h: g.height });
  } else node.setAttr('masqueNoeud', null);
  // Un nœud vide (image pas encore chargée) ne se met pas en cache
  const r = node.getClientRect({ skipTransform: true });
  if (!(r.width > 0 && r.height > 0)) return;
  // Marge du cache : le flou, et l'ombre refaite (Konva ne la compte plus)
  const marge =
    Math.ceil(rayon) +
    2 +
    (ombreRefaite ? Math.ceil(ombreRefaite.blur + Math.max(Math.abs(ombreRefaite.offsetX), Math.abs(ombreRefaite.offsetY))) : 0);
  node.setAttr('margeCache', marge);
  cacher(node, ratio, marge);
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
    n.setAttr('ratioCache', ratioExport);
    cacher(n, ratioExport, n.getAttr('margeCache') ?? Math.ceil(rayon) + 2);
  }
};
