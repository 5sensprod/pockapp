// frontend/modules/stick/labels/components/EtiquetteSelection.jsx
//
// ÉTIQUETTE accrochée au cadre de sélection : copier le style, coller le style,
// et la profondeur (avancer, reculer, premier plan, arrière-plan) — raccourci
// du panneau Calques. HTML posé PAR-DESSUS le Stage, dans le même conteneur
// qui défile : ses coordonnées sont celles du Stage. Sous le cadre (au-dessus
// il y a la poignée de rotation), au-dessus s'il n'y a pas la place. Masquée
// pendant un déplacement ou une transformation, un recadrage, ou quand le
// cadre est masqué (touche H).
//
// Raccourcis : Ctrl+Alt+C copie le style, Ctrl+Alt+V le colle.
// Règles du style et de la profondeur : `utils/styleCopie.js`.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BringToFront,
  Layers,
  PaintBucket,
  Paintbrush,
  SendToBack,
} from 'lucide-react';
import useLabelStore, { idsSelectionnes } from '../store/useLabelStore';

const HAUTEUR = 34;
const ECART = 12;
const ROTATION = 30 + 16; // poignée de rotation du Transformer, plus marge

const saisieEnCours = (cible) =>
  cible?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName);

const EtiquetteSelection = ({ stageRef, transformerRef }) => {
  const selectedId = useLabelStore((s) => s.selectedId);
  const extraIds = useLabelStore((s) => s.extraIds);
  const elements = useLabelStore((s) => s.elements);
  const zoom = useLabelStore((s) => s.zoom);
  const cropId = useLabelStore((s) => s.cropId);
  const cadreMasque = useLabelStore((s) => s.cadreMasque || s.cadreMasqueGeste);
  const styleCopie = useLabelStore((s) => s.styleCopie);

  const [cadre, setCadre] = useState(null);
  const [geste, setGeste] = useState(false);
  const [calques, setCalques] = useState(false);
  const racine = useRef(null);

  const ids = idsSelectionnes({ selectedId, extraIds, elements });

  const mesurer = useCallback(() => {
    const tr = transformerRef.current;
    const nodes = tr?.nodes() ?? [];
    if (!nodes.length) return setCadre(null);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of nodes) {
      const r = n.getClientRect();
      x1 = Math.min(x1, r.x);
      y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.width);
      y2 = Math.max(y2, r.y + r.height);
    }
    setCadre({ x1, y1, x2, y2 });
  }, [transformerRef]);

  // Après chaque changement : l'image suivante, quand le Transformer a pris
  // ses nœuds (il les reçoit dans un effet de KonvaCanvas).
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(mesurer);
    const t = setTimeout(mesurer, 120); // police chargée, texte re-mesuré
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [mesurer, selectedId, extraIds, elements, zoom]);

  // Pendant un geste : masquée ; à la fin : re-mesurée.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const debut = () => {
      setGeste(true);
      setCalques(false);
    };
    const fin = () => {
      setGeste(false);
      requestAnimationFrame(mesurer);
    };
    stage.on('dragstart.etiquette transformstart.etiquette', debut);
    stage.on('dragend.etiquette transformend.etiquette', fin);
    return () => stage.off('.etiquette');
  }, [stageRef, mesurer]);

  // Fermer le menu Calques au clic extérieur
  useEffect(() => {
    if (!calques) return undefined;
    const clic = (e) => !racine.current?.contains(e.target) && setCalques(false);
    document.addEventListener('pointerdown', clic, true);
    return () => document.removeEventListener('pointerdown', clic, true);
  }, [calques]);

  // Ctrl+Alt+C / Ctrl+Alt+V
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey || saisieEnCours(e.target)) return;
      const touche = e.key.toLowerCase();
      if (touche !== 'c' && touche !== 'v') return;
      const state = useLabelStore.getState();
      const sel = idsSelectionnes(state);
      if (!sel.length) return;
      e.preventDefault();
      if (touche === 'c') state.copierStyle(state.selectedId);
      else state.collerStyle(sel);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ids.length || !cadre || geste || cropId || cadreMasque) return null;

  const stage = stageRef.current;
  const hauteurStage = stage?.height() ?? Infinity;
  const largeurStage = stage?.width() ?? Infinity;
  const enDessous = cadre.y2 + ECART + HAUTEUR <= hauteurStage;
  const top = enDessous ? cadre.y2 + ECART : Math.max(0, cadre.y1 - ROTATION - HAUTEUR);
  const centre = (cadre.x1 + cadre.x2) / 2;
  const left = Math.max(4, Math.min(centre, largeurStage - 4));

  const { copierStyle, collerStyle, deplacerEnProfondeur } = useLabelStore.getState();
  const bouton =
    'h-7 w-7 flex items-center justify-center rounded text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none';
  const ligneMenu =
    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700';
  const profondeur = (sens) => () => deplacerEnProfondeur(ids, sens);

  return (
    <div
      ref={racine}
      className="absolute z-10 -translate-x-1/2 flex items-center gap-0.5 p-0.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md select-none"
      style={{ top, left, height: HAUTEUR }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={bouton}
        onClick={() => copierStyle(selectedId)}
        title="Copier le style (Ctrl+Alt+C)"
      >
        <Paintbrush className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={bouton}
        onClick={() => collerStyle(ids)}
        disabled={!styleCopie}
        title={styleCopie ? 'Coller le style (Ctrl+Alt+V)' : 'Aucun style copié'}
      >
        <PaintBucket className="h-4 w-4" />
      </button>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
      <div className="relative">
        <button
          type="button"
          className={`${bouton} ${calques ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
          onClick={() => setCalques((o) => !o)}
          aria-expanded={calques}
          title="Profondeur (calques)"
        >
          <Layers className="h-4 w-4" />
        </button>
        {calques && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-44 py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg ${
              enDessous ? 'top-full mt-1' : 'bottom-full mb-1'
            }`}
          >
            <button type="button" className={ligneMenu} onClick={profondeur('avant')}>
              <ArrowUp className="h-3.5 w-3.5" /> Avancer
            </button>
            <button type="button" className={ligneMenu} onClick={profondeur('arriere')}>
              <ArrowDown className="h-3.5 w-3.5" /> Reculer
            </button>
            <button type="button" className={ligneMenu} onClick={profondeur('devant')}>
              <BringToFront className="h-3.5 w-3.5" /> Premier plan
            </button>
            <button type="button" className={ligneMenu} onClick={profondeur('derriere')}>
              <SendToBack className="h-3.5 w-3.5" /> Arrière-plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EtiquetteSelection;
