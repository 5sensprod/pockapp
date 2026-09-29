// frontend/modules/stick/labels/components/GradientColorPicker.jsx
//
// Sélecteur de couleur en fenêtre : une pastille montre le remplissage courant
// (uni ou dégradé) ; un clic ouvre la fenêtre où l'on choisit « Uni » ou
// « Dégradé », et où chaque couleur du dégradé se modifie. En uni, il écrit la
// couleur comme avant ; en dégradé, `fillGradient` (voir `utils/fillStyle.js`).
// Repasser en uni efface le dégradé : la couleur unie d'avant est intacte.

import React, { useEffect, useRef, useState } from 'react';
import { DEGRADE_PAR_DEFAUT } from '../utils/fillStyle';

const DEGRADES_PRETS = [
  { from: '#3b82f6', to: '#ec4899' },
  { from: '#f59e0b', to: '#ef4444' },
  { from: '#10b981', to: '#3b82f6' },
  { from: '#8b5cf6', to: '#06b6d4' },
  { from: '#000000', to: '#6b7280' },
  { from: '#fde047', to: '#f97316' },
];
const COULEURS_PRETES = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

/** CSS d'aperçu d'un dégradé : même convention d'angle que Konva (0° = vers la droite). */
const cssDegrade = (g) => `linear-gradient(${(g.angle ?? 0) + 90}deg, ${g.from}, ${g.to})`;

const onglet = (actif) =>
  `flex-1 px-2 py-1 text-xs rounded transition-colors ${
    actif
      ? 'bg-blue-500 text-white'
      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
  }`;

const ChampCouleur = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
    {label}
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[11px] uppercase">{value}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
      />
    </span>
  </label>
);

const GradientColorPicker = ({ color, gradient, onColorChange, onGradientChange, title }) => {
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState(gradient ? 'degrade' : 'uni');
  const racine = useRef(null);
  const pastille = useRef(null);
  // Position ÉCRAN de la fenêtre : la barre contextuelle défile (overflow),
  // une fenêtre en `absolute` y serait coupée.
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Le mode suit l'élément sélectionné (changer de sélection, annuler…).
  useEffect(() => setMode(gradient ? 'degrade' : 'uni'), [gradient]);

  // Fermer au clic extérieur et à Échap. Le sélecteur natif `<input type=color>`
  // s'ouvre hors du DOM : il ne déclenche pas de mousedown ici.
  useEffect(() => {
    if (!ouvert) return;
    const clic = (e) => racine.current && !racine.current.contains(e.target) && setOuvert(false);
    const touche = (e) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  const g = gradient ?? { ...DEGRADE_PAR_DEFAUT, from: color || DEGRADE_PAR_DEFAUT.from };
  const majDegrade = (partiel) => onGradientChange({ ...g, ...partiel });

  const passerEnDegrade = () => {
    setMode('degrade');
    if (!gradient) onGradientChange(g);
  };
  const passerEnUni = () => {
    setMode('uni');
    if (gradient) onGradientChange(null);
  };

  return (
    <div className="relative" ref={racine}>
      <button
        type="button"
        ref={pastille}
        onClick={() => {
          const r = pastille.current?.getBoundingClientRect();
          if (r) setPos({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 272) });
          setOuvert((o) => !o);
        }}
        className="w-10 h-8 rounded border border-gray-300 dark:border-gray-600 shadow-inner"
        style={{ background: gradient ? cssDegrade(gradient) : color }}
        title={title}
      />

      {ouvert && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-64 p-3 space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl whitespace-normal">
          <div className="flex gap-1">
            <button type="button" className={onglet(mode === 'uni')} onClick={passerEnUni}>
              Uni
            </button>
            <button type="button" className={onglet(mode === 'degrade')} onClick={passerEnDegrade}>
              Dégradé
            </button>
          </div>

          {mode === 'uni' ? (
            <>
              <ChampCouleur label="Couleur" value={color} onChange={onColorChange} />
              <div className="grid grid-cols-6 gap-1.5">
                {COULEURS_PRETES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onColorChange(c)}
                    className={`h-7 rounded border ${
                      c.toLowerCase() === (color || '').toLowerCase()
                        ? 'ring-2 ring-blue-500 border-transparent'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Aperçu : un clic inverse les deux couleurs */}
              <button
                type="button"
                onClick={() => majDegrade({ from: g.to, to: g.from })}
                className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
                style={{ background: cssDegrade(g) }}
                title="Inverser les couleurs"
              />
              <ChampCouleur label="Départ" value={g.from} onChange={(v) => majDegrade({ from: v })} />
              <ChampCouleur label="Arrivée" value={g.to} onChange={(v) => majDegrade({ to: v })} />
              <label className="block text-xs text-gray-600 dark:text-gray-300">
                <span className="flex justify-between">
                  Angle <span>{g.angle ?? 0}°</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={15}
                  value={g.angle ?? 0}
                  onChange={(e) => majDegrade({ angle: Number(e.target.value) })}
                  className="w-full"
                />
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {DEGRADES_PRETS.map((p) => (
                  <button
                    key={`${p.from}${p.to}`}
                    type="button"
                    onClick={() => majDegrade(p)}
                    className="h-7 rounded border border-gray-300 dark:border-gray-600"
                    style={{ background: cssDegrade({ ...p, angle: g.angle }) }}
                    title={`${p.from} → ${p.to}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GradientColorPicker;
