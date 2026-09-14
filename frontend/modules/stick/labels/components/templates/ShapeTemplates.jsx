// frontend/modules/stick/labels/components/templates/ShapeTemplates.jsx
//
// L'onglet existait dans AppPos, mais ses boutons ne faisaient rien : aucun
// `onClick`, et le canvas ne savait pas rendre un élément `shape`. Les deux
// manques sont comblés ici et dans `canvas/ShapeNode.jsx`.

import React, { useState } from 'react';
import { Circle, Minus, Square, Star, Triangle } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';

const FORMES = [
  { id: 'rectangle', label: 'Rectangle', icon: Square, width: 200, height: 120 },
  { id: 'circle', label: 'Cercle', icon: Circle, width: 160, height: 160 },
  { id: 'triangle', label: 'Triangle', icon: Triangle, width: 160, height: 160 },
  { id: 'star', label: 'Étoile', icon: Star, width: 160, height: 160 },
  { id: 'line', label: 'Trait', icon: Minus, width: 220, height: 8 },
];

const COULEURS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#0f172a',
  '#ffffff',
];

const ShapeTemplates = () => {
  const { addElement, elements } = useLabelStore();
  const [couleur, setCouleur] = useState('#3b82f6');

  const handleAddShape = (forme) => {
    addElement({
      type: 'shape',
      shape: forme.id,
      id: undefined,
      x: 50,
      y: 50 + elements.length * 30,
      width: forme.width,
      height: forme.height,
      fill: couleur,
      // Une forme blanche serait invisible sur une planche blanche : on lui
      // pose un contour, aux autres non.
      stroke: couleur.toLowerCase() === '#ffffff' ? '#0f172a' : '',
      strokeWidth: couleur.toLowerCase() === '#ffffff' ? 1 : 0,
      cornerRadius: 0,
      rotation: 0,
      visible: true,
      locked: false,
    });
  };

  return (
    <div className="p-3 space-y-4">
      {/* Couleur appliquée à la prochaine forme ajoutée */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Couleur</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {COULEURS.map((c) => (
            <button
              key={c}
              onClick={() => setCouleur(c)}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                couleur === c
                  ? 'border-blue-500 ring-2 ring-blue-300'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={couleur}
            onChange={(e) => setCouleur(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
            title="Couleur personnalisée"
          />
        </div>
      </div>

      {/* Formes */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Formes</h3>
        <div className="grid grid-cols-2 gap-3">
          {FORMES.map((forme) => (
            <button
              key={forme.id}
              onClick={() => handleAddShape(forme)}
              className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all"
            >
              <div className="flex flex-col items-center gap-2">
                <forme.icon
                  className="h-8 w-8"
                  style={{ color: couleur }}
                  fill={forme.id === 'line' ? 'none' : couleur}
                />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {forme.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Couleur, contour et arrondi se règlent ensuite dans la barre de propriétés, la forme
        sélectionnée.
      </p>
    </div>
  );
};

export default ShapeTemplates;
