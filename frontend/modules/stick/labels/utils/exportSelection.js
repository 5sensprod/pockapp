// frontend/modules/stick/labels/utils/exportSelection.js
//
// EXPORTER LA SÉLECTION, seule, sur fond transparent, cadrée sur elle :
//
// - en SVG : ce que le canvas dessine en VECTEURS le reste. On ne réécrit pas
//   les éléments en SVG un par un : Konva dessine le clone, comme pour le PDF
//   (`exportPdf.js`, `renduPage.js`), mais sur un contexte 2D qui ÉCRIT du SVG
//   au lieu de pixels (`svgcanvas`). Le texte est rendu en CONTOURS, lus dans
//   le fichier de la police (`policesVectorielles.js`, opentype.js) : un
//   imprimeur ou un plotter n'a pas les polices Google du poste. Les photos
//   et les effets mis en cache sont des images, posées à 300 dpi.
// - en PNG 300 dpi, la résolution déclarée dans le fichier (bloc `pHYs`).
//
// Ce que le SVG ne sait pas dire — un motif de texture, une police
// introuvable, une lettre absente de la police, un masque impossible à
// relire — n'est jamais perdu : l'ÉLÉMENT concerné passe en image à 300 dpi
// (second passage, `cache`), et son nombre revient à l'appelant.
//
// L'unité du SVG est le pixel à 300 dpi (`viewBox`), sa taille est donnée en
// millimètres : le fichier s'ouvre à la bonne taille physique.

import Konva from 'konva';
import { Context as ContexteSvg } from 'svgcanvas';
import { recacherFiltres } from './effetsKonva';
import { retexturer } from './peintureTexture';
import { cadreDesCalques, dansLaPage, rendrePage } from './renduPage';
import { chargerPoliceVectorielle, policeVectoriellePrete, styleDePolice } from './policesVectorielles';
import { GRAS_FABRIQUE, PENTE_ITALIQUE } from './texteContourStylise';

export const DPI_EXPORT = 300;
/** Le store compte en points (1/72 de pouce). */
export const PIXELS_PAR_POINT = DPI_EXPORT / 72;
const MM_PAR_POINT = 25.4 / 72;
/** Côté maximal d'une image posée dans le SVG (≈ 68 cm à 300 dpi). */
const COTE_IMAGE_MAX = 8000;

const FUSIONS = new Set([
  'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
]);

/**
 * Taille, famille, gras et italique d'une chaîne `font` de canvas
 * (« italic bold 48px "Roboto", sans-serif »). Null si illisible.
 */
export const lirePolice = (font) => {
  const m = /(\d+(?:\.\d+)?)px\s+(.+)$/.exec(String(font || ''));
  if (!m) return null;
  const famille = m[2].split(',')[0].trim().replace(/^["']|["']$/g, '');
  const avant = String(font).slice(0, m.index);
  const { gras, italique } = styleDePolice(avant.replace(/\boblique\b/, 'italic'));
  return { taille: Number(m[1]), famille, gras: gras || /\b[6-9]00\b/.test(avant), italique };
};

// ── Les CHEMINS (Path2D) passés à `clip` : un Path2D ne se relit pas. Pendant
// le dessin, `Path2D` est remplacé par cette sous-classe, qui retient ce
// qu'on lui ajoute (`imageForme.js`, `cheminMasque` : un `d` SVG, `addPath`
// avec une matrice, `rect`).
const Path2DNatif = typeof Path2D !== 'undefined' ? Path2D : null;
const CheminRetenu = Path2DNatif
  ? class CheminRetenu extends Path2DNatif {
      constructor(source) {
        super(source);
        this.morceaux = typeof source === 'string' ? [{ d: source, m: new DOMMatrix() }] : source?.morceaux ? source.morceaux.map((x) => ({ ...x })) : [];
        if (source && typeof source !== 'string' && !source.morceaux) this.illisible = true;
      }
      addPath(chemin, m) {
        super.addPath(chemin, m);
        if (!chemin?.morceaux || chemin.illisible) this.illisible = true;
        const mat = m ? DOMMatrix.fromMatrix(m) : new DOMMatrix();
        for (const x of chemin?.morceaux ?? []) this.morceaux.push({ d: x.d, m: mat.multiply(x.m) });
      }
      _libre(cmd) {
        let dernier = this.morceaux[this.morceaux.length - 1];
        if (!dernier?.libre) this.morceaux.push((dernier = { d: '', m: new DOMMatrix(), libre: true }));
        dernier.d += ` ${cmd}`;
      }
      moveTo(x, y) { super.moveTo(x, y); this._libre(`M ${x} ${y}`); }
      lineTo(x, y) { super.lineTo(x, y); this._libre(`L ${x} ${y}`); }
      bezierCurveTo(a, b, c, d, x, y) { super.bezierCurveTo(a, b, c, d, x, y); this._libre(`C ${a} ${b} ${c} ${d} ${x} ${y}`); }
      quadraticCurveTo(a, b, x, y) { super.quadraticCurveTo(a, b, x, y); this._libre(`Q ${a} ${b} ${x} ${y}`); }
      closePath() { super.closePath(); this._libre('Z'); }
      rect(x, y, w, h) { super.rect(x, y, w, h); this._libre(`M ${x} ${y} h ${w} v ${h} h ${-w} Z`); }
      arc(...a) { super.arc(...a); this.illisible = true; }
      arcTo(...a) { super.arcTo(...a); this.illisible = true; }
      ellipse(...a) { super.ellipse(...a); this.illisible = true; }
      roundRect(...a) { super.roundRect(...a); this.illisible = true; }
    }
  : null;

const matriceSvg = ({ a, b, c, d, e, f }) => `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;

/** Le contexte 2D qui écrit du SVG, complété de ce que `svgcanvas` ne fait pas. */
class ContexteVectoriel extends ContexteSvg {
  constructor(options) {
    super(options);
    this.__fusion = 'source-over';
    this.__pileFusions = [];
    this.__filtres = new Map(); // ombre → id du filtre
    this.__forme = null; // le nœud Konva en cours de dessin
    this.aRasteriser = new Set();
  }

  // `svgcanvas` ne garde ni la fusion ni le filtre dans son état : on les garde ici
  get globalCompositeOperation() { return this.__fusion; }
  set globalCompositeOperation(v) {
    this.__fusion = String(v || 'source-over');
    if (this.__fusion !== 'source-over' && !FUSIONS.has(this.__fusion)) this.__inexprimable();
  }
  get filter() { return 'none'; }
  set filter(v) { if (v && v !== 'none') this.__inexprimable(); }

  save() { this.__pileFusions.push(this.__fusion); super.save(); }
  restore() { super.restore(); this.__fusion = this.__pileFusions.pop() ?? 'source-over'; }

  /** L'élément en cours ne se dit pas en SVG : il passera en image. */
  __inexprimable() { if (this.__forme) this.aRasteriser.add(this.__forme); }

  // Les dégradés de `svgcanvas` ignorent la transformation : les points des
  // chemins sont écrits en coordonnées du document, le dégradé doit l'être aussi.
  createLinearGradient(...a) { return this.__poser(super.createLinearGradient(...a)); }
  createRadialGradient(...a) { return this.__poser(super.createRadialGradient(...a)); }
  __poser(degrade) { degrade.__root.setAttribute('gradientTransform', matriceSvg(this.getTransform())); return degrade; }
  createPattern() { this.__inexprimable(); return null; }

  __applyStyleToCurrentElement(type) {
    // Un dégradé ou un motif NATIF (créé hors de ce contexte) ne se relit pas
    const v = type === 'fill' ? this.fillStyle : this.strokeStyle;
    if (v && typeof v === 'object' && !v.__root) this.__inexprimable();
    super.__applyStyleToCurrentElement(type);
    const el = this.__currentElement;
    if (!el || el.nodeName === 'g' || el.hasAttribute('transform')) return;
    this.__decorer(el);
  }

  /** Fusion et ombre portée d'un élément écrit en coordonnées du document. */
  __decorer(el) {
    if (FUSIONS.has(this.__fusion)) el.style.mixBlendMode = this.__fusion;
    const filtre = this.__ombre();
    if (filtre) el.setAttribute('filter', `url(#${filtre})`);
  }

  /** L'ombre en cours (déjà en pixels du document : Konva la met à l'échelle), en filtre SVG. */
  __ombre() {
    const flou = Number(this.shadowBlur) || 0;
    const dx = Number(this.shadowOffsetX) || 0;
    const dy = Number(this.shadowOffsetY) || 0;
    if (!flou && !dx && !dy) return null;
    const c = this.__ctx;
    c.fillStyle = '#000000';
    c.fillStyle = this.shadowColor || '#000000';
    const lu = String(c.fillStyle);
    const rgba = /rgba?\(([^)]+)\)/.exec(lu)?.[1].split(',').map((x) => Number(x.trim()));
    const couleur = rgba ? `rgb(${rgba[0]},${rgba[1]},${rgba[2]})` : lu;
    const opacite = rgba?.[3] ?? 1;
    if (!(opacite > 0)) return null;
    const cle = `${flou}|${dx}|${dy}|${couleur}|${opacite}`;
    if (!this.__filtres.has(cle)) {
      const id = `ombre-${this.__filtres.size + 1}`;
      const f = this.__createElement('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%', 'color-interpolation-filters': 'sRGB' });
      f.appendChild(this.__createElement('feDropShadow', { dx, dy, stdDeviation: flou / 2, 'flood-color': couleur, 'flood-opacity': opacite }));
      this.__defs.appendChild(f);
      this.__filtres.set(cle, id);
    }
    return this.__filtres.get(cle);
  }

  // ── Le texte, en contours ─────────────────────────────────────────────
  fillText(texte, x, y) { if (!this.__texteEnContours(texte, x, y, 'fill')) this.__inexprimable(); }
  strokeText(texte, x, y) { if (!this.__texteEnContours(texte, x, y, 'stroke')) this.__inexprimable(); }

  __texteEnContours(texte, x, y, action) {
    const p = lirePolice(this.font);
    const chargee = p && policeVectoriellePrete(p.famille, p.gras, p.italique);
    if (!chargee) return false;
    const { police } = chargee;
    const s = String(texte);
    // Une lettre absente du fichier : le navigateur l'a prise dans une police de repli
    if (Array.from(s).some((c) => c.trim() && !(police.charToGlyph(c)?.index > 0))) return false;
    // De la ligne de base du canvas (« middle » pour Konva) à la ligne alphabétique
    const m = this.__ctx;
    m.font = this.font;
    m.textBaseline = this.textBaseline;
    const haut = m.measureText(s).fontBoundingBoxAscent;
    m.textBaseline = 'alphabetic';
    const mesure = m.measureText(s);
    if (!Number.isFinite(haut) || !Number.isFinite(mesure.fontBoundingBoxAscent)) return false;
    const ligne = y - haut + mesure.fontBoundingBoxAscent;
    const align = this.textAlign;
    let x0 = x;
    if (align === 'center') x0 -= mesure.width / 2;
    else if (align === 'right' || align === 'end') x0 -= mesure.width;
    const pente = p.italique && !chargee.italique ? PENTE_ITALIQUE : 0;
    const pose = (px, py) => [px - pente * (py - ligne), py];
    this.beginPath();
    for (const c of police.getPath(s, x0, ligne, p.taille).commands) {
      if (c.type === 'M') this.moveTo(...pose(c.x, c.y));
      else if (c.type === 'L') this.lineTo(...pose(c.x, c.y));
      else if (c.type === 'Q') this.quadraticCurveTo(...pose(c.x1, c.y1), ...pose(c.x, c.y));
      else if (c.type === 'C') this.bezierCurveTo(...pose(c.x1, c.y1), ...pose(c.x2, c.y2), ...pose(c.x, c.y));
      else if (c.type === 'Z') this.closePath();
    }
    if (action === 'stroke') {
      this.stroke();
      return true;
    }
    this.fill();
    // Le gras fabriqué par le navigateur, quand la famille n'a pas de fichier gras
    if (p.gras && chargee.graisse < 700) {
      const avant = [this.strokeStyle, this.lineWidth, this.lineJoin];
      this.strokeStyle = this.fillStyle;
      this.lineWidth = p.taille * GRAS_FABRIQUE;
      this.lineJoin = 'round';
      this.stroke();
      [this.strokeStyle, this.lineWidth, this.lineJoin] = avant;
    }
    return true;
  }

  // ── Les images, posées à 300 dpi et TOUJOURS incluses (jamais une adresse) ─
  drawImage(image, ...r) {
    const sw0 = image?.naturalWidth || image?.videoWidth || image?.width || 0;
    const sh0 = image?.naturalHeight || image?.videoHeight || image?.height || 0;
    let [sx, sy, sw, sh, dx, dy, dw, dh] = [0, 0, sw0, sh0, 0, 0, sw0, sh0];
    if (r.length === 2) [dx, dy] = r;
    else if (r.length === 4) [dx, dy, dw, dh] = r;
    else if (r.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = r;
    else return;
    if (!(sw > 0 && sh > 0 && dw && dh)) return;
    const t = this.getTransform();
    const k = Math.min(1, COTE_IMAGE_MAX / Math.max(Math.abs(dw) * Math.hypot(t.a, t.b), Math.abs(dh) * Math.hypot(t.c, t.d), 1));
    const pw = Math.max(1, Math.round(Math.abs(dw) * Math.hypot(t.a, t.b) * k));
    const ph = Math.max(1, Math.round(Math.abs(dh) * Math.hypot(t.c, t.d) * k));
    let cv = image;
    if (!(image instanceof HTMLCanvasElement) || sx || sy || sw !== image.width || sh !== image.height || pw !== image.width || ph !== image.height) {
      cv = document.createElement('canvas');
      cv.width = pw;
      cv.height = ph;
      const c = cv.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(image, sx, sy, sw, sh, 0, 0, pw, ph);
    }
    const parent = this.__closestGroupOrSvg();
    super.drawImage(cv, 0, 0, cv.width, cv.height, dx, dy, dw, dh);
    const el = parent.lastChild;
    if (el?.nodeName !== 'image') return;
    const alpha = Number(this.globalAlpha);
    if (alpha < 1) el.setAttribute('opacity', alpha);
    // L'image porte sa transformation : fusion et ombre vont sur un groupe autour
    const filtre = this.__ombre();
    if (filtre || FUSIONS.has(this.__fusion)) {
      const g = this.__createElement('g');
      parent.replaceChild(g, el);
      g.appendChild(el);
      this.__decorer(g);
    }
  }

  // ── Les découpes ───────────────────────────────────────────────────────
  clip(chemin, regle) {
    if (!chemin || typeof chemin === 'string') return super.clip();
    if (!chemin.morceaux || chemin.illisible) {
      this.__inexprimable();
      return;
    }
    const groupe = this.__closestGroupOrSvg();
    const id = `decoupe-${this.__defs.childNodes.length + 1}`;
    const clipPath = this.__createElement('clipPath', { id });
    const t = this.getTransform();
    for (const { d, m } of chemin.morceaux) {
      if (!d.trim()) continue;
      const el = this.__createElement('path', { d, transform: matriceSvg(t.multiply(m)) });
      if (regle === 'evenodd') el.setAttribute('clip-rule', 'evenodd');
      clipPath.appendChild(el);
    }
    this.__defs.appendChild(clipPath);
    groupe.setAttribute('clip-path', `url(#${id})`);
    const suite = this.__createElement('g');
    groupe.appendChild(suite);
    this.__currentElement = suite;
  }
}

/** Les familles et styles des textes des calques `ids`, chargés avant le dessin (lecture synchrone ensuite). */
const chargerPolices = async (clone, ids) => {
  const textes = [];
  for (const id of ids) {
    const n = clone.findOne(`#${id}`);
    if (!n) continue;
    for (const t of [n, ...(n.find?.(() => true) ?? [])]) {
      if (t instanceof Konva.Text || t instanceof Konva.TextPath) textes.push(t);
    }
  }
  const voulues = new Map();
  for (const t of textes) {
    const p = lirePolice(`${t.fontStyle?.() ?? ''} ${t.fontSize()}px ${t.fontFamily()}`);
    if (p) voulues.set(`${p.famille}|${p.gras}|${p.italique}`, p);
  }
  await Promise.allSettled([...voulues.values()].map((p) => chargerPoliceVectorielle(p.famille, p.gras, p.italique)));
};

/** Les dégradés de remplissage de Konva naissent sur un canvas natif : on les fait naître en SVG. */
const degradesEnSvg = (formes, courant) => {
  for (const s of formes) {
    s._getLinearGradient = () => {
      const stops = s.fillLinearGradientColorStops();
      if (!stops) return undefined;
      const a = s.fillLinearGradientStartPoint();
      const b = s.fillLinearGradientEndPoint();
      const g = courant.ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      for (let n = 0; n < stops.length; n += 2) g.addColorStop(stops[n], stops[n + 1]);
      return g;
    };
    s._getRadialGradient = () => {
      const stops = s.fillRadialGradientColorStops();
      if (!stops) return undefined;
      const a = s.fillRadialGradientStartPoint();
      const b = s.fillRadialGradientEndPoint();
      const g = courant.ctx.createRadialGradient(a.x, a.y, s.fillRadialGradientStartRadius(), b.x, b.y, s.fillRadialGradientEndRadius());
      for (let n = 0; n < stops.length; n += 2) g.addColorStop(stops[n], stops[n + 1]);
      return g;
    };
  }
};

/**
 * La sélection en SVG. `ids` : les calques sélectionnés ; `toutesIds` : tous
 * ceux de la page (les autres sont cachés sur le clone).
 * @returns {Promise<{ blob: Blob, enImage: number }>} `enImage` : les éléments
 *   qu'il a fallu poser en image.
 */
export async function selectionEnSvg(docNode, { width, height, ids, toutesIds }) {
  if (!docNode || !(width > 0) || !(height > 0)) throw new Error("La page n'est pas disponible.");
  if (!ids?.length) throw new Error('Rien n’est sélectionné.');
  const k = PIXELS_PAR_POINT;
  const clone = docNode.clone({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  const gardes = new Set(ids.map(String));
  for (const id of toutesIds) if (!gardes.has(String(id))) clone.findOne(`#${id}`)?.hide();

  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width, height });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    layer.add(clone);
    const zone = dansLaPage(cadreDesCalques(clone, layer, ids), width, height, 1);
    if (!zone) throw new Error("La sélection n'a rien de visible sur la page.");
    await chargerPolices(clone, ids);
    retexturer(clone, k);
    recacherFiltres(clone, k);

    const formes = clone.find((n) => n instanceof Konva.Shape);
    const courant = { ctx: null };
    for (const s of formes) {
      // Le dessin « parfait » passe par un canvas tampon de la taille de la page
      s.perfectDrawEnabled(false);
      const dessiner = s.drawScene;
      s.drawScene = function (...args) {
        const avant = courant.ctx.__forme;
        courant.ctx.__forme = s;
        try {
          return dessiner.apply(this, args);
        } finally {
          courant.ctx.__forme = avant;
        }
      };
    }
    degradesEnSvg(formes, courant);

    // Premier passage tout en vecteurs ; ce qui ne s'y dit pas passe en image, et on recommence.
    // `SceneCanvas` n'est pas exporté par Konva : celui du calque en donne la classe.
    const SceneCanvas = layer.getCanvas().constructor;
    const enImage = new Set();
    for (let passage = 0; passage < 3; passage++) {
      const ctx = new ContexteVectoriel({ width: zone.width * k, height: zone.height * k });
      courant.ctx = ctx;
      const toile = new SceneCanvas({ width: 1, height: 1, pixelRatio: k });
      toile.getContext()._context = ctx;
      ctx.scale(k, k);
      ctx.translate(-zone.x, -zone.y);
      const Path2DAvant = globalThis.Path2D;
      if (CheminRetenu) globalThis.Path2D = CheminRetenu;
      try {
        clone.drawScene(toile);
      } finally {
        globalThis.Path2D = Path2DAvant;
      }
      const neufs = [...ctx.aRasteriser].filter((n) => !enImage.has(n));
      if (!neufs.length || passage === 2) {
        const svg = ctx.getSvg();
        svg.setAttribute('width', `${(zone.width * MM_PAR_POINT).toFixed(3)}mm`);
        svg.setAttribute('height', `${(zone.height * MM_PAR_POINT).toFixed(3)}mm`);
        svg.setAttribute('viewBox', `0 0 ${zone.width * k} ${zone.height * k}`);
        const texte = `<?xml version="1.0" encoding="UTF-8"?>\n${ctx.getSerializedSvg(true)}`;
        return { blob: new Blob([texte], { type: 'image/svg+xml' }), enImage: enImage.size };
      }
      for (const n of neufs) {
        enImage.add(n);
        n.cache({ pixelRatio: k });
      }
    }
    throw new Error('Export SVG impossible.'); // jamais atteint : le dernier passage rend
  } finally {
    stage.destroy();
    container.remove();
  }
}

/** La sélection en PNG transparent, 300 dpi déclarés dans le fichier. */
export async function selectionEnPng(docNode, { width, height, ids, toutesIds }) {
  if (!ids?.length) throw new Error('Rien n’est sélectionné.');
  const gardes = new Set(ids.map(String));
  const blob = await rendrePage(docNode, {
    width,
    height,
    pixelRatio: PIXELS_PAR_POINT,
    masques: toutesIds.map(String).filter((id) => !gardes.has(id)),
    fond: null,
    cadrer: ids,
  });
  return pngAvecDpi(blob, DPI_EXPORT);
}

// ── La résolution DANS le PNG : un bloc `pHYs` juste après `IHDR` ─────────
let tableCrc = null;
const crc32 = (octets) => {
  if (!tableCrc) {
    tableCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tableCrc[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const o of octets) c = tableCrc[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Les octets d'un PNG, avec `dpi` déclarés (un `pHYs` existant est remplacé). */
export const octetsPngAvecDpi = (octets, dpi) => {
  const lire = (i) => ((octets[i] << 24) | (octets[i + 1] << 16) | (octets[i + 2] << 8) | octets[i + 3]) >>> 0;
  const type = (i) => String.fromCharCode(...octets.subarray(i + 4, i + 8));
  if (octets.length < 33 || type(8) !== 'IHDR') return octets;
  const morceaux = [octets.subarray(0, 33)];
  const ppm = Math.round(dpi / 0.0254);
  const bloc = new Uint8Array(21);
  const vue = new DataView(bloc.buffer);
  vue.setUint32(0, 9);
  bloc.set([0x70, 0x48, 0x59, 0x73], 4); // « pHYs »
  vue.setUint32(8, ppm);
  vue.setUint32(12, ppm);
  bloc[16] = 1; // au mètre
  vue.setUint32(17, crc32(bloc.subarray(4, 17)));
  morceaux.push(bloc);
  for (let i = 33; i + 12 <= octets.length; ) {
    const fin = i + 12 + lire(i);
    if (type(i) !== 'pHYs') morceaux.push(octets.subarray(i, fin));
    i = fin;
  }
  const sortie = new Uint8Array(morceaux.reduce((t, m) => t + m.length, 0));
  let o = 0;
  for (const m of morceaux) {
    sortie.set(m, o);
    o += m.length;
  }
  return sortie;
};

export const pngAvecDpi = async (blob, dpi) =>
  new Blob([octetsPngAvecDpi(new Uint8Array(await blob.arrayBuffer()), dpi)], { type: 'image/png' });

/** Écrit le fichier sur le disque du poste (téléchargement du navigateur). */
export const enregistrerFichier = (blob, nom) => {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
