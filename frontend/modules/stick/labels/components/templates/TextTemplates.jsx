import React, { useMemo, useState, useEffect } from 'react';
import useLabelStore from '../../store/useLabelStore';

const TextTemplates = ({ dataSource, selectedProduct }) => {
  const { addElement, elements, selectedProducts } = useLabelStore();

  // Produit affiché en mode données
  const displayProduct = useMemo(() => {
    return selectedProduct || (selectedProducts.length > 0 ? selectedProducts[0] : null);
  }, [selectedProduct, selectedProducts]);

  // Interrupteur local : "Utiliser les données"
  // Par défaut = true seulement si dataSource === 'data'
  const [useDataMode, setUseDataMode] = useState(dataSource === 'data');

  // Si le parent change de mode, on réinitialise le toggle par cohérence
  useEffect(() => {
    setUseDataMode(dataSource === 'data');
  }, [dataSource]);

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

  const handleAddText = (template) => {
    // Si l'interrupteur "Utiliser les données" est actif ET qu'on a un produit,
    // on créé un texte bindé (ex: name). Sinon on créé un texte statique (template.preview).
    const isDataActive = useDataMode && !!displayProduct;

    // Par défaut on bind sur "name" (adapter selon tes besoins / UI)
    const dataBinding = isDataActive ? 'name' : null;
    const text = isDataActive ? displayProduct.name : template.preview;

    addElement({
      type: 'text',
      text,
      x: 50,
      y: 50 + elements.length * 40,
      fontSize: template.fontSize,
      bold: template.bold,
      color: template.color || '#000000',
      dataBinding,
    });
  };

  return (
    <div className="p-4 space-y-3">
      {/* En-tête + interrupteur */}
      <div className="flex items-center justify-between mb-2">
        {/* <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {useDataMode
            ? displayProduct
              ? `Ajoutez un champ (basé sur : ${displayProduct.name})`
              : `Sélectionnez un produit pour ajouter un champ lié`
            : `Cliquez pour ajouter du texte statique`}
        </div> */}

        {/* Interrupteur "Utiliser les données" visible seulement si le mode global est 'data' */}
        {dataSource === 'data' && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 select-none">
            <span>Utiliser les données</span>
            <button
              type="button"
              onClick={() => setUseDataMode((v) => !v)}
              className={
                'relative inline-flex h-5 w-9 items-center rounded-full transition ' +
                (useDataMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')
              }
              title="Basculer entre champ lié aux données et texte statique"
            >
              <span
                className={
                  'inline-block h-4 w-4 transform rounded-full bg-white transition ' +
                  (useDataMode ? 'translate-x-4' : 'translate-x-1')
                }
              />
            </button>
          </label>
        )}
      </div>

      {/* Liste des templates */}
      {templates.map((template) => {
        const disabled = useDataMode && !displayProduct; // si on veut des données mais aucun produit
        return (
          <button
            key={template.id}
            onClick={() => handleAddText(template)}
            disabled={disabled}
            className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{template.label}</div>
            <div
              style={{
                fontSize: `${Math.min(template.fontSize, 24)}px`,
                fontWeight: template.bold ? 'bold' : 'normal',
                color: template.color || 'inherit',
              }}
            >
              {template.preview}
            </div>
            {/* Hint de ce qui sera créé */}
            <div className="mt-1 text-[11px] text-gray-400">
              {useDataMode
                ? displayProduct
                  ? 'Champ lié aux données (name)'
                  : 'Sélectionner un produit pour créer un champ lié'
                : 'Texte statique'}
            </div>
          </button>
        );
      })}

      {useDataMode && !displayProduct && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">Aucun produit sélectionné</p>
          <p className="text-xs mt-1">
            Ou désactivez “Utiliser les données” pour ajouter du texte statique.
          </p>
        </div>
      )}
    </div>
  );
};

export default TextTemplates;
