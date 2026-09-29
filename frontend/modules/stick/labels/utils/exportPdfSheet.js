// AppTools/src/features/labels/utils/exportPdfSheet.js
import jsPDF from 'jspdf';
import Konva from 'konva';
import { appliquerEffets } from './effetsKonva';
import { dessinerQR } from './qrImage';
import useLabelStore from '../store/useLabelStore';
import {
  resolvePropForElement,
  getProductField,
  resolveTemplate,
  formatPriceEUR,
} from '../utils/dataBinding';
import { remplissage } from './fillStyle';
import { konvaCrop } from './crop';
import { dessinerCodeBarres } from './barcodeCanvas';
import { construireFiche } from './ficheKonva';
import { contenuFiche } from './ficheProduit';
import { dessinForme } from '../components/canvas/ShapeNode';
import { pagination } from '../lib/tirage';

/**
 * Utilitaires purs (réutilisables/testables)
 */
const computeCellDimensions = ({ sheetWidth, sheetHeight, rows, cols, margin, spacing }) => {
  const cellWidth = Math.floor((sheetWidth - 2 * margin - (cols - 1) * spacing) / cols);
  const cellHeight = Math.floor((sheetHeight - 2 * margin - (rows - 1) * spacing) / rows);
  return { cellWidth: Math.max(0, cellWidth), cellHeight: Math.max(0, cellHeight) };
};

const computeScale = ({ cellWidth, cellHeight, docWidth, docHeight }) => {
  const scaleX = cellWidth / docWidth;
  const scaleY = cellHeight / docHeight;
  return Math.min(scaleX, scaleY, 1);
};

const computeOffsets = ({ cellWidth, cellHeight, finalDocWidth, finalDocHeight }) => ({
  offsetX: (cellWidth - finalDocWidth) / 2,
  offsetY: (cellHeight - finalDocHeight) / 2,
});

/**
 * Mini helper pour charger un dataURL en Image HTML (pour Konva.Image)
 */
function loadImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataURL;
  });
}

/**
 * Helper pour charger une image depuis une URL/SRC
 */
function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      console.error('❌ Erreur chargement image:', url, err);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Remplace les valeurs des éléments liés à un produit (non destructif)
 * ⚠️ Aligné avec la logique du canvas (dataBinding + templates)
 * - Images: support 'product_image_src'/'product_image', 'image.src', 'product_gallery_N'
 * - Text: prix formaté "€" (comme à l'écran)
 */
function updateElementsWithProduct(elements, product, fillQrWhenNoBinding = false) {
  if (!product) return elements;

  // Seule l'URL web : un repli sur le code-barres ou la référence encodait
  // un nombre que personne ne peut ouvrir (voir `QRCodeTemplates.jsx`).
  const fallbackQR = () => product.website_url || '';

  const gallerySrcAt = (idx) => {
    const gi = Array.isArray(product?.gallery_images) ? product.gallery_images[idx] : undefined;
    return (typeof gi === 'string' ? gi : gi?.src) || '';
  };

  return (elements || []).map((el) => {
    if (el?.visible === false) return el;

    // 📝 TEXT — binding + templates, avec prix formaté (comme le canvas)
    if (el?.type === 'text') {
      // La MÊME résolution que le canvas : prix formatés, description sans
      // HTML, et correction manuelle du texte lié pour ce produit.
      const nextText = String(resolvePropForElement(el.text ?? '', el, product) ?? '');
      return { ...el, text: nextText };
    }

    // 📋 FICHE — la section du produit de CETTE cellule (null : rien d'imprimé)
    if (el?.type === 'fiche') {
      return { ...el, ficheContenu: contenuFiche(product.description, el.section) };
    }

    // 🔲 QRCODE — binding brut (pas de €), sinon templating, sinon fallback
    if (el?.type === 'qrcode') {
      let nextQr =
        el.dataBinding != null
          ? String(getProductField(product, el.dataBinding) ?? '')
          : resolveTemplate(el.qrValue ?? '', product, { type: 'qrcode' });
      if (!nextQr && fillQrWhenNoBinding) nextQr = fallbackQR();
      return { ...el, qrValue: nextQr };
    }

    // 📊 BARCODE — binding brut (pas de €), sinon templating
    if (el?.type === 'barcode') {
      const nextBc =
        el.dataBinding != null
          ? String(getProductField(product, el.dataBinding) ?? '')
          : resolveTemplate(el.barcodeValue ?? '', product, { type: 'barcode' });
      return { ...el, barcodeValue: nextBc };
    }

    // 🖼️ IMAGE — support dataBinding & templates (SRC prioritaire)
    if (el?.type === 'image') {
      let nextSrc = '';

      if (el.dataBinding) {
        // aliases standards
        if (el.dataBinding === 'product_image' || el.dataBinding === 'product_image_src') {
          nextSrc = String(getProductField(product, 'product_image_src') ?? '');
        } else if (el.dataBinding === 'image.src' || el.dataBinding === 'image_src') {
          nextSrc = String(getProductField(product, 'image.src') ?? '');
        } else if (el.dataBinding.startsWith?.('product_gallery_')) {
          const idx = Number.parseInt(el.dataBinding.split('_')[2], 10);
          nextSrc = gallerySrcAt(Number.isFinite(idx) ? idx : 0);
        } else {
          // binding libre (ex. 'image.somewhere.src')
          nextSrc = String(getProductField(product, el.dataBinding) ?? '');
        }
      } else {
        // templating dans el.src (ex. "{{image.src}}")
        nextSrc = String(resolveTemplate(el.src ?? '', product, { type: 'image' }) ?? '');
      }

      return nextSrc && nextSrc !== el.src ? { ...el, src: nextSrc } : el;
    }

    return el;
  });
}

/** 🔵 Helper centralisé : props d’ombre Konva à partir d’un élément */
function shadowProps(el) {
  // On met toujours les props pour être explicite ; shadowEnabled pilote l'affichage
  return {
    shadowEnabled: !!el?.shadowEnabled,
    shadowColor: el?.shadowColor ?? '#000000',
    shadowOpacity: el?.shadowOpacity ?? 0.4,
    shadowBlur: el?.shadowBlur ?? 8,
    shadowOffsetX: el?.shadowOffsetX ?? 2,
    shadowOffsetY: el?.shadowOffsetY ?? 2,
  };
}

/**
 * Crée un dataURL PNG d'un document Konva pour un set d'éléments
 * -> Supporte: text, qrcode, barcode, image, shape
 * -> Ajout: application des ombres sur chaque node qui dessine
 */
async function createDocumentImage(elements, docWidth, docHeight, scale, pixelRatio, { qualiteMin = 3 } = {}) {
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width: docWidth * scale, height: docHeight * scale });
  const layer = new Konva.Layer();
  stage.add(layer);

  // Fond blanc
  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: docWidth * scale,
      height: docHeight * scale,
      fill: '#ffffff',
      listening: false,
    })
  );

  // Construction des nodes (async pour QR, Barcode et Images)
  const nodePromises = (elements || []).map(async (el) => {
    if (el?.visible === false) return null;

    // 📝 TEXT
    if (el?.type === 'text') {
      // fontStyle combine bold et italic comme Konva l'attend ("bold", "italic", "bold italic")
      // Même lecture que le canvas : `fontStyle`, repli sur l'ancien `bold`.
      const fontStyle = el.fontStyle || (el.bold ? 'bold' : 'normal');

      const texte = new Konva.Text({
        x: (el.x ?? 0) * scale,
        y: (el.y ?? 0) * scale,
        text: el.text ?? '',
        fontSize: (el.fontSize ?? 12) * scale,
        fontFamily: el.fontFamily ?? 'Arial',
        fontStyle,
        textDecoration: el.textDecoration || '',
        fill: el.color ?? '#000000',
        align: el.align ?? 'left',
        // ⬇️ width permet le word-wrap automatique (comme dans le canvas)
        width: el.width != null ? el.width * scale : undefined,
        // Pas de hauteur : le canvas n'en impose aucune, le texte prend la sienne
        wrap: el.wrap ?? 'word',
        // 1 : l'interligne du canvas (TextNode n'en fixe pas, Konva vaut 1)
        lineHeight: el.lineHeight ?? 1,
        opacity: el.opacity ?? 1,
        scaleX: el.scaleX ?? 1,
        scaleY: el.scaleY ?? 1,
        rotation: el.rotation ?? 0,
        listening: false,
        ...shadowProps(el),
      });
      // 🌈 Le dégradé se cale sur la taille MESURÉE du texte, comme à l'écran
      if (el.fillGradient) {
        texte.setAttrs(
          remplissage(el.fillGradient, texte.width(), texte.height(), el.color ?? '#000000')
        );
      }
      if (!el.highlightEnabled) return texte;
      // 🖍️ Surlignage (stabilo), dessiné DERRIÈRE le texte comme à l'écran
      const groupe = new Konva.Group({ listening: false });
      groupe.add(
        new Konva.Rect({
          x: texte.x(),
          y: texte.y(),
          width: texte.width(),
          height: texte.height(),
          rotation: texte.rotation(),
          scaleX: texte.scaleX(),
          scaleY: texte.scaleY(),
          fill: el.highlightColor || '#FFFF00',
          opacity: 0.5 * (el.opacity ?? 1),
        })
      );
      groupe.add(texte);
      return groupe;
    }

    // 📋 FICHE — même dessin que le canvas (`construireFiche`), à l'échelle 1
    // dans un groupe mis à l'échelle de la cellule. Sans contenu : rien.
    if (el?.type === 'fiche') {
      if (!el.ficheContenu) return null;
      const groupe = new Konva.Group({ scaleX: scale, scaleY: scale, listening: false });
      const fiche = new Konva.Group({ x: el.x ?? 0, y: el.y ?? 0, rotation: el.rotation ?? 0 });
      construireFiche(el, el.ficheContenu).nodes.forEach((n) => fiche.add(n));
      groupe.add(fiche);
      return groupe;
    }

    // 🔷 SHAPE — même géométrie que le canvas (`dessinForme`), dessinée à
    // l'échelle 1 dans un groupe mis à l'échelle de la cellule.
    if (el?.type === 'shape') {
      const { kind, props } = dessinForme(el);
      const forme = new Konva[kind]({
        ...props,
        rotation: el.rotation ?? 0,
        scaleX: el.scaleX ?? 1,
        scaleY: el.scaleY ?? 1,
        listening: false,
        ...shadowProps(el),
      });
      const groupe = new Konva.Group({ scaleX: scale, scaleY: scale, listening: false });
      groupe.add(forme);
      return groupe;
    }

    // 🔲 QRCODE (Konva.Image)
    if (el?.type === 'qrcode') {
      const size = (el.size ?? 160) * scale;
      const color = el.color ?? '#000000';
      const bgColor = el.bgColor ?? '#FFFFFF';
      const qrValue = el.qrValue ?? '';
      // Pas de valeur (produit sans URL web) : pas de QR, comme à l'écran.
      if (!String(qrValue).trim()) return null;

      try {
        const qrResolution = Math.max(512, Math.floor(size * 4));
        const dataURL = await dessinerQR(qrValue, {
          resolution: qrResolution,
          color,
          bgColor,
          gradient: el.fillGradient ?? null,
        });

        const imageObj = await loadImageFromDataURL(dataURL);

        return new Konva.Image({
          x: (el.x ?? 0) * scale,
          y: (el.y ?? 0) * scale,
          image: imageObj,
          width: size,
          height: size,
          rotation: el.rotation ?? 0,
          scaleX: el.scaleX ?? 1,
          scaleY: el.scaleY ?? 1,
          listening: false,
          ...shadowProps(el),
        });
      } catch (err) {
        console.error('QR generation failed in exportPdfSheet:', err);
        return null;
      }
    }

    // 📊 BARCODE — le MÊME dessin que le canvas (`dessinerCodeBarres`) :
    // hauteur et largeur des barres, format du numéro, et une hauteur qui
    // découle de la largeur (jamais d'étirement).
    if (el?.type === 'barcode') {
      if (!el.barcodeValue) return null;
      try {
        const width = (el.width ?? 200) * scale;
        const canvas = dessinerCodeBarres(
          {
            barcodeValue: el.barcodeValue,
            format: el.format ?? 'CODE128',
            width: el.width ?? 200,
            height: el.height ?? 80,
            displayValue: el.displayValue ?? true,
            fontSize: el.fontSize ?? 14,
            textMargin: el.textMargin ?? 2,
            margin: el.margin ?? 10,
            barHeight: el.barHeight,
            barWidth: el.barWidth,
            textFormat: el.textFormat ?? 'brut',
            background: el.background ?? '#FFFFFF',
            lineColor: el.lineColor ?? '#000000',
          },
          width * pixelRatio
        );
        const imageObj = await loadImageFromDataURL(canvas.toDataURL('image/png'));
        return new Konva.Image({
          x: (el.x ?? 0) * scale,
          y: (el.y ?? 0) * scale,
          image: imageObj,
          width,
          height: width * (canvas.height / canvas.width),
          rotation: el.rotation ?? 0,
          scaleX: el.scaleX ?? 1,
          scaleY: el.scaleY ?? 1,
          listening: false,
          ...shadowProps(el),
        });
      } catch (err) {
        console.error('❌ Code-barres generation failed:', el.barcodeValue, err);
        return null;
      }
    }

    // 🖼️ IMAGE (Konva.Image)
    if (el?.type === 'image') {
      const width = (el.width ?? 160) * scale;
      const height = (el.height ?? 160) * scale;
      const src = el.src ?? '';

      if (!src) {
        console.warn('⚠️ Image sans src:', el);
        return null;
      }

      try {
        const imageObj = await loadImageFromURL(src);
        // Même recadrage qu'à l'écran (`ImageNode`) : jamais d'image écrasée.
        const crop = konvaCrop(
          {
            width: el.width ?? 160,
            height: el.height ?? 160,
            cropX: el.cropX ?? 0,
            cropY: el.cropY ?? 0,
            cropWidth: el.cropWidth ?? 1,
            cropHeight: el.cropHeight ?? 1,
          },
          { width: imageObj.naturalWidth || imageObj.width, height: imageObj.naturalHeight || imageObj.height }
        );

        return new Konva.Image({
          crop,
          x: (el.x ?? 0) * scale,
          y: (el.y ?? 0) * scale,
          image: imageObj,
          width,
          height,
          rotation: el.rotation ?? 0,
          scaleX: el.scaleX ?? 1,
          scaleY: el.scaleY ?? 1,
          opacity: el.opacity ?? 1,
          listening: false,
          ...shadowProps(el),
        });
      } catch (err) {
        console.error('❌ Image loading failed in exportPdfSheet:', src, err);
        return null;
      }
    }

    return null;
  });

  // Attendre la création de tous les nodes
  const nodes = await Promise.all(nodePromises);
  const ratioEffets = Math.max(pixelRatio, qualiteMin);
  nodes.forEach((node, i) => {
    if (!node) return;
    layer.add(node);
    // Flou et effets : même règle que le canvas (`utils/effetsKonva.js`)
    appliquerEffets(node, elements[i], { echelle: scale, ratio: ratioEffets });
  });

  layer.draw();

  // PixelRatio augmenté pour une meilleure qualité globale
  const dataURL = stage.toDataURL({ pixelRatio: Math.max(pixelRatio, qualiteMin) });

  // Cleanup
  stage.destroy();
  container.remove();
  return dataURL;
}

/**
 * Export PDF en planche, sur AUTANT DE PAGES QUE NÉCESSAIRE.
 *
 * `cases` (liste de `{ product }`, `product` pouvant être null) est le tirage
 * déplié (`lib/tirage.js`) : c'est le chemin normal depuis le 29/09/2026.
 * Sans `cases`, l'ancien contrat est traduit en cases : `products` → une case
 * par produit ; sinon toutes les cases de la page avec le produit affiché.
 * Une case identique n'est dessinée qu'une fois (cache par produit).
 * `cadresCases` : le pointillé de repère autour de chaque case.
 */
export async function exportPdfSheet(
  _docNode,
  {
    sheetWidth,
    sheetHeight,
    docWidth,
    docHeight,
    rows = 2,
    cols = 2,
    margin = 10,
    spacing = 5,
    fileName = 'planche.pdf',
    pixelRatio = 3, // qualité élevée par défaut
    products = null,
    elementsOverride = null,
    qrPerProductWhenUnbound = false,
    cases = null,
    cadresCases = true,
  } = {}
) {
  if (!sheetWidth || !sheetHeight || !docWidth || !docHeight) return;

  const { cellWidth, cellHeight } = computeCellDimensions({
    sheetWidth,
    sheetHeight,
    rows,
    cols,
    margin,
    spacing,
  });
  const scale = computeScale({ cellWidth, cellHeight, docWidth, docHeight });
  const finalDocWidth = docWidth * scale;
  const finalDocHeight = docHeight * scale;
  const { offsetX, offsetY } = computeOffsets({
    cellWidth,
    cellHeight,
    finalDocWidth,
    finalDocHeight,
  });

  const orientation = sheetWidth >= sheetHeight ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [sheetWidth, sheetHeight] });

  // Récupération des éléments (store ou override)
  const baseElements = Array.isArray(elementsOverride)
    ? elementsOverride
    : (useLabelStore.getState()?.elements ?? []);

  const totalCells = rows * cols;
  let liste;
  if (Array.isArray(cases)) {
    liste = cases;
  } else if (Array.isArray(products) && products.length > 0) {
    liste = products.map((product) => ({ product }));
  } else {
    // Un SEUL produit (ou aucun) : la même affiche dans chaque case, remplie
    // avec le produit que montre le canvas. Avant, on passait `null` : la
    // fiche n'avait rien à dessiner et disparaissait, et textes ou QR liés
    // imprimaient leur valeur enregistrée au lieu de celle du produit.
    const produitAffiche = useLabelStore.getState()?.selectedProduct ?? null;
    liste = Array.from({ length: totalCells }, () => ({ product: produitAffiche }));
  }
  const { pages } = pagination(liste, { format: 'planche', rows, cols });

  // Une image par produit distinct ; `vide` pour les cases libres.
  const rendus = new Map();
  const imageDe = async (uneCase) => {
    const cle = uneCase ? (uneCase.product ?? 'sans-produit') : 'vide';
    if (!rendus.has(cle)) {
      const elements = uneCase
        ? updateElementsWithProduct(
            baseElements,
            uneCase.product,
            uneCase.product ? qrPerProductWhenUnbound : false
          )
        : [];
      rendus.set(cle, await createDocumentImage(elements, docWidth, docHeight, scale, pixelRatio));
    }
    return rendus.get(cle);
  };

  for (let p = 0; p < pages.length; p++) {
    if (p > 0) pdf.addPage([sheetWidth, sheetHeight], orientation);
    // Fond page blanc
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, sheetWidth, sheetHeight, 'F');

    for (let i = 0; i < pages[p].length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = margin + col * (cellWidth + spacing) + offsetX;
      const y = margin + row * (cellHeight + spacing) + offsetY;

      const dataURL = await imageDe(pages[p][i]);
      pdf.addImage(dataURL, 'PNG', x, y, finalDocWidth, finalDocHeight);

      if (!cadresCases) continue;
      // Cadre pointillé de la cellule (repère visuel)
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineDash([2, 2]);
      pdf.setLineWidth(0.5);
      pdf.rect(
        margin + col * (cellWidth + spacing),
        margin + row * (cellHeight + spacing),
        cellWidth,
        cellHeight
      );
    }
  }

  pdf.save(fileName);
}

/**
 * VIGNETTE d'une case pour la bande d'aperçu (`BandeTirage`) : le MÊME dessin
 * que l'export — éléments remplis avec le produit —, en petit. `hauteur` en
 * pixels écran ; `product` peut être null (le modèle tel quel).
 */
export async function apercuCase(product, { docWidth, docHeight, hauteur = 72, elements } = {}) {
  if (!docWidth || !docHeight) return null;
  const base = Array.isArray(elements) ? elements : (useLabelStore.getState()?.elements ?? []);
  const scale = hauteur / docHeight;
  const rendu = product ? updateElementsWithProduct(base, product, false) : base;
  return createDocumentImage(rendu, docWidth, docHeight, scale, 2, { qualiteMin: 1 });
}
