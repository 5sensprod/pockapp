// frontend/modules/stick/labels/components/ui/EtatVide.jsx
//
// RIEN À MONTRER, ou pas encore : sept écritures de l'état vide, cinq du
// chargement. Une icône grise, une phrase, une action au plus.
//
// - `chargement` : l'icône devient une roue qui tourne ;
// - `action` : un nœud (un `Bouton`), sous la phrase.

import React from 'react';
import { Loader2 } from 'lucide-react';
import { AIDE } from './styles';

const EtatVide = ({ icone: Icone, titre, detail, action, chargement = false }) => (
  <div className="py-8 flex flex-col items-center gap-2 text-center" role={chargement ? 'status' : undefined}>
    {chargement ? (
      <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
    ) : (
      Icone && <Icone className="h-5 w-5 text-gray-400" />
    )}
    {titre && <p className="text-xs text-gray-600 dark:text-gray-300">{titre}</p>}
    {detail && <p className={AIDE}>{detail}</p>}
    {action}
  </div>
);

export default EtatVide;
