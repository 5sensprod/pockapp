// frontend/modules/stick/labels/components/templates/BlocOmbre.jsx
//
// L'OMBRE PORTÉE dans l'onglet Effets : interrupteur dans l'en-tête,
// préréglages en vignettes, puis un PAVÉ qui est aussi l'aperçu — on glisse
// la poignée, l'ombre du petit carré suit, avec le flou, l'opacité et la
// couleur. Quatre curseurs empilés (dont un pour X, un pour Y) avant.
//
// Rien ne change au rendu : MÊMES clés (`shadow*`), mêmes bornes, mêmes
// défauts (`utils/presetsOmbre.js`). Deux règles d'écriture :
// - le décalage s'écrit TOUJOURS `{ shadowOffsetX, shadowOffsetY }` ensemble,
//   depuis le pavé comme depuis un champ : la clé du geste ne change pas, un
//   glisser fait un seul pas d'annulation ;
// - un préréglage pose les six clés d'un coup.

import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { polaire, MARGE } from '../../utils/pave2D';
import { OMBRE_BORNES, PRESETS_OMBRE, filtreApercu, ombreDe } from '../../utils/presetsOmbre';
import ChampNombre from '../ui/ChampNombre';
import Curseur from '../ui/Curseur';
import Pave2D from '../ui/Pave2D';
import Section from '../ui/Section';

const TAILLE = 112;
// Pixels d'écran par unité de décalage : l'ombre de l'aperçu tombe sous la poignée
const ECHELLE = (TAILLE - 2 * MARGE) / 2 / OMBRE_BORNES.decalage;

const BlocOmbre = ({ el }) => {
  const updateElement = useLabelStore((s) => s.updateElement);
  const elements = useLabelStore((s) => s.elements);
  const ombre = ombreDe(el);
  const maj = (m) => updateElement(el.id, m);
  const decaler = ({ x, y }) => maj({ shadowOffsetX: x, shadowOffsetY: y });
  const { angle, distance } = polaire(ombre.x, ombre.y);

  // Comme avant : un `updateElement` par élément (un pas d'annulation chacun)
  const appliquerATous = () => {
    const valeurs = {
      shadowEnabled: ombre.actif,
      shadowColor: ombre.couleur,
      shadowOpacity: ombre.opacite,
      shadowBlur: ombre.flou,
      shadowOffsetX: ombre.x,
      shadowOffsetY: ombre.y,
    };
    elements.forEach((e) => updateElement(e.id, valeurs));
  };

  return (
    <Section
      titre="Ombre portée"
      actif={ombre.actif}
      onActif={(shadowEnabled) => maj({ shadowEnabled })}
      aide="Activez l'ombre pour la régler, ou choisissez un préréglage."
      // Préréglages : un point de départ en un clic, visibles même ombre coupée
      avant={
        <div className="grid grid-cols-5 gap-1.5">
          {PRESETS_OMBRE.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => maj(p.valeurs)}
              className="group flex flex-col items-center gap-1"
              title={`Ombre ${p.label.toLowerCase()}`}
            >
              <span className="w-full h-10 flex items-center justify-center rounded-md bg-gray-100 dark:bg-gray-900 border border-transparent group-hover:border-blue-400">
                <span
                  className="h-4 w-4 rounded-sm bg-white"
                  style={{
                    filter: filtreApercu(
                      {
                        couleur: p.valeurs.shadowColor,
                        opacite: p.valeurs.shadowOpacity,
                        flou: p.valeurs.shadowBlur,
                        x: p.valeurs.shadowOffsetX,
                        y: p.valeurs.shadowOffsetY,
                      },
                      0.6
                    ),
                  }}
                />
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
          max={OMBRE_BORNES.decalage}
          taille={TAILLE}
          onValeur={decaler}
          label="Décalage de l'ombre"
        >
          <span className="h-7 w-7 rounded bg-white" style={{ filter: filtreApercu(ombre, ECHELLE) }} />
        </Pave2D>
        <div className="flex-1 min-w-0 space-y-1.5">
          <ChampNombre
            label="X"
            valeur={ombre.x}
            min={-OMBRE_BORNES.decalage}
            max={OMBRE_BORNES.decalage}
            unite="px"
            onValeur={(x) => decaler({ x, y: ombre.y })}
          />
          <ChampNombre
            label="Y"
            valeur={ombre.y}
            min={-OMBRE_BORNES.decalage}
            max={OMBRE_BORNES.decalage}
            unite="px"
            onValeur={(y) => decaler({ x: ombre.x, y })}
          />
          <p className="pt-0.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {distance ? `${angle}° · ${distance} px` : 'Sous l’élément'}
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
        max={OMBRE_BORNES.flou}
        valeur={ombre.flou}
        affichage={(v) => `${v} px`}
        defaut={8}
        onValeur={(shadowBlur) => maj({ shadowBlur })}
      />
      <Curseur
        label="Opacité"
        largeurLabel="w-14"
        min={0}
        max={1}
        step={0.05}
        valeur={ombre.opacite}
        affichage={(v) => `${Math.round(v * 100)} %`}
        defaut={0.4}
        onValeur={(shadowOpacity) => maj({ shadowOpacity })}
      />
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="w-14 flex-none">Couleur</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(ombre.couleur) ? ombre.couleur : '#000000'}
          onChange={(e) => maj({ shadowColor: e.target.value })}
          className="h-7 w-9 flex-none rounded-md cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
        />
        <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{ombre.couleur}</span>
      </label>

      <button
        type="button"
        onClick={appliquerATous}
        className="w-full h-7 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        title="Tous les éléments de l'affiche reçoivent cette ombre"
      >
        Appliquer cette ombre à tous les éléments
      </button>
    </Section>
  );
};

export default BlocOmbre;
