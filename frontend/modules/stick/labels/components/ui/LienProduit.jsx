// frontend/modules/stick/labels/components/ui/LienProduit.jsx
//
// LE RENVOI vers ce qui vient de la fiche produit (« Nom, prix… du produit → »),
// en bas d'un panneau qui n'ajoute que du statique. Un lien qu'on clique, à la
// place des paragraphes « … : onglet Données produit ». Orange : c'est la
// fiche produit.

import React from 'react';
import { Link2 } from 'lucide-react';

const LienProduit = ({ onClic, children }) => (
  <button
    type="button"
    onClick={onClic}
    className="h-7 inline-flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 hover:underline"
  >
    <Link2 className="h-3.5 w-3.5 flex-none" />
    <span>{children} →</span>
  </button>
);

export default LienProduit;
