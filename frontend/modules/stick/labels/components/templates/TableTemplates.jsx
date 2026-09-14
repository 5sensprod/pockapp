// src/features/labels/components/templates/TextTemplates.jsx
import React from 'react';
import useLabelStore from '../../store/useLabelStore';

const TextTemplates = ({ dataSource, selectedProduct }) => {
  const addElement = useLabelStore((state) => state.addElement);

  const templates = [
    { id: 'heading', label: 'Titre', preview: 'Titre Principal', fontSize: 32, bold: true },
    { id: 'subtitle', label: 'Sous-titre', preview: 'Sous-titre', fontSize: 24, bold: false },
    { id: 'price', label: 'Prix', preview: '19,99€', fontSize: 48, bold: true, color: '#ef4444' },
    {
      id: 'discount',
      label: 'Promotion',
      preview: '-30%',
      fontSize: 36,
      bold: true,
      color: '#22c55e',
    },
    { id: 'body', label: 'Corps', preview: 'Texte normal', fontSize: 16, bold: false },
    { id: 'small', label: 'Petit', preview: 'Petit texte', fontSize: 12, bold: false },
  ];

  const dataFields = selectedProduct
    ? [
        { key: 'name', label: 'Nom du produit', value: selectedProduct.name },
        { key: 'price', label: 'Prix', value: `${selectedProduct.price}€` },
        { key: 'brand', label: 'Marque', value: selectedProduct.brand_ref?.name },
        { key: 'sku', label: 'Référence', value: selectedProduct.sku },
        { key: 'stock', label: 'Stock', value: `Stock: ${selectedProduct.stock}` },
      ]
    : [];

  const handleAddText = (template, field = null) => {
    const text = field ? field.value : template.preview;

    addElement({
      type: 'text',
      text,
      x: 50,
      y: 50,
      fontSize: template.fontSize,
      bold: template.bold,
      color: template.color || '#000000',
      dataBinding: field ? field.key : null,
    });
  };

  return (
    <div className="p-4 space-y-3">
      {/* Mode vierge */}
      {dataSource === 'blank' && (
        <>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Cliquez pour ajouter du texte
          </div>
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleAddText(template)}
              className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{template.label}</div>
              <div
                style={{
                  fontSize: `${template.fontSize}px`,
                  fontWeight: template.bold ? 'bold' : 'normal',
                  color: template.color || 'inherit',
                }}
              >
                {template.preview}
              </div>
            </button>
          ))}
        </>
      )}

      {/* Mode données */}
      {dataSource === 'data' && selectedProduct && (
        <>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Style de texte
          </div>
          {templates.map((template) => (
            <div key={template.id} className="space-y-1">
              <div className="text-xs text-gray-500 dark:text-gray-400 px-2">{template.label}</div>
              <div className="space-y-1">
                {dataFields.map((field) => (
                  <button
                    key={`${template.id}-${field.key}`}
                    onClick={() => handleAddText(template, field)}
                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {field.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                        Données
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: `${Math.min(template.fontSize, 20)}px`,
                        fontWeight: template.bold ? 'bold' : 'normal',
                        color: template.color || 'inherit',
                      }}
                      className="truncate"
                    >
                      {field.value}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {dataSource === 'data' && !selectedProduct && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">Aucun produit sélectionné</p>
        </div>
      )}
    </div>
  );
};

export default TextTemplates;
