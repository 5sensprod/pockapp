// src/features/labels/components/ToolsSidebar.jsx
import React, { useState } from 'react';
import {
  ChevronLeft,
  Type,
  Image as ImageIcon,
  Shapes,
  Layers,
  ArrowLeft,
  Sparkles,
  Palette,
  PaintBucket,
  Package,
  Database,
  PenTool,
} from 'lucide-react';

import TextTemplates from './templates/TextTemplates';
import AssetsPanel from './templates/AssetsPanel';
import LayersPanel from './templates/LayersPanel';
import PagePanel from './templates/PagePanel';
import SheetPanel from './templates/SheetPanel';
import MediasPanel from './templates/MediasPanel';
import EffectsTemplates from './templates/EffectsTemplates';
import ModelesPanel from './templates/ModelesPanel';
import DonneesProduitPanel from './templates/DonneesProduitPanel';
import DessinPanel from './templates/DessinPanel';
import ReglagesPanel, { sectionsAffichees } from './templates/ReglagesPanel';
import useLabelStore from '../store/useLabelStore';
import { ongletDe } from '../utils/reglagesParType';

const ToolsSidebar = ({
  isCollapsed,
  onToggleCollapse,
  dataSource,
  selectedProduct,
  docNode,
  selectedTool: externalSelectedTool,
  onToolChange,
  stageRef, // 🆕 Pour TemplateManager
}) => {
  const [internalSelectedTool, setInternalSelectedTool] = useState(null);
  // L'élément sélectionné : dans l'onglet de SON type, ses réglages détaillés
  // remplacent les propositions de base (désélectionner les ramène). L'onglet
  // Dessin le fait lui-même, il garde ses boutons d'outil.
  const selection = useLabelStore((s) => s.elements.find((e) => e.id === s.selectedId) ?? null);

  const selectedTool =
    externalSelectedTool !== undefined ? externalSelectedTool : internalSelectedTool;

  const tools = [
    // Templates du poste et designs d'usine, réunis (`ModelesPanel`)
    { id: 'templates', label: 'Templates', icon: Palette, component: ModelesPanel },
    // La page : sa taille puis son fond (`PagePanel`)
    { id: 'format', label: 'Taille et fond', icon: PaintBucket, component: PagePanel },
    { id: 'text', label: 'Texte', icon: Type, component: TextTemplates },
    // Médias : les images du poste, et celles de PocketStock (`MediasPanel`)
    { id: 'image', label: 'Médias', icon: ImageIcon, component: MediasPanel },
    // Assets : formes et QR code statique (`AssetsPanel`)
    { id: 'shape', label: 'Assets', icon: Shapes, component: AssetsPanel },
    // Dessin à main levée (`utils/dessin.js`), porté de PocketStick
    { id: 'dessin', label: 'Dessin', icon: PenTool, component: DessinPanel },
    { id: 'effects', label: 'Effets', icon: Sparkles, component: EffectsTemplates },
    { id: 'layers', label: 'Calques', icon: Layers, component: LayersPanel },
    // Sous Calques : ce qui vient de PocketStock, en orange.
    // Produits : le tirage (liste, quantités, format page ou planche).
    { id: 'sheet', label: 'Produits', icon: Package, component: SheetPanel, produit: true },
    // Données produit : tous les éléments liés à la fiche, et leur liaison.
    {
      id: 'donnees',
      label: 'Données produit',
      icon: Database,
      component: DonneesProduitPanel,
      produit: true,
    },
  ];

  const handleToolClick = (toolId) => {
    const newTool = toolId === selectedTool ? null : toolId;

    if (onToolChange) {
      onToolChange(newTool);
    } else {
      setInternalSelectedTool(newTool);
    }
  };

  // Ouvrir un onglet depuis un panneau : sans la bascule d'un clic sur l'icône
  const ouvrirOutil = (toolId) => (onToolChange ? onToolChange(toolId) : setInternalSelectedTool(toolId));

  // Mode icônes uniquement
  if (isCollapsed) {
    return (
      <div className="w-16 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-2 overflow-y-auto">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              onToggleCollapse();
              handleToolClick(tool.id);
            }}
            className={`p-3 rounded-lg transition-colors ${
              tool.produit
                ? 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
            }`}
            title={tool.label}
          >
            <tool.icon className="h-5 w-5" />
          </button>
        ))}
      </div>
    );
  }

  // Mode déplié avec templates
  const SelectedComponent = tools.find((t) => t.id === selectedTool)?.component;

  return (
    <div className="w-[400px] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex overflow-hidden">
      {/* Barre d'icônes */}
      <div className="w-16 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-2 overflow-y-auto">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            className={`p-3 rounded-lg transition-colors ${
              selectedTool === tool.id
                ? tool.produit
                  ? 'bg-orange-500 text-white'
                  : 'bg-blue-500 text-white'
                : tool.produit
                  ? 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={tool.label}
          >
            <tool.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {/* Zone de templates */}
      <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
        {selectedTool ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToolClick(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="font-semibold text-gray-800 dark:text-white">
                  {tools.find((t) => t.id === selectedTool)?.label}
                </h2>
              </div>
              <button
                onClick={onToggleCollapse}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            {/* Templates */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {SelectedComponent && (
                <>
                  {selectedTool === 'templates' ? (
                    <ModelesPanel
                      stageRef={stageRef}
                      docNode={docNode}
                      onClose={() => handleToolClick(null)}
                    />
                  ) : selectedTool !== 'dessin' &&
                    ongletDe(selection) === selectedTool &&
                    sectionsAffichees(selection).length > 0 ? (
                    <ReglagesPanel docNode={docNode} />
                  ) : (
                    <SelectedComponent
                      dataSource={dataSource}
                      selectedProduct={selectedProduct}
                      docNode={docNode}
                      onOpenTool={ouvrirOutil}
                    />
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Header sans sélection */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-white">Sélectionnez un outil</h2>
              <button
                onClick={onToggleCollapse}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Cliquez sur une icône pour voir les templates disponibles
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ToolsSidebar;
