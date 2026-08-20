# Contrat d'export du catalogue vers la base SQL Axemusique

**Écrit le 11 août 2026.** Fixe la forme de ce que PocketApp envoie au serveur
mutualisé et de ce que celui-ci répond. **Ce fichier fait autorité** : toute
divergence du PHP ou du Go avec ce qui est écrit ici est un bogue du PHP ou du
Go.

Il remplace WooCommerce comme destination du catalogue. Aucune référence à Woo
n'y figure, et il ne doit pas en apparaître : la direction du 11 août 2026 les
a déclarées mortes.

---

## 1. L'identité — le point à ne pas rater

**La clé d'une entité est `legacy_id`, jamais l'identifiant PocketBase.**

Le catalogue PocketBase est une projection rechargée **par purge** :
`catalog-import -load` efface les collections et les réécrit. Les identifiants
PocketBase sont donc **régénérés à chaque chargement** — s'en servir comme clé
distante créerait, au premier rechargement, 2562 produits en double dans la base
SQL sans qu'aucune erreur ne soit levée.

`legacy_id` est l'identifiant NeDB d'origine, porté par le schéma
(`backend/migrations/catalog_v2.go:226`). Il survit aux rechargements, et il
survivra au passage à l'import par l'API AppPos, qui expose les mêmes
identifiants.

**Conséquence pour le serveur :** `legacy_id` est la clé primaire côté SQL, et
l'écriture est un **upsert**, jamais un insert.

## 2. Le sens de circulation

Deux opérations, et deux seulement :

| | Sens | Objet |
|---|---|---|
| **inventaire** | PocketApp ← serveur | ce que la base SQL contient déjà |
| **export** | PocketApp → serveur | pousser un lot d'entités |

**Le serveur ne décide de rien.** Il ne calcule pas ce qui est publiable, il
n'interprète pas `status`, il n'invente pas de catégorie. La règle de mise en
ligne est appliquée dans PocketApp (`frontend/modules/site/lib/online-catalog.ts`) ;
le serveur reçoit un résultat, pas une question.

**Rien n'est jamais supprimé côté SQL par l'export.** Un produit retiré du site
devra faire l'objet d'une opération de retrait explicite, qui n'existe pas
encore — la concevoir avant d'en avoir besoin serait deviner. En attendant, un
produit dépublié **reste** dans la base SQL : c'est un manque connu, pas un
oubli.

## 3. L'inventaire

`GET …/products-sync.php?action=inventory`, en-tête `X-API-Key`.

```json
{
  "ok": true,
  "contractVersion": 1,
  "counts": { "products": 2431, "categories": 180, "brands": 217 },
  "products":   { "<legacy_id>": "<checksum>", … },
  "categories": { "<legacy_id>": "<checksum>", … },
  "brands":     { "<legacy_id>": "<checksum>", … }
}
```

Le `checksum` est celui qui avait été **reçu** au dernier export, réémis tel
quel. Le serveur ne le recalcule pas : il n'a pas à connaître la règle de
calcul, et deux implémentations d'un même hachage finiraient par diverger.

C'est ce document qui permet à l'interface de distinguer **trois** états, et
c'est tout ce qu'elle sait :

| État | Condition |
|---|---|
| **absent** | `legacy_id` inconnu de l'inventaire → grisé, seule action possible : exporter |
| **modifié** | présent, checksum différent |
| **à jour** | présent, checksum identique |

## 4. L'export

`POST …/products-sync.php`, en-tête `X-API-Key`, corps :

```json
{
  "contractVersion": 1,
  "exportedAt": "2026-08-11T15:04:05Z",
  "products":   [ { … } ],
  "categories": [ { … } ],
  "brands":     [ { … } ]
}
```

Les trois tableaux sont **facultatifs** ; un lot ne portant que des produits est
valide. L'ordre entre eux n'a pas d'importance : les relations sont portées par
`legacy_id` et non par des clés étrangères contraintes — une catégorie peut
arriver après le produit qui la cite.

### 4.1 Produit

| Champ | Type | Obligatoire | Note |
|---|---|---|---|
| `legacy_id` | chaîne non vide | oui | la clé |
| `checksum` | chaîne non vide | oui | calculé par PocketApp, stocké tel quel |
| `name` | chaîne non vide | oui | le libellé de la caisse |
| `site_title` | chaîne ou `null` | oui | le titre affiché sur le site, quand il diffère |
| `sku` | chaîne ou `null` | oui | |
| `slug` | chaîne ou `null` | oui | **figé au premier envoi**, voir §4.5 |
| `description` | chaîne ou `null` | oui | |
| `price_ttc` | nombre | oui | **TTC**, l'unité est dans le nom |
| `tax_rate` | nombre | oui | |
| `stock` | entier | oui | |
| `status` | `"published"` | oui | seule valeur admise — voir ci-dessous |
| `brand` | chaîne ou `null` | oui | `legacy_id` de la marque |
| `categories` | tableau de chaînes | oui | `legacy_id`, peut être vide |

**`status` n'admet que `published`.** Envoyer un brouillon serait demander au
serveur d'appliquer la règle de publication, ce que §2 lui interdit. Un produit
dépublié ne s'exporte pas : il se retire, et le retrait n'existe pas encore.

### 4.2 Catégorie

`legacy_id`, `checksum`, `name`, `slug`, `description`, `parent` (`legacy_id` ou
`null`), `is_featured` (booléen).

### 4.3 Marque

`legacy_id`, `checksum`, `name`, `slug`, `description`.

### 4.4 Le checksum

SHA-1 de la représentation JSON de l'entité **privée de son propre `checksum`**,
clés triées. Calculé par PocketApp, opaque pour le serveur.

Il ne sert qu'à répondre à une question : *cette entité a-t-elle changé depuis
son dernier export ?* Il n'a aucune valeur de sécurité.

### 4.5 Le slug est figé au premier envoi

**Le serveur ne remplace jamais un slug déjà en base.** Décision du 11 août
2026 (`docs/DECISIONS.md`) : une URL publiée vit dans les favoris et dans
l'index des moteurs ; la recalculer parce que le nom a changé casserait
silencieusement des liens qu'on ne contrôle pas.

Le serveur est le **seul** à pouvoir tenir cette règle : PocketApp recharge son
catalogue par purge et ne sait pas ce qui est déjà en ligne. Vaut pour les
produits, les catégories et les marques.

Conséquence pour le producteur : envoyer un slug différent de celui en place
n'a **aucun effet** et ne produit aucun refus. Renommer une URL sera une
opération explicite, qui n'existe pas encore.

## 5. La réponse à un export

```json
{
  "ok": true,
  "contractVersion": 1,
  "received":  { "products": 100, "categories": 0, "brands": 0 },
  "written":   { "products": 100, "categories": 0, "brands": 0 },
  "rejected":  [ { "kind": "product", "legacy_id": "…", "reason": "…" } ],
  "receivedAt": "2026-08-11T15:04:07Z"
}
```

**Une entité refusée n'annule pas le lot.** Les autres sont écrites, et le refus
est nommé. Un lot dont *toutes* les entités sont refusées répond quand même
`200` avec `ok: true` et un `rejected` plein : le transport a fonctionné, c'est
la donnée qui est en cause, et confondre les deux fait chercher au mauvais
endroit.

En revanche, une enveloppe invalide — `contractVersion` inconnue, JSON illisible,
clé absente — est un **422** ou un **401**, sans rien écrire.

## 6. Les limites du mutualisé, qui dictent le découpage

L'hébergement est un mutualisé PHP/MySQL : aucun processus persistant, et des
limites de taille et de durée qu'on ne contrôle pas.

- **Le lot est plafonné à 200 entités et 1 Mio.** Au-delà, l'export est découpé
  côté PocketApp. 2562 produits font donc une quinzaine d'allers-retours, pas un.
- **Chaque lot est indépendant.** Il n'y a pas de transaction couvrant l'export
  entier : un lot qui échoue laisse les précédents écrits. C'est assumé —
  l'opération est idempotente, on rejoue.
- **L'idempotence est la propriété qui rend tout cela sûr.** Réexporter le même
  lot deux fois produit exactement le même état.

## 6 bis. La lecture publique par le site — `catalog.php`

Ce contrat décrit l'ÉCRITURE (PocketApp → serveur). La lecture, elle, est
assurée par `server/api/catalog.php`, **sans aucune clé** : son consommateur
est un bundle public, où un secret serait lisible de tous
(`docs/DECISIONS.md`, 11 août 2026).

| Action | Rend |
|---|---|
| `?action=categories` | toutes les catégories portant au moins un produit |
| `?action=category&slug=…` | la catégorie, ses **ancêtres**, ses enfants, ses produits paginés |
| `?action=product&slug=…` | le produit et les catégories auxquelles il appartient |
| `?action=search&q=…` | les produits publiés dont le nom, la référence ou le slug contient `q` |
| `?action=brands` | les marques portant au moins un produit publié, logo compris |
| `?action=latest&limit=…` | les produits publiés les plus récemment **exportés** |
| `?action=stats` | trois décomptes : produits, marques, catégories |

Les trois dernières datent du 20 août 2026 et servent la page d'accueil : le
carrousel de marques, l'aperçu de la section « Notre catalogue », le bandeau
de chiffres. **Toute action ajoutée s'inscrit dans ce tableau, et dans le
message de l'action inconnue** — celui-ci a déjà été oublié une fois.

**`stats` compte ce que le SITE expose, pas ce que la caisse porte** : produits
`published`, marques et catégories **portant au moins un produit publié**.
Annoncer les 287 marques du catalogue quand le site n'en montre qu'une part
serait le défaut même qui avait fait masquer ce bandeau. Mesuré le 20 août
2026 : 2563 produits, 218 marques, 199 catégories.

**Conséquence à connaître : `stats.categories` (199) et `action=categories` ne
comptent pas la même chose.** La seconde ne filtre pas sur `status`, une
catégorie ne portant que des produits non publiés y figure donc. L'écart est
voulu côté `stats` ; s'il faut le réduire, c'est `action=categories` qu'il faut
corriger, pas l'inverse.

**`latest` trie sur `exported_at`, qui n'est PAS une date d'arrivée.** Cette
colonne est réécrite à chaque export contenant le produit, et l'export est
incrémental sur une empreinte qui couvre `stock` et `price_ttc` : une vente
redate un produit. La liste est « ce qui a bougé en dernier ». Le site
l'affiche sous « Dernières mises à jour du catalogue », jamais « Nouveautés » —
voir [`13-dates-produits.md`](13-dates-produits.md). Second critère de tri
obligatoire (`legacy_id`) : un export pose le même horodatage sur tout son lot,
et 2563 produits partagent la seconde du chargement initial.

**Deux règles de comptage, qui doivent rester ensemble :**

- **Une catégorie compte les produits de TOUTE SA BRANCHE**, descendance
  comprise — « Guitares folk » porte 15 produits en propre et 83 dans sa
  branche. Un visiteur qui clique une rubrique attend ce qu'elle contient, et
  une catégorie de pur classement afficherait sinon « 0 produit ».
- **Un produit rattaché à deux catégories sœurs ne compte qu'une fois** dans
  leur ancêtre commun. Le total d'une catégorie n'est donc pas l'addition
  arithmétique de ses pastilles d'enfants.

Le total du parent et le décompte de chaque enfant passent par **la même
fonction** : deux comptages écrits séparément finissent toujours par diverger,
et l'écart s'était déjà produit.

Pas de requête récursive — MySQL 5.7 du mutualisé n'a pas de CTE. L'arbre entier
est lu en une fois (463 lignes) et parcouru en PHP, avec un garde-fou sur les
cycles : `parent` est une colonne libre.

**La recherche** porte sur `name`, `sku` et `slug` — pas sur la description,
qui contient du HTML et ferait remonter n'importe quoi sur un mot courant.
Deux caractères minimum, sinon la réponse est vide : en dessous, la requête
ramènerait une part notable des 2562 produits pour rien. Pas de pertinence
pondérée : sans index FULLTEXT, MySQL ne saurait pas la calculer, et une fausse
pertinence est pire qu'un ordre alphabétique assumé.

**`ancestors`** est rendu de la racine au parent direct, la catégorie courante
exclue. Il alimente le fil d'Ariane des pages catégorie du site, jumeau de celui
des pages produit.

## 7. Ce que ce contrat ne couvre pas

- **Les images.** Elles sont des champs fichier PocketBase, servis par un
  serveur local qu'axemusique.shop ne peut pas atteindre. Les transférer est une
  opération distincte — 4665 fichiers, 1,7 Go, à travers un mutualisé.
  **Depuis le 19 août 2026 elle a son propre mécanisme**, le miroir
  ([`16-conception-images.md`](16-conception-images.md)), et **aucun champ image
  ne figure toujours à ce contrat** : ce n'est plus une attente, c'est le
  partage retenu. Les octets et les chemins passent par `images-sync.php`, le
  lot d'entités n'en sait rien.
  **La LECTURE, elle, en rend** : `catalog.php` compose `brand.image`,
  `product.image` et `product.gallery` en URL complètes à partir de la colonne
  `image_paths` et de `media_base_url`. Mesuré le 20 août 2026 : 179 des 218
  marques en ligne portent un logo.
- **Le retrait** d'une entité, cf. §2.
- **Les 257 produits** dont l'état de publication bascule
  (`docs/DECISIONS.md`, 11 août 2026) : ils s'exportent comme les autres, la
  question de savoir s'ils le doivent se tranche au moment de l'export.
