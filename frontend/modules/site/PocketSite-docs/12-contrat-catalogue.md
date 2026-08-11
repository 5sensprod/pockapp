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
| `slug` | chaîne ou `null` | oui | |
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

## 7. Ce que ce contrat ne couvre pas

- **Les images.** Elles sont des champs fichier PocketBase, servis par un
  serveur local qu'axemusique.shop ne peut pas atteindre. Les transférer est une
  opération distincte — 4665 fichiers, 1,7 Go, à travers un mutualisé — et elle
  n'est pas traitée ici. Aucun champ image ne figure au contrat **tant que ce
  point n'est pas conçu** : en mettre un qui porterait une URL locale
  produirait 2562 images cassées sur le site.
- **Le retrait** d'une entité, cf. §2.
- **Les 257 produits** dont l'état de publication bascule
  (`docs/DECISIONS.md`, 11 août 2026) : ils s'exportent comme les autres, la
  question de savoir s'ils le doivent se tranche au moment de l'export.
