// frontend/modules/stick/labels/components/templates/TextTemplates.jsx
//
// Des textes STATIQUES, par style. Le texte LIÉ à une donnée du produit
// s'ajoute depuis l'onglet « Données produit » : l'interrupteur « Utiliser les
// données » d'ici, qui liait tout texte au nom du produit, est retiré le
// 29 septembre 2026. Un texte statique se lie ensuite, si besoin, par le bloc
// « Lié à » de ses réglages.
//
// Six tuiles en deux colonnes (3 octobre 2026) : les six cartes pleine largeur
// faisaient ~650 px, plus que l'écran.
import React from 'react';
import useLabelStore from '../../store/useLabelStore';
import { mesurerTexte } from '../../utils/mesurerTexte';
import CarteProposition from '../ui/CarteProposition';
import GrilleVignettes from '../ui/GrilleVignettes';
import LienProduit from '../ui/LienProduit';
import { PANNEAU } from '../ui/styles';

const TEMPLATES = [
  { id: 'heading', label: 'Titre', preview: 'Titre Principal', fontSize: 32, bold: true },
  { id: 'subtitle', label: 'Sous-titre', preview: 'Sous-titre', fontSize: 24, bold: false },
  { id: 'price', label: 'Prix', preview: '19,99€', fontSize: 48, bold: true, color: '#ef4444' },
  { id: 'discount', label: 'Promotion', preview: '-30%', fontSize: 36, bold: true, color: '#22c55e' },
  { id: 'body', label: 'Corps', preview: 'Texte normal', fontSize: 16, bold: false },
  { id: 'small', label: 'Petit', preview: 'Petit texte', fontSize: 12, bold: false },
];

const TextTemplates = ({ onOpenTool }) => {
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
    <div className={PANNEAU}>
      <GrilleVignettes colonnes={2}>
        {TEMPLATES.map((template) => (
          <CarteProposition
            key={template.id}
            titre={template.label}
            onAjout={() => handleAddText(template)}
            apercu={
              // Le texte dans SON style, plafonné à 20 px : la tuile en fait 64
              <span
                className="max-w-full truncate leading-none text-gray-900 dark:text-white"
                style={{
                  fontSize: `${Math.min(template.fontSize, 20)}px`,
                  fontWeight: template.bold ? 'bold' : 'normal',
                  color: template.color,
                }}
              >
                {template.preview}
              </span>
            }
          />
        ))}
      </GrilleVignettes>
      {onOpenTool && <LienProduit onClic={() => onOpenTool('donnees')}>Nom, prix… du produit</LienProduit>}
    </div>
  );
};

export default TextTemplates;
