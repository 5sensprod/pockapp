// frontend/modules/stick/labels/components/templates/QRCodeTemplates.jsx
//
// Un QR code STATIQUE : il encode la valeur saisie dans les Propriétés
// (« Contenu »), la même pour tous les produits. Le QR LIÉ à l'adresse du
// produit sur le site s'ajoute depuis l'onglet « Données produit »
// (`utils/ajoutsProduit.js`, `ajouterQRProduit`) — depuis le 29 septembre 2026.
import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { QR_PAR_DEFAUT } from '../../utils/ajoutsProduit';

const VALEUR_PAR_DEFAUT = 'https://example.com';

const QRCodeTemplates = () => {
  const addElementCentre = useLabelStore((s) => s.addElementCentre);

  const handleAdd = () => {
    addElementCentre({ ...QR_PAR_DEFAUT, qrValue: VALEUR_PAR_DEFAUT, dataBinding: null });
  };

  return (
    <div className="p-4 space-y-3">
      <button
        onClick={handleAdd}
        className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">QR Code</div>
        <div className="text-sm">Ajouter un QR Code au canvas</div>
        <div className="text-[11px] text-gray-400 mt-1">
          Valeur fixe, à saisir dans les Propriétés (« Contenu »).
        </div>
      </button>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Un QR qui mène à la page de chaque produit : onglet{' '}
        <span className="text-orange-600 dark:text-orange-400">Données produit</span>.
      </p>
    </div>
  );
};

export default QRCodeTemplates;
