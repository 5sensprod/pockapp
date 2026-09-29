// src/features/labels/store/useLabelStore.js
import { create } from 'zustand';

const HISTORY_LIMIT = 100;

// 👉 Ce qu'on versionne dans l'historique (léger & suffisant pour Undo/Redo UI)
const snapshotOf = (state) => ({
  elements: state.elements,
  selectedId: state.selectedId,
});

/** La sélection entière, élément principal en tête ; ignore les éléments disparus. */
export const idsSelectionnes = (state) => {
  if (!state.selectedId) return [];
  const existe = new Set(state.elements.map((e) => e.id));
  return [state.selectedId, ...(state.extraIds || [])].filter(
    (id, i, arr) => existe.has(id) && arr.indexOf(id) === i
  );
};

// ── LES PRODUITS AFFICHÉS : DES IDENTIFIANTS, PAS DES COPIES ────────────────
// La source de vérité est `selectedProductIds` (id PocketBase = `_id` de
// `ProduitAffiche`). `produitsParId` n'est qu'un CACHE de la dernière
// projection connue, réécrit par `synchroniserProduits` à chaque relecture
// (`lib/use-synchro-produits-affiche.ts`, invalidée par le temps réel du
// catalogue). `selectedProducts` / `selectedProduct` sont DÉRIVÉS des deux,
// jamais posés directement : ils restent là parce que vingt lecteurs portés
// d'AppPos — et les exports, par `getState()` — les lisent tels quels.
// Voir `PocketStick-docs/02-produits-vivants.md`.

/** Recalcule la forme lue par le canvas à partir des ids et du cache. */
export const deriverProduits = (ids, parId, index) => {
  const selectedProducts = ids.map((id) => parId[id]).filter(Boolean);
  const i = Math.max(0, Math.min(index ?? 0, Math.max(0, ids.length - 1)));
  return {
    selectedProducts,
    selectedProduct: parId[ids[i]] ?? null,
    currentProductIndex: i,
  };
};

/** Pose une sélection à partir d'objets `ProduitAffiche` (sélecteur, template). */
const selectionDepuis = (products) => {
  const liste = (Array.isArray(products) ? products : products ? [products] : []).filter(
    (p) => p && typeof p === 'object' && p._id
  );
  const ids = liste.map((p) => p._id).filter((id, i, arr) => arr.indexOf(id) === i);
  const parId = {};
  for (const p of liste) parId[p._id] = p;
  return {
    selectedProductIds: ids,
    produitsParId: parId,
    produitsDisparus: [],
    ...deriverProduits(ids, parId, 0),
  };
};

const memeProduit = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

const useLabelStore = create((set, get) => ({
  // --- état principal
  elements: [],
  selectedId: null,
  // Sélection MULTIPLE (Maj+clic), comme PocketStick : `selectedId` reste
  // l'élément principal — celui dont la barre montre les options — et
  // `extraIds` les autres. Lire la sélection par `idsSelectionnes`.
  extraIds: [],
  // Image en cours de recadrage (id), comme `cropId` de PocketStick. Changer
  // de sélection termine le recadrage.
  cropId: null,
  dataSource: null,
  selectedProductIds: [],
  produitsParId: {},
  /** Ids que la dernière relecture n'a plus rendus : produits supprimés. Leur
   *  dernière valeur connue reste affichée ; `LabelPage` avertit. */
  produitsDisparus: [],
  // Dérivés — voir `deriverProduits`. Ne jamais les poser à la main.
  selectedProduct: null,
  selectedProducts: [],
  currentProductIndex: 0, // 🆕 Index du produit actuellement affiché
  zoom: 1,
  canvasSize: { width: 800, height: 600 },

  // --- verrou : le canvas suit la taille d'une cellule de planche
  lockCanvasToSheetCell: false,

  // --- réglages de planche (PERSISTENT tant que l'app tourne)
  sheetSettings: {
    selectedSheetId: 'a4-portrait', // 'a4-portrait' | 'a4-landscape'
    rows: 2,
    cols: 2,
    margin: 10, // en pt (affiché en mm si A4)
    spacing: 5, // en pt (affiché en mm si A4)
  },

  // --- méta planche (pour conversions mm & synchronisation UI)
  sheetMeta: {
    id: null,
    widthPt: null,
    heightPt: null,
    rows: null,
    cols: null,
    margin: null,
    spacing: null,
  },
  // taille de cellule en points (utile pour conversion mm)
  cellPt: { width: null, height: null },

  // --- historique
  historyPast: [],
  historyFuture: [],
  canUndo: false,
  canRedo: false,

  // --- helpers historique
  _pushHistory(prev) {
    const past = get().historyPast;
    const nextPast = [...past, prev].slice(-HISTORY_LIMIT);
    set({
      historyPast: nextPast,
      historyFuture: [],
      canUndo: nextPast.length > 0,
      canRedo: false,
    });
  },

  _afterUndoRedo({ elements, selectedId, historyPast, historyFuture }) {
    set({
      elements,
      selectedId,
      historyPast,
      historyFuture,
      canUndo: historyPast.length > 0,
      canRedo: historyFuture.length > 0,
    });
  },

  // --- actions d'historique
  undo() {
    const state = get();
    if (state.historyPast.length === 0) return;

    const prev = state.historyPast[state.historyPast.length - 1];
    const newPast = state.historyPast.slice(0, -1);
    const current = snapshotOf(state);
    const newFuture = [...state.historyFuture, current].slice(-HISTORY_LIMIT);

    state._afterUndoRedo({
      elements: prev.elements,
      selectedId: prev.selectedId,
      historyPast: newPast,
      historyFuture: newFuture,
    });
  },

  redo() {
    const state = get();
    if (state.historyFuture.length === 0) return;

    const next = state.historyFuture[state.historyFuture.length - 1];
    const newFuture = state.historyFuture.slice(0, -1);
    const current = snapshotOf(state);
    const newPast = [...state.historyPast, current].slice(-HISTORY_LIMIT);

    state._afterUndoRedo({
      elements: next.elements,
      selectedId: next.selectedId,
      historyPast: newPast,
      historyFuture: newFuture,
    });
  },

  // --- mutations (poussent dans l'historique)
  addElement: (element) =>
    set((state) => {
      state._pushHistory(snapshotOf(state));

      // 🆕 Générer un ID vraiment unique
      const uniqueId = element.id || `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        elements: [
          ...state.elements,
          {
            ...element,
            id: uniqueId, // 🆕 Utiliser l'ID unique
            visible: true,
            locked: false,
          },
        ],
      };
    }),

  updateElement: (id, updates) =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      return {
        elements: state.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
      };
    }),

  deleteElement: (id) =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      return {
        elements: state.elements.filter((el) => el.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  // Supprime plusieurs éléments en UNE étape d'historique (un seul Ctrl+Z).
  deleteElements: (ids) =>
    set((state) => {
      const retires = new Set(ids);
      if (!state.elements.some((el) => retires.has(el.id))) return {};
      state._pushHistory(snapshotOf(state));
      return {
        elements: state.elements.filter((el) => !retires.has(el.id)),
        selectedId: null,
        extraIds: [],
        cropId: null,
      };
    }),

  // Remplace la sélection (lasso) : le premier devient l'élément principal.
  setSelection: (ids) =>
    set({ selectedId: ids[0] ?? null, extraIds: ids.slice(1), cropId: null }),

  duplicateElement: (id) =>
    set((state) => {
      const element = state.elements.find((el) => el.id === id);
      if (!element) return state;
      state._pushHistory(snapshotOf(state));

      const newElement = {
        ...element,
        id: `el-${Date.now()}`,
        x: (element.x || 0) + 20,
        y: (element.y || 0) + 20,
      };

      return {
        elements: [...state.elements, newElement],
        selectedId: newElement.id,
      };
    }),

  moveElement: (fromIndex, toIndex) =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      const newElements = [...state.elements];
      const [moved] = newElements.splice(fromIndex, 1);
      newElements.splice(toIndex, 0, moved);
      return { elements: newElements };
    }),

  // --- sélection
  selectElement: (id) =>
    set((state) => ({
      selectedId: id,
      extraIds: [],
      cropId: state.cropId === id ? state.cropId : null,
    })),
  // Maj+clic : ajoute l'élément à la sélection, ou l'en retire s'il y est.
  toggleSelection: (id) =>
    set((state) => {
      const ids = idsSelectionnes(state);
      if (!ids.length) return { selectedId: id, extraIds: [], cropId: null };
      if (ids.includes(id)) {
        const reste = ids.filter((x) => x !== id);
        return { selectedId: reste[0] ?? null, extraIds: reste.slice(1), cropId: null };
      }
      return { selectedId: id, extraIds: ids, cropId: null };
    }),
  clearSelection: () => set({ selectedId: null, extraIds: [], cropId: null }),
  startCrop: (id) =>
    set((state) => {
      const el = state.elements.find((e) => e.id === id);
      return el?.type === 'image' && !el.locked ? { selectedId: id, cropId: id } : {};
    }),
  stopCrop: () => set({ cropId: null }),

  // --- data (ne pollue pas l'historique des éléments)
  setDataSource: (source, product = null) =>
    set({ dataSource: source, ...selectionDepuis(product) }),

  setSelectedProducts: (products) => set(selectionDepuis(products)),

  /**
   * Relecture des produits affichés (temps réel, retour sur la page). Remplace
   * la projection des ids encore présents ; les `disparus` gardent leur
   * dernière valeur. Un produit inchangé garde SA référence : le canvas ne
   * rerend pas pour rien, et rien n'est remonté — les clés Konva ne dépendent
   * que de l'élément et de l'index (`KonvaCanvas.jsx`).
   */
  synchroniserProduits: (produits, disparus = []) =>
    set((state) => {
      const ids = state.selectedProductIds;
      const parId = { ...state.produitsParId };
      let change = false;
      for (const p of produits ?? []) {
        if (!p?._id || !ids.includes(p._id)) continue;
        if (!memeProduit(parId[p._id], p)) {
          parId[p._id] = p;
          change = true;
        }
      }
      const perdus = (disparus ?? []).filter((id) => ids.includes(id));
      const disparusChange =
        perdus.length !== state.produitsDisparus.length ||
        perdus.some((id, i) => state.produitsDisparus[i] !== id);
      if (!change && !disparusChange) return {};
      return {
        produitsParId: parId,
        produitsDisparus: perdus,
        ...(change ? deriverProduits(ids, parId, state.currentProductIndex) : {}),
      };
    }),

  /** Retire de la sélection les produits qui n'existent plus. */
  retirerProduitsDisparus: () =>
    set((state) => {
      if (!state.produitsDisparus.length) return {};
      const retires = new Set(state.produitsDisparus);
      const courant = state.selectedProductIds[state.currentProductIndex];
      const ids = state.selectedProductIds.filter((id) => !retires.has(id));
      const parId = {};
      for (const id of ids) if (state.produitsParId[id]) parId[id] = state.produitsParId[id];
      const index = Math.max(0, ids.indexOf(courant));
      return {
        selectedProductIds: ids,
        produitsParId: parId,
        produitsDisparus: [],
        ...deriverProduits(ids, parId, index),
      };
    }),

  // 🆕 Navigation entre produits
  goToNextProduct: () =>
    set((state) => {
      const n = state.selectedProductIds.length;
      if (n <= 1) return {};
      return deriverProduits(
        state.selectedProductIds,
        state.produitsParId,
        (state.currentProductIndex + 1) % n
      );
    }),

  goToPreviousProduct: () =>
    set((state) => {
      const n = state.selectedProductIds.length;
      if (n <= 1) return {};
      return deriverProduits(
        state.selectedProductIds,
        state.produitsParId,
        (state.currentProductIndex - 1 + n) % n
      );
    }),

  goToProductIndex: (index) =>
    set((state) => {
      if (state.selectedProductIds.length === 0) return {};
      return deriverProduits(state.selectedProductIds, state.produitsParId, index);
    }),

  startNewDocument: (source = 'blank') =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      return {
        elements: [],
        selectedId: null,
        extraIds: [],
        cropId: null,
        ...selectionDepuis(null),
        dataSource: source,
        currentTemplateName: 'Nouveau',
        currentTemplateId: null,
        historyPast: [],
        historyFuture: [],
        canUndo: false,
        canRedo: false,
      };
    }),

  currentTemplateName: null,
  currentTemplateId: null, // 💾 ID du template chargé

  setCurrentTemplateName: (name) => set({ currentTemplateName: name }),
  setCurrentTemplateId: (id) => set({ currentTemplateId: id }),

  clearCanvas: () =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      return {
        elements: [],
        selectedId: null,
        extraIds: [],
        cropId: null,
        ...selectionDepuis(null),
      };
    }),

  // 🔄 Réinitialise l'historique (pour chargement de template)
  resetHistory: () =>
    set({
      historyPast: [],
      historyFuture: [],
      canUndo: false,
      canRedo: false,
    }),

  // --- zoom & canvas
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(3, zoom)) }),
  zoomIn: () => set((state) => ({ zoom: Math.min(3, state.zoom + 0.1) })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.1, state.zoom - 0.1) })),
  resetZoom: () => set({ zoom: 1 }),

  // NB: changer la taille du canvas ne touche pas l'historique des éléments
  setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),

  // --- verrou “canvas = taille de cellule”
  setLockCanvasToSheetCell: (lock) => set({ lockCanvasToSheetCell: !!lock }),

  // --- méta planche & taille de cellule (pour unités mm dans les panneaux)
  setSheetMeta: (meta) =>
    set({
      sheetMeta: {
        id: meta?.id ?? null,
        widthPt: meta?.widthPt ?? null,
        heightPt: meta?.heightPt ?? null,
        rows: meta?.rows ?? null,
        cols: meta?.cols ?? null,
        margin: meta?.margin ?? null,
        spacing: meta?.spacing ?? null,
      },
    }),

  setCellPt: (w, h) => set({ cellPt: { width: w ?? null, height: h ?? null } }),

  // --- setters pour sheetSettings (persistants)
  setSheetSettings(partial) {
    const prev = get().sheetSettings;
    set({ sheetSettings: { ...prev, ...(partial || {}) } });
  },
  setSelectedSheetId(id) {
    const prev = get().sheetSettings;
    set({ sheetSettings: { ...prev, selectedSheetId: id } });
  },
}));

export default useLabelStore;
