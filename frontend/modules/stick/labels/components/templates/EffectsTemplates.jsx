// src/features/labels/components/templates/EffectsTemplates.jsx
import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
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
  const [shadowExpanded, setShadowExpanded] = useState(true);

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

  // Handlers pour les ombres
  const toggleShadow = (enabled) => {
    updateElement(selectedId, { shadowEnabled: enabled });
    if (enabled) setShadowExpanded(true);
  };

  const changeShadowColor = (value) => updateElement(selectedId, { shadowColor: value });

  const changeShadowOpacity = (value) =>
    updateElement(selectedId, { shadowOpacity: parseFloat(value) });

  const changeShadowBlur = (value) => updateElement(selectedId, { shadowBlur: parseFloat(value) });

  const changeShadowOffsetX = (value) =>
    updateElement(selectedId, { shadowOffsetX: parseFloat(value) });

  const changeShadowOffsetY = (value) =>
    updateElement(selectedId, { shadowOffsetY: parseFloat(value) });

  const applyShadowToAll = () => {
    const {
      shadowEnabled = false,
      shadowColor = '#000000',
      shadowOpacity = 0.4,
      shadowBlur = 8,
      shadowOffsetX = 2,
      shadowOffsetY = 2,
    } = selectedElement || {};

    elements.forEach((el) =>
      updateElement(el.id, {
        shadowEnabled,
        shadowColor,
        shadowOpacity,
        shadowBlur,
        shadowOffsetX,
        shadowOffsetY,
      })
    );
  };

  const shadowEnabled = !!selectedElement.shadowEnabled;
  const shadowColor = selectedElement.shadowColor ?? '#000000';
  const shadowOpacity = selectedElement.shadowOpacity ?? 0.4;
  const shadowBlur = selectedElement.shadowBlur ?? 8;
  const shadowOffsetX = selectedElement.shadowOffsetX ?? 2;
  const shadowOffsetY = selectedElement.shadowOffsetY ?? 2;

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

      {/* Section Ombre */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Header avec Toggle */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShadowExpanded(!shadowExpanded)}
              className="flex items-center gap-2 flex-1 text-left"
            >
              {shadowExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Ombre portée
              </span>
            </button>

            {/* Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={shadowEnabled}
                onChange={(e) => toggleShadow(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        {/* Propriétés dépliables */}
        {shadowExpanded && shadowEnabled && (
          <div className="p-3 space-y-4">
            {/* Couleur */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                Couleur
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={shadowColor}
                  onChange={(e) => changeShadowColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                />
                <input
                  type="text"
                  value={shadowColor}
                  onChange={(e) => changeShadowColor(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                  placeholder="#000000"
                />
              </div>
            </div>

            {/* Opacité */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Opacité
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {Math.round(shadowOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={shadowOpacity}
                onChange={(e) => changeShadowOpacity(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
              />
            </div>

            {/* Flou */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Flou</label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {shadowBlur}px
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={40}
                step={1}
                value={shadowBlur}
                onChange={(e) => changeShadowBlur(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
              />
            </div>

            {/* Décalage X */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Décalage X
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {shadowOffsetX}px
                </span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={shadowOffsetX}
                onChange={(e) => changeShadowOffsetX(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
              />
            </div>

            {/* Décalage Y */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Décalage Y
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  {shadowOffsetY}px
                </span>
              </div>
              <input
                type="range"
                min={-40}
                max={40}
                step={1}
                value={shadowOffsetY}
                onChange={(e) => changeShadowOffsetY(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-purple-600"
              />
            </div>

            {/* Bouton Appliquer à tous */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={applyShadowToAll}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Appliquer l'ombre à tous les éléments
              </button>
            </div>
          </div>
        )}

        {/* Message si désactivé */}
        {shadowExpanded && !shadowEnabled && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Activez l'ombre pour configurer ses propriétés
            </p>
          </div>
        )}
      </div>

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

      {/* Presets d'ombres */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          💡 Presets d'ombres
        </h3>
        <div className="space-y-2">
          {/* Ombre légère */}
          <button
            onClick={() => {
              updateElement(selectedId, {
                shadowEnabled: true,
                shadowColor: '#000000',
                shadowOpacity: 0.2,
                shadowBlur: 4,
                shadowOffsetX: 1,
                shadowOffsetY: 1,
              });
              setShadowExpanded(true);
            }}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Ombre légère</div>
            <div className="text-xs text-gray-500 mt-1">
              Subtile et élégante • Flou 4px • Opacité 20%
            </div>
          </button>

          {/* Ombre normale */}
          <button
            onClick={() => {
              updateElement(selectedId, {
                shadowEnabled: true,
                shadowColor: '#000000',
                shadowOpacity: 0.4,
                shadowBlur: 8,
                shadowOffsetX: 2,
                shadowOffsetY: 2,
              });
              setShadowExpanded(true);
            }}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Ombre normale
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Équilibrée et visible • Flou 8px • Opacité 40%
            </div>
          </button>

          {/* Ombre forte */}
          <button
            onClick={() => {
              updateElement(selectedId, {
                shadowEnabled: true,
                shadowColor: '#000000',
                shadowOpacity: 0.6,
                shadowBlur: 16,
                shadowOffsetX: 4,
                shadowOffsetY: 4,
              });
              setShadowExpanded(true);
            }}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Ombre forte</div>
            <div className="text-xs text-gray-500 mt-1">
              Profonde et marquée • Flou 16px • Opacité 60%
            </div>
          </button>

          {/* Ombre colorée */}
          <button
            onClick={() => {
              updateElement(selectedId, {
                shadowEnabled: true,
                shadowColor: '#6366f1',
                shadowOpacity: 0.5,
                shadowBlur: 12,
                shadowOffsetX: 0,
                shadowOffsetY: 4,
              });
              setShadowExpanded(true);
            }}
            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Ombre colorée (Indigo)
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Moderne et dynamique • Flou 12px • Couleur #6366f1
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default EffectsTemplates;
