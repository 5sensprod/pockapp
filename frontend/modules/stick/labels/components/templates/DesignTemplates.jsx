// AppTools/src/features/labels/components/templates/DesignTemplates.jsx

import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, FileText, Table, Package, Layout } from 'lucide-react';
import templateService from '../../services/templateService';
import useLabelStore from '../../store/useLabelStore';

/**
 * 🏭 Composant pour afficher les templates d'usine (factory templates)
 * Séparé des presets utilisateur pour plus de clarté
 */
const DesignTemplates = ({ stageRef, docNode, onClose }) => {
  const [factoryTemplates, setFactoryTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Récupérer les fonctions du store
  const clearCanvas = useLabelStore((state) => state.clearCanvas);
  const setCanvasSize = useLabelStore((state) => state.setCanvasSize);
  const setSheetSettings = useLabelStore((state) => state.setSheetSettings);
  const setLockCanvasToSheetCell = useLabelStore((state) => state.setLockCanvasToSheetCell);
  const setDataSource = useLabelStore((state) => state.setDataSource);
  const addElement = useLabelStore((state) => state.addElement);

  useEffect(() => {
    loadFactoryTemplates();
  }, []);

  /**
   * 📋 Charge uniquement les factory templates
   */
  const loadFactoryTemplates = async () => {
    setLoading(true);
    try {
      // Récupérer tous les templates
      const allTemplates = await templateService.listTemplates();

      // Filtrer uniquement les factory templates
      const factories = allTemplates.filter((t) => t.is_factory === true);

      console.log('🏭 [FACTORY] Templates chargés:', factories.length);
      setFactoryTemplates(factories);
    } catch (err) {
      console.error('❌ Erreur chargement factory templates:', err);
      alert('Impossible de charger les designs');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🎨 Charge un factory template
   */
  const handleLoadTemplate = async (template) => {
    try {
      console.log('🏭 [FACTORY] Chargement du template:', template.name);

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
      if (templateData.dataSource) {
        setDataSource(templateData.dataSource);
      }

      // Restaurer les éléments
      const elements = templateData.elements || [];
      elements.forEach((el) => {
        addElement(el);
      });

      console.log(`✅ Design "${template.name}" chargé`);

      // Fermer le panneau si demandé
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('❌ Erreur chargement template:', err);
      alert('Erreur lors du chargement du design');
    }
  };

  /**
   * 🎨 Icône selon la catégorie du template
   */
  const getCategoryIcon = (category) => {
    switch (category) {
      case 'custom':
        return <Sparkles className="h-4 w-4" />;
      case 'product':
        return <FileText className="h-4 w-4" />;
      case 'sheet':
        return <Table className="h-4 w-4" />;
      default:
        return <Layout className="h-4 w-4" />;
    }
  };

  /**
   * 🎨 Couleur selon la catégorie
   */
  const getCategoryColor = (category) => {
    switch (category) {
      case 'custom':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'product':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'sheet':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  /**
   * 📊 Catégories disponibles
   */
  const categories = [
    { id: 'all', label: 'Tous', icon: Layout },
    { id: 'custom', label: 'Vierges', icon: Sparkles },
    { id: 'product', label: 'Produits', icon: Package },
    { id: 'sheet', label: 'Planches', icon: Table },
  ];

  /**
   * 🔍 Filtrer les templates par catégorie
   */
  const filteredTemplates =
    selectedCategory === 'all'
      ? factoryTemplates
      : factoryTemplates.filter((t) => {
          const metadata = t.metadata || {};
          return metadata.category === selectedCategory;
        });

  return (
    <div className="flex flex-col h-full">
      {/* Filtres par catégorie */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <cat.icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des templates */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm">Aucun design disponible</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredTemplates.map((template) => {
              const metadata = template.metadata || {};
              const category = metadata.category || 'custom';

              return (
                <div
                  key={template._id || template.id}
                  onClick={() => handleLoadTemplate(template)}
                  className="group relative bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg overflow-hidden"
                >
                  {/* Badge catégorie */}
                  <div className="absolute top-2 left-2 z-10">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${getCategoryColor(
                        category
                      )}`}
                    >
                      {getCategoryIcon(category)}
                      {category === 'custom'
                        ? 'Vierge'
                        : category === 'product'
                          ? 'Produit'
                          : category === 'sheet'
                            ? 'Planche'
                            : 'Design'}
                    </span>
                  </div>

                  {/* Badge "Usine" */}
                  <div className="absolute top-2 right-2 z-10">
                    <span className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded text-xs font-bold">
                      🏭 USINE
                    </span>
                  </div>

                  {/* Aperçu (placeholder pour l'instant) */}
                  <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                    <div className="text-center p-4">
                      <div className="text-4xl mb-2">{getCategoryIcon(category)}</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Aperçu à venir</p>
                    </div>
                  </div>

                  {/* Infos */}
                  <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="font-semibold text-sm text-gray-800 dark:text-white mb-1">
                      {template.name}
                    </h3>
                    {metadata.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {metadata.description}
                      </p>
                    )}

                    {/* Overlay au hover */}
                    <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium text-sm shadow-lg">
                        Charger ce design
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer avec stats */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {filteredTemplates.length} design{filteredTemplates.length > 1 ? 's' : ''} disponible
          {filteredTemplates.length > 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
};

export default DesignTemplates;
