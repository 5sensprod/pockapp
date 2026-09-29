// UN SEUL chemin d'export : le tirage entier (`lib/tirage.js`), lu dans le
// store au moment du clic. Voir `PocketStick-docs/03-tirage.md`.
//
// - Une seule case, celle que montre le canvas : `exportPdf`, qui clone le
//   canvas tel quel — le rendu le plus fidèle, inchangé.
// - Sinon : `exportPdfSheet`, qui pagine. En format « page », c'est une
//   planche 1×1 au format du canvas, sans marge ni pointillé.
import useLabelStore from '../store/useLabelStore';
import { SHEET_FORMATS, casesDuTirage } from '../lib/tirage';
import { exportPdf } from './exportPdf';
import { exportPdfSheet } from './exportPdfSheet';

/** `format` force le format (sinon `formatTirage` du store). */
export async function exporterTirage(docNode, { format } = {}) {
  const state = useLabelStore.getState();
  const { canvasSize, zoom, sheetSettings, produitsParId, selectedProduct } = state;
  const leFormat = format ?? state.formatTirage;
  const cases = casesDuTirage(state).map((c) => ({
    product: c.productId ? (produitsParId[c.productId] ?? null) : null,
  }));

  const casUnique =
    leFormat === 'page' &&
    cases.length === 1 &&
    (cases[0].product ?? null) === (selectedProduct ?? null);
  if (casUnique) {
    if (!docNode) return;
    const safeZoom = Math.max(zoom || 1, 0.001);
    return exportPdf(docNode, {
      width: canvasSize.width,
      height: canvasSize.height,
      fileName: 'document.pdf',
      pixelRatio: Math.max(1, 2 / safeZoom),
    });
  }

  if (leFormat === 'planche') {
    const feuille =
      SHEET_FORMATS.find((f) => f.id === sheetSettings.selectedSheetId) || SHEET_FORMATS[0];
    return exportPdfSheet(docNode, {
      sheetWidth: feuille.width,
      sheetHeight: feuille.height,
      docWidth: canvasSize.width,
      docHeight: canvasSize.height,
      rows: sheetSettings.rows,
      cols: sheetSettings.cols,
      margin: sheetSettings.margin,
      spacing: sheetSettings.spacing,
      fileName: `planche-${sheetSettings.cols}x${sheetSettings.rows}.pdf`,
      cases,
    });
  }

  return exportPdfSheet(docNode, {
    sheetWidth: canvasSize.width,
    sheetHeight: canvasSize.height,
    docWidth: canvasSize.width,
    docHeight: canvasSize.height,
    rows: 1,
    cols: 1,
    margin: 0,
    spacing: 0,
    fileName: 'affiches.pdf',
    cases,
    cadresCases: false,
  });
}
