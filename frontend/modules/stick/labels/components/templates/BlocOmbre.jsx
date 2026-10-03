// frontend/modules/stick/labels/components/templates/BlocOmbre.jsx
//
// UNE OMBRE dans l'onglet Effets — portée, ou interne (`interne`) :
// interrupteur dans l'en-tête, préréglages en vignettes, puis un PAVÉ qui est
// aussi l'aperçu — on glisse la poignée, l'ombre du petit carré suit, avec le
// flou, l'opacité et la couleur. Quatre curseurs empilés (dont un pour X, un
// pour Y) avant.
//
// Rien ne change au rendu : MÊMES clés (`shadow*`, `innerShadow*`), mêmes
// bornes, mêmes défauts (`utils/presetsOmbre.js`). Deux règles d'écriture :
// - le décalage s'écrit TOUJOURS X et Y ensemble, depuis le pavé comme depuis
//   un champ : la clé du geste ne change pas, un glisser fait un seul pas
//   d'annulation ;
// - un préréglage pose les six clés d'un coup.

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { polaire, MARGE } from '../../utils/pave2D';
import {
  OMBRE_INTERNE,
  OMBRE_PORTEE,
  PRESETS_OMBRE,
  PRESETS_OMBRE_INTERNE,
  filtreApercu,
  ombreDe,
  ombreDuPreset,
  ombreInterneApercu,
} from '../../utils/presetsOmbre';
import ChampNombre from '../ui/ChampNombre';
import Curseur from '../ui/Curseur';
import Pave2D from '../ui/Pave2D';
import Section from '../ui/Section';

const TAILLE = 112;

// Le petit carré qui porte l'ombre : dessous pour une portée, dedans pour une interne
const Apercu = ({ ombre, interne, echelle, taille }) =>
  interne ? (
    <span
      className={`${taille} rounded bg-white border border-gray-200 dark:border-gray-600`}
      style={{ boxShadow: ombreInterneApercu(ombre, echelle) }}
    />
  ) : (
    <span className={`${taille} rounded bg-white`} style={{ filter: filtreApercu(ombre, echelle) }} />
  );

const BlocOmbre = ({ el, interne = false }) => {
  const updateElement = useLabelStore((s) => s.updateElement);
  const variante = interne ? OMBRE_INTERNE : OMBRE_PORTEE;
  const { cles, bornes, defaut } = variante;
  const presets = interne ? PRESETS_OMBRE_INTERNE : PRESETS_OMBRE;
  const ombre = ombreDe(el, variante);
  // Pixels d'écran par unité de décalage : l'ombre de l'aperçu tombe sous la poignée
  const echelle = (TAILLE - 2 * MARGE) / 2 / bornes.decalage;
  const maj = (m) => updateElement(el.id, m);
  const decaler = ({ x, y }) => maj({ [cles.x]: x, [cles.y]: y });
  const { angle, distance } = polaire(ombre.x, ombre.y);

  // Comme avant : un `updateElement` par élément (un pas d'annulation chacun)
  const appliquerATous = () => {
    const valeurs = {
      [cles.actif]: ombre.actif,
      [cles.couleur]: ombre.couleur,
      [cles.opacite]: ombre.opacite,
      [cles.flou]: ombre.flou,
      [cles.x]: ombre.x,
      [cles.y]: ombre.y,
    };
    useLabelStore.getState().elements.forEach((e) => updateElement(e.id, valeurs));
  };

  return (
    <Section
      titre={interne ? 'Ombre interne' : 'Ombre portée'}
      actif={ombre.actif}
      onActif={(v) => maj({ [cles.actif]: v })}
      aide={
        interne
          ? 'Le bord de l’élément projette son ombre vers l’intérieur.'
          : 'Activez l’ombre pour la régler, ou choisissez un préréglage.'
      }
      // Préréglages : un point de départ en un clic, visibles même ombre coupée
      avant={
        <div className="grid grid-cols-5 gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => maj(p.valeurs)}
              className="group flex flex-col items-center gap-1"
              title={`Ombre ${p.label.toLowerCase()}`}
            >
              <span className="w-full h-10 flex items-center justify-center rounded-md bg-gray-100 dark:bg-gray-900 border border-transparent group-hover:border-blue-400">
                <Apercu ombre={ombreDuPreset(p, variante)} interne={interne} echelle={0.6} taille={interne ? 'h-6 w-6' : 'h-4 w-4'} />
              </span>
              <span className="text-[10px] leading-none text-gray-600 dark:text-gray-400">{p.label}</span>
            </button>
          ))}
        </div>
      }
    >
      {/* Le pavé-aperçu, et les valeurs exactes à côté */}
      <div className="flex items-start gap-3">
        <Pave2D
          x={ombre.x}
          y={ombre.y}
          max={bornes.decalage}
          taille={TAILLE}
          onValeur={decaler}
          label={interne ? 'Décalage de l’ombre interne' : 'Décalage de l’ombre'}
        >
          <Apercu ombre={ombre} interne={interne} echelle={echelle} taille={interne ? 'h-12 w-12' : 'h-7 w-7'} />
        </Pave2D>
        <div className="flex-1 min-w-0 space-y-1.5">
          <ChampNombre
            label="X"
            valeur={ombre.x}
            min={-bornes.decalage}
            max={bornes.decalage}
            unite="px"
            onValeur={(x) => decaler({ x, y: ombre.y })}
          />
          <ChampNombre
            label="Y"
            valeur={ombre.y}
            min={-bornes.decalage}
            max={bornes.decalage}
            unite="px"
            onValeur={(y) => decaler({ x: ombre.x, y })}
          />
          <p className="pt-0.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {distance ? `${angle}° · ${distance} px` : 'Centrée'}
          </p>
          <button
            type="button"
            onClick={() => decaler({ x: 0, y: 0 })}
            disabled={!ombre.x && !ombre.y}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Recentrer
          </button>
        </div>
      </div>

      <Curseur
        label="Flou"
        largeurLabel="w-14"
        max={bornes.flou}
        valeur={ombre.flou}
        affichage={(v) => `${v} px`}
        defaut={defaut[cles.flou]}
        onValeur={(v) => maj({ [cles.flou]: v })}
      />
      <Curseur
        label="Opacité"
        largeurLabel="w-14"
        min={0}
        max={1}
        step={0.05}
        valeur={ombre.opacite}
        affichage={(v) => `${Math.round(v * 100)} %`}
        defaut={defaut[cles.opacite]}
        onValeur={(v) => maj({ [cles.opacite]: v })}
      />
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="w-14 flex-none">Couleur</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(ombre.couleur) ? ombre.couleur : '#000000'}
          onChange={(e) => maj({ [cles.couleur]: e.target.value })}
          className="h-7 w-9 flex-none rounded-md cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
        />
        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{ombre.couleur}</span>
      </label>

      {!interne && (
        <button
          type="button"
          onClick={appliquerATous}
          className="w-full h-7 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Tous les éléments de l'affiche reçoivent cette ombre"
        >
          Appliquer cette ombre à tous les éléments
        </button>
      )}
    </Section>
  );
};

export default BlocOmbre;
