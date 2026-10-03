// frontend/modules/stick/labels/components/templates/TraceSelectionne.jsx
//
// Les réglages d'un TRACÉ sélectionné (couleur, opacité, fusion, puis le
// trait rejoué sur ses points gardés par `redessiner`), et les petits
// composants de réglage du panneau Dessin. Sorti de `DessinPanel.jsx` pour que
// `ReglagesPanel` l'affiche sans import circulaire.

import React from 'react';
import Curseur from '../ui/Curseur';
import GradientColorPicker from '../GradientColorPicker';
import Interrupteur from '../ui/Interrupteur';
import PastilleCouleur from '../ui/PastilleCouleur';
import { BOUTON_ACTION, LIGNE } from '../ui/styles';
import useLabelStore from '../../store/useLabelStore';
import { DRAW_DEFAULTS, fusionDe, redessiner, REGLAGES_TRACE, STROKE_WIDTH_RANGE } from '../../utils/dessin';

// Libellé, champ numérique et curseur : le curseur commun (`ui/Curseur.jsx`)
export const Reglage = (props) => <Curseur disposition="bloc" champ {...props} />;

export const borne = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));


export const Couleur = ({ label, valeur, onValeur }) => (
  <label className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
    <span>{label}</span>
    {/* La couleur peut porter une opacité (#rrggbbaa, sélecteur de la barre du haut) : on la garde */}
    <PastilleCouleur couleur={valeur} onCouleur={onValeur} label={label} opacite />
  </label>
);

// Tracé sélectionné : couleur, opacité, fusion — et, depuis le lot 6, ses
// réglages de tracé, rejoués sur les points gardés (`redessiner`).
export const TraceSelectionne = ({ el }) => {
  const updateElement = useLabelStore((s) => s.updateElement);
  const setReglagesDessin = useLabelStore((s) => s.setReglagesDessin);
  const set = (attrs) => updateElement(el.id, attrs);
  // Un curseur tenu = un geste d'historique : les clés envoyées sont toujours les mêmes
  const retracer = (maj) => {
    const updates = redessiner(el, maj);
    if (updates) set(updates);
  };
  const pourcent = (cle) => (v) => retracer({ [cle]: borne(v, 0, 100) / 100 });
  const val = (v, defaut = 0) => Math.round((Number.isFinite(v) ? v : defaut) * 100);
  const doux = Number.isFinite(el.smoothing) ? el.smoothing : DRAW_DEFAULTS.smoothing;
  // Le pinceau reprend les réglages de ce trait
  const reprendre = () =>
    setReglagesDessin({
      stroke: el.fill ?? DRAW_DEFAULTS.stroke,
      opacity: Number.isFinite(el.opacity) ? el.opacity : 1,
      brushType: el.brushType ?? 'brush',
      ...Object.fromEntries(REGLAGES_TRACE.filter((c) => Number.isFinite(el[c])).map((c) => [c, el[c]])),
      ...(Number.isFinite(el.stabilisation) ? {} : { stabilisation: 0.7 * doux }),
    });
  return (
    <div className="space-y-3">
      {/* Même sélecteur que les formes (unie, dégradé, texture), même règle
          de remplissage (`dessinTrace` → `remplissage`) */}
      <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
        <span>Couleur du tracé</span>
        <GradientColorPicker
          color={el.fill || '#000000'}
          gradient={el.fillGradient ?? null}
          onColorChange={(c) => set({ fill: c })}
          onGradientChange={(g) => set({ fillGradient: g })}
          title="Couleur du tracé"
        />
      </div>
      <Reglage
        label="Opacité du tracé (%)"
        valeur={Math.round((el.opacity ?? 1) * 100)}
        min={0}
        max={100}
        onValeur={(v) => set({ opacity: borne(v, 0, 100) / 100 })}
      />
      {/* Lot 5 : fusion « produit », celle du surligneur */}
      <div className={LIGNE}>
        <span>Fusion produit (surligneur)</span>
        <Interrupteur
          actif={fusionDe(el) === 'multiply'}
          onActif={(v) => set({ fusion: v ? 'multiply' : null })}
          label="Fusion produit (surligneur)"
        />
      </div>
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Redessiner le trait</div>
        <Reglage
          label="Épaisseur"
          valeur={el.strokeWidth ?? DRAW_DEFAULTS.strokeWidth}
          min={STROKE_WIDTH_RANGE[0]}
          max={STROKE_WIDTH_RANGE[1]}
          onValeur={(v) => retracer({ strokeWidth: borne(Math.round(v), ...STROKE_WIDTH_RANGE) })}
        />
        <Reglage label="Adoucir (%)" valeur={val(el.smoothing, DRAW_DEFAULTS.smoothing)} min={0} max={100} onValeur={pourcent('smoothing')} />
        <Reglage label="Stabiliser (%)" valeur={val(el.stabilisation, 0.7 * doux)} min={0} max={100} onValeur={pourcent('stabilisation')} />
        <Reglage label="Épaisseur variable (%)" valeur={val(el.thinning)} min={0} max={100} onValeur={pourcent('thinning')} />
        <Reglage label="Effiler le début (%)" valeur={val(el.effilementDebut)} min={0} max={100} onValeur={pourcent('effilementDebut')} />
        <Reglage label="Effiler la fin (%)" valeur={val(el.effilementFin)} min={0} max={100} onValeur={pourcent('effilementFin')} />
        <button
          type="button"
          onClick={reprendre}
          className={`${BOUTON_ACTION} w-full`}
        >
          Reprendre ces réglages pour le pinceau
        </button>
      </div>
    </div>
  );
};
