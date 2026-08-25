# Tables de correspondance — la refonte du catalogue, en données

Deux fichiers, consultés par l'import lors de la reprise (chantier A, voie (b)) :

| fichier | ce qu'il décide |
|---|---|
| `categories.json` | où va chacune des 463 catégories NeDB — rayon cible, ou suppression |
| `brands.json` | quelle marque survit dans chacun des 8 groupes de doublons |

Générés le **24 août 2026** depuis `%APPDATA%\AppPOS\data`, puis **édités à la
main**. Ils ne sont pas régénérables sans écraser les arbitrages : à partir
d'ici, ce sont des fichiers source, pas des sorties.

## Voir ce qu'elles produiraient

```
go run ./backend/cmd/catalog-reprise
go run ./backend/cmd/catalog-reprise -detail 0
```

Lecture seule : cette commande n'ouvre aucune base PocketBase et n'a aucun
chemin d'écriture. Elle lit NeDB, applique les tables, et dit ce que la reprise
écrirait — y compris ce qui cloche.

L'état des lieux qui les motive :
[`03-etat-des-lieux-reprise.md`](../../../frontend/modules/stock/PocketStock-docs/03-etat-des-lieux-reprise.md).

---

## La clé de jointure est le CHEMIN, pas l'identifiant

Pour les CATÉGORIES, **l'import joint sur `chemin`**, jamais sur `nedb_id`.
Le chemin décrit un rangement, qui a un sens et se relit ; un identifiant
opaque ne dit rien à personne et ne se vérifie pas. `nedb_id` figure dans les
fichiers pour retrouver une ligne à la main, et pour rien d'autre.

> ⚠️ Une version antérieure de ce paragraphe justifiait ce choix par « les
> `_id` NeDB ont été régénérés, 0 sur 3000 ». **C'était faux** — la mesure
> comparait des chaînes dont l'une gardait un retour chariot. Le vrai décompte
> est 2982 sur 3000 : les `_id` NeDB sont bien les clés stables. Voir
> `docs/DECISIONS.md`, bloc du 2026-08-25.

**Pour les marques, le nom ne suffit pas, et c'est la simulation qui l'a
montré.** Deux groupes sur huit sont STRICTEMENT homonymes — « WITTNER » et
« WITTNER », « K&M » et « K&M » : aucune table ne peut désigner l'un des deux
par son nom sans désigner l'autre. Le slug d'origine départagerait — la perdante
l'a vide — mais `normalize` ne le reprend pas, il le recalcule depuis le nom
(`normalize/catalog.go:169`) ; `woo_id` départage WITTNER et pas K&M.

D'où le partage des rôles : **la table dit quels noms forment un doublon — c'est
un jugement humain — et le code choisit la survivante en comptant** (le plus de
produits, puis le logo). `survivant_propose` n'est qu'une indication de lecture,
et un gardien vérifie que le comptage l'emporte
(`plan_test.go`, `TestLaSurvivanteEstCelleQuiPorteLePlusDeProduits`).

---

## `categories.json`

Une entrée par catégorie NeDB. Champs :

| champ | rôle |
|---|---|
| `chemin` | **la clé** — `Racine / Enfant / Petit-enfant`, noms détourés |
| `nom`, `racine` | confort de lecture |
| `nedb_id` | indicatif, voir ci-dessus |
| `produits_directs` | produits rattachés à elle seule |
| `produits_avec_descendance` | elle et tout ce qui est sous elle |
| `action` | `rattacher`, `supprimer` ou `arbitrer` |
| `rayon_cible` | l'un des 12 `rayons_cibles`, ou `null` |
| `a_arbitrer` | `true` = la règle automatique n'a pas tranché |
| `note` | pourquoi |

**Décompte à la génération : 219 à rattacher, 242 à supprimer, 31 à arbitrer.**

### Comment les rayons ont été proposés

Trois règles, dans cet ordre :

1. **Par nom**, quand la nature prime sur le parent. C'est le cœur de la
   refonte : `Cordes` va aux consommables et non aux guitares, `Jack / cables
   guitare` va aux câbles, `Pédales` et `Amplis` vont à l'amplification, et les
   enfants du fourre-tout `Accessoires instru` suivent leur nature.
2. **Par racine**, pour tout le reste — 23 racines couvertes.
3. **Rien**, et la ligne remonte en `a_arbitrer`.

Une catégorie **sans aucun produit, ni en propre ni sous elle**, passe en
`supprimer` sans arbitrage : sa disparition n'emporte personne. Elles sont 242,
dont l'essentiel de la strate ✱.

### Les 31 à arbitrer

- **27 appartiennent à la strate ✱** et portent 44 rattachements en tout. Un
  rayon leur est proposé par équivalence avec la racine homonyme de la strate
  magasin (`* Batterie & Percussion` → `Batterie & percussions`). **Il reste à
  confirmer**, produit par produit si nécessaire : ce sont les seuls produits
  que la suppression de la strate ✱ pourrait égarer.
- **`Accessoires instru`** (8 produits en propre) — racine fourre-tout dont les
  enfants sont des doublons des racines homonymes. Ses enfants sont réglés ; la
  racine elle-même n'a pas de nature.
- **`Occasion` (10 produits) et `LOCATION` (9 produits)**, et c'est la vraie
  question de conception que les données ont fait remonter.

### `Occasion` et `LOCATION` — tranché : ce sont des champs

**Décision du propriétaire, 24 août 2026.** Une taxonomie logistique décrit
**ce que l'objet est** ; ces deux-là disaient **comment il se vend**. Elles
deviennent `commercial_state` sur le produit — `used` et `rental` — et sortent
de l'arbre. Le champ est posé par
[`AddCommercialStateToProducts`](../../migrations/add_commercial_state_to_products.go) ;
le raisonnement complet est dans `docs/DECISIONS.md`.

Dans `categories.json`, les deux lignes portent `action: "champ_produit"` et un
objet `champ_produit` qui donne le champ et la valeur à écrire.

**Elles restent `a_arbitrer`, et pas par oubli : il manque le RAYON de leurs 19
produits.** Mesuré — **18 des 19 n'ont aucune autre catégorie**. C'est la
démonstration du défaut qu'on corrige : l'état commercial avait mangé le
rangement. En sortant de l'arbre, ces produits n'ont plus rien, et il faut leur
attribuer un rayon **un par un** :

| ancienne catégorie | produits | ce qu'il faut décider |
|---|---|---|
| `Occasion` | 10 | le rayon de chacun (guitares, pédales, flûte… d'après le nom) |
| `LOCATION` | 9 | idem (sono, micro, jeux de lumière, amplis…) |

C'est dix-neuf lignes, et c'est le seul travail produit-par-produit de toute la
reprise.

---

## `brands.json`

Un objet par groupe de doublons, la clé étant le nom normalisé (minuscules,
accents et ponctuation retirés).

**Règle de survie**, appliquée dans cet ordre : le plus de produits ; à égalité,
celle qui porte un logo ; à égalité encore, `a_arbitrer`.

**8 groupes, 8 marques à fusionner, 2 à arbitrer.**

| survivante proposée | absorbe | produits |
|---|---|---|
| WITTNER | WITTNER *(nom identique, deux `_id`)* | 10 |
| Cordoba | CORDOBA | 10 |
| K&M | K&M *(idem)* | 10 |
| GATOR | Gator | 8 |
| Clarke | CLARKE | 2 ⚠ |
| Magneto | MAGNETO | 2 |
| LMPro | LM Pro | 1 |
| AKG | AKG | 0 ⚠ |

- **Clarke / CLARKE** — 1 produit et un logo de chaque côté. Le départage
  automatique ne tranche pas ; c'est une décision de propriétaire.
- **AKG** — deux lignes, zéro produit, zéro logo. **Supprimer les deux** plutôt
  que fusionner : il n'y a rien à préserver.

### `images_perdantes_a_vider` — à ne pas ignorer

Le miroir d'images distant nomme ses dossiers `<kind>/<legacy_id>/<rang>.<ext>`
et **le ménage distant n'efface que dans le dossier d'une entité qu'on lui
envoie**. Fusionner ne lui envoie jamais le `legacy_id` de la perdante : son
dossier resterait en ligne, sans que rien ne puisse plus dire à quoi il
correspond.

Ce champ liste les perdantes qui portent un logo — **5 sur 8** : CLARKE,
CORDOBA, WITTNER, K&M, Gator. Pour chacune, **exporter la marque avec une liste
d'images vide AVANT de fusionner**, ce qui déclenche le ménage sur son dossier.

L'ordre n'est pas commutatif : vider après la fusion viderait le dossier de la
**survivante**. Voir §5.3 de l'état des lieux.

---

---

## `doublons-produits.json` — les 33 SKU en double (RÉGLÉS)

> ✅ **Traités dans AppPos le 25 août 2026.** NeDB porte depuis 3027 produits et
> **0 SKU en double**. Ce fichier reste comme trace de l'arbitrage, et parce
> qu'il documente ce qu'il faut regarder si le cas revient.

**33 SKU étaient portés par plusieurs fiches NeDB — 68 produits.** Deux
conséquences, et la seconde est la plus dure : elles réclamaient la même clé
stable, et surtout le schéma porte un **index unique `(company, sku)`** — ces
fiches n'auraient de toute façon PAS été chargées, doublon de clé ou non.

Une ligne par SKU, avec toutes ses fiches (nom, statut, stock, prix, `woo_id`,
images, catégorie, marque, ventes) et un champ **`decision` à remplir** :

| valeur | sens |
|---|---|
| `"garder"` | ce sont bien des doublons ; une fiche est supprimée |
| `"produits_distincts"` | ce n'en sont **pas** ; le SKU de l'une est corrigé |

**26 fiches ont été supprimées et 7 SKU corrigés.** Les 7 corrections ont eu un
effet de bord qu'il faut connaître : la fiche renumérotée devient inconnue de
`cles-stables.json` et **part en ligne comme un produit neuf** — c'est correct,
c'est bien un article nouveau pour le site, mais cela veut dire nouvelle page et
nouveau dossier d'images. Quatre produits sont dans ce cas (`730525`, bundle
QSC CB10, Penta Harp E mineur, Providence V206 0.75m).

⚠️ **`proposition_garder` est un TRI, pas une décision.** Il privilégie la fiche
dont le nom n'est pas le SKU, puis celle qui porte un `woo_id`, une image, des
ventes. Il se trompe : au n° 28, il propose de garder une fiche nommée
« … Relaxation Zen (Copie) (Copie) » pour un SKU `RS1S`.

### Deux signaux, et aucun n'est fiable seul

- **`prix_divergent`** — 7 cas dont les prix s'écartent de plus de 10 %.
  Objectif, mais il rate les articles distincts vendus au même prix.
- **`repere_a_la_lecture`** — 7 cas repérés à l'œil, où les fiches désignent
  visiblement des **articles différents**. Ce n'est pas une mesure, c'est une
  lecture, et elle attrape ce que le prix ne voit pas :

| SKU | pourquoi ce ne sont pas des doublons |
|---|---|
| `210/20` | deux **tonalités** : Penta Harp A mineur et E mineur |
| `QSC CB10` | bundle avec housse (899 €) contre enceinte seule (799 €) |
| `730525` | la première fiche se nomme `730595` — une autre référence Gewa |
| `X000NE768F` | « Règle Coulissante » et « Méthode guitare Impro » |
| `PWGS-SM` | trois fiches, dont « taille Large » **et** « taille médium » |
| `PWGS-SS` | « taille Small » et un bottleneck sans taille |
| `WS-S35/B5` | lot de 5 bonnettes (4,90 €) contre l'unité (1,90 €) |

`210/20` est le cas qui justifie la relecture humaine : noms presque
identiques, prix identique, aucun signal automatique — et fusionner ferait
disparaître une tonalité du catalogue.

**Le dédoublonnage lui-même se fait dans AppPos, jamais depuis PocketApp**, qui
n'y écrit pas.

---

## Ce que ces fichiers ne disent pas

- **Où vont les 294 produits qui n'atterrissent nulle part.** La simulation les
  ventile : **268 n'ont aucune catégorie** (dette d'avant la reprise),
  **18 n'avaient que leur état commercial**, **8 dépendent d'une catégorie
  encore à arbitrer**. Aucun n'est perdu par une suppression — les catégories
  supprimées ne portaient effectivement aucun produit, et c'est la simulation
  qui le confirme. Rien ici ne décide de leur rayon.
- **Les 53 marques sans aucun produit.** Elles ne sont pas des doublons et ne
  figurent pas ici. Certaines sont probablement des marques à venir.
- **Le sort des produits en double** : rien dans ces tables ne dédoublonne les
  produits eux-mêmes, et la question n'a pas été instruite.
