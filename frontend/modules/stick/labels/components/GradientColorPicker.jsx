// frontend/modules/stick/labels/components/GradientColorPicker.jsx
//
// Sélecteur de couleur en fenêtre : une pastille montre la peinture courante
// (uni ou dégradé) ; un clic ouvre la fenêtre où l'on choisit « Uni » ou
// « Dégradé ». En uni, il écrit la couleur comme avant ; en dégradé, l'objet
// du modèle PocketStick (`utils/paint.js`) : linéaire (angle) ou radial
// (centre, rayon), de 2 à 16 arrêts. Un ancien dégradé `{ from, to, angle }`
// est lu, et réécrit au nouveau format à la première retouche.
// Repasser en uni efface le dégradé : la couleur unie d'avant est intacte.
//
// `lineaireSeulement` : pour un CONTOUR, que Konva ne sait dégrader qu'en
// linéaire — le choix « Radial » n'est pas proposé.

import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  DEFAULT_LINEAR_GRADIENT,
  DEFAULT_RADIAL_GRADIENT,
  MAX_GRADIENT_STOPS,
  paintToCss,
  sanitizeGradient,
  versPeinture,
} from '../utils/paint';

const DEGRADES_PRETS = [
  ['#3b82f6', '#ec4899'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#3b82f6'],
  ['#8b5cf6', '#06b6d4'],
  ['#000000', '#6b7280'],
  ['#fde047', '#f97316'],
];
const COULEURS_PRETES = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const onglet = (actif) =>
  `flex-1 px-2 py-1 text-xs rounded transition-colors ${
    actif
      ? 'bg-blue-500 text-white'
      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
  }`;

/** `<input type=color>` n'accepte qu'un #rrggbb : repli pour rgba() & co. */
const enHex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${[...c.slice(1)].map((x) => x + x).join('')}` : '#000000');

const ChampCouleur = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
    {label}
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-[11px] uppercase">{value}</span>
      <input
        type="color"
        value={enHex(value)}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
      />
    </span>
  </label>
);

const Curseur = ({ label, valeur, affichage, min, max, step, onChange }) => (
  <label className="block text-xs text-gray-600 dark:text-gray-300">
    <span className="flex justify-between">
      {label} <span className="tabular-nums">{affichage ?? valeur}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={valeur}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  </label>
);

const GradientColorPicker = ({ color, gradient, onColorChange, onGradientChange, title, lineaireSeulement = false }) => {
  const peinture = versPeinture(gradient);
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState(peinture ? 'degrade' : 'uni');
  const [arret, setArret] = useState(0); // arrêt sélectionné
  const racine = useRef(null);
  const pastille = useRef(null);
  const barre = useRef(null);
  // Position ÉCRAN de la fenêtre : la barre contextuelle défile (overflow),
  // une fenêtre en `absolute` y serait coupée.
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Le mode suit l'élément sélectionné (changer de sélection, annuler…).
  useEffect(() => setMode(peinture ? 'degrade' : 'uni'), [!!peinture]);

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

  const defaut = {
    ...DEFAULT_LINEAR_GRADIENT,
    stops: [
      { offset: 0, color: color || DEFAULT_LINEAR_GRADIENT.stops[0].color },
      DEFAULT_LINEAR_GRADIENT.stops[1],
    ],
  };
  let g = peinture ?? defaut;
  // Un contour ne se dégrade qu'en linéaire : un radial y est converti
  if (lineaireSeulement && g.type !== 'linear-gradient') g = { type: 'linear-gradient', angle: 90, stops: g.stops };
  const i = Math.min(arret, g.stops.length - 1);

  const ecrire = (suivant) => {
    const propre = sanitizeGradient(suivant);
    if (propre) onGradientChange(propre);
  };
  // Déplacer un arrêt peut changer son rang (les arrêts sont triés) : la
  // sélection le suit.
  const majArret = (partiel) => {
    const modifie = { ...g.stops[i], ...partiel };
    const stops = g.stops.map((s, k) => (k === i ? modifie : s)).sort((a, b) => a.offset - b.offset);
    setArret(stops.indexOf(modifie));
    ecrire({ ...g, stops });
  };

  const passerEnDegrade = () => {
    setMode('degrade');
    if (!peinture) ecrire(g);
  };
  const passerEnUni = () => {
    setMode('uni');
    if (gradient) onGradientChange(null);
  };
  const changerType = (type) => {
    if (type === g.type) return;
    const base = type === 'linear-gradient' ? DEFAULT_LINEAR_GRADIENT : DEFAULT_RADIAL_GRADIENT;
    ecrire({ ...base, stops: g.stops });
  };

  // Clic sur la barre : ajoute un arrêt à cet endroit, de la couleur voisine
  const ajouterArret = (e) => {
    if (g.stops.length >= MAX_GRADIENT_STOPS || e.target !== barre.current) return;
    const r = barre.current.getBoundingClientRect();
    const offset = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const voisin = g.stops.reduce((a, s) => (Math.abs(s.offset - offset) < Math.abs(a.offset - offset) ? s : a));
    const stops = [...g.stops, { offset, color: voisin.color }].sort((a, b) => a.offset - b.offset);
    setArret(stops.findIndex((s) => s.offset === offset));
    ecrire({ ...g, stops });
  };
  const retirerArret = () => {
    if (g.stops.length <= 2) return;
    setArret(Math.max(0, i - 1));
    ecrire({ ...g, stops: g.stops.filter((_, k) => k !== i) });
  };
  const inverser = () =>
    ecrire({ ...g, stops: g.stops.map((s) => ({ ...s, offset: 1 - s.offset })).reverse() });

  // Aperçu de la barre : toujours horizontal, quel que soit l'angle
  const cssBarre = paintToCss({ type: 'linear-gradient', angle: 90, stops: g.stops });

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
        style={{ background: peinture ? paintToCss(peinture) : color }}
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
              {!lineaireSeulement && (
                <div className="flex gap-1">
                  <button type="button" className={onglet(g.type === 'linear-gradient')} onClick={() => changerType('linear-gradient')}>
                    Linéaire
                  </button>
                  <button type="button" className={onglet(g.type === 'radial-gradient')} onClick={() => changerType('radial-gradient')}>
                    Radial
                  </button>
                </div>
              )}

              {/* Aperçu réel, puis la barre des arrêts (clic : ajouter un arrêt) */}
              <div
                className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
                style={{ background: paintToCss(g) }}
              />
              <div className="px-1.5">
                <div
                  ref={barre}
                  onClick={ajouterArret}
                  className="relative h-4 rounded cursor-copy border border-gray-300 dark:border-gray-600"
                  style={{ background: cssBarre }}
                  title="Cliquer pour ajouter une couleur"
                >
                  {g.stops.map((s, k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setArret(k)}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-5 rounded-sm border-2 ${
                        k === i ? 'border-blue-500 ring-1 ring-white' : 'border-white'
                      } shadow`}
                      style={{ left: `${s.offset * 100}%`, background: s.color }}
                      title={`${s.color} · ${Math.round(s.offset * 100)} %`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <ChampCouleur label={`Couleur ${i + 1}`} value={g.stops[i].color} onChange={(v) => majArret({ color: v })} />
                  <Curseur
                    label="Position"
                    valeur={g.stops[i].offset}
                    affichage={`${Math.round(g.stops[i].offset * 100)} %`}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => majArret({ offset: v })}
                  />
                </div>
                <button
                  type="button"
                  onClick={retirerArret}
                  disabled={g.stops.length <= 2}
                  className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                  title="Retirer cette couleur"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {g.type === 'linear-gradient' ? (
                <Curseur label="Angle" valeur={g.angle} affichage={`${g.angle}°`} min={0} max={359} step={1} onChange={(v) => ecrire({ ...g, angle: v })} />
              ) : (
                <>
                  <Curseur
                    label="Centre horizontal"
                    valeur={g.center.x}
                    affichage={`${Math.round(g.center.x * 100)} %`}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => ecrire({ ...g, center: { ...g.center, x: v } })}
                  />
                  <Curseur
                    label="Centre vertical"
                    valeur={g.center.y}
                    affichage={`${Math.round(g.center.y * 100)} %`}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => ecrire({ ...g, center: { ...g.center, y: v } })}
                  />
                  <Curseur
                    label="Rayon"
                    valeur={g.radius}
                    affichage={`${Math.round(g.radius * 100)} %`}
                    min={0.01}
                    max={2}
                    step={0.01}
                    onChange={(v) => ecrire({ ...g, radius: v })}
                  />
                </>
              )}

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={inverser}
                  className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  Inverser
                </button>
                <div className="flex-1 grid grid-cols-6 gap-1">
                  {DEGRADES_PRETS.map(([a, b]) => (
                    <button
                      key={`${a}${b}`}
                      type="button"
                      onClick={() => ecrire({ ...g, stops: [{ offset: 0, color: a }, { offset: 1, color: b }] })}
                      className="h-6 rounded border border-gray-300 dark:border-gray-600"
                      style={{ background: `linear-gradient(90deg, ${a}, ${b})` }}
                      title={`${a} → ${b}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GradientColorPicker;
