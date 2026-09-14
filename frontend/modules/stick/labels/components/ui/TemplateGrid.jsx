// AppTools\src\features\labels\components\ui\TemplateGrid.jsx

import React, { useState } from 'react';
import { MoreVertical, Trash2, Copy, Download, Edit3, Play } from 'lucide-react';

const PolotnoTemplateCard = ({
  template,
  isMenuOpen,
  onMenuToggle,
  onLoad,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}) => {
  const menuButtonRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState({ top: 0, right: 0 });

  React.useEffect(() => {
    if (isMenuOpen && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isMenuOpen]);

  const handleMenuClick = (e, action) => {
    e.stopPropagation();
    onMenuToggle(false);
    action();
  };

  return (
    <div className="break-inside-avoid mb-3 group">
      {/* Image container - hauteur dynamique */}
      <div
        className="relative rounded-lg cursor-pointer hover:shadow-lg transition-shadow bg-white dark:bg-gray-800"
        onClick={onLoad}
      >
        {template.thumbnail ? (
          <>
            <img
              src={template.thumbnail}
              alt={template.name}
              className="w-full h-auto object-contain rounded-lg relative z-0"
              style={{ display: 'block' }}
            />

            {/* Menu trois points - z-index élevé */}
            <div className="absolute top-2 right-2 z-50">
              <button
                ref={menuButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuToggle(!isMenuOpen);
                }}
                className="p-1.5 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg">
            <span className="text-gray-400 dark:text-gray-500 text-sm">Pas d'aperçu</span>
          </div>
        )}
      </div>

      {/* Dropdown menu - position fixed pour ne pas pousser les éléments */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[200]"
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle(false);
            }}
          />

          {/* Menu - position fixed avec calcul de position */}
          <div
            className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-gray-200 dark:border-gray-700 p-2 z-[300] flex flex-col gap-1"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <button
              onClick={(e) => handleMenuClick(e, onLoad)}
              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded flex items-center justify-center text-gray-800 dark:text-gray-200 transition-colors"
              title="Ouvrir"
            >
              <Play className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => handleMenuClick(e, onEdit)}
              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded flex items-center justify-center text-gray-800 dark:text-gray-200 transition-colors"
              title="Modifier"
            >
              <Edit3 className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => handleMenuClick(e, onDuplicate)}
              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded flex items-center justify-center text-gray-800 dark:text-gray-200 transition-colors"
              title="Dupliquer"
            >
              <Copy className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => handleMenuClick(e, onExport)}
              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded flex items-center justify-center text-gray-800 dark:text-gray-200 transition-colors"
              title="Exporter"
            >
              <Download className="h-5 w-5" />
            </button>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <button
              onClick={(e) => handleMenuClick(e, onDelete)}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex items-center justify-center text-red-600 dark:text-red-400 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </>
      )}

      {/* Titre en dessous */}
      <div className="mt-1.5 px-0.5">
        <h3 className="text-sm font-medium text-gray-800 dark:text-white truncate">
          {template.name}
        </h3>
        {template.updatedAt && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {new Date(template.updatedAt).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>
    </div>
  );
};

const TemplateGrid = ({ templates, onLoad, onEdit, onDuplicate, onExport, onDelete }) => {
  const [openMenuId, setOpenMenuId] = useState(null);

  return (
    <div className="p-3 overflow-visible">
      {/* Grille Masonry à 2 colonnes - gap réduit et overflow visible */}
      <div className="columns-2 gap-3" style={{ overflow: 'visible' }}>
        {templates.map((template) => (
          <PolotnoTemplateCard
            key={template.id}
            template={template}
            isMenuOpen={openMenuId === template.id}
            onMenuToggle={(isOpen) => setOpenMenuId(isOpen ? template.id : null)}
            onLoad={() => onLoad(template)}
            onEdit={() => onEdit(template)}
            onDuplicate={() => onDuplicate(template.id)}
            onExport={() => onExport(template.id)}
            onDelete={() => onDelete(template)}
          />
        ))}
      </div>

      {/* Message si aucun template */}
      {templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-sm">Aucun template disponible</p>
        </div>
      )}
    </div>
  );
};

export default TemplateGrid;
