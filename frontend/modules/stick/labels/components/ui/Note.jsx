// frontend/modules/stick/labels/components/ui/Note.jsx
//
// UNE NOTE d'une ligne, à la place des encadrés colorés (indigo, bleu, ambre,
// orange, rouge — sept écritures). Ni fond ni bordure : la couleur du texte
// dit le ton, et l'ambre ne sert QUE d'avertissement.
//
// - `info` : gris ; `avertissement` : ambre, avec le triangle ;
//   `erreur` : rouge ; `produit` : orange (la fiche produit) ;
// - `action` : un nœud à la suite (un `Bouton` discret).

import React from 'react';
import { AlertTriangle } from 'lucide-react';

const TONS = {
  info: 'text-gray-500 dark:text-gray-400',
  avertissement: 'text-amber-700 dark:text-amber-400',
  erreur: 'text-red-600 dark:text-red-400',
  produit: 'text-orange-600 dark:text-orange-400',
};

const Note = ({ ton = 'info', action, children }) => (
  <div
    role={ton === 'erreur' ? 'alert' : undefined}
    className={`flex items-start gap-1.5 text-[11px] leading-snug ${TONS[ton] ?? TONS.info}`}
  >
    {ton === 'avertissement' && <AlertTriangle className="h-3.5 w-3.5 flex-none mt-px" />}
    <span className="flex-1 min-w-0">{children}</span>
    {action}
  </div>
);

export default Note;
