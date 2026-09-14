// frontend/modules/stats/reports/ReportsPage.jsx
//
// Porté d'AppPos (`AppTools/src/pages/ReportsPage.jsx`) le 14 septembre 2026,
// À L'IDENTIQUE. Les seules retouches sont les attaches : la page lisait
// AppServe par deux hooks (`/api/products/stock/statistics` et un export PDF
// serveur), elle lit maintenant les routes Go du dépôt et fabrique son PDF sur
// le poste. Voir `PocketReports-docs/01-portage-rapports.md`.
//
// ⚠️ Ce fichier n'est ni typé ni formaté par Biome : c'est du code porté.

import React, { useState } from 'react';
import { RefreshCw, FileText } from 'lucide-react';

import { useActiveCompany } from '@/lib/ActiveCompanyProvider';
import { useCompany } from '@/lib/queries/companies';

// Composants modulaires
import StockMetrics from './components/StockMetrics';
import TaxBreakdown from './components/TaxBreakdown';
import ReportSummary from './components/ReportSummary';
import StockCategoryChart from './components/StockCategoryChart';
import ExportModal from './components/export/ExportModal';

// Les nombres viennent du Go, le PDF se fabrique ici.
import { useStatistiquesStock } from './lib/use-statistiques-stock';
import { useExportPDF } from './lib/use-export-pdf';

/**
 * Composant pour l'indicateur de chargement
 */
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

/**
 * Composant pour l'affichage d'erreur
 */
const ErrorMessage = ({ error, onRetry }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
    {error}
    <button onClick={onRetry} className="ml-4 text-red-600 hover:text-red-800 underline">
      Réessayer
    </button>
  </div>
);

/**
 * Composant pour l'en-tête de la page
 */
const PageHeader = ({ lastUpdate, onRefresh, onExport, isExporting, hasData }) => (
  <div className="flex justify-between items-center mb-8">
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rapports de Stock</h1>
      <p className="text-gray-600 dark:text-gray-300 mt-1">
        Analyse financière du stock en temps réel
      </p>
    </div>

    <div className="flex items-center gap-4">
      {lastUpdate && (
        <span className="text-sm text-gray-500">
          Mis à jour: {lastUpdate.toLocaleTimeString('fr-FR')}
        </span>
      )}

      <button
        onClick={onExport}
        disabled={isExporting || !hasData}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileText className="w-4 h-4" />
        Export PDF
      </button>

      <button
        onClick={onRefresh}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Actualiser
      </button>
    </div>
  </div>
);

/**
 * Composant principal de la page des rapports - VERSION FINALE SIMPLE
 */
const ReportsPage = () => {
  // État local
  const [showExportModal, setShowExportModal] = useState(false);

  const { activeCompanyId } = useActiveCompany();
  const companyId = activeCompanyId ?? undefined;

  const {
    data: stockStats,
    isLoading: loading,
    error,
    dataUpdatedAt,
    refetch,
  } = useStatistiquesStock(companyId);
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const refreshData = () => refetch();

  const { isExporting, exportStockStatisticsToPDF } = useExportPDF(stockStats, companyId);

  // L'en-tête du PDF. AppPos écrivait « AXE Musique » et son SIRET en dur dans
  // la modale ; ici l'entreprise active les porte.
  const { data: entreprise } = useCompany(companyId);
  const infosEntreprise = entreprise
    ? {
        name: entreprise.trade_name || entreprise.name,
        address: [
          entreprise.address_line1,
          entreprise.address_line2,
          [entreprise.zip_code, entreprise.city].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(', '),
        siret: entreprise.siret,
      }
    : undefined;

  /**
   * Gère l'export PDF
   */
  const handleExportPDF = async (apiOptions) => {
    try {
      await exportStockStatisticsToPDF(apiOptions);

      // Fermer la modale après succès
      setShowExportModal(false);
    } catch (error) {
      console.error("Erreur lors de l'export PDF:", error);
      throw error; // Relancer pour que ExportModal puisse gérer l'erreur
    }
  };

  /**
   * Ouvre la modale d'export
   */
  const handleOpenExportModal = () => {
    setShowExportModal(true);
  };

  /**
   * Ferme la modale d'export
   */
  const handleCloseExportModal = () => {
    setShowExportModal(false);
  };

  // Rendu du composant
  return (
    <div className="p-6 max-w-7xl mx-auto" id="reports-container">
      {/* En-tête de la page */}
      <PageHeader
        lastUpdate={lastUpdate}
        onRefresh={refreshData}
        onExport={handleOpenExportModal}
        isExporting={isExporting}
        hasData={!!stockStats}
      />

      {/* États de chargement et d'erreur */}
      {loading && <LoadingSpinner />}

      {error && (
        <ErrorMessage
          error={error.message || 'Erreur lors du chargement des statistiques'}
          onRetry={refreshData}
        />
      )}

      {/* Contenu principal */}
      {stockStats && !loading && (
        <>
          {/* Métriques principales */}
          <StockMetrics stats={stockStats} />

          {/* Graphique de répartition des catégories */}
          <div className="mb-8">
            <StockCategoryChart categories={stockStats.categories} />
          </div>

          {/* Répartition par TVA */}
          <div className="mb-8">
            <TaxBreakdown breakdown={stockStats.financial.tax_breakdown} />
          </div>

          {/* Résumé final */}
          <div className="mb-8">
            <ReportSummary summary={stockStats.summary} financial={stockStats.financial} />
          </div>
        </>
      )}

      {/* Modale d'export */}
      {showExportModal && (
        <ExportModal
          onClose={handleCloseExportModal}
          onExport={handleExportPDF}
          isExporting={isExporting}
          parCategorie={stockStats?.par_categorie}
          entreprise={infosEntreprise}
          companyId={companyId}
        />
      )}
    </div>
  );
};

export default ReportsPage;
