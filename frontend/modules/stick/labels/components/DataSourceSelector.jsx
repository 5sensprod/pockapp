// src/features/labels/components/DataSourceSelector.jsx
import React, { useState } from 'react';
import { FileText, Database, X } from 'lucide-react';

const DataSourceSelector = ({ onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Nouvelle affiche</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Mode Vierge */}
          <button
            onClick={() => onSelect('blank')}
            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                <FileText className="h-12 w-12 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-1">Affiche vierge</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Créez une affiche de zéro avec vos propres éléments
                </p>
              </div>
            </div>
          </button>

          {/* Mode avec données */}
          <button
            onClick={() => onSelect('data')}
            className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all group"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors">
                <Database className="h-12 w-12 text-gray-600 dark:text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-1">Avec données produit</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Liez l'affiche à un produit pour afficher ses informations
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataSourceSelector;
