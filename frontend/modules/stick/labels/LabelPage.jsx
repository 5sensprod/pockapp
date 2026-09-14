// frontend/modules/stick/labels/LabelPage.jsx
// Porté d'AppPos (src/pages/LabelPage.jsx), à l'identique.
// Seuls les toasts changent de maison : `sonner`, celui du dépôt.
import React, { useState, useEffect, useRef } from 'react';
import ToolsSidebar from './components/ToolsSidebar';
import CanvasArea from './components/CanvasArea';
import TopToolbar from './components/TopToolbar';
import DataSourceSelector from './components/DataSourceSelector';
import ProductSelector from './components/ProductSelector';
import useLabelStore from './store/useLabelStore';
import { toast } from 'sonner';

export const LabelPage = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const {
    dataSource,
    selectedProduct,
    selectedProducts,
    setDataSource,
    setSelectedProducts,
    clearCanvas,
  } = useLabelStore();

  // Si des produits arrivent déjà depuis ProductTable, on saute le sélecteur
  const [showDataSourceSelector, setShowDataSourceSelector] = useState(
    () => !(useLabelStore.getState().selectedProducts?.length > 0)
  );
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [multiSelectProducts, setMultiSelectProducts] = useState(false);

  // État pour stocker le docNode du canvas
  const [docNode, setDocNode] = useState(null);
  const stageRef = useRef(null);

  // État pour l'outil sélectionné dans la sidebar
  const [selectedTool, setSelectedTool] = useState(null);

  // 📢 Toasts pour les notifications — `sonner`, comme partout dans le dépôt.
  const success = (message) => toast.success(message);
  const error = (message) => toast.error(message);

  // 💾 Fonction pour sauvegarder les modifications du template actuel
  const handleSaveTemplate = async () => {
    const store = useLabelStore.getState();
    const {
      currentTemplateId,
      currentTemplateName,
      elements,
      canvasSize,
      sheetSettings,
      lockCanvasToSheetCell,
      dataSource: currentDataSource,
      clearSelection,
    } = store;

    if (!currentTemplateId) {
      console.warn(
        'Aucun template chargé - ouverture de la sidebar pour créer un nouveau template'
      );
      if (isSidebarCollapsed) {
        setIsSidebarCollapsed(false);
      }
      setSelectedTool('templates');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('request-template-save'));
      }, 100);
      return;
    }

    try {
      // Importer dynamiquement le service
      const { default: templateService } = await import('./services/templateService');

      // Désélectionner avant de capturer la miniature
      clearSelection();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Générer une nouvelle miniature
      const thumbnail = await templateService.generateThumbnail(stageRef, {
        width: 400,
        height: 300,
        docNode: docNode,
        canvasWidth: canvasSize.width,
        canvasHeight: canvasSize.height,
      });

      const updates = {
        elements,
        canvasSize,
        sheetSettings,
        lockCanvasToSheetCell,
        dataSource: currentDataSource,
        name: currentTemplateName,
        thumbnail,
      };

      await templateService.updateTemplate(currentTemplateId, updates);

      // 🔄 Réinitialiser l'historique après la sauvegarde
      const resetHistory = useLabelStore.getState().resetHistory;
      resetHistory();

      // 📢 Notifier le TemplateManager pour rafraîchir la liste
      window.dispatchEvent(
        new CustomEvent('template-updated', {
          detail: { templateId: currentTemplateId },
        })
      );

      success('Template sauvegardé');
    } catch (err) {
      console.error('❌ Erreur lors de la sauvegarde:', err);
      error('Erreur lors de la sauvegarde');
    }
  };

  // ✅ Fonction pour ouvrir le panneau Effets
  const handleOpenEffects = () => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
    setSelectedTool('effects');
  };

  const handleDataSourceSelect = (source) => {
    setDataSource(source, null);
    setShowDataSourceSelector(false);

    if (source === 'data') {
      setMultiSelectProducts(true);
      setShowProductSelector(true);
    }
  };

  const handleProductSelect = (product) => {
    if (Array.isArray(product)) {
      setDataSource('data', product);
    } else {
      setDataSource('data', product);
    }
    setShowProductSelector(false);
  };

  const handleNewLabel = () => {
    clearCanvas();
    setDataSource(null, null); // 🧹 vider aussi les produits du store
    setShowDataSourceSelector(true);
    setMultiSelectProducts(false);
  };

  // Pour le passage aux composants enfants
  const displayProduct =
    selectedProduct ||
    (Array.isArray(selectedProducts) && selectedProducts.length > 0 ? selectedProducts[0] : null);

  return (
    <div className="flex flex-col h-[100%] bg-gray-100 dark:bg-gray-900">
      {showDataSourceSelector && (
        <DataSourceSelector
          onSelect={handleDataSourceSelect}
          onClose={() => setShowDataSourceSelector(false)}
        />
      )}

      {showProductSelector && (
        <ProductSelector
          onSelect={handleProductSelect}
          onClose={() => {
            setShowProductSelector(false);
            setShowDataSourceSelector(true);
          }}
          multiSelect={multiSelectProducts}
          selectedProducts={selectedProducts}
        />
      )}

      {/* 🆕 TopToolbar avec selectedProduct et onOpenEffects */}
      <TopToolbar
        dataSource={dataSource}
        onNewLabel={handleNewLabel}
        docNode={docNode}
        selectedProduct={displayProduct}
        onOpenEffects={handleOpenEffects}
        onSave={handleSaveTemplate}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 🆕 ToolsSidebar avec stageRef pour TemplateManager */}
        <ToolsSidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          dataSource={dataSource}
          selectedProduct={displayProduct}
          selectedTool={selectedTool}
          onToolChange={setSelectedTool}
          docNode={docNode}
          stageRef={stageRef}
        />

        {/* 🆕 CanvasArea avec ref pour le Stage */}
        <CanvasArea
          ref={stageRef}
          dataSource={dataSource}
          selectedProduct={displayProduct}
          onDocNodeReady={setDocNode}
          onOpenEffects={handleOpenEffects}
        />
      </div>
    </div>
  );
};

export default LabelPage;
