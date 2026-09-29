// src/features/labels/components/TopToolbar.jsx
import React, { useEffect } from 'react';
import { Undo, Redo, Download, Plus, Save } from 'lucide-react';
import useLabelStore from '../store/useLabelStore';
import { exporterTirage } from '../utils/exportTirage';

const TopToolbar = ({
  dataSource,
  onNewLabel,
  docNode,
  selectedProduct,
  onOpenEffects,
  onSave,
}) => {
  const selectedId = useLabelStore((s) => s.selectedId);

  const undo = useLabelStore((s) => s.undo);
  const redo = useLabelStore((s) => s.redo);
  const canUndo = useLabelStore((s) => s.canUndo);
  const canRedo = useLabelStore((s) => s.canRedo);
  const currentTemplateName = useLabelStore((s) => s.currentTemplateName);

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

  // Le tirage entier : une page par exemplaire, ou la planche (`exportTirage`).
  const handleExportPdf = () => exporterTirage(docNode);


  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 min-w-0 relative z-20">
      <div className="flex items-center justify-between gap-3">
        {/* Gauche : actions + titre + (property inline si sélection) */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => onNewLabel?.()}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            title="Nouveau document"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau</span>
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />

          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            title="Annuler (Ctrl/Cmd+Z)"
          >
            <Undo className="h-5 w-5" />
          </button>

          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
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
                          console.log('🔵 Bouton Save cliqué !');
                          onSave?.();
                        }}
                        className="hover:scale-110 transition-transform flex-shrink-0"
                        title="Sauvegarder les modifications"
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
                      console.log('🔵 Bouton Save cliqué !');
                      onSave?.();
                    }}
                    className="hover:scale-110 transition-transform flex-shrink-0"
                    title="Sauvegarder les modifications"
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
          <button
            onClick={handleExportPdf}
            disabled={!docNode}
            className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={!docNode ? 'Document non disponible' : 'Exporter en PDF'}
          >
            <Download className="h-4 w-4" />
            <span>Exporter</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default TopToolbar;
