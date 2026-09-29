// frontend/modules/stick/labels/components/templates/FicheTemplates.jsx
//
// Ajouter une section de la fiche produit : Caractéristiques techniques (en
// tableau), Points forts (en puces), Conseils d'utilisation (en paragraphe).
// Le contenu vient du produit affiché ; sans section, l'élément ne s'imprime
// pas (voir `utils/ficheProduit.js`).

import React from 'react';
import { Table2, ListChecks, Lightbulb } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import { SECTIONS_FICHE, contenuFiche, EXEMPLE_FICHE } from '../../utils/ficheProduit';
import { FICHE_PAR_DEFAUT, construireFiche } from '../../utils/ficheKonva';

const ICONES = { specs: Table2, highlights: ListChecks, tips: Lightbulb };

const FicheTemplates = ({ selectedProduct }) => {
  const addElementCentre = useLabelStore((s) => s.addElementCentre);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const produitCanvas = useLabelStore((s) => s.selectedProduct);
  const produit = produitCanvas || selectedProduct;

  const ajouter = (section) => {
    const largeur = Math.min(FICHE_PAR_DEFAUT.width, Math.round(canvasSize.width * 0.8));
    const el = {
      ...FICHE_PAR_DEFAUT,
      type: 'fiche',
      section: section.id,
      title: section.titre,
      width: largeur,
      visible: true,
      locked: false,
    };
    // La hauteur suit le contenu : `construireFiche` la calcule sans rendu,
    // sur le MÊME contenu que dessine `KonvaCanvas` (produit du canvas, sinon
    // l'exemple).
    const contenu = produitCanvas
      ? contenuFiche(produitCanvas.description, section.id)
      : EXEMPLE_FICHE[section.id] ?? EXEMPLE_FICHE.specs;
    let hauteur = FICHE_PAR_DEFAUT.fontSize * 4;
    try {
      if (contenu) hauteur = construireFiche(el, contenu).height;
    } catch {
      // mesure impossible : hauteur approchée
    }
    addElementCentre(el, { width: largeur, height: hauteur });
  };

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Sections de la fiche produit, remplies avec le produit affiché — et chacun des produits en
        planche. Un produit sans cette section n'affiche rien.
      </p>
      {SECTIONS_FICHE.map((section) => {
        const Icone = ICONES[section.id];
        const contenu = produit ? contenuFiche(produit.description, section.id) : null;
        const n = contenu?.rows?.length ?? contenu?.items?.length ?? (contenu ? 1 : 0);
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => ajouter(section)}
            className="w-full p-3 flex items-start gap-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all"
          >
            <Icone className="h-5 w-5 mt-0.5 text-blue-500 flex-none" />
            <span>
              <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{section.label}</span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                {!produit
                  ? 'Contenu d’exemple tant qu’aucun produit n’est choisi'
                  : contenu
                    ? section.id === 'specs'
                      ? `${n} ligne${n > 1 ? 's' : ''} pour ce produit`
                      : section.id === 'highlights'
                        ? `${n} point${n > 1 ? 's' : ''} pour ce produit`
                        : 'Présent pour ce produit'
                    : 'Absent de ce produit : ne s’affichera pas'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default FicheTemplates;
