// AppTools/src/features/labels/utils/exportPdfSheet.js
import jsPDF from 'jspdf';
import Konva from 'konva';
import QRCodeLib from 'qrcode';
import JsBarcode from 'jsbarcode';
import useLabelStore from '../store/useLabelStore';
import {
  resolvePropForElement,
  getProductField,
  resolveTemplate,
  formatPriceEUR,
} from '../utils/dataBinding';

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

  const fallbackQR = () => {
    const barcode = product?.meta_data?.find?.((m) => m.key === 'barcode')?.value;
    return product.website_url || barcode || product.sku || product._id || '';
  };

  const gallerySrcAt = (idx) => {
    const gi = Array.isArray(product?.gallery_images) ? product.gallery_images[idx] : undefined;
    return (typeof gi === 'string' ? gi : gi?.src) || '';
  };

  return (elements || []).map((el) => {
    if (el?.visible === false) return el;

    // 📝 TEXT — binding + templates, avec prix formaté (comme le canvas)
    if (el?.type === 'text') {
      const nextText = el.dataBinding
        ? // dataBinding: 'price' => ajouter "€"
          el.dataBinding === 'price'
          ? formatPriceEUR(getProductField(product, 'price'))
          : String(getProductField(product, el.dataBinding) ?? '')
        : // templating éventuel dans el.text
          resolveTemplate(el.text ?? '', product, { type: 'text' });
      return { ...el, text: nextText };
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
 * -> Supporte: text, qrcode, barcode, image
 * -> Ajout: application des ombres sur chaque node qui dessine
 */
async function createDocumentImage(elements, docWidth, docHeight, scale, pixelRatio) {
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
      const fontStyle =
        [el.bold ? 'bold' : '', el.italic ? 'italic' : ''].filter(Boolean).join(' ') || 'normal';

      return new Konva.Text({
        x: (el.x ?? 0) * scale,
        y: (el.y ?? 0) * scale,
        text: el.text ?? '',
        fontSize: (el.fontSize ?? 12) * scale,
        fontFamily: el.fontFamily ?? 'Arial',
        fontStyle,
        fill: el.color ?? '#000000',
        align: el.align ?? 'left',
        // ⬇️ width permet le word-wrap automatique (comme dans le canvas)
        width: el.width != null ? el.width * scale : undefined,
        height: el.height != null ? el.height * scale : undefined,
        wrap: el.wrap ?? 'word',
        lineHeight: el.lineHeight ?? 1.2,
        scaleX: el.scaleX ?? 1,
        scaleY: el.scaleY ?? 1,
        rotation: el.rotation ?? 0,
        listening: false,
        ...shadowProps(el),
      });
    }

    // 🔲 QRCODE (Konva.Image)
    if (el?.type === 'qrcode') {
      const size = (el.size ?? 160) * scale;
      const color = el.color ?? '#000000';
      const bgColor = el.bgColor ?? '#FFFFFF';
      const qrValue = el.qrValue ?? '';

      try {
        const qrResolution = Math.max(512, Math.floor(size * 4));
        const dataURL = await QRCodeLib.toDataURL(qrValue || ' ', {
          width: qrResolution,
          margin: 2,
          color: { dark: color, light: bgColor },
          errorCorrectionLevel: 'H',
          type: 'image/png',
          rendererOpts: { quality: 1.0 },
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

    // 📊 BARCODE (Konva.Image)
    if (el?.type === 'barcode') {
      const width = (el.width ?? 200) * scale;
      const height = (el.height ?? 80) * scale;
      const barcodeValue = el.barcodeValue ?? '';
      const format = el.format ?? 'CODE128';

      if (!barcodeValue) {
        console.warn('⚠️ Code-barres sans valeur:', el);
        return null;
      }

      try {
        const barcodeScale = 3;
        const canvasWidth = Math.floor(width * barcodeScale);
        const canvasHeight = Math.floor(height * barcodeScale);

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const textHeight = el.displayValue ? (el.fontSize ?? 14) * scale * barcodeScale : 0;
        const barsHeight =
          canvasHeight - textHeight - (el.textMargin ?? 2) * scale * barcodeScale * 2;

        JsBarcode(canvas, barcodeValue, {
          format,
          width: 2 * barcodeScale,
          height: Math.max(20, barsHeight),
          displayValue: el.displayValue ?? true,
          fontSize: (el.fontSize ?? 14) * scale * barcodeScale,
          textMargin: (el.textMargin ?? 2) * scale * barcodeScale,
          margin: (el.margin ?? 10) * scale * barcodeScale,
          background: el.background ?? '#FFFFFF',
          lineColor: el.lineColor ?? '#000000',
          valid: (valid) => {
            if (!valid) console.warn('⚠️ Code-barres invalide:', barcodeValue, 'format:', format);
          },
        });

        const dataURL = canvas.toDataURL('image/png', 1.0);
        const imageObj = await loadImageFromDataURL(dataURL);

        return new Konva.Image({
          x: (el.x ?? 0) * scale,
          y: (el.y ?? 0) * scale,
          image: imageObj,
          width,
          height,
          rotation: el.rotation ?? 0,
          scaleX: el.scaleX ?? 1,
          scaleY: el.scaleY ?? 1,
          listening: false,
          ...shadowProps(el),
        });
      } catch (err) {
        console.error('❌ Code-barres generation failed:', barcodeValue, err);
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

        return new Konva.Image({
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

    // TODO: shapes si nécessaire
    return null;
  });

  // Attendre la création de tous les nodes
  const nodes = await Promise.all(nodePromises);
  nodes.filter(Boolean).forEach((node) => layer.add(node));

  layer.draw();

  // PixelRatio augmenté pour une meilleure qualité globale
  const dataURL = stage.toDataURL({ pixelRatio: Math.max(pixelRatio, 3) });

  // Cleanup
  stage.destroy();
  container.remove();
  return dataURL;
}

/**
 * Export PDF en planche.
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

  // Fond page blanc
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, sheetWidth, sheetHeight, 'F');

  // Récupération des éléments (store ou override)
  const baseElements = Array.isArray(elementsOverride)
    ? elementsOverride
    : (useLabelStore.getState()?.elements ?? []);

  // Mise en cache d'une cellule blanche
  let blankCellDataURL = null;
  const getBlankCell = async () => {
    if (blankCellDataURL) return blankCellDataURL;
    blankCellDataURL = await createDocumentImage([], docWidth, docHeight, scale, pixelRatio);
    return blankCellDataURL;
  };

  const totalCells = rows * cols;
  const hasProducts = Array.isArray(products) && products.length > 0;

  for (let i = 0; i < totalCells; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = margin + col * (cellWidth + spacing) + offsetX;
    const y = margin + row * (cellHeight + spacing) + offsetY;

    let dataURL;
    if (hasProducts && i < products.length) {
      const product = products[i];
      const updated = updateElementsWithProduct(baseElements, product, qrPerProductWhenUnbound);
      dataURL = await createDocumentImage(updated, docWidth, docHeight, scale, pixelRatio);
    } else if (hasProducts && i >= products.length) {
      dataURL = await getBlankCell();
    } else {
      const updated = updateElementsWithProduct(baseElements, null, false);
      dataURL = await createDocumentImage(updated, docWidth, docHeight, scale, pixelRatio);
    }

    pdf.addImage(dataURL, 'PNG', x, y, finalDocWidth, finalDocHeight);

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

  pdf.save(fileName);
}
