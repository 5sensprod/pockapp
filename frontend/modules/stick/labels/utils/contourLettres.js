// frontend/modules/stick/labels/utils/contourLettres.js
//
// CONTOUR VECTORIEL DES LETTRES — la géométrie (lot 3 de
// PocketStick-docs/06-reprise-ui.md, mesures dans 07-contour-lettres.md).
// Le rendu est dans `utils/texteContourStylise.js`.
//
// Principe : on NE refait PAS la mise en page. Les lignes viennent de Konva
// (`textArr`), la position de chaque lettre d'une mesure du canvas faite
// comme Konva la fait (`Konva.Text._sceneFunc`, konva 9.3.22) ; la police
// (opentype.js) ne fournit que le DESSIN de chaque lettre.
//
// Deux chemins, comme dans Konva :
//   - interlettrage ou justification : lettre par lettre, chaque lettre
//     avance de sa propre largeur + interlettrage ;
//   - sinon, la ligne entière : la lettre i finit où finit le texte qui la
//     contient (approche des paires comprise).
// Et le texte courbé (`utils/texteCourbe.js`) : lettre centrée sur sa
// position de l'arc, tournée de son angle.
//
// Pas de Konva ni de DOM ici : `mesurer(texte)` est injecté. Testable sous Node.

import { disposerCourbe } from './texteCourbe';

/**
 * Positions des lettres d'un texte droit, dans le repère local du nœud.
 * `yMilieu` est la ligne de base « middle » de Konva (milieu de la ligne) ;
 * la ligne de base alphabétique est `yMilieu + decalAlpha`.
 *
 * @param {object} p
 * @param {{text:string,width:number,lastInParagraph?:boolean}[]} p.lignes  `textArr` de Konva
 * @param {number} p.largeur      largeur du nœud (`getWidth`)
 * @param {number} p.hauteur      hauteur du nœud (`getHeight`)
 * @param {number} p.fontSize
 * @param {number} p.lineHeight   multiple de la taille
 * @param {number} [p.padding]
 * @param {number} [p.letterSpacing]
 * @param {string} [p.align]      left | center | right | justify
 * @param {string} [p.verticalAlign] top | middle | bottom
 * @param {(t:string)=>number} p.mesurer  largeur d'un texte, police du nœud
 * @returns {{c:string,x:number,y:number,angle:number}[]}  y = ligne « middle »
 */
export const positionsDroites = ({
  lignes,
  largeur,
  hauteur,
  fontSize,
  lineHeight,
  padding = 0,
  letterSpacing = 0,
  align = 'left',
  verticalAlign = 'top',
  mesurer,
}) => {
  const lh = lineHeight * fontSize;
  let alignY = 0;
  if (verticalAlign === 'middle') alignY = (hauteur - lignes.length * lh - padding * 2) / 2;
  else if (verticalAlign === 'bottom') alignY = hauteur - lignes.length * lh - padding * 2;

  const out = [];
  lignes.forEach((ligne, n) => {
    const y = padding + alignY + lh / 2 + n * lh;
    let x = padding;
    if (align === 'right') x += largeur - ligne.width - padding * 2;
    else if (align === 'center') x += (largeur - ligne.width - padding * 2) / 2;
    const lettres = Array.from(ligne.text);

    if (letterSpacing !== 0 || align === 'justify') {
      const espaces = ligne.text.split(' ').length - 1;
      for (const c of lettres) {
        if (c === ' ' && !ligne.lastInParagraph && align === 'justify') {
          x += (largeur - padding * 2 - ligne.width) / espaces;
        }
        out.push({ c, x, y, angle: 0 });
        x += mesurer(c) + letterSpacing;
      }
    } else {
      // La lettre i finit là où finit le texte qui la contient : sa position
      // est cette largeur moins la sienne. Mesurer seulement ce qui la
      // précède oublierait l'approche entre elle et la lettre d'avant
      // (« AV », « VA » : 1,3 px à 40 px en Arial, mesuré).
      let prefixe = '';
      for (const c of lettres) {
        prefixe += c;
        out.push({ c, x: x + mesurer(prefixe) - mesurer(c), y, angle: 0 });
      }
    }
  });
  return out;
};

/**
 * Positions d'un texte courbé : même disposition que `texteCourbe.js`, et
 * chaque lettre y est dessinée CENTRÉE (`textAlign: center`). On rend donc
 * l'origine gauche de la lettre, décalée d'une demi-largeur le long de son
 * angle.
 */
export const positionsCourbes = ({ lignes, largeur, fontSize, lineHeight, padding = 0, letterSpacing = 0, align, curve, mesurer }) => {
  const lignesMesurees = lignes.map((l) => {
    const lettres = Array.from(l.text).map((c) => ({ c, w: mesurer(c) + letterSpacing }));
    return { lettres, largeur: lettres.reduce((a, b) => a + b.w, 0) };
  });
  const { lettres } = disposerCourbe({
    lignes: lignesMesurees,
    W: largeur,
    lh: lineHeight * fontSize,
    fontSize,
    padding,
    curve,
    align,
  });
  return lettres.map(({ c, x, y, angle }) => {
    const demi = mesurer(c) / 2;
    return { c, x: x - demi * Math.cos(angle), y: y - demi * Math.sin(angle), angle };
  });
};

/**
 * Les positions des lettres d'un `Konva.Text` (droit ou courbé), lues sur le
 * nœud lui-même : `textArr`, cadre, typographie, attribut `courbeTexte`.
 */
export const positionsDuNoeud = (node, mesurer) => {
  const commun = {
    lignes: node.textArr || [],
    largeur: node.getWidth(),
    hauteur: node.getHeight(),
    fontSize: node.fontSize(),
    lineHeight: node.lineHeight(),
    padding: node.padding?.() || 0,
    letterSpacing: node.letterSpacing?.() || 0,
    align: node.align(),
    verticalAlign: node.verticalAlign?.() || 'top',
    mesurer,
  };
  const curve = node.getAttr('courbeTexte');
  return curve ? positionsCourbes({ ...commun, curve }) : positionsDroites(commun);
};

/**
 * Commandes de chemin (repère local du nœud) des lettres posées, lues dans la
 * police opentype. `decalAlpha` : de la ligne « middle » à la ligne
 * alphabétique. `inclinaison` : tangente de l'italique fabriqué par le
 * navigateur (0 = droit). Un espace ne produit rien. Une lettre ABSENTE de la
 * police (glyphe 0, « € » d'Arvo) ne produit rien non plus : elle est rangée
 * dans `absentes`, et le navigateur l'a dessinée dans une police de repli —
 * à l'appelant de lui donner le contour ordinaire.
 *
 * @returns {{type:string,x?:number,y?:number,x1?:number,y1?:number,x2?:number,y2?:number}[]}
 */
export const commandesLettres = (police, positions, { fontSize, decalAlpha, inclinaison = 0, absentes = null }) => {
  const cmds = [];
  for (const pos of positions) {
    const { c, x, y, angle } = pos;
    if (!c.trim()) continue;
    const glyphe = police.charToGlyph(c);
    if (!glyphe || glyphe.index === 0) {
      absentes?.push(pos);
      continue;
    }
    // Glyphe à l'origine (0, 0) sur la ligne alphabétique.
    const chemin = glyphe.getPath(0, 0, fontSize);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pose = (px, py) => {
      // italique : on penche vers la droite ce qui est au-dessus de la ligne
      const lx = px - inclinaison * py;
      const ly = py + decalAlpha;
      return [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
    };
    for (const cmd of chemin.commands) {
      const o = { type: cmd.type };
      if ('x' in cmd) [o.x, o.y] = pose(cmd.x, cmd.y);
      if ('x1' in cmd) [o.x1, o.y1] = pose(cmd.x1, cmd.y1);
      if ('x2' in cmd) [o.x2, o.y2] = pose(cmd.x2, cmd.y2);
      cmds.push(o);
    }
  }
  return cmds;
};

/**
 * Les contours FERMÉS d'une suite de commandes, courbes aplaties en segments
 * d'environ `pas` : un contour par sous-chemin (l'extérieur d'une lettre, et
 * chacun de ses trous — « o », « A », « e »). Les contours de moins de trois
 * points sont écartés.
 * @returns {{x:number,y:number}[][]}
 */
export const contoursDesCommandes = (cmds, pas = 1) => {
  const contours = [];
  let courant = null;
  let dernier = null;
  const fermer = () => {
    if (courant && courant.length > 2) {
      const a = courant[0];
      const b = courant[courant.length - 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) courant.pop();
      if (courant.length > 2) contours.push(courant);
    }
    courant = null;
  };
  const decoupe = (l) => Math.max(2, Math.min(64, Math.ceil(l / Math.max(0.1, pas))));
  for (const c of cmds) {
    if (c.type === 'M') {
      fermer();
      courant = [{ x: c.x, y: c.y }];
    } else if (c.type === 'Z') {
      fermer();
    } else if (courant && dernier) {
      if (c.type === 'L') courant.push({ x: c.x, y: c.y });
      else if (c.type === 'Q') {
        const n = decoupe(Math.hypot(c.x1 - dernier.x, c.y1 - dernier.y) + Math.hypot(c.x - c.x1, c.y - c.y1));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          courant.push({
            x: u * u * dernier.x + 2 * u * t * c.x1 + t * t * c.x,
            y: u * u * dernier.y + 2 * u * t * c.y1 + t * t * c.y,
          });
        }
      } else if (c.type === 'C') {
        const l = Math.hypot(c.x1 - dernier.x, c.y1 - dernier.y) + Math.hypot(c.x2 - c.x1, c.y2 - c.y1) + Math.hypot(c.x - c.x2, c.y - c.y2);
        const n = decoupe(l);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          courant.push({
            x: u * u * u * dernier.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
            y: u * u * u * dernier.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
          });
        }
      }
    }
    if ('x' in c) dernier = { x: c.x, y: c.y };
  }
  fermer();
  return contours;
};

/** Trace des commandes dans un contexte 2D (Path2D ou CanvasRenderingContext2D). */
export const tracerCommandes = (ctx, cmds) => {
  for (const c of cmds) {
    if (c.type === 'M') ctx.moveTo(c.x, c.y);
    else if (c.type === 'L') ctx.lineTo(c.x, c.y);
    else if (c.type === 'Q') ctx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
    else if (c.type === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.type === 'Z') ctx.closePath();
  }
};

/**
 * Comparaison de deux masques (alpha > 127) de même taille, `k` pixels par
 * unité du document. Rend :
 *   iou       intersection / union
 *   ecartMoyen  pixels différents / périmètre du natif, en unités du document :
 *               l'épaisseur moyenne de la bande où les deux dessins diffèrent
 *   cadre     écarts des cadres englobants (gauche, haut, droite, bas)
 */
export const comparerMasques = (a, b, largeur, hauteur, k) => {
  let inter = 0;
  let union = 0;
  let diff = 0;
  let bord = 0;
  const cadreA = [Infinity, Infinity, -Infinity, -Infinity];
  const cadreB = [Infinity, Infinity, -Infinity, -Infinity];
  const plein = (m, i) => m[i * 4 + 3] > 127;
  const etendre = (cadre, x, y) => {
    cadre[0] = Math.min(cadre[0], x);
    cadre[1] = Math.min(cadre[1], y);
    cadre[2] = Math.max(cadre[2], x);
    cadre[3] = Math.max(cadre[3], y);
  };
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      const pa = plein(a, i);
      const pb = plein(b, i);
      if (pa && pb) inter++;
      if (pa || pb) union++;
      if (pa !== pb) diff++;
      if (pa) {
        etendre(cadreA, x, y);
        const voisinVide =
          x === 0 || y === 0 || x === largeur - 1 || y === hauteur - 1 ||
          !plein(a, i - 1) || !plein(a, i + 1) || !plein(a, i - largeur) || !plein(a, i + largeur);
        if (voisinVide) bord++;
      }
      if (pb) etendre(cadreB, x, y);
    }
  }
  const perimetre = bord / k; // en unités du document
  return {
    iou: union ? inter / union : 1,
    ecartMoyen: perimetre ? diff / k / k / perimetre : 0,
    cadre: cadreA.map((v, j) => (Number.isFinite(v) && Number.isFinite(cadreB[j]) ? (cadreB[j] - v) / k : null)),
    cadreNatif: cadreA.map((v) => v / k),
    cadreCalcule: cadreB.map((v) => v / k),
  };
};
