// frontend/modules/stick/labels/components/ui/TitreGroupe.jsx
//
// LE TITRE D'UN GROUPE qui ne se replie pas (« Marques · 179 »). Il y en avait
// sept écritures. Ce qui se replie reste une `Section`.
//
// - `compte` : un nombre, après un point médian, en gris ;
// - `action` : un nœud à droite (un bouton discret, une icône) ;
// - `produit` : titre orange — le groupe vient de la fiche produit.

import React from 'react';

const TitreGroupe = ({ titre, compte, action, produit = false }) => (
  <div className="h-6 flex items-center justify-between gap-2">
    <h3
      className={`min-w-0 truncate text-xs font-medium ${
        produit ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-gray-200'
      }`}
    >
      {titre}
      {compte !== undefined && compte !== null && (
        <span className="font-normal text-gray-500 dark:text-gray-400"> · {compte}</span>
      )}
    </h3>
    {action}
  </div>
);

export default TitreGroupe;
