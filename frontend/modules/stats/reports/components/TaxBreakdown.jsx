// src/components/reports/TaxBreakdown.jsx

import React from 'react';
import { formatCurrency, formatNumber, getTaxRateLabel } from '../utils/formatters';

const TaxRateCard = ({ data }) => {
  const retailValueTTC = data.retail_value_ttc || data.retail_value + data.tax_amount;

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
      {/* En-tête */}
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-bold text-gray-900 dark:text-white text-base">
          {getTaxRateLabel(data.rate)}
        </h4>
        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded-full font-medium">
          {formatNumber(data.product_count)} produit{data.product_count > 1 ? 's' : ''}
        </span>
      </div>

      {/* Tableau des valeurs */}
      <div className="space-y-2">
        <div className="flex justify-between items-center py-1">
          <span className="text-sm text-gray-500 dark:text-gray-400">Coût d'achat HT</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-white">
            {formatCurrency(data.inventory_value)}
          </span>
        </div>

        <div className="flex justify-between items-center py-1">
          <span className="text-sm text-gray-500 dark:text-gray-400">Prix de vente HT</span>
          <span className="text-sm font-semibold text-gray-800 dark:text-white">
            {formatCurrency(data.retail_value)}
          </span>
        </div>

        {data.rate > 0 && (
          <>
            <div className="flex justify-between items-center py-1 border-t border-dashed border-gray-300 dark:border-gray-500 mt-1 pt-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                TVA {data.rate}% sur vente HT
              </span>
              <span className="text-sm font-semibold text-amber-600">
                + {formatCurrency(data.tax_amount)}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 bg-white dark:bg-gray-600 rounded px-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Prix de vente TTC
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {formatCurrency(retailValueTTC)}
              </span>
            </div>
          </>
        )}

        {/* Marge brute */}
        <div className="flex justify-between items-center py-1 border-t border-gray-200 dark:border-gray-500 mt-1 pt-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Marge brute HT</span>
          <span className="text-sm font-bold text-green-600">
            {formatCurrency(data.retail_value - data.inventory_value)}
          </span>
        </div>
      </div>
    </div>
  );
};

const TaxBreakdown = ({ breakdown }) => {
  if (!breakdown || Object.keys(breakdown).length === 0) return null;

  const totalTVA = Object.values(breakdown).reduce((sum, d) => sum + d.tax_amount, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 mb-8">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          Répartition par taux de TVA
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          TVA totale estimée :{' '}
          <strong className="text-amber-600">{formatCurrency(totalTVA)}</strong>
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Tous les montants sont en <strong>Hors Taxes (HT)</strong>. La TVA est calculée sur la base
        du prix de vente HT × taux.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Object.entries(breakdown).map(([key, data]) => (
          <TaxRateCard key={key} data={data} />
        ))}
      </div>
    </div>
  );
};

export default TaxBreakdown;
