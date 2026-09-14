// src/features/labels/components/templates/LayersPanel.jsx
import React, { useState, useMemo } from 'react';
import {
  Lock,
  Unlock,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Type as TypeIcon,
  Image as ImageIcon,
  Shapes as ShapesIcon,
  QrCode as QrCodeIcon,
  Barcode,
} from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';

const iconForType = (type) => {
  switch (type) {
    case 'text':
      return TypeIcon;
    case 'image':
      return ImageIcon;
    case 'shape':
      return ShapesIcon;
    case 'qrcode':
      return QrCodeIcon;
    case 'barcode':
      return Barcode;
    default:
      return TypeIcon;
  }
};

const cut = (s = '', n = 25) => (s.length > n ? s.slice(0, n) + '…' : s);

const LayersPanel = () => {
  const elements = useLabelStore((s) => s.elements);
  const selectedId = useLabelStore((s) => s.selectedId);
  const selectElement = useLabelStore((s) => s.selectElement);
  const updateElement = useLabelStore((s) => s.updateElement);
  const deleteElement = useLabelStore((s) => s.deleteElement);
  const duplicateElement = useLabelStore((s) => s.duplicateElement);
  const moveElement = useLabelStore((s) => s.moveElement);

  const [draggedIndex, setDraggedIndex] = useState(null);
  const reversed = useMemo(() => [...elements].reverse(), [elements]);

  const onDragStart = (e, i) => {
    setDraggedIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e, i) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== i) {
      moveElement(draggedIndex, i);
      setDraggedIndex(i);
    }
  };
  const onDragEnd = () => setDraggedIndex(null);

  if (!elements.length) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-sm">Aucun calque</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2 w-full max-w-full overflow-x-hidden">
      {reversed.map((el, idx) => {
        const actualIndex = elements.length - 1 - idx;
        const isSelected = el.id === selectedId;
        const isLocked = el.locked || false;
        const isVisible = el.visible !== false;
        const Icon = iconForType(el.type);

        // ✨ Nom base amélioré avec affichage du binding
        let baseName = el.type.charAt(0).toUpperCase() + el.type.slice(1);

        if (el.type === 'text') {
          if (el.dataBinding) {
            baseName = `Texte (${el.dataBinding})`;
          } else {
            baseName = el.text?.split('(')[0]?.trim() || 'Texte';
          }
        } else if (el.type === 'shape') {
          const noms = {
            rectangle: 'Rectangle',
            circle: 'Cercle',
            triangle: 'Triangle',
            star: 'Étoile',
            line: 'Trait',
          };
          baseName = noms[el.shape] || 'Forme';
        } else if (el.type === 'qrcode') {
          // ✅ Afficher le champ lié plutôt que la valeur tronquée
          if (el.dataBinding) {
            baseName = `QR (${el.dataBinding})`;
          } else {
            baseName = el.qrValue ? `QR: ${el.qrValue}` : 'QR Code';
          }
        }

        const name25 = cut(baseName, 25);
        const name12 = cut(baseName, 12);

        return (
          <div
            key={el.id}
            draggable={!isLocked}
            onDragStart={(e) => onDragStart(e, actualIndex)}
            onDragOver={(e) => onDragOver(e, actualIndex)}
            onDragEnd={onDragEnd}
            onClick={() => !isLocked && selectElement(el.id)}
            className={[
              'group relative flex items-center gap-1 px-2 py-2 rounded cursor-pointer transition-colors',
              // gouttière fixe pour les icônes (pr-22 => 88px)
              'w-full max-w-full overflow-hidden pr-[88px] box-border',
              isSelected ? 'bg-blue-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              !isVisible ? 'opacity-50' : '',
              draggedIndex === actualIndex ? 'opacity-50' : '',
            ].join(' ')}
          >
            {!isLocked && (
              <GripVertical className="h-4 w-4 text-gray-400 cursor-grab active:cursor-grabbing shrink-0" />
            )}

            {/* Icône + label */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="relative min-w-0">
                <span className="block text-sm group-hover:hidden" title={baseName}>
                  {name25}
                </span>
                <span className="hidden group-hover:block text-sm truncate" title={baseName}>
                  {name12}
                </span>
              </span>
            </div>

            {/* Actions à droite */}
            <div className="absolute right-2 inset-y-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(el.id, { visible: !isVisible });
                }}
                className="p-1 rounded hover:bg-white/20"
                title={isVisible ? 'Masquer' : 'Afficher'}
              >
                {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateElement(el.id, { locked: !isLocked });
                }}
                className="p-1 rounded hover:bg-white/20"
                title={isLocked ? 'Déverrouiller' : 'Verrouiller'}
              >
                {isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateElement(el.id);
                }}
                className="p-1 rounded hover:bg-white/20"
                title="Dupliquer"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElement(el.id);
                }}
                className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LayersPanel;
