// frontend/modules/stick/labels/components/ui/GrilleVignettes.jsx
//
// LA GRILLE des tuiles et des vignettes : 2, 3 ou 4 colonnes, écart de 8 px.
// Sur 311 px utiles : 151, 98 ou 71 px par case.

import React from 'react';

// Classes entières : Tailwind ne voit pas un nom composé à l'exécution.
const COLONNES = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

const GrilleVignettes = ({ colonnes = 3, className = '', children }) => (
  <div className={`grid gap-2 ${COLONNES[colonnes] ?? COLONNES[3]} ${className}`}>{children}</div>
);

export default GrilleVignettes;
