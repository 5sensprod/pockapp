// src/features/labels/components/templates/BarcodeTemplates.jsx
import React from 'react';
import { Barcode as BarcodeIcon, AlertCircle } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';

/**
 * BarcodeTemplates - Templates de codes-barres (visible uniquement en mode données)
 * Utilise JsBarcode pour générer les codes-barres
 *
 * Formats supportés :
 * - CODE128 (défaut, le plus polyvalent)
 * - EAN13 (codes produits européens)
 * - EAN8 (codes produits courts)
 * - UPC (codes produits américains)
 * - CODE39 (codes industriels)
 */
const BarcodeTemplates = ({ dataSource, selectedProduct }) => {
  const { addElement, elements, selectedProducts } = useLabelStore();

  // Produit à afficher (priorité : selectedProduct > premier de la liste)
  const displayProduct =
    selectedProduct || (selectedProducts.length > 0 ? selectedProducts[0] : null);

  // Récupérer la valeur du code-barres depuis le produit
  const getBarcodeValue = () => {
    if (!displayProduct) return '';

    // Chercher dans meta_data
    const barcodeMeta = displayProduct?.meta_data?.find?.((m) => m.key === 'barcode');
    if (barcodeMeta?.value) return barcodeMeta.value;

    // Fallback sur SKU
    return displayProduct.sku || '';
  };

  const barcodeValue = getBarcodeValue();

  /**
   * Formats de codes-barres disponibles
   */
  const formats = [
    {
      id: 'CODE128',
      label: 'CODE128',
      description: 'Format universel (recommandé)',
      width: 200,
      height: 80,
      displayValue: true,
    },
    {
      id: 'EAN13',
      label: 'EAN-13',
      description: 'Code produit européen (13 chiffres)',
      width: 200,
      height: 80,
      displayValue: true,
      validator: (value) => /^\d{13}$/.test(value),
      validationMsg: 'EAN-13 nécessite exactement 13 chiffres',
    },
    {
      id: 'EAN8',
      label: 'EAN-8',
      description: 'Code produit court (8 chiffres)',
      width: 150,
      height: 80,
      displayValue: true,
      validator: (value) => /^\d{8}$/.test(value),
      validationMsg: 'EAN-8 nécessite exactement 8 chiffres',
    },
    {
      id: 'UPC',
      label: 'UPC-A',
      description: 'Code produit américain (12 chiffres)',
      width: 200,
      height: 80,
      displayValue: true,
      validator: (value) => /^\d{12}$/.test(value),
      validationMsg: 'UPC-A nécessite exactement 12 chiffres',
    },
    {
      id: 'CODE39',
      label: 'CODE39',
      description: 'Code industriel',
      width: 200,
      height: 80,
      displayValue: true,
    },
  ];

  /**
   * Ajouter un code-barres au canvas
   */
  const handleAddBarcode = (format) => {
    // Validation du format si nécessaire
    if (format.validator && barcodeValue && !format.validator(barcodeValue)) {
      alert(format.validationMsg || 'Format de code-barres invalide');
      return;
    }

    addElement({
      type: 'barcode',
      id: undefined, // sera injecté par le store
      x: 50,
      y: 50 + elements.length * 30,
      width: format.width,
      height: format.height,
      barcodeValue: barcodeValue,
      format: format.id,
      displayValue: format.displayValue,
      fontSize: 14,
      textMargin: 2,
      margin: 10,
      background: '#FFFFFF',
      lineColor: '#000000',
      visible: true,
      locked: false,
      // 🔗 Binding automatique en mode données
      dataBinding: 'barcode',
    });
  };

  // Mode vierge : pas de codes-barres
  if (dataSource === 'blank') {
    return (
      <div className="p-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-start gap-2">
            <BarcodeIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="font-medium mb-1">Codes-barres non disponibles</div>
              <div>
                Les codes-barres sont uniquement disponibles en mode <strong>Données</strong>.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode données sans produit sélectionné
  if (!displayProduct) {
    return (
      <div className="p-4">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <div className="font-medium mb-1">Aucun produit sélectionné</div>
              <div>Sélectionnez un produit pour générer son code-barres.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode données sans code-barres
  if (!barcodeValue) {
    return (
      <div className="p-4 space-y-3">
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <div className="font-medium mb-1">Code-barres non trouvé</div>
              <div>
                Le produit <strong>{displayProduct.name}</strong> n'a pas de code-barres.
              </div>
              <div className="mt-2 text-xs">
                SKU du produit :{' '}
                <code className="bg-yellow-100 dark:bg-yellow-900 px-1 py-0.5 rounded">
                  {displayProduct.sku || 'N/A'}
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode données avec code-barres valide
  return (
    <div className="p-4 space-y-4">
      {/* Info produit */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
        <div className="flex items-start gap-2">
          <BarcodeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-200">
            <div className="font-medium mb-1">Code-barres du produit</div>
            <div className="mb-2">{displayProduct.name}</div>
            <div className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded inline-block">
              {barcodeValue}
            </div>
          </div>
        </div>
      </div>

      {/* Formats disponibles */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Formats de codes-barres
        </h3>
        <div className="space-y-2">
          {formats.map((format) => {
            // Vérifier si le format est compatible avec la valeur
            const isCompatible = !format.validator || format.validator(barcodeValue);

            return (
              <button
                key={format.id}
                onClick={() => handleAddBarcode(format)}
                disabled={!isCompatible}
                className={`w-full p-4 border rounded-lg text-left transition-all ${
                  isCompatible
                    ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <BarcodeIcon className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {format.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {format.width}×{format.height}px
                  </span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{format.description}</div>
                {!isCompatible && format.validationMsg && (
                  <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                    ⚠️ {format.validationMsg}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info technique */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <div>
            💡 <strong>CODE128</strong> est recommandé pour la plupart des usages
          </div>
          <div>📦 Le code-barres sera automatiquement lié au produit</div>
          <div>🖨️ Format optimisé pour l'impression et le scan</div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeTemplates;
