// src/components/reports/export/ReportTypeSelector.jsx

import React from 'react';
import { BarChart3, List } from 'lucide-react';

/**
 * Composant pour une option de type de rapport
 */
const ReportTypeOption = ({ type, icon: Icon, title, description, isSelected, onSelect }) => (
  <button
    className={`p-4 rounded-lg border-2 transition-all text-left w-full ${
      isSelected
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
    }`}
    onClick={() => onSelect(type)}
  >
    <div className="flex items-center gap-3 mb-2">
      <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />
      <span
        className={`font-medium ${
          isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'
        }`}
      >
        {title}
      </span>
    </div>
    <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
  </button>
);

/**
 * Composant principal pour la sélection du type de rapport
 */
const ReportTypeSelector = ({ reportType, onReportTypeChange }) => {
  const reportTypes = [
    {
      type: 'summary',
      icon: BarChart3,
      title: 'Rapport de Synthèse',
      description: "Vue d'ensemble avec métriques principales et répartition par TVA",
    },
    {
      type: 'detailed',
      icon: List,
      title: 'Rapport Détaillé',
      description: 'Liste complète des produits avec SKU, désignation, prix, stock et valeurs',
    },
  ];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        Type de rapport
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportTypes.map((type) => (
          <ReportTypeOption
            key={type.type}
            type={type.type}
            icon={type.icon}
            title={type.title}
            description={type.description}
            isSelected={reportType === type.type}
            onSelect={onReportTypeChange}
          />
        ))}
      </div>
    </div>
  );
};

export default ReportTypeSelector;
