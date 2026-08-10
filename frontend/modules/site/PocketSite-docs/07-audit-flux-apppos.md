# Audit du flux de synchronisation AppPos ↔ WooCommerce

**Écrit le 10 août 2026.** Première session de la mission catalogue, telle que
la prévoit le §7 de [`06-rituel-catalogue.md`](06-rituel-catalogue.md). Ce
document ne produit **ni code, ni schéma SQL, ni tickets**.

**Base lue :** `I:\AppPOS\AppServe` — l'environnement **dev**, seul en
fonctionnement au moment de l'audit (vérifié : `:3000` tenu par
`node server.js` sous nodemon, aucun `C:\AppPOS\AppPOS.exe` actif). Voir §3.1
du rituel : **ce n'est pas la base de production.**

Trois niveaux de fiabilité, tenus :

- **constaté** — lu dans le code, chemin et ligne donnés ;
- **déclaré** — rapporté par le propriétaire ou par un document antérieur ;
- **non vérifié** — hypothèse explicite.

---

## 1. Le flux réel (question 5.1)

**Constaté.** Le flux n'est **pas** à sens unique. L'audit précédent déclarait
« AppPos écrit dans WooCommerce » ; c'est vrai dans le cas dominant, mais il
existe deux chemins d'écriture **de WooCommerce vers AppPos**, et ils ne sont
pas marginaux.

### 1.1 Sortant — AppPos → WooCommerce

Trois chemins distincts, qui ne produisent pas les mêmes données :

| Chemin | Entrée | Mapping utilisé |
|---|---|---|
| Stratégie | `ProductSync.syncToWooCommerce` ([ProductSync.js:351](../../../../../AppPOS/AppServe/services/sync/ProductSync.js)) | `_mapLocalToWooCommerce`, l. 15-71 |
| Script | `syncUpdatedProducts` ([syncUpdatedProducts.js:139](../../../../../AppPOS/AppServe/services/sync/syncUpdatedProducts.js)) | mapping écrit à la main, l. 139-157 |
| Middleware | `syncWithWooCommerce` ([wooSyncMiddleware.js:141](../../../../../AppPOS/AppServe/middleware/wooSyncMiddleware.js)) | projection partielle, l. 154-172 |

Les trois divergent. Le script n'envoie ni `slug`, ni `images`, ni
`stock_status` ; le mapping de la stratégie envoie les trois. **Le résultat
dépend du bouton cliqué**, pas de l'état des données.

### 1.2 Entrant — WooCommerce → AppPos

- `_updateLocal` ([ProductSync.js:480-561](../../../../../AppPOS/AppServe/services/sync/ProductSync.js))
  réécrit après chaque `PUT`/`POST` : `woo_id`, `website_url`, `image`,
  `gallery_images`, `manage_stock`, `stock_status`, et **`stock`** quand
  `manage_stock` est vrai (l. 552-554). **WooCommerce est donc autorité sur le
  stock d'AppPos dans ce mode**, ce qui contredit le §5.5 du rituel.
- `syncMissingWooIds` et `syncProductBySku`
  ([wooSyncController.js:356](../../../../../AppPOS/AppServe/controllers/wooSyncController.js)
  et l. 512) écrivent `woo_id`, `website_url`, `status`, `image`,
  `gallery_images` depuis Woo, en appariant **par SKU**.

**Autorité réelle, constatée :** AppPos sur la saisie, les prix et les
relations ; **WooCommerce sur les identifiants, les URL, les `wp_id` d'images,
et le stock en mode automatique.** C'est un partage, pas une autorité unique.

### 1.3 Images

Le lien avec la médiathèque est `WordPressImageSync.uploadToWordPress`
([WordPressImageSync.js:19-49](../../../../../AppPOS/AppServe/services/image/WordPressImageSync.js)),
appelé par `_syncPendingImages` ([ProductSync.js:376-478](../../../../../AppPOS/AppServe/services/sync/ProductSync.js)).

**Constaté, et c'est simple :**

- `POST /wp-json/wp/v2/media`, authentification **Basic** avec
  `WP_USER` / `WP_APP_PASSWORD` (mot de passe d'application WordPress) ;
- l'upload renvoie `{ id, url }`, où `url` est le **`source_url` de WordPress**
  (l. 40) — c'est-à-dire l'URL de la médiathèque, telle quelle ;
- c'est cette valeur qui est stockée localement en `image.url` et
  `gallery_images[].url`.

**Les URL d'images sont donc produites par WordPress et seulement recopiées par
AppPos.** La décision du propriétaire — elles ne bougent pas — est tenable
sans aucune contrainte sur la mission : la projection SQL n'a qu'à recopier le
champ `url` existant. **Aucun ré-upload, aucune réécriture d'URL.**

Points de fragilité, constatés mais **hors périmètre catalogue** :

- `_resolveImagePath` (l. 55-107) essaie quatre formes de chemin puis une
  cinquième « alternative » (l. 131-157). Cette accumulation de rattrapages dit
  que les chemins stockés ne sont pas homogènes ;
- l'échec d'un upload est avalé par `_syncPendingImages`
  ([ProductSync.js:400-402](../../../../../AppPOS/AppServe/services/sync/ProductSync.js)) :
  le produit part alors vers WooCommerce **sans l'image**, sans erreur remontée ;
- les logs sont conditionnés à `DEBUG_WP_SYNC` (l. 24, 44) : par défaut,
  **une erreur d'upload ne laisse aucune trace**.

### 1.4 Comment AppPos choisit son répertoire de données

**Constaté** — [PathManager.js:8-23](../../../../../AppPOS/AppServe/utils/PathManager.js).
Ceci répond à la question laissée ouverte au §3.1 du rituel :

```js
this.isProduction  = process.env.NODE_ENV === 'production';
this.isElectronApp = !!process.env.ELECTRON_ENV || !!process.versions.electron;
this.useAppData    = this.isProduction && this.isElectronApp;

basePath = useAppData
  ? path.join(os.homedir(), 'AppData', 'Roaming', 'AppPOS')   // production
  : process.cwd();                                            // développement
```

Les deux conditions doivent être vraies **ensemble**. Cela confirme les deux
bases du §3.1 du rituel, et ajoute un avertissement : en développement, la base
est **`process.cwd()`**, pas un chemin ancré au fichier. **Lancer le serveur
depuis un autre répertoire le fait travailler sur une autre base — ou en créer
une vide.** À garder en tête pour toute mesure faite en ligne de commande.

*Note :* les trois branches ternaires des l. 26-32 produisent la même valeur
des deux côtés. Sans effet, mais révélateur d'une refonte laissée à mi-chemin.

---

## 2. Ce qui déclenche une synchronisation (question 5.2)

**Constaté.** Quatre déclencheurs, dont un seul est automatique.

1. **Manuel, par entité** — `POST /products/:id/sync`, `/categories/:id/sync`,
   `/brands/:id/sync` ([wooSyncRoutes.js:9-38](../../../../../AppPOS/AppServe/routes/wooSyncRoutes.js)).
2. **Manuel, par lot** — `POST /products/sync`, sur `pending_sync: true`.
3. **Manuel, complet** — `POST /products/sync/force` (voir §3.1 : **inopérant**).
4. **Automatique** — le middleware, mais uniquement si `options.forceSync` est
   posé **ou** si l'appelant passe `?sync=true`
   ([wooSyncMiddleware.js:102](../../../../../AppPOS/AppServe/middleware/wooSyncMiddleware.js)).

**Aucune minuterie. Aucun `cron`.** Rien ne rattrape ce qui a échoué : la
synchronisation ne se produit que si quelqu'un clique.

### 2.1 Qui pose `pending_sync: true`

**Constaté.** Six emplacements, tous gardés par **la même condition** — la
présence d'un `woo_id`.

| Emplacement | Condition |
|---|---|
| [productService.js:158](../../../../../AppPOS/AppServe/services/productService.js) | `if (existing.woo_id)` |
| [BaseController.js:86](../../../../../AppPOS/AppServe/controllers/base/BaseController.js) — update générique | `if (existing.woo_id)` |
| [categoryService.js:134](../../../../../AppPOS/AppServe/services/categoryService.js) | `if (category.woo_id)` |
| [BaseImageController.js:49, 83, 136](../../../../../AppPOS/AppServe/controllers/image/BaseImageController.js) — upload, suppression, métadonnées d'image | `if (item?.woo_id)` |
| [productBatchController.js:59 et 150](../../../../../AppPOS/AppServe/controllers/product/productBatchController.js) | `product.woo_id ? true : product.pending_sync` |
| [ImageService.js:416](../../../../../AppPOS/AppServe/services/image/ImageService.js) | `if (options.localOnly && item.woo_id)` |

S'y ajoutent trois scripts ponctuels — `scripts/cleanWooImageRefs.js:245`,
`scripts/fixCategoryWooIds.js:146`, `scripts/update-database.js:216` — qui le
posent en masse, le dernier sur la seule présence de la clé.

### 2.2 Le drapeau ne signifie pas ce que son nom laisse croire

**Constaté, et c'est le résultat principal de cette section.**

`pending_sync` n'est **jamais** posé sur une entité sans `woo_id`. Sans
exception, dans les six emplacements ci-dessus.

Or les deux chemins de synchronisation par lot filtrent exactement là-dessus :

- `syncAllUpdatedProducts` ne traite que `pending_sync: true`
  ([wooSyncController.js:102](../../../../../AppPOS/AppServe/controllers/wooSyncController.js)) ;
- `syncUpdatedProducts` exclut explicitement les produits sans `woo_id`
  ([syncUpdatedProducts.js:102](../../../../../AppPOS/AppServe/services/sync/syncUpdatedProducts.js)).

**Les deux ignorent donc, par construction, tout ce qui n'a jamais été publié.**

`pending_sync` n'est pas un drapeau « à publier » : c'est un drapeau « **déjà
publié, et modifié depuis** ». **L'état « jamais publié, à publier » n'existe
pas dans le modèle.** La seule sortie prévue est manuelle et entité par entité
(`sync-by-sku`, `sync-missing-woo-ids`), et elle ne réussit que si l'entité
existe déjà côté WooCommerce avec le même SKU.

Conséquence pour le §5.4 du rituel : **l'hypothèse « ce sont des entrées jamais
synchronisées, une resynchronisation les remplirait » est fausse.** Le système
est conçu pour ne jamais les rattraper. Ce n'est pas une panne, c'est le
modèle.

*Corollaire, constaté :* [productController.js:152-154](../../../../../AppPOS/AppServe/controllers/product/productController.js)
crée les produits dupliqués avec `woo_id: null, pending_sync: false`. **Tout
produit dupliqué naît invisible pour la synchronisation, définitivement.**

---

## 3. Les causes de désynchronisation

Classées par gravité. Toutes **constatées**.

### 3.1 — `forceSync` échoue en silence en annonçant un succès

[syncUpdatedProducts.js:11-13](../../../../../AppPOS/AppServe/services/sync/syncUpdatedProducts.js) :
`path.join(__dirname, 'data', 'products.db')` résout vers
`AppServe\services\sync\data\products.db`. **Vérifié : le dossier n'existe
pas.** Le `readFile` jette, le `catch` global (l. 195) renvoie
`{success:false}`, et [wooSyncController.js:161-167](../../../../../AppPOS/AppServe/controllers/wooSyncController.js)
répond quand même « Synchronisation forcée lancée », `products_synced:
undefined`.

**La resynchronisation complète ne fonctionne pas, et l'interface affiche que
si.** C'est très probablement l'explication du sentiment de désynchro : le
recours censé tout remettre d'aplomb n'a jamais rien fait.

### 3.2 — `handleFullSync` supprime sur WooCommerce d'après une page

[ProductSync.js:570-599](../../../../../AppPOS/AppServe/services/sync/ProductSync.js),
et à l'identique dans [CategorySync.js:126](../../../../../AppPOS/AppServe/services/sync/CategorySync.js)
et [BrandSync.js:101](../../../../../AppPOS/AppServe/services/sync/BrandSync.js) :

```js
client.get(this.endpoint, { per_page: 100 })   // pas de pagination
await this._deleteNonExistent(wc.data, local, client, results)
```

`_deleteNonExistent` supprime **définitivement** (`force: true`), médias
compris, tout élément Woo sans correspondance locale — sur un échantillon
arbitraire de 100. Puis il boucle sur les produits locaux : les **1462 lignes
sans `woo_id`** relevées dans la base dev seraient toutes envoyées en `POST`,
donc **créées en double** si elles existent déjà côté Woo sous un autre
identifiant.

Ce chemin s'atteint par `syncToWooCommerce()` **sans argument**
([ProductWooCommerceService.js:20-22](../../../../../AppPOS/AppServe/services/ProductWooCommerceService.js)).
Aucune route ne l'appelle ainsi aujourd'hui — **c'est un piège armé, pas une
panne active.**

*Point rassurant, vérifié :* `woo_id` est stocké en **nombre** partout où il
est présent (847 valeurs, 0 chaîne, sur les 4000 premières lignes de la base
dev). La comparaison stricte `p.woo_id === item.id` ne provoque donc pas de
suppression de masse par écart de type. Comptage indicatif seulement : NeDB est
append-only, une ligne n'est pas un document.

### 3.3 — La synchronisation automatique est cassée par une erreur de langage

[wooSyncMiddleware.js:144-150](../../../../../AppPOS/AppServe/middleware/wooSyncMiddleware.js) :

```js
const productWithImages = product;        // l. 144
...
productWithImages = await Product.findById(product._id);   // l. 150
```

Réaffectation d'un `const` → `TypeError`, avalé par le `catch` l. 183 qui
renvoie `{success:false}`. **Tout produit dont l'objet transmis n'a pas à la
fois `image` et `gallery_images` échoue silencieusement en synchro
automatique.**

### 3.4 — Un échec ne laisse aucune trace exploitable

[wooSyncController.js:129-141](../../../../../AppPOS/AppServe/controllers/wooSyncController.js) :
l'erreur est poussée dans un tableau renvoyé au client, et c'est tout.
`pending_sync` **n'est jamais remis à `true`**, aucune erreur n'est écrite en
base, aucune reprise n'est programmée. Un produit qui échoue est oublié jusqu'à
sa prochaine modification manuelle.

Le middleware est pire : la synchro y est lancée depuis un `res.send`
détourné, **sans `await`, après que la réponse est partie**
([wooSyncMiddleware.js:94-127](../../../../../AppPOS/AppServe/middleware/wooSyncMiddleware.js)).
L'échec ne va qu'à la console.

### 3.5 — Le script réécrit la base NeDB à la main

[syncUpdatedProducts.js:202-237](../../../../../AppPOS/AppServe/services/sync/syncUpdatedProducts.js) :
lecture du fichier entier, `JSON.parse` ligne à ligne, `writeFile` de tout le
fichier — sans passer par le modèle, pendant que NeDB tourne avec sa copie en
mémoire et son journal append-only. Toute écriture concurrente est perdue ; une
coupure en plein `writeFile` tronque la base. Même contournement l. 18 et 50
pour les catégories et les marques.

Inopérant aujourd'hui à cause de 3.1 — donc **inoffensif tant que 3.1 n'est pas
corrigé**. Corriger 3.1 sans corriger 3.5 armerait cette bombe-là.

### 3.6 — Filtre incrémental fragile

[syncUpdatedProducts.js:101-118](../../../../../AppPOS/AppServe/services/sync/syncUpdatedProducts.js) :
comparaison `updated_at > last_sync`, deux horloges locales, sans marge ; et
l. 102, **tout produit sans `woo_id` est exclu**. Les produits jamais
synchronisés ne le seront jamais par ce chemin.

### 3.7 — Effets de bord de la synchro hiérarchique des catégories

[ProductSync.js:87-261](../../../../../AppPOS/AppServe/services/sync/ProductSync.js) :
synchroniser **un produit** peut créer des catégories et des marques sur
WooCommerce (l. 135, 162, 185, 230, 268), avec quatre tentatives successives et
une boucle `while` bornée à 10 niveaux. En sortie, si rien n'a marché, le
produit est rangé dans **la catégorie Woo n° 1 en dur** (l. 260) — de même dans
le script, l. 35.

C'est le mécanisme qui fabrique le désordre décrit au §5.4 du rituel : des
catégories créées à la volée, dans un ordre dépendant des échecs réseau.

### 3.8 — Détails qui coûteront cher plus tard

- `getPendingSync` charge tous les produits en mémoire pour en filtrer trois
  ([wooSyncController.js:50-53](../../../../../AppPOS/AppServe/controllers/wooSyncController.js)) ; idem catégories et marques.
- [wooSyncMiddleware.js:80](../../../../../AppPOS/AppServe/middleware/wooSyncMiddleware.js)
  lit `result.data[0].woo_id` sans garde : une réponse à `data` vide renvoie un
  **500 alors que la synchronisation a réussi**.
- `syncProduct` transmet `{_id: productId}`, un objet-souche
  ([wooSyncController.js:20](../../../../../AppPOS/AppServe/controllers/wooSyncController.js)).
  Ça fonctionne uniquement parce que `_syncPendingImages` recharge le produit
  complet ([ProductSync.js:477](../../../../../AppPOS/AppServe/services/sync/ProductSync.js)).
  **Correct par accident** : toute réécriture de cette méthode casse la route.
- Identifiants WooCommerce et WordPress lus dans l'environnement
  ([WooCommerceClient.js:8-10 et 33-35](../../../../../AppPOS/AppServe/services/base/WooCommerceClient.js)) —
  côté AppPos, c'est correct. La faille 3.1 de l'audit précédent concerne le
  **bundle du site**, pas ce fichier.

---

## 4. Ce que `SyncStrategy` vaut comme point d'appui

Le §4 du rituel voyait dans `SyncStrategy.js` le signal le plus encourageant de
l'inventaire. **Vérification faite : à moitié.**

L'abstraction existe ([SyncStrategy.js](../../../../../AppPOS/AppServe/services/base/SyncStrategy.js), 87 lignes)
et une seconde stratégie « publier vers SQL » y est structurellement possible.
Mais la classe de base est trop mince pour qu'on s'y greffe telle quelle :

- l. 25-27, sur création, `entity.woo_id = response.data.id` est posé **en
  mémoire seulement** — jamais persisté. Les trois stratégies concrètes
  redéfinissent `syncToWooCommerce` pour rattraper ce défaut
  ([ProductSync.js:363](../../../../../AppPOS/AppServe/services/sync/ProductSync.js),
  [CategorySync.js:95](../../../../../AppPOS/AppServe/services/sync/CategorySync.js)).
  **La classe de base est donc du code mort dangereux** : quiconque l'utilise
  sans la redéfinir fabrique des doublons ;
- aucune notion de reprise, de journal, ni de transaction ;
- `syncEntityList` (l. 50-84) pousse entité par entité et considère le lot
  `success: true` même quand tout a échoué (l. 79).

**Conclusion : durcir avant de brancher, pas après.**

---

## 4 bis. Les règles d'intégrité relationnelle

*Section ajoutée après coup — numérotée ainsi pour ne pas décaler les renvois
existants.*

Deux fichiers portent ces règles :
[`relationService.js`](../../../../../AppPOS/AppServe/services/relationService.js) (167 l.)
et [`dependencyValidationService.js`](../../../../../AppPOS/AppServe/services/dependencyValidationService.js) (177 l.).

### 4bis.1 Les règles, telles qu'écrites

**Constaté.** Toutes sont des règles de **suppression**, aucune n'est une règle
de publication :

| Règle | Où |
|---|---|
| Une marque avec produits liés n'est pas supprimable | `relationService.js:114-118`, `dependencyValidationService.js:165` |
| Un fournisseur avec produits liés non plus | `relationService.js:137-141`, `dependencyValidationService.js:160` |
| Un fournisseur dont une marque a des produits non plus | `dependencyValidationService.js:112-148` |
| Une catégorie avec sous-catégories n'est pas supprimable | `dependencyValidationService.js:93-110` |
| Une catégorie avec produits liés non plus | `dependencyValidationService.js:20-27` |

**Rien n'interdit une donnée incomplète.** Aucune règle n'exige un `slug`, un
`sku`, une catégorie, ni un prix. C'est cohérent avec le §5.4 du rituel : les
champs manquants ne sont bloqués nulle part, donc ils manquent.

### 4bis.2 Deux implémentations de la même règle

**Constaté.** `checkProductDependencies` existe **deux fois**, avec des
sémantiques différentes :

- [relationService.js:7-14](../../../../../AppPOS/AppServe/services/relationService.js) —
  un `db.products.count({ [`${entityType}_id`]: entityId })` direct sur NeDB ;
- [dependencyValidationService.js:8-55](../../../../../AppPOS/AppServe/services/dependencyValidationService.js) —
  une classe qui, **pour les catégories seulement**, teste aussi l'appartenance
  au tableau `product.categories` (l. 22-26).

La première ne verrait donc pas un produit rattaché à une catégorie par le
tableau plutôt que par `category_id`. Elle n'est appelée que pour les marques
et fournisseurs, où le cas ne se pose pas — **mais les deux coexistent, et rien
ne dit laquelle fait foi.**

### 4bis.3 Le point qui concerne directement la projection SQL

**Constaté, et c'est le résultat de cette section.** Les relations sont
**dupliquées dans les deux sens et maintenues à la main** :
`brand.suppliers` + `brand.suppliersRefs` d'un côté, `supplier.brands` +
`supplier.brandsRefs` de l'autre
([relationService.js:34-62](../../../../../AppPOS/AppServe/services/relationService.js)).

Pire, `suppliersRefs`/`brandsRefs` ne sont pas de simples listes d'identifiants :
elles **recopient des champs de l'entité liée** — l. 44-50, `supplier.brandsRefs`
embarque `name`, `woo_id`, `pending_sync` et `products_count` de la marque.
**Ces copies ne sont jamais rafraîchies** quand la marque change ; elles ne le
sont qu'à la prochaine écriture de la relation.

Trois conséquences :

1. **Ces champs recopiés sont périmés par construction.** La projection SQL ne
   doit **jamais** les lire — seulement `brand.suppliers` / `supplier.brands`,
   puis résoudre depuis l'entité elle-même.
2. **Aucune transaction.** `addBrandToSupplier` fait deux `update` successifs
   (l. 54 et 59) ; un échec entre les deux laisse une relation **unilatérale**,
   sans détection ni réparation. Même schéma à la suppression.
3. **Aucune intégrité au niveau du stockage.** NeDB n'a pas de clé étrangère :
   ces règles ne valent que si l'on passe par ces services. Tout chemin
   d'écriture direct les contourne — et il en existe (§3.5, et les contrôleurs
   par lot).

**Pour la mission :** la base SQL, elle, *peut* porter ces contraintes. Mais
elle refusera alors les données qu'AppPos accepte aujourd'hui. **Comptabiliser
les relations unilatérales et les références orphelines est un préalable à
toute contrainte `FOREIGN KEY`** — à défaut, la première publication échouera
en bloc, et la règle « tout ou rien » la fera échouer entièrement.

### 4bis.4 Mesure — l'état réel des références

**Constaté**, par reconstruction de l'état courant NeDB (dernière ligne par
`_id`, `$$deleted` retirés) le 10 août 2026. Script de lecture seule, aucune
écriture.

**Base de référence : la dev** (`I:\AppPOS\AppServe\data`) — la production
n'est pas à jour, décision du propriétaire (§3.1 du rituel). Colonne
production donnée pour comparaison seulement.

| | dev | prod |
|---|---:|---:|
| produits / catégories / marques / fournisseurs | 2306 / 219 / 224 / 34 | 3034 / 463 / 287 / 43 |

**Références orphelines — très peu :**

| Contrôle | dev | prod |
|---|---:|---:|
| `brand_id` inexistant | **4** | 0 |
| `supplier_id` inexistant | 0 | 0 |
| `category_id` inexistant | **4** | 4 |
| entrées `categories[]` inexistantes | **4** | 4 |
| `parent_id` de catégorie inexistant | 0 | 0 |
| `category_id` absent de `categories[]` | 0 | 0 |

Les 4 références de catégorie pointent toutes vers **un seul identifiant
fantôme**. C'est un incident isolé, pas une dérive.

**Relations marque ↔ fournisseur — saines :**

| Contrôle | dev | prod |
|---|---:|---:|
| liens déclarés marque → fournisseur | 230 | 295 |
| liens déclarés fournisseur → marque | 229 | 292 |
| **unilatéraux** marque → fournisseur | **1** | 1 |
| unilatéraux fournisseur → marque | 0 | 0 |
| pointant vers une entité inexistante | 2 + 2 | 2 + 0 |

**Le défaut d'atomicité de §4bis.3 est réel mais n'a presque jamais frappé :
1 relation unilatérale.** La contrainte `FOREIGN KEY` est donc **abordable** —
une dizaine de corrections, pas un chantier.

**En revanche, les copies dénormalisées sont massivement périmées :**

| Contrôle | dev | prod |
|---|---:|---:|
| `supplier.brandsRefs` divergents de la marque réelle | **165 / 205** | 239 / 255 |
| `brand.suppliersRefs` divergents | 0 / 205 | 0 / 203 |
| marques dont `products_count` est faux | **21 / 224** | 21 / 287 |

**80 % des `brandsRefs` mentent.** La conclusion de §4bis.3 est donc confirmée
par la mesure, et devient une règle : **la projection SQL ne lit jamais
`brandsRefs`, ni `products_count`.** Elle résout depuis l'entité et recompte.

**Aptitude à la publication — c'est ici que ça bloque :**

| Contrôle | dev | prod |
|---|---:|---:|
| catégories sans `slug` | **190 / 219** | 433 / 463 |
| catégories sans `woo_id` | 101 / 219 | 254 / 463 |
| marques sans `slug` | 22 / 224 | 85 / 287 |
| produits sans `woo_id` | **1459 / 2306** | 506 / 3034 |
| produits sans `website_url` | 1459 / 2306 | 506 / 3034 |
| produits sans `sku` | 3 / 2306 | 129 / 3034 |
| produits `pending_sync: true` | 20 | 7 |
| SKU en doublon local | **7** | 33 |

> **Ces chiffres ne se lisent pas comme des défauts.** Voir §4bis.6, qui les
> corrige : la présence d'un `woo_id` **signifie « en ligne »**, pas
> « synchronisé ». Le paragraphe qui suivait ici — « la majorité du catalogue
> n'a aucun chemin vers la publication » — **était une erreur d'interprétation
> de ma part** ; il est remplacé par §4bis.6.

### 4bis.6 Correction — `woo_id` signifie « en ligne », pas « synchronisé »

**Rapporté par le propriétaire le 10 août 2026, puis vérifié dans les données.**
C'est la clé de lecture qui manquait à tout ce qui précède :

- **tout n'a pas vocation à être en ligne.** La base est le catalogue du
  magasin, pas celui du site ;
- pour un produit, `status: 'published'` exprime l'intention, et la présence de
  **`woo_id` / `website_url` constate qu'il est en ligne** ;
- **une catégorie est en ligne parce qu'elle contient un produit publié**, et
  c'est automatique. Les catégories n'ont aucun champ de statut propre
  (`_id`, `name`, `parent_id`, `level`, `woo_id`, `last_sync`, `image`,
  `pending_sync`) : leur mise en ligne est **dérivée**, jamais saisie.

**Vérifications, base dev :**

| Contrôle | Résultat |
|---|---|
| produits avec `woo_id` **et** `website_url` | 847 |
| avec l'un sans l'autre | **0** |
| catégories en ligne (`woo_id`) | 118 |
| attendues d'après les produits **en ligne** + leurs ancêtres | 117 |
| catégories manquantes | **0** |
| catégories en ligne sans justification | **1** |

**Les deux invariants tiennent.** `woo_id` et `website_url` décrivent
exactement le même ensemble de produits, et la mise en ligne des catégories est
bien dérivée de celle des produits, à une catégorie près.

**Relecture des chiffres du tableau précédent :**

| Lu d'abord comme | Est en réalité |
|---|---|
| 1459 produits « sans chemin vers la publication » | **1237 en `draft`** — hors ligne **voulu**, ce n'est pas un trou |
| — | **222 en `published` mais hors ligne** ← **le seul vrai écart** |
| 5 produits `draft` avec `woo_id` | en ligne alors qu'ils sont marqués hors ligne : anomalie réelle, faible |
| 190 catégories sans slug | dont la plupart n'ont pas vocation à être en ligne |

**Conclusion révisée.** L'intégrité relationnelle est saine (§4bis.4) **et** le
modèle de mise en ligne est cohérent. La dérive réelle tient en deux nombres :
**222 produits publiés mais absents du site**, et **5 produits en ligne malgré
un `draft`**. C'est exactement ce que prédisait §2.2 : rien ne rattrape une
entité sans `woo_id`, donc un produit passé en `published` sans synchronisation
réussie y reste indéfiniment.

**Ce que ça impose au contrat de données**, et qui devient la question
centrale : la projection SQL ne peut plus déduire « en ligne » de la présence
d'un `woo_id`, puisque `woo_id` disparaît avec WooCommerce.

- pour les **produits**, `status: 'published'` suffit et existe déjà ;
- pour les **catégories**, **rien n'existe**. La règle « contient un produit
  publié » devra être **recalculée par la projection**, ancêtres compris — elle
  n'est aujourd'hui portée par aucun champ, seulement par l'état de fait de
  WooCommerce. **C'est le seul mécanisme que la sortie de WooCommerce détruit
  sans remplaçant.**

Reste ouvert : les **8 catégories** qui contiennent un produit `published` sans
être en ligne. Elles ne sont pas une anomalie séparée — elles découlent des 222.

### 4bis.5 Faisabilité des slugs générés et du `_id` comme clé

Mesuré le 10 août 2026 sur la base **dev**, en lecture seule, à la suite de la
décision « Les slugs sont fabriqués par nous, la clé de référence est le `_id`
NeDB » ([`docs/DECISIONS.md`](../../../../docs/DECISIONS.md)).

**Collisions d'une génération naïve depuis `name` :**

| | possèdent déjà un slug | en collision |
|---|---:|---:|
| produits (2306) | 307 | **28** sur 12 groupes |
| catégories (219) | 29 | **23** sur 11 groupes |
| marques (224) | 202 | **8** sur 4 groupes |

Volumes faibles, donc **la génération est faisable**. Mais les collisions de
catégories sont structurelles, pas accidentelles : « Accessoires » et
« Micro HF » existent à deux endroits différents de l'arbre. **Le slug de
catégorie devra intégrer le parent**, pas un suffixe numérique.

**Les deux `_generateSlug` existants d'AppPos ne sont pas réutilisables tels
quels.** Ils divergent sur **8 noms de marque sur 224**, et celui de
[ProductSync.js:73](../../../../../AppPOS/AppServe/services/sync/ProductSync.js)
a deux défauts constatés — `\w` conserve le tiret bas, et `.trim()` ne retire
que les espaces :

| nom | `ProductSync` | `BrandSync` |
|---|---|---|
| `J.N GUITAR` | `jn-guitar` | `j-n-guitar` |
| `K&M` | `km` | `k-m` |
| `Keeley ` | `keeley-` ← tiret final | `keeley` |

**Le `_id` tient comme clé, avec une réserve :**

- **aucun doublon**, sur les trois collections ;
- mais **l'espace d'identifiants n'est pas homogène** : longueurs de 8 à 30
  caractères, et **50 catégories sur 219 portent un identifiant écrit à la main**
  de la forme `cat_12_cordes_acoustique`, `cat_banjos` — au lieu du format NeDB
  aléatoire (`00DVhER6e8pIHQMr`). Les produits et les marques, eux, sont
  homogènes.

Conséquences pour le schéma SQL : colonne **`VARCHAR(32)`**, pas `CHAR(16)` ;
et **ne jamais supposer un format d'identifiant**. Les `cat_*` contiennent des
tirets bas, donc un `_id` ne peut pas servir de slug d'URL tel quel — ce sont
bien deux champs distincts.

---

## 5. Réponses aux questions 5.1 à 5.5

| | Réponse | Fiabilité |
|---|---|---|
| **5.1** sens du flux | bidirectionnel, autorité partagée (§1) | constaté |
| **5.2** déclencheurs | 4, dont 3 manuels ; aucune minuterie (§2) | constaté |
| **5.2 bis** qui pose `pending_sync` | 6 emplacements, tous conditionnés à `woo_id` ; le drapeau signifie « déjà publié et modifié depuis » (§2.1, §2.2) | constaté |
| **5.3** forme des données | mappings constatés en §1.1 ; les **décomptes du rituel restent à refaire sur la base de production** | partiel |
| **5.4** champs manquants | **la question elle-même était mal posée** : `woo_id` absent signifie « pas en ligne », état voulu dans 1237 cas sur 1459. Le vrai écart est de **222 produits** (§4bis.6) | constaté |
| **5.5** ce qui reste chez AppPos | à corriger : Woo est aujourd'hui autorité sur `stock` en mode automatique (§1.2) | constaté |

---

## 6. Ce qui reste ouvert

Listé, pas comblé au plausible.

1. ~~Qui pose `pending_sync: true`.~~ **Répondu** — voir §2.1 et §2.2.
   Reste ouvert à la marge : `productBatchController` a son propre chemin
   d'écriture, non lu au-delà des deux lignes citées.
2. ~~Les décomptes, avec déduplication NeDB.~~ **Faits** — voir §4bis.4. Ouvre
   à la place : **pourquoi la production contient 3034 produits et la dev 2306**,
   alors que la production est déclarée non à jour. Non expliqué.
3. **Combien de produits existent en double sur WooCommerce aujourd'hui**,
   conséquence attendue de §3.2 et §3.7. Mesurable par SKU côté Woo.
4. ~~Ce que fait `WordPressImageSync` exactement.~~ **Répondu** — voir §1.3.
   Les URL viennent du `source_url` WordPress ; la projection SQL n'a qu'à les
   recopier. Reste ouvert : **combien d'images ont un `url` mais pas de fichier
   local résoluble**, conséquence attendue des rattrapages de chemin (§1.3).
5. ~~`services/relationService.js` et `dependencyValidationService.js`, puis la
   mesure des relations unilatérales et références orphelines.~~ **Répondu et
   mesuré** — §4 bis et §4bis.4. Reste ouvert : **qui fabriquera les `slug`**,
   maintenant que WooCommerce sort du circuit. C'est la question n°1 du contrat
   de données.
6. **La recherche côté site** (§5.6 du rituel) — toujours sans remplaçant.

---

## 7. Ce que cet audit implique pour la base SQL

Sans anticiper le découpage, trois constats orientent le contrat à écrire.

**Le modèle actuel est incrémental et sans reprise, et c'est ce qui le fait
dériver.** L'état de la synchronisation vit dans deux drapeaux (`pending_sync`,
`last_sync`) que personne ne répare quand ça casse (§3.4), avec un recours de
remise à plat qui ne fonctionne pas (§3.1). La dérive n'est pas un accident du
réseau : elle est structurelle.

**Et il ne sait pas représenter « jamais publié ».** §2.2 : `pending_sync`
suppose un `woo_id` préexistant, donc une entité déjà connue du site. Une
projection SQL qui reprendrait ce drapeau hériterait du même angle mort — et
c'est précisément l'angle mort qui rend aujourd'hui une partie du catalogue
invisible. Une projection complète n'a pas ce problème : elle ne distingue pas
« déjà publié » de « jamais publié », elle publie l'état courant.

**La leçon de la mission menu s'applique telle quelle** : *publier est tout ou
rien*. Une projection complète, atomique et versionnée vers SQL n'a besoin
d'aucun drapeau, ne peut pas créer de doublon, et se réconcilie en la
republiant. C'est exactement l'inverse du modèle actuel.

**Ne pas reproduire les suppressions distantes déduites d'une page.** §3.2 est
le défaut le plus dangereux de tout l'inventaire. Une projection en lecture
seule vers une base SQL dédiée le rend structurellement impossible — c'est un
argument de plus pour ce sens-là plutôt qu'un flux d'écriture.

**Rappel de cadre :** rien de ce qui est décrit ici n'a été corrigé. Le §0 du
rituel interdit toute modification pendant cette phase, et les défauts 3.1,
3.3 et 3.5 concernent du code qui fait tourner la caisse.
