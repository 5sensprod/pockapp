// src/features/labels/components/PropertyPanel.jsx
import React from 'react';
import {
  Palette,
  Link,
  Unlink,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
} from 'lucide-react';
import useLabelStore from '../store/useLabelStore';
import FontSelector from './FontSelector';
import { FORMATS_TEXTE_CODE_BARRES } from '../utils/barcodeText';

const PropertyPanel = ({ selectedProduct, onOpenEffects }) => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const updateElement = useLabelStore((s) => s.updateElement);
  const dataSource = useLabelStore((s) => s.dataSource);

  const selectedElement = elements.find((el) => el.id === selectedId);
  if (!selectedElement) return null;

  const isQRCode = selectedElement.type === 'qrcode';
  const isText = selectedElement.type === 'text';
  const isImage = selectedElement.type === 'image';
  const isBarcode = selectedElement.type === 'barcode';
  const isShape = selectedElement.type === 'shape';

  const dataFields = selectedProduct
    ? [
        { key: 'name', label: 'Nom du produit', value: selectedProduct.name },
        { key: 'price', label: 'Prix', value: `${selectedProduct.price}€` },
        {
          key: 'sale_price',
          label: 'Prix promo',
          value:
            selectedProduct.sale_price != null && selectedProduct.sale_price !== ''
              ? `${selectedProduct.sale_price}€`
              : `${selectedProduct.price}€`,
        },
        { key: 'description', label: 'Description', value: selectedProduct.description ?? '' },
        { key: 'brand', label: 'Marque', value: selectedProduct.brand_ref?.name ?? '' },
        { key: 'sku', label: 'Référence', value: selectedProduct.sku },
        { key: 'stock', label: 'Stock', value: `Stock: ${selectedProduct.stock}` },
        { key: 'supplier', label: 'Fournisseur', value: selectedProduct.supplier_ref?.name ?? '' },
        { key: 'website_url', label: 'URL produit', value: selectedProduct.website_url ?? '' },
        {
          key: 'barcode',
          label: 'Code-barres',
          value: selectedProduct?.meta_data?.find?.((m) => m.key === 'barcode')?.value ?? '',
        },
      ]
    : [];

  const handleColorChange = (color) => updateElement(selectedId, { color });

  // ✅ Ne plus "figer" la valeur : on n'écrit que dataBinding
  const handleFieldChange = (fieldKey) => {
    const field = dataFields.find((f) => f.key === fieldKey);
    if (!field) return;

    if (isText) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
    if (isQRCode) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
    if (isBarcode) {
      updateElement(selectedId, { dataBinding: field.key });
      return;
    }
  };

  const handleQRValueChange = (value) => {
    // Valeur fixe quand pas de binding
    updateElement(selectedId, { qrValue: value });
  };

  const handleUnbind = () => {
    updateElement(selectedId, { dataBinding: null });
  };

  const getDefaultQRBindingKey = () => {
    const pref = ['website_url', 'barcode', 'sku'];
    for (const key of pref) {
      const f = dataFields.find((d) => d.key === key);
      if (f && f.value) return key;
    }
    return null;
  };

  /** Lier/Délier un QR au produit (toggle) */
  const handleQRBinding = () => {
    if (!selectedProduct) return;
    if (selectedElement.dataBinding) {
      updateElement(selectedId, { dataBinding: null });
      return;
    }
    const key = getDefaultQRBindingKey();
    if (key) updateElement(selectedId, { dataBinding: key });
  };

  /** Lier/Délier une image au produit */
  const handleImageBinding = () => {
    if (selectedElement.dataBinding) {
      updateElement(selectedId, { dataBinding: null });
    } else {
      updateElement(selectedId, { dataBinding: 'product_image' });
    }
  };

  const handleBarcodeColorChange = (value) => {
    updateElement(selectedId, { lineColor: value });
  };
  const handleBarcodeBgChange = (value) => {
    updateElement(selectedId, { background: value });
  };

  /** Opacité pour les images */
  const handleOpacityChange = (value) => {
    updateElement(selectedId, { opacity: parseFloat(value) });
  };

  /** 🎨 Changement de police pour les textes */
  const handleFontFamilyChange = (fontFamily) => {
    updateElement(selectedId, { fontFamily });
  };

  // --- Gras / Italique (fontStyle Konva: 'normal' | 'bold' | 'italic' | 'italic bold')
  const isBold = (selectedElement.fontStyle || '').includes('bold');
  const isItalic = (selectedElement.fontStyle || '').includes('italic');

  const setFontStyle = (bold, italic) => {
    let value = 'normal';
    if (bold && italic) value = 'italic bold';
    else if (bold) value = 'bold';
    else if (italic) value = 'italic';
    updateElement(selectedId, { fontStyle: value });
  };

  const toggleBold = () => setFontStyle(!isBold, isItalic);
  const toggleItalic = () => setFontStyle(isBold, !isItalic);

  // --- Souligné / Barré (textDecoration Konva: '' | 'underline' | 'line-through' | 'underline line-through')
  const decoTokens = (selectedElement.textDecoration || '').split(' ').filter(Boolean);
  const isUnderline = decoTokens.includes('underline');
  const isStrike = decoTokens.includes('line-through');

  const setTextDecoration = (underline, strike) => {
    const tokens = [];
    if (underline) tokens.push('underline');
    if (strike) tokens.push('line-through');
    updateElement(selectedId, { textDecoration: tokens.join(' ') });
  };

  const toggleUnderline = () => setTextDecoration(!isUnderline, isStrike);
  const toggleStrike = () => setTextDecoration(isUnderline, !isStrike);

  // --- Surlignage type stabilo
  const isHighlighted = !!selectedElement.highlightEnabled;
  const toggleHighlight = () => {
    updateElement(selectedId, {
      highlightEnabled: !isHighlighted,
      highlightColor: selectedElement.highlightColor || '#FFFF00',
    });
  };
  const handleHighlightColorChange = (color) => {
    updateElement(selectedId, { highlightColor: color, highlightEnabled: true });
  };

  return (
    <div className="">
      <div className="flex items-center gap-4 px-4 ">
        {/* 🎨 Sélecteur de police pour les textes */}
        {isText && (
          <>
            <FontSelector
              value={selectedElement.fontFamily || 'Arial'}
              onChange={handleFontFamilyChange}
              apiKey={import.meta.env.VITE_GOOGLE_FONTS_KEY} // optionnel si ton FontSelector lit déjà l'env
            />
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            {/* Gras / Italique / Souligné / Barré */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleBold}
                className={`p-1.5 rounded-lg transition-colors ${
                  isBold
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Gras"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                onClick={toggleItalic}
                className={`p-1.5 rounded-lg transition-colors ${
                  isItalic
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Italique"
              >
                <Italic className="h-4 w-4" />
              </button>
              <button
                onClick={toggleUnderline}
                className={`p-1.5 rounded-lg transition-colors ${
                  isUnderline
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Souligné"
              >
                <Underline className="h-4 w-4" />
              </button>
              <button
                onClick={toggleStrike}
                className={`p-1.5 rounded-lg transition-colors ${
                  isStrike
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Barré"
              >
                <Strikethrough className="h-4 w-4" />
              </button>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            {/* Surlignage type stabilo */}
            <div className="flex items-center gap-1">
              <button
                onClick={toggleHighlight}
                className={`p-1.5 rounded-lg transition-colors ${
                  isHighlighted
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title="Surligner"
              >
                <Highlighter className="h-4 w-4" />
              </button>
              {isHighlighted && (
                <input
                  type="color"
                  value={selectedElement.highlightColor || '#FFFF00'}
                  onChange={(e) => handleHighlightColorChange(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                  title="Couleur du surlignage"
                />
              )}
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
          </>
        )}

        {(isText || isQRCode) && (
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <input
              type="color"
              value={selectedElement.color || '#000000'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              title="Couleur"
            />
          </div>
        )}

        {isQRCode && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Contenu:
              </span>
              <input
                type="text"
                value={selectedElement.qrValue || ''}
                onChange={(e) => handleQRValueChange(e.target.value)}
                placeholder="Texte, URL, SKU..."
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-[220px]"
                disabled={!!selectedElement.dataBinding}
              />
            </div>
          </>
        )}

        {isBarcode && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Couleur:
              </span>
              <input
                type="color"
                value={selectedElement.lineColor || '#000000'}
                onChange={(e) => handleBarcodeColorChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Fond:
              </span>
              <input
                type="color"
                value={selectedElement.background || '#FFFFFF'}
                onChange={(e) => handleBarcodeBgChange(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>

            {/* Hauteur des BARRES, indépendante de la hauteur du cadre. Vide =
                l'ancien calcul (tout le cadre moins la place du numéro). */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Hauteur barres:
              </span>
              <input
                type="number"
                min={1}
                max={400}
                step={1}
                placeholder="auto"
                value={selectedElement.barHeight ?? ''}
                onChange={(e) =>
                  updateElement(selectedId, {
                    barHeight: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Hauteur des barres, en pixels. Vide : elle suit le cadre. Le numéro sous les barres garde sa taille."
              />
            </div>

            {/* Épaisseur d'un module : c'est elle qui décide de la largeur
                totale du symbole, et de sa lisibilité au scanner. */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Largeur barres:
              </span>
              <input
                type="number"
                min={0}
                max={6}
                step={0.5}
                placeholder="auto"
                value={selectedElement.barWidth ?? ''}
                onChange={(e) => {
                  // Vide ou 0 valent « auto », exactement comme pour la hauteur :
                  // on efface le réglage au lieu d'écrire une largeur nulle, qui
                  // ne produirait aucune barre.
                  const saisie = Number(e.target.value);
                  updateElement(selectedId, {
                    barWidth: e.target.value === '' || saisie <= 0 ? undefined : saisie,
                  });
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Largeur d'une barre fine, en pixels. Vide ou 0 : largeur automatique. Plus elle est grande, plus le symbole est large et trapu."
              />
            </div>

            {/* Groupement du numéro AFFICHÉ. Ce qui est encodé ne change pas :
                un scanner lit les barres, jamais le texte. */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Numéro:
              </span>
              <select
                value={selectedElement.textFormat || 'brut'}
                onChange={(e) => updateElement(selectedId, { textFormat: e.target.value })}
                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Présentation du numéro sous les barres"
              >
                {FORMATS_TEXTE_CODE_BARRES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {isShape && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Remplissage:
              </span>
              <input
                type="color"
                value={selectedElement.fill || '#3b82f6'}
                onChange={(e) => updateElement(selectedId, { fill: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Contour:
              </span>
              <input
                type="color"
                value={selectedElement.stroke || '#0f172a'}
                onChange={(e) => updateElement(selectedId, { stroke: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
              />
              {/* Sans épaisseur, la couleur de contour ne se voit pas : les deux
                  réglages vont ensemble. */}
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={selectedElement.strokeWidth ?? 0}
                onChange={(e) =>
                  updateElement(selectedId, { strokeWidth: Number(e.target.value) })
                }
                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                title="Épaisseur du contour, en pixels"
              />
            </div>

            {/* L'arrondi n'a de sens que pour un rectangle. */}
            {(selectedElement.shape ?? 'rectangle') === 'rectangle' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Arrondi:
                </span>
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={selectedElement.cornerRadius ?? 0}
                  onChange={(e) =>
                    updateElement(selectedId, { cornerRadius: Number(e.target.value) })
                  }
                  className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}
          </>
        )}

        {isImage && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Opacité:
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={selectedElement.opacity ?? 1}
                onChange={(e) => handleOpacityChange(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 w-8">
                {Math.round((selectedElement.opacity ?? 1) * 100)}%
              </span>
            </div>

            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedElement.width ?? 160}×{selectedElement.height ?? 160}px
              </span>
            </div>

            {dataSource === 'data' && selectedProduct && (
              <>
                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
                <button
                  onClick={handleImageBinding}
                  className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-colors ${
                    selectedElement.dataBinding
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                  title={
                    selectedElement.dataBinding
                      ? 'Image liée au produit'
                      : "Lier à l'image du produit"
                  }
                >
                  {selectedElement.dataBinding ? (
                    <>
                      <Link className="h-4 w-4" />
                      Liée
                    </>
                  ) : (
                    <>
                      <Unlink className="h-4 w-4" />
                      Lier
                    </>
                  )}
                </button>
              </>
            )}
          </>
        )}

        {dataSource === 'data' &&
          selectedProduct &&
          selectedElement.dataBinding &&
          (isText || isQRCode || isBarcode) && (
            <>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  Champ:
                </span>
                <select
                  value={selectedElement.dataBinding}
                  onChange={(e) => handleFieldChange(e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white max-w-[180px]"
                >
                  {dataFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleUnbind}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Utiliser une valeur fixe"
                >
                  Délier
                </button>
              </div>
            </>
          )}

        {onOpenEffects && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 ml-auto" />
            <button
              onClick={onOpenEffects}
              className="px-3 py-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors flex items-center gap-2 shrink-0"
              title="Ouvrir le panneau Effets"
            >
              <Sparkles className="h-4 w-4" />
              Effets
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
