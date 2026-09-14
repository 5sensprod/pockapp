// src/components/reports/ReportSummary.jsx

import React from 'react';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { Info } from 'lucide-react';

const Row = ({ label, value, valueClass = 'text-gray-900 dark:text-white', border = false }) => (
  <div
    className={`flex justify-between items-center py-2 ${border ? 'border-t border-gray-200 dark:border-gray-600 mt-1' : ''}`}
  >
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
  </div>
);

const ReportSummary = ({ summary, financial }) => {
  if (!summary || !financial) return null;

  const tvaEstimee = financial.retail_value_ttc
    ? financial.retail_value_ttc - financial.retail_value
    : financial.tax_amount;

  const retailTTC = financial.retail_value_ttc || financial.retail_value + tvaEstimee;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
        Synthèse financière du stock
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Récapitulatif complet basé sur {formatNumber(summary.products_in_stock)} produits valorisés
        (stock &gt; 0).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Colonne 1 — Achat */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
            📦 Coût d'achat
          </p>
          <Row
            label="Valeur totale HT"
            value={formatCurrency(financial.inventory_value)}
            valueClass="text-green-600"
          />
          <Row
            label="Moyenne par produit"
            value={formatCurrency(financial.inventory_value / summary.products_in_stock)}
          />
          <Row
            label="Produits sans stock (exclus)"
            value={formatNumber(summary.excluded_products)}
            valueClass="text-red-500"
          />
        </div>

        {/* Colonne 2 — Vente */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
            🏷️ Prix de vente
          </p>
          <Row
            label="Valeur totale HT"
            value={formatCurrency(financial.retail_value)}
            valueClass="text-purple-600"
          />
          <Row
            label="TVA estimée"
            value={`+ ${formatCurrency(tvaEstimee)}`}
            valueClass="text-amber-600"
          />
          <Row
            label="Valeur totale TTC"
            value={formatCurrency(retailTTC)}
            valueClass="text-gray-900 dark:text-white font-bold"
            border
          />
        </div>

        {/* Colonne 3 — Marge */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">
            📈 Marge commerciale
          </p>
          <Row
            label="Marge brute HT"
            value={formatCurrency(financial.potential_margin)}
            valueClass="text-orange-500 font-bold"
          />
          <Row
            label="Taux de marge (sur achat)"
            value={formatPercentage(financial.margin_percentage)}
            valueClass="text-orange-500"
          />
          <Row
            label="Taux de marque (Marge / Vente HT)"
            value={formatPercentage((financial.potential_margin / financial.retail_value) * 100)}
          />
          <Row
            label="Marge moyenne / produit"
            value={formatCurrency(financial.potential_margin / summary.products_in_stock)}
            border
          />
        </div>
      </div>

      {/* Note de bas de page */}
      <div className="flex items-start gap-2 mt-5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Tous les montants sont en <strong>Hors Taxes (HT)</strong>. La marge est calculée sur la
          base : Prix de vente HT − Prix d'achat HT. La TVA affichée est une estimation basée sur
          les taux configurés par produit.
        </p>
      </div>
    </div>
  );
};

export default ReportSummary;
