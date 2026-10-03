// frontend/modules/stick/labels/components/templates/EffectsTemplates.jsx
//
// Onglet « Effets » : ce qui s'applique à l'élément sélectionné quel que soit
// son type — ombre portée, ombre interne, flou, ondulation — et, pour une
// image, les effets d'image. Un effet = une section, son interrupteur dans
// l'en-tête, son détail seulement quand il est actif (`ui/Section.jsx`).
//
// Les clés écrites, leurs bornes et leurs pas sont ceux d'avant la refonte
// du 3 octobre 2026 : le rendu (`utils/effetsKonva.js`, `ondulation.js`,
// `effetsImage.js`) et les exports ne changent pas. `blurFade` et
// `ondulationEffet` sont des OBJETS : chaque écriture rend l'objet entier.

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { redessiner } from '../../utils/dessin';
import { ciblesDe, majDeSelection } from '../../utils/majSelection';
import { FLOU_MAX } from '../../utils/effetsKonva';
import { EFFECTS, sanitizeFilters, setEffectIntensity, toggleEffect } from '../../utils/effetsImage';
import {
  AMPLITUDE_MAX,
  LONGUEUR_MAX,
  LONGUEUR_MIN,
  ONDULATION_DEFAUT,
  SENS_ONDULATION,
} from '../../utils/ondulation';
import Curseur from '../ui/Curseur';
import Interrupteur from '../ui/Interrupteur';
import Section from '../ui/Section';
import Segments from '../ui/Segments';
import BlocOmbre from './BlocOmbre';

const NOMS = { dessin: 'Tracé', shape: 'Forme', text: 'Texte', image: 'Image', qrcode: 'QR code', barcode: 'Code-barres', fiche: 'Fiche' };
const FONDU_DEFAUT = { angle: 180, from: 0.3, to: 0.8 };
const pourcent = (v) => `${Math.round(v * 100)} %`;

// Une option qui s'active, sur une ligne : libellé et interrupteur
const Option = ({ label, actif, onActif }) => (
  <div className="min-h-7 flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300">
    <span>{label}</span>
    <Interrupteur actif={actif} onActif={onActif} label={label} />
  </div>
);

// Un effet d'image réglable : son interrupteur, puis son intensité quand il est actif
const EffetImage = ({ label, actif, valeur, min, max, onActif, onValeur }) => (
  <div>
    <Option label={label} actif={actif} onActif={onActif} />
    {actif && (
      <Curseur
        label="Intensité"
        largeurLabel="w-14"
        min={min}
        max={max}
        step={0.01}
        valeur={valeur}
        affichage={(v) => Math.round(v * 100)}
        onValeur={onValeur}
      />
    )}
  </div>
);

const EffectsTemplates = () => {
  const el = useLabelStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);
  const nombre = useLabelStore((s) => ciblesDe(s, s.elements.find((e) => e.id === s.selectedId) ?? null, false).length);

  if (!el) {
    return (
      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
        Sélectionnez un élément sur la page pour lui donner une ombre, un flou ou une ondulation.
      </p>
    );
  }

  // Un effet vaut pour TOUTE la sélection, quel que soit le type, en un seul
  // pas d'historique (`utils/majSelection.js`) ; un effet d'image, pour les
  // images sélectionnées seulement.
  const appliquer = (m, memeType) => {
    const etat = useLabelStore.getState();
    etat.updateElements(majDeSelection(etat, el, m, { memeType, redessiner }));
  };
  const maj = (m) => appliquer(m, false);
  const majImage = (m) => appliquer(m, true);
  const flou = el.blurRadius ?? 10;
  const fondu = el.blurFade ?? null;
  const onde = el.ondulationEffet ?? null;
  const onduler = (m) => maj({ ondulationEffet: { ...ONDULATION_DEFAUT, ...onde, ...m } });

  return (
    <div className="px-3 pb-3">
      <div className="py-2 text-xs text-gray-500 dark:text-gray-400">Effets — {NOMS[el.type] ?? 'élément'}{nombre > 1 && ` et ${nombre - 1} autre${nombre > 2 ? 's' : ''}, réglés ensemble`}</div>

      {/* Ombre portée, puis ombre interne (`ombreInterneDe`, `utils/effetsKonva.js` :
          le bord projette son ombre vers l'intérieur) — le même bloc */}
      <BlocOmbre el={el} maj={maj} />
      <BlocOmbre el={el} maj={maj} interne />

      {/* Flou de l'élément entier (`utils/effetsKonva.js`), repris de PocketStick */}
      <Section
        titre="Flou"
        actif={!!el.blurEnabled}
        onActif={(v) => maj({ blurEnabled: v, blurRadius: el.blurRadius ?? 10 })}
        aide="Floute l’élément entier."
      >
        <Curseur
          label="Intensité"
          largeurLabel="w-14"
          max={Math.min(FLOU_MAX, 100)}
          valeur={flou}
          affichage={(v) => `${v} px`}
          defaut={10}
          onValeur={(blurRadius) => maj({ blurRadius })}
        />
        {/* Dégradé de flou (`fonduFlou`) : net d'un côté, flou de l'autre */}
        <Option
          label="Dégradé (net → flou)"
          actif={!!fondu}
          onActif={(v) => maj({ blurFade: v ? { ...FONDU_DEFAUT } : null })}
        />
        {fondu &&
          [
            ['angle', 'Direction', 0, 359, 1, (v) => `${v}°`],
            ['from', 'Début du flou', 0, 1, 0.01, pourcent],
            ['to', 'Flou complet', 0, 1, 0.01, pourcent],
          ].map(([cle, label, min, max, step, format]) => (
            <Curseur
              key={cle}
              label={label}
              largeurLabel="w-24"
              min={min}
              max={max}
              step={step}
              valeur={fondu[cle]}
              affichage={format}
              defaut={FONDU_DEFAUT[cle]}
              onValeur={(v) => maj({ blurFade: { ...fondu, [cle]: v } })}
            />
          ))}
      </Section>

      {/* Ondulation de l'élément entier, en pixels (`utils/ondulation.js`) */}
      <Section
        titre="Ondulation de l’élément"
        actif={!!onde}
        onActif={(v) => maj({ ondulationEffet: v ? { ...ONDULATION_DEFAUT } : null })}
        aide="Fait onduler l’élément entier, comme une vague."
      >
        {onde && (
          <>
            <Segments
              label="Sens de l'ondulation"
              options={SENS_ONDULATION}
              valeur={onde.sens ?? 'horizontal'}
              onValeur={(sens) => onduler({ sens })}
            />
            {[
              ['amplitude', 'Amplitude', 0, AMPLITUDE_MAX],
              ['longueur', 'Longueur d’onde', LONGUEUR_MIN, LONGUEUR_MAX],
            ].map(([cle, label, min, max]) => (
              <Curseur
                key={cle}
                label={label}
                largeurLabel="w-24"
                min={min}
                max={max}
                valeur={onde[cle] ?? ONDULATION_DEFAUT[cle]}
                affichage={(v) => `${v} px`}
                defaut={ONDULATION_DEFAUT[cle]}
                onValeur={(v) => onduler({ [cle]: v })}
              />
            ))}
          </>
        )}
      </Section>

      {/* Effets d'image, repris de PocketStick (`utils/effetsImage.js`) */}
      {el.type === 'image' && (
        <Section titre="Effets d’image">
          {[
            ['sepiaEnabled', 'Sépia'],
            ['grayscaleEnabled', 'Noir et blanc'],
          ].map(([cle, label]) => (
            <Option key={cle} label={label} actif={!!el[cle]} onActif={(v) => majImage({ [cle]: v })} />
          ))}
          <EffetImage
            label="Luminosité"
            actif={!!el.brightnessEnabled}
            valeur={el.brightness ?? 0}
            min={-1}
            max={1}
            onActif={(v) => majImage({ brightnessEnabled: v, brightness: el.brightness ?? 0.2 })}
            onValeur={(brightness) => majImage({ brightness })}
          />
          {EFFECTS.map((effet) => {
            const courant = (sanitizeFilters(el.filters) || {})[effet.name];
            return (
              <EffetImage
                key={effet.name}
                label={effet.label}
                actif={!!courant}
                valeur={courant?.intensity ?? effet.initial}
                min={effet.range[0]}
                max={effet.range[1]}
                onActif={(v) => majImage({ filters: toggleEffect(el.filters, effet.name, v) })}
                onValeur={(v) => majImage({ filters: setEffectIntensity(el.filters, effet.name, v) })}
              />
            );
          })}
        </Section>
      )}
    </div>
  );
};

export default EffectsTemplates;
