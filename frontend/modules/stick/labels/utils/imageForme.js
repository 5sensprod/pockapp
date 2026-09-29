// frontend/modules/stick/labels/utils/imageForme.js
//
// MIROIR et MASQUE d'une image, sans changer de nœud. L'image reste un seul
// `Konva.Image` — le redimensionnement et le recadrage le manipulent
// directement (`KonvaCanvas`, `resizeStep`) — et c'est son DESSIN qui change :
// une `sceneFunc` qui découpe le cadre à la forme du masque, retourne le
// repère, puis laisse Konva dessiner l'image comme d'habitude
// (`Konva.Image._sceneFunc`, recadrage compris). Une seule fonction pour le
// canvas (`ImageNode`) et l'export planche ; l'export du canvas cloné la
// reçoit avec le clone (attribut du nœud).
//
// PocketStick fait autrement (`canvas/elements.jsx` : groupe mis en cache, SVG
// en `destination-in`, `scaleX: -1`) ; ses huit FORMES de masque sont reprises
// telles quelles (`store/masks.js`), réécrites en chemins dans un carré
// 100 × 100 étiré sur le cadre. Le miroir porte sur ce que montre le cadre :
// un recadrage est retourné avec l'image.
//
// AJOUTS du 29/09/2026 : le RETRAIT (`maskPadding`) et le masque TEXTURE
// (`maskTexture`, `bruit.js`), combinables avec la forme.

import { sanitizeTexture } from './bruit';
import { carteTexture } from './carteTexture';

export const MASQUES = [
  { id: 'circle', label: 'Cercle', d: 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z' },
  {
    id: 'rounded',
    label: 'Rectangle arrondi',
    d: 'M18 0 H82 A18 18 0 0 1 100 18 V82 A18 18 0 0 1 82 100 H18 A18 18 0 0 1 0 82 V18 A18 18 0 0 1 18 0 Z',
  },
  { id: 'triangle', label: 'Triangle', d: 'M50 0 L100 100 L0 100 Z' },
  { id: 'star', label: 'Étoile', d: 'M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z' },
  { id: 'heart', label: 'Cœur', d: 'M50 96 C20 72 0 54 0 30 A25 25 0 0 1 50 18 A25 25 0 0 1 100 30 C100 54 80 72 50 96 Z' },
  { id: 'hexagon', label: 'Hexagone', d: 'M25 0 L75 0 L100 50 L75 100 L25 100 L0 50 Z' },
  { id: 'arch', label: 'Arche', d: 'M0 100 V50 A50 50 0 0 1 100 50 V100 Z' },
  { id: 'diamond', label: 'Losange', d: 'M50 0 L100 50 L50 100 L0 50 Z' },
];

const PAR_ID = Object.fromEntries(MASQUES.map((m) => [m.id, m]));

/** Le masque d'un élément, ou null. */
export const masqueDe = (el) => PAR_ID[el?.mask] ?? null;

export const RETRAIT_MAX = 40;

/**
 * RETRAIT du masque (`maskPadding`), en % du cadre sur chaque côté (0 à 40),
 * rendu en fraction. Il rétrécit la forme ET la texture dans le cadre ; en %
 * pour suivre le redimensionnement, comme le chemin 100 × 100.
 */
export const retraitMasque = (el) => {
  const p = Number(el?.maskPadding);
  return Number.isFinite(p) ? Math.min(RETRAIT_MAX, Math.max(0, p)) / 100 : 0;
};

/** Faut-il un dessin particulier ? */
export const dessinParticulier = (el) =>
  !!(el?.flipX || el?.flipY || masqueDe(el) || retraitMasque(el) > 0 || fonduMasque(el) > 0 || sanitizeTexture(el?.maskTexture));

// Plafond du canvas hors écran d'une image texturée (pixels par côté)
const HORS_ECRAN_MAX = 4096;

// L'image telle que Konva la dessine (`Konva.Image._sceneFunc`), recadrage
// compris, sur un contexte 2D brut : le canvas hors écran n'est pas un contexte
// Konva.
const dessinerImage = (c, shape, w, h) => {
  const img = shape.image?.();
  if (!img) return;
  const cw = shape.cropWidth?.();
  const ch = shape.cropHeight?.();
  if (cw && ch) c.drawImage(img, shape.cropX() || 0, shape.cropY() || 0, cw, ch, 0, 0, w, h);
  else c.drawImage(img, 0, 0, w, h);
};

/**
 * FONDU du bord du masque (`maskFeather`, feather), en % du plus petit côté du
 * cadre (0 à 25), rendu en fraction. S'applique au bord de la forme, ou au
 * rectangle du retrait quand il n'y a pas de forme.
 */
export const FONDU_MAX = 25;
export const fonduMasque = (el) => {
  const f = Number(el?.maskFeather);
  return Number.isFinite(f) ? Math.min(FONDU_MAX, Math.max(0, f)) / 100 : 0;
};

// Chemin de la forme (ou du rectangle du retrait) dans un cadre `w × h`
const cheminMasque = (masque, w, h, p) => {
  const chemin = new Path2D();
  const m = new DOMMatrix().translate(w * p, h * p);
  if (masque) chemin.addPath(new Path2D(masque.d), m.scale((w * (1 - 2 * p)) / 100, (h * (1 - 2 * p)) / 100));
  else chemin.rect(w * p, h * p, w * (1 - 2 * p), h * (1 - 2 * p));
  return chemin;
};

/**
 * `sceneFunc` Konva pour une image miroir et/ou masquée, ou undefined (dessin
 * normal). Lit la taille sur le nœud au moment du dessin : elle suit donc un
 * redimensionnement en cours sans nouveau rendu React.
 *
 * Sans texture ni fondu : découpe nette (`clip`) sur le contexte.
 *
 * TEXTURE (`maskTexture`, `bruit.js`) ou FONDU (`maskFeather`) : l'image est
 * dessinée dans un canvas HORS ÉCRAN, à la résolution réelle du dessin (lue
 * sur la transformation du contexte : zoom, `pixelRatio` et échelle d'export
 * compris). On y compose un masque alpha — la forme (ou le rectangle du
 * retrait), floutée du fondu, multipliée par la carte de texture qui couvre
 * tout le cadre — en `destination-in`, puis le résultat est posé sur le
 * contexte. Un `destination-in` sur le contexte lui-même effacerait le reste
 * du calque. Le flou du bord passe par `ctx.filter` (Chromium, donc WebView2).
 * Sur le canvas de SÉLECTION (hit), le cadre entier reste cliquable.
 */
export const sceneImage = ({
  flipX = false,
  flipY = false,
  mask = null,
  maskPadding = 0,
  maskTexture = null,
  maskFeather = 0,
} = {}) => {
  const masque = PAR_ID[mask] ?? null;
  const texture = sanitizeTexture(maskTexture);
  const p = retraitMasque({ maskPadding });
  const f = fonduMasque({ maskFeather });
  const decoupe = !!masque || p > 0 || f > 0;
  if (!flipX && !flipY && !decoupe && !texture) return undefined;
  return (ctx, shape) => {
    const w = shape.width();
    const h = shape.height();
    ctx.save();
    const hit = !!ctx.getCanvas?.()?.hitCanvas;
    const horsEcran = (texture || f > 0) && !hit;
    if (horsEcran && typeof document !== 'undefined' && typeof Path2D !== 'undefined' && w > 0 && h > 0) {
      const m = ctx._context.getTransform();
      const ex = Math.hypot(m.a, m.b) || 1;
      const ey = Math.hypot(m.c, m.d) || 1;
      const k = Math.min(1, HORS_ECRAN_MAX / Math.max(w * ex, h * ey));
      const pw = Math.max(1, Math.ceil(w * ex * k));
      const ph = Math.max(1, Math.ceil(h * ey * k));
      const neuf = () => {
        const cv = document.createElement('canvas');
        cv.width = pw;
        cv.height = ph;
        return [cv, cv.getContext('2d')];
      };
      // 1) Le masque alpha
      const [alpha, a] = neuf();
      a.fillStyle = '#fff';
      if (decoupe) {
        if (f > 0) a.filter = `blur(${f * Math.min(pw, ph)}px)`;
        a.fill(cheminMasque(masque, pw, ph, p));
        a.filter = 'none';
      } else a.fillRect(0, 0, pw, ph);
      if (texture) {
        const ratio = ctx.getCanvas?.()?.getPixelRatio?.() ?? 1;
        const carte = carteTexture(texture, pw, ph, w / h, ratio >= 3 ? 2048 : 1024);
        if (carte) {
          a.globalCompositeOperation = 'destination-in';
          a.drawImage(carte, 0, 0, pw, ph);
        }
      }
      // 2) L'image, miroir compris, puis le masque
      const [hors, c] = neuf();
      c.scale(pw / w, ph / h);
      if (flipX || flipY) {
        c.translate(flipX ? w : 0, flipY ? h : 0);
        c.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      }
      dessinerImage(c, shape, w, h);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(alpha, 0, 0);
      ctx._context.drawImage(hors, 0, 0, w, h);
      ctx.restore();
      return;
    }
    if (decoupe && typeof Path2D !== 'undefined') ctx._context.clip(cheminMasque(masque, w, h, p));
    if (flipX || flipY) {
      ctx.translate(flipX ? w : 0, flipY ? h : 0);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    }
    shape._sceneFunc(ctx);
    ctx.restore();
  };
};
