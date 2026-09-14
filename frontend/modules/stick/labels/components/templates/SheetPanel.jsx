// src/features/labels/components/templates/SheetPanel.jsx
import React, { useMemo, useCallback, useEffect } from 'react';
import { Grid3x3, Download, Package } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { exportPdfSheet } from '../../utils/exportPdfSheet';

/**
 * Constantes hors composant (évite les recréations à chaque rendu)
 */
const SHEET_FORMATS = [
  { id: 'a4-portrait', label: 'A4 Portrait', width: 595, height: 842 },
  { id: 'a4-landscape', label: 'A4 Paysage', width: 842, height: 595 },
];

const GRID_PRESETS = [
  { rows: 2, cols: 2, label: '2×2' },
  { rows: 2, cols: 3, label: '2×3' },
  { rows: 3, cols: 3, label: '3×3' },
  { rows: 4, cols: 4, label: '4×4' },
  { rows: 5, cols: 5, label: '5×5' },
];

const clampInt = (value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
};

// Convertisseur points -> mm
const PT_TO_MM = 25.4 / 72;
const toMm = (pt, digits = 1) => {
  if (pt == null) return '';
  return (pt * PT_TO_MM).toFixed(digits);
};

const SheetPanel = ({ docNode }) => {
  // ----- store
  const canvasSize = useLabelStore((state) => state.canvasSize);
  const dataSource = useLabelStore((state) => state.dataSource);
  const selectedProducts = useLabelStore((state) => state.selectedProducts ?? []);

  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const setSheetSettings = useLabelStore((s) => s.setSheetSettings);
  const setSelectedSheetId = useLabelStore((s) => s.setSelectedSheetId);

  const setCanvasSize = useLabelStore((s) => s.setCanvasSize);
  const lockCanvasToSheetCell = useLabelStore((s) => s.lockCanvasToSheetCell);
  const setLockCanvasToSheetCell = useLabelStore((s) => s.setLockCanvasToSheetCell);
  const setSheetMeta = useLabelStore((s) => s.setSheetMeta);
  const setCellPt = useLabelStore((s) => s.setCellPt);

  // ----- dérivés depuis le store
  const selectedSheet =
    SHEET_FORMATS.find((f) => f.id === sheetSettings.selectedSheetId) || SHEET_FORMATS[0];

  const rows = sheetSettings.rows;
  const cols = sheetSettings.cols;
  const margin = sheetSettings.margin;
  const spacing = sheetSettings.spacing;

  const productCount = Array.isArray(selectedProducts) ? selectedProducts.length : 0;
  const isMultiProduct = dataSource === 'data' && productCount > 1;
  const totalCells = rows * cols;
  const isA4 = selectedSheet.id.startsWith('a4-');

  // ----- calculs
  const cellSize = useMemo(() => {
    const availableWidth = selectedSheet.width - 2 * margin - (cols - 1) * spacing;
    const availableHeight = selectedSheet.height - 2 * margin - (rows - 1) * spacing;
    return {
      width: Math.max(0, Math.floor(availableWidth / cols)),
      height: Math.max(0, Math.floor(availableHeight / rows)),
    };
  }, [selectedSheet, rows, cols, margin, spacing]);

  const scale = useMemo(() => {
    const scaleX = cellSize.width / canvasSize.width;
    const scaleY = cellSize.height / canvasSize.height;
    return Math.min(scaleX, scaleY, 1);
  }, [cellSize, canvasSize]);

  // informer le store (FormatPanel & mm)
  useEffect(() => {
    setSheetMeta({
      id: selectedSheet.id,
      widthPt: selectedSheet.width,
      heightPt: selectedSheet.height,
      rows,
      cols,
      margin,
      spacing,
    });
    setCellPt(cellSize.width, cellSize.height);
  }, [
    selectedSheet,
    rows,
    cols,
    margin,
    spacing,
    cellSize.width,
    cellSize.height,
    setSheetMeta,
    setCellPt,
  ]);

  // auto-sync canvas = cellule
  useEffect(() => {
    if (!lockCanvasToSheetCell) return;
    const w = Math.max(1, cellSize.width);
    const h = Math.max(1, cellSize.height);
    if (canvasSize.width !== w || canvasSize.height !== h) {
      setCanvasSize(w, h);
    }
  }, [
    lockCanvasToSheetCell,
    cellSize.width,
    cellSize.height,
    canvasSize.width,
    canvasSize.height,
    setCanvasSize,
  ]);

  // ----- handlers
  const handleSetSheet = useCallback(
    (format) => {
      setSelectedSheetId(format.id);
    },
    [setSelectedSheetId]
  );

  const handleAdaptGrid = useCallback(() => {
    if (productCount <= 1) return;
    const root = Math.sqrt(productCount);
    const nextRows = Math.ceil(root);
    const nextCols = Math.ceil(productCount / nextRows);
    setSheetSettings({ rows: nextRows, cols: nextCols });
  }, [productCount, setSheetSettings]);

  const handleExport = useCallback(() => {
    if (!docNode) return;
    exportPdfSheet(docNode, {
      sheetWidth: selectedSheet.width,
      sheetHeight: selectedSheet.height,
      docWidth: canvasSize.width,
      docHeight: canvasSize.height,
      rows,
      cols,
      margin,
      spacing,
      fileName: `planche-${cols}x${rows}.pdf`,
      products: isMultiProduct ? selectedProducts : null,
      qrPerProductWhenUnbound: false,
    });
  }, [
    docNode,
    selectedSheet,
    canvasSize,
    rows,
    cols,
    margin,
    spacing,
    isMultiProduct,
    selectedProducts,
  ]);

  // ----- UI
  const previewStyle = useMemo(
    () => ({
      width: '200px',
      height: selectedSheet.id.includes('portrait') ? '280px' : '200px',
      padding: `${(margin / selectedSheet.width) * 200}px`,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: `${(spacing / selectedSheet.width) * 200}px`,
    }),
    [selectedSheet, margin, cols, rows, spacing]
  );

  return (
    <div className="p-4 space-y-4">
      {/* Mode design sur cellule */}
      <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700 flex items-center justify-between">
        <div className="text-sm text-indigo-900 dark:text-indigo-200">
          <div className="font-medium">Canvas = taille d’une cellule</div>
          <div className="text-xs opacity-80">
            Quand activé, le canvas suit automatiquement les dimensions de chaque cellule de la
            planche.
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!lockCanvasToSheetCell}
            onChange={(e) => {
              const next = e.target.checked;
              setLockCanvasToSheetCell(next);
              if (next) {
                setCanvasSize(Math.max(1, cellSize.width), Math.max(1, cellSize.height));
              }
            }}
          />
          <span>Activer</span>
        </label>
      </div>

      {/* Format de planche */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Format de planche
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {SHEET_FORMATS.map((format) => (
            <button
              key={format.id}
              onClick={() => handleSetSheet(format)}
              className={`p-3 border rounded-lg transition-all ${
                selectedSheet.id === format.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              <div className="text-sm font-medium">{format.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {format.id.startsWith('a4-') ? (
                  <>
                    {toMm(format.width, 0)} × {toMm(format.height, 0)} mm
                  </>
                ) : (
                  <>
                    {format.width} × {format.height} pt
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Presets de grille */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Disposition rapide
        </h3>
        <div className="grid grid-cols-5 gap-2">
          {GRID_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setSheetSettings({ rows: preset.rows, cols: preset.cols })}
              className={`p-2 border rounded text-sm font-medium transition-all ${
                rows === preset.rows && cols === preset.cols
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Configuration manuelle (marges/espacements en mm si A4) */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Configuration</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Lignes</label>
            <input
              type="number"
              value={rows}
              onChange={(e) =>
                setSheetSettings({ rows: clampInt(e.target.value, { min: 1, max: 10 }) })
              }
              min="1"
              max="10"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Colonnes</label>
            <input
              type="number"
              value={cols}
              onChange={(e) =>
                setSheetSettings({ cols: clampInt(e.target.value, { min: 1, max: 10 }) })
              }
              min="1"
              max="10"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
              Marge ({isA4 ? 'mm' : 'pt'})
            </label>
            <input
              type="number"
              value={margin}
              onChange={(e) =>
                setSheetSettings({ margin: clampInt(e.target.value, { min: 0, max: 50 }) })
              }
              min="0"
              max="50"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
              Espacement ({isA4 ? 'mm' : 'pt'})
            </label>
            <input
              type="number"
              value={spacing}
              onChange={(e) =>
                setSheetSettings({ spacing: clampInt(e.target.value, { min: 0, max: 50 }) })
              }
              min="0"
              max="50"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
            />
          </div>
        </div>
        {isA4 && (
          <div className="text-[11px] text-gray-500">
            * Les valeurs saisies restent en points (pt). Affichage converti en millimètres pour
            votre confort.
          </div>
        )}
      </div>

      {/* Preview de la grille */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <Grid3x3 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Aperçu de la grille
          </span>
        </div>
        <div
          className="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 mx-auto"
          style={previewStyle}
        >
          {Array.from({ length: totalCells }).map((_, i) => {
            const hasProduct = isMultiProduct && i < productCount;
            return (
              <div
                key={i}
                className={`border rounded ${
                  hasProduct
                    ? 'border-green-400 bg-green-100 dark:border-green-600 dark:bg-green-900/30'
                    : 'border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Info cellule (mm si A4) */}
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
        <div className="text-xs space-y-1">
          <div className="font-medium text-amber-900 dark:text-amber-300">
            Taille de cellule :{' '}
            {isA4 ? (
              <>
                {toMm(cellSize.width, 0)} × {toMm(cellSize.height, 0)} mm
              </>
            ) : (
              <>
                {cellSize.width} × {cellSize.height} pt
              </>
            )}
          </div>
          <div className="text-amber-700 dark:text-amber-400">
            Document : {canvasSize.width} × {canvasSize.height} px
          </div>
          <div className="text-amber-700 dark:text-amber-400">
            Échelle appliquée : {(scale * 100).toFixed(1)}%
          </div>
          <div className="text-amber-700 dark:text-amber-400">
            Total : {totalCells} cellule{totalCells > 1 ? 's' : ''}
            {isMultiProduct && ` (${Math.min(productCount, totalCells)} produits affichés)`}
          </div>

          {!lockCanvasToSheetCell && (
            <div className="pt-2">
              <button
                onClick={() =>
                  setCanvasSize(Math.max(1, cellSize.width), Math.max(1, cellSize.height))
                }
                className="px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Appliquer une fois la taille de cellule au canvas
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bouton export */}
      <button
        onClick={handleExport}
        disabled={!docNode}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
      >
        <Download className="h-4 w-4" />
        Exporter la planche PDF
      </button>
    </div>
  );
};

export default React.memo(SheetPanel);
