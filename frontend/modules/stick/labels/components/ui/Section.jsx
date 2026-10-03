// frontend/modules/stick/labels/components/ui/Section.jsx
//
// UNE SECTION de la barre latérale : un titre, un filet au-dessus, et — pour
// un effet qu'on active — un interrupteur dans l'en-tête (le motif de Figma :
// un effet par ligne, son détail n'apparaît qu'activé). Repliable par son
// titre. Des filets plutôt que des cartes encadrées : le panneau fait 311 px.
//
// - `actif` / `onActif` : affiche l'interrupteur ; le corps n'apparaît
//   qu'activé (sinon `aide`, une ligne grise) ;
// - `avant` : montré même quand l'effet est coupé — des préréglages, qui
//   l'activent en un clic ;
// - sans eux : une section ordinaire, toujours pleine ;
// - `ouvertParDefaut` : l'état au montage. Pour qu'il suive l'élément
//   sélectionné, l'appelant change la `key` (`ReglagesPanel`) ;
// - `marque` : un point bleu dans l'en-tête quand la section est repliée.

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Interrupteur from './Interrupteur';

const Section = ({ titre, actif, onActif, aide, avant, marque = false, ouvertParDefaut = true, children }) => {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const activable = typeof onActif === 'function';
  const Chevron = ouvert ? ChevronDown : ChevronRight;

  return (
    <section className="border-t border-gray-200 dark:border-gray-700 py-2 first:border-t-0">
      <div className="h-8 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="flex-1 min-w-0 flex items-center gap-1 text-left text-xs font-semibold text-gray-800 dark:text-gray-200"
        >
          <Chevron className="h-3.5 w-3.5 flex-none text-gray-400" />
          <span className="truncate">{titre}</span>
          {/* Repliée mais réglée : un point le dit, sans avoir à l'ouvrir */}
          {marque && !ouvert && <span className="h-1.5 w-1.5 flex-none rounded-full bg-blue-500" title="Un réglage est actif ici" />}
        </button>
        {activable && (
          <Interrupteur
            actif={actif}
            onActif={(v) => {
              onActif(v);
              if (v) setOuvert(true);
            }}
            label={actif ? `Couper : ${titre}` : `Activer : ${titre}`}
          />
        )}
      </div>
      {ouvert && avant && <div className="pt-1 pb-2">{avant}</div>}
      {ouvert &&
        (!activable || actif ? (
          <div className="pt-1 pb-2 space-y-3">{children}</div>
        ) : (
          aide && <p className="pb-1 text-[11px] text-gray-500 dark:text-gray-400">{aide}</p>
        ))}
    </section>
  );
};

export default Section;
