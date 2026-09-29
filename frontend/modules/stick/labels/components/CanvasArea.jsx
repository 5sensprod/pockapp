import React, { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import { Maximize2 } from 'lucide-react';
import KonvaCanvas, { MARGE_ESPACE } from './KonvaCanvas';
import PropertyPanel from './PropertyPanel';
import useLabelStore from '../store/useLabelStore';

const CanvasArea = forwardRef(
  ({ dataSource, selectedProduct, onDocNodeReady, onOpenEffects }, ref) => {
    const zoom = useLabelStore((s) => s.zoom);
    const canvasSize = useLabelStore((s) => s.canvasSize);
    const zoomIn = useLabelStore((s) => s.zoomIn);
    const zoomOut = useLabelStore((s) => s.zoomOut);
    const resetZoom = useLabelStore((s) => s.resetZoom);

    const containerRef = useRef(null);
    const [viewport, setViewport] = useState({ width: 0, height: 0 });

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const ro = new ResizeObserver((entries) => {
        // clientWidth/Height : la place VISIBLE, barres de défilement déduites.
        setViewport({ width: el.clientWidth, height: el.clientHeight });
      });

      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const setZoom = useLabelStore((s) => s.setZoom);
    const selectedId = useLabelStore((s) => s.selectedId);

    // Zoom « ajusté » : la page entière dans la zone visible, marge comprise.
    // Comme PocketStick, c'est l'état d'arrivée et celui d'un nouveau format.
    const ajuster = useCallback(() => {
      if (!viewport.width || !viewport.height) return;
      setZoom(
        Math.min(
          (viewport.width - MARGE_ESPACE * 2) / canvasSize.width,
          (viewport.height - MARGE_ESPACE * 2) / canvasSize.height
        )
      );
    }, [viewport.width, viewport.height, canvasSize.width, canvasSize.height, setZoom]);

    const dejaAjuste = useRef(null);
    useEffect(() => {
      const cle = `${canvasSize.width}x${canvasSize.height}`;
      if (!viewport.width || dejaAjuste.current === cle) return;
      dejaAjuste.current = cle;
      ajuster();
    }, [viewport.width, canvasSize.width, canvasSize.height, ajuster]);

    const handleDocNodeReady = (node) => {
      if (onDocNodeReady) onDocNodeReady(node);
    };

    const boutonZoom =
      'h-7 min-w-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-gray-100 dark:bg-gray-900">
        {/* BARRE CONTEXTUELLE, reprise de PocketStick : hauteur FIXE et toujours
            présente. Sélectionner un élément remplit la barre sans rien
            pousser : le canvas ne saute plus. Trop d'options ? elle défile. */}
        <div className="flex-none h-11 flex items-center gap-3 px-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs overflow-x-auto overflow-y-hidden">
          <div className="flex-none">
            {selectedId ? (
              <PropertyPanel selectedProduct={selectedProduct} onOpenEffects={onOpenEffects} />
            ) : (
              <span className="text-gray-500 dark:text-gray-400">
                Sélectionnez un élément pour le modifier.
              </span>
            )}
          </div>
          <span className="flex-1" />
          <div className="flex-none flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" onClick={zoomOut} className={boutonZoom} title="Zoom arrière (Ctrl + molette)">
              −
            </button>
            <span className="w-12 text-center tabular-nums text-gray-700 dark:text-gray-300">
              {Math.round(zoom * 100)} %
            </span>
            <button type="button" onClick={zoomIn} className={boutonZoom} title="Zoom avant (Ctrl + molette)">
              +
            </button>
            <button type="button" onClick={resetZoom} className={boutonZoom} title="Taille réelle">
              100 %
            </button>
            <button type="button" onClick={ajuster} className={boutonZoom} title="Ajuster à la fenêtre">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Zone de travail : elle DÉFILE quand la page zoomée dépasse. */}
        <div ref={containerRef} className="flex-1 min-w-0 min-h-0 checkerboard relative overflow-auto">
          <KonvaCanvas
            ref={ref}
            viewportWidth={viewport.width}
            viewportHeight={viewport.height}
            docWidth={canvasSize.width}
            docHeight={canvasSize.height}
            zoom={zoom}
            onDocNode={handleDocNodeReady}
          />
        </div>
      </div>
    );
  }
);

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
