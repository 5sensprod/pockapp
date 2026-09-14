// src/components/reports/export/GeneralOptions.jsx

import React from 'react';

/**
 * Composant pour une option avec checkbox
 */
const CheckboxOption = ({ id, checked, onChange, label, description }) => (
  <div>
    <label className="flex items-center gap-3 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
    </label>
    {description && <p className="text-xs text-gray-500 ml-7 mt-1">{description}</p>}
  </div>
);

/**
 * Composant principal pour les options générales
 */
const GeneralOptions = ({ exportOptions, setExportOptions }) => {
  /**
   * Met à jour une option booléenne
   */
  const updateBooleanOption = (key, value) => {
    setExportOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
        Options générales
      </label>

      <div className="space-y-3">
        {/* Informations de l'entreprise */}
        <CheckboxOption
          id="includeCompanyInfo"
          checked={exportOptions.includeCompanyInfo}
          onChange={(e) => updateBooleanOption('includeCompanyInfo', e.target.checked)}
          label="Inclure les informations de l'entreprise"
          description="Affiche le nom, l'adresse et le SIRET de l'entreprise dans l'en-tête du rapport"
        />

        {/* Graphiques pour rapport de synthèse */}
        {exportOptions.reportType === 'summary' && (
          <CheckboxOption
            id="includeCharts"
            checked={exportOptions.includeCharts}
            onChange={(e) => updateBooleanOption('includeCharts', e.target.checked)}
            label="Inclure les métriques graphiques"
            description="Ajoute des visualisations graphiques des données dans le rapport de synthèse"
          />
        )}
      </div>
    </div>
  );
};

export default GeneralOptions;
