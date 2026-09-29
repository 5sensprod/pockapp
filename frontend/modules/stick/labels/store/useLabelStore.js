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
    set((state) => {
      if (Array.isArray(product)) {
        return {
          dataSource: source,
          selectedProducts: product,
          selectedProduct: product.length > 0 ? product[0] : null,
          currentProductIndex: 0, // 🆕 Réinitialiser l'index
        };
      }
      if (product && typeof product === 'object') {
        return {
          dataSource: source,
          selectedProducts: [product],
          selectedProduct: product,
          currentProductIndex: 0, // 🆕 Réinitialiser l'index
        };
      }
      return {
        dataSource: source,
        selectedProducts: [],
        selectedProduct: null,
        currentProductIndex: 0, // 🆕 Réinitialiser l'index
      };
    }),

  setSelectedProducts: (products) =>
    set({
      selectedProducts: Array.isArray(products) ? products : [],
      selectedProduct: Array.isArray(products) && products.length > 0 ? products[0] : null,
      currentProductIndex: 0, // 🆕 Réinitialiser l'index
    }),

  // 🆕 Navigation entre produits
  goToNextProduct: () =>
    set((state) => {
      const products = state.selectedProducts;
      if (!Array.isArray(products) || products.length <= 1) return {};

      const nextIndex = (state.currentProductIndex + 1) % products.length;
      return {
        currentProductIndex: nextIndex,
        selectedProduct: products[nextIndex],
      };
    }),

  goToPreviousProduct: () =>
    set((state) => {
      const products = state.selectedProducts;
      if (!Array.isArray(products) || products.length <= 1) return {};

      const prevIndex = (state.currentProductIndex - 1 + products.length) % products.length;
      return {
        currentProductIndex: prevIndex,
        selectedProduct: products[prevIndex],
      };
    }),

  goToProductIndex: (index) =>
    set((state) => {
      const products = state.selectedProducts;
      if (!Array.isArray(products) || products.length === 0) return {};

      const clampedIndex = Math.max(0, Math.min(index, products.length - 1));
      return {
        currentProductIndex: clampedIndex,
        selectedProduct: products[clampedIndex],
      };
    }),

  startNewDocument: (source = 'blank') =>
    set((state) => {
      state._pushHistory(snapshotOf(state));
      return {
        elements: [],
        selectedId: null,
        extraIds: [],
        cropId: null,
        selectedProducts: [],
        selectedProduct: null,
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
        selectedProducts: [],
        selectedProduct: null,
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
