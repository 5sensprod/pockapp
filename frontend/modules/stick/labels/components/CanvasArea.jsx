import React, { useRef, useEffect, useState, forwardRef } from 'react';
import { Maximize2 } from 'lucide-react';
import KonvaCanvas from './KonvaCanvas';
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
        const cr = entries[0].contentRect;
        setViewport({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
      });

      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const handleDocNodeReady = (node) => {
      if (onDocNodeReady) onDocNodeReady(node);
    };

    const handleRecenter = () => {
      resetZoom();
    };

    return (
      <div className="flex-1 flex flex-col bg-gray-100 dark:bg-gray-900 relative overflow-hidden">
        <div ref={containerRef} className="flex-1 checkerboard relative">
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

        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-gray-800/95 backdrop-blur rounded-lg shadow-lg px-3 py-2 flex items-center gap-3 border border-gray-200 dark:border-gray-700 z-30">
          <button
            onClick={zoomOut}
            className="px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded font-bold text-gray-700 dark:text-gray-300"
            title="Zoom arrière"
          >
            −
          </button>
          <button
            onClick={resetZoom}
            className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded min-w-[60px]"
            title="Réinitialiser le zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            className="px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded font-bold text-gray-700 dark:text-gray-300"
            title="Zoom avant"
          >
            +
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

          <button
            onClick={handleRecenter}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Recentrer le document"
          >
            <Maximize2 className="h-4 w-4 text-gray-700 dark:text-gray-300" />
          </button>

          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 select-none">
            Molette : zoom • Bouton milieu : déplacement
          </span>
        </div>
      </div>
    );
  }
);

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
