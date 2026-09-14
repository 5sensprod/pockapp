// src/features/labels/components/templates/TemplateManager.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Save, FolderOpen, Upload, Edit2, Search, X, Tag, Loader2, Package } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import templateService from '../../services/templateService';
import TemplateGrid from '../ui/TemplateGrid';
import ProductSelector from '../ProductSelector'; // 🆕 Import ProductSelector

// ✅ Ajouts : toasts + confirm (versions utilisateur existantes)
import { useActionToasts } from '../../ui/useActionToasts';
import { useConfirmModal } from '../../ui/useConfirmModal';

const TemplateManager = ({ stageRef, docNode, onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // 🆕 États pour la sélection de produits
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);

  // Données du store
  const elements = useLabelStore((s) => s.elements);
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const sheetSettings = useLabelStore((s) => s.sheetSettings);
  const lockCanvasToSheetCell = useLabelStore((s) => s.lockCanvasToSheetCell);
  const dataSource = useLabelStore((s) => s.dataSource);
  const setCurrentTemplateName = useLabelStore((s) => s.setCurrentTemplateName);

  // Actions du store
  const setCanvasSize = useLabelStore((s) => s.setCanvasSize);
  const setSheetSettings = useLabelStore((s) => s.setSheetSettings);
  const setLockCanvasToSheetCell = useLabelStore((s) => s.setLockCanvasToSheetCell);
  const clearCanvas = useLabelStore((s) => s.clearCanvas);
  const setDataSource = useLabelStore((s) => s.setDataSource); // 🆕
  const setSelectedProducts = useLabelStore((s) => s.setSelectedProducts); // 🆕

  const fileInputRef = useRef(null);

  // ✅ Toaster & Confirm (tes hooks)
  const { success, error } = useActionToasts();
  const { confirm, ConfirmModal } = useConfirmModal();

  // Catégories disponibles
  const categories = [
    { id: 'all', label: 'Tous', icon: Tag },
    { id: 'custom', label: 'Personnalisés', icon: Edit2 },
    { id: 'product', label: 'Produits', icon: Tag },
    { id: 'sheet', label: 'Planches', icon: Tag },
  ];

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 💾 Écouteur pour ouvrir le modal de sauvegarde depuis la toolbar
  useEffect(() => {
    const handleSaveRequest = () => {
      setShowSaveModal(true);
    };

    window.addEventListener('request-template-save', handleSaveRequest);
    return () => window.removeEventListener('request-template-save', handleSaveRequest);
  }, []);

  // 🔄 Écouteur pour rafraîchir la liste après une mise à jour
  useEffect(() => {
    const handleTemplateUpdated = (event) => {
      console.log('🔄 Template mis à jour, rafraîchissement de la liste...', event.detail);
      loadTemplates();
    };

    window.addEventListener('template-updated', handleTemplateUpdated);
    return () => window.removeEventListener('template-updated', handleTemplateUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 📋 Charge tous les templates
   */
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const allTemplates = await templateService.listTemplates();

      // 🆕 FILTRER : Exclure les factory templates
      const userTemplates = allTemplates.filter((t) => t.is_factory !== true);

      console.log(`📋 [TEMPLATES] Chargés: ${userTemplates.length} templates utilisateur`);
      console.log(
        `🏭 [TEMPLATES] Exclus: ${allTemplates.length - userTemplates.length} factory templates`
      );

      setTemplates(userTemplates);
    } catch (err) {
      console.error('❌ Erreur chargement templates:', err);
      error('Impossible de charger les templates', { title: 'Erreur' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🎯 Détecte si un template nécessite une sélection de produits
   */
  const requiresProductSelection = (template) => {
    // Un template de planche en mode "data" nécessite une sélection
    return (
      template.dataSource === 'data' &&
      template.sheetSettings &&
      template.sheetSettings.rows > 0 &&
      template.sheetSettings.cols > 0
    );
  };

  /**
   * 📊 Calcule le nombre max de produits pour un template
   */
  const getMaxProducts = (template) => {
    if (!template.sheetSettings) return 1;
    return template.sheetSettings.rows * template.sheetSettings.cols;
  };

  /**
   * 💾 Sauvegarde le template actuel
   */
  const handleSaveTemplate = async (metadata) => {
    try {
      // 🎯 Désélectionner tout avant de capturer (évite le transformer visible)
      const clearSelection = useLabelStore.getState().clearSelection;
      clearSelection();

      // Attendre un peu pour que le render soit effectif
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Générer une miniature avec docNode (logique exportPdf)
      const thumbnail = await templateService.generateThumbnail(stageRef, {
        width: 400,
        height: 300,
        docNode: docNode,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });

      const templateData = {
        elements,
        canvasSize,
        sheetSettings,
        lockCanvasToSheetCell,
        dataSource,
      };

      await templateService.saveTemplate(templateData, {
        ...metadata,
        thumbnail,
      });

      await loadTemplates();
      setShowSaveModal(false);
      success('Template sauvegardé ✅', { title: 'Succès' });
    } catch (err) {
      console.error('❌ Erreur sauvegarde:', err);
      error('Erreur lors de la sauvegarde ❌', { title: 'Erreur' });
    }
  };

  /**
   * 📂 Charge un template (avec gestion de la sélection produits)
   */
  const handleLoadTemplate = async (template) => {
    try {
      // Vérifier si le canvas actuel contient des éléments
      if (elements.length > 0) {
        const ok = await confirm({
          title: 'Charger le template ?',
          message: 'Charger ce template écrasera votre travail actuel.',
          confirmText: 'Charger',
          cancelText: 'Annuler',
          variant: 'primary',
        });
        if (!ok) return;
      }

      // 🆕 Vérifier si le template nécessite une sélection de produits
      if (requiresProductSelection(template)) {
        const maxProducts = getMaxProducts(template);

        // Informer l'utilisateur
        const proceedWithSelection = await confirm({
          title: 'Sélection de produits requise',
          message: `Ce template est une planche de ${template.sheetSettings.rows}×${template.sheetSettings.cols} cellules.\n\nVous pouvez sélectionner jusqu'à ${maxProducts} produit${maxProducts > 1 ? 's' : ''} pour remplir les cellules.`,
          confirmText: 'Sélectionner les produits',
          cancelText: 'Annuler',
          variant: 'primary',
        });

        if (!proceedWithSelection) return;

        // Ouvrir le sélecteur de produits
        setPendingTemplate(template);
        setShowProductSelector(true);
        return;
      }

      // Si pas besoin de sélection, charger directement
      await applyTemplate(template, null);
    } catch (err) {
      console.error('❌ Erreur chargement template:', err);
      error('Erreur lors du chargement ❌', { title: 'Erreur' });
    }
  };

  /**
   * 🎨 Applique le template avec les produits sélectionnés (si applicable)
   */
  const applyTemplate = async (template, selectedProducts = null) => {
    try {
      // Vider le canvas

      clearCanvas();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 💾 Stocker le nom ET l'ID du template
      setCurrentTemplateName(template.name || 'Template sans nom');
      const setCurrentTemplateId = useLabelStore.getState().setCurrentTemplateId;
      setCurrentTemplateId(template.id || null);
      // 🆕 CORRECTION : Récupérer les données selon la source
      // - Factory templates API : template.preset_data
      // - Templates locaux : template directement
      const templateData = template.preset_data || template;

      console.log('🎨 [APPLY TEMPLATE] Structure détectée:', {
        hasPresetData: !!template.preset_data,
        templateData: templateData,
      });

      // Vérifier que les données essentielles sont présentes
      if (!templateData.canvasSize) {
        console.error('❌ canvasSize manquant dans le template:', template);
        throw new Error('Structure de template invalide : canvasSize manquant');
      }

      // Restaurer la taille du canvas
      setCanvasSize(templateData.canvasSize.width, templateData.canvasSize.height);

      // Restaurer les paramètres de planche
      if (templateData.sheetSettings) {
        setSheetSettings(templateData.sheetSettings);
      }
      if (templateData.lockCanvasToSheetCell !== undefined) {
        setLockCanvasToSheetCell(templateData.lockCanvasToSheetCell);
      }

      // 🆕 Restaurer le dataSource et les produits sélectionnés
      if (templateData.dataSource) {
        setDataSource(templateData.dataSource);
      }
      if (selectedProducts && selectedProducts.length > 0) {
        setSelectedProducts(selectedProducts);
      }

      setCurrentTemplateName(template.name);

      // Restaurer les éléments
      const elements = templateData.elements || [];
      console.log(`🎨 [APPLY TEMPLATE] Restauration de ${elements.length} éléments`);

      elements.forEach((el) => {
        useLabelStore.getState().addElement(el);
      });

      // 🔄 Réinitialiser l'historique après le chargement
      const resetHistory = useLabelStore.getState().resetHistory;
      resetHistory();

      success('Template chargé ✅', { title: 'Succès' });
    } catch (err) {
      console.error('❌ Erreur application template:', err);
      error("Erreur lors de l'application ❌", { title: 'Erreur' });
    }
  };

  /**
   * 🎯 Callback quand des produits sont sélectionnés
   */
  const handleProductsSelected = async (selectedProducts) => {
    setShowProductSelector(false);

    if (!pendingTemplate) return;

    const maxProducts = getMaxProducts(pendingTemplate);

    // Limiter au nombre de cellules disponibles
    const productsToUse = selectedProducts.slice(0, maxProducts);

    // Appliquer le template avec les produits
    await applyTemplate(pendingTemplate, productsToUse);

    // Reset
    setPendingTemplate(null);
  };

  /**
   * 🗑️ Supprime un template
   */
  const handleDeleteTemplate = async (template) => {
    const ok = await confirm({
      title: 'Supprimer le template ?',
      message: `Cette action est irréversible.\nTemplate : "${template.name}"`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await templateService.deleteTemplate(template.id);
      await loadTemplates();
      success('Template supprimé ✅', { title: 'Succès' });
    } catch (err) {
      console.error('❌ Erreur suppression:', err);
      error('Erreur lors de la suppression ❌', { title: 'Erreur' });
    }
  };

  /**
   * 🔄 Duplique un template
   */
  const handleDuplicateTemplate = async (id) => {
    try {
      await templateService.duplicateTemplate(id);
      await loadTemplates();
      success('Template dupliqué ✅', { title: 'Succès' });
    } catch (err) {
      console.error('❌ Erreur duplication:', err);
      error('Erreur lors de la duplication ❌', { title: 'Erreur' });
    }
  };

  /**
   * 📤 Exporte un template
   */
  const handleExportTemplate = async (id) => {
    try {
      await templateService.exportTemplate(id);
      success('Export démarré', { title: 'Info' });
    } catch (err) {
      console.error('❌ Erreur export:', err);
      error("Erreur lors de l'export ❌", { title: 'Erreur' });
    }
  };

  /**
   * 📥 Importe un template
   */
  const handleImportTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await templateService.importTemplate(file);
      await loadTemplates();
      success('Template importé ✅', { title: 'Succès' });
    } catch (err) {
      console.error('❌ Erreur import:', err);
      error("Erreur lors de l'import ❌", { title: 'Erreur' });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtrage des templates
  const filteredTemplates = templates.filter((template) => {
    // Filtre par catégorie
    if (selectedCategory !== 'all' && template.category !== selectedCategory) {
      return false;
    }

    // Filtre par recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchName = template.name?.toLowerCase().includes(query);
      const matchDescription = template.description?.toLowerCase().includes(query);
      const matchTags = template.tags?.some((tag) => tag.toLowerCase().includes(query));

      return matchName || matchDescription || matchTags;
    }

    return true;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Mes Templates</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveModal(true)}
              title="Enregistrer le modèle"
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
            >
              <Save className="h-4 w-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Importer un modèle (.json)"
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              <Upload className="h-4 w-4" />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportTemplate}
              className="hidden"
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un template..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <cat.icon className="h-3.5 w-3.5" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Templates Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <FolderOpen className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">
              {searchQuery || selectedCategory !== 'all'
                ? 'Aucun template trouvé'
                : 'Aucun template sauvegardé'}
            </p>
          </div>
        ) : (
          <TemplateGrid
            templates={filteredTemplates.map((template) => ({
              ...template,
              // 🆕 Badge pour templates multi-produits
              badge: requiresProductSelection(template) ? (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                  <Package className="h-3 w-3" />
                  {getMaxProducts(template)}
                </div>
              ) : null,
            }))}
            onLoad={handleLoadTemplate}
            onDelete={handleDeleteTemplate}
            onEdit={setEditingTemplate}
            onDuplicate={handleDuplicateTemplate}
            onExport={handleExportTemplate}
          />
        )}
      </div>

      {/* Modal de sauvegarde */}
      {showSaveModal && (
        <SaveTemplateModal onSave={handleSaveTemplate} onClose={() => setShowSaveModal(false)} />
      )}

      {/* Modal d'édition */}
      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          onSave={async (metadata) => {
            try {
              await templateService.updateTemplate(editingTemplate.id, metadata);
              await loadTemplates();
              setEditingTemplate(null);
              success('Template mis à jour ✅', { title: 'Succès' });
            } catch (err) {
              console.error('❌ Erreur update:', err);
              error('Erreur lors de la mise à jour ❌', { title: 'Erreur' });
            }
          }}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {/* 🆕 Modal de sélection de produits */}
      {showProductSelector && pendingTemplate && (
        <ProductSelector
          multiSelect={true}
          selectedProducts={[]}
          onSelect={handleProductsSelected}
          onClose={() => {
            setShowProductSelector(false);
            setPendingTemplate(null);
          }}
        />
      )}

      {/* ✅ Modal de confirmation (pilotée par useConfirmModal) */}
      <ConfirmModal />
    </div>
  );
};

/**
 * 💾 Modal de sauvegarde
 */
const SaveTemplateModal = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('custom');
  const [tags, setTags] = useState('');
  const [errorName, setErrorName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName('Le nom est obligatoire');
      return;
    }
    setErrorName('');

    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Sauvegarder le template</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mon super template"
                className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 ${
                  errorName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              />
              {errorName && <p className="mt-1 text-xs text-red-600">{errorName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description du template..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              >
                <option value="custom">Personnalisé</option>
                <option value="product">Produit</option>
                <option value="sheet">Planche</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tags (séparés par des virgules)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="étiquette, prix, promo"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
              >
                Sauvegarder
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

/**
 * ✏️ Modal d'édition
 */
const EditTemplateModal = ({ template, onSave, onClose }) => {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description || '');
  const [category, setCategory] = useState(template.category);
  const [tags, setTags] = useState((template.tags || []).join(', '));
  const [errorName, setErrorName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName('Le nom est obligatoire');
      return;
    }
    setErrorName('');

    onSave({
      name: name.trim(),
      description: description.trim(),
      category,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Éditer le template</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-3 py-2 border rounded bg-white dark:bg-gray-700 ${
                  errorName ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              />
              {errorName && <p className="mt-1 text-xs text-red-600">{errorName}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Catégorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              >
                <option value="custom">Personnalisé</option>
                <option value="product">Produit</option>
                <option value="sheet">Planche</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tags (séparés par des virgules)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded"
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TemplateManager;
