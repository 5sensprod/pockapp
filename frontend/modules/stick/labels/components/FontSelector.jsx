import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useGoogleFonts } from '../hooks/useGoogleFonts';
import { loadGoogleFont } from '../utils/loadGoogleFont';

const FontSelector = ({ value, onChange, apiKey }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { fonts, loading } = useGoogleFonts(apiKey);

  // Filtrer les polices selon la recherche
  const filteredFonts = useMemo(() => {
    if (!searchQuery.trim()) return fonts;
    const query = searchQuery.toLowerCase();
    return fonts.filter(
      (f) => f.family.toLowerCase().includes(query) || f.category?.toLowerCase().includes(query)
    );
  }, [fonts, searchQuery]);

  // Précharger toutes les polices filtrées dès qu'elles changent
  useEffect(() => {
    if (isOpen && filteredFonts.length > 0) {
      // Charger toutes les polices visibles en parallèle
      filteredFonts.forEach((font) => {
        loadGoogleFont(font.family, { weights: '400;700' });
      });
    }
  }, [filteredFonts, isOpen]);

  // Fermer au clic extérieur
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 min-w-[140px]"
      >
        <span className="truncate" style={{ fontFamily: value }}>
          {value}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 flex flex-col">
          {/* Recherche */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Liste des polices */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">Chargement...</div>
            ) : filteredFonts.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Aucune police trouvée
              </div>
            ) : (
              filteredFonts.map((font) => (
                <button
                  key={font.family}
                  onClick={() => {
                    onChange(font.family);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                    value === font.family ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <span className="text-sm truncate flex-1" style={{ fontFamily: font.family }}>
                    {font.family}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                    {font.category}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FontSelector;
