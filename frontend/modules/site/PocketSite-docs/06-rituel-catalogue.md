# Rituel de reprise — sortir le catalogue de WooCommerce

**Écrit le 10 août 2026, à la fin de la mission « menu ».** Ce fichier est le
point d'entrée de la mission suivante. Il ne la commence pas : il dit par où
commencer, et ce qu'il ne faut pas refaire.

---

## 0. Avant tout — la contrainte de cette phase

**Aucune modification de code.** Ni dans PocketApp, ni dans AppPos, ni sur le
site. La phase qui vient est une **analyse**, et elle produit des documents.

Le module `site` de PocketApp (AppSite) **n'est pas touché** : il fonctionne, il
est en production, et la mission catalogue ne le concerne pas encore.

La règle qui vaut pour toute la mission, héritée de la précédente : **on ne
modifie pas AppPos tant que le flux actuel n'est pas documenté.** AppPos fait
tourner la caisse. C'est le maillon le moins négociable du dépôt.

---

## 1. L'objectif, en une phrase

Qu'AppPos publie **produits, catégories, marques** vers une base SQL sur le
serveur IONOS, et que le site les lise de là plutôt que de WooCommerce.

Les **URL d'images ne bougent pas** : elles restent stockées et référencées
comme aujourd'hui. C'est une décision du propriétaire, prise le 10 août 2026, et
elle simplifie beaucoup — la médiathèque est le seul service que WordPress rend
réellement (§4.6 de l'audit).

---

## 2. Ce que la mission « menu » a établi, et qu'il ne faut pas réétudier

Neuf tickets, terminés le 10 août 2026. Ce qui en ressort et qui s'applique
directement à la mission suivante :

| Acquis | Où c'est écrit |
|---|---|
| Le contrat est ce qui coûte cher, pas le stockage | §4.4 de `03-audit-resultats.md` |
| L'intelligence va du côté qui se redéploie facilement | idem, et §3 de `05-contrat-menu.md` |
| Le code serveur se versionne dans `server/` de ce dépôt | `docs/DECISIONS.md` |
| Une clé par usage, jamais partagée entre services | idem, bloc « Clé de publication dédiée » |
| Le secret vit dans un fichier hors dépôt, avec un exemple à côté | `server/README.md` |
| L'écriture distante doit être atomique | `server/api/publish-menu.php` |
| Un consommateur refuse une version de format qu'il ne connaît pas | §5 de `05-contrat-menu.md` |
| L'hébergeur rejette l'agent utilisateur par défaut de Go | `CLAUDE.md`, contraintes |
| Publier est **tout ou rien** — pas de publication partielle | `frontend/modules/site/lib/publish-menu.ts` |

**La démarche à reproduire, dans cet ordre** — c'est elle qui a fonctionné :

1. **Auditer le flux réel** avant de proposer quoi que ce soit, en distinguant
   ce qui est *lu dans le code* de ce qui est *déclaré*.
2. **Écrire le contrat de données avant le code** qui le produit ou le consomme.
   Au menu, le ticket 3 est passé avant le 4, et c'est le seul réordonnancement
   qui ait été fait exprès.
3. **Découper en tickets mergeables seuls**, dont les premiers n'ont aucun effet
   observable en production.
4. **Poser un drapeau de bascule, par défaut sur l'ancienne source.** C'est ce
   qui a permis de comparer les deux côte à côte sans rien risquer.
5. **Vérifier dans un navigateur, pas en lisant le code.** Deux erreurs de la
   mission menu n'ont été trouvées que comme ça.

---

## 3. Où est AppPos — et le piège à éviter

**Le dépôt vivant est `I:\AppPOS`**, un monorepo. Le backend Express + NeDB est
dans **`I:\AppPOS\AppServe`**.

> **Piège :** il existe aussi un dossier **`I:\AppServe`** à la racine, qui
> ressemble au bon. Ce n'est pas lui. Ses données datent de février 2025, alors
> que `I:\AppPOS\AppServe\data\products.db` est modifié en continu. Vérifier la
> date de `data/products.db` avant de lire quoi que ce soit.

Repères relevés le 10 août 2026, sans ouvrir les fichiers :

- `package.json` de `I:\AppPOS` : `apppos-monorepo`
- dernier commit : 2026-07-01
- API en fonctionnement sur `http://127.0.0.1:3000`, jeton Bearer,
  `POST /api/auth/login`

---

## 4. Les fichiers à lire — inventaire, non lu

Relevé par listage de répertoires, **aucun n'a été ouvert**. Les chemins sont
relatifs à `I:\AppPOS\AppServe`. C'est une carte, pas un compte rendu.

### Synchronisation WooCommerce — le cœur du sujet

```
controllers/wooSyncController.js       point d'entrée de la synchro
routes/wooSyncRoutes.js                les routes qui la déclenchent
services/base/WooCommerceClient.js     le client HTTP vers Woo
services/base/SyncStrategy.js          l'abstraction de synchro
services/base/SyncErrorHandler.js      la gestion d'erreurs
services/sync/ProductSync.js
services/sync/CategorySync.js
services/sync/BrandSync.js
services/sync/syncUpdatedProducts.js   synchro incrémentale
services/ProductWooCommerceService.js
services/CategoryWooCommerceService.js
services/BrandWooCommerceService.js
```

**C'est ici que se joue la mission.** L'existence de `SyncStrategy.js` est le
signal le plus encourageant de tout cet inventaire : si la synchronisation est
déjà derrière une abstraction, publier vers une base SQL pourrait être une
**seconde stratégie** plutôt qu'une réécriture. À vérifier en premier.

### Produits

```
controllers/product/productController.js
controllers/product/productBatchController.js
controllers/product/productSearchController.js
controllers/product/productStockController.js
controllers/product/productStatsController.js
controllers/product/index.js
services/productService.js
models/Product.js
routes/productRoutes.js
```

### Catégories, marques, et leurs relations

```
controllers/categoryController.js      services/categoryService.js    models/Category.js
controllers/BrandController.js         services/brandService.js       models/Brand.js
services/relationService.js            services/dependencyValidationService.js
routes/categoryRoutes.js               routes/brandRoutes.js
```

### Images et leurs URL

```
services/image/ImageService.js
services/image/WordPressImageSync.js       ← le lien avec la médiathèque WP
controllers/image/BaseImageController.js
controllers/product/productImageController.js
models/base/BaseImage.js
models/base/ImageEntityHandler.js
models/images/SingleImage.js
models/images/GalleryImage.js
routes/image/{product,category,brand}ImageRoutes.js
```

`WordPressImageSync.js` est le fichier à lire en premier de ce groupe : il dit
comment les URL d'images sont produites, donc ce qui doit rester inchangé.

### Base et écritures

```
models/base/BaseModel.js               couche NeDB commune
controllers/base/BaseController.js
data/*.db                              les fichiers NeDB
migrations/                            à regarder : y a-t-il un versionnement de schéma ?
```

---

## 5. Les questions auxquelles la phase d'analyse doit répondre

Dans cet ordre. Chacune conditionne la suivante.

**5.1 — Le sens réel du flux.** L'audit déclarait « AppPos écrit dans
WooCommerce », sans l'avoir vérifié. À confirmer : qui écrit, qui lit, dans quel
sens, et à quel moment. Y a-t-il des écritures venant de WooCommerce vers AppPos ?

**5.2 — Ce qui déclenche une synchronisation.** Manuelle, à l'enregistrement
d'un produit, par lot, par minuterie ? `pending_sync` et `last_sync` existent
sur les enregistrements — les avoir vus dans l'API ne dit pas qui les pose.

**5.3 — La forme réelle des données.** Relevé le 10 août 2026 sur l'API en
fonctionnement, à confirmer dans le code :

- **produit** : 40 champs, dont `_id`, `woo_id`, `sku`, `name`, `designation`,
  `price`, `regular_price`, `sale_price`, `purchase_price`, `stock`,
  `stock_status`, `manage_stock`, `category_id`, `categories`, `category_info`,
  `brand_id`, `brand_ref`, `supplier_id`, `image`, `gallery_images`,
  `specifications`, `meta_data`, `website_url`, `last_sync`, `pending_sync`,
  `status` ;
- **catégorie** : `_id`, `woo_id`, `name`, `slug`, `parent_id`, `level`,
  `image`, `is_featured`, `description` ;
- **marque** : `_id`, `woo_id`, `name`, `slug`, `image`, `suppliers`,
  `products_count`.

**Volumes mesurés :** 3034 produits, 463 catégories, 287 marques.

**5.4 — Le trou connu, et il est important.** **433 catégories sur 463 n'ont pas
de `slug`**, et 254 pas de `woo_id`. Sur les marques, 85 sur 287 sans slug. Sur
les produits, 506 sans `woo_id` et 606 sans `website_url` exploitable.

C'est ce qui a obligé la mission menu à importer des liens manuels plutôt que
des références typées. **Pour le catalogue, ce n'est plus contournable :** un
produit sans slug n'a pas d'URL, une catégorie sans slug non plus. Comprendre
*pourquoi* ces champs manquent est un préalable, pas un détail.

Hypothèse à tester en premier : ce sont des entrées jamais synchronisées vers
WooCommerce, et une resynchronisation les remplirait. Non vérifié.

**5.5 — Ce qui doit rester chez AppPos.** Il est autorité sur le catalogue
pendant toute la transition (`docs/DECISIONS.md`). La question n'est pas *si*
mais *quoi* : la saisie, les prix, le stock, les relations, la caisse. La base
SQL distante est une **projection en lecture**, pas un second référentiel — sauf
décision explicite contraire, à consigner.

**5.6 — Le contrat de données.** Ce que la mission menu appelle « le contrat »,
et ce par quoi il faut commencer une fois 5.1 à 5.5 répondues. Trois questions
qu'il devra trancher, et qui sont **déjà ouvertes depuis l'audit** (§7.3) :

- le **volume** réellement publié — 3034 produits ne se servent pas en un
  fichier unique, c'est le déclencheur n°1 de §4.5 ;
- la **stratégie d'images** — tranchée par le propriétaire : les URL ne bougent
  pas ;
- la **recherche côté site** — aujourd'hui faite par l'API WooCommerce
  (`services/woocommerce.js` du site) ; rien ne la remplace encore.

---

## 6. Ce qui dépend encore de WooCommerce, côté site

Relevé pendant la mission menu, dans `I:\divi-child\frontend-wp`. Le menu en est
sorti ; tout le reste y est encore.

| Usage | Fichier du site |
|---|---|
| Produits, catégories, marques, recherche | `src/services/woocommerce.js` |
| Page catégorie | `src/pages/CategoryPage.jsx` |
| Page produit | `src/pages/ProductPage.jsx` (gabarit inachevé) |
| Fil d'Ariane | `src/hooks/useBreadcrumb.js` |
| Grilles, carrousels, filtres | `src/components/Product/`, `src/components/UI/` |

**Deux failles à garder en tête**, toutes deux dans `03-audit-resultats.md` :

- **3.1, toujours ouverte et prioritaire** — les clés WooCommerce partent en
  clair dans le bundle public, et elles sont **en lecture-écriture** (constaté
  le 10 août 2026 par le propriétaire, situation déclarée temporaire). Sortir de
  WooCommerce la referme naturellement, mais elle ne doit pas *attendre* cette
  mission.
- **3.2** — `getCategories()` ne charge que 2 pages de 100 en dur : **188
  catégories** réellement disponibles côté site sur 463 dans AppPos. Une partie
  du catalogue est déjà invisible aujourd'hui, sans erreur.

---

## 7. La première session — ce qu'elle produit, et rien d'autre

Un document d'audit du flux AppPos, sur le modèle de `03-audit-resultats.md` :

- les trois niveaux de fiabilité — **constaté** (chemin et ligne), **déclaré**,
  **non vérifié** — et ils sont tenus ;
- un schéma du flux réel produits / catégories / marques / images ;
- les réponses aux questions 5.1 à 5.5 ;
- ce qui reste ouvert, listé plutôt que comblé au plausible.

**Ce qu'elle ne produit pas :** de code, de schéma SQL, de tickets. Le découpage
vient après l'audit — c'est ce qui a marché la dernière fois.

**Point de départ suggéré :** `services/base/SyncStrategy.js`, puis
`controllers/wooSyncController.js`. Partir d'un fichier nommé et suivre ses
imports, plutôt que d'explorer librement — le dépôt est volumineux.

---

## 8. Ce que cette session laisse derrière elle

**Terminé et en production :** le menu, neuf tickets, chaîne complète vérifiée.

**Dettes connues, aucune bloquante :**

- faille 3.1 — clés WooCommerce en lecture-écriture dans le bundle public ;
- `GET /api/settings/pocketapp-key` renvoie une clé déchiffrée **sans garde
  admin** (`backend/routes/secrets_routes.go:125`) ;
- identifiants AppPos en dur dans huit fichiers de PocketApp
  (`loginToAppPos('admin', 'admin123')`) ;
- routes Go du webhook et des secrets génériques, sans appelant depuis le
  ticket 5b ;
- `site_menu` hors de `pocketbase-types.ts` — session à part, sur la chaîne
  produits/caisse.

**Supprimé :** `server/schema.sql`, qui décrivait le stockage du menu en MySQL.
Voir le bloc « Le menu reste en JSON statique » de `docs/DECISIONS.md`. La base
SQL de la mission catalogue est à concevoir, et n'a rien à voir avec lui.
