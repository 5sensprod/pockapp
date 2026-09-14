# Portage des « Rapports » d'AppPos vers PocketApp

*14 septembre 2026.*

Les rapports de stock d'AppPos (`AppTools`, route `/rapports`) sont repris dans
PocketApp, module `stats` (**PocketStats**), sur **`/stats/rapports`**.

Le portage a été fait **à l'identique pour l'affichage** : les composants
arrivent tels quels, en `.jsx`, sans conversion TypeScript ni redécoupage. Ce
document dit ce qui a changé, et ce qui reste à nettoyer. C'est le pendant de
[`01-portage-affiche.md`](../../../stick/PocketStick-docs/01-portage-affiche.md)
pour PocketStick.

## Ce que le portage n'était pas

**La mission annonçait ~1900 lignes de React. La moitié du composant n'était pas
du React.** `ReportsPage.jsx` n'appelle jamais `services/reportsService.js` —
celui-ci n'a aucun appelant sur cette page. Elle repose sur deux hooks absents
de la liste, et ces deux hooks appellent AppServe :

| Hook d'AppPos | Route AppServe | Ce qui la sert |
|---|---|---|
| `hooks/useStockStatistics.js` | `GET /api/products/stock/statistics` | `services/stockStatisticsService.js`, 204 l. |
| `hooks/useAdvancedPDFExport.js` | `POST /api/products/stock/statistics/export-pdf` | `controllers/product/productStockController.js` (365 l.) + PDFKit (`utils/pdf/PDFContentRenderer.js` 902 l., `templates/pdf/stockReportTemplate.js` 253 l.) |

Soit ~1 800 lignes de Node à reprendre **en plus** du React. Contrairement à
PocketStick, qui était du code purement client, ce portage a donc écrit du Go.

## Les trois décisions

Prises avec le propriétaire avant d'écrire.

1. **Le module d'accueil : `stats`.** Il porte déjà le journal des ventes et
   celui des espèces ; les rapports de stock y sont un troisième onglet.
2. **Le calcul est en Go.** Le code d'origine balayait les 2999 produits et les
   463 catégories **dans le navigateur, à chaque montage d'écran**, pour
   remonter l'arbre et sommer. C'est exactement ce que `/api/catalog/counts` a
   supprimé en août. Deux routes neuves.
3. **Le PDF se fabrique sur le poste**, avec `@react-pdf/renderer` — l'outil du
   rapport Z, des factures et des devis. Les 1 155 lignes de PDFKit n'ont pas
   été retraduites ; aucune route Go du dépôt ne produit de PDF hors du ticket
   de caisse (`backend/pos/receipt_pdf.go`).

## ⚠️ La TVA de ce rapport n'est pas une TVA fiscale

`TaxBreakdown.jsx` ventile la TVA que le stock **porterait** s'il était vendu
entièrement au prix affiché. Elle n'a **rien à voir** avec la TVA collectée, qui
vit dans le rapport Z et n'a qu'un seul chemin d'agrégation
(`backend/reports/`). Les deux ne s'additionnent jamais, et ce nombre-ci ne se
rapproche d'aucune déclaration. L'écran le dit, le PDF le dit en pied de page,
et l'en-tête de `stock_statistics_routes.go` le dit au prochain lecteur.

La règle du dépôt a néanmoins été suivie à la lettre, parce que **ce PDF part
chez le comptable** : rien n'est additionné côté React, pas même un sous-total
de catégorie.

## Les deux routes Go

### `GET /api/reports/stock-statistics`

`backend/routes/stock_statistics_routes.go`. Deux requêtes SQLite, un balayage
en mémoire, et une réponse **dans la forme exacte d'AppPos** (`summary`,
`financial`, `performance`) pour que les composants portés l'affichent sans
adaptateur. Deux clés s'y ajoutent :

- `categories` — les catégories **racines** valorisées, déjà triées : ce que le
  camembert dessine ;
- `par_categorie` — le nombre de fiches **valorisées** par catégorie, `direct`
  et `total`, calculé par `compterDansCategories`, la fonction de
  `/api/catalog/counts`. C'est l'arbre de la modale d'export.

**Pourquoi pas `/api/catalog/counts` directement :** cette route-là compte le
catalogue ENTIER. L'arbre de l'export ne montre que les catégories qui ont du
stock à valoriser. Les deux nombres sont légitimes et différents ; les confondre
afficherait « 412 produits » sur une branche qui n'en valorise que 9.

### `GET /api/reports/stock-statistics/products`

`backend/routes/stock_statistics_detail_routes.go`. Les lignes du rapport
détaillé, **déjà filtrées, triées, groupées et sous-totalisées**. Le tri
(`name`/`sku`/`stock`/`value`), la sélection de catégories, l'inclusion des non
classés et le mode simplifié sont des paramètres de requête.

Un sous-total par catégorie est une agrégation. Le laisser au navigateur ferait
exister deux additions des mêmes fiches — celle de l'écran, celle du PDF — ce
qui est la forme exacte de la régression du 20 mai 2026. En mode simplifié,
c'est le **serveur** qui retire les lignes : rien ne sert de transporter 2999
fiches qu'aucune page n'imprimera.

Les deux routes partagent `prixVenteHT`, `estProduitSimple` et le filtre
stock/prix : un écart entre la synthèse et le détail serait un écart entre deux
pages du même PDF. Un test le vérifie
(`TestDetailStockConcordeAvecLaSynthese`).

## Un écart assumé avec AppPos : le prix de vente HT

NeDB portait `regular_price`, un prix de vente **HT natif**, que
`stockStatisticsService.js` préférait quand il était renseigné. **Le schéma
PocketBase ne l'a pas** (`price_ht` a disparu du catalogue, cf. `CLAUDE.md`).

Ici, le HT se déduit **toujours** de `price_ttc` et de `tax_rate`. Sur une fiche
dont les deux prix étaient cohérents, le résultat est identique ; sur une fiche
où ils divergeaient, ce nombre-ci est celui qui correspond au prix réellement
pratiqué en caisse. Un rapport produit ici et un rapport produit dans AppPos
peuvent donc différer de quelques euros, et c'est la version PocketApp qui a
raison.

## Les attaches qui ont dû changer

| Attache d'origine | Ce qui a été fait |
|---|---|
| `useStockStatistics` (REST AppServe + WebSocket) | `lib/use-statistiques-stock.ts` — TanStack Query sur la route Go, `staleTime` de 5 min. La fraîcheur vient du **temps réel PocketBase** : `stock-statistics` est ajoutée à `invalidateCatalog` ET à `COLLECTIONS_SURVEILLEES` (`products` et `categories`) |
| `useAdvancedPDFExport` (PDF rendu par le serveur) | `lib/use-export-pdf.tsx` + `pdf/StockReportPDF.tsx` — `@react-pdf/renderer`, comme le Z |
| `useReportsStore` (zustand : 2999 produits, 463 catégories, remontée d'arbre, sommes) | **Supprimé.** Le calcul est en Go. Ne reste que `lib/donnees-camembert.js`, repris de `calculateAllChartData` : pourcentages, libellés, douze plus grosses parts — **de la mise en forme, pas de l'agrégation** |
| `useCategoryTree` (comptage du stock par catégorie dans le navigateur) | `lib/use-arbre-categories.ts` + `lib/arbre-export.ts`, sur `par_categorie` |
| SIRET et adresse **écrits en dur** dans `ExportModal.jsx` | L'**entreprise active**, lue en base (`useCompany`). Le dépôt est multi-entreprises, et un SIRET en dur sur un document comptable est un faux en puissance |
| L'indicateur « Temps réel » du canal AppPos | Retiré : le temps réel PocketBase est monté ailleurs (`frontend/lib/realtime/`), sans état à afficher ici |

Un point mérite d'être nommé, comme `produit-adapte.ts` l'était pour l'affiche :
**les nœuds de l'arbre portent `_id`, pas `id`**. `CategoryTreeNode.jsx` et
`CategoryTreeSelector.jsx` lisent la forme NeDB ; plutôt que de les réécrire,
une catégorie PocketBase y est **projetée**, en un seul endroit
(`construireArbreExport`).

## Dépendance ajoutée

`recharts` (3.10.1), pour le camembert. C'est la seule.

## Où intervenir — carte pour un agent qui reprend

Tout vit sous `frontend/modules/stats/reports/`. La page est `/stats/rapports`
(`frontend/routes/stats/rapports.tsx` → `ReportsPage.jsx`).

| Pour toucher à… | Le fichier |
|---|---|
| Les quatre cartes du haut | `components/StockMetrics.jsx` |
| Le camembert | `components/StockCategoryChart.jsx`, et `lib/donnees-camembert.js` pour ce qu'il reçoit |
| La ventilation par taux | `components/TaxBreakdown.jsx` |
| La synthèse du bas | `components/ReportSummary.jsx` |
| Les options d'export | `components/export/` et `hooks/useExportOptions.js` |
| La mise en page du PDF | `pdf/StockReportPDF.tsx` |
| **Un nombre qui s'affiche** | `backend/routes/stock_statistics_routes.go` ou `…_detail_routes.go` — **jamais un composant** |

**Deux pièges déjà payés :**

- **Un fichier de `lib/` qui importe `lib/queries/…` n'est plus testable.**
  `categories.ts` construit un client PocketBase au chargement du module, donc
  lit `window`, et la suite échoue à la collecte. D'où `arbre-export.ts`, qui
  ne dépend de rien — même parade que `frontend/lib/realtime/catalog-realtime.ts`.
- **`donnees-camembert.js` n'est pas typé**, et TypeScript infère ses tableaux
  en `never[]` : un appelant typé ne compile pas. D'où le `.d.ts` à côté, comme
  pour `frontend/wailsjs`. `npx tsc --noEmit` ne l'aurait pas vu ; `pnpm
  build:client`, si.

## Gardiens

| Fichier | Ce qu'il tient |
|---|---|
| `backend/routes/stock_statistics_test.go` | La valorisation HT, les exclusions, le taux zéro, la remontée à la racine, le tri des parts, **le cycle de catégories**, et l'arrondi posé en sortie une seule fois |
| `backend/routes/stock_statistics_detail_test.go` | Le détail **concorde avec la synthèse**, les sous-totaux font le total, la sélection, le mode simplifié, les quatre tris, la désignation imprimée |
| `frontend/modules/stats/reports/lib/rapports-stock.test.ts` | Le camembert **reprend** les totaux du serveur sans les recalculer ; l'arbre reprend les décomptes ; aucun fichier du module n'importe `@/lib/apppos` ni ne rappelle une route AppServe |
| `frontend/lib/realtime/catalog-realtime.test.ts` (existant) | Que `stock-statistics` soit périmée des **deux** côtés — mutation locale et temps réel |

## À nettoyer, plus tard

Rien de ce qui suit n'est urgent ; tout est une dette prise sciemment le jour du
portage.

1. **Convertir les `.jsx` en TypeScript** et retirer la projection `_id` de
   `arbre-export.ts` : les composants liraient alors `CatalogCategoryShape`
   directement. `donnees-camembert.js` et son `.d.ts` fusionneraient en un seul
   `.ts`.
2. **`StockCategoryChart.jsx` (300 l.) garde des restes du store** : le
   `isTransitioning` et son `setTimeout` de 150 ms servaient à masquer un
   recalcul qui n'existe plus.
3. **`DetailedReportOptions.jsx` déclare encore `onCategoryTreeLoad`**, que plus
   personne ne passe — l'arbre se charge seul. Inoffensif, mais mort.
4. **`useExportOptions.js` expose six fonctions dont trois n'ont aucun
   appelant** (`updateOptions`, `toggleOption`, `setSimplified`) : c'était déjà
   vrai dans AppPos.
5. **L'expansion de l'arbre ne marche qu'à un niveau** : `CategoryTreeSelector`
   passe `isExpanded` de la racine à toute la descendance. Défaut d'origine,
   conservé tel quel pour que le diff avec AppPos reste lisible.
6. **Le code porté n'a pas été formaté** par Biome, volontairement, pour la même
   raison. Formater uniquement ses propres fichiers — `pnpm format` réécrirait
   tout le dépôt.
7. **`services/reportsService.js` n'a pas été porté**, et c'est délibéré : il
   n'a aucun appelant dans AppPos, et les rapports qu'il lirait
   (`/api/reports/history`) n'existent pas ici. Le jour où l'on voudra un
   historique des rapports de stock, c'est une collection PocketBase, pas ce
   fichier.
