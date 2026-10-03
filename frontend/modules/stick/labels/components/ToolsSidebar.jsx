// src/features/labels/components/ToolsSidebar.jsx
import React, { useState } from 'react';
import {
  ChevronLeft,
  Type,
  Image as ImageIcon,
  Shapes,
  Layers,
  X,
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

const boutonEntete =
  'h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700';

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
    { id: 'templates', label: 'Templates', court: 'Modèles', icon: Palette, component: ModelesPanel },
    // La page : sa taille puis son fond (`PagePanel`)
    { id: 'format', label: 'Taille et fond', court: 'Page', icon: PaintBucket, component: PagePanel },
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
      court: 'Données',
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

  // LA BARRE D'ICÔNES, la même repliée ou dépliée : icône et libellé court
  // dessous (on trouve un onglet sans survoler chaque icône). L'aplat de
  // couleur est réservé à l'onglet OUVERT ; orange = ce qui vient de la fiche
  // produit, bleu = le reste.
  const barreIcones = (onClic) => (
    <nav
      aria-label="Outils"
      className="w-16 flex-none border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-2 gap-0.5 overflow-y-auto"
    >
      {tools.map((tool) => {
        const ouvert = !isCollapsed && selectedTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onClic(tool.id)}
            aria-pressed={ouvert}
            title={tool.label}
            className={`w-14 py-1.5 flex flex-col items-center gap-0.5 rounded-lg transition-colors ${
              ouvert
                ? tool.produit
                  ? 'bg-orange-500 text-white'
                  : 'bg-blue-600 text-white'
                : tool.produit
                  ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <tool.icon className="h-5 w-5" />
            <span className="text-[10px] leading-tight">{tool.court ?? tool.label}</span>
          </button>
        );
      })}
    </nav>
  );

  // Repliée : la barre d'icônes seule ; un clic déplie et ouvre l'onglet
  if (isCollapsed) {
    return (
      <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex">
        {barreIcones((id) => {
          onToggleCollapse();
          ouvrirOutil(id);
        })}
      </div>
    );
  }

  // Mode déplié avec templates
  const SelectedComponent = tools.find((t) => t.id === selectedTool)?.component;

  return (
    <div className="w-[400px] flex-none bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex overflow-hidden">
      {barreIcones(handleToolClick)}

      {/* Zone de templates */}
      <div className="flex-1 min-h-0 flex flex-col overflow-x-hidden">
        {selectedTool ? (
          <>
            {/* Header */}
            <div className="flex-none h-10 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                {tools.find((t) => t.id === selectedTool)?.label}
              </h2>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => handleToolClick(null)} className={boutonEntete} title="Fermer ce panneau">
                  <X className="h-4 w-4" />
                </button>
                <button type="button" onClick={onToggleCollapse} className={boutonEntete} title="Replier la barre latérale">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
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
            <div className="flex-none h-10 px-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Outils</h2>
              <button type="button" onClick={onToggleCollapse} className={boutonEntete} title="Replier la barre latérale">
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Choisissez un outil à gauche pour ajouter un élément, ou sélectionnez un élément sur la page pour le régler.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ToolsSidebar;
