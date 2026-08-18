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

**La prochaine session** : front C du plan — `useCatalogProductSearch`, puis les
quatre écrans de choix produit de PocketConnect. Le point dur du §6 reste
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
