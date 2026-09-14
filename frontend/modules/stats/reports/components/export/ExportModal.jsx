// ExportModal.jsx — porté d'AppPos, À L'IDENTIQUE.
//
// Deux attaches ont changé :
//  • l'arbre de catégories (voir `CategoryTreeSelector.jsx`) ;
//  • les informations de l'entreprise, qui étaient écrites EN DUR dans ce
//    fichier (« AXE Musique », adresse et SIRET). Elles viennent maintenant de
//    l'entreprise active, en base : ce dépôt est multi-entreprises, et un SIRET
//    en dur sur un document comptable est un faux en puissance.

import React from 'react';
import { X, Download } from 'lucide-react';
import ReportTypeSelector from './ReportTypeSelector';
import DetailedReportOptions from './DetailedReportOptions';
import GeneralOptions from './GeneralOptions';
import { useExportOptions } from '../../hooks/useExportOptions';
import { useArbreCategories } from '../../lib/use-arbre-categories';

/**
 * Composant pour l'aperçu de la sélection
 */
const SelectionSummary = ({ exportOptions, getSelectedProductsCount }) => {
  if (!exportOptions.groupByCategory || exportOptions.selectedCategories.length === 0) {
    return null;
  }

  return (
    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
      <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
        Aperçu de la sélection
      </h4>
      <div className="text-sm text-green-800 dark:text-green-200">
        <div className="mb-2">
          <strong>{exportOptions.selectedCategories.length}</strong> catégorie(s) sélectionnée(s)
        </div>
        <div className="text-xs">
          Total estimé:{' '}
          <strong>{getSelectedProductsCount(exportOptions.selectedCategories)} produits</strong> en
          stock
        </div>
        {/* 🔥 NOUVEAU : Indicateur mode simplifié */}
        {exportOptions.isSimplified && (
          <div className="text-xs mt-1 font-italic text-green-700 dark:text-green-300">
            📊 Mode simplifié activé : seuls les totaux par catégorie seront affichés
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Composant pour les actions de la modale (footer)
 */
const ModalActions = ({ onClose, onExport, isExporting }) => (
  <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700 rounded-b-xl">
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        disabled={isExporting}
        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
      >
        Annuler
      </button>
      <button
        onClick={onExport}
        disabled={isExporting}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {isExporting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Export...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Exporter PDF
          </>
        )}
      </button>
    </div>
  </div>
);

/**
 * Composant principal de la modale d'export
 */
const ExportModal = ({ onClose, onExport, isExporting, parCategorie, entreprise, companyId }) => {
  const {
    exportOptions,
    categorySelectorHeight,
    isResizing,
    setReportType,
    setExportOptions, // 🔥 CETTE LIGNE ÉTAIT MANQUANTE
    setCategorySelectorHeight,
    handleResizeStart,
    prepareApiOptions,
  } = useExportOptions();

  const { getSelectedProductsCount } = useArbreCategories(parCategorie, companyId);

  /**
   * Gère l'export PDF
   */
  const handleExportClick = async () => {
    try {
      // Les informations de l'entreprise ACTIVE, pas celles d'un magasin écrit
      // en dur. Absentes, l'en-tête du PDF se passe d'elles.
      const apiOptions = prepareApiOptions(entreprise || {});

      // Appeler la fonction d'export
      await onExport(apiOptions);
    } catch (error) {
      // Le hook d'export a déjà prévenu l'utilisateur (toast) : ici on évite
      // seulement que l'erreur remonte en promesse non traitée.
      console.error('Erreur export PDF:', error);
    }
  };

  /**
   * Gère le changement de type de rapport
   */
  const handleReportTypeChange = (newType) => {
    setReportType(newType);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Options d'Export PDF
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              disabled={isExporting}
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="p-6 space-y-6">
          {/* Sélecteur de type de rapport */}
          <ReportTypeSelector
            reportType={exportOptions.reportType}
            onReportTypeChange={handleReportTypeChange}
          />

          {/* Options spécifiques au rapport détaillé */}
          {exportOptions.reportType === 'detailed' && (
            <DetailedReportOptions
              exportOptions={exportOptions}
              setExportOptions={setExportOptions}
              categorySelectorHeight={categorySelectorHeight}
              setCategorySelectorHeight={setCategorySelectorHeight}
              isResizing={isResizing}
              handleResizeStart={handleResizeStart}
              parCategorie={parCategorie}
              companyId={companyId}
            />
          )}

          {/* Options générales */}
          <GeneralOptions exportOptions={exportOptions} setExportOptions={setExportOptions} />

          {/* Aperçu de la sélection */}
          <SelectionSummary
            exportOptions={exportOptions}
            getSelectedProductsCount={getSelectedProductsCount}
          />
        </div>

        {/* Actions (footer) */}
        <ModalActions onClose={onClose} onExport={handleExportClick} isExporting={isExporting} />
      </div>
    </div>
  );
};

export default ExportModal;
