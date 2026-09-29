// Bande d'APERÇU du tirage, sous le canvas : une vignette par page, et dans
// chaque case le RENDU en petit de l'affiche remplie avec son produit — le
// même dessin que l'export (`apercuCase`, `utils/exportPdfSheet.js`). Un rendu
// par PRODUIT distinct (pas par case), recalculé 400 ms après la dernière
// retouche ; en attendant, la case montre le nom du produit. Lecture seule :
// cliquer une case affiche son produit sur le canvas. Repliable (préférence du
// poste). Les pages découlent du tirage (`lib/tirage.js`) ; elles ne
// s'éditent pas. Voir `PocketStick-docs/03-tirage.md`.
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import useLabelStore from '../store/useLabelStore';
import { SHEET_FORMATS, casesDuTirage, pagination } from '../lib/tirage';
import { apercuCase } from '../utils/exportPdfSheet';

const HAUTEUR = 72; // px, hauteur d'une vignette
const CLE_REPLI = 'stick.bandeTirage.replie';
const SANS_PRODUIT = '_';

const lireRepli = () => {
  try {
    return localStorage.getItem(CLE_REPLI) === '1';
  } catch {
    return false;
  }
};

const BandeTirage = () => {
  const ids = useLabelStore((s) => s.selectedProductIds);
  const parId = useLabelStore((s) => s.produitsParId);
  const quantites = useLabelStore((s) => s.quantites);
  const quantiteSansProduit = useLabelStore((s) => s.quantiteSansProduit);
  const courant = useLabelStore((s) => s.currentProductIndex);
  const format = useLabelStore((s) => s.formatTirage);
  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const elements = useLabelStore((s) => s.elements);
  const goToProductIndex = useLabelStore((s) => s.goToProductIndex);

  const [replie, setReplie] = useState(lireRepli);
  const [vignettes, setVignettes] = useState({}); // productId | '_' → dataURL

  const basculer = () =>
    setReplie((r) => {
      try {
        localStorage.setItem(CLE_REPLI, r ? '0' : '1');
      } catch {
        // préférence non retenue : sans gravité
      }
      return !r;
    });

  const { pages, total } = useMemo(() => {
    const cases = casesDuTirage({ selectedProductIds: ids, quantites, quantiteSansProduit });
    const r = pagination(cases, { format, rows: sheetSettings.rows, cols: sheetSettings.cols });
    return { pages: r.pages, total: cases.length };
  }, [ids, quantites, quantiteSansProduit, format, sheetSettings.rows, sheetSettings.cols]);

  const visible = !(format === 'page' && total <= 1);

  // Rendu des vignettes : un par produit distinct, après une pause de saisie,
  // abandonné si une retouche plus récente arrive.
  useEffect(() => {
    if (!visible || replie) return;
    let annule = false;
    const minuterie = setTimeout(async () => {
      const cles = ids.length ? [...new Set(ids)] : [SANS_PRODUIT];
      const suivantes = {};
      for (const cle of cles) {
        if (annule) return;
        const produit = cle === SANS_PRODUIT ? null : (parId[cle] ?? null);
        try {
          suivantes[cle] = await apercuCase(produit, {
            docWidth: canvasSize.width,
            docHeight: canvasSize.height,
            hauteur: HAUTEUR,
            elements,
          });
        } catch {
          // vignette impossible : la case garde le nom du produit
        }
      }
      if (!annule) setVignettes(suivantes);
    }, 400);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
  }, [visible, replie, ids, parId, elements, canvasSize.width, canvasSize.height]);

  // Une seule affiche : rien à montrer de plus que le canvas lui-même.
  if (!visible) return null;

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
    <div className="flex-none flex flex-col bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={!replie}
        className="self-start flex items-center gap-1.5 px-3 h-7 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
        title={replie ? 'Afficher les pages' : 'Replier les pages'}
      >
        {replie ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Pages · {pages.length}
      </button>

      {!replie && (
        <div
          className="h-[100px] flex items-start gap-3 px-3 pb-2 overflow-x-auto overflow-y-hidden"
          aria-label="Aperçu des pages du tirage"
        >
          {pages.map((page, p) => (
            <figure key={p} className="flex-none flex flex-col items-center gap-1 m-0">
              <div
                className="bg-white border border-gray-300 dark:border-gray-600 shadow-sm grid"
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
                  const src = vignettes[uneCase.productId ?? SANS_PRODUIT];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => uneCase.productId && goToProductIndex(uneCase.index)}
                      title={nom}
                      className={`relative min-w-0 min-h-0 overflow-hidden rounded-sm ${
                        actif ? 'ring-2 ring-blue-500 ring-offset-1' : 'hover:ring-1 hover:ring-blue-300'
                      }`}
                    >
                      {src ? (
                        <img src={src} alt={nom} draggable={false} className="w-full h-full object-contain" />
                      ) : (
                        <span className="block w-full h-full bg-blue-50 text-blue-900 text-[7px] leading-tight px-0.5 text-left">
                          {rows * cols <= 12 ? nom : ''}
                        </span>
                      )}
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
      )}
    </div>
  );
};

export default React.memo(BandeTirage);
