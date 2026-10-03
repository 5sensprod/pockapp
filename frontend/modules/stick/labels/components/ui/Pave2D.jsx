// frontend/modules/stick/labels/components/ui/Pave2D.jsx
//
// LE PAVÉ 2D : un carré où l'on glisse une poignée pour régler deux valeurs
// d'un seul geste (le décalage X/Y d'une ombre). `children` est dessiné au
// centre, SOUS la poignée : c'est l'aperçu — on voit l'effet là où on glisse.
// Les calculs sont dans `utils/pave2D.js`.
//
// - cliquer n'importe où place la poignée et démarre le geste ;
// - accrochage au centre et aux axes (Alt le suspend) ;
// - Maj : contraint à un axe ou à la diagonale ;
// - double-clic : retour à `defaut` ;
// - clavier : flèches ±1, Maj+flèches ±10, Origine = centre.
//
// `onValeur` reçoit TOUJOURS `{ x, y }` ensemble : l'appelant les écrit dans
// un seul `updateElement`, avec les mêmes clés d'un appel à l'autre — c'est ce
// qui fait d'un glisser UN pas d'annulation (`utils/gesteHistorique.js`).
// `data-geste-reglage` : le canvas masque le cadre de sélection pendant le
// geste, comme pour un curseur (`KonvaCanvas`). Ce n'est pas un `<input>` :
// les raccourcis du canvas restent actifs après un clic.

import React, { useRef } from 'react';
import { accrocher, contraindre, deplacer, depuisPave, pasClavier, versPave } from '../../utils/pave2D';

const Pave2D = ({ x, y, max, pas = 1, seuil = 2, taille = 112, defaut = { x: 0, y: 0 }, onValeur, label, children }) => {
  const racine = useRef(null);
  const tenu = useRef(false);
  const { px, py } = versPave(x, y, { taille, max });
  const horsBornes = Math.abs(x) > max || Math.abs(y) > max;

  const emettre = (v) => {
    if (v.x !== x || v.y !== y) onValeur({ x: v.x, y: v.y });
  };
  const depuisPointeur = (e) => {
    const r = racine.current.getBoundingClientRect();
    let v = depuisPave(e.clientX - r.left, e.clientY - r.top, { taille, max, pas });
    if (e.shiftKey) v = contraindre(v);
    if (!e.altKey) v = accrocher(v, seuil);
    return v;
  };

  const debut = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    racine.current.setPointerCapture?.(e.pointerId);
    racine.current.focus({ preventScroll: true });
    tenu.current = true;
    emettre(depuisPointeur(e));
  };
  const glisse = (e) => {
    if (tenu.current) emettre(depuisPointeur(e));
  };
  const fin = () => {
    tenu.current = false;
  };
  const touche = (e) => {
    const p = pasClavier(e.key, e.shiftKey);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation(); // les flèches ne déplacent pas l'élément du canvas
    emettre(deplacer({ x, y }, p, max));
  };

  return (
    <div
      ref={racine}
      data-geste-reglage
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={`X ${x}, Y ${y}`}
      onPointerDown={debut}
      onPointerMove={glisse}
      onPointerUp={fin}
      onPointerCancel={fin}
      onDoubleClick={() => emettre(defaut)}
      onKeyDown={touche}
      title="Glisser pour régler · Maj : un axe · Alt : sans accrochage · double-clic : recentrer"
      style={{ width: taille, height: taille }}
      className="relative flex-none rounded-lg bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 touch-none select-none cursor-crosshair overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      {/* Les deux axes : c'est là que la poignée s'accroche */}
      <span className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-gray-300 dark:border-gray-600" />
      <span className="absolute top-1/2 left-0 right-0 border-t border-dashed border-gray-300 dark:border-gray-600" />
      {/* L'aperçu, au centre */}
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">{children}</span>
      {/* La poignée ; ambre quand la valeur dépasse ce que le pavé sait montrer */}
      <span
        style={{ left: px, top: py }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-900 shadow pointer-events-none ${
          horsBornes ? 'bg-amber-500' : 'bg-blue-600'
        }`}
      />
    </div>
  );
};

export default Pave2D;
