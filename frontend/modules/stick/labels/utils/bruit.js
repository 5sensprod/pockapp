// frontend/modules/stick/labels/utils/bruit.js
//
// TEXTURES PARAMÉTRIQUES : bruit de valeur, bruit blanc, Perlin, Voronoï.
// Écrit ici le 29/09/2026 : PocketStick n'en a pas (rien à reprendre).
//
// JavaScript PUR — ni Konva ni DOM — pour être testé sous Node. Le résultat est
// une CARTE DE NIVEAUX (0 à 255), qui sert de masque alpha (`carteTexture.js`,
// `imageForme.js`).
//
// DÉTERMINISME : tout vient d'un hachage entier de (cellule, graine), jamais de
// `Math.random`. Et la carte est échantillonnée en coordonnées NORMALISÉES AU
// CADRE : la même graine dessine le même motif quelle que soit la résolution de
// la carte — celle de l'écran comme celle de l'export. Le rapport largeur /
// hauteur du cadre (`aspect`) garde les cellules rondes : l'échelle compte les
// cellules sur le plus PETIT côté.
//
//   { type: 'value'|'white'|'perlin'|'voronoi', scale, seed, octaves,
//     distance: 'f1'|'f2'|'f2-f1', contrast, threshold, softness, invert }

// Les `id` sont ceux des éléments enregistrés ; les libellés sont des mots de
// boutique (3 octobre 2026) — ils disaient « Bruit », « Bruit blanc »,
// « Perlin », « Voronoï ».
export const TYPES_TEXTURE = [
  { id: 'value', label: 'Grain doux' },
  { id: 'white', label: 'Grain fin' },
  { id: 'perlin', label: 'Nuages' },
  { id: 'voronoi', label: 'Cellules' },
];

export const TEXTURE_PAR_DEFAUT = {
  type: 'perlin',
  scale: 4,
  seed: 1,
  octaves: 3,
  distance: 'f1',
  contrast: 1,
  threshold: 0.5,
  softness: 1,
  invert: false,
};

const num = (v, d, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

/** Une texture lisible, bornée, ou null. */
export const sanitizeTexture = (t) => {
  if (!t || typeof t !== 'object' || !TYPES_TEXTURE.some((x) => x.id === t.type)) return null;
  const d = TEXTURE_PAR_DEFAUT;
  return {
    type: t.type,
    scale: num(t.scale, d.scale, 0.5, 64),
    seed: Math.round(num(t.seed, d.seed, 0, 999999)),
    octaves: Math.round(num(t.octaves, d.octaves, 1, 6)),
    distance: ['f1', 'f2', 'f2-f1'].includes(t.distance) ? t.distance : d.distance,
    contrast: num(t.contrast, d.contrast, 0, 5),
    threshold: num(t.threshold, d.threshold, 0, 1),
    softness: num(t.softness, d.softness, 0, 1),
    invert: !!t.invert,
  };
};

// ── Hachage entier (cellule, graine) → [0, 1) ───────────────────────────────
const hash = (ix, iy, seed) => {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const lisse = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Bruit de valeur, [0, 1]. */
const valeur = (x, y, seed) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const u = lisse(x - ix);
  const v = lisse(y - iy);
  return lerp(
    lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u),
    lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u),
    v
  );
};

// Seize directions de gradient, tirées d'une table plutôt que d'un cos/sin
// par coin : c'est ce qui rend 1024² supportable.
const GX = Array.from({ length: 16 }, (_, i) => Math.cos((i * Math.PI) / 8));
const GY = Array.from({ length: 16 }, (_, i) => Math.sin((i * Math.PI) / 8));

/** Perlin (gradients), ramené à [0, 1]. */
const perlin = (x, y, seed) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const g = (cx, cy, dx, dy) => {
    const k = (hash(cx, cy, seed) * 16) | 0;
    return GX[k] * dx + GY[k] * dy;
  };
  const u = lisse(fx);
  const v = lisse(fy);
  const n = lerp(
    lerp(g(ix, iy, fx, fy), g(ix + 1, iy, fx - 1, fy), u),
    lerp(g(ix, iy + 1, fx, fy - 1), g(ix + 1, iy + 1, fx - 1, fy - 1), u),
    v
  );
  return n / Math.SQRT2 + 0.5; // |n| ≤ √2/2
};

/** Voronoï : distances aux deux points de germe les plus proches. */
const voronoi = (x, y, seed, distance) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i;
      const cy = iy + j;
      const px = cx + hash(cx, cy, seed) - x;
      const py = cy + hash(cx, cy, seed + 7919) - y;
      const d = px * px + py * py;
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  }
  f1 = Math.sqrt(f1);
  f2 = Math.sqrt(f2);
  const r = distance === 'f2' ? f2 / 1.2 : distance === 'f2-f1' ? f2 - f1 : f1;
  return Math.min(1, r);
};

/** fBm : octaves superposées, normalisées. */
const fbm = (fn, x, y, seed, octaves) => {
  let somme = 0;
  let poids = 0;
  let a = 1;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    somme += a * fn(x * f, y * f, seed + o * 1013);
    poids += a;
    a *= 0.5;
    f *= 2;
  }
  return somme / poids;
};

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Niveau de la texture au point (u, v) du cadre (fractions, 0 à 1), dans
 * [0, 1]. `aspect` = largeur / hauteur du cadre.
 */
export const niveauTexture = (tex, u, v, aspect = 1) => {
  const ax = aspect >= 1 ? aspect : 1;
  const ay = aspect >= 1 ? 1 : 1 / aspect;
  const x = u * tex.scale * ax;
  const y = v * tex.scale * ay;
  let n;
  if (tex.type === 'white') n = hash(Math.floor(x * 16), Math.floor(y * 16), tex.seed);
  else if (tex.type === 'value') n = fbm(valeur, x, y, tex.seed, tex.octaves);
  else if (tex.type === 'perlin') n = fbm(perlin, x, y, tex.seed, tex.octaves);
  else n = voronoi(x, y, tex.seed, tex.distance);
  n = (n - 0.5) * tex.contrast + 0.5;
  const s = Math.max(0.001, tex.softness);
  n = smoothstep(tex.threshold - s / 2, tex.threshold + s / 2, n);
  return tex.invert ? 1 - n : n;
};

/**
 * La carte entière, `largeur × hauteur` niveaux 0-255 (ligne par ligne), ou
 * null si la texture est illisible.
 */
export const carteNiveaux = (texture, largeur, hauteur, aspect = 1) => {
  const tex = sanitizeTexture(texture);
  if (!tex || !(largeur > 0) || !(hauteur > 0)) return null;
  const out = new Uint8ClampedArray(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const v = (y + 0.5) / hauteur;
    for (let x = 0; x < largeur; x++) {
      out[y * largeur + x] = Math.round(niveauTexture(tex, (x + 0.5) / largeur, v, aspect) * 255);
    }
  }
  return out;
};
