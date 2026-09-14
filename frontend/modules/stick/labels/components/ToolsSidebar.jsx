// src/features/labels/components/ToolsSidebar.jsx
import React, { useState } from 'react';
import {
  ChevronLeft,
  Type,
  Image as ImageIcon,
  Shapes,
  Table2,
  Layers,
  Maximize2,
  ArrowLeft,
  Grid3x3,
  QrCode,
  Upload,
  Barcode,
  Sparkles,
  FolderOpen,
  Palette,
} from 'lucide-react';

import TextTemplates from './templates/TextTemplates';
import ImageTemplates from './templates/ImageTemplates';
import ShapeTemplates from './templates/ShapeTemplates';
import TableTemplates from './templates/TableTemplates';
import LayersPanel from './templates/LayersPanel';
import FormatPanel from './templates/FormatPanel';
import SheetPanel from './templates/SheetPanel';
import QRCodeTemplates from './templates/QRCodeTemplates';
import UploadTemplate from './templates/UploadTemplate';
import BarcodeTemplates from './templates/BarcodeTemplates';
import EffectsTemplates from './templates/EffectsTemplates';
import TemplateManager from './templates/TemplateManager';
import DesignTemplates from './templates/DesignTemplates';

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

  const selectedTool =
    externalSelectedTool !== undefined ? externalSelectedTool : internalSelectedTool;

  const tools = [
    { id: 'templates', label: 'Templates', icon: FolderOpen, component: TemplateManager },
    { id: 'designs', label: 'Designs', icon: Palette, component: DesignTemplates }, // 🆕 NOUVELLE LIGNE
    { id: 'text', label: 'Texte', icon: Type, component: TextTemplates },
    { id: 'upload', label: 'Upload', icon: Upload, component: UploadTemplate },
    { id: 'image', label: 'Images', icon: ImageIcon, component: ImageTemplates },
    { id: 'shape', label: 'Forme', icon: Shapes, component: ShapeTemplates },
    { id: 'table', label: 'Tableau', icon: Table2, component: TableTemplates },
    { id: 'qrcode', label: 'QR Code', icon: QrCode, component: QRCodeTemplates },
    { id: 'barcode', label: 'Code-barres', icon: Barcode, component: BarcodeTemplates },
    { id: 'effects', label: 'Effets', icon: Sparkles, component: EffectsTemplates },
    { id: 'layers', label: 'Calques', icon: Layers, component: LayersPanel },
    { id: 'format', label: 'Format', icon: Maximize2, component: FormatPanel },
    { id: 'sheet', label: 'Planche', icon: Grid3x3, component: SheetPanel },
  ];

  const handleToolClick = (toolId) => {
    const newTool = toolId === selectedTool ? null : toolId;

    if (onToolChange) {
      onToolChange(newTool);
    } else {
      setInternalSelectedTool(newTool);
    }
  };

  const handleImageSelected = (imageData) => {
    console.log('🖼️ Image sélectionnée depuis Upload:', imageData);
  };

  // Mode icônes uniquement
  if (isCollapsed) {
    return (
      <div className="w-16 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              onToggleCollapse();
              handleToolClick(tool.id);
            }}
            className="p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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
      <div className="w-16 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            className={`p-3 rounded-lg transition-colors ${
              selectedTool === tool.id
                ? 'bg-blue-500 text-white'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={tool.label}
          >
            <tool.icon className="h-5 w-5" />
          </button>
        ))}
      </div>

      {/* Zone de templates */}
      <div className="flex-1 flex flex-col overflow-x-hidden">
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
                    // TemplateManager en mode sidebar (sans modal)
                    <TemplateManager
                      stageRef={stageRef}
                      docNode={docNode}
                      onClose={() => handleToolClick(null)}
                    />
                  ) : selectedTool === 'designs' ? ( // 🆕 NOUVELLE CONDITION
                    // DesignTemplates pour les factory templates
                    <DesignTemplates
                      stageRef={stageRef}
                      docNode={docNode}
                      onClose={() => handleToolClick(null)}
                    />
                  ) : (
                    <SelectedComponent
                      dataSource={dataSource}
                      selectedProduct={selectedProduct}
                      docNode={docNode}
                      onImageSelected={selectedTool === 'upload' ? handleImageSelected : undefined}
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
