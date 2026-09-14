// StockCategoryChart.jsx — porté d'AppPos, À L'IDENTIQUE pour le dessin.
//
// Ce qui a changé : le composant ne charge plus rien et ne calcule plus rien.
// Il recevait un store zustand qui lisait les 2999 produits et les 463
// catégories pour remonter l'arbre et sommer ; il reçoit maintenant en
// propriété les catégories racines DÉJÀ additionnées par
// `/api/reports/stock-statistics`. `donneesCamembert` n'en fait que de la mise
// en forme — pourcentages, libellés, douze plus grosses parts.

import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { TrendingUp, Package, DollarSign, BarChart3 } from 'lucide-react';
import { donneesCamembert, PARTS_MAXIMUM } from '../lib/donnees-camembert';

/**
 * Palette de couleurs pour le camembert
 */
const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#F97316',
  '#84CC16',
  '#EC4899',
  '#6B7280',
  '#14B8A6',
  '#F43F5E',
];

/**
 * Composant de tooltip personnalisé
 */
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
        <p className="font-semibold text-gray-900 dark:text-white">{data.name}</p>
        <p className="text-blue-600 dark:text-blue-400">Valeur: {data.formattedValue}</p>
        <p className="text-gray-600 dark:text-gray-300">
          {data.products} produits ({data.percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

/**
 * Composant de légende personnalisée
 */
const CustomLegend = ({ payload, viewMode }) => {
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-4">
      {payload.map((entry, index) => (
        <div
          key={index}
          className="flex items-center gap-1 px-2 py-1 transition-opacity duration-300 ease-in-out"
          style={{ opacity: 1 }}
        >
          <div
            className="w-3 h-3 rounded-full transition-all duration-200"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[120px] transition-opacity duration-300">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/**
 * Composant principal du camembert des catégories
 */
const StockCategoryChart = ({ categories, className = '' }) => {
  const [viewMode, setViewMode] = useState('value');
  const [isTransitioning, setIsTransitioning] = useState(false);

  /**
   * Gestion de transition
   */
  const handleViewModeChange = (newMode) => {
    if (newMode === viewMode) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setViewMode(newMode);
      setIsTransitioning(false);
    }, 150);
  };

  /**
   * Données du graphique — mise en forme seule, voir `donnees-camembert.js`.
   */
  const parMode = useMemo(() => donneesCamembert(categories), [categories]);
  const chartData = parMode[viewMode] || [];
  const totals = parMode.totals;

  /**
   * Configuration mémorisée
   */
  const chartConfig = useMemo(() => {
    const configs = {
      value: { title: 'Répartition par Valeur de Stock', icon: DollarSign },
      products: { title: 'Répartition par Nombre de Produits', icon: Package },
      margin: { title: 'Répartition par Marge Potentielle', icon: TrendingUp },
    };
    return configs[viewMode] || configs.value;
  }, [viewMode]);

  if (!chartData.length) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 ${className}`}>
        <div className="text-center text-gray-500 dark:text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>Aucune donnée de catégorie disponible</p>
        </div>
      </div>
    );
  }

  const { icon: IconComponent, title } = chartConfig;

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 ${className}`}>
      {/* En-tête avec sélecteur de mode */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2 mb-4 sm:mb-0">
          <IconComponent className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>

        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {['value', 'products', 'margin'].map((mode) => (
            <button
              key={mode}
              onClick={() => handleViewModeChange(mode)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {mode === 'value' ? 'Valeur' : mode === 'products' ? 'Produits' : 'Marge'}
            </button>
          ))}
        </div>
      </div>

      {/* Statistiques rapides */}
      <div
        className={`grid grid-cols-3 gap-4 mb-6 transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}
      >
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totals.totalValue.toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Valeur totale</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {totals.totalProducts.toLocaleString('fr-FR')}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Produits</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {totals.totalMargin.toLocaleString('fr-FR', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Marge potentielle</p>
        </div>
      </div>

      {/* Graphique camembert */}
      <div
        style={{ width: '100%', height: '400px' }}
        className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-30' : 'opacity-100'}`}
      >
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage }) => `${name} (${percentage}%)`}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
              activeIndex={undefined}
              activeShape={null}
              onMouseEnter={undefined}
              onMouseLeave={undefined}
              onClick={undefined}
              animationBegin={0}
              animationDuration={300}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  style={{ cursor: 'default' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} cursor={false} animationDuration={150} />
            <Legend
              content={<CustomLegend viewMode={viewMode} />}
              wrapperStyle={{ transition: 'opacity 300ms ease-in-out' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Note explicative */}
      <div
        className={`mt-4 text-center transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}
      >
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Affichage des {chartData.length} principales catégories racines
          {chartData.length === PARTS_MAXIMUM
            ? ` (limitée à ${PARTS_MAXIMUM} pour la lisibilité)`
            : ''}
        </p>
      </div>
    </div>
  );
};

export default StockCategoryChart;
