// frontend/modules/stick/labels/components/templates/TraceSelectionne.jsx
//
// Les réglages d'un TRACÉ sélectionné, et les petits composants de réglage du
// panneau Dessin (`Reglage`, `Couleur`, `borne`, pour le pinceau).
//
// - `NoyauTrace` : ce qu'on change souvent — couleur, épaisseur, opacité,
//   fusion — en rangées serrées ;
// - `TraitTrace` : la forme du trait (adoucir, stabiliser, variation,
//   effilements), section repliée.
// Tout réglage qui change le contour passe par `redessiner` (les points gardés
// sont rejoués, le cadre recalculé) ; `maj` vient du panneau et vaut pour tous
// les tracés sélectionnés.

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
    {/* La couleur peut porter une opacité (#rrggbbaa) : on la garde */}
    <PastilleCouleur couleur={valeur} onCouleur={onValeur} label={label} opacite />
  </label>
);

const pourcent = (v) => `${v} %`;
const val = (v, defaut = 0) => Math.round((Number.isFinite(v) ? v : defaut) * 100);
// Un curseur tenu = un geste d'historique : les clés envoyées sont toujours les mêmes
const retracer = (el, maj) => (m) => {
  const updates = redessiner(el, m);
  if (updates) maj(updates);
};

/** Couleur, épaisseur, opacité, fusion. */
export const NoyauTrace = ({ el, maj }) => (
  <div className="space-y-2">
    {/* Même sélecteur que les formes (unie, dégradé, texture), même règle de
        remplissage (`dessinTrace` → `remplissage`) */}
    <div className={LIGNE}>
      <span className="text-gray-500 dark:text-gray-400">Couleur</span>
      <GradientColorPicker
        color={el.fill || '#000000'}
        gradient={el.fillGradient ?? null}
        onColorChange={(c) => maj({ fill: c })}
        onGradientChange={(g) => maj({ fillGradient: g })}
        title="Couleur du tracé"
      />
    </div>
    <Curseur
      label="Épaisseur"
      largeurLabel="w-20"
      min={STROKE_WIDTH_RANGE[0]}
      max={STROKE_WIDTH_RANGE[1]}
      valeur={el.strokeWidth ?? DRAW_DEFAULTS.strokeWidth}
      affichage={(v) => `${v} px`}
      onValeur={(v) => retracer(el, maj)({ strokeWidth: borne(Math.round(v), ...STROKE_WIDTH_RANGE) })}
    />
    <Curseur
      label="Opacité"
      largeurLabel="w-20"
      valeur={Math.round((el.opacity ?? 1) * 100)}
      affichage={pourcent}
      defaut={100}
      onValeur={(v) => maj({ opacity: borne(v, 0, 100) / 100 })}
    />
    {/* Fusion « produit », celle du surligneur : il fonce ce qu'il recouvre */}
    <div className={LIGNE}>
      <span className="text-gray-500 dark:text-gray-400">Fusion surligneur</span>
      <Interrupteur
        actif={fusionDe(el) === 'multiply'}
        onActif={(v) => maj({ fusion: v ? 'multiply' : null })}
        label="Fusion produit (surligneur)"
      />
    </div>
  </div>
);

/** La forme du trait, rejouée sur les points gardés. */
export const TraitTrace = ({ el, maj }) => {
  const setReglagesDessin = useLabelStore((s) => s.setReglagesDessin);
  const doux = Number.isFinite(el.smoothing) ? el.smoothing : DRAW_DEFAULTS.smoothing;
  const regler = (cle) => (v) => retracer(el, maj)({ [cle]: borne(v, 0, 100) / 100 });
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
    <div className="space-y-2">
      {[
        ['smoothing', 'Adoucir', val(el.smoothing, DRAW_DEFAULTS.smoothing)],
        ['stabilisation', 'Stabiliser', val(el.stabilisation, 0.7 * doux)],
        ['thinning', 'Variation', val(el.thinning)],
        ['effilementDebut', 'Effiler début', val(el.effilementDebut)],
        ['effilementFin', 'Effiler fin', val(el.effilementFin)],
      ].map(([cle, label, valeur]) => (
        <Curseur key={cle} label={label} largeurLabel="w-20" valeur={valeur} affichage={pourcent} onValeur={regler(cle)} />
      ))}
      <button type="button" onClick={reprendre} className={`${BOUTON_ACTION} w-full`} title="Le pinceau prendra la couleur et les réglages de ce tracé">
        Reprendre pour le pinceau
      </button>
    </div>
  );
};
