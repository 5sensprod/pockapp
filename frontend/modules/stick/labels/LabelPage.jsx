// frontend/modules/stick/labels/LabelPage.jsx
// Porté d'AppPos (src/pages/LabelPage.jsx), à l'identique.
// Seuls les toasts changent de maison : `sonner`, celui du dépôt.
import React, { useState, useEffect, useRef } from 'react';
import ToolsSidebar from './components/ToolsSidebar';
import CanvasArea from './components/CanvasArea';
import TopToolbar from './components/TopToolbar';
import useLabelStore from './store/useLabelStore';
import { ongletApresSelection, ongletDe } from './utils/reglagesParType';
import { toast } from 'sonner';
import { useSynchroProduitsAffiche } from './lib/use-synchro-produits-affiche';

export const LabelPage = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const {
    dataSource,
    selectedProduct,
    selectedProducts,
  } = useLabelStore();
  // Les produits du canvas suivent la base (temps réel, retour sur la page).
  useSynchroProduitsAffiche();
  const produitsDisparus = useLabelStore((s) => s.produitsDisparus);
  const retirerProduitsDisparus = useLabelStore((s) => s.retirerProduitsDisparus);

  // « Nouveau » avec des produits au tirage : les garder ou les vider ?
  const [demandeNouveau, setDemandeNouveau] = useState(false);
  const startNewDocument = useLabelStore((s) => s.startNewDocument);

  // État pour stocker le docNode du canvas
  const [docNode, setDocNode] = useState(null);
  const stageRef = useRef(null);

  // État pour l'outil sélectionné dans la sidebar
  const [selectedTool, setSelectedTool] = useState(null);

  // L'onglet SUIT la sélection : sélectionner un élément affiche l'onglet de
  // son type, avec ses réglages détaillés à la place des propositions de base
  // (`ReglagesPanel`). Seulement au CHANGEMENT de sélection — on peut ensuite
  // ouvrir l'onglet qu'on veut —, et jamais par-dessus un onglet de travail
  // (Calques, Effets…) : la règle est `ongletApresSelection`.
  const idSelectionne = useLabelStore((s) => s.selectedId);
  useEffect(() => {
    if (!idSelectionne) return;
    const el = useLabelStore.getState().elements.find((e) => e.id === idSelectionne);
    setSelectedTool((courant) => ongletApresSelection(courant, el));
  }, [idSelectionne]);

  // Le bouton « Réglages » (barre fine, et barre flottante de l'élément) :
  // l'onglet du type, quel que soit celui qui est ouvert, barre latérale dépliée
  const handleOpenReglages = () => {
    const { elements, selectedId } = useLabelStore.getState();
    const onglet = ongletDe(elements.find((e) => e.id === selectedId));
    if (!onglet) return;
    setIsSidebarCollapsed(false);
    setSelectedTool(onglet);
  };
  // Le bouton « Effets » de la barre fine
  const handleOpenEffets = () => {
    setIsSidebarCollapsed(false);
    setSelectedTool('effects');
  };

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

  const handleNewLabel = () => {
    if (useLabelStore.getState().selectedProductIds.length > 0) setDemandeNouveau(true);
    else startNewDocument();
  };

  const nouveau = (garderProduits) => {
    startNewDocument({ garderProduits });
    setDemandeNouveau(false);
  };

  // Pour le passage aux composants enfants
  const displayProduct =
    selectedProduct ||
    (Array.isArray(selectedProducts) && selectedProducts.length > 0 ? selectedProducts[0] : null);

  return (
    <div className="flex flex-col h-[100%] min-w-0 overflow-hidden bg-gray-100 dark:bg-gray-900">
      {demandeNouveau && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDemandeNouveau(false)}
          onKeyDown={(e) => e.key === 'Escape' && setDemandeNouveau(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titre-nouveau"
            className="w-full max-w-sm mx-4 p-5 rounded-lg bg-white dark:bg-gray-800 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="titre-nouveau" className="text-base font-semibold text-gray-900 dark:text-white">
              Nouveau document
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Garder les produits du tirage pour le nouveau document ?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDemandeNouveau(false)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => nouveau(false)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Vider
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => nouveau(true)}
                className="px-3 py-1.5 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
              >
                Garder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TopToolbar avec selectedProduct */}
      <TopToolbar
        dataSource={dataSource}
        onNewLabel={handleNewLabel}
        docNode={docNode}
        selectedProduct={displayProduct}
        onSave={handleSaveTemplate}
      />

      {produitsDisparus.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 text-sm bg-amber-50 text-amber-800 border-b border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
          <span>
            {produitsDisparus.length === 1
              ? "Un produit affiché n'existe plus dans le catalogue : sa dernière valeur connue reste affichée."
              : `${produitsDisparus.length} produits affichés n'existent plus dans le catalogue : leur dernière valeur connue reste affichée.`}
          </span>
          <button
            onClick={retirerProduitsDisparus}
            className="px-2 py-1 text-xs border border-amber-300 rounded-lg hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40"
          >
            Les retirer
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
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
          onDocNodeReady={setDocNode}
          onOpenReglages={handleOpenReglages}
          onOpenEffets={handleOpenEffets}
        />
      </div>
    </div>
  );
};

export default LabelPage;
