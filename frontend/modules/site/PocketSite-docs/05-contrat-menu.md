# Contrat du menu publié

**Ticket 3.** Ce fichier est la référence commune à trois consommateurs qui
n'appartiennent pas au même dépôt :

| Consommateur | Dépôt | Ce qu'il en fait |
|---|---|---|
| PocketApp — PocketSite | `I:\pockapp` | produit le document (tickets 4 et 6) |
| Script PHP de réception | serveur mutualisé | valide et écrit le fichier (ticket 5) |
| Site React | `I:\divi-child\frontend-wp` | lit le fichier (ticket 8) |

Aucun des trois ne fait autorité sur la forme : **ce document fait autorité.**
Toute divergence constatée entre le code et ce fichier est un bogue du code.

Ce qui est décrit ici est **coûteux à changer** : le site est déployé par FTP
sans retour arrière (faille 3.7 de [`03-audit-resultats.md`](03-audit-resultats.md)).
Ce qui produit le fichier ne l'est pas. D'où le soin porté au contrat et la
simplicité assumée du stockage — voir §4.4 de l'audit.

---

## 1. L'URL

```
https://axemusique.shop/data/menu.json
```

**Stable et non versionnée.** La version de format est un champ *dans* le
document. Une URL versionnée (`menu.v1.json`) obligerait à redéployer le site
pour changer de version — exactement ce que ce contrat sert à éviter.

**Hors de `wp-content/`**, qu'une mise à jour ou une restauration WordPress peut
balayer.

### 1.1 La desserte statique est acquise — vérifié

Le `.htaccess` racine du site a été lu. Les deux règles susceptibles
d'intercepter ce chemin sont gardées par `RewriteCond %{REQUEST_FILENAME} !-f` :

- le bloc WordPress, qui renvoie vers `/index.php` (lignes 51-53) ;
- le catch-all final vers l'`index.html` de React (lignes 59-63).

Un fichier réellement présent à `/data/menu.json` est donc **servi tel quel, en
statique, sans PHP sur le chemin de lecture**. Conformément à l'option A
retenue en §4.3 de l'audit.

**Conséquence pour le ticket 7 :** aucune modification du `.htaccess` n'est
requise. Déposer le fichier suffit. C'est aussi ce qui rend le passage à
l'option C invisible pour le site : seule la production du fichier changerait.

---

## 2. Le document

```json
{
  "contractVersion": 1,
  "publishedAt": "2026-08-06T14:32:11Z",
  "menu": {
    "name": "Menu Principal",
    "items": [
      {
        "id": "k3f9d2m1x8a7b0c",
        "title": "Accueil",
        "url": "/",
        "parent": null,
        "ref": null
      },
      {
        "id": "p7q2w9e4r1t6y3u",
        "title": "Instruments",
        "url": "#",
        "parent": null,
        "ref": null
      },
      {
        "id": "z5x8c1v4b7n0m3q",
        "title": "Guitares",
        "url": "/categorie-produit/guitares",
        "parent": "p7q2w9e4r1t6y3u",
        "ref": { "type": "category", "id": "142" }
      }
    ]
  }
}
```

### 2.1 Enveloppe

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `contractVersion` | entier | oui | version **majeure** du format. Vaut `1`. |
| `publishedAt` | chaîne | oui | instant de publication, ISO 8601 UTC, suffixe `Z` |
| `menu` | objet | oui | le menu lui-même |

`contractVersion` n'est incrémentée que sur rupture — champ obligatoire retiré,
type modifié, sémantique changée. L'ajout d'un champ facultatif ne l'incrémente
pas (voir §5).

`publishedAt` est produit par PocketApp au moment de l'envoi, pas par le script
PHP à la réception : c'est l'instant qui fait sens pour l'opérateur qui vient de
cliquer « Publier ». Il répond à la question « le menu est-il à jour ? », qui
est la raison d'être du champ selon §4.4 de l'audit.

### 2.2 `menu`

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `name` | chaîne | oui | libellé du menu, à usage de diagnostic |
| `items` | tableau | oui | les entrées, **à plat**. Peut être vide. |

Un seul menu est publié. Le document ne prévoit pas de menus multiples : le
besoin n'existe pas, et l'ajouter le jour venu se fera par un champ facultatif
sans rupture.

### 2.3 Entrée (`items[]`)

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `id` | chaîne non vide | oui | identifiant stable, unique dans le document |
| `title` | chaîne non vide | oui | libellé affiché |
| `url` | chaîne non vide | oui | destination **résolue**, prête à l'emploi |
| `parent` | chaîne ou `null` | oui | `id` du parent ; `null` à la racine |
| `ref` | objet ou `null` | oui | origine de la destination, **ignorée par le site** |

**L'ordre du tableau fait foi.** Il n'y a pas de champ `order` : l'ordre
d'affichage entre frères est l'ordre d'apparition dans `items`. Un champ de tri
serait une seconde source de vérité sur la même chose.

`url` accepte un chemin relatif (`/categorie-produit/guitares`), une URL absolue
(`https://…`, pour une destination externe) ou `#` pour une entrée qui ne sert
qu'à porter un sous-menu.

---

## 3. Les destinations : référence typée, URL résolue

Chaque entrée porte **les deux** : `ref` dit *d'où vient* la destination, `url`
dit *où l'on va*.

```json
"ref": { "type": "category", "id": "142" }
```

| `type` | Signification | `id` |
|---|---|---|
| `category` | catégorie du catalogue | identifiant côté source |
| `brand` | marque | identifiant côté source |
| `product` | produit | identifiant côté source |
| `page` | page du site | identifiant ou slug |
| `null` (le champ vaut `null`) | lien libre saisi à la main, ou entrée porte-sous-menu | — |

**La résolution `ref` → `url` a lieu à la publication, dans PocketApp.** Le
fichier publié contient déjà l'URL finale.

**Pourquoi.** PocketApp est le seul des trois à savoir ce qu'est une catégorie,
et le seul capable de détecter une destination devenue orpheline. Le site, lui,
ne lit que `url` et reste bête : aucune connaissance de WooCommerce à acquérir,
et le jour où les produits changeront de source, seule la résolution bouge — le
fichier publié, lui, garde la même forme. C'est le raisonnement de §4.4 appliqué
un cran plus bas : **l'intelligence du côté qui se redéploie facilement.**

`ref` est publié bien que le site l'ignore, pour deux raisons : diagnostiquer
une URL devenue fausse en lisant le seul fichier publié, et permettre à un futur
consommateur de faire mieux que suivre un lien. Il ne coûte presque rien en
volume.

---

## 4. Ce qui n'est pas publié

**Les entrées masquées sont absentes du fichier.** La visibilité est un état
d'édition dans PocketApp ; le fichier publié ne contient que ce qui doit
s'afficher. Il n'y a pas de champ `visible`, et le site n'a aucun filtrage à
faire. Même principe que §3 : le site reste bête.

Corollaire à respecter à la publication : masquer une entrée masque ses
descendants. Publier un enfant dont le parent est absent produirait une entrée
orpheline, jamais affichée. **Le document publié ne doit contenir aucun `parent`
qui ne corresponde à l'`id` d'une autre entrée du même document.**

Ne sont pas non plus publiés : brouillons, historique, horodatages d'édition,
identité de l'éditeur.

---

## 5. Évolution et compatibilité

**Règle pour les producteurs.** Ajouter un champ facultatif est libre et
n'incrémente pas `contractVersion`. Retirer un champ obligatoire, changer un
type ou une sémantique est une rupture : `contractVersion` passe à `2`, et le
présent document reçoit une section décrivant la version 2 — sans réécrire
celle-ci.

**Règle pour les consommateurs.** Ignorer tout champ inconnu, sans erreur. Un
document dont `contractVersion` est supérieure à celle qu'on sait lire doit être
**refusé**, pas interprété au mieux : c'est la raison d'être du champ selon
§4.4. Côté site, refuser signifie retomber sur le repli (§6.2), pas casser la
navigation.

---

## 6. Notes par ticket

### 6.1 Ticket 5 — validations attendues du script PHP

Le script refuse le document, sans écrire, et répond en erreur si :

- `contractVersion`, `publishedAt` ou `menu` manque, ou n'a pas le type attendu ;
- `contractVersion` est inconnue du script ;
- `publishedAt` n'est pas une date ISO 8601 valide ;
- `menu.items` n'est pas un tableau, ou une entrée n'a pas ses cinq champs ;
- deux entrées partagent le même `id` ;
- un `parent` non `null` ne correspond à aucun `id` du document (§4) ;
- le corps dépasse une taille maximale fixée au ticket 5.

L'écriture doit être **atomique** — fichier temporaire puis renommage — sans
quoi un visiteur peut lire un JSON tronqué. C'est le seul risque de lecture que
l'option A introduit, et il se traite en une ligne.

**Ajouté au ticket 5, le 7 août 2026** — deux validations que cette liste ne
prévoyait pas :

- un `ref` non `null` doit être un objet portant `type` **parmi les quatre
  de §3** (`category`, `brand`, `product`, `page`) et un `id` chaîne non vide.
  La règle « ignorer tout champ inconnu » de §5 porte sur les *champs*, pas sur
  les *valeurs d'une énumération fermée* ; le producteur étant unique, un `type`
  inconnu est un bogue de PocketApp, pas une extension à tolérer ;
- `publishedAt` doit être en **UTC avec suffixe `Z`**. Un décalage horaire
  (`+02:00`) est refusé : §2.1 dit UTC, pas « une date ».

Le script réencode le document validé plutôt que d'écrire le corps reçu tel
quel : ce qui est publié est alors exactement ce qui a été vérifié.

L'authentification est `X-API-Key`, sur le modèle du mini-SaaS existant
(`remote_notifications.go:27`). Rien de plus : §6 de l'audit reporte
explicitement toute authentification au-delà.

### 6.2 Ticket 6 — `menu.name` est une constante

`menu.name` est obligatoire dans le document (§2.2), mais **n'est stocké nulle
part** : `site_menu` ne contient que des entrées, pas le menu qui les porte.
C'est délibéré et non un oubli du ticket 1 — un seul menu est publié, et lui
donner une ligne en base aurait créé une collection à un enregistrement.

Le ticket 4 ne l'édite donc pas. Le ticket 6 l'écrit en constante à la
production du document. Valeur attendue : `"Menu Principal"`, celle de
l'exemple §2.

Le jour où plusieurs menus existeraient, ce champ deviendrait une vraie donnée
— mais §2.2 le dit déjà : ce besoin n'existe pas.

### 6.2 bis Ticket 6 — comment `ref` devient `url`

**Ajouté le 8 août 2026**, après lecture du dépôt du site (`I:\divi-child`,
lecture seule). §3 posait que la résolution a lieu dans PocketApp sans dire à
quoi ressemble une URL du site. Voici ce qui a été lu.

**Le site adresse ses cibles par *slug*, jamais par identifiant** — alors que
`ref_id` porte un identifiant WooCommerce (bloc « Origine des destinations du
menu » de `docs/DECISIONS.md`). L'écart est réel et c'est le vrai travail du
ticket 6.

| `ref.type` | URL servie | Le site retrouve la cible par | Référence |
|---|---|---|---|
| `category` | `/categorie-produit/<slug>` | slug, **dernier segment** | `App.jsx:90`, `CategoryPage.jsx:80-102` |
| `product` | `/produit/<slug>/` | slug, `getProductBySlug` | `App.jsx:119`, `ProductPage.jsx:66` |
| `brand` | `/marque/<slug>/` — **archive WordPress**, hors dépôt React | slug | vérifié en production, voir ci-dessous |
| `page` | seules `/`, `/mentions-legales`, `/bons-plans` existent | chemin littéral | `App.jsx:63-80`, `129-136` |

#### Où lire le slug — mesuré le 8 août 2026

`ref_id` contient un identifiant WooCommerce ; l'URL demande un slug. Le seul
référentiel interrogeable est AppPos (point 2 de `CLAUDE.md`). Mesures faites
sur AppPos en fonctionnement, ce jour :

| Type | Champ AppPos | Cibles résolubles |
|---|---|---|
| `category` | `slug` | **30 sur 463** |
| `brand` | `slug` | 202 sur 287 |
| `product` | `website_url` | 2428 sur 3034 |

**La catégorie, que l'exemple de §2 donne en modèle, est le type le moins bien
couvert.** 433 catégories sur 463 n'ont pas de slug dans AppPos ; 254 n'ont
même pas de `woo_id`.

`website_url` n'est déclaré ni dans `apppos-types.ts`, ni nulle part ailleurs —
même cas que `woo_id`, à lire défensivement. Il prend deux formes :
`https://axemusique.shop/produit/<slug>/` (2428, exploitable) et
`https://axemusique.shop/?post_type=product&p=<id>` (100, **inexploitable** —
c'est le repli WooCommerce quand le permalien n'est pas résolu). 506 produits
n'ont ni l'un ni l'autre, ni `woo_id`.

**Le slug d'AppPos est bien celui de WooCommerce — vérifié le 10 août 2026.**
C'était une hypothèse, signalée comme non vérifiée. Contrôlée sur la catégorie
« Guitares classiques » : AppPos donne `woo_id: 1096, slug: guitares-classiques`,
et `GET /wp-json/wc/v3/products/categories/1096` renvoie
`slug: guitares-classiques`. La jointure `ref_id` → slug est donc fondée.

**Corollaire à surveiller, lui non résolu :** le site ne charge que
**188 catégories** (2 pages de 100, `hide_empty=true` — faille 3.2). Une
destination valide mais absente de ce jeu ne serait pas retrouvée par
`CategoryPage`. La 1096 y est ; ce n'est pas garanti pour toutes.

**Ne jamais fabriquer un slug à partir du nom.** `CategoryPage.jsx:88-102`
retombe sur un `includes()` partiel : un slug approché mène silencieusement à
une autre catégorie. Un slug se lit ou l'entrée n'est pas publiable.

**Publier un seul segment pour une catégorie**, pas le chemin hiérarchique. Ce
n'est pas une préférence : `convertToReactUrl` (`useNavigation.js:77-78`) tronque
déjà toute URL de catégorie à son premier segment avant de la suivre. C'est
exactement la forme que le menu WordPress actuel produit après réécriture, et
celle de l'exemple de §2.

**Deux conséquences du composant de navigation** (`useNavigation.js:63-80`,
`MenuItems.jsx:8-27`), qui valent pour tout ce qu'on publiera :

- une URL contenant `/categorie-produit/` ou `/shop` est suivie en navigation
  React (`<Link>`) ;
- **tout le reste est rendu en `<a href>`**, donc en rechargement complet de la
  page — un lien produit, une page, un lien externe. Ça fonctionne, mais ce
  n'est pas de la navigation interne.

#### Les marques ont bien une page — corrigé le 8 août 2026

Une première rédaction de cette section, le même jour, affirmait qu'aucune
destination de marque n'existait. **C'était faux**, et l'erreur mérite d'être
gardée : elle venait de n'avoir cherché que dans le dépôt du site. Aucune
`register_taxonomy`, aucune `add_rewrite_rule`, aucune route React — le constat
était juste, la conclusion non. L'archive est servie par **WooCommerce
lui-même**, qui n'a besoin d'aucun code dans le thème.

Vérifié en production : `https://axemusique.shop/marque/neutrik/` répond `200`
et rend une page titrée « Neutrik | AXE Musique », là où une URL inventée rend
`404`. Les motifs `/brand/`, `/product-brand/`, `/marque-produit/` et
`/pa_marque/` rendent tous `404` — le préfixe est bien `/marque/`.

**Leçon de méthode :** l'absence dans un dépôt ne prouve pas l'absence en
production, dès lors qu'un composant tiers installé sur le serveur peut servir
la route. Les trois dépôts ne décrivent pas tout le système.

C'est une page WordPress, pas React : elle sera suivie en `<a href>`, donc en
rechargement complet. Idem pour `/produit/`, bien qu'une route React existe —
`isReactRoute` ne teste que `/categorie-produit/` et `/shop`
(`useNavigation.js:63-69`).

### 6.3 Ticket 8 — ce que le site devra adapter

La forme actuellement retournée par `loadMenu()` a été lue :
`{name, items[]}`, chaque entrée portant `{id, title, url, parent}` à plat, la
racine étant marquée `parent: 0`
([`wordpress.js:52-71`](file:///I:/divi-child/frontend-wp/src/services/wordpress.js),
forme confirmée par `DEFAULT_DATA.menus.main`,
[`constants.js:28-41`](file:///I:/divi-child/frontend-wp/src/utils/constants.js)).

**Le contrat publie délibérément cette forme**, plate et non imbriquée, plutôt
qu'un arbre à `children`. Publier un arbre imbriqué aurait obligé le ticket 8 à
l'aplatir, donc à toucher les composants de navigation — du travail dans le
dépôt le plus coûteux à redéployer, pour un bénéfice nul.

Deux écarts subsistent, et ils sont assumés :

- `menu.items` est sous l'enveloppe : le site lit `document.menu`, pas la racine ;
- `parent` vaut `null` à la racine, là où WordPress renvoie `0`. Les identifiants
  PocketBase sont des chaînes, un `0` numérique n'avait pas de sens ici. `null`
  et `0` sont tous deux *falsy* : un test de racine écrit `!item.parent`
  continue de fonctionner, un test écrit `item.parent === 0` casse.
  **Non vérifié** — les composants de navigation du site n'ont pas été lus.
  À contrôler au ticket 8.

Trois choses à traiter ensemble à ce ticket, selon §5 de l'audit : le drapeau
`.env` par défaut sur WordPress, l'invalidation du cache `localStorage`
(faille 3.6), et le branchement de `DEFAULT_DATA.menus` en repli (faille 3.4) —
lequel sert aussi de repli en cas de `contractVersion` refusée (§5).

**Un quatrième point, constaté le 10 août 2026 : `/data/menu.json` est mis en
cache par le navigateur.** La réponse ne porte pas de `Cache-Control`, seulement
`etag` et `last-modified` — le navigateur applique alors sa propre heuristique.
Symptôme observé : une publication réussie, le fichier bien à jour sur le
serveur, et l'ancien contenu affiché au rechargement.

**Il y a donc deux caches à franchir au ticket 8**, pas un seul : celui du
`localStorage` (24 h) et celui du navigateur sur la requête elle-même. Le second
se traite à l'appel — paramètre d'unicité sur l'URL, ou en-têtes de requête —
et ne demande rien au serveur. À vérifier avec l'outillage réseau, cache vidé et
cache chaud.

#### En développement local, la nouvelle source est bloquée par CORS

Constaté le 10 août 2026, avec `Origin: http://localhost:5174` :

| Source | `Access-Control-Allow-Origin` |
|---|---|
| `/wp-json/wp/v2/menus` — source actuelle | `http://localhost:5174` (WordPress renvoie l'origine reçue) |
| `/data/menu.json` — source nouvelle | **aucun en-tête** |

Le site tourne aujourd'hui en local contre WordPress **parce que WordPress
renvoie l'en-tête**. Le fichier statique, lui, est servi par Apache sans aucun
en-tête CORS : un `fetch` depuis `localhost` sera **bloqué par le navigateur**.

**Ce n'est pas un problème de production** — le site et le fichier y sont sur la
même origine, aucune vérification CORS n'a lieu. C'est un artefact du
développement local, et c'est là qu'il faut le traiter : **un proxy dans le
`vite.config` du dépôt du site**, qui n'engage ni le serveur ni le fichier
publié.

**Écarté — ajouter `Access-Control-Allow-Origin` sur `/data/` :** ce serait
modifier la production pour un besoin de développement, et ouvrir le fichier à
toute origine pour un confort local. Le proxy Vite ne coûte rien et ne sort pas
du poste.

**Le piège** : le symptôme ressemble à un bogue du code de bascule — l'ancienne
source marche, la nouvelle « ne charge pas ». Le message est en console, pas
dans l'application.

---

## 7. Ouvert

- **Le catch-all final du `.htaccess` semble inatteignable.** Le bloc WordPress
  (lignes 51-53) capture avec `[L]` tout ce qui n'est ni fichier ni dossier,
  avant que la règle finale ne soit consultée. Déduction sur le comportement de
  mod_rewrite, **non testée sur le serveur**. Sans effet sur ce contrat, dont le
  chemin est protégé par `!-f` dans les deux règles. À vérifier avant de
  s'appuyer un jour sur ce catch-all.
- **§2.4 de l'audit est à corriger** : la liste d'exclusions qu'il cite
  appartient au seul catch-all final, pas au routage React en général — les
  routes React sont énumérées une par une (lignes 6-38).
- ~~**Taille maximale du corps accepté** au ticket 5 : à fixer sur mesure
  réelle.~~ **Fixée le 7 août 2026 à 262 144 octets (256 Kio)**, en
  configuration du script (`server/config/config.php.example`, clé
  `max_body_bytes`), pas en dur. Toujours sans mesure réelle : la valeur
  s'aligne sur le seuil indicatif de §4.5 — quelques centaines de kilo-octets
  sont le signe qu'il faut passer à l'option C, pas une taille à absorber en
  silence. Un menu de navigation en fait quelques kilo-octets ; l'écart est tel
  que la mesure ne changera pas la décision. Refus en `413`.
- **Identifiants de `ref.id`** : `142` dans l'exemple est un identifiant
  WooCommerce. Lequel des trois référentiels (AppPos, WooCommerce, PocketBase
  local) fait foi pour une destination est à trancher au ticket 4, quand
  l'éditeur devra proposer une liste de catégories. Le contrat n'en dépend pas :
  `ref.id` est une chaîne opaque pour le site.
