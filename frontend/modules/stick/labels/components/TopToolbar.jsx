// src/features/labels/components/TopToolbar.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Undo, Redo, Download, Plus, Save, ChevronDown, Loader2 } from 'lucide-react';
import useLabelStore, { idsSelectionnes } from '../store/useLabelStore';
import { exporterTirage } from '../utils/exportTirage';
import { enregistrerFichier, selectionEnPng, selectionEnSvg } from '../utils/exportSelection';
import { useActionToasts } from '../ui/useActionToasts';
import JaugeDetourage from './ui/JaugeDetourage';

const FORMATS_SELECTION = [
  { id: 'svg', titre: 'SVG vectoriel', detail: 'Textes et formes en vecteurs, images à 300 dpi' },
  { id: 'png', titre: 'PNG 300 dpi', detail: 'Image transparente, 300 dpi déclarés' },
];

const nomDeFichier = (nom) => `${String(nom || 'selection').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'selection'}-selection`;

const TopToolbar = ({
  dataSource,
  onNewLabel,
  docNode,
  selectedProduct,
  onSave,
}) => {
  const selectedId = useLabelStore((s) => s.selectedId);

  const undo = useLabelStore((s) => s.undo);
  const redo = useLabelStore((s) => s.redo);
  const canUndo = useLabelStore((s) => s.canUndo);
  const canRedo = useLabelStore((s) => s.canRedo);
  const currentTemplateName = useLabelStore((s) => s.currentTemplateName);
  const nbSelection = useLabelStore((s) => idsSelectionnes(s).length);
  const toasts = useActionToasts();
  const [menuSelection, setMenuSelection] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  const refMenu = useRef(null);

  useEffect(() => {
    if (!menuSelection) return undefined;
    const fermer = (e) => {
      if (!refMenu.current?.contains(e.target)) setMenuSelection(false);
    };
    window.addEventListener('mousedown', fermer);
    return () => window.removeEventListener('mousedown', fermer);
  }, [menuSelection]);

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }
      if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canUndo, canRedo, undo, redo]);

  // La PAGE EN COURS seulement ; le tirage entier part du panneau Produits
  // (« Exporter tout (PDF) »). Les deux sont en bleu principal (3 octobre
  // 2026) : une seule couleur d'action — « Nouveau » est devenu secondaire.
  const handleExportPdf = () => exporterTirage(docNode, { pageCourante: true });

  // LA SÉLECTION seule, cadrée sur elle, fond transparent (`utils/exportSelection.js`)
  const handleExportSelection = async (format) => {
    setMenuSelection(false);
    const state = useLabelStore.getState();
    const ids = idsSelectionnes(state);
    if (!docNode || !ids.length) return;
    const args = {
      width: state.canvasSize.width,
      height: state.canvasSize.height,
      ids,
      toutesIds: state.elements.map((e) => e.id),
    };
    const nom = nomDeFichier(state.currentTemplateName);
    setExportEnCours(true);
    try {
      if (format === 'svg') {
        const { blob, enImage } = await selectionEnSvg(docNode, args);
        enregistrerFichier(blob, `${nom}.svg`);
        if (enImage) {
          toasts.warning(
            `SVG exporté. ${enImage} élément${enImage > 1 ? 's' : ''} ne se dis${enImage > 1 ? 'ent' : 'ait'} pas en vecteurs (texture, police introuvable…) : posé${enImage > 1 ? 's' : ''} en image à 300 dpi.`
          );
        } else toasts.success('SVG exporté.');
      } else {
        enregistrerFichier(await selectionEnPng(docNode, args), `${nom}.png`);
        toasts.success('PNG 300 dpi exporté.');
      }
    } catch (e) {
      toasts.error(`Export de la sélection impossible : ${e?.message || e}`);
    } finally {
      setExportEnCours(false);
    }
  };


  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 min-w-0 relative z-20">
      <div className="flex items-center justify-between gap-3">
        {/* Gauche : actions + titre + (property inline si sélection) */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNewLabel?.()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Nouveau document"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau</span>
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            title="Annuler (Ctrl/Cmd+Z)"
          >
            <Undo className="h-5 w-5" />
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            title="Rétablir (Ctrl+Shift+Z / Ctrl+Y)"
          >
            <Redo className="h-5 w-5" />
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Titre/document info — aligné à gauche */}
          <div className="flex items-center gap-3 min-w-0">
            {selectedProduct ? (
              <div className="leading-tight">
                {currentTemplateName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5 flex items-center gap-1.5">
                    <span className="truncate">{currentTemplateName}</span>
                    {canUndo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSave?.();
                        }}
                        className="flex-shrink-0"
                        title="Enregistrer les modifications"
                      >
                        <Save className="h-3 w-3 text-orange-500 dark:text-orange-400" />
                      </button>
                    )}
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {selectedProduct.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {selectedProduct.sku} • {selectedProduct.price?.toLocaleString('fr-FR') || '0'}€
                </div>
              </div>
            ) : (
              <h1 className="text-sm font-medium text-gray-800 dark:text-white shrink-0 flex items-center gap-2">
                <span className="truncate">
                  {currentTemplateName ||
                    'Nouveau document'}
                </span>
                {canUndo && currentTemplateName && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSave?.();
                    }}
                    className="flex-shrink-0"
                    title="Enregistrer les modifications"
                  >
                    <Save className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                  </button>
                )}
              </h1>
            )}

          </div>
        </div>

        {/* Droite : actions d’export */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Détourage ou modification par IA en cours : visible ici quelle que soit la sélection */}
          <JaugeDetourage compact />
          {nbSelection > 0 && (
            <div className="relative" ref={refMenu}>
              <button
                onClick={() => setMenuSelection((o) => !o)}
                disabled={!docNode || exportEnCours}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Exporter les éléments sélectionnés, seuls, sur fond transparent"
                aria-haspopup="menu"
                aria-expanded={menuSelection}
              >
                {exportEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span>Exporter la sélection</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {menuSelection && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1 w-64 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1 z-30"
                >
                  {FORMATS_SELECTION.map((f) => (
                    <button
                      key={f.id}
                      role="menuitem"
                      onClick={() => handleExportSelection(f.id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <div className="text-sm text-gray-900 dark:text-white">{f.titre}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{f.detail}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleExportPdf}
            disabled={!docNode}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!docNode ? 'Document non disponible' : 'Exporter la page en cours en PDF'}
          >
            <Download className="h-4 w-4" />
            <span>Exporter la page</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default TopToolbar;
