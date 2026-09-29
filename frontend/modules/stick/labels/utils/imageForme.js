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

/** Faut-il un dessin particulier ? */
export const dessinParticulier = (el) => !!(el?.flipX || el?.flipY || masqueDe(el));

/**
 * `sceneFunc` Konva pour une image miroir et/ou masquée, ou undefined (dessin
 * normal). Lit la taille sur le nœud au moment du dessin : elle suit donc un
 * redimensionnement en cours sans nouveau rendu React.
 */
export const sceneImage = ({ flipX = false, flipY = false, mask = null } = {}) => {
  const masque = PAR_ID[mask] ?? null;
  if (!flipX && !flipY && !masque) return undefined;
  return (ctx, shape) => {
    const w = shape.width();
    const h = shape.height();
    ctx.save();
    if (masque && typeof Path2D !== 'undefined') {
      const chemin = new Path2D();
      chemin.addPath(new Path2D(masque.d), new DOMMatrix().scale(w / 100, h / 100));
      ctx._context.clip(chemin);
    }
    if (flipX || flipY) {
      ctx.translate(flipX ? w : 0, flipY ? h : 0);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    }
    shape._sceneFunc(ctx);
    ctx.restore();
  };
};
