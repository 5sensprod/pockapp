// frontend/modules/stick/labels/utils/pave2D.js
//
// LE PAVÉ 2D (`components/ui/Pave2D.jsx`) : un carré où l'on glisse un point
// pour régler DEUX valeurs d'un geste — le décalage X/Y d'une ombre. Ici, ses
// calculs seuls : conversion pavé ↔ valeurs, accrochage, contrainte, clavier.
// Module pur, testable sous Node.
//
// Repère : le centre du pavé vaut (0, 0), ses bords ±`max`. La poignée ne
// sort pas du pavé : sa course s'arrête à `MARGE` du bord.

/** Demi-largeur de la poignée : la course utile est `taille - 2 × MARGE`. */
export const MARGE = 6;

const borner = (v, max) => Math.min(max, Math.max(-max, v));
const fini = (v) => (Number.isFinite(v) ? v : 0);

/** Position dans le pavé (px depuis son coin haut gauche) → valeurs, bornées et arrondies au pas. */
export const depuisPave = (px, py, { taille, max, pas = 1 }) => {
  const demi = (taille - 2 * MARGE) / 2;
  const valeur = (p) => {
    const v = ((p - taille / 2) / demi) * max;
    // `+ 0` : jamais de zéro négatif
    return borner(Math.round(v / pas) * pas, max) + 0;
  };
  return { x: valeur(px), y: valeur(py) };
};

/**
 * Valeurs → position de la poignée dans le pavé. Une valeur hors bornes (un
 * template ancien peut en porter une, le rendu ne borne pas) colle la poignée
 * au bord SANS rien réécrire ; une valeur absente la met au centre.
 */
export const versPave = (x, y, { taille, max }) => {
  const demi = (taille - 2 * MARGE) / 2;
  const position = (v) => taille / 2 + (borner(fini(v), max) / max) * demi;
  return { px: position(x), py: position(y) };
};

/** Accrochage au centre et aux axes : une valeur à `seuil` ou moins de 0 devient 0. */
export const accrocher = ({ x, y }, seuil) => ({
  x: seuil > 0 && Math.abs(x) <= seuil ? 0 : x,
  y: seuil > 0 && Math.abs(y) <= seuil ? 0 : y,
});

/**
 * Maj : contraint à l'axe dominant, ou à la diagonale quand les deux valeurs
 * sont proches (moins du double l'une de l'autre).
 */
export const contraindre = ({ x, y }) => {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax >= 2 * ay) return { x, y: 0 };
  if (ay >= 2 * ax) return { x: 0, y };
  const m = Math.round((ax + ay) / 2);
  return { x: Math.sign(x) * m, y: Math.sign(y) * m };
};

/**
 * Direction et distance, pour l'affichage seulement — X/Y restent la seule
 * vérité. Angle en degrés, 0° vers la droite, 90° vers le BAS (repère écran).
 */
export const polaire = (x, y) => {
  const distance = Math.round(Math.hypot(fini(x), fini(y)));
  if (!distance) return { angle: 0, distance: 0 };
  const angle = Math.round((Math.atan2(fini(y), fini(x)) * 180) / Math.PI);
  return { angle: (angle + 360) % 360, distance };
};

/** Flèches : ±1, Maj ±10 ; Origine : retour au centre (`centre: true`). null sinon. */
export const pasClavier = (touche, maj = false) => {
  const pas = maj ? 10 : 1;
  switch (touche) {
    case 'ArrowLeft':
      return { dx: -pas, dy: 0 };
    case 'ArrowRight':
      return { dx: pas, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -pas };
    case 'ArrowDown':
      return { dx: 0, dy: pas };
    case 'Home':
      return { dx: 0, dy: 0, centre: true };
    default:
      return null;
  }
};

/** Déplace de (dx, dy), borné. */
export const deplacer = ({ x, y }, { dx, dy, centre }, max) =>
  centre ? { x: 0, y: 0 } : { x: borner(fini(x) + dx, max), y: borner(fini(y) + dy, max) };

/**
 * CHAMP À GLISSER (`ui/ChampNombre.jsx`) : la valeur après un glissement de
 * `dxPixels` sur le libellé. Deux pixels par pas ; Maj ×10, Alt ÷10.
 */
export const valeurGlissee = (depart, dxPixels, { pas = 1, min = -Infinity, max = Infinity, maj = false, alt = false } = {}) => {
  const p = pas * (maj ? 10 : alt ? 0.1 : 1);
  const v = fini(depart) + Math.round(dxPixels / 2) * p;
  // Arrondi au plus FIN des deux pas (Maj saute de 10 en 10 sans quitter la
  // valeur de départ), sans traîner de décimales binaires
  const fin = Math.min(p, pas);
  const net = Math.round(v / fin) * fin;
  return Math.min(max, Math.max(min, Math.round(net * 1000) / 1000));
};
