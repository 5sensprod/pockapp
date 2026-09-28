// src/features/labels/components/templates/QRCodeTemplates.jsx
import React from 'react';
import useLabelStore from '../../store/useLabelStore';

/**
 * En mode données, un QR code est TOUJOURS lié à l'URL web du produit.
 * Avant, un produit sans URL basculait sur le code-barres puis la référence :
 * le QR s'imprimait, encodait un nombre, et un client qui le scannait
 * n'arrivait nulle part. Sans URL, le QR ne s'affiche pas (`KonvaCanvas.jsx`,
 * `exportPdfSheet.js`).
 */
const QR_BINDING = 'website_url';

/** Valeur fixe d'un QR hors données (mode vierge). */
const defaultQRValue = (product) => product?.website_url || 'https://example.com';

const QRCodeTemplates = ({ dataSource, selectedProduct }) => {
  const { addElement, elements, selectedProducts } = useLabelStore();

  const displayProduct =
    selectedProduct || (selectedProducts.length > 0 ? selectedProducts[0] : null);

  const handleAdd = () => {
    // ✅ Définir le binding dès la création si en mode données
    const binding =
      dataSource === 'data' && displayProduct ? QR_BINDING : null;

    addElement({
      type: 'qrcode',
      id: undefined, // sera injecté par le store
      x: 60,
      y: 60 + elements.length * 30,
      size: 160,
      color: '#000000',
      bgColor: '#FFFFFF00',
      // Lié : la valeur affichée vient du produit ; celle-ci ne sert qu'après « Délier ».
      qrValue: binding ? displayProduct.website_url || '' : defaultQRValue(displayProduct),
      dataBinding: binding, // 👈 clé pour l'export/PropertyPanel
      visible: true,
      locked: false,
    });
  };

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        {dataSource === 'blank'
          ? 'Cliquez pour ajouter un QR code'
          : displayProduct
            ? `QR basé sur : ${displayProduct.name}`
            : 'Sélectionnez un produit pour préremplir la valeur'}
      </div>

      <button
        onClick={handleAdd}
        disabled={dataSource === 'data' && !displayProduct}
        className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">QR Code</div>
        <div className="text-sm">Ajouter un QR Code au canvas</div>
        <div className="text-[11px] text-gray-400 mt-1">
          {dataSource === 'data' && displayProduct ? (
            <>
              Lié au champ : <strong>URL produit</strong>
              {!displayProduct.website_url && (
                <span className="block text-amber-600 dark:text-amber-400">
                  Ce produit n'a pas d'URL web : le QR ne s'affichera pas.
                </span>
              )}
            </>
          ) : (
            <>Valeur par défaut : {defaultQRValue(displayProduct) || '—'}</>
          )}
        </div>
      </button>
    </div>
  );
};

export default QRCodeTemplates;
