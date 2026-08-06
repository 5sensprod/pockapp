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

L'authentification est `X-API-Key`, sur le modèle du mini-SaaS existant
(`remote_notifications.go:27`). Rien de plus : §6 de l'audit reporte
explicitement toute authentification au-delà.

### 6.2 Ticket 8 — ce que le site devra adapter

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
- **Taille maximale du corps accepté** au ticket 5 : à fixer sur mesure réelle.
  Rappel du seuil indicatif de §4.5 : quelques centaines de kilo-octets
  déclenchent le passage à l'option C.
- **Identifiants de `ref.id`** : `142` dans l'exemple est un identifiant
  WooCommerce. Lequel des trois référentiels (AppPos, WooCommerce, PocketBase
  local) fait foi pour une destination est à trancher au ticket 4, quand
  l'éditeur devra proposer une liste de catégories. Le contrat n'en dépend pas :
  `ref.id` est une chaîne opaque pour le site.
