# Chantier A — état des lieux mesuré, avant toute reprise

**Session du 24 août 2026.** Aucune écriture dans aucune base. Tout ce qui suit
est *mesuré*, sur des copies prises ce jour, ou lu dans le code — chemin et
ligne donnés. Ce qui est rapporté est signalé comme tel.

## Les trois bases en présence

| | chemin | rôle |
|---|---|---|
| **PB-PROD** | `%LOCALAPPDATA%\PocketReact\pb_data` | base de production reprise du client : caisse complète, **catalogue vide** (attendu) |
| **PB-DEV** | `%LOCALAPPDATA%\PocketReact\pb_data - Copie` | base de développement : catalogue complet, caisse arrêtée au 22/08 |
| **NeDB** | `%APPDATA%\AppPOS\data` | AppPos de production, référence catalogue |

`I:\AppPOS\AppServe\data` est bien la copie de dév périmée annoncée par
CLAUDE.md : 2306 produits, dernière écriture le 10/08. Écartée.

```
                    PB-PROD   PB-DEV      NeDB
products                  0     3000      3055
categories                0      464       463
brands                    0      281       288
suppliers                 0       43        43
invoices               1204     1171
orders                   16       16
quotes                    ?       63
cash_sessions            65       63
z_reports                60       46
inventory_sessions      196      196
inventory_entries      2465     2465
product_events         2963     2797
customers               278      267
```

---

## 1. Le pont des identifiants — ce qu'il est vraiment

> ⚠️ **CORRECTION du 25 août 2026.** La première version de ce paragraphe
> affirmait que « les identifiants NeDB ont été régénérés — 0 sur 3000 ».
> **C'était faux, et l'erreur venait de la mesure** : je comparais deux listes
> dont l'une gardait un retour chariot (CR) de fin de ligne, si bien qu'aucune chaîne ne
> pouvait correspondre. Le décompte exact est **2982 sur 3000**. Tout ce qui
> suit tient compte de la correction ; le raisonnement qu'elle invalidait est
> conservé plus bas, parce qu'il explique la voie prise.

**Les `_id` NeDB SONT les clés stables.** 2982 des 3000 `legacy_id` portés par
PB-DEV existent bel et bien comme `_id` dans la NeDB actuelle. C'est l'import du
11 août qui les y a posés, et rien ne les a bougés depuis.

Le pont vers PB-PROD est donc **direct**, sans intermédiaire :

```
PB-PROD.product_id  ==  NeDB._id  ==  PB-DEV.legacy_id
```

| référence de PB-PROD | volume | résolue |
|---|---|---|
| `inventory_entries` | 1938 produits distincts | 1869 — **96,4 %** |
| `product_events` | 939 produits distincts | 895 — **95,3 %** |
| lignes de facture | 899 produits distincts | 811 — **90,2 %** |

Les 3 à 10 % non résolus sont des produits disparus de NeDB depuis — le même
phénomène que les 95 entrées d'inventaire déjà orphelines avant la reprise.

### Ce que cela change pour la reprise

**Recharger le catalogue depuis NeDB recolle l'historique tout seul.** Le
chargeur écrit `legacy_id = <_id NeDB>` depuis toujours ; l'écran d'inventaire
retrouve un produit par `product_id` « quelle que soit sa forme, `id` ou
`legacy_id` » (`InventoryPage.tsx:278-287`). Aucune passe de réécriture, aucune
table, aucun risque.

**`cles-stables.json` ne sert donc qu'aux 46 produits dont l'`_id` n'est pas une
clé connue** — 18 se retrouvent par leur SKU, 28 sont réellement nouveaux. Elle
reste utile, mais elle est un filet, pas le pont.

**Et son ordre d'application est critique** (voir `cles.go`) : l'identité
d'abord, le SKU ensuite, le nom en dernier. L'ordre inverse a fait échouer
l'écriture d'essai du 25 août — `UNIQUE constraint failed: products.legacy_id`.
Un SKU peut changer de propriétaire : le dédoublonnage avait laissé
« QSC CB10 » au Bundle et renuméroté l'Enceinte, si bien que la clé de
l'Enceinte — et donc son dossier d'images en ligne — partait au Bundle.

### Le raisonnement que l'erreur avait produit, et pourquoi il ne nuit pas

Croyant le pont rompu, j'avais cherché un pont de rechange et trouvé que
**l'historique porte ses propres instantanés, complets** :

```
inventory_entries  2465 lignes : 2465 nom, 2441 SKU, 2208 code-barres, 2160 image
product_events     2963 lignes : 2963 nom, 2860 SKU
lignes de facture  : name, brand_name, prix, TVA — mais PAS de SKU
```

Cette mesure-là est juste, et elle reste précieuse : elle dit que même si le
pont cassait un jour, l'historique resterait **lisible** et recollable par SKU à
96,7 %. Elle dit aussi que `grep product_id backend/reports/` ne rend aucune
occurrence — ni `aggregateZ`, ni `z_lignes.go`, ni le journal ne touchent au
lien produit. **Un lien perdu ne fausse aucun total et n'atteint aucune
déclaration.**

---

## 2. La divergence PB-DEV ↔ NeDB — elle est petite

Appariement PB-DEV ↔ NeDB par SKU puis par nom :

- **33 SKU étaient portés par deux fiches NeDB** — 68 produits, dont l'une
  nommée par sa propre référence (« MXR M108S » et « Pédale équalizer MXR -
  MXR M108S »). Ce n'étaient pas des produits à créer mais des doublons de
  saisie, et **7 n'étaient même pas des doublons** : deux articles distincts
  sous un même SKU (Penta Harp *A* et *E* mineur, bundle QSC contre enceinte
  seule).
  **Traités dans AppPos le 25 août 2026** — suppressions et renumérotations
  par le propriétaire. NeDB porte depuis **3027 produits et 0 SKU en double.**
- **8 produits de PB-DEV n'ont aucun correspondant** — *Polish Guitare Dr
  LISTONS*, *Party Mix2 Numark*, *Nux MG-50Li*, *huile de citron Dunlop*… Ce
  sont vraisemblablement des fiches supprimées côté AppPos depuis le 11/08 : à
  **dépublier**, pas à effacer (DECISIONS, 2026-08-21).
- Les prix, stocks et statuts des 2992 appariés sont à comparer champ par champ.
  **Le stock est le seul qu'il ne faut PAS reprendre de NeDB** : PocketApp est
  seul maître du stock depuis le 19/08 et PB-PROD porte 1348 mouvements réels
  (`sale`, `inventory_session`, `return`) que NeDB n'a jamais eus.

Marques et fournisseurs : PB-DEV a **281 marques et aucun doublon de nom**,
contre 288 en NeDB — **les 8 fusions du §5.2 ont déjà été faites** lors de
l'import du 11/08. Rien à refaire de ce côté.

---

## 3. La garde qui laisse passer — à corriger avant tout

Deux gardes existent, et elles ne protègent pas la même chose. La plus faible
s'exécute au démarrage, sans qu'on la demande.

| | `guard.go` (chargeur) | garde 2 de `MigrateCatalogV2` |
|---|---|---|
| déclencheur | `catalog-import -load`, à la main | `RunMigrations`, à chaque démarrage |
| critère | entités `pa_…`, `product_events`, documents | *tous les enregistrements ont un `legacy_id` non vide* |
| contournement | `-force-purge`, écrit à la main | aucun — elle passe seule |

`backend/catalog/load/guard.go` bloque explicitement sur les entités nées en
caisse (`legacy_id LIKE 'pa\_%'`). La garde 2
(`backend/migrations/catalog_v2.go:140-153`) ne teste que
`legacy_id = '' OR legacy_id IS NULL` : **un produit né en caisse porte `pa_…`,
donc un `legacy_id` non vide, donc il passe la garde et il est détruit** —
exactement ce que l'autre garde interdit. PB-DEV en porte 3 aujourd'hui
(1 produit, 1 catégorie, 1 marque) ; PB-PROD en portera davantage.

`MigrateCatalogV2` fait un `DeleteCollection` sur les cinq collections
(`catalog_v2.go:166-176`) puis les recrée. Sur PB-PROD, `products` porte
`created = 2026-08-22 18:44:52` — la migration s'y est déjà exécutée.

**Premier ticket du chantier, et il est petit : la garde 2 doit appeler
`load.Inspect`.** Rien ne doit écrire dans PB-PROD avant.

### Effet de bord à nettoyer

PB-PROD porte **1,7 Go d'images sans propriétaire** : les dossiers de
`pb_data/storage` sont nommés par les *anciens* ids de collection —
`71wy9ngwa1b87sk` (2641 entrées), `f32dzjil2t50m5x` (220), `odvn2lqe02m6pn6`
(37), `j55ojrzsk0ytjme` (1) — alors que les collections actuelles sont
`3h41uwjcnqvjk9m` / `iszrmatux7suv3x` / `5e4d9v5ybt2fwjk` / `i3jkrq2s9wi3vab`.
Plus rien ne les réclame, et PocketBase ne les effacera pas non plus. À
supprimer à la main **après** la reprise vérifiée.

### Un point de CLAUDE.md est périmé

`categories.parent` y est donné cassé, avec « correctif jamais écrit ».
`backend/migrations/catalog.go:143` porte bien `CollectionId: ""`, mais
`catalog_v2.go` le répare (son en-tête le documente, l.63-68) et le schéma lu
sur PB-PROD donne `parent -> 5e4d9v5ybt2fwjk`, l'auto-relation correcte. La
ligne de CLAUDE.md est à corriger.

---

## 4. Les catégories — deux strates, dont une morte

Mesuré sur NeDB (463 catégories) ; PB-DEV en porte 464, même structure.
L'arbre a 46 racines et une profondeur réelle de 0 à 3 (46 / 343 / 70 / 4). Il
ne raisonne pas « par univers » : il raisonne des **deux** façons à la fois, et
c'est là le désordre.

### 4.1 La strate « ✱ » — un catalogue importé, jamais utilisé

14 racines dont le nom commence par `*` (`* Microphones`,
`* Studio & Enregistrement`, `* Cables & connectique`, `* Guitares & Basses`…)
entraînent **202 catégories sur 463 — 44 % de l'arbre — qui ne portent ensemble
que 44 rattachements produit.** Taxonomies de distributeur, une vingtaine de
sous-catégories chacune, presque toutes vides.

**C'est la strate « univers / présentation » que l'on cherchait, et elle est
déjà morte.** Elle ne se refond pas : elle se supprime, après réaffectation des
44 rattachements.

### 4.2 La strate magasin — celle qui travaille

261 catégories restantes ; **213 portent au moins un produit** (250 catégories
de l'arbre entier n'en portent aucune). Les grandes familles, total direct +
hérité :

| famille | total | remarque |
|---|---|---|
| GUITARES & BASSES | 693 | 9 enfants, structure saine |
| Accessoire guitares | 646 | **28 enfants à plat**, dont 12 sous 10 produits |
| Batterie & Percussion | 264 | |
| Partitions | 252 | 252 **en direct sur la racine**, 7 enfants tous vides |
| Accessoires sono | 197 | |
| Accessoires percussion | 152 | racine, **et** enfant de « Accessoires instru » |
| Cables | 86 | recoupe « Jack / cables guitare » (33) |
| Home studio | 74 | recoupe « Sonorisation » et « Accessoires sono » |
| ACCESSOIRES Divers | 68 | fourre-tout, aucun enfant |
| Lutherie | 55 | |
| Pianos & Claviers | 52 | |
| Harmonica | 43 | racine à 43 produits, sans parent |

Le défaut structurel est visible à l'œil : **l'instrument et son accessoire sont
des racines sœurs.** « GUITARES & BASSES » et « Accessoire guitares » ;
« Batterie & Percussion » et « Accessoires percussion » ; « Sonorisation »,
« Accessoires sono », « Home studio », « Cables » et « ✱ Cables & connectique »
se partagent le même rayon.

Côté produits : **268 n'ont aucune catégorie**, 140 en ont plusieurs, la moyenne
est de 0,96 rattachement par produit — le rattachement n'est pas aujourd'hui une
donnée fiable.

### 4.3 Arborescence cible proposée — logistique, 2 niveaux, 12 rayons

La règle : **niveau 0 = un rayon du magasin ; niveau 1 = une nature de
produit** — ce qu'on range, ce qu'on compte, ce qu'on réassortit. Pas de niveau
2. L'univers client (Guitare, Batterie, Piano) sort de l'arbre et devient une
**vue du site**, portée par le menu déjà édité dans le module `site` : un item
de menu agrège N catégories logistiques, une catégorie logistique nourrit N
univers.

| rayon cible | absorbe | ~produits |
|---|---|---|
| **Cordes & frettés** | GUITARES & BASSES (hors Cordes, hors Pédales), Instruments FOLK | 500 |
| **Cordes (consommable)** | Cordes (140), Jeux cordes lutherie, Cordes lutherie détail | 145 |
| **Claviers** | Pianos & Claviers, Accessoires clavier | 82 |
| **Batterie & percussions** | Batterie & Percussion, Accessoires percussion | 416 |
| **Vents & harmonica** | Instruments à vent, Accessoires vents (×2), Harmonica | 94 |
| **Lutherie (quatuor)** | Lutherie | 55 |
| **Sono, studio & micros** | Sonorisation, Accessoires sono, Home studio, ✱ Microphones, ✱ Studio | 305 |
| **Câbles & connectique** | Cables, Jack / cables guitare, Cable(s) speakon, Connecteur, Adaptateurs | 120 |
| **Effets & amplification** | Pédales (98), Amplis (75) | 173 |
| **Accessoires & pièces** | Accessoire guitares (28 enfants → ~10), ACCESSOIRES Divers, Produits Entretien, Goodies | 800 |
| **Partitions & méthodes** | Partitions (+ ses 7 enfants vides) | 252 |
| **Prestations & frais** | Prestation, Frais Divers, Mershandising | 12 |

Soit **12 rayons et de l'ordre de 90 à 110 catégories de niveau 1**, contre 463.

**Ce que deviennent les 463 :**

| sort | nombre | comment |
|---|---|---|
| supprimées — strate ✱ | **202** | après réaffectation de 44 rattachements |
| supprimées — vides hors ✱ | ~48 | 250 vides au total, moins la strate ✱ |
| fusionnées | ~30 | §5.1 |
| conservées, reparentées | ~150 | le nom survit, le parent change |
| conservées telles quelles | ~30 | feuilles déjà propres (Peaux Batterie, Anches, Médiators…) |

**Les produits ne perdent rien**, hors les 268 déjà sans catégorie, qui tombent
dans « Accessoires & pièces / À classer ». Un fichier de correspondance
`ancienne catégorie → rayon cible` couvre les 213 catégories vivantes, et rien
d'autre n'a besoin d'être décidé produit par produit.

**Et le slug ne bouge pas.** `frontend/lib/queries/slug.ts` dérive le slug du
**nom du produit**, jamais de sa catégorie : refondre l'arbre ne déplace aucune
page en ligne. La catégorie voyage comme rattachement, pas comme composante
d'URL.

---

## 5. Les doublons

### 5.1 Catégories

Sur nom normalisé (minuscules, accents et ponctuation retirés), dans NeDB :
**29 groupes, 59 catégories concernées, 30 à fusionner.** Dans PB-DEV, sur
`lower(name)` strict : **22 groupes**. Les plus lourds :

```
"GUITARES & BASSES" 2p          | "* Guitares & Basses" 0p
"Guitares électriques" 96p      | "Guitares électriques" <* G&B> 1p
"Accessoires sono" <RACINE> 98p | "Accessoires sono" <Accessoires instru> 0p
"Accessoires percussion" 74p    | "Accessoires percussion" <Acc. instru> 1p
"ACCESSOIRES Divers" 68p        | "Accessoires divers" <Lutherie> 7p
"Micro hf" 41p                  | "Micro hf" <Micro> 1p
"Batterie & Percussion" 24p     | "* Batterie & Percussion" 2p
```

En élargissant au singulier/pluriel **et en ne gardant que les catégories qui
portent réellement des produits**, 13 groupes restent — dont
`Micro (3p) | Micros (13p)`, `Housse (4p) | HOUSSES (3p)`,
`Cable speakon (4p) | Cables speakon (1p)`, `Harmonica (43p) | Harmonicas (1p)`.

**Ces treize-là sont les seuls qui demandent un arbitrage humain** ; les autres
opposent une catégorie vivante à une catégorie vide et se tranchent
mécaniquement — le vide disparaît. Et la refonte du §4.3 en absorbe la majeure
partie au passage.

### 5.2 Marques — déjà réglé

NeDB porte **8 groupes de doublons, 16 marques, 8 à fusionner** : `Clarke` /
`CLARKE`, `GATOR` / `Gator`, deux `WITTNER` de nom strictement identique, deux
`K&M` de même, `Cordoba` / `CORDOBA`, `Magneto` / `MAGNETO`, `LMPro` / `LM Pro`,
et deux `AKG` à zéro produit et zéro image.

**PB-DEV n'en porte plus aucun** : 281 marques, aucun doublon sur `lower(name)`.
La fusion a été faite à l'import du 11/08. Partir de PB-DEV, c'est hériter du
travail déjà fait ; refaire l'import depuis NeDB, c'est le réintroduire.

Restent **53 marques NeDB sans aucun produit**, à passer en revue séparément :
certaines sont probablement des marques à venir, pas des scories. 225 des 288
portent une image.

### 5.3 ⚠️ Les images de la marque perdante, côté serveur mutualisé

Le miroir nomme ses dossiers `<kind>/<legacy_id>/<rang>.<ext>` et **le ménage
distant n'efface que dans le dossier d'une entité qu'on lui envoie** (CLAUDE.md,
point 7). Fusionner deux entités ne lui envoie jamais le `legacy_id` de la
perdante : son dossier reste, avec ses octets, indéfiniment.

Les 8 fusions de marques ayant déjà eu lieu avant la campagne d'images du 20/08,
**le cas ne se pose pas pour elles**. Il se posera pour les ~30 catégories
fusionnées du §5.1. Trois options :

1. **Ne rien faire.** Quelques dossiers orphelins de taille dérisoire. Le
   contrat n'a aucune opération de suppression (DECISIONS, 2026-08-21) et on ne
   lui en ajoute pas pour ça.
2. **Vider avant de fusionner** : exporter la perdante avec une liste d'images
   vide — ce qui déclenche le ménage distant sur son dossier — puis fusionner.
   Aucun code nouveau, un geste manuel par fusion, et il est destructeur : si
   l'ordre s'inverse, on perd l'image de la survivante.
3. **Une action d'inventaire distante** listant les `legacy_id` connus de
   `images-sync.php` et absents de PocketBase. Utile bien au-delà des fusions —
   les 1,7 Go orphelins du §3 posent la même question — mais c'est un ticket à
   part.

**Recommandation : option 2 pour les catégories fusionnées qui portent une
image, option 3 en ticket séparé.**

---

## 6. Recommandation — voie (b), l'import refait

**Décision du propriétaire, 24 août 2026 : les collections catalogue de PB-PROD
peuvent être effacées, aucun produit né en caisse n'y compte.** Le catalogue de
PB-PROD est d'ailleurs déjà vide. La garde n'a donc rien à protéger *ici*, et
l'argument « on perdrait des entités irremplaçables » tombe.

**Et l'historique ne s'y oppose pas non plus** : le SKU des instantanés recolle
96,7 % de l'inventaire et 97,3 % des mouvements vers la NeDB actuelle — mieux
que le pont `legacy_id`. Seules les lignes de facture y perdent 4 points, sans
aucun effet sur les totaux ni sur les Z (§1).

**Ce qui emporte la décision est ailleurs : (b) permet de refonder l'arbre et
de fusionner en une seule passe**, à l'import, au lieu de reprendre 3000
produits déjà écrits. (a) livrerait le catalogue de PB-DEV tel quel — 464
catégories, 22 groupes de doublons, la strate ✱ comprise — et il faudrait tout
corriger ensuite dans une base vivante.

**Ce que (b) oblige à refaire, et qu'il faut assumer :** les 8 fusions de
marques (§5.2), déjà faites à l'import du 11/08 et que PB-DEV porte proprement.
C'est le seul travail perdu, et il est petit — huit décisions, toutes des
variantes de casse.

L'ordre proposé :

1. **Corriger la garde 2** de `MigrateCatalogV2` pour qu'elle appelle
   `load.Inspect` (§3). Elle ne bloquera rien aujourd'hui, PB-PROD étant vide ;
   c'est précisément le bon moment pour la corriger, et elle protégera la suite.
2. **Écrire les tables de correspondance**, versionnées dans le dépôt et
   consultées par l'import : `ancienne catégorie → rayon cible` pour les 213
   catégories vivantes, `marque perdante → survivante` pour les 8 groupes.
   **On n'écrit jamais dans AppPos** : ces fichiers vivent ici.
3. **Simuler l'import** — `go run ./backend/cmd/catalog-reprise`, lecture
   seule. ✅ Fait.
4. **Importer** dans PB-PROD, PocketApp fermé, `-apply` lancé par le
   propriétaire — la sauvegarde est prise par l'outil, pas demandée à
   l'opérateur.

   ⚠️ **`-images-secours` n'est pas optionnel en pratique.** 1334 fichiers
   déclarés par NeDB ne sont plus sous `public/` ; sans le repli vers le
   `storage` de PB-DEV, **433 produits publiés perdraient leur image**. Ce
   n'est pas qu'un défaut d'affichage : `image_checksum` changerait, les fiches
   passeraient « modifiées », et un ré-export déclencherait le ménage distant —
   qui efface les rangs que la nouvelle liste ne désigne plus. Avec le repli :
   8 produits publiés concernés au lieu de 433.

   ```
   go run ./backend/cmd/catalog-reprise -apply -images-secours "<pb_data - Copie>\storage"
   ```
5. ~~Recoller l'historique par SKU~~ — **inutile, vérifié le 24/08 après la
   décision de conserver les clés.** `InventoryPage.tsx:278-287` retrouve un
   produit par `product_id` « quelle que soit sa forme, `id` ou `legacy_id` »
   (`indexCatalogueParCle`). Les `product_id` de PB-PROD ÉTANT les `legacy_id`
   qu'on conserve, l'historique se recolle sans qu'on écrive une ligne. Aucune
   passe, aucun risque.
6. **Ré-exporter** vers le site : le rattachement change, le slug non — il est
   dérivé du nom du produit — donc aucune page ne bouge. Attention toutefois :
   les clés étant CONSERVÉES (décision du 24/08), le miroir d'images reste
   valide : **rien ne repart**. C'était le seul vrai coût de (b), et il est
   annulé.
7. **Effacer les 1,7 Go orphelins** de `pb_data/storage`, une fois vérifié.

**Ce qui vous revient et n'est pas automatisable :** la table de correspondance
des 213 catégories vers les 12 rayons, et l'arbitrage des 13 fusions du §5.1.

### Le point tranché le 24 août : on conserve les clés

**(b) sur le catalogue, (a) sur les clés.** Les `legacy_id` existants sont
repris par SKU (puis par nom s'il est unique) depuis
`backend/catalog/mapping/cles-stables.json` ; seuls les produits vraiment
nouveaux en reçoivent une neuve. Mesuré à la simulation : **2898 par SKU,
128 par nom, 29 neuves.** Le miroir d'images reste valide, l'historique se
recolle seul, et le pont des factures survit.

Voir `docs/DECISIONS.md`, bloc du 2026-08-24, pour ce qui a été écarté — et
pour les 33 collisions que ce choix a fait apparaître.

**Ce qui reste ouvert et n'est pas touché ici :** les 5 factures avortées à
2 108,47 €, et les 115 numéros en double sur 1198.
