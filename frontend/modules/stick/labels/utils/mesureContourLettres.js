// frontend/modules/stick/labels/utils/mesureContourLettres.js
//
// OUTIL DE MESURE, développement seulement (lot 3, prototype). Rien n'est
// branché dans l'éditeur : dans la console de /stick, lancer
//
//     await __mesureContourLettres()
//
// Pour chaque texte de la page affichée, le dessin natif de Konva et le
// dessin tiré de la police (opentype.js, `utils/contourLettres.js`) sont
// rastérisés dans le repère du nœud, 4 pixels par unité, puis comparés :
// IoU, écart moyen des bords (unités du document), écart des cadres. Un
// panneau montre chaque superposition : natif en gris, contour calculé en rouge.
//
// Italique : seules les graisses 400 et 700 sont chargées, le navigateur
// FABRIQUE l'italique en penchant les lettres. L'angle n'est pas publié :
// on essaie plusieurs inclinaisons et on garde la meilleure. Même chose pour
// un gras fabriqué (famille sans 700) : épaississement essayé à plusieurs
// valeurs.

import Konva from 'konva';
import { chargerPoliceVectorielle } from './policesVectorielles';
import { commandesLettres, comparerMasques, positionsCourbes, positionsDroites, tracerCommandes } from './contourLettres';

const K = 4; // pixels par unité du document
const INCLINAISONS = [0, 0.2, 0.25, 0.3, 0.364];

const contexteMesure = (() => {
  let ctx = null;
  return () => (ctx ??= document.createElement('canvas').getContext('2d'));
})();

const cheminsDuNoeud = (node, police, inclinaison) => {
  const ctx = contexteMesure();
  ctx.font = node._getContextFont();
  const mesurer = (t) => ctx.measureText(t).width;
  ctx.textBaseline = 'middle';
  const ascMilieu = ctx.measureText('H').actualBoundingBoxAscent;
  ctx.textBaseline = 'alphabetic';
  const ascAlpha = ctx.measureText('H').actualBoundingBoxAscent;
  const decalAlpha = ascAlpha - ascMilieu;

  const commun = {
    lignes: node.textArr || [],
    largeur: node.getWidth(),
    hauteur: node.getHeight(),
    fontSize: node.fontSize(),
    lineHeight: node.lineHeight(),
    padding: node.padding(),
    letterSpacing: node.letterSpacing(),
    align: node.align(),
    verticalAlign: node.verticalAlign(),
    mesurer,
  };
  const curve = node.getAttr('courbeTexte');
  const positions = curve ? positionsCourbes({ ...commun, curve }) : positionsDroites(commun);
  return commandesLettres(police, positions, { fontSize: node.fontSize(), decalAlpha, inclinaison });
};

// Le dessin natif, seul (ni contour, ni ombre, ni dégradé, ni effets).
const rasterNatif = (node, cadre) => {
  const clone = node.clone({
    x: cadre.m - cadre.x,
    y: cadre.m - cadre.y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    fill: '#000000',
    fillPriority: 'color',
    fillLinearGradientColorStops: null,
    fillRadialGradientColorStops: null,
    fillPatternImage: null,
    strokeEnabled: false,
    shadowEnabled: false,
    textDecoration: '',
    filters: [],
  });
  clone.clearCache();
  const stage = new Konva.Stage({ container: document.createElement('div'), width: cadre.w, height: cadre.h });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(clone);
  layer.draw();
  const canvas = stage.toCanvas({ pixelRatio: K });
  stage.destroy();
  return canvas;
};

// Même taille EXACTE que le raster natif : Konva arrondit à sa façon, et un
// pixel d'écart en largeur décale la comparaison d'un pixel par ligne.
const rasterCalcule = (cmds, cadre, epaississement, taille) => {
  const canvas = document.createElement('canvas');
  canvas.width = taille.width;
  canvas.height = taille.height;
  const ctx = canvas.getContext('2d');
  ctx.scale(K, K);
  ctx.translate(cadre.m - cadre.x, cadre.m - cadre.y);
  const p = new Path2D();
  tracerCommandes(p, cmds);
  ctx.fillStyle = '#000';
  ctx.fill(p);
  if (epaississement > 0) {
    ctx.lineWidth = epaississement;
    ctx.lineJoin = 'round';
    ctx.stroke(p);
  }
  return { canvas, p };
};

const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

const superposition = (natif, p, cadre) => {
  const c = document.createElement('canvas');
  c.width = natif.width;
  c.height = natif.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 0.35;
  ctx.drawImage(natif, 0, 0);
  ctx.globalAlpha = 1;
  ctx.scale(K, K);
  ctx.translate(cadre.m - cadre.x, cadre.m - cadre.y);
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 1 / K;
  ctx.stroke(p);
  return c.toDataURL('image/png');
};

const mesurerNoeud = async (node) => {
  const famille = node.fontFamily();
  const style = node.fontStyle() || '';
  const gras = style.includes('bold');
  const italique = style.includes('italic');
  const { police, graisse, source } = await chargerPoliceVectorielle(famille, gras);
  const fauxGras = gras && graisse < 700;

  const r = node.getSelfRect();
  const m = node.fontSize() / 2;
  const cadre = { x: r.x, y: r.y, m, w: r.width + 2 * m, h: r.height + 2 * m };
  const natif = rasterNatif(node, cadre);
  const a = pixels(natif);

  const inclinaisons = italique ? INCLINAISONS : [0];
  const epaississements = fauxGras ? [0, node.fontSize() / 30, node.fontSize() / 24, node.fontSize() / 16] : [0];
  let meilleur = null;
  for (const inclinaison of inclinaisons) {
    const cmds = cheminsDuNoeud(node, police, inclinaison);
    for (const ep of epaississements) {
      const { canvas, p } = rasterCalcule(cmds, cadre, ep, natif);
      const res = comparerMasques(a, pixels(canvas), natif.width, natif.height, K);
      if (!meilleur || res.iou > meilleur.res.iou) meilleur = { res, inclinaison, ep, p };
    }
  }

  const { res, inclinaison, ep, p } = meilleur;
  const arrondi = (v, n = 2) => (v == null ? null : Math.round(v * 10 ** n) / 10 ** n);
  return {
    ligne: {
      texte: node.text().slice(0, 30).replace(/\n/g, '⏎'),
      police: `${famille} ${style}`.trim(),
      servie: `${graisse} (${source})`,
      taille: node.fontSize(),
      courbe: node.getAttr('courbeTexte') || 0,
      interlettrage: node.letterSpacing(),
      align: node.align(),
      iou: arrondi(res.iou, 4),
      'écart moyen (px doc)': arrondi(res.ecartMoyen, 3),
      'écart cadre max (px doc)': arrondi(Math.max(...res.cadre.map((v) => Math.abs(v ?? 0)))),
      inclinaison: italique ? inclinaison : '—',
      'faux gras': fauxGras ? arrondi(ep) : '—',
      cadreNatif: res.cadreNatif.map((v) => arrondi(v)).join(' '),
      cadreCalcule: res.cadreCalcule.map((v) => arrondi(v)).join(' '),
    },
    image: superposition(natif, p, cadre),
  };
};

const panneau = (resultats) => {
  document.getElementById('mesure-contour-lettres')?.remove();
  const div = document.createElement('div');
  div.id = 'mesure-contour-lettres';
  Object.assign(div.style, {
    position: 'fixed', inset: '5% 5%', zIndex: 99999, background: '#fff', color: '#111',
    overflow: 'auto', padding: '12px', border: '1px solid #999', boxShadow: '0 8px 30px rgba(0,0,0,.3)',
    font: '12px sans-serif',
  });
  const fermer = document.createElement('button');
  fermer.textContent = 'Fermer';
  fermer.onclick = () => div.remove();
  div.appendChild(fermer);
  for (const { ligne, image, erreur } of resultats) {
    const bloc = document.createElement('div');
    bloc.style.margin = '12px 0';
    const t = document.createElement('div');
    t.textContent = erreur ? `${ligne.texte} — ${erreur}` : JSON.stringify(ligne);
    bloc.appendChild(t);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.style.maxWidth = '100%';
      img.style.border = '1px solid #ddd';
      bloc.appendChild(img);
    }
    div.appendChild(bloc);
  }
  document.body.appendChild(div);
};

/** Mesure tous les textes de la scène de l'éditeur ; rend le tableau. */
export const mesureContourLettres = async () => {
  const stage = Konva.stages.find((s) => s.container()?.isConnected && s.find('Text').some((t) => t.id()));
  if (!stage) throw new Error('Aucun éditeur ouvert.');
  const noeuds = stage.find('Text').filter((t) => t.id() && t.isVisible() && t.text());
  const resultats = [];
  for (const node of noeuds) {
    try {
      resultats.push(await mesurerNoeud(node));
    } catch (e) {
      resultats.push({ ligne: { texte: node.text().slice(0, 30) }, erreur: String(e?.message || e) });
    }
  }
  console.table(resultats.map((r) => ({ ...r.ligne, ...(r.erreur ? { erreur: r.erreur } : {}) })));
  panneau(resultats);
  return resultats.map((r) => r.ligne);
};

if (typeof window !== 'undefined') window.__mesureContourLettres = mesureContourLettres;
