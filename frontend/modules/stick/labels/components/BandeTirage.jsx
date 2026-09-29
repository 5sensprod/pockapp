// Bande d'APERÇU du tirage, sous le canvas : une vignette par page, cases
// SCHÉMATIQUES (nom du produit, pleine ou libre) — pas un rendu Konva, qui
// coûterait un rendu par case à chaque retouche. Lecture seule : cliquer une
// case affiche son produit sur le canvas. Les pages découlent du tirage
// (`lib/tirage.js`) ; elles ne s'éditent pas. Voir `PocketStick-docs/03-tirage.md`.
import React, { useMemo } from 'react';
import useLabelStore from '../store/useLabelStore';
import { SHEET_FORMATS, casesDuTirage, pagination } from '../lib/tirage';

const HAUTEUR = 72; // px, hauteur d'une vignette

const BandeTirage = () => {
  const ids = useLabelStore((s) => s.selectedProductIds);
  const parId = useLabelStore((s) => s.produitsParId);
  const quantites = useLabelStore((s) => s.quantites);
  const quantiteSansProduit = useLabelStore((s) => s.quantiteSansProduit);
  const courant = useLabelStore((s) => s.currentProductIndex);
  const format = useLabelStore((s) => s.formatTirage);
  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const goToProductIndex = useLabelStore((s) => s.goToProductIndex);

  const { pages, total } = useMemo(() => {
    const cases = casesDuTirage({ selectedProductIds: ids, quantites, quantiteSansProduit });
    const r = pagination(cases, { format, rows: sheetSettings.rows, cols: sheetSettings.cols });
    return { pages: r.pages, total: cases.length };
  }, [ids, quantites, quantiteSansProduit, format, sheetSettings.rows, sheetSettings.cols]);

  // Une seule affiche : rien à montrer de plus que le canvas lui-même.
  if (format === 'page' && total <= 1) return null;

  const planche = format === 'planche';
  const feuille = SHEET_FORMATS.find((f) => f.id === sheetSettings.selectedSheetId) || SHEET_FORMATS[0];
  const ratio = planche
    ? feuille.width / feuille.height
    : Math.max(0.2, Math.min(5, canvasSize.width / Math.max(1, canvasSize.height)));
  const rows = planche ? sheetSettings.rows : 1;
  const cols = planche ? sheetSettings.cols : 1;
  const pad = planche ? `${(sheetSettings.margin / feuille.width) * 100}%` : '0';
  const gap = planche ? `${Math.max(1, (sheetSettings.spacing / feuille.width) * HAUTEUR * ratio)}px` : '0';

  return (
    <div
      className="flex-none h-[104px] flex items-center gap-3 px-3 overflow-x-auto overflow-y-hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
      aria-label="Aperçu des pages du tirage"
    >
      {pages.map((page, p) => (
        <figure key={p} className="flex-none flex flex-col items-center gap-1 m-0">
          <div
            className="bg-white dark:bg-gray-100 border border-gray-300 dark:border-gray-600 shadow-sm grid"
            style={{
              height: HAUTEUR,
              width: HAUTEUR * ratio,
              padding: pad,
              gap,
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {page.map((uneCase, i) => {
              if (!uneCase) {
                return <div key={i} className="rounded-sm border border-dashed border-gray-300" />;
              }
              const nom = uneCase.productId ? parId[uneCase.productId]?.name || 'Produit' : 'Sans produit';
              const actif = uneCase.productId != null && uneCase.index === courant;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => uneCase.productId && goToProductIndex(uneCase.index)}
                  title={nom}
                  className={`min-w-0 min-h-0 overflow-hidden rounded-sm text-[7px] leading-tight px-0.5 text-left ${
                    actif
                      ? 'bg-blue-500 text-white'
                      : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
                  }`}
                >
                  {rows * cols <= 12 ? nom : ''}
                </button>
              );
            })}
          </div>
          <figcaption className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
            {p + 1} / {pages.length}
          </figcaption>
        </figure>
      ))}
    </div>
  );
};

export default React.memo(BandeTirage);
