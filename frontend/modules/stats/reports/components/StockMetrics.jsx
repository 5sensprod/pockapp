// src/components/reports/StockMetrics.jsx

import React from 'react';
import { Package, ShoppingCart, TrendingUp, Euro } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';

const MetricCard = ({ icon: Icon, title, badge, value, rows, color }) => {
  const colorClasses = {
    blue: {
      icon: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-700',
      border: 'border-l-4 border-blue-500',
    },
    green: {
      icon: 'text-green-600',
      badge: 'bg-green-100 text-green-700',
      border: 'border-l-4 border-green-500',
    },
    purple: {
      icon: 'text-purple-600',
      badge: 'bg-purple-100 text-purple-700',
      border: 'border-l-4 border-purple-500',
    },
    orange: {
      icon: 'text-orange-500',
      badge: 'bg-orange-100 text-orange-700',
      border: 'border-l-4 border-orange-500',
    },
  };

  const c = colorClasses[color];

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-md border border-gray-200 dark:border-gray-700 ${c.border} flex flex-col gap-3`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${c.icon}`} />
          <span className="font-semibold text-gray-800 dark:text-white text-sm">{title}</span>
        </div>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{badge}</span>
        )}
      </div>

      <div className={`text-2xl lg:text-3xl font-bold ${c.icon} leading-tight break-words`}>
        {value}
      </div>

      <div className="flex flex-col gap-1 mt-auto">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex justify-between items-center text-xs ${row.border ? 'border-t border-gray-200 dark:border-gray-600 pt-1 mt-1' : ''} ${row.highlight ? 'font-semibold text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <span>{row.label}</span>
            <span className={row.valueColor || ''}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StockMetrics = ({ stats }) => {
  if (!stats) return null;

  const { summary, financial, performance } = stats;

  const tvaEstimee = financial.retail_value_ttc
    ? financial.retail_value_ttc - financial.retail_value
    : financial.tax_amount;

  const retailTTC = financial.retail_value_ttc || financial.retail_value + tvaEstimee;

  // Taux de marque = Marge / Vente HT
  const tauxDeMarque =
    financial.retail_value > 0 ? (financial.potential_margin / financial.retail_value) * 100 : 0;

  const metrics = [
    {
      icon: Package,
      color: 'blue',
      title: 'Produits en stock',
      badge: `${formatNumber(summary.simple_products)} au total`,
      value: formatNumber(summary.products_in_stock),
      rows: [
        { label: 'Produits valorisés (stock > 0)', value: formatNumber(summary.products_in_stock) },
        {
          label: 'Sans stock (exclus)',
          value: formatNumber(summary.excluded_products),
          valueColor: 'text-red-500',
        },
      ],
    },
    {
      icon: ShoppingCart,
      color: 'green',
      title: "Coût d'achat du stock (HT)",
      badge: 'Prix achat HT',
      value: formatCurrency(financial.inventory_value),
      rows: [
        {
          label: 'Moyenne par produit',
          value: formatCurrency(performance.avg_inventory_per_product),
        },
        { label: 'Base de calcul de la marge', value: 'Prix achat fournisseur HT' },
      ],
    },
    {
      icon: TrendingUp,
      color: 'purple',
      title: 'Valeur de vente du stock (HT)',
      badge: 'Prix vente HT',
      value: formatCurrency(financial.retail_value),
      rows: [
        { label: 'Moyenne par produit', value: formatCurrency(performance.avg_retail_per_product) },
        { label: 'Valeur TTC (avec TVA)', value: formatCurrency(retailTTC), border: true },
      ],
    },
    {
      icon: Euro,
      color: 'orange',
      title: 'Marge commerciale brute (HT)',
      badge: `Marque : ${formatPercentage(tauxDeMarque)}`,
      value: formatCurrency(financial.potential_margin),
      rows: [
        {
          label: 'Taux de marque (marge / vente HT)',
          value: formatPercentage(tauxDeMarque),
          valueColor: 'text-orange-500 font-bold',
        },
        {
          label: 'Taux de marge (marge / achat HT)',
          value: formatPercentage(financial.margin_percentage),
          valueColor: 'text-gray-400',
        },
        { label: 'TVA collectée estimée', value: formatCurrency(tvaEstimee), border: true },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
      {metrics.map((metric, index) => (
        <MetricCard key={index} {...metric} />
      ))}
    </div>
  );
};

export default StockMetrics;
