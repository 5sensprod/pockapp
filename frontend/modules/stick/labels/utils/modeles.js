// frontend/modules/stick/labels/utils/modeles.js
//
// LE FILTRE DES MODÈLES, écrit deux fois : dans `TemplateManager` (catégorie
// et recherche) et dans `DesignTemplates` (catégorie seule, lue dans
// `metadata`). Même règle qu'avant, mot pour mot.

/**
 * @param {Array} modeles
 * @param {object} filtre
 * @param {string} [filtre.terme] cherché dans le nom, la description, les étiquettes
 * @param {string} [filtre.categorie] `'all'` : toutes
 * @param {Function} [filtre.categorieDe] où lire la catégorie d'un modèle
 */
export const filtrerModeles = (modeles, { terme = '', categorie = 'all', categorieDe = (m) => m.category } = {}) => {
  const cherche = terme.toLowerCase();
  return (modeles ?? []).filter((m) => {
    if (categorie !== 'all' && categorieDe(m) !== categorie) return false;
    if (!cherche) return true;
    return Boolean(
      m.name?.toLowerCase().includes(cherche) ||
        m.description?.toLowerCase().includes(cherche) ||
        m.tags?.some((tag) => tag.toLowerCase().includes(cherche))
    );
  });
};

/** La catégorie d'un design d'usine : dans ses `metadata`. */
export const categorieUsine = (m) => (m.metadata || {}).category;
