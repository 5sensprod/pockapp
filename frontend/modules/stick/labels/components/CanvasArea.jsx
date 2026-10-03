import React, { useRef, useEffect, useState, useCallback, forwardRef } from 'react';
import { Maximize2, Eye, EyeOff } from 'lucide-react';
import KonvaCanvas, { MARGE_ESPACE } from './KonvaCanvas';
import PropertyPanel from './PropertyPanel';
import BandeTirage from './BandeTirage';
import useLabelStore from '../store/useLabelStore';

const CanvasArea = forwardRef(
  ({ dataSource, selectedProduct, onDocNodeReady, onOpenEffects, onOpenReglages }, ref) => {
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
    const cadreMasque = useLabelStore((s) => s.cadreMasque);
    const basculerCadreMasque = useLabelStore((s) => s.basculerCadreMasque);

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

    // Le groupe du document : la barre d'options y MESURE les éléments pour
    // les aligner et les distribuer.
    const [docNode, setDocNode] = useState(null);
    const handleDocNodeReady = (node) => {
      setDocNode(node);
      if (onDocNodeReady) onDocNodeReady(node);
    };

    const boutonZoom =
      'h-7 min-w-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-gray-100 dark:bg-gray-900">
        {/* BARRE CONTEXTUELLE, reprise de PocketStick : hauteur FIXE et toujours
            présente. Sélectionner un élément remplit la barre sans rien
            pousser : le canvas ne saute plus. Trop d'options ? elles défilent
            — mais PAS le zoom, épinglé à droite hors de la zone qui défile. */}
        <div className="flex-none h-11 flex items-center gap-3 px-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs">
         <div className="flex-1 min-w-0 h-full flex items-center gap-3 overflow-x-auto overflow-y-hidden">
          {selectedId && (
            <div className="flex-none flex items-center">
              <button
                type="button"
                onClick={basculerCadreMasque}
                aria-pressed={cadreMasque}
                aria-label={cadreMasque ? 'Afficher le cadre de sélection' : 'Masquer le cadre de sélection'}
                title={cadreMasque ? 'Afficher le cadre de sélection (H)' : 'Masquer le cadre de sélection (H)'}
                className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
                  cadreMasque
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {cadreMasque ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
          <div className="flex-none">
            {selectedId ? (
              <PropertyPanel
                selectedProduct={selectedProduct}
                onOpenEffects={onOpenEffects}
                onOpenReglages={onOpenReglages}
                docNode={docNode}
              />
            ) : (
              <span className="text-gray-500 dark:text-gray-400">
                Sélectionnez un élément pour le modifier.
              </span>
            )}
          </div>
         </div>
          <div className="flex-none flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" onClick={zoomOut} className={boutonZoom} title="Zoom arrière (Ctrl + molette)">
              −
            </button>
            {/* Le zoom en cours, et au clic la taille réelle (100 %). */}
            <button
              type="button"
              onClick={resetZoom}
              className={`${boutonZoom} w-14 tabular-nums`}
              title="Revenir à 100 %"
              aria-label={`Zoom ${Math.round(zoom * 100)} %, revenir à 100 %`}
            >
              {Math.round(zoom * 100)} %
            </button>
            <button type="button" onClick={zoomIn} className={boutonZoom} title="Zoom avant (Ctrl + molette)">
              +
            </button>
            <button type="button" onClick={ajuster} className={boutonZoom} title="Ajuster à la fenêtre">
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Zone de travail : elle DÉFILE quand la page zoomée dépasse.
            `scrollbar-gutter: stable` réserve TOUJOURS la place de la barre
            verticale. Sans elle, une boucle : la scène prend la largeur
            visible (`KonvaCanvas`, stageW), la barre verticale apparaît et
            rogne cette largeur, la scène déborde, la barre horizontale
            apparaît, la hauteur visible change, la verticale disparaît… et
            recommence à chaque image : canvas et ascenseurs clignotaient à
            certaines tailles de fenêtre sous 100 %. La largeur visible ne
            dépend plus de la barre verticale, la boucle est rompue. */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0 min-h-0 checkerboard relative overflow-auto"
          style={{ scrollbarGutter: 'stable' }}
        >
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

        {/* Aperçu des pages du tirage (masqué pour une affiche seule) */}
        <BandeTirage />
      </div>
    );
  }
);

CanvasArea.displayName = 'CanvasArea';
export default CanvasArea;
