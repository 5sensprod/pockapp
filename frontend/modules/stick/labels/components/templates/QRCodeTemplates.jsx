// src/features/labels/components/templates/QRCodeTemplates.jsx
import React from 'react';
import useLabelStore from '../../store/useLabelStore';

/**
 * Détermine le meilleur champ à binder en priorité
 * Ordre : website_url > barcode > sku
 */
const defaultBindingFor = (product) => {
  if (!product) return null;

  const barcode = product?.meta_data?.find?.((m) => m.key === 'barcode')?.value;

  if (product.website_url) return 'website_url';
  if (barcode) return 'barcode';
  if (product.sku) return 'sku';

  return null;
};

/**
 * Récupère la valeur par défaut du QR
 */
const defaultQRValue = (product) => {
  if (!product) return 'https://example.com';

  const barcode = product?.meta_data?.find?.((m) => m.key === 'barcode')?.value;
  return product.website_url || barcode || product.sku || product._id || 'https://example.com';
};

const QRCodeTemplates = ({ dataSource, selectedProduct }) => {
  const { addElement, elements, selectedProducts } = useLabelStore();

  const displayProduct =
    selectedProduct || (selectedProducts.length > 0 ? selectedProducts[0] : null);

  const handleAdd = () => {
    // ✅ Définir le binding dès la création si en mode données
    const binding =
      dataSource === 'data' && displayProduct ? defaultBindingFor(displayProduct) : null;

    addElement({
      type: 'qrcode',
      id: undefined, // sera injecté par le store
      x: 60,
      y: 60 + elements.length * 30,
      size: 160,
      color: '#000000',
      bgColor: '#FFFFFF00',
      qrValue: defaultQRValue(displayProduct), // valeur visible immédiate
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
              Lié au champ : <strong>{defaultBindingFor(displayProduct)}</strong>
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
