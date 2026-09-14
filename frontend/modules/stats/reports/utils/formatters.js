// src/utils/formatters.js

/**
 * Formate un montant en devise EUR
 * @param {number} amount - Montant à formater
 * @returns {string} Montant formaté (ex: "1 234,56 €")
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

/**
 * Formate un nombre avec séparateurs de milliers
 * @param {number} num - Nombre à formater
 * @returns {string} Nombre formaté (ex: "1 234")
 */
export const formatNumber = (num) => {
  return new Intl.NumberFormat('fr-FR').format(num);
};

/**
 * Formate un pourcentage
 * @param {number} num - Nombre à formater (ex: 15.5 pour 15.5%)
 * @returns {string} Pourcentage formaté (ex: "15,5 %")
 */
export const formatPercentage = (num) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(num / 100);
};

/**
 * Retourne le libellé du taux de TVA
 * @param {number} rate - Taux de TVA
 * @returns {string} Libellé formaté
 */
export const getTaxRateLabel = (rate) => {
  if (rate === 0) return 'Occasion (0%)';
  if (rate === 5.5) return 'Réduit (5.5%)';
  if (rate === 20) return 'Normal (20%)';
  return `${rate}%`;
};
