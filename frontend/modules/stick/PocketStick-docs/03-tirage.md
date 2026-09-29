# 03 — Le tirage : vignette seule et planche, un seul parcours

29 septembre 2026.

## Le problème

On choisissait au départ entre une étiquette vierge et une source « data »
(`DataSourceSelector`), puis des produits ; la planche était un mode à part, et
un template de planche exigeait une sélection de produits
(`requiresProductSelection`, `getMaxProducts`). L'export en planche ne
connaissait qu'une page — les produits au-delà de `rows × cols` étaient perdus
sans erreur —, et un produit ne pouvait se répéter que s'il était seul.

## La règle

**Le canvas est le modèle, le tirage dit qui l'imprime et combien de fois.**
Les pages en DÉCOULENT : elles ne se créent ni ne s'éditent jamais à la main.

- **Tirage** = `selectedProductIds` (sans doublon, c'est lui que relit la
  synchro de `02-produits-vivants.md`) + `quantites` (`{ id: n }`, clé absente
  = 1) + `quantiteSansProduit` (le tirage sans produit est une seule ligne
  « Sans produit × N »). Quantités bornées à 1–999 (`quantiteValide`).
- **Format** = `formatTirage` : `'page'` (une affiche par page, au format du
  canvas) ou `'planche'` (grille de `sheetSettings`). Choisi par le vendeur,
  jamais basculé seul : ajouter un produit ne change pas le format.
- **Calcul unique** dans `labels/lib/tirage.js` : `casesDuTirage` déplie
  (A ×3, B ×2 → A, A, A, B, B) et `pagination` découpe en pages, la dernière
  complétée de cases libres, jamais zéro page. L'export ET la bande d'aperçu
  le lisent — ne pas recalculer ailleurs.
- **`dataSource` est dérivé** (`sourceDerivee`) : `'data'` dès qu'un produit
  est au tirage, `'blank'` sinon. Gardé parce que les panneaux portés d'AppPos
  le lisent. `setDataSource` ignore son premier argument. Ne jamais le poser.
- **`currentProductIndex`** : la ligne pointée du tirage, celle que montre le
  canvas (point bleu de la liste, case bleue de la bande).
- **Le tirage n'entre pas dans un template.** Charger un template ou un design
  ne le touche pas : `clearCanvas` ne vide plus que le dessin. Le `dataSource`
  enregistré est ignoré au chargement, et réécrit dérivé à l'enregistrement.
  Aucune migration des templates IndexedDB.

## Où c'est dans l'écran

- **Onglet « Produits »** (icône paquet, en tête de la barre latérale ;
  `SheetPanel.jsx` → `TiragePanel.jsx`) : la liste
  (− n +, ✕, clic = afficher), « Ajouter des produits » (ajoute, ne remplace
  pas ; un produit déjà là gagne un exemplaire), le format, le compteur. Les
  réglages de grille ne s'affichent qu'en format planche.
- Il n'y a PAS d'entrée séparée pour ajouter un produit : une première version
  (action « Produit » qui ouvrait le sélecteur) doublonnait l'onglet et a été
  fondue dedans le même jour.
- **Bande d'aperçu** sous le canvas (`BandeTirage.jsx`) : une vignette par
  page, cases SCHÉMATIQUES (nom du produit, pleine ou libre), pas un rendu
  Konva — un rendu par case à chaque retouche serait trop lent sur une planche
  de 24. Masquée pour une affiche seule. Au-delà de 12 cases par page, les noms
  ne sont plus qu'au survol.
- **« Nouveau »** avec des produits au tirage : question « Garder / Vider /
  Annuler » (`LabelPage.jsx`, `startNewDocument({ garderProduits })`).

## Export

Un seul chemin : `utils/exportTirage.js`, lu dans le store au clic, appelé
par « Exporter » de la barre ET par le bouton de l'onglet Produits.

- **Une seule case, celle du canvas** : `exportPdf`, qui clone le canvas — le
  rendu le plus fidèle, inchangé.
- **Sinon** : `exportPdfSheet` avec `cases`, qui **pagine** (`addPage`). En
  format page, planche 1×1 au format du canvas, sans marge ni pointillé
  (`cadresCases: false`). Une case identique n'est dessinée qu'une fois (cache
  par produit). L'ancien contrat (`products`, ou produit affiché dans toutes
  les cases) est traduit en cases.

⚠️ Hors du cas « une seule case », l'image vient de `createDocumentImage`, qui
redessine les éléments au lieu de cloner le canvas : un type ou un réglage
ajouté au canvas doit l'être aussi là, comme c'était déjà le cas pour la
planche.

## Ce qui a été retiré

`DataSourceSelector.jsx`, `showDataSourceSelector`, `handleDataSourceSelect`,
`multiSelectProducts` ; `requiresProductSelection`, `getMaxProducts`, leur
badge et le sélecteur imposé au chargement d'un template ; les flèches
précédent / suivant de `TopToolbar` (remplacées par la liste) ;
`handleAdaptGrid`, sans appelant. Le message du panneau code-barres renvoie à
l'onglet Produits ; le panneau Tableau propose les styles statiques même avec un produit.

## Gardiens

`labels/lib/tirage.test.js` (dépliage, bornes, pagination),
`labels/store/tirage-store.test.js` (ajout cumulatif, quantités, retrait,
`dataSource` dérivé, tirage qui survit au chargement d'un template et au choix
de « Nouveau »), `labels/utils/exportTirage.test.js` (aiguillage de l'export,
exports simulés).
