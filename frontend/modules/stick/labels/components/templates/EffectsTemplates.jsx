// src/features/labels/components/templates/EffectsTemplates.jsx
import React from 'react';
import { Sparkles } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import BlocOmbre from './BlocOmbre';
import { FLOU_MAX } from '../../utils/effetsKonva';
import { EFFECTS, sanitizeFilters, setEffectIntensity, toggleEffect } from '../../utils/effetsImage';
import {
  AMPLITUDE_MAX,
  LONGUEUR_MAX,
  LONGUEUR_MIN,
  ONDULATION_DEFAUT,
  SENS_ONDULATION,
} from '../../utils/ondulation';

// Un effet réglable : case à cocher, puis curseur d'intensité quand il est actif.
const ReglageEffet = ({ label, actif, valeur, min, max, onActif, onValeur }) => (
  <div>
    <label className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
      <span>
        {label}
        {actif && <span className="ml-2 text-gray-500 tabular-nums">{Math.round(valeur * 100)}</span>}
      </span>
      <input type="checkbox" checked={actif} onChange={(e) => onActif(e.target.checked)} className="accent-purple-600" />
    </label>
    {actif && (
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={valeur}
        onChange={(e) => onValeur(parseFloat(e.target.value))}
        className="w-full h-2 mt-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
      />
    )}
  </div>
);

const EffectsTemplates = () => {
  const { elements, selectedId, updateElement } = useLabelStore();

  const selectedElement = elements.find((el) => el.id === selectedId);

  // Si aucun élément sélectionné
  if (!selectedElement) {
    return (
      <div className="p-3 space-y-4">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-yellow-800 dark:text-yellow-200">
              <div className="font-medium mb-1">Aucun élément sélectionné</div>
              <div>Sélectionnez un élément sur le canvas pour appliquer des effets</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {/* Info */}
      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-purple-800 dark:text-purple-200">
            <div className="font-medium mb-1">Effets pour : {selectedElement.type}</div>
            <div>Ajoutez une ombre ou un flou à votre élément</div>
          </div>
        </div>
      </div>

      {/* Ombre portée : pavé-aperçu, préréglages (`BlocOmbre.jsx`) */}
      <BlocOmbre el={selectedElement} />

      {/* Ombre interne (`ombreInterneDe`, `utils/effetsKonva.js`) : le bord de
          l'élément projette son ombre vers l'intérieur. Même filtre à l'écran
          et dans les deux exports. */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <label className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 cursor-pointer">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ombre interne</span>
          <input
            type="checkbox"
            checked={!!selectedElement.innerShadowEnabled}
            onChange={(e) => updateElement(selectedId, { innerShadowEnabled: e.target.checked })}
            className="h-4 w-4 accent-purple-600"
          />
        </label>
        {selectedElement.innerShadowEnabled && (
          <div className="p-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20">Couleur</span>
              <input
                type="color"
                value={selectedElement.innerShadowColor ?? '#000000'}
                onChange={(e) => updateElement(selectedId, { innerShadowColor: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>
            {[
              ['innerShadowOpacity', 'Opacité', 0, 1, 0.05, 0.5, (v) => `${Math.round(v * 100)}%`],
              ['innerShadowBlur', 'Flou', 0, 60, 1, 8, (v) => `${v}px`],
              ['innerShadowOffsetX', 'Décalage X', -40, 40, 1, 2, (v) => `${v}px`],
              ['innerShadowOffsetY', 'Décalage Y', -40, 40, 1, 2, (v) => `${v}px`],
            ].map(([cle, libelle, min, max, step, defaut, fmt]) => {
              const v = selectedElement[cle] ?? defaut;
              return (
                <div key={cle}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{libelle}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{fmt(v)}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={v}
                    onChange={(e) => updateElement(selectedId, { [cle]: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Flou de l'élément entier (`utils/effetsKonva.js`), repris de PocketStick */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Flou</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!selectedElement.blurEnabled}
              onChange={(e) =>
                updateElement(selectedId, {
                  blurEnabled: e.target.checked,
                  blurRadius: selectedElement.blurRadius ?? 10,
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
          </label>
        </div>
        {selectedElement.blurEnabled && (
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Intensité</label>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {selectedElement.blurRadius ?? 10}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.min(FLOU_MAX, 100)}
              step={1}
              value={selectedElement.blurRadius ?? 10}
              onChange={(e) => updateElement(selectedId, { blurRadius: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
            />

            {/* Dégradé de flou (`fonduFlou`, `utils/effetsKonva.js`) : net d'un
                côté, flou de l'autre. */}
            <label className="mt-3 flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
              Dégradé (net → flou)
              <input
                type="checkbox"
                checked={!!selectedElement.blurFade}
                onChange={(e) =>
                  updateElement(selectedId, {
                    blurFade: e.target.checked ? { angle: 180, from: 0.3, to: 0.8 } : null,
                  })
                }
                className="accent-purple-600"
              />
            </label>
            {selectedElement.blurFade && (
              <div className="mt-2 space-y-2">
                {[
                  ['angle', 'Direction', 0, 359, 1, (v) => `${v}°`],
                  ['from', 'Début du flou', 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`],
                  ['to', 'Flou complet', 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`],
                ].map(([cle, label, min, max, step, format]) => (
                  <div key={cle}>
                    <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                      <span>{label}</span>
                      <span className="tabular-nums">{format(selectedElement.blurFade[cle])}</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={selectedElement.blurFade[cle]}
                      onChange={(e) =>
                        updateElement(selectedId, {
                          blurFade: { ...selectedElement.blurFade, [cle]: parseFloat(e.target.value) },
                        })
                      }
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Effets d'image, repris de PocketStick (`utils/effetsImage.js`) */}
      {/* Ondulation de l'élément entier, en pixels (`utils/ondulation.js`) */}
      {(() => {
        const onde = selectedElement.ondulationEffet ?? null;
        const set = (maj) => updateElement(selectedId, { ondulationEffet: { ...ONDULATION_DEFAUT, ...onde, ...maj } });
        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Ondulation</span>
              <input
                type="checkbox"
                aria-label="Ondulation"
                checked={!!onde}
                onChange={(e) =>
                  updateElement(selectedId, { ondulationEffet: e.target.checked ? { ...ONDULATION_DEFAUT } : null })
                }
                className="accent-purple-600"
              />
            </div>
            {onde && (
              <div className="p-3 space-y-3">
                <div className="flex gap-1" role="group" aria-label="Sens de l'ondulation">
                  {SENS_ONDULATION.map((sens) => (
                    <button
                      key={sens.id}
                      type="button"
                      aria-pressed={(onde.sens ?? 'horizontal') === sens.id}
                      onClick={() => set({ sens: sens.id })}
                      className={`flex-1 px-2 py-1 text-xs rounded border ${
                        (onde.sens ?? 'horizontal') === sens.id
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {sens.label}
                    </button>
                  ))}
                </div>
                {[
                  ['amplitude', 'Amplitude', 0, AMPLITUDE_MAX],
                  ['longueur', "Longueur d'onde", LONGUEUR_MIN, LONGUEUR_MAX],
                ].map(([cle, libelle, min, max]) => (
                  <div key={cle}>
                    <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
                      <span>{libelle}</span>
                      <span className="tabular-nums">{onde[cle] ?? ONDULATION_DEFAUT[cle]} px</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={1}
                      value={onde[cle] ?? ONDULATION_DEFAUT[cle]}
                      onChange={(e) => set({ [cle]: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {selectedElement.type === 'image' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Effets d'image
          </div>
          <div className="p-3 space-y-3">
            {[
              ['sepiaEnabled', 'Sépia'],
              ['grayscaleEnabled', 'Noir et blanc'],
            ].map(([cle, label]) => (
              <label key={cle} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                {label}
                <input
                  type="checkbox"
                  checked={!!selectedElement[cle]}
                  onChange={(e) => updateElement(selectedId, { [cle]: e.target.checked })}
                  className="accent-purple-600"
                />
              </label>
            ))}
            <ReglageEffet
              label="Luminosité"
              actif={!!selectedElement.brightnessEnabled}
              valeur={selectedElement.brightness ?? 0}
              min={-1}
              max={1}
              onActif={(v) =>
                updateElement(selectedId, { brightnessEnabled: v, brightness: selectedElement.brightness ?? 0.2 })
              }
              onValeur={(v) => updateElement(selectedId, { brightness: v })}
            />
            {EFFECTS.map((effet) => {
              const filtres = sanitizeFilters(selectedElement.filters) || {};
              const courant = filtres[effet.name];
              return (
                <ReglageEffet
                  key={effet.name}
                  label={effet.label}
                  actif={!!courant}
                  valeur={courant?.intensity ?? effet.initial}
                  min={effet.range[0]}
                  max={effet.range[1]}
                  onActif={(v) =>
                    updateElement(selectedId, { filters: toggleEffect(selectedElement.filters, effet.name, v) })
                  }
                  onValeur={(v) =>
                    updateElement(selectedId, { filters: setEffectIntensity(selectedElement.filters, effet.name, v) })
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EffectsTemplates;
