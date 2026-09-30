// frontend/modules/stick/labels/utils/texteContourStylise.js
//
// CONTOUR STYLISÉ DES LETTRES (lot 3, PocketStick-docs/07-contour-lettres.md) :
// ce que le lot A fait aux formes — épaisseur variable, tremblé, ondulation —
// appliqué au contour de chaque lettre, remplissage intact.
//
// Comme le texte courbé, ce n'est pas un autre nœud : le `Konva.Text` reste le
// même (sélection, édition en place, redimensionnement, export par clone et
// planche) et c'est son DESSIN qui change — une `sceneFunc` qui peint :
//   1. le trait stylisé de chaque contour de lettre (moteur `styliserContour`,
//      le même que les formes), sous le remplissage ;
//   2. le contour ORDINAIRE des lettres absentes de la police (« € » d'Arvo) ;
//   3. le remplissage natif de Konva (droit ou courbé), contour éteint.
// Une seule ombre, celle de la silhouette (`ombreSilhouette.js`).
//
// La mise en page reste celle de Konva : la police (opentype.js) ne fournit
// que la forme des lettres. Tant que la police n'est pas chargée — ou si elle
// ne peut pas l'être, hors ligne —, l'appelant garde le contour Konva
// ordinaire : `propsContourLettres` n'est appelée qu'avec une police prête.
//
// Deux réglages ne veulent pas dire la même chose que sur une forme :
//   - `ondes` devient une DENSITÉ : un « i » et un « W » ondulent au même
//     rythme (ondes proportionnelles à la longueur du contour, rapportée à la
//     taille de la police) ;
//   - les effilements sont ignorés : sur un contour fermé, ils amincissent le
//     trait à son point de départ, qui tombe n'importe où dans la lettre.

import { styliserContour, graineDe, reglagesContour, tracerOutline } from './contourStylise';
import { commandesLettres, contoursDesCommandes, positionsDuNoeud, tracerCommandes } from './contourLettres';
import { degradeCanvas2D } from './paint';
import { propsCourbure } from './texteCourbe';
import { ombreDeSilhouette } from './ombreSilhouette';

/** Pente de l'italique fabriqué par le navigateur (mesurée : 0,25, Playfair). */
export const PENTE_ITALIQUE = 0.25;
/** Épaississement du gras fabriqué, en fraction de la taille (mesuré : 1/30). */
export const GRAS_FABRIQUE = 1 / 30;
/** Ondes par longueur de contour égale à la taille de police, à `ondes` = 4. */
const ONDES_PAR_TAILLE = 1 / 4;

/** Le texte demande-t-il un contour stylisé ? (réglages, épaisseur, couleur) */
export const contourLettresDemande = ({ contourStyle, strokeWidth, stroke, strokeGradient }) =>
  !!reglagesContour({ contourStyle }) && Number(strokeWidth) > 0 && !!(stroke || strokeGradient);

/** Nombre d'ondes d'un contour de longueur `longueur` (entier : il se referme). */
export const ondesDuContour = (longueur, fontSize, densite) =>
  Math.max(1, Math.round((longueur / Math.max(1, fontSize)) * densite * ONDES_PAR_TAILLE));

const longueurDe = (pts) => {
  let l = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    l += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return l;
};

/**
 * La géométrie du contour, sans DOM : `commandes` (le dessin des lettres),
 * `traits` (un polygone par contour de lettre), `absentes`, `cadre`.
 */
export const geometrieContourLettres = ({ police, positions, fontSize, decalAlpha, inclinaison, ep, contourStyle, id }) => {
  const r = reglagesContour({ contourStyle });
  const absentes = [];
  const commandes = commandesLettres(police, positions, { fontSize, decalAlpha, inclinaison, absentes });
  const contours = contoursDesCommandes(commandes, Math.max(0.5, ep / 3));
  const reglages = { ...r, effilementDebut: 0, effilementFin: 0 };
  const graine = graineDe(id);
  const traits = contours.map((points, i) =>
    styliserContour({
      points,
      ferme: true,
      ep,
      reglages,
      graine: (graine + Math.imul(i + 1, 2654435761)) >>> 0,
      ondes: ondesDuContour(longueurDe(points), fontSize, r.ondes),
    }).outline
  );
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of traits) {
    for (const p of t) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const cadre = Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  return { commandes, traits, absentes, cadre };
};

// --- rendu Konva ----------------------------------------------------------

// Une police qui finit de charger change la mesure des lettres sans changer
// aucun attribut du nœud (même règle que `texteCourbe.js`).
let generationPolices = 0;
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => generationPolices++);

let ctxMesure = null;
const mesureur = (font) => {
  ctxMesure ??= document.createElement('canvas').getContext('2d');
  ctxMesure.font = font;
  return (t) => ctxMesure.measureText(t).width;
};

/** De la ligne « middle » de Konva à la ligne alphabétique, pour cette police. */
const decalageAlphabetique = (font) => {
  ctxMesure ??= document.createElement('canvas').getContext('2d');
  ctxMesure.font = font;
  ctxMesure.textBaseline = 'middle';
  const milieu = ctxMesure.measureText('H').actualBoundingBoxAscent;
  ctxMesure.textBaseline = 'alphabetic';
  const alpha = ctxMesure.measureText('H').actualBoundingBoxAscent;
  return alpha - milieu;
};

// Mémorisée sur le nœud, recalculée dès que change ce qu'elle lit.
const geometrieDuNoeud = (shape, conf) => {
  const font = shape._getContextFont();
  const ep = conf.ep;
  const cle = JSON.stringify([
    generationPolices,
    conf.cle,
    font,
    shape.width(),
    shape.height(),
    shape.lineHeight(),
    shape.letterSpacing?.() || 0,
    shape.align(),
    shape.getAttr('courbeTexte') || 0,
    ep,
    conf.contourStyle,
    conf.id,
    conf.inclinaison,
    ...(shape.textArr || []).map((l) => [l.text, l.width]),
  ]);
  if (shape._contourLettres?.cle === cle) return shape._contourLettres.geo;
  const geo = geometrieContourLettres({
    police: conf.police,
    positions: positionsDuNoeud(shape, mesureur(font)),
    fontSize: shape.fontSize(),
    decalAlpha: decalageAlphabetique(font),
    inclinaison: conf.inclinaison,
    ep,
    contourStyle: conf.contourStyle,
    id: conf.id,
  });
  shape._contourLettres = { cle, geo };
  return geo;
};

/**
 * `getSelfRect` couvre aussi le trait (qui déborde du cadre du texte) : cache
 * des effets, Transformer. Enveloppe le `getSelfRect` en place — celui du
 * texte courbé compris. Idempotent ; un clone le perd, la sceneFunc le remet.
 */
const installerCadre = (shape) => {
  if (shape._cadreContourInstalle) return;
  shape._cadreContourInstalle = true;
  const avant = shape.getSelfRect.bind(shape);
  shape.getSelfRect = () => {
    const n = avant();
    const r = shape._contourLettres?.geo?.cadre;
    if (!r || !shape.getAttr('contourLettres')) return n;
    const x = Math.min(n.x, r.x);
    const y = Math.min(n.y, r.y);
    return { x, y, width: Math.max(n.x + n.width, r.x + r.width) - x, height: Math.max(n.y + n.height, r.y + r.height) - y };
  };
};

/**
 * Calcule la géométrie et pose le cadre AVANT tout dessin : un clone mis en
 * cache par les effets (`effetsKonva.js`) n'a encore rien dessiné, son cadre
 * ignorerait le trait. Sans contour stylisé : rien.
 */
export const installerContourLettres = (shape) => {
  const conf = shape?.getAttr?.('contourLettres');
  if (!conf?.police || !shape.text?.()) return;
  geometrieDuNoeud(shape, conf);
  installerCadre(shape);
};

const peindreTraits = (c, traits) => {
  c.beginPath();
  for (const t of traits) tracerOutline(c, t);
  c.fill();
};

const sceneFunc = (ctx, shape) => {
  const conf = shape.getAttr('contourLettres');
  const curve = shape.getAttr('courbeTexte');
  const remplir = () => {
    const courbe = curve ? propsCourbure(curve).sceneFunc : null;
    if (courbe) courbe(ctx, shape);
    else shape._sceneFunc(ctx);
  };
  if (!conf?.police || !shape.text()) return remplir();

  const geo = geometrieDuNoeud(shape, conf);
  installerCadre(shape);
  const c = ctx._context;
  const peindre = () => {
    c.save();
    c.fillStyle = degradeCanvas2D(ctx, conf.degrade, shape.width(), shape.height(), geo.cadre) ?? conf.couleur;
    peindreTraits(c, geo.traits);
    // Lettre absente de la police : contour ordinaire, dans la police de repli
    // du navigateur — comme le dessine Konva (ligne « middle »).
    if (geo.absentes.length) {
      c.font = shape._getContextFont();
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.lineWidth = conf.ep;
      c.lineJoin = 'round';
      c.strokeStyle = c.fillStyle;
      for (const p of geo.absentes) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.angle);
        c.strokeText(p.c, 0, 0);
        c.restore();
      }
    }
    c.restore();
    remplir();
  };

  const cadre = geo.cadre;
  const ombre =
    cadre &&
    ombreDeSilhouette(ctx, cadre, (s) => {
      peindreTraits(s, geo.traits);
      s.beginPath();
      tracerCommandes(s, geo.commandes);
      s.fill();
    });
  if (!ombre) return peindre();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0)';
  peindre();
  c.restore();
};

/**
 * Props Konva d'un texte à contour stylisé, police PRÊTE. `ep` est l'épaisseur
 * DÉJÀ à l'échelle du nœud (l'export planche la multiplie par la cellule).
 * `chargee` : la réponse de `chargerPoliceVectorielle`.
 */
export const propsContourLettres = ({ chargee, gras, italique, stroke, strokeGradient, ep, fontSize, contourStyle, id }) => {
  const fauxGras = gras && chargee.graisse < 700;
  const fauxItalique = italique && !chargee.italique;
  return {
    strokeEnabled: false,
    contourLettres: {
      police: chargee.police,
      cle: chargee.cle,
      couleur: stroke || '#000000',
      degrade: strokeGradient ?? null,
      ep: ep + (fauxGras ? fontSize * GRAS_FABRIQUE : 0),
      inclinaison: fauxItalique ? PENTE_ITALIQUE : 0,
      contourStyle,
      id: id ?? '',
    },
    sceneFunc,
  };
};

/** Props qui ramènent un texte au dessin normal (contour Konva ordinaire). */
export const SANS_CONTOUR_LETTRES = { contourLettres: null };
