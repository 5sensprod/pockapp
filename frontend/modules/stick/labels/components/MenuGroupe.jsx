// frontend/modules/stick/labels/components/MenuGroupe.jsx
//
// Un GROUPE d'actions replié derrière un seul bouton de la barre d'options,
// pour garder de la place en largeur : style du texte, alignement,
// position… Le menu s'ouvre sous le bouton, en position ÉCRAN (`fixed`) : la
// barre défile (overflow) et couperait un menu en `absolute`. Sa place est
// tenue par `useFlottant` (dans l'écran, suit le défilement). Il reste ouvert
// tant qu'on clique dedans (plusieurs réglages d'affilée), se ferme au clic
// extérieur ou à Échap.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFlottant } from './useFlottant';

const MenuGroupe = ({ icone: Icone, titre, actif = false, children, largeur = 'auto' }) => {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  const bouton = useRef(null);
  const menu = useRef(null);
  const place = useFlottant(ouvert, bouton, menu);

  useEffect(() => {
    if (!ouvert) return undefined;
    const clic = (e) => {
      if (racine.current?.contains(e.target) || menu.current?.contains(e.target)) return;
      setOuvert(false);
    };
    const touche = (e) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('mousedown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, [ouvert]);

  return (
    <div ref={racine} className="flex-none">
      <button
        type="button"
        ref={bouton}
        onClick={() => setOuvert((o) => !o)}
        className={`flex items-center gap-0.5 p-1.5 rounded-lg transition-colors ${
          actif || ouvert
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
        }`}
        title={titre}
        aria-expanded={ouvert}
      >
        <Icone className="h-4 w-4" />
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {ouvert && (
        <div
          ref={menu}
          style={{ ...place, width: largeur }}
          className="fixed z-50 p-2 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl whitespace-normal"
        >
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">{titre}</div>
          {children}
        </div>
      )}
    </div>
  );
};

export default MenuGroupe;
