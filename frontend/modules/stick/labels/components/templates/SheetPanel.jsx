// frontend/modules/stick/labels/components/templates/SheetPanel.jsx
//
// L'onglet « Produits » : le tirage (`TiragePanel`), puis — en planche — la
// feuille et sa grille, et le bouton qui exporte tout.
//
// Refait le 3 octobre 2026 : la planche est UNE section repliable d'environ
// 250 px (elle en faisait ~850), l'export un pied collant toujours visible, et
// il n'y a plus que du bleu — l'indigo, le vert et l'ambre qui n'avertissait
// de rien sont partis. L'aperçu de la grille a disparu : la bande des pages,
// sous la page, montre les vraies planches.
//
// MARGE ET ÉCART SE SAISISSENT EN MILLIMÈTRES. Le store garde des POINTS
// entiers, de 0 à 50 comme avant : on convertit à l'affichage et à la saisie
// (`utils/formatsPage.js`). L'ancien champ disait « mm » et montrait des points.
import React, { useMemo, useCallback, useEffect } from 'react';
import { Download } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { SHEET_FORMATS } from '../../lib/tirage';
import { exporterTirage } from '../../utils/exportTirage';
import { enMm, enPt } from '../../utils/formatsPage';
import { tailleCase } from '../../utils/planche';
import Bouton from '../ui/Bouton';
import ChampValide from '../ui/ChampValide';
import Interrupteur from '../ui/Interrupteur';
import Note from '../ui/Note';
import Section from '../ui/Section';
import Segments from '../ui/Segments';
import { AIDE, LIGNE } from '../ui/styles';
import TiragePanel from './TiragePanel';

/**
 * Constantes hors composant (évite les recréations à chaque rendu)
 */

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

// Marge et écart : 0 à 50 points dans le store, soit 0 à 17,6 mm à l'écran
const PT_MAX = 50;
const MM_MAX = enMm(PT_MAX, 1);

const SheetPanel = ({ docNode }) => {
  // ----- store
  const canvasSize = useLabelStore((state) => state.canvasSize);
  const formatTirage = useLabelStore((s) => s.formatTirage);

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

  const totalCells = rows * cols;

  // ----- calculs
  const cellSize = useMemo(
    () => tailleCase(selectedSheet, { rows, cols, margin, spacing }),
    [selectedSheet, rows, cols, margin, spacing]
  );

  const scale = useMemo(() => {
    const scaleX = cellSize.width / canvasSize.width;
    const scaleY = cellSize.height / canvasSize.height;
    return Math.min(scaleX, scaleY, 1);
  }, [cellSize, canvasSize]);

  // CES DEUX EFFETS RESTENT ICI, au premier niveau : dans la section « Planche »,
  // ils cesseraient de tourner dès qu'on la replie.

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
  const pageALaTailleDeLaCase = () => setCanvasSize(Math.max(1, cellSize.width), Math.max(1, cellSize.height));

  // Même chemin que le bouton « Exporter » de la barre : le tirage entier.
  const handleExport = useCallback(
    () => exporterTirage(docNode),
    [docNode]
  );

  /** Un champ en mm qui écrit des points entiers, bornés comme avant. */
  const champMm = (cle, titre) => (
    <ChampValide
      valeur={enMm(sheetSettings[cle], 1)}
      onValeur={(mm) => setSheetSettings({ [cle]: clampInt(enPt(mm), { min: 0, max: PT_MAX }) })}
      min={0}
      max={MM_MAX}
      titre={titre}
      className="w-14"
    />
  );
  const champEntier = (cle, titre) => (
    <ChampValide
      valeur={sheetSettings[cle]}
      onValeur={(n) => setSheetSettings({ [cle]: clampInt(Math.round(n), { min: 1, max: 10 }) })}
      min={1}
      max={10}
      titre={titre}
      className="w-14"
    />
  );

  // ----- UI
  return (
    <div className="px-3 pt-3">
      <div className="pb-3">
        <TiragePanel />
      </div>

      {formatTirage === 'planche' && (
          <Section titre="Planche">
            <div className={LIGNE}>
              <span>Feuille</span>
              <div className="w-56">
                <Segments
                  label="Format de la feuille"
                  valeur={selectedSheet.id}
                  onValeur={setSelectedSheetId}
                  options={SHEET_FORMATS.map((f) => ({
                    id: f.id,
                    label: f.label,
                    titre: `${enMm(f.width)} × ${enMm(f.height)} mm`,
                  }))}
                />
              </div>
            </div>

            <div className={LIGNE}>
              <span>Grille</span>
              <div className="w-56">
                <Segments
                  label="Grille rapide"
                  valeur={`${rows}×${cols}`}
                  onValeur={(id) => {
                    const preset = GRID_PRESETS.find((p) => p.label === id);
                    if (preset) setSheetSettings({ rows: preset.rows, cols: preset.cols });
                  }}
                  options={GRID_PRESETS.map((p) => ({ id: p.label, label: p.label }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <label className={LIGNE}>
                <span>Colonnes</span>
                {champEntier('cols', 'Colonnes (1 à 10)')}
              </label>
              <label className={LIGNE}>
                <span>Lignes</span>
                {champEntier('rows', 'Lignes (1 à 10)')}
              </label>
              <label className={LIGNE}>
                <span>Marge (mm)</span>
                {champMm('margin', `Marge autour de la feuille, en mm (0 à ${MM_MAX})`)}
              </label>
              <label className={LIGNE}>
                <span>Écart (mm)</span>
                {champMm('spacing', `Écart entre deux étiquettes, en mm (0 à ${MM_MAX})`)}
              </label>
            </div>

            <div className={LIGNE}>
              <span>Page à la taille d’une étiquette</span>
              <Interrupteur
                actif={!!lockCanvasToSheetCell}
                label="La page suit la taille d’une étiquette de la planche"
                onActif={(next) => {
                  setLockCanvasToSheetCell(next);
                  if (next) pageALaTailleDeLaCase();
                }}
              />
            </div>

            <div className="space-y-1">
              <p className={AIDE}>
                Étiquette {enMm(cellSize.width)} × {enMm(cellSize.height)} mm · {totalCells} par feuille
              </p>
              {scale < 1 && <Note>La page est réduite à {(scale * 100).toFixed(0)} % pour tenir dans l’étiquette.</Note>}
              {!lockCanvasToSheetCell && (
                <Bouton variante="discret" onClic={pageALaTailleDeLaCase}>
                  Mettre la page à cette taille
                </Bouton>
              )}
            </div>
          </Section>
      )}

      {/* Pied collant : le tirage entier, comme « Exporter » de la barre */}
      <div className="sticky bottom-0 -mx-3 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Bouton variante="principal" grand plein icone={Download} onClic={handleExport} desactive={!docNode}>
          Exporter tout (PDF)
        </Bouton>
      </div>
    </div>
  );
};

export default React.memo(SheetPanel);
