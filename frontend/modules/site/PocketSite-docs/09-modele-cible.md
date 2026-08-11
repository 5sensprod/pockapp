# Modèle cible PocketBase — proposition

> ## ⚠ Ce document est daté, et ses chiffres sont périmés — 11 août 2026
>
> **Tout ce qui est mesuré ici l'a été sur la base NeDB de développement**
> (`I:\AppPOS\AppServe\data`), qui n'est **pas** la référence. La référence est
> la base d'installation, `%APPDATA%\AppPOS\data` :
>
> | | produits | catégories | marques | fournisseurs |
> |---|---:|---:|---:|---:|
> | **installation — référence** | **3034** | **463** | **287** | **43** |
> | développement — ce document | 2306 | 219 | 224 | 34 |
>
> **Une conclusion de ce document est fausse de ce fait :** « les marques n'ont
> aucune image (0 sur 224) », §3.3. La référence en porte **225 sur 287**. Le
> champ a été rétabli.
>
> **Trois autres points ont été corrigés après le premier chargement :** les
> galeries produit sont conservées, les images de catégorie étaient lues comme
> des chaînes alors que ce sont des objets, et les images sont désormais des
> **champs fichier** copiés dans PocketBase — le §9.2b de ce document, qui
> tranchait pour du texte, est caduc.
>
> **Le raisonnement du document reste valable ; ses chiffres ne le sont plus.**
> Il n'est pas réécrit : il est daté, et
> [`10-plan-migration.md`](10-plan-migration.md) §9 dit l'état réel.


**Écrit le 10 août 2026.** Première session du rituel
[`08-rituel-migration-pocketbase.md`](08-rituel-migration-pocketbase.md), §9 :
elle traite les questions de modélisation de §5 et s'arrête là.

**Ce document est une proposition, pas une décision.** Ce qui est validé passe
dans [`docs/DECISIONS.md`](../../../../docs/DECISIONS.md). Aucun code, aucune
collection créée, aucune donnée écrite.

Trois niveaux de fiabilité, tenus : **constaté** (mesuré ou lu, avec la
source), **proposé** (mon avis, avec ce qu'il écarte), **ouvert** (revient au
propriétaire).

**Révisé le 10 août 2026**, après relevé du code consommateur — modules `cash`
et `stock`. Les corrections sont marquées « **relevé du code** » et portent leur
référence `fichier:ligne`. Cinq points ont changé, dont deux à l'inverse de la
première rédaction. Voir §8 pour la liste.

---

## 1. Le fait qui manquait : le prix est TTC

**Constaté**, mesuré le 10 août 2026 sur la base dev. Sur 648 produits ayant à
la fois `price`, `purchase_price`, `tax_rate`, `margin_rate` et
`margin_amount` :

| Hypothèse testée | Produits cohérents |
|---|---:|
| `price` **TTC**, marge calculée sur base HT | **636** |
| `price` HT, marge = `price − purchase_price` | **0** |
| ni l'un ni l'autre | 12 |

Exemple : `price 5,00` / `purchase_price 0,70` / `tax_rate 20` /
`margin_amount 3,47` — soit `5 / 1,20 − 0,70 = 3,47`. **Exact.**

**Donc : `price` est TTC, `purchase_price` est HT, et la marge se calcule sur
la base HT.** C'était la question la moins documentée du modèle actuel et la
plus structurante. Elle est réglée.

**Proposé :** nommer les champs pour que l'ambiguïté ne revienne jamais —
`price_ttc` et `purchase_price_ht`. Un champ de prix sans unité dans son nom
est un piège qui se repaie à chaque lecture.

---

## 2. Le principe directeur

**Proposé.** Une seule idée gouverne tout ce qui suit :

> **Ce qui est calculable n'est pas stocké. Ce qui appartient à une plateforme
> externe ne vit pas sur l'entité métier.**

Le modèle actuel viole les deux, et l'audit a chiffré ce que ça coûte :
`brandsRefs` divergent à 80 %, `products_count` faux sur 21 marques,
`category_info` recopie un arbre entier dans chaque produit, et quatre champs
WooCommerce sont collés sur chacune des quatre collections.

---

## 3. Les collections proposées

**Valable pour les quatre :** chacune porte `company`, relation requise vers
`companies`. Le catalogue est multi-entreprise, avec une seule entreprise pour
l'instant — décision du 10 août 2026, §9.2a, qui emporte l'unicité de `sku` et
des `slug` **par entreprise** et non globalement.

### 3.1 `products`

**Identité et métier**

| Champ | Type | Origine |
|---|---|---|
| `name` | texte, requis | tel quel (100 %) |
| `designation` | texte | tel quel (99 %) |
| `sku` | texte, unique | tel quel (100 %) — **7 doublons à traiter avant** |
| `barcode` | texte, indexé | **extrait de `meta_data`** (81 %) |
| `type` | sélection `simple` \| `service` | tel quel |
| `description` | texte long | tel quel (36 %) |
| `slug` | texte, unique | **fabriqué** (`DECISIONS.md`, 2026-08-10) |

**Prix**

| Champ | Type | Note |
|---|---|---|
| `price_ttc` | nombre | ex-`price` |
| `purchase_price_ht` | nombre | ex-`purchase_price` |
| `tax_rate` | nombre, valeurs contrôlées à l'écriture | **normalisé** — 7 valeurs sont des chaînes |

**Relevé du code — le nommage est déjà celui-là.** La caisse consomme
`price_ttc` et recalcule `price_ht` à la volée sans jamais le stocker
([`apppos-transformers.ts:82-85`](../../../lib/apppos/apppos-transformers.ts)).
Le renommage du §1 ne fait qu'aligner le stockage sur un usage existant.

`purchase_price_ht` est **lu et écrit** par le module stock : colonne du tableau
([`ProductTable.tsx:334`](../../stock/components/ProductTable.tsx)), normalisé à
l'entrée ([`useStockModule.ts:111`](../../stock/useStockModule.ts)), renvoyé par
le formulaire ([`ProductDialog.tsx:156`](../../stock/components/ProductDialog.tsx)).
Champ métier de premier rang.

**`tax_rate` en nombre, pas en sélection.** Une énumération fige le schéma sur
les taux en vigueur : un changement de TVA imposerait une migration de
collection. Les valeurs se contrôlent à l'écriture.

**Supprimés :** `regular_price`, `sale_price`, `promo_rate`, `promo_amount`
(fiction : 4 et 5 produits concernés), `margin_rate`, `margin_amount`
(**calculés**, jamais stockés).

**Tranché — pas de mécanisme de promotion dans ce modèle.** Aucune donnée ne le
réclame : 4 produits avec `regular_price ≠ price`, 5 avec un `sale_price`, sur
2306. Et la caisse sait déjà remiser à la ligne et au ticket
([`useCartManager.ts:166`](../../cash/components/terminal/hooks/useCartManager.ts),
`calculations.ts`, remise pro rata) — **sans jamais lire un champ de promotion
du produit.** Le besoin est couvert au point de vente, pas au catalogue.

**Si un besoin de promotion catalogue apparaît**, ce sera une **entité datée** —
`promotions` avec période, cible et taux — jamais deux colonnes sur le produit.
La forme est fixée d'avance précisément pour qu'on ne retombe pas sur celle qui
n'a jamais servi. Le modèle de §3 ne l'interdit pas : elle s'ajoute sans rien
casser.

**Stock**

| Champ | Type | Note |
|---|---|---|
| `stock` | nombre | tel quel |
| `manage_stock` | booléen | conservé — usage à construire, voir ci-dessous |
| `min_stock` | nombre, optionnel | conservé — **seuil d'alerte de réappro** |

**Décision du propriétaire, 10 août 2026 — `min_stock` et `manage_stock` sont
conservés au titre de la case « à garder pour un usage à construire » du
§4 ter du rituel.** Le motif est écrit ici pour qu'il ne se perde pas : la
logique de stock d'AppPOS doit être reprise dans PocketApp, et `min_stock` porte
le **seuil d'alerte de réapprovisionnement**, `manage_stock` le fait qu'un
article suive un stock du tout — ce que le cas `service` rend nécessaire.

**Relevé du code — ils ne sont lus nulle part aujourd'hui**, et il faut le
savoir en les gardant :

- `min_stock` n'apparaît que pour être écrit à `0`
  ([`CreateProductDialog.tsx:49`](../../cash/CreateProductDialog.tsx),
  [`apppos-api.ts:167`](../../../lib/apppos/apppos-api.ts)). Aucun affichage,
  aucune alerte de seuil ;
- `manage_stock` est câblé en dur à `true` à la création
  ([`apppos-api.ts:165`](../../../lib/apppos/apppos-api.ts)) et jamais relu ;
- tous deux ne sont patchés que dans le cache TanStack
  ([`apppos-hooks-websocket.ts:100-101`](../../../lib/apppos/apppos-hooks-websocket.ts)),
  vers des lecteurs qui n'existent pas.

En base dev, `min_stock` est renseigné sur 99 produits : la saisie a existé.
**Ce sont donc des champs à réactiver, pas des champs vivants.** La différence
compte : reconduire un champ sans lecteur *par habitude* est exactement ce qui a
laissé survivre `brandsRefs`. Ici c'est assumé, et daté.

**Supprimé :** `stock_status`. **Constaté** : absent sur 1509 produits,
renseigné dans le seul mode manuel en miroir de WooCommerce (§1.2 de l'audit),
et **zéro occurrence dans tout `frontend/`** (relevé du code). Il se **dérive**
de `stock` et `manage_stock`.

**Tranché — pas de champ `availability` pour l'instant.** Le mode manuel de
WooCommerce exprimait « sur commande » / « en réappro », ce que `stock` seul ne
dit pas, et le besoin est crédible pour un magasin d'instruments. Mais il n'est
**appuyé par rien** : `stock_status` n'a aucun lecteur dans `frontend/`, et
aucun écran ne propose cette saisie.

Le rituel demande de mesurer avant d'affirmer (§7.6). On ne crée donc pas un
champ sur une intuition — **mais on note l'intuition** : si l'écran de stock
reprend la logique d'AppPOS et que le besoin se confirme, ce sera un champ
métier `availability` **neuf**, à valeurs explicites, et **pas** la
réintroduction du miroir `stock_status`. Ajouter un champ à une collection
PocketBase est peu coûteux ; en retirer un qui a été rempli l'est beaucoup plus.

**Relations**

| Champ | Type |
|---|---|
| `brand` | relation simple → `brands` |
| `supplier` | relation simple → `suppliers` |
| `categories` | relation multiple → `categories` |

**Relevé du code — `brand` et `supplier` sont confirmées, en lecture et en
écriture** : filtrage ([`useStockModule.ts:133-146`](../../stock/useStockModule.ts)),
affichage ([`ProductTable.tsx:144-165`](../../stock/components/ProductTable.tsx)),
écriture en `brand_id` / `supplier_id`
([`ProductDialog.tsx:167`](../../stock/components/ProductDialog.tsx)).

**Correction — il n'y a pas de catégorie principale.** La première rédaction
proposait `primary_category` en plus de `categories`, ce qui ramenait à deux
représentations là où la question 5.3 du rituel en demandait une. Le relevé
tranche : elle n'a **aucun usage**.

- le filtre porte sur `p.categories?.includes(...)` ; `p.category_id` n'y figure
  qu'en repli ([`useStockModule.ts:129-130`](../../stock/useStockModule.ts)) ;
- l'écriture envoie `category_ids`, un tableau
  ([`ProductDialog.tsx:160`](../../stock/components/ProductDialog.tsx)) — la
  principale n'est **jamais écrite** ;
- l'affichage lit `category_info.refs` seul ; `category_info.primary` existe au
  type ([`apppos-types.ts:100`](../../../lib/apppos/apppos-types.ts)) et n'est
  lu nulle part — le transformer ne prend que `.refs`
  ([`apppos-transformers.ts:116`](../../../lib/apppos/apppos-transformers.ts)).

**Un produit a un ensemble de catégories, sans hiérarchie entre elles.** Si un
besoin d'affichage principal apparaît (fil d'Ariane, catégorie mise en avant sur
le site), il se traitera alors — le modèle ne l'interdit pas.

**Supprimés :** `brand_ref`, `supplier_ref`, `category_id`, `primary_category`,
`category_info`, `category_ref`, `categories_refs`. Trois représentations
concurrentes de la même information, dont deux à 0 %.

**Publication**

`status` : sélection `draft` | `published`. Tel quel — il porte déjà
l'intention, et correctement (§4bis.6 de l'audit).

**Statistiques de vente — supprimées**

`total_sold`, `sales_count`, `revenue_total`, `last_sold_at`.

La première rédaction laissait la question ouverte : *agrégats du domaine caisse
posés sur le catalogue, à recalculer ou à sortir ?* **Le relevé du code la
ferme — elles n'ont aucun lecteur.**

- le transformer **ne les recopie pas** : elles n'existent pas dans le catalogue
  côté PocketApp ([`apppos-transformers.ts:63-122`](../../../lib/apppos/apppos-transformers.ts)) ;
- elles sont écrites à `0` à la création
  ([`apppos-api.ts:180-183`](../../../lib/apppos/apppos-api.ts)) ;
- le patcher WebSocket les réinjecte dans le cache TanStack
  ([`apppos-hooks-websocket.ts:125-128`](../../../lib/apppos/apppos-hooks-websocket.ts)),
  **sur des objets transformés qui ne les portaient pas** ;
- zéro occurrence dans un rendu, sur tout `frontend/`.

Elles ne passent pas la migration, et `apppos-hooks-websocket.ts:125-128` est du
code mort qui part avec. Si un besoin de statistiques apparaît, il se traitera
depuis `sales`, qui est leur source légitime.

**Supprimés sans discussion** — 0 document : `specifications`, `category_ref`,
`categories_refs`, `woo_status`, `sync_errors`, `description_short`.
**Supprimés aussi :** `meta_data` (l'enveloppe, une fois `barcode` extrait),
`dateSoumission` (types incohérents, redondant avec le `created` de
PocketBase), `sync_fields`, `last_sync_from_client`, `imported_from_client`,
`imported_at`, `original_client_id` (2 % et moins, vestiges d'un import).

### 3.2 `categories`

| Champ | Type | Note |
|---|---|---|
| `name` | texte, requis | |
| `slug` | texte, unique | **fabriqué, avec le parent** — « Accessoires » existe deux fois |
| `parent` | relation simple → `categories` | ex-`parent_id` |
| `description` | texte long | 10 % |
| `image` | fichier ou URL | 10 % |
| `is_featured` | booléen | 31 % — métier, conservé |

**Supprimés :** `level` (**dérivable** de `parent`), `gallery_images` (0 %),
et tous les champs WooCommerce.

**Relevé du code — `level` est confirmé mort, pas seulement dérivable.** L'arbre
est construit sur `parent` seul
([`apppos-hooks.ts:334-358`](../../../lib/apppos/apppos-hooks.ts)) ; le `level`
de [`CategoryTreeAppPos.tsx:132`](../../stock/components/CategoryTreeAppPos.tsx)
est une **profondeur de rendu passée en props**, pas le champ de données.

**Tranché — option A, la publication est dérivée.** C'était le point le plus
important du document et la seule question qui bloquait le schéma. Les
catégories n'ont **aucun champ de publication**, leur mise en ligne était portée
par WooCommerce (§4bis.6 de l'audit). Les deux options étaient :

| Option | Pour | Contre |
|---|---|---|
| **A — dérivée** : « en ligne si elle contient un produit `published`, ancêtres compris » | reproduit exactement le comportement actuel ; **vérifiée exacte** sur la base dev, 0 écart | pas de contrôle manuel possible |
| **B — champ explicite** `status` sur la catégorie | contrôle fin | 219 valeurs à saisir, et la dérive redevient possible |

**Retenu : A**, avec B en réserve. La règle est calculable, elle a été
**vérifiée exacte sur la base dev — 0 catégorie manquante**, et elle évite
d'inventer une saisie qui n'existe pas aujourd'hui. Le coût du choix inverse
n'est pas symétrique : A ne perd aucune information (219 valeurs se
reconstituent), tandis que B introduit d'emblée 219 saisies dont personne n'est
responsable — c'est-à-dire le mécanisme exact qui a produit `brandsRefs`.

**Réversible sans douleur :** passer de A à B consiste à ajouter un champ et à
l'initialiser depuis la règle. La bascule inverse, elle, ne se fait pas. On
prend donc l'option qui ne ferme pas l'autre.

**Ce qu'il faut écrire avec :** la règle exacte, une fois, à un seul endroit —
*une catégorie est en ligne si elle contient un produit `published`, ses
descendants compris ; ses ancêtres le sont par voie de conséquence.* Recopiée à
deux endroits, elle divergera.

### 3.3 `brands`

| Champ | Type |
|---|---|
| `name` | texte, requis |
| `slug` | texte, unique — fabriqué |
| `description` | texte long (4 %) |

**Supprimés :** `image` et `gallery_images` (**0 sur 224 — les marques n'ont
aucune image**), `products_count` (**faux sur 21**, calculable),
`suppliersRefs` (cache), et les champs WooCommerce.

**Relevé du code — la suppression des caches ne casse rien, c'est vérifié.**
`products_count`, `suppliersRefs` et `brandsRefs` n'apparaissent dans tout
`frontend/` que dans leur **déclaration de type**
([`apppos-types.ts:151, 157, 169, 187`](../../../lib/apppos/apppos-types.ts)) et
dans cette documentation. Aucune lecture, nulle part.

Côté affichage, la marque ne montre que `name` : le compteur de
[`BrandListAppPos.tsx:34`](../../stock/components/BrandListAppPos.tsx) est
`brands.length`, la longueur de la liste — **pas** `products_count`.

**Correction — la relation marque ↔ fournisseur est réelle, et elle est
saisie.** La première rédaction la laissait ouverte, en supposant qu'elle serait
portée par la marque ou dérivable des produits. Le relevé tranche dans un
troisième sens : **elle est portée par le fournisseur, et éditée à la main.**

- [`SupplierDialog.tsx:38`](../../stock/components/SupplierDialog.tsx) —
  `brands: z.array(z.string())` au schéma du formulaire ;
- lignes 247-269 — sélection multiple de marques dans le formulaire fournisseur ;
- lignes 102 et 119 — **écrite dans les deux chemins**, AppPos et PocketBase.

Un fournisseur peut donc se voir rattacher des marques sans qu'aucun produit ne
les relie : la relation n'est pas un agrégat. **Elle vit sur `suppliers`
(`brands`, relation multiple), pas sur `brands`** — voir §3.4. La question 3 du
§6 est close.

### 3.4 `suppliers`

| Champ | Type | Note |
|---|---|---|
| `name` | texte, requis | |
| `supplier_code` | texte | |
| `siren` | texte, 9 chiffres | **ajouté** — identification légale |
| `contact_name` | texte | **à plat** — ex-`contact.name` |
| `contact_email` | texte | ex-`contact.email` |
| `contact_phone` | texte | ex-`contact.phone` |
| `contact_address` | texte long | ex-`contact.address` |
| `banking` | JSON | IBAN, BIC — conservé, usage à construire |
| `payment_terms` | JSON | type, escompte — conservé, usage à construire |
| `brands` | relation multiple → `brands` | ex-`brands`, voir §3.3 |

**Ajout — `siren`, décision du propriétaire du 10 août 2026.** N'existe pas dans
NeDB : c'est le premier champ **créé** par ce modèle plutôt que repris. Un
fournisseur est une personne morale ; son numéro d'identification est une donnée
métier de plein droit, nécessaire dès qu'une facture d'achat est rapprochée.

**Convention à reprendre, elle existe déjà dans le dépôt.** L'entité entreprise
porte `siren`, `siret`, `vat_number`, `rcs` et `ape_naf`, avec leurs contrôles —
[`CompanyDialog.tsx:44-58`](../../../components/layout/CompanyDialog.tsx), où
`siren` est validé sur `^\d{9}$`. Le fournisseur doit employer **le même nom et
le même contrôle**, pas une variante.

**Ouvert, et volontairement non tranché :** `siret`, `vat_number`, `rcs` et
`ape_naf` suivent la même logique et l'entreprise les porte déjà. Le numéro de
TVA intracommunautaire en particulier devient nécessaire dès qu'un achat est
intracommunautaire. Ils ne sont **pas** ajoutés ici : seul `siren` a été
demandé, et le §4 ter interdit d'élargir au plausible. À décider quand l'écran
d'achat fournisseur existera — avec `banking` et `payment_terms`, qui relèvent
du même chantier.

**Correction — `contact` est mis à plat, la question ne se pose plus.** Le code
l'aplatit déjà en quatre champs
([`apppos-transformers.ts:207-210`](../../../lib/apppos/apppos-transformers.ts))
et le formulaire les consomme à plat
([`SupplierDialog.tsx:34-37`](../../stock/components/SupplierDialog.tsx)). Un
objet imbriqué serait une régression par rapport à l'usage constaté.

**`banking` et `payment_terms` : conservés, décision du propriétaire du 10 août
2026**, même case §4 ter que `min_stock` — « à garder pour un usage à
construire ». Motif écrit : ce sont des données d'achat fournisseur (coordonnées
bancaires, conditions de règlement et escompte) qui relèvent de la gestion
commerciale à reprendre dans PocketApp.

**Relevé du code, à savoir en les gardant :** ni `banking` ni `payment_terms`
n'ont **la moindre occurrence dans `frontend/`** hors déclaration de type. Ils
sont conservés pour un usage futur, pas reconduits pour un usage existant.

Restant en JSON plutôt qu'à plat : contrairement à `contact`, aucun formulaire
ne les édite aujourd'hui, donc aucune forme n'est imposée par l'usage. Le JSON
laisse la structure ouverte jusqu'à ce que l'écran qui les consomme existe — et
c'est lui qui dira s'il faut les aplatir.

**Supprimés :** `customer_code` (0 %), `brandsRefs` et `products_count`
(caches, aucun lecteur — §3.3).

### 3.5 `external_refs` — la collection qui n'existe pas encore

**Proposé, et c'est la proposition principale du document.**

Aujourd'hui, quatre champs WooCommerce sont collés sur chaque collection :
`woo_id`, `website_url`, `last_sync`, `pending_sync`. Ils décrivent **la
relation entre une entité et une plateforme**, pas l'entité.

| Champ | Rôle |
|---|---|
| `product` | relation → `products`, optionnelle |
| `category` | relation → `categories`, optionnelle |
| `brand` | relation → `brands`, optionnelle |
| `platform` | `woocommerce`, puis d'autres |
| `external_id` | ex-`woo_id` |
| `external_url` | ex-`website_url` |
| `published_at` | ex-`last_sync` |
| `state` | `synced` \| `pending` \| `error` |
| `error` | message, quand `state = error` |

**Correction — pas de relation polymorphe.** La première rédaction proposait un
couple `entity_type` + `entity_id`. **Ce n'est pas implémentable sous
PocketBase** : un champ `relation` cible **une** collection, il n'existe pas de
relation polymorphe. Le couple imposerait un champ texte non contraint — donc
perte de l'intégrité référentielle et de la suppression en cascade, exactement
ce qu'on reproche à NeDB.

D'où trois champs relation optionnels, avec une **règle d'intégrité : un seul
rempli**, à porter par une règle de collection. La contrainte est explicite et
le moteur la tient. Une quatrième entité publiable ajouterait un champ — coût
réel, mais borné, et sans rien perdre.

1. le catalogue métier **ne contient plus rien de WooCommerce** — la séparation
   demandée est structurelle, pas une convention de nommage ;
2. une deuxième plateforme n'ajoute **aucune colonne** ;
3. **l'échec devient une donnée** — aujourd'hui il ne va qu'à la console
   (§3.4 de l'audit), et `pending_sync` n'est jamais remis à `true` après un
   échec ;
4. l'état de publication d'une entité **jamais publiée** est enfin
   représentable : c'est l'absence de ligne. Le trou de §2.2 de l'audit —
   `pending_sync` ne sait dire que « déjà publié et modifié depuis » — n'existe
   plus.

**Écarté — garder `woo_id` sur chaque table « pour la transition » :** c'est
l'état actuel. Il a produit exactement les défauts ci-dessus.

---

## 4. Ce que deviennent les collections PocketBase existantes

**Constaté** (`CLAUDE.md`) : `products`, `brands`, `categories`, `suppliers`
existent au schéma et sont **vides**.

| Collection | Position proposée |
|---|---|
| `products` | **transformée** — champs à revoir en profondeur |
| `categories` | **transformée** — `level` retiré, `parent` en relation |
| `brands` | **transformée** — fortement allégée |
| `suppliers` | **transformée** — allégée |
| `external_refs` | **créée** |
| `promotions` | **ouverte** — seulement si le besoin est confirmé |

Ces positions ont été arrêtées **avant** d'ouvrir le schéma, comme le rituel
l'exige. La confrontation a eu lieu ensuite et les confirme toutes les quatre :
elle est au **§9**, avec le détail champ par champ et les quatre conflits
qu'elle a mis au jour.

---

## 5. La synchronisation — dans un deuxième temps, et pourquoi

**Proposé.** Rien de ce qui suit ne s'implémente maintenant. Ce paragraphe
existe pour que le modèle de §3 ne rende pas la suite impossible.

### 5.1 Ce que la première phase ne fait pas

Pas de publication, pas de reprise de la production, pas d'écriture vers
WooCommerce. La boucle locale — NeDB → PocketBase → module stock →
`frontend-wp` local — se valide seule.

### 5.2 Les trois leçons de l'audit qui contraignent la suite

1. **Un flux incrémental sans reprise dérive.** L'état vivait dans deux
   drapeaux que personne ne réparait, avec un recours de remise à plat qui ne
   fonctionnait pas depuis toujours (§3.1 de l'audit). Le remplaçant doit être
   une **projection complète**, pas un flux d'événements.
2. **Publier est tout ou rien.** Acquis de la mission menu, et
   `external_refs` le permet enfin : on publie un instantané, on écrit les
   correspondances à la fin, ou on n'écrit rien.
3. **Ne jamais supprimer à distance sur la foi d'une page.** `handleFullSync`
   supprimait définitivement, médias compris, d'après 100 éléments non paginés
   (§3.2 de l'audit). Une projection en lecture seule rend ce défaut
   structurellement impossible.

### 5.3 La forme proposée, quand le moment viendra

**PocketBase est la source, la cible est une projection.** Le sens est unique :
PocketBase → plateforme. Aucune écriture en retour, sauf pour renseigner
`external_refs` — la seule chose que la plateforme sait et que nous ignorons.

La publication produit un **instantané complet et versionné** des seules
entités publiables : produits `published`, leurs catégories dérivées, leurs
marques. Elle se rejoue à l'identique et se répare en la relançant.

**Ouvert :** la cible. Le bloc « Cible à terme » du 2026-08-07 vise la couche
distante ; la décision du 10 août la réordonne sans la trancher. WooCommerce,
la base SQL IONOS, ou les deux pendant un temps — **cette question n'a pas à
être répondue pour concevoir le modèle de §3**, et c'est précisément pourquoi
elle est reportée.

---

## 6. Ce qui reste à trancher par le propriétaire

**Les six questions sont tranchées. Aucune ne bloque plus le schéma.**

Trois l'ont été par le relevé du code, trois par décision du propriétaire le
10 août 2026 — cette dernière série sur consigne de trancher au mieux, ce qui
veut dire : **prendre l'option qui ne ferme pas l'autre**, et écrire pourquoi.

| Question | Décision | §
|---|---|---|
| Publication des catégories | **A — dérivée**, B en réserve | 3.2 |
| Besoin de promotions | **écarté** — la remise est en caisse, pas au catalogue | 3.1 |
| Statut de disponibilité | **écarté** — crédible mais appuyé sur rien | 3.1 |

Les deux « écartés » ne sont pas des refus : ce sont des ajouts différés dont la
**forme est fixée d'avance** — entité `promotions` datée, champ `availability`
neuf — pour qu'ils ne reviennent pas sous la forme qui a échoué.

**Fermées par le relevé du code :**

| Question d'origine | Réponse, et par quoi |
|---|---|
| Statistiques de vente sur le produit | **supprimées** — aucun lecteur nulle part. §3.1 |
| Relation marque ↔ fournisseur | **réelle et saisie**, portée par `suppliers.brands`. §3.3 |
| `contact` à plat ou en JSON | **à plat** — le code l'aplatit déjà et le formulaire le consomme ainsi. §3.4 |

**Tranchées par le propriétaire le 10 août 2026 :** `min_stock`, `manage_stock`,
`banking` et `payment_terms` sont **conservés** au titre d'un usage à construire
— alertes de seuil et gestion d'achat fournisseur. `siren` est **ajouté** aux
fournisseurs. Motifs écrits aux §3.1 et §3.4.

**Ce qui reste ouvert n'est plus une question de modèle**, mais de périmètre à
venir : les autres identifiants légaux du fournisseur (`siret`, `vat_number`,
`rcs`, `ape_naf`, §3.4) et la cible de publication (§5.3). Ni l'un ni l'autre
n'empêche d'écrire le schéma.

---

## 6 bis. Ce que le modèle est prêt à devenir

**Le modèle cible est complet.** Six collections, aucune question bloquante :

| Collection | Position | Mouvement |
|---|---|---|
| `products` | transformée | 52 champs → ~20 ; plus rien de WooCommerce |
| `categories` | transformée | `parent` en relation, publication dérivée |
| `brands` | transformée | réduite à `name`, `slug`, `description` |
| `suppliers` | transformée | `contact` à plat, `siren` ajouté, `brands` en relation |
| `external_refs` | **créée** | toute la dette de plateforme, isolée |
| `promotions` | **non créée** | forme fixée si le besoin survient |

Toutes portent en outre `company`, relation requise vers `companies` —
multi-entreprise, une seule entreprise pour l'instant (§9.2a).

La confrontation au schéma PocketBase existant (§6.5 du rituel) **est faite** —
voir §9. Elle a eu lieu après l'arrêt du modèle, jamais avant, pour que le
schéma en place ne décide pas à notre place. Convergence forte, quatre conflits
tranchés, **plus aucune décision de modèle en suspens.**

**Le modèle cible est arrêté. Il est prêt à passer dans
[`docs/DECISIONS.md`](../../../../docs/DECISIONS.md), et le plan de migration
peut s'écrire.**

## 7. Ce qui reste ouvert côté données, avant migration

- **7 SKU en doublon** — bloquant si `sku` devient unique. L'unicité étant
  **par entreprise** (§9.2a) et toutes les données allant dans la même, les
  7 doublons restent bloquants : la contrainte composite ne les sauve pas.
- **222 produits `published` mais jamais mis en ligne**, et **5 `draft`
  pourtant en ligne** (§4bis.6 de l'audit). À identifier, pas à corriger en
  silence.
- **4 `brand_id` et 4 `category_id` orphelins**, vers un seul identifiant
  fantôme (§4bis.4).
- **7 `tax_rate` en chaîne**, et `margin_rate` de type mixte.
- **12 produits** dont la marge n'est cohérente avec aucune des deux
  hypothèses de §1 — à regarder, ils cachent peut-être un cas métier.
  **Attention :** `margin_rate` et `margin_amount` étant supprimés (§3.1), ces
  12 cas disparaîtraient sans qu'on les ait examinés. **À traiter avant la
  migration, pas après.**

---

## 8. Le relevé du code — ce qu'il a changé

**Fait le 10 août 2026**, en lecture seule, sur les modules consommateurs `cash`
et `stock` de ce dépôt. Méthode : partir du contrat de données du terminal
([`cart.ts:30`](../../cash/components/terminal/types/cart.ts)) et remonter la
chaîne, plutôt que d'explorer.

**Le résultat le plus utile est une confirmation d'ensemble :**
`transformAppPosProduct`
([`apppos-transformers.ts:63`](../../../lib/apppos/apppos-transformers.ts)) est
déjà une première version du modèle cible. Elle promeut `barcode` hors de
`meta_data`, nomme `price_ttc`, recalcule `price_ht` sans le stocker, ignore
`regular_price` / `sale_price` / `promo_*`, et **ne laisse passer aucun champ
WooCommerce**. Les propositions du §3 ne partent donc pas de rien : elles
inscrivent au schéma ce que la couche de transformation fait déjà en mémoire.

### Les cinq corrections

| § | Correction | Sens |
|---|---|---|
| 3.1 | `primary_category` **supprimée** — aucun usage | simplification |
| 3.1 | statistiques de vente **supprimées** — aucun lecteur | question fermée |
| 3.3 | relation marque ↔ fournisseur **conservée**, portée par `suppliers.brands` | **inverse** de la 1ʳᵉ rédaction |
| 3.4 | `contact` **à plat**, `banking` / `payment_terms` en JSON | question fermée |
| 3.5 | `external_refs` en **trois relations optionnelles**, pas `entity_type`+`entity_id` | correction technique |

Deux ajustements mineurs : `tax_rate` en nombre plutôt qu'en sélection (§3.1),
et `level` confirmé mort plutôt que seulement dérivable (§3.2).

**Un champ créé, un seul :** `suppliers.siren` (§3.4). Tout le reste du modèle
est de la reprise, de la transformation ou de la suppression — ce qui est le
signe attendu à ce stade. Un modèle cible qui inventerait beaucoup de champs
serait suspect ; la valeur est dans les 30 qui disparaissent.

### Ce que le relevé a mis au jour, hors modèle

**Le module `stock` a deux implémentations parallèles de chaque écran** —
`BrandList` / `BrandListAppPos`, `CategoryTree` / `CategoryTreeAppPos`,
`SupplierList` / `SupplierListAppPos` — et `ProductDialog` branche sur `isAppPos`
pour choisir la forme du corps écrit
([`ProductDialog.tsx:158-172`](../../stock/components/ProductDialog.tsx)).

C'est la dette des **deux chemins d'écriture** de `CLAUDE.md`, vue depuis
l'interface. Le rappel du rituel (§6.4) vaut : la migration est l'occasion d'en
**supprimer un**, pas d'en ajouter un troisième.

**Code mort identifié, à retirer avec la migration :**
`apppos-hooks-websocket.ts:125-128` (patch des statistiques de vente vers des
lecteurs qui n'existent pas).

---

## 9. Confrontation au schéma PocketBase existant

**Lu le 10 août 2026**, après avoir arrêté le modèle — dans cet ordre, comme le
rituel l'exige (§6.5.1). Source unique :
[`backend/migrations/catalog.go`](../../../../backend/migrations/catalog.go),
seul fichier à toucher ces quatre collections, recoupé avec les types générés
[`pocketbase-types.ts:294-327`](../../../lib/pocketbase-types.ts).

### 9.1 Le verdict, d'abord

**Le schéma existant est bien plus proche de la cible que ce document ne le
supposait.** Il portait déjà, sans que nous l'ayons regardé :

| Ce que §3 propose | Déjà au schéma |
|---|---|
| `brand` relation simple, `supplier` relation simple | `catalog.go:396, 414` |
| `categories` relation **multiple** | `catalog.go:405` — `MaxSelect: nil` |
| `categories.parent` auto-relation | `catalog.go:139` |
| **`suppliers.brands` relation multiple** | `catalog.go:233` — **côté fournisseur**, exactement la correction du §3.3 |
| `contact` fournisseur **à plat** | `catalog.go:195-213` — `contact`, `email`, `phone`, `address` |
| `price_ttc`, `cost_price`, `tva_rate`, `stock_quantity`, `stock_min` | `catalog.go:317-351` |
| `barcode` **champ de premier rang** | `catalog.go:310` |

Deux conclusions que je n'attendais pas.

**Première : le §3.3 est confirmé une troisième fois, et de façon indépendante.**
Le relevé du code montrait la relation marque↔fournisseur saisie au formulaire
fournisseur ; le schéma la modélise **du même côté**. Trois sources concordantes,
la décision est solide.

**D'où vient ce schéma** — question que le rituel posait au §6.5.1 et que le
code ne pouvait pas dire. **Rapporté par le propriétaire :** c'est la résurgence
d'un **premier jet**, écrit avant qu'on décide de se brancher directement sur
AppPos, *par paresse et pour aller vite*. Ces collections n'ont jamais servi.

Elles ne sont donc **pas un acquis à préserver** : l'écart avec le modèle cible
n'a pas à être justifié, elles se réécrivent librement. Voir
[`docs/DECISIONS.md`](../../../../docs/DECISIONS.md), bloc « Les collections
catalogue de PocketBase sont un premier jet abandonné ».

**Seconde : ce premier jet avait déjà fait une partie du tri.**
Aucun champ WooCommerce, aucun cache dénormalisé, aucune statistique de vente —
ni `woo_id`, ni `products_count`, ni `brandsRefs`, ni `total_sold`. Le principe
directeur du §2 est **déjà appliqué** dans ce fichier. La crainte du rituel
(« recopier le schéma NeDB reviendrait à importer la dette ») ne s'est pas
réalisée ici : le schéma existant n'est pas un décalque de NeDB.

### 9.2 Les quatre conflits

Ils ne se contournent pas, et trois n'avaient été anticipés par aucun document.

**a) `company` — relation obligatoire sur les quatre collections, absente du
modèle cible.**

`catalog.go:386, 63, 129, 223` — `Required: true`, partout. Le schéma est
**multi-entreprise** ; le modèle du §3 est mono-entreprise sans le dire.

Or NeDB n'a **aucune notion d'entreprise** : le transformer pose `company: ''`
sur les quatre entités
([`apppos-transformers.ts:98, 149, 178, 205`](../../../lib/apppos/apppos-transformers.ts)).
Une migration qui écrirait ces enregistrements tels quels **échouerait sur un
champ requis**.

**Tranché — décision du propriétaire, 10 août 2026 : le catalogue est
multi-entreprise, avec une seule entreprise pour l'instant.**

`company` est donc **conservé, requis, sur les quatre collections** — le schéma
existant avait raison et le §3 avait tort de l'omettre. Le modèle cible
l'intègre : toute entité du catalogue appartient à une entreprise.

Trois conséquences, dont deux ne sautent pas aux yeux.

**1. La migration doit résoudre une entreprise, et refuser l'ambiguïté.** NeDB
n'en porte aucune : les 2306 produits, 219 catégories, 224 marques et 43
fournisseurs seront rattachés à l'entreprise unique. La règle à écrire, plutôt
qu'un identifiant en dur :

> *une entreprise et une seule doit exister ; la migration s'y rattache.
> Zéro entreprise → elle s'arrête, c'est un prérequis. Plusieurs → elle
> s'arrête et demande laquelle.*

Une migration qui « choisit la première » sur une base à deux entreprises mêle
deux catalogues sans bruit. Le cas est impossible aujourd'hui ; il ne le restera
pas, et c'est exactement pourquoi la règle s'écrit maintenant.

**2. L'unicité de `sku` et de `slug` est par entreprise, pas globale.** C'est la
conséquence la moins visible et la plus piégeuse. Le §3.1 demandait `sku` unique
et le §7 signalait 7 doublons à traiter : dans un modèle multi-entreprise, une
contrainte **globale** serait fausse dès la deuxième entreprise — deux magasins
ont légitimement le même SKU fournisseur. Il faut des **index uniques
composites** `(company, sku)`, `(company, slug)`, que PocketBase sait poser.
Même raisonnement pour `categories.slug` et `brands.slug`.

**3. `external_refs` ne porte pas `company`.** L'entité liée la porte déjà ;
l'ajouter serait une copie dénormalisée, contraire au §2. Elle se dérive par la
relation.

**Ce que ça ne change pas :** rien au reste du modèle. `company` s'ajoute aux
quatre collections sans toucher un autre champ, et le schéma existant le porte
déjà correctement.

**Observation, hors périmètre mais à consigner.** Les règles d'accès des quatre
collections sont `@request.auth.id != ''`
([`catalog.go:33-37`](../../../../backend/migrations/catalog.go)) — *tout
utilisateur authentifié*, **sans filtrage par entreprise**. Les utilisateurs
portent pourtant une entreprise (`AddCompanyToUsers`,
[`migrations.go:47`](../../../../backend/migrations/migrations.go)). Tant qu'il
n'y a qu'une entreprise, l'écart est sans effet ; **le jour où il y en a deux,
chacune lit le catalogue de l'autre.** Ce n'est pas un sujet de cette phase, et
c'est un sujet.

**b) `images` est un champ fichier, la cible garde des URL WordPress.**

`catalog.go:375` — `FieldTypeFile`, 10 fichiers, 5 Mo, JPEG/PNG/WebP. Or la
décision du 10 août conserve les URL WordPress (§5.7 du rituel), et le
transformer écrit une **chaîne d'URL** dans ce champ
([`apppos-transformers.ts:104`](../../../lib/apppos/apppos-transformers.ts)).

**Un champ fichier PocketBase n'accepte pas une URL** : il attend un fichier
téléversé. Les deux sont inconciliables. Soit le champ devient du texte (URL) —
cohérent avec la décision prise —, soit la migration télécharge les images et
les téléverse, ce qui crée précisément la dépendance que §5.7 voulait éviter.
**Le modèle tranche pour le texte**, et le schéma doit suivre.

**c) `price_ht` est stocké en plus de `price_ttc`.**

`catalog.go:317` — les deux existent. Le §1 a établi que `price` est TTC et que
`price_ht` se **calcule** ; la caisse le recalcule d'ailleurs à la volée sans
jamais le lire d'un stockage
([`apppos-transformers.ts:83-85`](../../../lib/apppos/apppos-transformers.ts)).

Deux prix stockés dont l'un dérive de l'autre, c'est le cas d'école du §2 : ils
divergeront. **`price_ht` est supprimé**, il se calcule de `price_ttc` et
`tva_rate`.

**d) `active` booléen contre `status`.**

`catalog.go:369` porte `active` (booléen) ; le §3.1 conserve `status`
(`draft` | `published`) parce qu'il porte l'intention de publication. Le
transformer aplatit `status === 'publish'` en booléen
([`apppos-transformers.ts:37`](../../../lib/apppos/apppos-transformers.ts)) —
et **perd `pending` au passage**.

Un booléen n'est pas un problème tant qu'il n'y a que deux états, mais il ne
nomme pas ce qu'il représente : *actif* et *publié sur le site* ne sont pas la
même chose, et la sortie de WooCommerce va rendre la distinction utile.
**`status` en sélection**, et `active` disparaît.

### 9.3 Le défaut `categories.parent` — **constaté sur la base réelle**

**Vérifié le 10 août 2026**, en lecture seule, sur une copie de
`%LOCALAPPDATA%\PocketReact\pb_data\data.db` (WAL compris). **Le défaut est
réel.**

```
CATEGORIES
  parent      relation   -> collectionId = ""   *** VIDE ***
  company     relation   -> j55ojrzsk0ytjme (companies)
PRODUCTS
  brand       relation   -> gk1g62rxntgz4xh (brands)
  categories  relation   -> izp0ae1puqruij5 (categories)   maxSelect=null
  supplier    relation   -> ljjssrpy7eq4be5 (suppliers)
SUPPLIERS
  brands      relation   -> gk1g62rxntgz4xh (brands)       maxSelect=null
```

**`categories.parent` est la seule relation du catalogue dont la collection
cible est vide.** Toutes les autres résolvent. PocketBase a donc accepté le
`SaveCollection` sans broncher : le champ existe, il est déclaré `relation`, et
il ne pointe nulle part.

Cause : `catalog.go:143` pose `CollectionId: ""` avec le commentaire
*« Self-reference, fixé après création »*, et **rien dans `RunMigrations` ne le
fixe ensuite** — `catalog.go` est le seul fichier à toucher `categories`.
Le correctif annoncé par le commentaire n'a jamais été écrit.

**Le défaut est resté invisible parce que la collection est vide** (0
catégorie). Il se serait manifesté à la première insertion d'un arbre — c'est-à-
dire exactement pendant la migration. **L'auto-relation est donc à réparer avant
toute écriture**, et c'est le premier bénéfice concret de cette confrontation.

**Contre-exemple utile :** la base vestige `I:\pockapp\pb_data`, créée en
novembre 2025 par l'ancien mécanisme, porte `parent -> pbc_categories_001`,
correctement. Le défaut est propre à `catalog.go`, pas à PocketBase.

### 9.3 bis Deux bases coexistent, et une seule compte

Constaté en cherchant la précédente réponse, et il vaut mieux l'écrire :

| Base | Ce qu'elle est |
|---|---|
| `%LOCALAPPDATA%\PocketReact\pb_data` | **la vraie** — `main.go:71-75`. 23 collections, celles de `RunMigrations` |
| `I:\pockapp\pb_data` | **vestige** — 8 collections, dernière migration en novembre 2025, produite par le dossier `migrations/` de la racine (celui que `CLAUDE.md` signale comme non importé) |

Le schéma `products` du vestige n'a rien à voir : `price`, `cost`, `stock`,
`image` — pas `price_ttc`, ni `tva_rate`, ni `sku`. **Ne jamais l'ouvrir pour
juger du schéma en place.** Le dossier `migrations/` de la racine et
`I:\pockapp\pb_data` sont les deux faces du même vestige.

**Et c'est un piège actif, pas seulement mort.** Les fonctions
`ensure*Collection` sortent si la collection **existe par son nom**
(`catalog.go:17, 88, 163, 257`). Une base portant les collections du vestige
verrait donc `RunMigrations` les accepter telles quelles, sans erreur et sans
les mettre à niveau — l'application tournerait sur le schéma de novembre 2025 en
croyant avoir migré. La sortie anticipée du §9.5 n'est pas qu'une gêne pour
faire évoluer le schéma : **c'est une convergence silencieusement fausse.**

### 9.4 bis L'entreprise existe, et elle est unique

`companies` contient **un enregistrement** — `SARL GALICHET`
(`468mpen5lhg6u0v`). Le prérequis du §9.2a est donc satisfait aujourd'hui : la
migration a une entreprise à laquelle se rattacher, et une seule. La règle
d'arrêt en cas de zéro ou de plusieurs reste à écrire — elle vaut pour demain,
pas pour maintenant.

**Les quatre collections du catalogue sont vides** : 0 produit, 0 catégorie,
0 marque, 0 fournisseur. Le fait déclaré par `CLAUDE.md` est vérifié.

**Aucun index n'est déclaré** sur `categories` — donc aucune unicité nulle part
dans le catalogue. Les index composites `(company, sku)` et `(company, slug)` du
§9.2a sont bien à créer, pas à modifier.

### 9.4 Position par collection

Réponse au format demandé par le rituel (§6.5.1) :

| Collection | Position | Ce qu'il faut faire |
|---|---|---|
| `products` | **transformée** | ajouter `designation`, `slug`, `type`, `status`, `manage_stock` ; retirer `price_ht`, `active`, `stock_max`, `unit`, `weight` ; `images` en texte ; unicité sur `sku` et `slug` |
| `categories` | **transformée** | ajouter `slug`, `description`, `image`, `is_featured` ; retirer `color`, `icon`, `order` ; **vérifier `parent`** |
| `brands` | **transformée** | ajouter `slug` ; retirer `logo` et `website` (0 image sur 224) |
| `suppliers` | **transformée** | ajouter `siren`, `supplier_code`, `banking`, `payment_terms` ; `brands` et le contact **sont déjà bons** |
| `external_refs` | **créée** | n'existe pas |
| `promotions` | **non créée** | §3.1 |

**Champ manquant le plus gênant : `designation`.** Il est absent du schéma
([`pocketbase-types.ts:294-314`](../../../lib/pocketbase-types.ts)) alors que la
caisse **et** le stock le consomment — au point que le transformer l'ajoute
hors schéma, par extension de type
([`apppos-transformers.ts:54-56`](../../../lib/apppos/apppos-transformers.ts)).
Les collections PocketBase, en l'état, ne pourraient pas servir le terminal.

### 9.5 La contrainte d'exécution, et elle change le plan

Chaque fonction `ensure*Collection` **retourne immédiatement si la collection
existe** — `catalog.go:17, 88, 163, 257`. Elles sont idempotentes par sortie
anticipée, pas par convergence.

**Conséquence : modifier `catalog.go` ne modifiera aucune base existante.** Les
collections sont créées, donc le code ne s'exécute plus. Toute évolution du
schéma passe par une **nouvelle migration**, inscrite dans la liste de
[`migrations.go:13`](../../../../backend/migrations/migrations.go) — faute de
quoi elle ne s'exécutera jamais, sans erreur (`CLAUDE.md`).

Cela recoupe le §6.5.2 du rituel — *la migration est-elle rejouable ?* — et la
réponse est **non, en l'état** : le schéma actuel ne converge pas, il s'installe
une fois. La reprise devra soit écrire des migrations d'altération, soit assumer
une remise à zéro de la base locale, qui est vide de catalogue et donc sans
risque. **La seconde est plus simple et plus honnête**, tant qu'on est en local.

### 9.6 Ce qui reste ouvert après cette confrontation

**Plus aucune décision de modèle, et plus aucune inconnue factuelle.**

`company` est tranché — multi-entreprise, une seule entreprise pour l'instant
(§9.2a), `SARL GALICHET`, vérifiée présente et unique (§9.4 bis).
`categories.parent` est vérifié : **cassé**, collection cible vide (§9.3).

Reste **un seul choix d'exécution** : remise à zéro de la base locale, ou
migrations d'altération ? §9.5. Le catalogue local étant vérifié vide — 0 sur
les quatre collections —, la remise à zéro est sans risque et rend la migration
rejouable, ce qu'exige le §6.5.2 du rituel. **C'est la voie recommandée.**

Attention toutefois : la base réelle porte 23 collections, dont la caisse, les
factures et le menu du site. « Remise à zéro » ne peut donc signifier
*supprimer `data.db`* — seulement **recréer les quatre collections du
catalogue**. La nuance est à tenir dans le plan de migration.
