// frontend/modules/stick/labels/utils/ficheKonva.js
//
// LE DESSIN d'un élément « Fiche » (tableau, puces ou paragraphe), en nœuds
// Konva, dans le repère de l'élément (coin haut gauche = 0,0). Une SEULE
// fonction pour le canvas (`canvas/FicheNode.jsx`) et l'export en planche
// (`exportPdfSheet.js`) : deux dessins, ce serait deux résultats.
//
// Coupe à `maxLines` : lignes du tableau, puces, ou lignes du paragraphe
// (points de suspension). La hauteur suit le contenu.

import Konva from 'konva';

export const FICHE_PAR_DEFAUT = {
  section: 'specs',
  width: 360,
  fontSize: 14,
  fontFamily: 'Arial',
  title: 'Caractéristiques techniques',
  titleColor: '#111827',
  labelColor: '#111827',
  color: '#374151',
  stripe: true,
  stripeColor: '#f3f4f6',
  lineColor: '#e5e7eb',
  maxLines: 8,
  colRatio: 0.42,
  // Style du tableau
  frame: 'none', // 'none' | 'outer' (cadre) | 'grid' (cadre + toutes les lignes)
  borderColor: '#9ca3af',
  borderWidth: 1,
  radius: 0,
  labelBg: '', // fond de la colonne des noms ('' : aucun)
  highlightRow: 0, // n° de la ligne surlignée (1 = première, 0 = aucune)
  highlightColor: '#fef3c7',
  highlightBold: true,
};

const val = (el, cle) => el?.[cle] ?? FICHE_PAR_DEFAUT[cle];

/**
 * @returns {{ nodes: Konva.Node[], height: number }}
 */
export function construireFiche(el, contenu) {
  const W = Math.max(40, val(el, 'width'));
  const fs = Math.max(4, val(el, 'fontSize'));
  const police = val(el, 'fontFamily');
  const max = Math.max(1, Math.round(val(el, 'maxLines')));
  const pad = Math.round(fs * 0.4);
  const nodes = [];
  let y = 0;

  const texte = (attrs) =>
    new Konva.Text({ fontFamily: police, fontSize: fs, lineHeight: 1.25, wrap: 'word', listening: false, ...attrs });

  const titre = (el?.title ?? FICHE_PAR_DEFAUT.title ?? '').trim();
  if (titre) {
    const t = texte({
      x: 0,
      y,
      width: W,
      text: titre,
      fontSize: Math.round(fs * 1.3),
      fontStyle: 'bold',
      fill: val(el, 'titleColor'),
    });
    nodes.push(t);
    y += t.height() + pad * 1.5;
  }

  if (contenu?.kind === 'rows') {
    const c1 = Math.round(W * Math.min(0.8, Math.max(0.15, val(el, 'colRatio'))));
    const cadre = val(el, 'frame');
    const bw = Math.max(0, Number(val(el, 'borderWidth')) || 0);
    const couleurBord = val(el, 'borderColor');
    const rayon = Math.max(0, Number(val(el, 'radius')) || 0);
    const surlignee = Math.round(Number(val(el, 'highlightRow')) || 0);
    const fondNoms = val(el, 'labelBg');
    const haut = y;
    // Le corps du tableau dans son propre groupe : un cadre arrondi le rogne,
    // sinon les fonds de ligne dépasseraient des coins.
    const corps = new Konva.Group({ listening: false });
    const traits = [];

    contenu.rows.slice(0, max).forEach(([nom, valeur], i) => {
      const ligne = i + 1;
      const enAvant = surlignee === ligne;
      const gras = enAvant && val(el, 'highlightBold');
      const a = texte({ x: pad, y: y + pad, width: c1 - pad * 2, text: nom, fontStyle: 'bold', fill: val(el, 'labelColor') });
      const b = texte({
        x: c1 + pad,
        y: y + pad,
        width: W - c1 - pad * 2,
        text: valeur,
        fontStyle: gras ? 'bold' : 'normal',
        fill: val(el, 'color'),
      });
      const h = Math.max(a.height(), b.height()) + pad * 2;
      if (enAvant) {
        corps.add(new Konva.Rect({ x: 0, y, width: W, height: h, fill: val(el, 'highlightColor') }));
      } else if (val(el, 'stripe') && i % 2 === 0) {
        corps.add(new Konva.Rect({ x: 0, y, width: W, height: h, fill: val(el, 'stripeColor') }));
      }
      if (fondNoms && !enAvant) corps.add(new Konva.Rect({ x: 0, y, width: c1, height: h, fill: fondNoms }));
      corps.add(a, b);
      y += h;
      // Séparateur sous la ligne, sauf la dernière quand un cadre la ferme
      const derniere = i === Math.min(max, contenu.rows.length) - 1;
      if (cadre === 'grid' ? !derniere : cadre === 'none') {
        traits.push(
          new Konva.Line({
            points: [0, y, W, y],
            stroke: cadre === 'grid' ? couleurBord : val(el, 'lineColor'),
            strokeWidth: cadre === 'grid' ? bw || 1 : 1,
          })
        );
      }
    });

    const hauteurCorps = y - haut;
    if (cadre === 'grid' && bw > 0) {
      traits.push(new Konva.Line({ points: [c1, haut, c1, y], stroke: couleurBord, strokeWidth: bw }));
    }
    traits.forEach((t) => corps.add(t));
    if (rayon > 0 && cadre !== 'none') {
      corps.clipFunc((ctx) => {
        ctx.beginPath();
        ctx.roundRect(0, haut, W, hauteurCorps, rayon);
        ctx.closePath();
      });
    }
    nodes.push(corps);
    if (cadre !== 'none' && bw > 0) {
      // Trait posé SUR le bord, moitié dedans : il reste dans la largeur W
      nodes.push(
        new Konva.Rect({
          x: bw / 2,
          y: haut + bw / 2,
          width: W - bw,
          height: hauteurCorps - bw,
          cornerRadius: rayon,
          stroke: couleurBord,
          strokeWidth: bw,
          listening: false,
        })
      );
    }
  } else if (contenu?.kind === 'bullets') {
    contenu.items.slice(0, max).forEach((item) => {
      const puce = texte({ x: 0, y, text: '•', fill: val(el, 'labelColor'), fontStyle: 'bold' });
      const t = texte({ x: fs, y, width: W - fs, text: item, fill: val(el, 'color') });
      nodes.push(puce, t);
      y += t.height() + pad;
    });
  } else if (contenu?.kind === 'paragraph') {
    const t = texte({
      x: 0,
      y,
      width: W,
      // Konva coupe au cadre : `max` lignes, puis « … »
      height: fs * 1.25 * max,
      ellipsis: true,
      text: contenu.text,
      fill: val(el, 'color'),
    });
    // Hauteur RÉELLE : un texte court ne réserve pas `max` lignes
    const lignes = Math.min(max, t.textArr?.length || 1);
    t.height(fs * 1.25 * lignes);
    nodes.push(t);
    y += t.height();
  }

  const height = Math.max(fs, Math.ceil(y));
  // Zone cliquable pleine : sans elle, seuls les caractères se saisissent
  nodes.unshift(new Konva.Rect({ x: 0, y: 0, width: W, height, fill: 'rgba(255,255,255,0)', name: 'fiche-zone' }));
  return { nodes, height };
}
