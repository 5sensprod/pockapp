// frontend/modules/stick/labels/components/templates/DessinPanel.jsx
//
// Onglet « Dessin », porté de PocketStick (`panel/sections/draw.jsx`) :
// Sélection / Pinceau / Surligneur, puis les réglages du pinceau. Un tracé
// sélectionné se recolore en changeant son `fill` — ses points sont gardés
// (`utils/dessin.js`), il n'y a pas de SVG à réécrire.
// Un tracé sélectionné affiche ses réglages détaillés (`ReglagesPanel`).

import React, { useEffect } from 'react';
import useLabelStore from '../../store/useLabelStore';
import { brushOptions, STROKE_WIDTH_RANGE, VARIATIONS } from '../../utils/dessin';
import ReglagesPanel from './ReglagesPanel';
import Segments from '../ui/Segments';
import { borne, Couleur, Reglage } from './TraceSelectionne';

const OUTILS = [
  { id: 'selection', label: 'Sélection' },
  { id: 'brush', label: 'Pinceau' },
  { id: 'highlighter', label: 'Surligneur' },
];

export default function DessinPanel({ docNode }) {
  const actif = useLabelStore((s) => s.outilDessin);
  const reglages = useLabelStore((s) => s.reglagesDessin);
  const setOutilDessin = useLabelStore((s) => s.setOutilDessin);
  const setReglagesDessin = useLabelStore((s) => s.setReglagesDessin);
  const selection = useLabelStore((s) =>
    !s.extraIds.length ? s.elements.find((el) => el.id === s.selectedId && el.type === 'dessin') : null,
  );
  const { brushType, stroke, strokeWidth, opacity, smoothing, thinning, variation, stabilisation, simplification } = reglages;

  // Quitter l'onglet rend l'outil Sélection.
  useEffect(() => () => setOutilDessin(false), [setOutilDessin]);

  // Échap revient à la sélection.
  useEffect(() => {
    if (!actif) return undefined;
    const touche = (e) => e.key === 'Escape' && setOutilDessin(false);
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [actif, setOutilDessin]);

  const choisir = (id) => {
    if (id === 'selection') return setOutilDessin(false);
    setOutilDessin(true);
    setReglagesDessin(brushOptions(id, reglages));
  };
  const setEpaisseur = (v) => setReglagesDessin({ strokeWidth: borne(Math.round(v), ...STROKE_WIDTH_RANGE) });
  const setPourcent = (cle) => (v) => setReglagesDessin({ [cle]: borne(v, 0, 100) / 100 });

  return (
    <div className="p-3 space-y-4">
      <Segments
        label="Outil de dessin"
        options={OUTILS}
        valeur={actif ? brushType : 'selection'}
        onValeur={choisir}
      />

      {/* Un tracé sélectionné : TOUS ses réglages (`ReglagesPanel`), à la place
          de ceux du pinceau */}
      {!actif && selection ? (
        <ReglagesPanel nu docNode={docNode} />
      ) : (
        <fieldset className="space-y-3 disabled:opacity-50" disabled={!actif}>
          <Reglage label="Épaisseur" valeur={strokeWidth} min={STROKE_WIDTH_RANGE[0]} max={STROKE_WIDTH_RANGE[1]} onValeur={setEpaisseur} />
          <Couleur label="Couleur" valeur={stroke} onValeur={(v) => setReglagesDessin({ stroke: v })} />
          <Reglage label="Opacité (%)" valeur={Math.round(opacity * 100)} min={0} max={100} onValeur={setPourcent('opacity')} />
          <Reglage label="Adoucir le tracé (%)" valeur={Math.round(smoothing * 100)} min={0} max={100} onValeur={setPourcent('smoothing')} />
          {/* Lot 3 : l'inertie n'est plus liée à l'adoucissement */}
          <Reglage label="Stabiliser (%)" valeur={Math.round(stabilisation * 100)} min={0} max={100} onValeur={setPourcent('stabilisation')} />
          <Reglage label="Simplifier au relâchement (%)" valeur={Math.round(simplification * 100)} min={0} max={100} onValeur={setPourcent('simplification')} />
          {/* Lot 4 : effilement, 100 % = 10 fois l'épaisseur */}
          <Reglage label="Effiler le début (%)" valeur={Math.round((reglages.effilementDebut ?? 0) * 100)} min={0} max={100} onValeur={setPourcent('effilementDebut')} />
          <Reglage label="Effiler la fin (%)" valeur={Math.round((reglages.effilementFin ?? 0) * 100)} min={0} max={100} onValeur={setPourcent('effilementFin')} />
          <Reglage label="Épaisseur variable (%)" valeur={Math.round(thinning * 100)} min={0} max={100} onValeur={setPourcent('thinning')} />
          <div>
            <div className="text-xs text-gray-700 dark:text-gray-300 mb-1">Varie selon</div>
            <Segments
              label="L'épaisseur varie selon"
              options={VARIATIONS}
              valeur={variation}
              onValeur={(v) => setReglagesDessin({ variation: v })}
            />
            {variation === 'stylet' && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {thinning > 0
                  ? 'Au stylet, la pression règle l’épaisseur ; souris et doigt restent selon la vitesse.'
                  : 'Montez « Épaisseur variable » pour que la pression ait un effet.'}
              </p>
            )}
          </div>
        </fieldset>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Chaque trait devient un élément recolorable ; Maj trace un trait droit, Ctrl+Z l'annule, Échap revient à la sélection.
      </p>
    </div>
  );
}
