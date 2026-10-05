// frontend/modules/stick/labels/utils/ouvrirModele.js
//
// OUVRIR UN MODÈLE : UNE règle, pour « Mes modèles » (`TemplateManager`) et
// « Modèles prêts » (`DesignTemplates`). Elle était écrite deux fois, et la
// seconde copie n'avait ni confirmation, ni remise à zéro de l'historique, ni
// nom de modèle courant.
//
// Sans React ni Konva : le store et la question sont passés en paramètres
// (testé contre le vrai store, `ouvrirModele.test.js`). Les toasts restent
// aux composants.

export const CONFIRMATION_OUVERTURE = {
  title: 'Ouvrir ce modèle ?',
  message: 'L’affiche en cours sera remplacée.',
  confirmText: 'Ouvrir',
  cancelText: 'Annuler',
  variant: 'primary',
};

/** Les données d'un modèle : dans `preset_data` pour un modèle d'usine. */
export const donneesModele = (modele) => modele?.preset_data || modele;

/**
 * Le nom et l'identifiant « courants » que pose un modèle ouvert.
 *
 * ⚠️ UN MODÈLE D'USINE NE DONNE PAS SON IDENTIFIANT. « Enregistrer »
 * (`LabelPage.handleSaveTemplate`) écrit sur `currentTemplateId` par
 * `templateService.updateTemplate`, qui réenregistre sous le même `id` un
 * objet SANS `is_factory` : le modèle d'usine serait écrasé et quitterait
 * « Modèles prêts ». Avec `null`, « Enregistrer » ouvre la fenêtre
 * « Enregistrer le modèle » : une copie, sur le poste.
 */
export const identiteModele = (modele) => ({
  nom: modele?.name || 'Modèle sans nom',
  id: modele?.is_factory === true ? null : modele?.id || null,
});

const pause = () => new Promise((resolve) => setTimeout(resolve, 100));

/**
 * Remplace la page par le modèle. Le tirage n'est pas touché (un modèle n'est
 * pas un tirage), ni `dataSource`, qui en découle.
 *
 * @param {object} modele
 * @param {object} store `useLabelStore.getState()`
 * @param {object} [options]
 * @param {Function} [options.attendre] la pause entre vider et remplir (tests)
 */
export const appliquerModele = async (modele, store, { attendre = pause } = {}) => {
  const donnees = donneesModele(modele);
  // Avant de vider : un modèle illisible ne coûte pas l'affiche en cours
  if (!donnees?.canvasSize) throw new Error('Structure de modèle invalide : canvasSize manquant');

  store.clearCanvas();
  // Comme avant : laisse le canvas démonter ses nœuds avant d'en recevoir
  await attendre();

  const { nom, id } = identiteModele(modele);
  store.setCurrentTemplateName(nom);
  store.setCurrentTemplateId(id);

  store.setCanvasSize(donnees.canvasSize.width, donnees.canvasSize.height);
  if (donnees.sheetSettings) store.setSheetSettings(donnees.sheetSettings);
  if (donnees.lockCanvasToSheetCell !== undefined) store.setLockCanvasToSheetCell(donnees.lockCanvasToSheetCell);

  for (const el of donnees.elements || []) store.addElement(el);

  // Ouvrir un modèle n'est pas une modification : rien à annuler
  store.resetHistory();
};

/**
 * Demande confirmation si la page porte quelque chose, puis applique.
 *
 * @param {object} modele
 * @param {object} contexte
 * @param {object} contexte.store `useLabelStore.getState()`, lu à l'appel
 * @param {Function} [contexte.confirm] `useConfirmModal().confirm`
 * @param {Function} [contexte.attendre]
 * @returns {Promise<boolean>} faux si l'ouverture a été annulée
 */
export const ouvrirModele = async (modele, { store, confirm, attendre } = {}) => {
  if (store.elements.length > 0 && confirm) {
    const ok = await confirm(CONFIRMATION_OUVERTURE);
    if (!ok) return false;
  }
  await appliquerModele(modele, store, { attendre });
  return true;
};
