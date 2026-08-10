# Rituel de reprise — migrer le catalogue vers PocketBase, tout en local

**Écrit le 10 août 2026**, à la fin de l'audit du flux AppPos
([`07-audit-flux-apppos.md`](07-audit-flux-apppos.md)). Ce fichier remplace
[`06-rituel-catalogue.md`](06-rituel-catalogue.md) comme point d'entrée de la
mission suivante. Le 06 reste valable pour ce qu'il documente : il n'est pas
périmé, il est **dépassé sur la cible**.

---

## 0. Ce qui a changé de cap

La mission précédente visait : *AppPos publie vers une base SQL distante, le
site lit de là*. **Ce n'est plus l'étape suivante.**

La cible est désormais **s'affranchir d'AppServe** : PocketBase, déjà embarqué
dans PocketApp, devient la source de vérité du catalogue. Décision du
propriétaire du 10 août 2026, consignée dans
[`docs/DECISIONS.md`](../../../../docs/DECISIONS.md), bloc « PocketBase devient
la source de vérité, et la refonte se fait d'abord tout en local ».

```
NeDB existante  →  migration des entités  →  PocketBase / module stock  →  frontend-wp local
   (référence)         (à concevoir)            (source de vérité)           (consommateur)
```

**Aucune synchronisation vers la production dans cette phase.** Elle sera
conçue séparément, une fois le fonctionnement local validé. C'est le point le
plus important de la décision : deux problèmes, deux temps.

---

## 1. La contrainte de cette phase

**Phase d'analyse et de préparation. Aucune logique de production.**

Ce qui reste interdit, inchangé depuis le rituel précédent :

- **ne pas modifier AppPos** — la caisse en dépend. La trajectoire prévoit de
  l'adapter *à terme*, mais **aucun ticket de cette phase n'y touche**, et le
  jour venu il faudra un bloc de décision qui lève explicitement la contrainte
  de `CLAUDE.md` ;
- **ne pas toucher à la production** — ni au site, ni à la base
  `%APPDATA%\AppPOS\data`, ni au serveur mutualisé.

Ce qui est **autorisé et nouveau** : lire la base NeDB dev, écrire dans
PocketBase **local**, faire tourner `frontend-wp` en local.

---

## 2. Vocabulaire — à fixer avant de s'en servir

Relevé par listage le 10 août 2026, pour éviter les malentendus :

| Nom employé | Ce que c'est réellement |
|---|---|
| **AppServe** | `I:\AppPOS\AppServe` — le backend Express + NeDB, `:3000`. Ce dont on veut s'affranchir. |
| **AppTools** | `I:\AppPOS\AppTools` — le front Electron d'AppPos. `src/features/` contient `products`, `categories`, `brands`, `suppliers`, `pos`, `labels`, `wordpress`. |
| **AppStock** | **N'est pas un répertoire d'AppPOS.** Le monorepo contient `appstock-gemini-proxy` à sa racine. Dans PocketApp, le module correspondant est **`frontend/modules/stock/`**. |
| **PocketApp** | ce dépôt, `I:\pockapp`. Modules : `auth cash common connect home settings site stats stick stock updater`. |
| **frontend-wp** | `I:\divi-child\frontend-wp` — le site vitrine. |

Dans la suite de ce document, « **le module stock** » désigne
`frontend/modules/stock/` de PocketApp.

---

## 3. Ce que l'audit a établi, et qu'il ne faut pas réétudier

Tout est dans [`07-audit-flux-apppos.md`](07-audit-flux-apppos.md). Les acquis
qui portent directement sur la migration :

| Acquis | Où |
|---|---|
| `woo_id` / `website_url` signifient **« en ligne »**, pas « synchronisé » | §4bis.6 |
| Une catégorie est en ligne **parce qu'elle contient un produit publié** — dérivé, jamais saisi | §4bis.6 |
| `status: 'published'` porte l'intention côté produit ; **les catégories n'ont aucun champ équivalent** | §4bis.6 |
| L'intégrité relationnelle est saine : 9 anomalies en tout | §4bis.4 |
| `brandsRefs` et `products_count` sont **périmés à 80 %** — ne jamais les lire | §4bis.3, §4bis.4 |
| Le `_id` NeDB tient comme clé, mais l'espace n'est pas homogène (`cat_*`, 8 à 30 car.) | §4bis.5 |
| Les slugs sont à fabriquer par nous ; collisions mesurées, faibles | §4bis.5 et `DECISIONS.md` |
| Les URL d'images viennent du `source_url` WordPress et **ne bougent pas** | §1.3 |
| `pending_sync` signifie « déjà publié et modifié depuis » — **pas** « à publier » | §2.2 |
| `PathManager` : dev = `process.cwd()`, prod = `%APPDATA%` | §1.4 |

**Chiffres de référence, base dev** (`I:\AppPOS\AppServe\data`, état NeDB
reconstruit) : 2306 produits, 219 catégories, 224 marques, 43 fournisseurs.
Dont **1064 produits `published`**, dont **842 effectivement en ligne**.

---

## 4. L'ordre de travail — le modèle d'abord, la migration ensuite

**Décision du propriétaire, 10 août 2026.** L'objectif n'est **pas** de
reproduire dans PocketBase le modèle d'AppServe ni celui de WooCommerce.
Recréer les collections actuelles à l'identique est explicitement écarté.

La séquence, et elle ne se réordonne pas :

1. **comprendre le modèle métier actuel** ;
2. **concevoir un modèle cible cohérent** dans PocketBase ;
3. **déterminer les collections et relations réellement nécessaires** ;
4. **décider du sort des champs hérités** WooCommerce / AppServe ;
5. **migrer** les données NeDB vers ce modèle ;
6. **déplacer progressivement la logique métier** d'AppPOS vers PocketApp.

**Les collections PocketBase existantes ne sont pas définitives.** Certaines
seront supprimées, d'autres profondément adaptées. Le schéma actuel est un
point de départ à évaluer, pas un acquis.

La question centrale de cette phase est **métier, pas technique** :

> **Comment une caisse moderne doit-elle modéliser les relations entre
> marque, produit et catégorie ?**

Elle se tranche avant de toucher à PocketBase.

---

## 4 bis. Le recensement des champs — ce que les données disent déjà

Mesuré le 10 août 2026 sur la base dev, en lecture seule. **Ce n'est pas la
conception du modèle : c'est la matière première de la discussion.** Plusieurs
questions de modélisation y trouvent déjà une réponse.

### 4bis.1 Les produits ont 52 champs, pas 40

Taux de remplissage réels, base dev (2306 produits) :

| Constat | Chiffre |
|---|---|
| champs **jamais remplis, 0 document** | `specifications`, `category_ref`, `categories_refs`, `woo_status`, `sync_errors`, `description_short` |
| `regular_price` différent de `price` | **4** produits |
| `sale_price` non nul | **5** produits |
| `updated_at` présent | **18** (1 %) |
| `slug` présent | 307 (13 %) |
| `min_stock` présent | 99 (4 %) |
| `description` présente | 841 (36 %) |

**Trois conclusions immédiates :**

1. **Le modèle de prix promotionnel est une fiction.** `regular_price` /
   `sale_price` / `promo_rate` / `promo_amount` existent au schéma et ne sont
   quasiment jamais renseignés — ils n'existent que parce que WooCommerce les
   attend. Le modèle réel est : **un prix, un taux de TVA, un prix d'achat**.
2. **`updated_at` n'est présent que sur 18 produits.** Or le filtre incrémental
   de `syncUpdatedProducts` compare `updated_at > last_sync` (§3.6 de l'audit).
   **Ce filtre ne sélectionne donc jamais rien** pour 99 % du catalogue —
   troisième confirmation indépendante que ce chemin est mort.
3. **Six champs sont à zéro document.** Ils ne se discutent pas : ils ne
   passent pas la migration.

### 4bis.2 `meta_data` cache un vrai champ métier

`meta_data` est rempli sur 1870 produits (81 %) et ne contient **qu'une seule
clé : `barcode`**.

C'est un sac de forme WooCommerce qui transporte une donnée pleinement métier —
le code-barres, indispensable à une caisse. **Il ne doit pas être migré comme
`meta_data` mais promu en champ de premier rang**, et le sac disparaît.

### 4bis.3 Il n'y a pas de variantes aujourd'hui

`type` vaut `simple` sur 2297 produits et `service` sur 9. **Aucune variante
n'existe dans les données.** La question « comment modéliser les variantes »
est donc une question de conception à l'état pur, sans contrainte de reprise —
et elle peut légitimement être reportée, à condition que le modèle ne la rende
pas impossible.

À noter : `service` est un vrai cas métier distinct (9 produits) qui n'a rien à
voir avec le stock. Le modèle cible doit en tenir compte.

### 4bis.4 Les copies dénormalisées, et leur coût

| Champ | Rempli | Nature |
|---|---|---|
| `category_info` | 96 % | cache : `refs`, `path`, `path_ids`, `path_string`, `woo_id` |
| `supplier_ref` | 96 % | `{id, name}` recopié |
| `brand_ref` | 76 % | `{id, name}` recopié |
| `brandsRefs` (fournisseurs) | 85 % | **divergent à 80 %** (§4bis.4 de l'audit) |
| `products_count` | 100 % | **faux sur 21 marques** |

**Tout ceci est calculable.** Dans PocketBase, les relations et les vues
rendent ces caches inutiles. C'est le gisement de simplification le plus net
du modèle.

### 4bis.5 Les types sont incohérents

- `tax_rate` : `20` (2043), `5.5` (255), mais **`"0"` et `"20"` en chaîne** sur
  7 produits ;
- `margin_rate` : nombre **ou** chaîne ;
- `dateSoumission`, `last_sync`, `updated_at`, `last_sold_at` : chaîne **ou**
  objet.

PocketBase étant typé, **la migration devra normaliser** — et ce sont autant de
décisions à prendre, pas des conversions automatiques.

### 4bis.6 Les autres collections

| | champs | à noter |
|---|---|---|
| catégories (219) | 12 | `gallery_images` **0 %** ; `image` 10 % ; `is_featured` 31 % ; aucun champ de publication (§4bis.6 de l'audit) |
| marques (224) | 12 | `image` et `gallery_images` **0 %** — **les marques n'ont aucune image** ; `description` 4 % |
| fournisseurs (34) | 10 | `customer_code` **0 %** ; `payment_terms`, `contact`, `banking` sont des objets structurés, à plat ou en relation ? |

---

## 4 ter. La grille de tri des champs hérités

Chaque champ des quatre collections doit tomber dans **une** de ces cases, et
le document produit doit les lister toutes :

| Case | Exemples pressentis, à confirmer |
|---|---|
| **métier, à garder** | `name`, `sku`, `price`, `purchase_price`, `tax_rate`, `stock`, `barcode` (extrait de `meta_data`) |
| **spécifique WooCommerce** | `woo_id`, `website_url`, `woo_status`, `meta_data` (l'enveloppe), `regular_price` / `sale_price` |
| **remplaçable par plus générique** | `woo_id` → un identifiant externe **par plateforme** ; `pending_sync` / `last_sync` → un état de publication générique |
| **à garder temporairement** | ce qui sert la réconciliation ou une publication future vers Woo — **à décider explicitement, avec une date de péremption** |
| **mort** | les 6 champs à 0 %, `category_ref`, `categories_refs`, `specifications`, `sync_errors` |

**Le principe directeur, à tenir :** séparer **la donnée métier** de **la donnée
propre à une plateforme externe**. Un identifiant WooCommerce n'est pas une
propriété du produit ; c'est une propriété de *la relation entre ce produit et
une plateforme*. Le modèle cible devrait le refléter plutôt que de coller un
`woo_id` sur chaque table — sans quoi la prochaine plateforme ajoutera sa
colonne à côté.

---

## 5. Les questions de modélisation à trancher

Dans cet ordre, avant toute collection. Chacune doit produire une décision
consignée, pas une préférence.

**5.1 — Le produit.** Que contient-il en propre, et que contient-il par
relation ? Le cas `service` (9 produits, sans stock) fait-il un type, un
champ, ou une collection ?

**5.2 — La marque.** Aujourd'hui : une entité avec `products_count` faux,
`suppliersRefs` périmés, et **aucune image**. Est-ce une entité de plein droit
ou un simple attribut de produit ? La relation marque ↔ fournisseur (295 liens,
1 unilatéral) est-elle métier, ou un vestige d'organisation d'achat ?

**5.3 — Les catégories.** Arbre à `parent_id` + `level`, avec `category_id`
*et* `categories[]` *et* `category_info` — **trois représentations de la même
information**. Une seule doit survivre. Un produit a-t-il une catégorie
principale, ou seulement un ensemble ?

**5.4 — Les variantes.** Aucune n'existe (§4bis.3). Le modèle doit-il les
prévoir maintenant, ou seulement ne pas les interdire ?

**5.5 — Les prix.** `price` + `purchase_price` + `tax_rate` + `margin_*`.
Les marges sont-elles stockées ou calculées ? Le prix est-il HT ou TTC — **la
question n'est tranchée nulle part dans la documentation actuelle**.

**5.6 — Les stocks.** `stock`, `manage_stock`, `stock_status`, `min_stock`
(4 %). `stock_status` est aujourd'hui un miroir de WooCommerce dans un seul des
deux modes (§1.2 de l'audit). Que reste-t-il quand Woo part ?

**5.7 — Les images.** URL WordPress conservées (décision du 10 août). Comment
les représenter sans en faire une dépendance : champ URL simple, ou entité
média avec origine ?

**5.8 — La publication.** Pour les produits, `status` existe. **Pour les
catégories, rien** — c'est le seul mécanisme que la sortie de WooCommerce
détruit sans remplaçant (§4bis.6 de l'audit). Champ explicite, ou règle
recalculée ? *La règle « contient un produit en ligne, ancêtres compris » a été
vérifiée exacte sur la base dev : 0 catégorie manquante.*

**5.9 — Les identifiants externes.** Un `woo_id` par table, ou **une table de
correspondance** entité ↔ plateforme ↔ identifiant ? La seconde est la seule
qui survive à l'arrivée d'une deuxième plateforme.

**5.10 — Les relations.** Quelles relations PocketBase, dans quel sens, et
lesquelles remplacent purement et simplement les caches de §4bis.4 ?

---

## 6. Ce que cette phase doit produire

Deux documents. **Ni code, ni collection créée, ni donnée écrite.**

**A — La cartographie du modèle actuel** : entités, champs réels, relations,
et la grille de tri de §4 ter remplie pour les quatre collections.

**B — La proposition de modèle cible** : collections, champs, relations,
et pour chaque collection PocketBase existante une position explicite —
**conservée, transformée, fusionnée, ou supprimée**.

Le plan de migration ne vient qu'ensuite, et **aucune migration n'est écrite
tant que B n'est pas validé.**

### 6.1 Inventaire des entités NeDB

Les fichiers de `I:\AppPOS\AppServe\data\` relevés le 10 août 2026 :

```
products.db          categories.db        brands.db         suppliers.db
sales.db             drawer_sessions.db   drawer_movements.db
session_reports.db   users.db             user_presets.db
```

**Les quatre premières sont le périmètre catalogue.** Les autres relèvent de la
caisse et des utilisateurs : à inventorier, **pas à migrer dans cette phase**.
Le dire explicitement dans le document produit, plutôt que de les passer sous
silence.

Pour chacune : champs réellement présents (pas ceux déclarés), types, taux de
remplissage, valeurs distinctes quand c'est pertinent.

### 6.2 Structure et relations

Déjà en partie fait — §4 bis de l'audit. Reste à établir, pour chaque entité :
ce qui est **référence** (`brand_id`, `category_id`, `parent_id`,
`supplier_id`), ce qui est **copie dénormalisée** (`*Refs`, `products_count`,
`category_info`), et ce qui est **héritage WooCommerce** (`woo_id`,
`website_url`, `last_sync`, `pending_sync`, `meta_data`).

**La troisième catégorie est celle qui ne doit pas être migrée telle quelle.**
C'est le principal piège de cette phase : recopier le schéma NeDB dans
PocketBase reviendrait à importer la dette avec les données.

### 6.3 Le schéma PocketBase existant

**Point de vigilance, constaté et inscrit dans `CLAUDE.md` :** les collections
`products`, `brands`, `categories` et `suppliers` **existent déjà au schéma
PocketBase et sont vides**. Les hooks de `frontend/lib/queries/` qui les lisent
sont branchés sur du vide.

Donc la première question n'est pas « quelles collections créer » mais
**« le schéma existant convient-il, et d'où vient-il ? »**. Point de départ :
`backend/migrations/`, et la liste de `backend/migrations/migrations.go:13` —
rappel : *une migration non inscrite dans cette liste ne s'exécute jamais, sans
erreur*.

### 6.4 Les fichiers à chercher

L'objectif est de savoir **ce qui casse** quand AppServe disparaît.

Côté **PocketApp** (ce dépôt) — partir de fichiers nommés, pas explorer :

```
frontend/lib/apppos/apppos-config.ts        le point d'entrée réseau vers AppPos
frontend/lib/apppos/apppos-websocket.ts     le canal temps réel
frontend/lib/queries/products.ts            dont useUpdateProductUniversal:180
frontend/modules/stock/                     le module qui consomme
```

Questions à trancher : **combien d'appels vers `:3000` subsistent, et
lesquels lisent quand ils pourraient lire PocketBase ?** Rappel de `CLAUDE.md` :
il existe déjà **deux chemins d'écriture** et `useUpdateProductUniversal` route
entre eux sur une chaîne non typée. **Ne pas en créer un troisième** — et
profiter de la migration pour en supprimer un, plutôt que l'inverse.

Dette connexe déjà relevée : les identifiants AppPos en dur dans huit fichiers
(`loginToAppPos('admin', 'admin123')`).

Côté **AppPOS** — en lecture seule, pour cartographier :

```
AppTools/src/features/{products,categories,brands,suppliers}/   les écrans
AppTools/src/services/                                          les appels à AppServe
AppServe/models/base/BaseModel.js                               la couche NeDB
AppServe/services/{productService,categoryService,brandService}.js
AppServe/services/relationService.js, dependencyValidationService.js
```

Côté **frontend-wp** — ce qui consomme le catalogue, déjà listé au §6 du
rituel précédent : `src/services/woocommerce.js` en tête.

### 6.5 Les questions d'exécution — après le modèle, pas avant

Celles-ci ne se traitent qu'une fois §5 tranché.

**6.5.1 — Le schéma PocketBase existant est-il récupérable ?** D'où vient-il,
qui l'a écrit, et **quel écart** avec le modèle cible ? Réponse attendue par
collection : conservée, transformée, fusionnée, supprimée.

**6.5.2 — La migration est-elle rejouable ?** Une migration qu'on ne peut
lancer qu'une fois ne se met pas au point. Elle doit se relancer sur une base
PocketBase vide autant de fois que nécessaire, sans état résiduel.

**6.5.3 — Qu'est-ce qui, dans la caisse, dépend d'AppServe ?** Question de
sécurité, pas de conception. Tant qu'elle n'a pas de réponse, aucun ticket ne
doit approcher AppPos.

**6.5.4 — Comment `frontend-wp` lit-il en local ?** Il parle aujourd'hui à
WooCommerce. Le faire lire PocketBase local suppose un point d'entrée — lequel,
et sous quel contrat ? Le **contrat de données** s'écrit là, et **avant** le
code qui le consomme.

---

## 7. La démarche — inchangée, parce qu'elle a marché

Reprise du §2 du rituel précédent, elle vaut toujours :

1. **Auditer avant de proposer**, en distinguant *lu dans le code* de *déclaré*.
2. **Écrire le contrat de données avant le code** qui le produit ou le consomme.
3. **Découper en tickets mergeables seuls**, sans effet observable au début.
4. **Poser un drapeau de bascule, par défaut sur l'ancienne source.**
5. **Vérifier dans un navigateur, pas en lisant le code.**

Ajout propre à cette mission, tiré de l'audit :

6. **Mesurer sur les données réelles avant d'affirmer.** Trois interprétations
   de cet audit ont été corrigées par une mesure de dix lignes — dont deux
   étaient les miennes. Les scripts de mesure sont en lecture seule et se
   rejouent.

---

## 8. Ce qui reste ouvert, hérité et non traité

- **Faille 3.1** — clés WooCommerce en lecture-écriture dans le bundle public
  du site. Prioritaire depuis le premier jour, jamais traitée. La sortie de
  WooCommerce la referme, mais elle **ne doit pas attendre cette mission**.
- **222 produits `published` mais hors ligne**, et **5 produits `draft`
  pourtant en ligne** (§4bis.6). À reprendre : la migration est l'occasion de
  les identifier, pas de les corriger en silence.
- **L'écart production / dev non expliqué** — 3034 produits contre 2306. La
  production est déclarée non à jour, mais contient *davantage* de documents.
  À élucider avant toute reprise de la production, pas maintenant.
- `GET /api/settings/pocketapp-key` renvoie une clé déchiffrée **sans garde
  admin** (`backend/routes/secrets_routes.go:125`).
- `site_menu` hors de `pocketbase-types.ts`.

---

## 9. La première session — ce qu'elle produit, et rien d'autre

**Elle traite §5, et elle s'arrête là.** La tentation sera d'enchaîner sur les
collections ; c'est précisément ce que la décision du 10 août écarte.

Produit attendu — **le modèle cible**, sous forme de propositions argumentées :

- la réponse aux dix questions de §5, chacune avec ce qu'elle écarte et
  pourquoi ;
- la grille de §4 ter remplie pour les quatre collections, champ par champ ;
- pour chaque collection PocketBase existante, une position : **conservée,
  transformée, fusionnée, supprimée** ;
- ce qui reste ouvert, listé plutôt que comblé au plausible.

**Ce qu'elle ne produit pas :** de migration, de collection créée, de donnée
écrite, de ticket. Et **surtout pas** une transposition champ à champ du modèle
NeDB.

**Point de départ suggéré : les données, pas le code.** Le recensement de
§4 bis est fait et se rejoue ; il répond déjà à une partie de §5.1, §5.4 et
§5.5. Lire `backend/migrations/` vient **après** avoir décidé ce qu'on veut —
sinon le schéma existant décidera à notre place, ce qui est exactement le piège
que ce rituel cherche à éviter.

Trois faits de §4 bis à garder sous la main, parce qu'ils tranchent seuls :
**pas de variantes**, **le modèle promo est une fiction**, **`meta_data` ne
contient qu'un code-barres**.
