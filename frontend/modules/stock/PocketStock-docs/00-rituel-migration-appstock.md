# Rituel de migration — AppStock, de l'API AppPos vers PocketBase

**Écrit le 13 août 2026**, à l'ouverture de la mission. Ce fichier est la carte
de départ : il dit ce qui existe, ce qui est mesuré, ce qui est décidé et ce qui
ne l'est pas. Il ne dit pas ce qui est fait — c'est le §7 qui tient l'état.

La mission précédente (le catalogue vers le site) est terminée et documentée
dans [`../../site/PocketSite-docs/README.md`](../../site/PocketSite-docs/README.md).
Celle-ci est l'autre moitié du même mouvement : **le site lit déjà PocketBase,
la gestion interne non.**

---

## 0. Ce que tu fais en premier, et rien d'autre

1. Lire `CLAUDE.md` à la racine — surtout la section « Contraintes à ne pas
   franchir » : AppPos ne se modifie pas, `pnpm typegen` est interdit, une
   migration se rajoute, elle ne se réécrit pas.
2. Lire ce fichier en entier.
3. **Vérifier le §2 dans le code avant de t'appuyer dessus.** Il a été mesuré le
   13 août 2026 ; entre-temps, des fichiers ont pu bouger.

Ne commence pas par écrire. La première session de cette mission produit une
décision d'architecture consignée, pas un composant.

## 1. Le but, en une phrase

**Faire passer AppStock derrière une couche d'accès aux données commune**, pour
que ses écrans cessent de dépendre de la provenance de ce qu'ils affichent :

```
aujourd'hui   AppStock UI ──▶ API AppPos          (et, par endroits, PocketBase)
étape         AppStock UI ──▶ couche data ──▶ AppPos | PocketBase | les deux
à terme       AppStock UI ──▶ PocketBase          (AppPos = système externe à synchroniser)
```

Quatre entités, et quatre seulement : `products`, `categories`, `brands`,
`suppliers`. La caisse, les documents commerciaux et le site ne sont pas dans
ce périmètre — ils le subissent, ce qui est déjà beaucoup.

## 2. L'état mesuré le 13 août 2026

Tout ce qui suit est **lu dans le code**, chemins donnés. Rien n'est rapporté.

### 2.1 Le module est en double, et la moitié est morte

`frontend/modules/stock/` porte six paires de composants — l'un « AppPos »,
l'autre non :

| PocketBase (ancien nom) | AppPos | Qui l'importe |
|---|---|---|
| `StockPage.tsx` | `StockPageAppPos.tsx` | **personne** / la route |
| `components/BrandList.tsx` | `BrandListAppPos.tsx` | `StockPage.tsx` seul |
| `components/SupplierList.tsx` | `SupplierListAppPos.tsx` | `StockPage.tsx` seul |
| `components/CategoryTree.tsx` | `CategoryTreeAppPos.tsx` | `StockPage.tsx` seul |
| `components/CategoryPicker.tsx` | `CategoryPickerAppPos.tsx` | `CategoryDialog`, `ProductDialog` |

**`StockPage.tsx` n'a aucun importeur.** Mesuré : aucune route, aucun module, ni
`index.ts` ne le cite. La route `/stock` (`frontend/routes/stock/index.tsx:2`)
importe `StockPage` **depuis `modules/stock/index.ts`**, qui à la ligne 5 fait :

```ts
import { StockPageAppPos as StockPage } from './StockPageAppPos'
```

C'est-à-dire que **le nom `StockPage` désigne la page AppPos**. Les deux routes
`/stock` et `/stock-apppos` rendent le même composant. L'ancienne page, et elle
seule, tient les trois listes non-AppPos.

**Et c'est la découverte qui change le plan :** ces composants morts sont les
composants **PocketBase**. `BrandList.tsx:22` lit `useBrands` de
`@/lib/queries/brands`, `SupplierList` lit `useSuppliers`, `CategoryTree` porte
`CategoryDialog` qui écrit dans PocketBase. Leurs jumeaux AppPos, eux, sont de
purs afficheurs : `BrandListAppPos.tsx` n'importe aucune requête, il reçoit ses
données en props.

**Conséquence pour les étapes 1 et 2 du plan : elles sont largement déjà
écrites, et débranchées.** Ce n'est pas du code à produire, c'est du code à
rebrancher, comparer, et trancher. Il faut mesurer ce que ces composants
couvrent réellement avant de conclure qu'ils suffisent — ils datent d'avant le
schéma `catalog_v2`.

### 2.2 La dispersion est réelle, et elle est déjà dans un même fichier

`components/ProductTable.tsx` est le cas d'école : il affiche des données de
forme AppPos venues de `useStockModule`, mais ses lignes 57-60 lisent
`useBrands`, `useCategories`, `useSuppliers` et `useDeleteProduct` — **quatre
requêtes PocketBase** — et sa ligne 52 pointe `APPPOS_ASSETS_BASE_URL` pour les
images. Un seul composant, deux bases, trois provenances.

`useStockModule.ts:1-19` importe `@/lib/apppos` **et** `usePocketBase`.

**17 fichiers de `frontend/modules/` importent `@/lib/apppos`**, répartis sur
quatre modules : `stock` (6), `connect` (8), `cash` (2), `common` (1). La couche
à écrire ne concerne que les six premiers ; les autres sont hors périmètre et
doivent le rester.

### 2.3 Il y a déjà deux chemins d'écriture, et un routeur non typé

`frontend/lib/queries/products.ts:179` — `useUpdateProductUniversal` choisit
entre AppPos et PocketBase **sur la valeur d'une chaîne** :

```ts
if (source === 'apppos_products') { … } else { … pb.collection('products').update … }
```

C'est l'embryon de la couche visée, et c'est aussi la dette que `CLAUDE.md`
interdit d'aggraver. **La couche du §4 doit le remplacer, pas s'ajouter à lui.**
Un `source?: string` optionnel qui décide d'une base de destination est un
défaut silencieux : oublier le paramètre écrit dans la mauvaise base sans
erreur.

### 2.4 Le stock se modifie depuis trois endroits

Constat du propriétaire, à vérifier fichier par fichier avant l'étape 4 :

- **AppStock**, par son module d'inventaire — `InventoryPageAppPos.tsx`, 3230
  lignes, qui parle directement à `appPosApi` (`:24`) ;
- **AppCash**, qui ajuste le stock **et crée des produits à la volée** avec un
  minimum d'informations — `modules/cash/CreateProductDialog.tsx:22`,
  `useCreateAppPosProduct` ;
- **AppPos** lui-même, qu'on ne modifie pas.

Un produit créé par la caisse naît donc dans NeDB, pas dans PocketBase. **Tant
que c'est vrai, PocketBase ne peut pas être source de vérité** : il lui manquera
toujours les produits nés en caisse. C'est le point dur de la mission, et il
n'est pas dans les cinq étapes proposées — voir §6.

## 3. Ce qui ne se franchit pas

Reprend `CLAUDE.md`, sans le remplacer. En cas d'écart, `CLAUDE.md` gagne.

- **AppPos ne se modifie pas.** PocketApp lit AppPos ; l'inverse n'existe pas.
- **La caisse est le maillon le moins négociable.** Aucune étape de cette
  mission ne doit pouvoir empêcher un encaissement. Si un doute subsiste, on
  n'expédie pas.
- **`pnpm typegen` reste interdit** : le schéma catalogue n'a plus `price_ht`,
  `cost_price`, `active`, `stock_max`, `unit` ni `weight`, et 21 fichiers les
  référencent. Les types nécessaires se déclarent à la main, comme dans
  `frontend/lib/queries/site-catalog.ts`.
- **Toute évolution de schéma passe par une nouvelle migration** inscrite dans
  `RunMigrations` (`backend/migrations/migrations.go:13`) : les `ensure*` sortent
  si la collection existe, modifier une migration existante ne change aucune
  base installée.
- **Les saisies éditoriales ne survivent pas à `catalog-import -load`**
  (`docs/DECISIONS.md`, 2026-08-12). Tant que le rechargement par purge existe,
  toute écriture dans `products`, `categories`, `brands` ou `suppliers` est
  provisoire — y compris celles de cette mission. **C'est la contrainte qui
  ordonne tout le reste** : voir §6.
- **Les images sont hors périmètre** — 4665 fichiers, 1,7 Go. Étape 5, session
  dédiée, on n'y touche pas en passant.

## 4. Le point d'architecture — **tranché le 13 août 2026**

**Les trois questions de ce paragraphe ont reçu leur réponse**, et les trois
blocs sont au journal (`docs/DECISIONS.md`, 13 août 2026). Elles ne se
rediscutent pas ici :

1. **La source est explicite et déclarée par entité**, typée, lisible au point
   d'appel. Ni drapeau `.env`, ni réglage en base.
2. **Les six paires de composants convergent**, chacune réduite à un composant
   dans la session qui la traite. Le module doit rétrécir en avançant : une
   session qui ajoute sans retirer a échoué.
3. **Pas de double écriture.** Une entité a une seule base de destination à un
   instant donné ; au moment de basculer, les écritures faites dans l'ancienne
   base depuis le dernier chargement sont reprises — travail ponctuel et
   visible, préféré à une divergence permanente et silencieuse.

Ce qui suit est le raisonnement qui y a mené. Il est conservé parce qu'il dit
**pourquoi**, et que le journal ne répète pas les mesures.

---

### Le raisonnement, conservé

**L'hypothèse du propriétaire :** ne pas dupliquer l'interface, introduire
PocketBase derrière une couche d'accès commune, faire évoluer les composants
existants.

**Je la recommande, avec une réserve sur sa forme.** Une couche qui choisit sa
base **selon l'environnement** est un interrupteur global : elle rend le mode
mixte indistinguable du mode PocketBase à la lecture du code, et elle fait de
`.env` un fichier dont la valeur change la base écrite. Le paramètre doit être
**explicite au point d'appel et typé**, pas déduit d'une chaîne ni d'une
variable d'environnement lue au fond de la pile. La leçon est déjà payée :
`useUpdateProductUniversal` est exactement cette erreur en petit (§2.3).

**Les trois points, et ce qui a été retenu :**

1. **La forme du sélecteur de source** — variable d'environnement, réglage en
   base, ou paramètre explicite par entité. **Retenu : par entité et explicite**,
   parce que la bascule ne sera pas simultanée pour les quatre. Catégories,
   marques et fournisseurs sont petits, stables et déjà dotés de composants
   PocketBase ; les produits portent le stock, la caisse et l'export.
2. **Le sort des composants en double** — rebrancher les composants PocketBase
   existants, faire converger les deux jeux en un, ou repartir des AppPos.
   **Retenu : faire converger, en supprimant les jumeaux au fur et à mesure**,
   jamais en gardant les deux « au cas où ». Six paires aujourd'hui, c'est déjà
   une de trop.
3. **Le mode « synchronisation des deux »** — écrire dans les deux bases à la
   fois. **Retenu : ne pas l'écrire.** Une écriture double sans transaction
   produit deux bases qui divergent au premier échec partiel, et c'est
   précisément le mode d'échec qui a coûté cher côté WooCommerce
   (`07-audit-flux-apppos.md`). Lire les deux, oui ; écrire les deux, non.

## 5. Les cinq étapes, reformulées avec ce qu'on sait

L'ordre du propriétaire est conservé. Ce qui change est le contenu réel de
chaque étape, à la lumière du §2.

| # | Étape | Ce que le §2 en dit |
|---|---|---|
| 1 | Afficher les 4 entités PocketBase dans AppStock | **En partie déjà écrit et débranché** (§2.1). Étape = inventorier, comparer au schéma `catalog_v2`, rebrancher derrière un accès unique — pas repartir de zéro |
| 2 | Éditer depuis AppStock : catégories, marques, fournisseurs, puis produits | Les dialogues PocketBase existent (`CategoryDialog`, `BrandDialog`, `SupplierDialog`), atteignables uniquement par du code mort. À reprendre, pas à réécrire |
| 3 | Centraliser la couche de données | **Doit remplacer `useUpdateProductUniversal`**, pas coexister (§2.3). C'est l'étape structurante ; les deux premières la préparent |
| 4 | Synchronisation site / AppPos, et frontière catalogue public ↔ interne | Le contrat d'export existe et fait autorité : `12-contrat-catalogue.md`. La frontière est déjà tracée d'un côté — `name`, `description`, `slug`, `status` partent au site ; prix d'achat, fournisseur, stock non |
| 5 | Images | Hors périmètre, session dédiée. Ne pas anticiper |

**Une étape 0 manque au plan, et elle conditionne les autres** : décider si la
caisse continue de créer des produits dans NeDB (§2.4 et §6). Tant qu'elle le
fait, l'étape 3 ne peut pas aboutir à « PocketBase source de vérité ».

## 6. Le point dur, nommé pour qu'il ne surprenne pas

**PocketBase est aujourd'hui une projection rechargeable par purge, et NeDB
reçoit encore des écritures.** Les deux propriétés sont incompatibles avec la
cible :

- tant que le rechargement par purge existe, **toute donnée saisie dans
  PocketBase est provisoire** ;
- tant que la caisse crée des produits dans NeDB, **PocketBase est en retard par
  construction**, et un rechargement est le seul moyen de le rattraper — ce qui
  détruit les saisies. Le serpent se mord la queue.

**Il faudra donc, à un moment, arrêter le rechargement par purge.** Ce jour-là,
PocketBase cesse d'être une projection et devient une base. C'est la vraie
frontière de la migration, plus que n'importe laquelle des cinq étapes. La
préparer veut dire : savoir reprendre les écritures faites dans NeDB depuis le
dernier chargement, ou avoir déplacé ces écritures.

Ce n'est pas une objection au plan. C'est ce qu'il faut avoir décidé avant
l'étape 3, sous peine de construire une couche qui suppose une source de vérité
qui n'existe pas encore.

## 6 bis. Étape 1 — la mesure, faite le 13 août 2026

Le §2.1 disait que les composants PocketBase existaient et qu'il faudrait
vérifier ce qu'ils couvrent « avant de conclure qu'ils suffisent ». **C'est
fait. Ils ne suffisent pas, et le mot est faible : ils écrivent dans des champs
qui n'existent plus.**

### 6bis.1 La base installée est bien celle de `catalog_v2`

Lu dans `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, table `_collections` :

| Collection | Champs réellement en place | Lignes |
|---|---|---|
| `suppliers` | `name, supplier_code, siren, contact_name, contact_email, contact_phone, contact_address, banking, payment_terms, brands, legacy_id, company` | 43 |
| `brands` | `name, slug, description, image, wp_image_url, legacy_id, company` | 287 |
| `categories` | `name, slug, description, image, wp_image_url, is_featured, legacy_id, company, parent` | 463 |
| `products` | (schéma `catalog_v2`) | 2999 |

La question du §2 — v1 ou v2 dans la base installée, les `ensure*` sortant si la
collection existe — **est donc tranchée par la mesure : c'est v2**. Le doute
était légitime, il n'a plus lieu d'être.

### 6bis.2 `SupplierDialog` écrit six champs qui n'existent pas

Son schéma de saisie (`components/SupplierDialog.tsx:32-41`) déclare `name`,
`email`, `phone`, `address`, `contact`, `notes`, `brands`, `active`.

Confronté à la collection réelle : **seuls `name` et `brands` existent.** Les
six autres sont ceux de l'**ancienne** collection, celle de
`backend/migrations/catalog.go` — `contact, email, phone, address, notes,
active` s'y trouvent mot pour mot. Le dialogue a été écrit pour le schéma v1 et
n'a jamais suivi.

Et les champs v2 qu'il ignore sont exactement ceux qui portent la valeur métier :
`supplier_code`, `siren`, `contact_name`, `contact_email`, `contact_phone`,
`contact_address`, `banking`, `payment_terms`.

**Rebrancher ce dialogue tel quel ne serait pas neutre** : un enregistrement
n'écrirait que le nom et les marques, en silence, et l'utilisateur croirait
avoir saisi une fiche fournisseur.

### 6bis.3 `useCategories` trie sur un champ absent

`frontend/lib/queries/categories.ts:39` : `sort: sort || 'order,name'`. **La
collection n'a pas de champ `order`** (v1 en avait un). PocketBase refuse un tri
sur un champ inconnu — l'appel part en erreur, il ne rend pas une liste
désordonnée.

C'est le défaut le plus court à corriger de tout l'inventaire, et le plus
bloquant : tant qu'il est là, aucun écran catégories PocketBase ne s'affiche.

### 6bis.4 `pocketbase-types.ts` décrit trois collections qui n'existent plus

Le fichier est retouché à la main et `pnpm typegen` reste interdit (`CLAUDE.md`).
Résultat, il fait foi pour le compilateur tout en étant faux :

| Type | Ce qu'il déclare | Ce que la base a |
|---|---|---|
| `SuppliersRecord` | `active, address, contact, email, notes, phone` | aucun des six |
| `BrandsRecord` | `logo, website` | `image`, `wp_image_url`, `slug` |
| `CategoriesRecord` | `color, icon, order` | `slug, description, image, is_featured` |

**Et aucun des trois ne déclare `legacy_id`** — la clé de l'export vers le site
(§1 du contrat catalogue). Le typage ne protège donc pas ici : il **couvre**
l'erreur. C'est la raison pour laquelle `site-catalog.ts` déclare ses types à la
main plutôt que de les importer, et la couche du §4 devra faire de même.

### 6bis.5 Le filtre par entreprise est sans effet aujourd'hui

Les trois hooks filtrent sur `company = "<id de session>"`
(`brands.ts:23`, `categories.ts:28`, `suppliers.ts:23`). Mesuré :
**une seule entreprise en base** — `468mpen5lhg6u0v`, SARL GALICHET — et les
793 lignes des trois collections lui sont toutes rattachées. Le filtre est donc
inoffensif **tant qu'il n'y a qu'une entreprise**, exactement comme la note
déjà consignée pour `site-catalog.ts`. À ne pas prendre pour une garantie.

### 6bis.6 Ce que la mesure change au plan

L'étape 1 n'est pas « rebrancher », c'est **remettre à niveau puis rebrancher**,
et dans cet ordre :

1. `useCategories` — retirer `order` du tri (6bis.3). Sans cela rien ne
   s'affiche ;
2. les types des trois collections — déclarés à la main, à la forme réelle,
   `legacy_id` compris (6bis.4) ;
3. `SupplierDialog` — refait sur les champs v2 (6bis.2). C'est le plus gros
   morceau de l'étape 2, et il était réputé « déjà écrit » ;
4. `BrandList` et `CategoryTree` — à confronter au même exercice avant
   branchement.

**Correction, le jour même.** J'avais écrit ici que `BrandDialog` « passe tel
quel ». **C'est faux :** il saisit `website`, le valide comme URL et l'écrit —
champ qui n'existe pas plus que ceux des fournisseurs. `CategoryDialog` fait de
même avec `order`, `icon` et `color`. La première mesure avait cherché les
champs du schéma dans les composants ; elle n'avait pas cherché **les champs des
composants dans le schéma**, et c'est ce sens-là qui révèle les fantômes.
**Les trois formulaires étaient touchés, pas un seul.**

## 6 ter. Étape 1 — ce qui a été remis à niveau, le 13 août 2026

Les quatre points du §6bis.6, faits. `npx tsc -b` silencieux, `pnpm test` vert
(48 cas), Biome passé — les deux avertissements restants de
`InventoryPageAppPos.tsx` sont antérieurs et hors périmètre.

**Le fichier neuf : `frontend/lib/queries/catalog-shapes.ts`.** Il déclare à la
main la forme réelle de `brands`, `categories` et `suppliers`, `legacy_id`
compris. Il ne redéclare **pas** les produits : leur forme lue vit dans
`site-catalog.ts`, en production, et en créer une seconde version avant la
couche du §4 ferait deux vérités concurrentes pour la même collection.

**`pocketbase-types.ts` n'a pas été corrigé, et ne doit pas l'être ici.** Ses
types portent aussi des données **AppPos** (`apppos-transformers.ts`,
`apppos-hooks.ts`), qui ont, elles, `logo`, `website`, `active`. Les redresser
casserait la chaîne AppPos, donc la caisse.

| Fichier | Ce qui change |
|---|---|
| `lib/queries/categories.ts` | tri `order,name` → `name`, aux trois endroits ; types réels ; `CategoryWrite` |
| `lib/queries/brands.ts` | types réels ; `BrandWrite` |
| `lib/queries/suppliers.ts` | types réels ; `SupplierWrite` |
| `components/SupplierDialog.tsx` | refait : `supplier_code`, `siren`, `contact_*`, `brands`. SIREN validé à 9 chiffres |
| `components/SupplierList.tsx` | colonnes `contact_*` ; « Statut » (`active`) remplacé par « Code » |
| `components/BrandDialog.tsx` | `website` retiré |
| `components/BrandList.tsx` | colonne « Site web » → « Slug » |
| `components/CategoryDialog.tsx` | `order`/`icon`/`color` retirés, `description` et `is_featured` ajoutés |
| `CategoryPicker`, `CategoryTree`, `ProductTable`, `StockPage` | suivent les types |

**Trois règles posées en passant, chacune commentée sur place :**

- **un champ vidé part en chaîne vide, jamais en `undefined`** : `undefined`
  disparaît du corps JSON, l'ancienne valeur reste en base, et l'utilisateur
  voit son champ se remplir seul au rechargement. Vaut aussi pour `parent`, dont
  la valeur racine est la chaîne vide ;
- **`slug` n'est éditable nulle part** : l'URL est figée au premier envoi et le
  serveur en est le gardien (§4.5 du contrat catalogue). Un champ qui ne changera
  rien en ligne ne doit pas être proposé ;
- **le message d'erreur de PocketBase est affiché** plutôt que jeté : il nomme
  le champ refusé.

**Ce qui n'est PAS vérifié dans l'application.** PocketBase local ne tournait
plus au moment de la remise à niveau (`/api/health` injoignable) : la mesure de
schéma a été faite sur le fichier SQLite, et les écrans n'ont pas été ouverts.
**Rien de tout ceci n'est atteignable depuis l'interface** — ces composants sont
sous `StockPage.tsx`, qui n'a toujours aucun importeur. Le branchement, lui,
reste à faire, et c'est lui qui apportera la vérification à l'écran.

**Le pronostic du §2.1 est donc à corriger, et je le corrige ici plutôt que de
le réécrire là-bas** : les composants PocketBase sont une base de départ réelle
pour les marques et les catégories, mais pour les fournisseurs, « déjà écrit »
voulait dire « écrit contre un schéma disparu ».

## 6 quater. Le branchement, et l'écriture — 13 août 2026

**Tout ce qui suit a été vérifié dans l'application par le propriétaire.**
Ce n'est pas une lecture de code.

### Les quatre entités sont atteignables

Quatre entrées au menu du module, quatre routes, quatre écrans qui lisent
PocketBase et lui seul — sans AppPos, qui ne tournait même pas pendant les
essais :

| Écran | Route | Ce qu'il fait |
|---|---|---|
| Produits (PocketBase) | `/stock/produits` | liste paginée **côté serveur**, recherche, filtres, création et modification |
| Marques | `/stock/marques` | 287 marques, gestion complète |
| Catégories | `/stock/categories` | arbre, compteurs « ici / branche », gestion complète |
| Fournisseurs | `/stock/fournisseurs` | 43 fiches, sur les champs v2 |

**L'écriture des produits est ouverte** (`docs/DECISIONS.md`, 13 août 2026 :
AppPos sort de la logique à la prochaine release). Elle passe par
`useCreateCatalogProduct` / `useUpdateCatalogProduct`, jamais par
`useUpdateProductUniversal`.

### La paire « marques » n'en était pas une

`BrandList` **gère**, `BrandListAppPos` **filtre** une liste de produits AppPos.
Deux rôles, pas deux versions — le cas prévu au §4, qui demande de le consigner
plutôt que de forcer une fusion. Le second est renommé **`BrandFilterPanel`** et
son type ne nomme plus aucune base.

**Ce qui n'a PAS été fait, et c'est délibéré :** brancher ce panneau sur
PocketBase. Le filtre compare `p.brand` à `selectedBrand.id`
(`useStockModule.ts`), et les produits viennent d'AppPos avec des identifiants
NeDB : des marques PocketBase auraient donné **zéro produit, sans erreur**.

### Quatre défauts trouvés en branchant, tous mesurés

1. **Les compteurs de produits par marque étaient à zéro.** `useProducts` rend
   `getList(1, 50)` — une page. Mesuré : 232 marques portent au moins un
   produit, mais **27 seulement** apparaissent dans les 50 produits les plus
   récents. Remplacé par `useProductCountsByBrand`, une requête sur
   `fields: 'brand'`. Même traitement préventif pour les catégories, avec
   `useProductIdsByCategory` — qui rend les identifiants et non des décomptes,
   pour pouvoir **dédoublonner** un produit rattaché à deux catégories sœurs.
2. **Le sous-menu du module se refermait tout seul.** `layout.tsx` avait
   `activeGroup` dans les dépendances de l'effet qui l'aligne sur l'URL : il se
   rappelait lui-même et annulait le clic. Invisible tant que chaque groupe
   n'avait qu'un item ; ajouter « Marques » l'a révélé.
3. **Aucun fournisseur n'était modifiable.** `banking` et `payment_terms` sont
   déclarés `FieldTypeJson` **sans options** (`catalog_v2.go:493-500`), donc
   `MaxSize = 0` : PocketBase refuse toute valeur non vide, et il valide
   l'enregistrement ENTIER à chaque mise à jour. Les 43 fournisseurs portaient un
   `payment_terms` non vide. Corrigé par une migration neuve,
   `backend/migrations/fix_json_max_size.go`, inscrite dans `RunMigrations`.
   **Trois champs de la caisse portent le même défaut** — `cash_movements.meta`
   sur 160 des 179 mouvements — mais **rien ne met à jour un mouvement
   existant** (cinq écrivains, tous en création, tous par le DAO) : le défaut est
   latent, il est consigné dans la migration, il n'est pas corrigé ici.
4. **Le message d'erreur ne disait rien.** `error.message` de PocketBase vaut
   toujours « Something went wrong… » ; le détail par champ est dans
   `error.response.data`. C'est `lib/queries/pb-error.ts` qui l'extrait — et
   c'est lui qui a permis de trouver le défaut n° 3 en une fois.

### La clé, et l'état des relations

Deux décisions du 13 août 2026, prises après un refus à l'export :

- **`legacy_id` devient « clé stable »**, générée par la couche (`pa_…`) pour
  toute entité créée ici — `lib/queries/legacy-key.ts`, 6 tests. Sans elle, une
  entité n'était pas seulement refusée : elle **disparaissait des relations**,
  un produit partant sans sa catégorie et sans sa marque, en silence ;
- **l'export reste explicite, mais l'état se voit désormais pour les trois
  entités** : `useRelationChecksums` calcule les empreintes des catégories et
  marques, et « Catalogue en ligne » affiche ce qui a changé avec un bouton pour
  l'envoyer. Automatique quand la retouche accompagne un produit — c'était déjà
  le cas —, explicite quand elle est isolée.

### Un détail d'interface qui portait un vrai risque

Dans le dialogue produit, choisir un fournisseur restreint les marques à celles
qu'il distribue. **Deux gardes valent plus que le filtre :** un fournisseur sans
marque déclarée (3 sur 43) ne vide pas la liste, et la marque déjà enregistrée
reste proposée même hors fournisseur — sinon un simple enregistrement l'aurait
effacée sans demande.

## 6 quinquies. Étape 3 — la couche unique, 18 août 2026

**Ce qui a été mesuré avant de toucher quoi que ce soit.** La chaîne réellement
rendue par `/stock` et `/stock-apppos` est : `routes/stock/index.tsx:2` →
`modules/stock/index.ts:12` → `StockPageAppPos` → `useStockModule` + `StockView`
→ `ProductTable`. Les produits qui y arrivent viennent **toujours** d'AppPos.
`StockPage.tsx` — le seul appelant qui aurait pu y mettre des produits
PocketBase — n'avait toujours aucun importeur.

**Deux défauts en découlaient, invisibles à la lecture rapide :**

1. **« Supprimer » ne pouvait rien supprimer.** `ProductTable.tsx:92` appelait
   `useDeleteProduct` — une suppression **PocketBase** — avec l'identifiant
   **NeDB** du produit affiché. Les deux espaces d'identifiants ne se
   recouvrent pas : l'appel ne pouvait que rater.
2. **« Modifier » écrivait dans AppPos.** `ProductDialog` passait
   `source: product.collectionId`, donc `'apppos_products'`, donc
   `updateAppPosProduct`. C'est exactement ce que `CLAUDE.md` interdit depuis le
   13 août — on n'écrit jamais dans AppPos.

**Ce qui a été fait.** Le catalogue AppPos (`/stock-apppos`) devient une vue
**en lecture seule**, à une seule provenance. L'édition d'un produit se fait
sous `/stock/produits`, dans PocketBase, par `CatalogProductDialog`.

| Fichier | Ce qui change |
|---|---|
| `StockPage.tsx` | **supprimé** — sans importeur depuis le premier jour de la mission |
| `components/ProductDialog.tsx` | **supprimé** — il portait les deux bases et le routeur |
| `components/CategoryPickerAppPos.tsx` | **supprimé** — plus aucun appelant après le précédent |
| `lib/queries/products.ts` | `useUpdateProductUniversal` **supprimé**, avec `useProducts`, `useProduct`, `useProductByBarcode`, `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, `useUpdateAppPosProduct` — aucun n'avait plus d'appelant. Il ne reste que les deux lectures agrégées |
| `components/ProductTable.tsx` | plus une seule requête PocketBase ; `ProductWithExpand extends ProductsResponse` remplacé par `StockProductRow`, structurel, déclaré par ce que la table lit |
| `useStockModule.ts` | `selectedCategory` et `selectedSupplier` typés `SelectedRef` — le défaut noté le 13 août, corrigé |
| `single-source.test.ts` | **neuf** — 6 cas qui lisent les fichiers et refusent le retour des chemins mêlés |

**Le module a rétréci** : trois composants retirés, aucun ajouté ;
1354 lignes en moins pour 81 en plus.

**Ce qui est vérifié, et comment.** `npx tsc -b` silencieux, `pnpm test` vert
(60 cas, dont 6 neufs), Biome passé sur les fichiers touchés. Les quatre modules
modifiés se transforment sans erreur dans le serveur Vite en cours
(`GET /frontend/…` → 200, JS réel). **Ce qui n'est PAS vérifié : l'écran.**
L'application demande une connexion, que je n'ai pas faite. Restent à regarder :
`/stock-apppos` — la table s'affiche, le menu « … » ne propose plus que « Copier
le code-barres » —, et `/stock/produits`, inchangé, où l'édition doit continuer
de fonctionner.

## 6 sexies. Fronts A et B — 18 août 2026

### A. Les galeries : 758 attendues, 747 en base, et rien n'est perdu

Le §0 du plan relevait un écart entre les 1339 galeries annoncées par
`catalog_v2.go:672` et les 747 mesurées en base. **Compté côté NeDB**
(`%APPDATA%\AppPOS\data\products.db`, 3050 produits vivants après application
des `$$deleted`) :

| Mesure NeDB | Valeur |
|---|---|
| avec `gallery_images` non vide | 2361 |
| **dont au moins une image AUTRE que la principale** | **758** |

Le 1339 comptait donc autre chose — vraisemblablement les galeries avant
exclusion de l'image principale (`normalize/catalog.go:598-607`), ou la base de
développement périmée. **L'attendu réel est 758.**

**L'écart de 11 se décompose, et aucune de ses deux moitiés n'est un défaut du
chargeur :**

- **8 produits ne sont pas dans PocketBase du tout** — ils font partie des
  **53 produits** présents dans NeDB et absents de la base, créés depuis
  l'import du 13 août. C'est le point dur du §6, désormais chiffré : 53 ;
- **3 produits sont bien importés mais sans galerie** — `YPr1r2fnKJg8WDWI`,
  `xFkkcXtE0z7CFY5c`, `zsjmZrAtnB1mxQ0W`. Vérifié fichier par fichier :
  **aucune des images attendues n'existe sur le disque AppPos**. NeDB déclare
  des chemins qui ne pointent nulle part ; le chargeur ne pouvait pas les
  copier.

**Conclusion : l'import des images est complet.** 2639 images principales et
747 galeries, pour 2639 et 758 attendues — la différence est du côté d'AppPos,
pas du nôtre. Il n'y a rien à écrire côté import.

### B. `/stock/produits` prend l'UI d'AppStock, et l'écran AppPos disparaît

**Un seul écran catalogue désormais**, sur PocketBase, avec la table riche de
l'ancien : vignette, chemin de catégories, marque et fournisseur sous le nom,
prix d'achat sous le prix de vente, badges de stock.

| Fichier | Ce qui change |
|---|---|
| `lib/queries/catalog-rows.ts` | **neuf** — `toStockRow`, du produit PocketBase à la ligne affichée : relations résolues en mémoire, image résolue par `pb.files.getUrl`. 6 tests |
| `lib/queries/catalog-products.ts` | filtres serveur `categoryId` (relation multiple, donc `~`) et `supplierId` |
| `components/ProductTable.tsx` | ne fait plus aucune requête et ne construit plus aucune URL ; `paginated` et `onRowClick` en props ; colonne `active` → `status` ; un `console.log` oublié retiré |
| `ProductsPage.tsx` | rend `ProductTable`, ajoute les filtres marque / catégorie / fournisseur, ligne cliquable vers `CatalogProductDialog` |
| `StockView`, `StockPageAppPos`, `useStockModule`, `BrandFilterPanel`, `CategoryTreeAppPos`, `SupplierListAppPos`, `routes/stock-apppos` | **supprimés** |
| `index.ts` | route principale `/stock/produits` ; une seule entrée de menu au lieu de deux |

**Les images arrivent gratuitement, et c'était le pari du plan** : elles étaient
déjà en base, seule leur URL venait d'AppPos. Vérifié sur disque —
`storage/<collectionId>/<id>/<image>` existe pour les 5 produits tirés au sort,
`collectionId` valant `71wy9ngwa1b87sk`.

**Le module a encore rétréci** : sept fichiers retirés, deux ajoutés
(`catalog-rows.ts` et son test).

**Vérifié :** `npx tsc -b` silencieux, `pnpm test` vert (66 cas), Biome passé,
les modules se transforment sans erreur dans Vite. **Non vérifié : l'écran** —
l'application demande une connexion. À regarder : `/stock/produits`, la table
avec ses vignettes, les trois filtres, et le clic sur une ligne qui ouvre
l'édition.

**Reste AppPos dans le module `stock` :** `InventoryPageAppPos.tsx` seul, c'est
le front D du plan.

## 6 septies. Le filtre catégorie porte sur la BRANCHE — 18 août 2026

Signalé par le propriétaire à l'essai du nouvel écran, et c'est un vrai défaut :
**un produit est rattaché à ses catégories feuilles, jamais à leurs ancêtres.**
Filtrer sur `categories ~ <racine>` ne rendait donc que les rares produits posés
directement sur le nœud, et cachait tout ce qui est rangé dessous — sans erreur,
ce qui est le pire des cas.

**Mesuré en base**, quelques racines, nœud seul contre branche entière :

| Racine | nœud seul | branche | catégories de la branche |
|---|---|---|---|
| Sonorisation | 11 | **30** | 8 |
| Batterie & Percussion | 2 | **10** | 16 |
| ACCESSOIRES pour Musiciens | 4 | **8** | 17 |
| Guitares & Basses | 0 | **4** | 16 |

L'arbre mesuré le même jour : **464 catégories, 47 racines, profondeur maximale
3**, la plus large branche en comptant 62 — ce qui rend l'énumération des
descendants tenable dans une chaîne de filtre. 264 produits sur 2999 n'ont
aucune catégorie, et aucun rattachement ne pointe vers une catégorie inconnue.

**Le fichier neuf : `lib/queries/category-tree.ts`**, deux fonctions pures et
11 tests. `collectBranchIds` rend la racine et toute sa descendance ;
`toCategoryOptions` rend les catégories dans l'ordre de l'arbre, avec leur
profondeur — une liste de 464 noms à plat ne dit pas laquelle est une racine, et
le sélecteur les indente désormais.

**Deux pièges fermés au passage, chacun commenté sur place :**

- **une branche vide vaut « pas de filtre »** : `collectBranchIds` rend `[]`
  pour une catégorie inconnue, et la requête aurait alors affiché les 2999
  produits sous une catégorie qui n'en a aucun. `ProductsPage` se replie sur
  `[categoryId]` — filtre exact, donc zéro résultat — le temps que les
  catégories chargent, et si la catégorie choisie a disparu ;
- **un cycle de parenté** dans la donnée importée aurait figé l'écran : le
  parcours est itératif, avec ensemble de visités. Un test le couvre.

## 6 septies. Les images des marques et des catégories — 18 août 2026

**La question posée : les marques et les catégories affichent-elles l'image
servie par PocketBase, comme les produits ? Réponse mesurée : non, et il y avait
de quoi.**

| Collection | Lignes | Avec une image en base | Affichée avant ce jour |
|---|---|---|---|
| `brands` | 288 | **225** | non |
| `categories` | 464 | **36** | non |

225 logos de marque dormaient dans le stockage sans qu'aucun écran ne les
montre. `BrandList.tsx:168` le disait même en toutes lettres — « le logo est un
sujet à part : les images sont hors périmètre ».

**Ce qui a été fait :**

- **`BrandList`** — une colonne vignette en tête de ligne, `pb.files.getUrl` ;
- **`CategoryTree`** — l'image remplace l'icône de dossier quand elle existe ;
- **`BrandDialog`, `CategoryDialog`, `CatalogProductDialog`** — un champ image :
  aperçu, importer, retirer.

### La brique, et pourquoi elle existe

**Les prochaines installations n'auront pas de dossier AppPos.** L'import
(`backend/catalog/load/loader.go`) tire 4665 fichiers de
`%APPDATA%\AppPOS\data\public` ; un client qui n'a jamais connu AppPos n'a
rien à importer. Il lui faut le geste inverse : **envoyer** une image depuis
l'écran. C'est celui du logo d'entreprise (`lib/queries/companies.ts:118-176`),
seul à le porter jusqu'ici.

Deux fichiers neufs, tirés de là :

- **`components/ui/image-field.tsx`** — aperçu, importer, retirer. Il ne connaît
  aucune base : il rend un fichier et une intention de retrait ;
- **`lib/queries/image-upload.ts`** — `buildWritePayload`, qui sait envoyer un
  champ fichier. **8 tests**, pour trois règles qui se payent cher autrement :

  1. **un `File` ne passe que par `FormData`** — dans un objet JSON il part en
     `{}` et PocketBase enregistre un champ vide sans se plaindre ;
  2. **retirer une image, c'est envoyer la chaîne vide**, jamais `undefined` —
     la même règle que les champs texte, posée le 13 août ;
  3. **ne rien dire du fichier laisse l'image en place** — sans quoi enregistrer
     une fiche sans ouvrir le sélecteur effacerait son image.

`useCreateBrand`, `useUpdateBrand`, `useCreateCategory`, `useUpdateCategory`,
`useCreateCatalogProduct` et `useUpdateCatalogProduct` passent tous par elle.

**Ce qui reste hors périmètre : la galerie du produit.** Elle porte plusieurs
fichiers, avec un ordre, et demande un écran à elle.

**Vérifié :** `npx tsc -b` silencieux, `pnpm test` vert (96 cas, dont 8 neufs),
Biome passé, les fichiers se transforment dans Vite. **Non vérifié : l'écran** —
l'application demande une connexion. À regarder : les vignettes sur
`/stock/marques` et `/stock/categories`, et un import d'image dans chacun des
trois dialogues.

## 6 octies. Front C — le choix produit des documents, 19 août 2026

**Sept écrans, pas quatre.** Le plan en annonçait quatre ; la mesure en a trouvé
sept, tous avec le même préambule copié :

```
useEffect(() => { … loginToAppPos('admin', 'admin123') … }, [isAppPosConnected])
const { data: productsData } = useAppPosProducts({ enabled: isAppPosConnected, searchTerm })
const products = (productsData?.items ?? []) as XProduct[]
```

Facture (création, modification), devis (création, modification), commande
(création, détail) et la commande en ligne. **Le mot de passe AppPos était en
clair dans les sept.**

### Ce qui remplace : `useCatalogProductSearch`

Dans `lib/queries/catalog-products.ts`. Trois choix, chacun pour une raison :

- **la recherche part au serveur**, comme `/stock/produits` : 2999 produits ne
  se chargent pas pour en choisir un. AppPos les chargeait tous, à chaque écran ;
- **l'anti-rebond est dans le hook**, pas dans les écrans — où il n'existait
  pas : chaque frappe relançait le filtre. 300 ms, la valeur de `ProductsPage` ;
- **25 produits sans recherche**, pour que le sélecteur s'ouvre garni. Les
  écrans faisaient `slice(0, 20)` sur une liste de 3000 ; le `slice` a disparu.

Le hook filtre aussi sur `status = 'published'` : **un document ne se compose
pas de brouillons**, dont le prix n'est pas arrêté.

### Trois écarts de schéma trouvés en basculant

1. **`tva_rate` n'existe pas dans `catalog_v2`** — c'est `tax_rate`. Les sept
   écrans lisaient `product.tva_rate ?? 20`, nom que le transformateur AppPos
   produisait. Sans correction, **tous les produits seraient partis à 20 %** de
   TVA par défaut, silencieusement ;
2. **`price_ht` n'existe plus** (`CLAUDE.md`). Les commandes s'en servaient en
   premier et retombaient sur le TTC ; la branche fantôme est retirée, le HT se
   dérive du TTC par le taux — ce qui était déjà le repli ;
3. **le nom de marque d'une ligne de devis** venait de `expand.brand.name`.
   PocketBase rend un identifiant : il est résolu par le cache `useBrands`,
   comme dans `catalog-rows.ts`. Deux `console.log` de débogage traînaient là,
   retirés avec.

### L'état

| | Avant | Après |
|---|---|---|
| écrans lisant AppPos pour choisir un produit | 7 | **0** |
| mots de passe AppPos en clair dans `connect` | 7 | **0** |
| produits chargés pour ouvrir un sélecteur | ~3000 | 25 |

**14 cas de test neufs** gardent la bascule, écran par écran
(`single-source.test.ts`) : chacun cherche dans PocketBase, aucun ne se
reconnecte à AppPos.

**Ce qui parle encore à AppPos dans `connect`, et c'est le front D** : le
mouvement de stock — `decrementStockFromCart` / `decrementStockFromItems`
(`InvoicesPage.tsx`, `InvoicePaymentDialog.tsx`, `useInvoiceActions.tsx`,
`lib/queries/invoices.ts`, `lib/queries/quotes.ts`). **Lire est basculé, bouger
ne l'est pas.**

**Vérifié :** `npx tsc -b` silencieux, `pnpm test` vert (109 cas), Biome passé,
les sept écrans se transforment dans Vite. **Non vérifié : l'écran** — à
regarder, l'ouverture du sélecteur de produit dans une facture, un devis et une
commande, et le prix repris avec **le bon taux de TVA**.

## 6 nonies. Front D — le chemin unique des mouvements de stock, 19 août 2026

**`lib/queries/stock-adjust.ts`**, neuf. Un seul chemin là où il y en avait
trois, chacune vers AppPos : `updateAppPosProductStock` (inventaire),
`incrementAppPosProductsStock` (retour), `decrementAppPosProductsStock` (vente).

```
applyStockMovements(pb, mouvements, { reason, sourceId, operator, metadata })
setCountedStock(pb, productId, compté, …)     // l'inventaire, en absolu
```

**Branchés : l'inventaire et le reclassement de retour. Pas la vente** — elle
reste sur AppPos jusqu'au front E, comme décidé : la couche se prouve sur deux
appelants avant de toucher au maillon le moins négociable.

### Ce que la couche porte, et pourquoi

- **le pont `legacy_id`, explicite.** Les appelants tiennent des identifiants
  NeDB — une entrée d'inventaire, une ligne de facture. `productFilter`
  interroge **les deux champs**, `id` et `legacy_id` : ne tester que `id`
  rendrait introuvable tout ce qui vient de la caisse ;
- **`absolute` prime sur `delta`** : l'inventaire ne corrige pas, il constate ;
- **aucun plafonnement à zéro.** Un stock négatif dit qu'il s'est vendu plus que
  ce que la base croyait détenir ; l'écraser masquerait la cause ;
- **un stock inchangé n'est ni écrit ni journalisé.** Un comptage conforme n'est
  pas un mouvement — sinon une session d'inventaire noie ses propres écarts ;
- **un produit introuvable est rendu, pas avalé.** Les 53 produits qui vivent
  dans NeDB sans exister dans PocketBase rendent le cas quotidien ;
- **le journal est best-effort**, comme il l'était : une trace ratée ne défait
  pas un mouvement appliqué.

**14 cas de test**, sur un PocketBase simulé.

### Deux défauts corrigés en branchant

1. **L'inventaire journalisait à côté de son ajustement.** `countAndAdjustProduct`
   appelait `updateAppPosStock` puis un rappel `onAdjusted` qui écrivait
   l'événement : deux écritures indépendantes, donc une trace et un mouvement
   qui pouvaient se contredire quand l'une des deux ratait. Le rappel et son
   type `OnAdjustedCallback` sont supprimés ; `setCountedStock` fait les deux.
2. **Le reclassement ne signalait pas ses échecs.** `incrementAppPosProductsStock`
   avalait l'erreur produit par produit, en console. Un produit introuvable
   affiche désormais un message : c'est de la marchandise physiquement revenue
   dont le stock n'a pas bougé.

**`StockReturnDestination` devient `ReturnDestination`**, déclaré dans la
couche : `restock`, `sav`, `stock_b` sont une notion de métier, pas une notion
de l'API qu'on quitte. Seul `restock` bouge le stock ; les deux autres laissent
une trace, sans quoi la marchandise disparaîtrait du journal en même temps que
du stock.

### ⚠️ La conséquence, à connaître avant d'utiliser

**L'inventaire ne corrige plus le stock qu'AppPos affiche.** Il corrige celui de
PocketBase. Tant que la caisse vend sur NeDB (front E), un comptage physique
n'empêche donc plus la caisse de vendre sur un stock faux. C'est la contrepartie
assumée de « pas de double écriture » (DECISIONS, 2026-08-13), et elle se
referme au front E — pas avant.

### Une limite du support, écrite plutôt que découverte

**Lecture puis écriture, sans transaction** : PocketBase n'expose pas
d'incrément atomique en REST. Deux mouvements simultanés sur le même produit
peuvent s'écraser. Tenable pour un poste et un opérateur ; à reprendre par un
hook serveur le jour où deux postes vendent en même temps.

**Vérifié :** `npx tsc -b` silencieux, `pnpm test` vert (127 cas, dont 18
neufs), Biome passé, les quatre fichiers se transforment dans Vite. **Non
vérifié : l'écran** — à regarder, un comptage avec écart dans une session
d'inventaire, et un retour reclassé en « remis en stock », puis le stock du
produit sous `/stock/produits`.

## 6 decies. Front E — la caisse, 19 août 2026

**Le maillon le moins négociable est passé sur PocketBase**, dans ses trois
dimensions : elle LIT le catalogue local, elle CRÉE ses produits ici, et sa
vente décrémente ici.

### Ce qui a changé

| | Avant | Après |
|---|---|---|
| catalogue de la caisse | `useAppPosProducts`, 3000 produits chargés, filtre en mémoire | `useCatalogProductSearch`, recherche au serveur |
| connexion préalable | `loginToAppPos('admin', 'admin123')`, voyant « API » | **aucune** — la base est locale |
| création de produit | `useCreateAppPosProduct` → **NeDB** | `useCreateCatalogProduct` → PocketBase |
| décrément de vente | `decrementStockFromCart` → AppPos | `recordSale` → PocketBase |
| images de la grille | `getAppPosImageUrl` | `pb.files.getUrl`, résolue une fois |

**`lib/apppos/stock-utils.ts` est supprimé** — il portait les deux fonctions de
vente et leur journalisation. `recordSale` et `toSoldLines` les remplacent dans
`stock-adjust.ts`, avec les cinq appelants : caisse, paiement de facture, liste
des factures, création de facture validée, conversion de devis.
**`components/terminal/utils/imageUtils.ts`** part aussi : la grille reçoit une
URL, elle n'en construit plus.

**`AppPosProduct` devient `PosProduct`** (`components/terminal/types/cart.ts`) :
il ne nomme plus aucune base, `images` (chemin AppServe) devient `imageUrl`
résolue, `price_ht` disparaît — il n'existe plus au schéma —, `tva_rate` devient
`tax_rate`, et `stock_quantity` devient `stock`.

### Le point dur est refermé

**La caisse ne crée plus de produits dans NeDB.** C'est ce qui rendait
PocketBase en retard *par construction* — 53 produits y manquaient au 18 août
2026, tous nés en caisse depuis l'import. Un produit créé au comptoir naît
désormais dans PocketBase, publié (sans quoi le sélecteur de la caisse, qui
écarte les brouillons, ne le retrouverait pas dans la seconde qui suit) et doté
de sa clé stable par la couche.

**Ce qui rend possible le front F** : le rechargement par purge peut cesser, et
avec lui le caractère provisoire de toute saisie.

### Un défaut trouvé en basculant

**Trois gardes `getAppPosToken()` conditionnaient un mouvement de stock à la
présence d'AppPos** — `InvoicePaymentDialog.tsx:172`,
`useInvoiceActions.tsx:297`, `InvoicesPage.tsx:467`. Depuis le front D, le
reclassement d'un retour écrit dans PocketBase : la garde n'empêchait plus une
double écriture, elle empêchait **la marchandise revenue de rentrer en stock**
quand AppPos ne tournait pas. Retirées.

### Ce qui disparaît de l'écran, volontairement

Le voyant « API » du bandeau de caisse et le message « Connexion à AppPOS en
cours ou échouée » du panneau produits : il n'y a plus de lien réseau à
surveiller pour encaisser. Le bandeau dit désormais « Catalogue local ».

**Le canal WebSocket `useAppPosStockUpdates` n'est plus branché dans la
caisse.** Il recevait les changements de stock faits *dans* AppPos pour
rafraîchir les caches. Tant qu'AppPos vit encore en parallèle, ses propres
mouvements ne sont donc plus vus ici — c'est la conséquence directe de « une
seule source », et elle cesse d'exister quand AppPos sort.

**Vérifié :** `npx tsc -b` silencieux, `pnpm test` vert (135 cas, dont 8 neufs
sur la vente), Biome passé, les fichiers se transforment dans Vite. **NON
VÉRIFIÉ : l'écran, et c'est ici que ça compte le plus.** À faire avant
d'encaisser pour de vrai : scanner un code-barres connu, encaisser, et
contrôler le stock du produit sous `/stock/produits` ; créer un produit depuis
un code-barres inconnu et vérifier qu'il arrive au panier ; enfin annuler une
facture pour voir s'ouvrir le reclassement de retour.

## 6 undecies. Front F — le rechargement par purge est gardé, 19 août 2026

**PocketBase cesse d'être une projection.** `catalog-import -load` vidait les
quatre collections avant d'écrire ; c'était sans risque tant que NeDB portait
tout ce qu'on effaçait. Depuis le front E, c'est faux.

**`backend/catalog/load/guard.go`**, neuf. Avant toute écriture — avant même
l'ouverture du stockage —, il cherche trois traces d'une base vivante :

1. **des entités nées ici** — `legacy_id` préfixé `pa_` ;
2. **des mouvements de stock locaux** — `product_events` de source `sale`,
   `inventory_session`, `return`, `manual` ;
3. **des documents citant des produits** — factures, devis, commandes : les
   purger laisserait leurs lignes pointer vers des identifiants disparus.

Si l'une des trois existe, le chargement **s'arrête et nomme ce qui serait
perdu**. Passer outre demande `-force-purge`, écrit à la main ; la commande
affiche alors ce qu'elle vient de détruire.

### Ce que la garde trouve sur la base d'aujourd'hui

Mesuré le 19 août 2026, en exécutant `Inspect` sur une **copie** de
`pb_data/data.db` :

| Trace | Décompte |
|---|---|
| ventes | 513 |
| comptages d'inventaire | 735 |
| retours | 10 |
| factures | 1153 |
| devis | 63 |
| commandes | 16 |
| entités nées ici | **0** |

**Le rechargement était donc déjà destructeur, et rien ne le disait.** Une
commande de neuf mots aurait effacé 1258 mouvements et 1232 documents de
référence.

### Le piège du souligné, trouvé en vérifiant

`LIKE 'pa_%'` **sans `ESCAPE` traite le souligné comme un joker**. Une clé NeDB
ordinaire — `PAz78WYfCpbSWJay` — y répond, et la garde aurait bloqué une base
parfaitement reconstructible, en prétendant y voir une entité née dans
PocketApp. Le motif est extrait en constante `legacyKeyExpr`, échappé, et un
test le tient.

**Ce qui n'a PAS été fait, et pourquoi :** supprimer la purge. Une installation
neuve doit pouvoir charger son catalogue depuis un dossier AppPos, et une base
de test doit pouvoir être remise à zéro. Ce n'est pas la purge qui était
dangereuse, c'est son silence.

**Vérifié :** `go build ./backend/...` et `go test ./backend/catalog/...`
passent (6 cas neufs), `gofmt` propre, et `Inspect` a tourné **sur une copie de
la vraie base** — c'est ce qui a produit le tableau ci-dessus et révélé le piège
du souligné. **Non vérifié de bout en bout :** `catalog-import -load` s'arrête
avant la garde sur cette machine, à un contrôle antérieur — NeDB porte
3050 produits pour 3034 attendus, écart qui lui est propre et qui n'est pas de
mon ressort.

## 7. L'état — ce fichier tient le compte

**Les décisions sont au journal** (13 août 2026 : convergence, source explicite,
pas de double écriture, sortie d'AppPos, clé stable, export explicite).
**Les quatre entités sont branchées, lues et écrites depuis PocketBase**, et
vérifiées dans l'application (§6 quater).

**Le démêlage est fait** (§6 quinquies, 18 août 2026) : `ProductTable.tsx` et
`useStockModule.ts` ne portent plus qu'AppPos, `useUpdateProductUniversal` n'existe
plus, et le catalogue AppPos est passé en lecture seule.

**Fronts A et B faits** (§6 sexies) : l'import des images est complet et
mesuré, et l'écran catalogue est unique, sur PocketBase.

**Les images du catalogue sont complètes en lecture ET en écriture**
(§6 septies) — marques, catégories et produits, galerie exceptée.

**Front C fait** (§6 octies) : les sept écrans de choix produit de PocketConnect
cherchent dans PocketBase.

**Front D fait** (§6 nonies) : l'inventaire et le reclassement écrivent leur
stock dans PocketBase, par un chemin unique.

**Front E fait** (§6 decies) : la caisse lit, crée et décrémente dans
PocketBase. Le point dur du §6 est refermé.

**Front F fait** (§6 undecies) : le rechargement par purge est gardé.
PocketBase n'est plus une projection.

**Ce qui reste, et c'est tout** : `InventoryPageAppPos.tsx` lit encore son
catalogue dans AppPos — il n'y écrit plus rien. C'est le dernier écran, et le
dernier import de `@/lib/apppos` du module `stock`. Le point dur du §6 reste
entier, et il est maintenant chiffré : **53 produits** existent dans NeDB et pas
dans PocketBase, parce que la caisse crée toujours ses produits là-bas
(`modules/cash/CreateProductDialog.tsx`).

| # | Étape | État |
|---|---|---|
| 0 | Décisions du §4 consignées au journal | **fait le 13 août 2026** |
| 1 | Les 4 entités PocketBase affichées dans AppStock | **fait** — mesure (§6 bis), remise à niveau (§6 ter), branchement et vérification (§6 quater) |
| 2 | Édition depuis AppStock | **fait** pour les 4 entités ; images exclues |
| 3 | Couche de données unique | **fait le 18 août 2026** (§6 quinquies) — une seule provenance par fichier, routeur supprimé, gardé par un test. Reste hors périmètre : la caisse (`CreateProductDialog`) et l'inventaire (`InventoryPageAppPos`) parlent toujours à AppPos |
| 4 | Synchronisation et frontière public/interne | **en partie** : export explicite, état visible pour les 3 entités exportées |
| 5 | Images | **reporté, hors périmètre** |

## 8. Attentes de travail

Les mêmes que pour la mission précédente, et elles ont tenu :

- **français partout** ;
- **partir d'un fichier nommé et suivre ses imports**, ne pas explorer librement ;
- **distinguer ce qui est lu dans le code** — chemin et ligne — **de ce qui est
  rapporté**. Mesurer avant d'affirmer, et dire sur quelle base ;
- **vérifier dans l'application ou la base, pas en relisant son code** ;
- `npx tsc -b`, `pnpm biome check --write` sur ce qu'on touche, `pnpm test` ;
- **écrire un test pour toute règle qui n'a pas d'autre gardien** ;
- **perdre le fil vaut mieux que deviner** : le dire.

## 9. Rituel de fin de session

Mettre à jour le tableau du §7, et lui seul. Les constats nouveaux vont dans une
section datée de ce fichier ; les décisions vont dans `docs/DECISIONS.md`. **On
ne réécrit pas le §2** : c'est une mesure datée, pas un état courant.
