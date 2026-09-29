// frontend/modules/stick/labels/components/templates/TextTemplates.jsx
//
// Des textes STATIQUES, par style. Le texte LIÉ à une donnée du produit
// s'ajoute depuis l'onglet « Données produit » : l'interrupteur « Utiliser les
// données » d'ici, qui liait tout texte au nom du produit, est retiré le
// 29 septembre 2026. Un texte statique se lie ensuite, si besoin, par le bloc
// « Donnée produit » des Propriétés.
import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { mesurerTexte } from '../../utils/mesurerTexte';

const TEMPLATES = [
  { id: 'heading', label: 'Titre', preview: 'Titre Principal', fontSize: 32, bold: true },
  { id: 'subtitle', label: 'Sous-titre', preview: 'Sous-titre', fontSize: 24, bold: false },
  { id: 'price', label: 'Prix', preview: '19,99€', fontSize: 48, bold: true, color: '#ef4444' },
  { id: 'discount', label: 'Promotion', preview: '-30%', fontSize: 36, bold: true, color: '#22c55e' },
  { id: 'body', label: 'Corps', preview: 'Texte normal', fontSize: 16, bold: false },
  { id: 'small', label: 'Petit', preview: 'Petit texte', fontSize: 12, bold: false },
];

const TextTemplates = () => {
  const addElementCentre = useLabelStore((s) => s.addElementCentre);

  const handleAddText = (template) => {
    const el = {
      type: 'text',
      text: template.preview,
      fontSize: template.fontSize,
      bold: template.bold,
      color: template.color || '#000000',
      dataBinding: null,
    };
    addElementCentre(el, mesurerTexte(el));
  };

  return (
    <div className="p-4 space-y-3">
      {TEMPLATES.map((template) => (
        <button
          key={template.id}
          onClick={() => handleAddText(template)}
          className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
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
        </button>
      ))}
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Un texte qui suit le produit (nom, prix, marque…) : onglet{' '}
        <span className="text-orange-600 dark:text-orange-400">Données produit</span>.
      </p>
    </div>
  );
};

export default TextTemplates;
