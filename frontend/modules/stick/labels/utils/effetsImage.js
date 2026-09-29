// frontend/modules/stick/labels/utils/effetsImage.js
//
// PORTÉ À L'IDENTIQUE de PocketStick (I:\pocketstick, src/editor/store/effects.js)
// le 29/09/2026 : dix filtres réglables d'image. Seul cet en-tête change.
// Appliqués par `utils/effetsKonva.js` (canvas et exports).
//
// Filtres d’image « avancés » (champ `filters` : { nom: { intensity } }).
// Modèle maison : balance des blancs par gains, courbes de tons, filtres Konva natifs.
import { Contrast } from "konva/lib/filters/Contrast";
import { HSL } from "konva/lib/filters/HSL";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const byte = (v) => clamp(v, 0, 255);

// range : bornes de l’intensité ; label : libellé de l’interface.
export const EFFECTS = [
  { name: "warm", label: "Chaud", range: [0, 1], initial: 0.5 },
  { name: "cold", label: "Froid", range: [0, 1], initial: 0.5 },
  { name: "natural", label: "Naturel", range: [0, 1], initial: 0.5 },
  { name: "temperature", label: "Température", range: [-1, 1], initial: 0.5 },
  { name: "contrast", label: "Contraste", range: [-1, 1], initial: 0.5 },
  { name: "shadows", label: "Ombres", range: [-1, 1], initial: 0.5 },
  { name: "white", label: "Blancs", range: [-1, 1], initial: 0.5 },
  { name: "black", label: "Noirs", range: [-1, 1], initial: 0.5 },
  { name: "vibrance", label: "Vibrance", range: [-1, 1], initial: 0.5 },
  { name: "saturation", label: "Saturation", range: [-1, 1], initial: 0.5 },
];

const BY_NAME = Object.fromEntries(EFFECTS.map((effect) => [effect.name, effect]));

// Garde les filtres connus avec une intensité numérique bornée ; null si la valeur est invalide.
export const sanitizeFilters = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const [name, entry] of Object.entries(value)) {
    const effect = BY_NAME[name];
    const intensity = entry?.intensity;
    if (!effect || typeof intensity !== "number" || !Number.isFinite(intensity)) continue;
    result[name] = { intensity: clamp(intensity, ...effect.range) };
  }
  return result;
};

// Chaque effet est l’une de trois familles :
// - balance des blancs : un gain multiplicatif par canal (le noir reste noir) ;
// - courbe de tons : une table de 256 valeurs, lisse, appliquée aux trois canaux ;
// - couleur : filtres natifs Konva (Contrast, HSL) ou notre vibrance.
const unit = (x) => clamp(x, 0, 1);

const tableFrom = (curve) => {
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = Math.round(unit(curve(v / 255)) * 255);
  return table;
};

// Gains [R, G, B] par unité d’intensité.
const gainsFilter = (gains, t) => {
  const tables = gains.map((g) => tableFrom((x) => x * (1 + g * t)));
  return (imageData) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = tables[0][d[i]];
      d[i + 1] = tables[1][d[i + 1]];
      d[i + 2] = tables[2][d[i + 2]];
    }
    return imageData;
  };
};

const curveFilter = (curve) => {
  const table = tableFrom(curve);
  return (imageData) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = table[d[i]];
      d[i + 1] = table[d[i + 1]];
      d[i + 2] = table[d[i + 2]];
    }
    return imageData;
  };
};

// Filtre natif Konva appelé avec ses réglages, sans toucher aux attributs du nœud.
const konvaFilter = (filter, settings) => {
  const node = Object.fromEntries(Object.entries({ hue: 0, saturation: 0, luminance: 0, ...settings }).map(([k, v]) => [k, () => v]));
  return (imageData) => {
    filter.call(node, imageData);
    return imageData;
  };
};

// HSL multiplie la saturation par 2^saturation : −1 → gris (presque), +1 → ×2.
const saturationFilter = (factor) => konvaFilter(HSL, { saturation: Math.log2(Math.max(factor, 1 / 256)) });

const chain = (...filters) => (imageData) => filters.reduce((img, f) => f(img), imageData);

const BUILDERS = {
  warm: (t) => gainsFilter([0.12, 0.05, -0.08], t),
  cold: (t) => gainsFilter([-0.08, -0.02, 0.12], t),
  temperature: (t) => gainsFilter([0.08, 0, -0.08], t),
  natural: (t) => chain(gainsFilter([0.06, 0.06, 0.06], t), saturationFilter(1 + 0.25 * t)),
  contrast: (t) => konvaFilter(Contrast, { contrast: 50 * t }),
  // bosse centrée sur les tons sombres, nulle en 0 et en 1
  shadows: (t) => curveFilter((x) => x + 1.2 * t * x * (1 - x) ** 2),
  // bosse centrée sur les tons clairs, le blanc pur reste blanc
  white: (t) => curveFilter((x) => x + 1.2 * t * x ** 2 * (1 - x)),
  // point noir : relevé (t > 0) ou enfoncé (t < 0), sans effet sur les clairs
  black: (t) => curveFilter((x) => x + 0.25 * t * (1 - x) ** 3),
  saturation: (t) => saturationFilter(1 + t),
  // vibrance : agit surtout sur les couleurs ternes, ménage celles déjà saturées
  vibrance: (t) => (imageData) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b);
      if (max === 0) continue;
      const dullness = 1 - (max - Math.min(r, g, b)) / max;
      const k = 1 + 0.8 * t * dullness;
      const avg = (r + g + b) / 3;
      d[i] = byte(avg + (r - avg) * k);
      d[i + 1] = byte(avg + (g - avg) * k);
      d[i + 2] = byte(avg + (b - avg) * k);
    }
    return imageData;
  },
};

// Filtre Konva (imageData modifié sur place) pour un effet et une intensité.
export const effectFilter = (name, intensity) => {
  const effect = BY_NAME[name];
  if (!effect) return null;
  return BUILDERS[name](clamp(intensity, ...effect.range));
};

// Filtres Konva dans l’ordre du champ `filters`.
export const effectFilters = (filters) =>
  Object.entries(sanitizeFilters(filters) || {}).map(([name, { intensity }]) => effectFilter(name, intensity));

// Active (intensité initiale) ou retire un filtre ; renvoie un nouvel objet.
export const toggleEffect = (filters, name, enabled) => {
  const next = { ...(sanitizeFilters(filters) || {}) };
  if (!BY_NAME[name]) return next;
  if (enabled) next[name] = next[name] || { intensity: BY_NAME[name].initial };
  else delete next[name];
  return next;
};

export const setEffectIntensity = (filters, name, intensity) =>
  sanitizeFilters({ ...(filters || {}), [name]: { intensity } }) || {};
