// frontend/modules/stick/labels/components/ui/Vignette.jsx
//
// LA VIGNETTE D'UNE IMAGE (bibliothèque du poste, PocketStock, modèles, galerie
// du produit). Six écritures, de 32 à 311 px. Une seule : rayon 6, anneau de
// 1 px, fond BLANC dans les deux thèmes — un logo noir sur transparent
// disparaîtrait sur le gris du thème sombre.
//
// - `ajuste` : `contain` (l'image entière, le défaut) ou `cover` ;
// - `nom` : en infobulle ; affiché dessous si `montrerNom` ;
// - `action` : un nœud posé DANS LE COIN, visible au survol et au focus —
//   jamais au centre, c'est là qu'on clique pour ajouter l'image ;
// - `produit` : anneau orange au survol — l'image vient de la fiche produit.
//
// `action` étant un bouton, la vignette est un `div` cliquable et non un
// `<button>` : deux boutons ne s'imbriquent pas.

import React from 'react';

const Vignette = ({
  src,
  nom,
  montrerNom = false,
  ajuste = 'contain',
  produit = false,
  desactive = false,
  action,
  onClic,
  // Largeur / hauteur du cadre ; absent : carré
  proportions,
  children,
}) => (
  <div className={`group relative min-w-0 ${desactive ? 'opacity-50 pointer-events-none' : ''}`}>
    <div
      role="button"
      tabIndex={desactive ? -1 : 0}
      title={nom}
      aria-label={nom}
      onClick={onClic}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClic?.(e);
        }
      }}
      style={proportions ? { aspectRatio: proportions } : undefined}
      className={`${proportions ? '' : 'aspect-square '}rounded-md overflow-hidden cursor-pointer bg-white ring-1 ring-inset ring-gray-200 dark:ring-gray-600 hover:ring-2 focus-visible:ring-2 focus-visible:outline-none ${
        produit ? 'hover:ring-orange-500 focus-visible:ring-orange-500' : 'hover:ring-blue-500 focus-visible:ring-blue-500'
      }`}
    >
      {src ? (
        <img
          src={src}
          alt={nom ?? ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`w-full h-full ${ajuste === 'cover' ? 'object-cover' : 'object-contain p-1'}`}
        />
      ) : (
        children
      )}
    </div>
    {action && (
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {action}
      </div>
    )}
    {montrerNom && nom && (
      <div className="mt-1 text-[11px] leading-tight truncate text-center text-gray-600 dark:text-gray-400">{nom}</div>
    )}
  </div>
);

export default Vignette;
