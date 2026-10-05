// frontend/modules/stick/labels/components/templates/DessinPanel.jsx
//
// Onglet « Dessin », porté de PocketStick (`panel/sections/draw.jsx`) :
// Sélection / Pinceau / Surligneur, puis les réglages du pinceau. Un tracé
// sélectionné se recolore en changeant son `fill` — ses points sont gardés
// (`utils/dessin.js`), il n'y a pas de SVG à réécrire.
// Un tracé sélectionné affiche ses réglages détaillés (`ReglagesPanel`).
//
// LE PINCEAU ET LE TRACÉ SE RÈGLENT PAREIL depuis le 3 octobre 2026 : un noyau
// (couleur, épaisseur, opacité) puis « Forme du trait », repliée — les mots et
// la disposition de `TraceSelectionne`. Avant, neuf curseurs en bloc (~670 px)
// et deux noms pour chaque réglage (« Adoucir le tracé (%) » ici, « Adoucir »
// là). Mêmes clés de `setReglagesDessin`, mêmes bornes.

import React, { useEffect } from 'react';
import useLabelStore from '../../store/useLabelStore';
import { brushOptions, STROKE_WIDTH_RANGE, VARIATIONS } from '../../utils/dessin';
import ReglagesPanel from './ReglagesPanel';
import Curseur from '../ui/Curseur';
import Section from '../ui/Section';
import Segments from '../ui/Segments';
import { AIDE, PANNEAU } from '../ui/styles';
import { borne, Couleur, pourcent } from './TraceSelectionne';

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

  // Un réglage en pourcentage, écrit de 0 à 1 dans le store
  const curseur = (cle, label, valeur) => (
    <Curseur key={cle} label={label} largeurLabel="w-20" valeur={Math.round(valeur * 100)} affichage={pourcent} onValeur={setPourcent(cle)} />
  );

  return (
    <div className={PANNEAU}>
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
        <fieldset className="disabled:opacity-50" disabled={!actif}>
          <div className="space-y-2 pb-3">
            <Couleur label="Couleur" valeur={stroke} onValeur={(v) => setReglagesDessin({ stroke: v })} />
            <Curseur
              label="Épaisseur"
              largeurLabel="w-20"
              min={STROKE_WIDTH_RANGE[0]}
              max={STROKE_WIDTH_RANGE[1]}
              valeur={strokeWidth}
              affichage={(v) => `${v} px`}
              onValeur={setEpaisseur}
            />
            {curseur('opacity', 'Opacité', opacity)}
          </div>
          <Section titre="Forme du trait" ouvertParDefaut={false}>
            <div className="space-y-2">
              {curseur('smoothing', 'Adoucir', smoothing)}
              {/* L'inertie n'est pas liée à l'adoucissement */}
              {curseur('stabilisation', 'Stabiliser', stabilisation)}
              {/* Au relâchement du trait */}
              {curseur('simplification', 'Simplifier', simplification)}
              {curseur('thinning', 'Variation', thinning)}
              {/* « Pression du stylet » ne tient pas à côté d'un libellé : dessous */}
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                <span>Varie selon</span>
                <Segments
                  label="L'épaisseur varie selon"
                  options={VARIATIONS}
                  valeur={variation}
                  onValeur={(v) => setReglagesDessin({ variation: v })}
                />
              </div>
              {variation === 'stylet' && (
                <p className={AIDE}>
                  {thinning > 0
                    ? 'Au stylet, la pression règle l’épaisseur ; souris et doigt restent selon la vitesse.'
                    : 'Montez « Variation » pour que la pression ait un effet.'}
                </p>
              )}
              {/* Effilement : 100 % = 10 fois l'épaisseur */}
              {curseur('effilementDebut', 'Effiler début', reglages.effilementDebut ?? 0)}
              {curseur('effilementFin', 'Effiler fin', reglages.effilementFin ?? 0)}
            </div>
          </Section>
        </fieldset>
      )}

      <p className={AIDE}>Maj : trait droit · Échap : sélection</p>
    </div>
  );
}
