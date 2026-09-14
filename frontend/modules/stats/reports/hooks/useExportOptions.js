// src/hooks/useExportOptions.js
// 🔧 VERSION CORRIGÉE avec export par défaut

import { useState, useCallback } from 'react';

/**
 * Hook personnalisé pour gérer les options d'export PDF
 * @returns {Object} État et fonctions de gestion des options
 */
export const useExportOptions = () => {
  // État initial des options d'export
  const [exportOptions, setExportOptions] = useState({
    reportType: 'summary',
    includeCompanyInfo: true,
    includeCharts: true,
    sortBy: 'name',
    sortOrder: 'asc',
    groupByCategory: false,
    selectedCategories: [],
    includeUncategorized: false,
    isSimplified: false, // 🔥 NOUVELLE OPTION
  });

  // État pour la hauteur du sélecteur de catégories
  const [categorySelectorHeight, setCategorySelectorHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  /**
   * Met à jour une option spécifique
   */
  const updateOption = useCallback((key, value) => {
    setExportOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  /**
   * Met à jour plusieurs options en une fois
   */
  const updateOptions = useCallback((updates) => {
    setExportOptions((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  /**
   * Bascule une option booléenne
   */
  const toggleOption = useCallback((key) => {
    setExportOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  /**
   * Met à jour le type de rapport et ajuste les options en conséquence
   */
  const setReportType = useCallback((reportType) => {
    setExportOptions((prev) => {
      const newOptions = { ...prev, reportType };

      // Si on passe à "summary", désactiver le groupement par catégories
      if (reportType === 'summary') {
        newOptions.groupByCategory = false;
        newOptions.selectedCategories = [];
        newOptions.isSimplified = false; // 🔥 Réinitialiser aussi le mode simplifié
      }

      return newOptions;
    });
  }, []);

  /**
   * Active/désactive le groupement par catégories
   */
  const setGroupByCategory = useCallback((enabled) => {
    setExportOptions((prev) => ({
      ...prev,
      groupByCategory: enabled,
      selectedCategories: enabled ? prev.selectedCategories : [],
      // 🔥 Si on désactive le groupement, désactiver aussi le mode simplifié
      isSimplified: enabled ? prev.isSimplified : false,
    }));
  }, []);

  /**
   * 🔥 NOUVELLE MÉTHODE : Active/désactive le mode simplifié
   */
  const setSimplified = useCallback((enabled) => {
    setExportOptions((prev) => ({
      ...prev,
      isSimplified: enabled,
    }));
  }, []);

  /**
   * Met à jour la liste des catégories sélectionnées
   */
  const setSelectedCategories = useCallback((categories) => {
    setExportOptions((prev) => ({
      ...prev,
      selectedCategories: categories,
    }));
  }, []);

  /**
   * Sélectionne toutes les catégories fournies
   */
  const selectAllCategories = useCallback((allCategoryIds) => {
    setExportOptions((prev) => ({
      ...prev,
      selectedCategories: allCategoryIds,
    }));
  }, []);

  /**
   * Désélectionne toutes les catégories
   */
  const deselectAllCategories = useCallback(() => {
    setExportOptions((prev) => ({
      ...prev,
      selectedCategories: [],
    }));
  }, []);

  /**
   * Gère la sélection d'une catégorie avec ses descendants
   */
  const handleCategorySelection = useCallback((categoryId, isSelected, categoryAndDescendants) => {
    setExportOptions((prev) => ({
      ...prev,
      selectedCategories: isSelected
        ? [
            ...prev.selectedCategories,
            ...categoryAndDescendants.filter((id) => !prev.selectedCategories.includes(id)),
          ]
        : prev.selectedCategories.filter((id) => !categoryAndDescendants.includes(id)),
    }));
  }, []);

  /**
   * Gestion du redimensionnement du sélecteur de catégories
   */
  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault();
      setIsResizing(true);

      const startY = e.clientY;
      const startHeight = categorySelectorHeight;

      const handleMouseMove = (e) => {
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(200, Math.min(500, startHeight + deltaY));
        setCategorySelectorHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [categorySelectorHeight]
  );

  /**
   * Remet les options à leur état initial
   */
  const resetOptions = useCallback(() => {
    setExportOptions({
      reportType: 'summary',
      includeCompanyInfo: true,
      includeCharts: true,
      sortBy: 'name',
      sortOrder: 'asc',
      groupByCategory: false,
      selectedCategories: [],
      includeUncategorized: false,
      isSimplified: false, // 🔥 Inclure dans la réinitialisation
    });
    setCategorySelectorHeight(300);
  }, []);

  /**
   * Prépare les options pour l'API
   */
  const prepareApiOptions = useCallback(
    (companyInfo) => {
      return {
        companyInfo,
        reportType: exportOptions.reportType,
        includeCompanyInfo: exportOptions.includeCompanyInfo,
        includeCharts: exportOptions.includeCharts,
        sortBy: exportOptions.sortBy,
        sortOrder: exportOptions.sortOrder,
        groupByCategory: exportOptions.groupByCategory,
        selectedCategories: exportOptions.selectedCategories,
        includeUncategorized: exportOptions.includeUncategorized,
        isSimplified: exportOptions.isSimplified, // 🔥 NOUVELLE OPTION POUR L'API
      };
    },
    [exportOptions]
  );

  return {
    // État
    exportOptions,
    categorySelectorHeight,
    isResizing,

    // Actions générales
    updateOption,
    updateOptions,
    toggleOption,
    resetOptions,
    setExportOptions, // 🔥 AJOUT MANQUANT : Exposer setExportOptions directement

    // Actions spécifiques
    setReportType,
    setGroupByCategory,
    setSimplified, // 🔥 NOUVELLE ACTION
    setSelectedCategories,
    selectAllCategories,
    deselectAllCategories,
    handleCategorySelection,

    // Redimensionnement
    setCategorySelectorHeight,
    handleResizeStart,

    // Utilitaires
    prepareApiOptions,
  };
};

// 🔥 EXPORT PAR DÉFAUT AUSSI (pour compatibilité)
export default useExportOptions;
