# 02 — Les produits du canvas suivent la base

29 septembre 2026.

## Le problème

Le produit choisi était **copié** dans `useLabelStore` (`selectedProduct`,
`selectedProducts`). Le canvas, le panneau Propriétés et les exports
(`exportPdfSheet.js`, par `getState()`) lisaient cette copie. Le temps réel du
catalogue invalidait bien les requêtes, mais la copie ne bougeait pas : un prix
modifié en caisse restait l'ancien sur l'affiche.

## La règle

- **Le store ne tient que des ids** : `selectedProductIds` fait foi.
  `produitsParId` est le cache de la dernière projection ; `selectedProducts`,
  `selectedProduct` et `currentProductIndex` en sont **dérivés**
  (`deriverProduits`). Ils restent dans le store parce qu'une vingtaine de
  lecteurs portés d'AppPos les lisent tels quels. Ne jamais les poser à la main.
- **`useSynchroProduitsAffiche`** (monté dans `LabelPage.jsx`) relit ces ids en
  **une** requête `id = … || id = …` (`lib/produits-par-ids.ts`), projette avec
  `versProduitAffiche` et le contexte **vivant** (`useContexteAffiche` :
  marques, fournisseurs, jour du serveur), puis appelle `synchroniserProduits`.
- **Rien de neuf n'est écouté.** La clé commence par `catalog-products`, que
  `COLLECTIONS_SURVEILLEES.products` et `invalidateCatalog` périment déjà ;
  `brands` et `suppliers` périment le contexte. `staleTime: 0` : en revenant
  sur `/stick`, la relecture repart toujours.
- **Relecture au retour du focus de la fenêtre** (événement `focus` de
  `window`, dans le même hook). TanStack ne relit qu'au changement de
  VISIBILITÉ ; sous Wails, repasser la fenêtre devant le navigateur ne la rend
  pas « visible » à nouveau — il fallait la réduire puis l'agrandir (constaté
  par le propriétaire le 29 septembre 2026, produit modifié dans
  `/stock/produits` au navigateur). Non tranché : si le temps réel arrive
  quand la fenêtre Wails est cachée ; s'il manque avec les deux fenêtres
  visibles côte à côte, c'est l'abonnement qu'il faudra regarder.
- **`requestKey: null`** sur la lecture : sans lui, le SDK annule la requête
  quand une autre lecture de `products` part en même temps — ce que provoque
  justement une invalidation du temps réel.
- **Aucun remontage** : un produit inchangé garde sa référence, et les clés
  Konva ne dépendent que de l'élément et de l'index. Sélection, Transformer et
  recadrage (`cropId`) ne sont pas touchés : la synchro n'écrit ni `elements`,
  ni `selectedId`, ni `cropId`, ni l'historique.

## Cas décidés avec le propriétaire

- **Produit supprimé** : gardé avec sa dernière valeur, bandeau dans
  `LabelPage` et bouton « Les retirer » (`retirerProduitsDisparus`). Une erreur
  de requête ne conclut rien.
- **Produit dépublié** : rien à signaler — un brouillon reste vendable.
- **Correction manuelle** (`textOverrides`) : l'emporte toujours. Depuis cette
  date, `TextNode` mémorise le texte de la fiche au moment de la correction
  (`textOverridesSource`) ; si la fiche change ensuite, le panneau Propriétés
  affiche « Fiche modifiée : … » (`ficheChangeeDepuisCorrection`). Les
  corrections antérieures, sans mémo, ne signalent rien.

## Templates

Lu dans le code : ils n'enregistrent **aucune** donnée produit
(`TemplateManager.jsx`, `handleSaveTemplate` ; `LabelPage.jsx`,
`handleSaveTemplate`) — seulement les éléments, dont les `textOverrides` par
id. Les produits d'un template de planche viennent du sélecteur, puis passent
par `setSelectedProducts`, donc par les ids. Rien à migrer.

Gardien : `labels/store/produits-vivants.test.ts`.
