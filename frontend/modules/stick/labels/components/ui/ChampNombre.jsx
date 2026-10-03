// frontend/modules/stick/labels/components/ui/ChampNombre.jsx
//
// UN NOMBRE À GLISSER : on tape la valeur, ou on GLISSE sur le libellé pour la
// changer (Maj ×10, Alt ÷10), comme dans les outils de dessin. Pour une
// valeur sans piste naturelle (X, Y, taille) dans un panneau étroit.
//
// - Le libellé porte `data-geste-reglage` : le canvas masque le cadre de
//   sélection pendant le geste, comme pour un curseur (`KonvaCanvas`).
// - Le glisser ne prend pas le focus ; Entrée ou Échap le rendent : les
//   raccourcis du canvas (Suppr, H) reviennent aussitôt.
// - `onValeur` reçoit toujours un nombre fini, borné.

import React, { useRef } from 'react';
import { valeurGlissee } from '../../utils/pave2D';

const ChampNombre = ({ label, valeur, onValeur, min = -Infinity, max = Infinity, pas = 1, unite = '', titre }) => {
  const geste = useRef(null);
  const borner = (v) => Math.min(max, Math.max(min, v));

  const debut = (e) => {
    e.preventDefault(); // pas de focus, pas de sélection de texte
    e.currentTarget.setPointerCapture?.(e.pointerId);
    geste.current = { x: e.clientX, depart: Number.isFinite(valeur) ? valeur : 0 };
  };
  const glisse = (e) => {
    if (!geste.current) return;
    const v = valeurGlissee(geste.current.depart, e.clientX - geste.current.x, {
      pas,
      min,
      max,
      maj: e.shiftKey,
      alt: e.altKey,
    });
    if (v !== valeur) onValeur(v);
  };
  const fin = () => {
    geste.current = null;
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300" title={titre}>
      <span
        data-geste-reglage
        onPointerDown={debut}
        onPointerMove={glisse}
        onPointerUp={fin}
        onPointerCancel={fin}
        className="w-4 flex-none text-gray-500 dark:text-gray-400 cursor-ew-resize select-none touch-none"
        title="Glisser pour changer (Maj : ×10, Alt : fin)"
      >
        {label}
      </span>
      <input
        type="number"
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={pas}
        value={Number.isFinite(valeur) ? valeur : 0}
        onChange={(e) => {
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) onValeur(borner(v));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
        className="w-14 h-7 px-1.5 text-right tabular-nums rounded-md border border-transparent bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
      />
      {unite && <span className="text-gray-400">{unite}</span>}
    </label>
  );
};

export default ChampNombre;
