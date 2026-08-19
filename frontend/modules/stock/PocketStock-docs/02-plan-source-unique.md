# Plan — PocketBase source unique pour tous les consommateurs du catalogue

**Écrit le 18 août 2026**, après l'étape 3. Cinq fronts demandés par le
propriétaire, mesurés avant d'être planifiés. Tout ce qui est chiffré ici est
**lu dans le code ou dans la base** ; les chemins sont donnés.

---

## 0. La mesure qui change une prémisse : les images sont DÉJÀ importées

La demande était : « lors de l'import des produits, récupérer les images depuis
le répertoire AppPOS, puis les importer dans PocketBase ». **C'est fait, et
depuis le 11 août 2026.**

- `backend/catalog/load/loader.go:46-137` copie les fichiers depuis
  `%APPDATA%\AppPOS\data\public\…` dans le stockage PocketBase, avec un repli
  par nom de fichier quand le chemin ne résout pas ;
- `loader.go:490-491` pose **l'image principale ET la galerie** :
  `r.Set("image", …)` et `r.Set("gallery", fl.uploadAll(r, p.GallerySrc))` ;
- le schéma les porte en champs FICHIER, pas en texte —
  `backend/migrations/catalog_v2.go:668-677`, `image` (1 fichier) et `gallery`
  (plusieurs), la révision du 11 août expliquant pourquoi le texte a été écarté.

**Mesuré dans `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en lecture seule :**

| Mesure | Valeur |
|---|---|
| produits | 2999 |
| avec une image principale | **2639** (88 %) |
| avec une galerie non vide | **747** (25 %) |
| avec `legacy_id` renseigné | **2999** (100 %) |
| stockage `pb_data/storage` | **1,7 Go** |

PocketBase sert donc déjà ces images, par `pb.files.getUrl` — comme le font
déjà `profile.ts:116`, `companies.ts:231` et `CompanyDialog.tsx:179`.

**Ce qui reste, et c'est tout autre chose que ce qui était demandé :** un seul
fichier du front lit encore les images par AppPos — `ProductTable.tsx:49-54`,
`APPPOS_ASSETS_BASE_URL`. Et il ne peut pas faire autrement **aujourd'hui**,
parce que les produits qu'il affiche viennent d'AppPos : leur identifiant ne
désigne rien dans PocketBase. **L'image suit le produit, elle ne se bascule pas
séparément.** Le front « images » n'est donc pas un front : c'est une
conséquence du front n° 1.

**Un écart à instruire, pas à ignorer :** `catalog_v2.go:672-677` annonce
« 1339 produits (58 %) portent une galerie » ; la base en compte **747**. Deux
explications possibles — la galerie exclut l'image principale
(`normalize/catalog.go:598-607`, donc un produit à une seule image sort avec une
galerie vide), ou une perte au chargement. **À trancher avant de déclarer les
images terminées**, par un comptage côté NeDB.

## 1. Le front qui commande les autres : `/stock/produits` prend l'UI d'AppStock

C'est la demande « à terme, l'UI stock-apppos doit être utilisée pour
/stock/produits ». Elle est première parce que **tout le reste en dépend** : tant
que les produits affichés viennent d'AppPos, ni les images, ni les filtres, ni
la sélection dans un devis ne peuvent venir de PocketBase.

Ce qui existe de chaque côté, mesuré :

| | `/stock-apppos` (UI riche) | `/stock/produits` (PocketBase) |
|---|---|---|
| source | `useStockModule` → AppPos | `useCatalogProducts` (`catalog-products.ts:93`) |
| pagination | mémoire, `getPaginationRowModel` | **serveur**, page paramétrée, total rendu |
| panneaux de filtre | catégories, marques, fournisseurs AppPos | recherche + filtres serveur |
| écriture | aucune (étape 3) | `useCreateCatalogProduct` / `useUpdateCatalogProduct` |
| images | `APPPOS_ASSETS_BASE_URL` | `pb.files.getUrl` — **déjà disponibles** |

**Le piège, déjà payé une fois :** les panneaux de filtre comparent
`p.brand`/`p.categories` à l'`.id` de la sélection. Basculer la table sans
basculer les panneaux dans le même mouvement rend **zéro produit, sans erreur**.
Les deux moitiés se basculent ensemble ou pas du tout.

**Ce que ça donne comme travail :** `StockView` + `ProductTable` reçoivent leurs
lignes de `useCatalogProducts` au lieu de `useStockModule`, la pagination passe
au serveur, `getImageUrl` devient `pb.files.getUrl`, les trois panneaux passent
sur `useBrands`/`useCategories`/`useSuppliers` — qui existent et sont branchés
depuis le 13 août. **`/stock-apppos` disparaît alors**, avec `useStockModule`,
`StockPageAppPos`, `BrandFilterPanel`, `CategoryTreeAppPos`,
`SupplierListAppPos` : le module rétrécit encore de cinq fichiers.

## 2. La couche CRUD unique — ce qu'elle doit couvrir, mesuré

**Les consommateurs du catalogue** — `grep` de `@/lib/apppos` sur `frontend/`,
23 fichiers, dont 14 lisent ou écrivent des produits :

| Consommateur | Fichier | Ce qu'il fait aujourd'hui |
|---|---|---|
| Caisse — lecture | `modules/cash/CashTerminalPage.tsx:124` | `useAppPosProducts` |
| Caisse — création | `modules/cash/CreateProductDialog.tsx:22` | `useCreateAppPosProduct` → **crée dans NeDB** |
| Caisse — vente | `lib/apppos/stock-utils.ts:124,178` | `decrementAppPosProductsStock` |
| Factures | `lib/queries/invoices.ts:6` | `decrementStockFromItems` → AppPos |
| Devis | `lib/queries/quotes.ts:4` | idem |
| Facture, paiement | `modules/connect/components/InvoicePaymentDialog.tsx:20` | idem |
| Factures, liste | `modules/connect/pages/invoices/InvoicesPage.tsx:41` | idem |
| Choix produit — facture | `pages/invoices/InvoiceCreatePage.tsx:35` | `useAppPosProducts` |
| Choix produit — devis | `pages/quotes/QuoteCreatePage.tsx:35` | `useAppPosProducts` |
| Choix produit — commande | `pages/orders/OrderCreatePage.tsx:15` | `useAppPosProducts` |
| Choix produit — commande en ligne | `features/orders/OrderCreateInline.tsx:19` | `useAppPosProducts` |
| Reclassement de stock | `modules/common/StockReclassificationDialog.tsx:32` | `incrementAppPosProductsStock` |
| Inventaire — lecture | `modules/stock/InventoryPageAppPos.tsx:166,312` | `appPosApi.getProducts()` **en direct** |
| Inventaire — écriture | `lib/inventory/useInventorySession.ts:235` | `updateAppPosProductStock` |

**Deux besoins, et deux seulement, se répètent partout :**

1. **lire le catalogue** pour choisir un produit — sept écrans, tous avec le
   même préambule `getAppPosToken` / `loginToAppPos` / `useAppPosProducts` ;
2. **bouger un stock** — vente, retour, inventaire, reclassement.

D'où la forme de la couche, et elle tient en deux surfaces :

```
useCatalogProducts(query)        lecture, paginée serveur — EXISTE DÉJÀ
useCatalogProductSearch(terme)   à écrire : le choix produit d'un devis n'est
                                 pas une page de table, c'est une recherche
adjustStock(mouvements, motif)   à écrire : UN chemin pour les quatre motifs
                                 (vente, retour, inventaire, reclassement)
```

**`adjustStock` est la pièce maîtresse, et la plus délicate** : c'est elle qui
porte le maillon le moins négociable. Elle doit écrire dans **une seule** base —
pas les deux (décision du 13 août) — et le jour où elle bascule, les ventes
cessent de décrémenter NeDB. Ce jour-là AppPos affiche des stocks faux.

## 3. Le point dur, inchangé et maintenant chiffrable

Le §6 du rituel le nommait ; il est toujours entier :

- **la caisse crée ses produits dans NeDB** (`CreateProductDialog.tsx:22`), donc
  PocketBase est en retard par construction ;
- **`catalog-import -load` purge**, donc toute saisie PocketBase est provisoire.

**Ces deux-là se ferment ensemble, et dans cet ordre :** d'abord la caisse crée
dans PocketBase, ensuite le rechargement par purge s'arrête. L'inverse perd des
produits nés en caisse. `legacy_id` est renseigné sur **2999 / 2999** produits,
donc le pont existe pour reprendre ce qui aurait divergé.

## 4. L'ordre proposé

| # | Front | Pourquoi là | Risque |
|---|---|---|---|
| A | ~~Comptage des galeries~~ | **fait le 18 août 2026** — attendu réel 758, écart de 11 expliqué, import complet (§6 sexies du rituel) | — |
| B | ~~`/stock/produits` prend l'UI d'AppStock~~ | **fait le 18 août 2026** — sept fichiers retirés, images servies par PocketBase (§6 sexies) | — |
| C | ~~`useCatalogProductSearch` et les écrans de choix produit~~ | **fait le 19 août 2026** — sept écrans et non quatre, trois écarts de schéma corrigés au passage (§6 octies) | — |
| D | ~~`adjustStock`, inventaire et reclassement~~ | **fait le 19 août 2026** — `stock-adjust.ts`, deux défauts corrigés en passant (§6 nonies) | — |
| E | ~~La caisse~~ | **fait le 19 août 2026** — lecture, création et décrément sur PocketBase ; trois gardes de jeton retirées (§6 decies) | — |
| F | ~~Arrêt du rechargement par purge~~ | **fait le 19 août 2026** — garde dans `guard.go`, `-force-purge` pour passer outre (§6 undecies) | — |
| G | ~~L'inventaire physique lit dans PocketBase~~ | **fait le 19 août 2026** — snapshot par `catalog-snapshot.ts`, résolution à deux clés, dernier import de `@/lib/apppos` du module retiré (§6 duodecies) | — |

**Ce qui n'est pas dans ce plan, et pourquoi :** la faille 3.1 — clés
WooCommerce en clair dans le bundle public du site — reste prioritaire et
indépendante (`CLAUDE.md`). Ce plan ne la traite pas et ne la remplace pas.

## 5. Ce qui n'est pas encore mesuré

Dit plutôt que deviné :

- ~~**le contenu réel de `InventoryPageAppPos.tsx`**~~ — mesuré le 19 août
  2026 : **quatre** `useQuery(['apppos','products','catalog'])` et deux appels
  directs, non deux. Tous retirés (§6 duodecies) ;
- **ce que la caisse fait du produit** au-delà de la lecture et du décrément —
  `CashTerminalPage.tsx` n'a été parcouru qu'en imports ;
- **si `useCreateAppPosProduct` a d'autres appelants** que la caisse : mesuré
  sur le nom du hook, pas sur ses réexports.
