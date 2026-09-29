// frontend/modules/stick/labels/components/templates/DessinPanel.jsx
//
// Onglet « Dessin », porté de PocketStick (`panel/sections/draw.jsx`) :
// Sélection / Pinceau / Surligneur, puis les réglages du pinceau. Un tracé
// sélectionné se recolore en changeant son `fill` — ses points sont gardés
// (`utils/dessin.js`), il n'y a pas de SVG à réécrire.

import React, { useEffect } from 'react';
import useLabelStore from '../../store/useLabelStore';
import { brushOptions, STROKE_WIDTH_RANGE, VARIATIONS } from '../../utils/dessin';

const OUTILS = [
  { id: 'selection', label: 'Sélection' },
  { id: 'brush', label: 'Pinceau' },
  { id: 'highlighter', label: 'Surligneur' },
];

const borne = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));

// Libellé, champ numérique et curseur, comme PocketStick (Field + RangeInput).
const Reglage = ({ label, valeur, min, max, onValeur }) => (
  <div>
    <label className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={valeur}
        onChange={(e) => onValeur(parseFloat(e.target.value))}
        className="w-16 px-1 py-0.5 text-right border rounded dark:bg-gray-800 dark:border-gray-600"
      />
    </label>
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={1}
      value={valeur}
      onChange={(e) => onValeur(parseFloat(e.target.value))}
      className="w-full h-2 mt-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
    />
  </div>
);

const Couleur = ({ label, valeur, onValeur }) => (
  <label className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
    <span>{label}</span>
    <input type="color" aria-label={label} value={valeur} onChange={(e) => onValeur(e.target.value)} className="w-10 h-6" />
  </label>
);

// Tracé sélectionné : couleur et opacité.
const TraceSelectionne = ({ el }) => {
  const updateElement = useLabelStore((s) => s.updateElement);
  const set = (attrs) => updateElement(el.id, attrs);
  return (
    <div className="space-y-3">
      <Couleur label="Couleur du tracé" valeur={el.fill ?? '#000000'} onValeur={(v) => set({ fill: v })} />
      <Reglage
        label="Opacité du tracé (%)"
        valeur={Math.round((el.opacity ?? 1) * 100)}
        min={0}
        max={100}
        onValeur={(v) => set({ opacity: borne(v, 0, 100) / 100 })}
      />
    </div>
  );
};

export default function DessinPanel() {
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
      <div className="flex gap-1" role="group" aria-label="Outil de dessin">
        {OUTILS.map((o) => {
          const presse = o.id === 'selection' ? !actif : actif && brushType === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={presse}
              onClick={() => choisir(o.id)}
              className={`flex-1 px-2 py-1.5 text-xs rounded border ${
                presse
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {!actif && selection ? (
        <TraceSelectionne el={selection} />
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
            <div className="flex gap-1" role="group" aria-label="L'épaisseur varie selon">
              {VARIATIONS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={variation === v.id}
                  onClick={() => setReglagesDessin({ variation: v.id })}
                  className={`flex-1 px-2 py-1 text-xs rounded border ${
                    variation === v.id
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
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
