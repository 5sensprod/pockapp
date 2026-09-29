// frontend/modules/stick/labels/utils/texteCourbe.js
//
// TEXTE COURBÉ (`curve`, -100 à 100). Comme le masque d'image, ce n'est pas
// un autre nœud : le `Konva.Text` reste le même (sélection, édition en place,
// redimensionnement, export par clone et planche), et c'est son DESSIN qui
// change — une `sceneFunc` qui pose chaque lettre sur un arc. Konva garde le
// découpage en lignes (`textArr`), l'alignement et la police ; le remplissage
// et le contour passent par `fillStrokeShape`, dégradés et textures compris.
//
// Géométrie : `curve` = 100 → l'arc fait un demi-cercle (180°) sur la largeur
// du cadre. Positif : en arche (∩), centre du cercle SOUS le texte ; négatif :
// en creux (∪), centre AU-DESSUS. Chaque ligne suit un arc concentrique ; la
// position d'une lettre sur l'arc est sa position dans la ligne droite
// (alignement compris), comptée depuis le milieu du cadre.
//
// Les lettres débordent du cadre droit : `getSelfRect` est remplacé sur le
// nœud (`installerCourbure`) pour que sélection, cache des effets et masques
// voient la vraie étendue. Un clone perd ce remplacement : `installerCourbure`
// est rappelée par la sceneFunc et par la mise en cache (`effetsKonva.js`).

export const COURBE_MAX = 100;

/** Courbure effective, -100 à 100 ; 0 si aucune. */
export const courbureDe = (el) => {
  const c = Number(el?.curve);
  return Number.isFinite(c) ? Math.min(COURBE_MAX, Math.max(-COURBE_MAX, c)) : 0;
};

/**
 * Pose des lettres (JS pur). `lignes` : `[{ lettres: [{ c, w }], largeur }]`,
 * `W` largeur du cadre, `lh` hauteur de ligne, `align`. Rend
 * `{ lettres: [{ c, x, y, angle }], rect }` — `angle` en radians, `rect`
 * l'étendue dessinée (lettres comprises, marge d'une demi-taille).
 */
export const disposerCourbe = ({ lignes, W, lh, fontSize, padding = 0, curve, align = 'left' }) => {
  const theta = (Math.abs(curve) / 100) * Math.PI;
  const R = W / Math.max(theta, 1e-6);
  const sens = curve >= 0 ? 1 : -1;
  const y0 = padding + lh / 2; // milieu de la première ligne
  const cy = y0 + sens * R; // centre du cercle
  const out = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  lignes.forEach((ligne, i) => {
    const r = R - sens * i * lh; // arcs concentriques
    if (!(r > 0)) return;
    const decal =
      align === 'center' ? (W - ligne.largeur) / 2 : align === 'right' ? W - ligne.largeur : 0;
    let s = decal + padding;
    for (const { c, w } of ligne.lettres) {
      const phi = (s + w / 2 - W / 2) / r;
      const x = W / 2 + r * Math.sin(phi);
      const y = cy - sens * r * Math.cos(phi);
      out.push({ c, x, y, angle: sens * phi });
      const m = fontSize / 2 + w / 2;
      minX = Math.min(minX, x - m);
      maxX = Math.max(maxX, x + m);
      minY = Math.min(minY, y - m);
      maxY = Math.max(maxY, y + m);
      s += w;
    }
  });
  return {
    lettres: out,
    rect: out.length ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null,
  };
};

// Les lignes de Konva, découpées en lettres mesurées (espacement compris)
const lignesDuNoeud = (shape) => {
  const esp = shape.letterSpacing?.() || 0;
  return (shape.textArr || []).map((l) => {
    const lettres = Array.from(l.text).map((c) => ({ c, w: shape.measureSize(c).width + esp }));
    return { lettres, largeur: lettres.reduce((a, b) => a + b.w, 0) };
  });
};

// Génération des polices : une police qui finit de charger change la mesure
// des lettres sans changer aucun attribut du nœud.
let generationPolices = 0;
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => generationPolices++);

// Mémorisée sur le nœud : la sceneFunc ET `getSelfRect` (cache, Transformer)
// la demandent, et elle mesure chaque lettre. Recalculée dès que change ce
// qu'elle lit : lignes de Konva, police, espacement, cadre, courbure.
const disposition = (shape, curve) => {
  const cle = JSON.stringify([
    generationPolices,
    shape._getContextFont?.() ?? '',
    shape.letterSpacing?.() || 0,
    shape.width(),
    shape.lineHeight(),
    shape.fontSize(),
    shape.padding?.() || 0,
    curve,
    shape.align(),
    ...(shape.textArr || []).map((l) => [l.text, l.width]),
  ]);
  if (shape._dispositionCourbe?.cle === cle) return shape._dispositionCourbe.res;
  const res = disposerCourbe({
    lignes: lignesDuNoeud(shape),
    W: shape.width(),
    lh: shape.lineHeight() * shape.fontSize(),
    fontSize: shape.fontSize(),
    padding: shape.padding?.() || 0,
    curve,
    align: shape.align(),
  });
  shape._dispositionCourbe = { cle, res };
  return res;
};

/** Remplace `getSelfRect` du nœud par l'étendue courbée (idempotent). */
export const installerCourbure = (shape) => {
  const curve = shape?.getAttr?.('courbeTexte');
  if (!curve || shape._courbeInstallee) return;
  shape._courbeInstallee = true;
  const normal = shape.getSelfRect.bind(shape);
  shape.getSelfRect = () => {
    const c = shape.getAttr('courbeTexte');
    const r = c ? disposition(shape, c).rect : null;
    if (!r) return normal();
    const n = normal();
    const x = Math.min(n.x, r.x);
    const y = Math.min(n.y, r.y);
    return { x, y, width: Math.max(n.x + n.width, r.x + r.width) - x, height: Math.max(n.y + n.height, r.y + r.height) - y };
  };
};

/**
 * Props Konva d'un texte courbé : `sceneFunc`, `hitFunc` (le cadre courbé
 * entier, cliquable) et l'attribut `courbeTexte` ; ou de quoi revenir au
 * dessin normal.
 * @returns {Record<string, any>}
 */
export const propsCourbure = (curve) => {
  if (!curve) return { courbeTexte: 0, sceneFunc: undefined, hitFunc: undefined };
  return {
    courbeTexte: curve,
    sceneFunc: (ctx, shape) => {
      installerCourbure(shape);
      const { lettres } = disposition(shape, curve);
      ctx.setAttr('font', shape._getContextFont());
      ctx.setAttr('textBaseline', 'middle');
      ctx.setAttr('textAlign', 'center');
      for (const l of lettres) {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.angle);
        shape._partialText = l.c;
        shape._partialTextX = 0;
        shape._partialTextY = 0;
        ctx.fillStrokeShape(shape);
        ctx.restore();
      }
    },
    hitFunc: (ctx, shape) => {
      installerCourbure(shape);
      const r = shape.getSelfRect();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      ctx.closePath();
      ctx.fillStrokeShape(shape);
    },
  };
};
