// UN SEUL chemin d'export : le tirage (`lib/tirage.js`), lu dans le store au
// moment du clic — entier, ou sa seule PAGE EN COURS (`pageCourante`, bouton
// « Exporter » de la barre). Voir `PocketStick-docs/03-tirage.md`.
//
// - Une seule case, celle que montre le canvas : `exportPdf`, qui clone le
//   canvas tel quel — le rendu le plus fidèle, inchangé.
// - Sinon : `exportPdfSheet`, qui pagine. En format « page », c'est une
//   planche 1×1 au format du canvas, sans marge ni pointillé.
import useLabelStore from '../store/useLabelStore';
import { SHEET_FORMATS, casesDuTirage, pagination } from '../lib/tirage';
import { exportPdf } from './exportPdf';
import { exportPdfSheet } from './exportPdfSheet';

/**
 * Les cases de la page qui contient le produit affiché (`currentProductIndex`),
 * sans les cases libres. Sans produit, la première page.
 */
export const casesDeLaPageCourante = (state, leFormat) => {
  const toutes = casesDuTirage(state);
  const { pages } = pagination(toutes, {
    format: leFormat,
    rows: state.sheetSettings?.rows,
    cols: state.sheetSettings?.cols,
  });
  const courant = state.currentProductIndex ?? 0;
  const page = pages.find((pg) => pg.some((c) => c && c.index === courant)) || pages[0];
  return page.filter(Boolean);
};

/**
 * `format` force le format (sinon `formatTirage` du store).
 * `pageCourante` : la seule page en cours — en format « page », c'est le
 * canvas tel qu'il s'affiche ; en planche, la feuille du produit affiché.
 */
export async function exporterTirage(docNode, { format, pageCourante = false } = {}) {
  const state = useLabelStore.getState();
  const { canvasSize, zoom, sheetSettings, produitsParId, selectedProduct } = state;
  const leFormat = format ?? state.formatTirage;
  const brutes = pageCourante ? casesDeLaPageCourante(state, leFormat) : casesDuTirage(state);
  const cases = brutes.map((c) => ({
    product: c.productId ? (produitsParId[c.productId] ?? null) : null,
  }));

  const casUnique =
    leFormat === 'page' &&
    (pageCourante ||
      (cases.length === 1 && (cases[0].product ?? null) === (selectedProduct ?? null)));
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
