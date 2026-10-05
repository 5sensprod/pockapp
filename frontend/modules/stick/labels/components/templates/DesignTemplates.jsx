// frontend/modules/stick/labels/components/templates/DesignTemplates.jsx
//
// « Modèles prêts » : les modèles d'usine (`is_factory`), livrés avec
// l'éditeur. Séparés des modèles du poste, qu'on enregistre soi-même.
//
// Refait le 3 octobre 2026 sur la grille commune (`ui/TemplateGrid`) : deux
// colonnes au lieu d'une carte de 315 px, plus de badge « USINE », de voile
// bleu ni de pied « N designs disponibles ». Ces modèles n'ont pas d'aperçu :
// la carte montre l'icône de leur catégorie.

import React, { useState, useEffect } from 'react';
import { Sparkles, FileText, Table, Layout } from 'lucide-react';
import templateService from '../../services/templateService';
import useLabelStore from '../../store/useLabelStore';
import { categorieUsine, filtrerModeles } from '../../utils/modeles';
import { useActionToasts } from '../../ui/useActionToasts';
import EtatVide from '../ui/EtatVide';
import Segments from '../ui/Segments';
import TemplateGrid from '../ui/TemplateGrid';

const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'custom', label: 'Vierges' },
  { id: 'product', label: 'Produits' },
  { id: 'sheet', label: 'Planches' },
];

const ICONES = { custom: Sparkles, product: FileText, sheet: Table };

const DesignTemplates = ({ onClose }) => {
  const [factoryTemplates, setFactoryTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { error } = useActionToasts();

  // Récupérer les fonctions du store
  const clearCanvas = useLabelStore((state) => state.clearCanvas);
  const setCanvasSize = useLabelStore((state) => state.setCanvasSize);
  const setSheetSettings = useLabelStore((state) => state.setSheetSettings);
  const setLockCanvasToSheetCell = useLabelStore((state) => state.setLockCanvasToSheetCell);
  const addElement = useLabelStore((state) => state.addElement);

  useEffect(() => {
    loadFactoryTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Charge uniquement les modèles d'usine
   */
  const loadFactoryTemplates = async () => {
    setLoading(true);
    try {
      const allTemplates = await templateService.listTemplates();
      setFactoryTemplates(allTemplates.filter((t) => t.is_factory === true));
    } catch (err) {
      console.error('❌ Erreur chargement factory templates:', err);
      error('Impossible de charger les modèles prêts');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ouvre un modèle d'usine
   */
  const handleLoadTemplate = async (template) => {
    try {
      // Récupérer les données du template
      const templateData = template.preset_data || template;

      // Vérifier la structure
      if (!templateData.canvasSize) {
        throw new Error('Structure de template invalide');
      }

      // Vider le canvas
      clearCanvas();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Restaurer la configuration
      setCanvasSize(templateData.canvasSize.width, templateData.canvasSize.height);

      if (templateData.sheetSettings) {
        setSheetSettings(templateData.sheetSettings);
      }
      if (templateData.lockCanvasToSheetCell !== undefined) {
        setLockCanvasToSheetCell(templateData.lockCanvasToSheetCell);
      }

      // Restaurer les éléments
      const elements = templateData.elements || [];
      elements.forEach((el) => {
        addElement(el);
      });

      // Fermer le panneau si demandé
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('❌ Erreur chargement template:', err);
      error('Ouverture impossible');
    }
  };

  const filteredTemplates = filtrerModeles(factoryTemplates, { categorie: selectedCategory, categorieDe: categorieUsine });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <Segments label="Catégorie" options={CATEGORIES} valeur={selectedCategory} onValeur={setSelectedCategory} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <EtatVide chargement />
        ) : filteredTemplates.length === 0 ? (
          <EtatVide icone={Layout} titre="Aucun modèle prêt." />
        ) : (
          <TemplateGrid
            templates={filteredTemplates}
            onLoad={handleLoadTemplate}
            detail={(t) => (t.metadata || {}).description}
            icone={(t) => ICONES[categorieUsine(t) || 'custom'] ?? Layout}
          />
        )}
      </div>
    </div>
  );
};

export default DesignTemplates;
