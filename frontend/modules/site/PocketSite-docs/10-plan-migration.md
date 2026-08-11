# Plan de migration — NeDB vers PocketBase, tout en local

**Écrit le 10 août 2026.** Suite de
[`09-modele-cible.md`](09-modele-cible.md), dont le modèle est **arrêté** et
consigné dans [`docs/DECISIONS.md`](../../../../docs/DECISIONS.md). Le rituel
[`08-rituel-migration-pocketbase.md`](08-rituel-migration-pocketbase.md)
n'autorisait aucun plan avant cette validation ; elle est acquise.

> ## ⚠ Avertissement — 11 août 2026
>
> **La base NeDB de référence a changé.** Elle n'est plus
> `I:\AppPOS\AppServe\data` (développement) mais
> **`%APPDATA%\AppPOS\data` (installation)** — décision du propriétaire.
>
> | | produits | catégories | marques | fournisseurs |
> |---|---:|---:|---:|---:|
> | **installation — référence** | **3034** | **463** | **287** | **43** |
> | développement — périmée | 2306 | 219 | 224 | 34 |
>
> **Tous les chiffres mesurés avant cette date le sont sur la base périmée**,
> ici comme dans [`09-modele-cible.md`](09-modele-cible.md) et
> [`07-audit-flux-apppos.md`](07-audit-flux-apppos.md). Les sections T2 et T3
> ci-dessous portent leurs chiffres d'origine, entre parenthèses, et les
> chiffres de référence en gras. Les autres documents ne sont **pas** réécrits :
> ils sont datés, et le §9 dit ce qu'ils ont de faux.

**Ce document décrit ce qu'il faut écrire. Il n'écrit rien.**

Trois niveaux de fiabilité, tenus comme dans le 09 : **constaté** (lu ou mesuré,
avec la source), **proposé** (mon avis, avec ce qu'il écarte), **ouvert**.

---

## 1. Ce que ce plan fait, et ce qu'il ne fait pas

**Il fait :** lire la base NeDB **dev** (`I:\AppPOS\AppServe\data`) en lecture
seule, et charger le catalogue dans le PocketBase **local** au modèle du §3
du 09 — **2306 produits, 219 catégories, 224 marques, 34 fournisseurs**.

**Les quatre effectifs sont vérifiés** par T2, le 10 août 2026. Deux
corrections à des documents antérieurs :

- **34 fournisseurs, pas 43.** Le rituel se contredisait lui-même — 43 au §3,
  34 au tableau du §4bis.6. C'est 34.
- **2306 produits, et le 2307 relevé un temps était une erreur de lecture :**
  NeDB intercale des lignes `$$indexCreated` sans `_id`, qui ne sont pas des
  documents. 3 dans `products.db`, 2 dans `categories.db`, 1 dans `brands.db`
  et `suppliers.db`. Un lecteur qui ne les écarte pas surcompte.

**Il ne fait pas**, et aucun ticket n'y touche :

- **rien vers la production** — ni le site, ni `%APPDATA%\AppPOS\data`, ni le
  serveur mutualisé ;
- **aucune modification d'AppPos** — la caisse en dépend (`CLAUDE.md`) ;
- **aucune bascule de lecture** vers PocketBase — c'est le ticket suivant, T7,
  et il reste par défaut sur AppPos ;
- **aucune correction silencieuse de données** — les anomalies se **constatent
  et se rapportent**, elles ne se réparent pas au passage (§2).

**Sens unique.** NeDB est lue, jamais écrite. Si la migration se trompe, on vide
PocketBase et on relance : la source est intacte.

---

## 2. Les prérequis de données — avant la première écriture

**Constaté** — relevé du 09 (§7) et de l'audit. Chacun est **bloquant ou
déclarant**, et aucun ne se règle dans le code de chargement.

| Anomalie | Nombre | Traitement |
|---|---|---|
| SKU en doublon | **6** | **bloquant** — `sku` devient unique. L'unicité étant `(company, sku)` et tout allant dans une seule entreprise, la contrainte composite ne les sauve pas. *(7 dans la donnée brute ; `-----` normalisé en vide en retire un — voir T3)* |
| produit nommé `/` | **1** | **bloquant** — découvert par T3, `name` requis mais inexploitable |
| `tax_rate` en chaîne (`"0"`, `"20"`) | 7 | normalisation, décidée : nombre |
| `margin_rate` de type mixte | — | sans objet : le champ est supprimé |
| marges incohérentes avec les deux hypothèses du §1 | **16** | **à examiner avant**, pas après : `margin_*` étant supprimés, ces cas disparaîtraient sans avoir été vus |
| marques en double (« Gator », « Carl Martin », « CORDOBA », « K&M ») | **4** | déclaratif — découvert par T3, fusion à faire |
| `brand_id` orphelins | 4 | vers un identifiant fantôme unique — relation laissée vide, et **rapportée** |
| `category_id` orphelins | 4 | idem |
| produits `published` jamais mis en ligne | **222** | **déclaratif** — à lister, pas à corriger |
| produits `draft` pourtant en ligne | **5** | idem |

**Les doublons de SKU ne se tranchent pas ici :** fusionner, suffixer ou vider
est une décision métier. Ce plan la signale, il ne la prend pas.

### 2 bis. Correction du plan — rien de tout cela ne bloque la phase locale

**Écrit le 11 août 2026, sur remarque du propriétaire, et c'est une correction
de fond.**

La première rédaction posait un « point d'arrêt décisionnel entre T3 et T4 » :
les anomalies bloquantes devaient être réglées dans AppPos avant tout
chargement. **C'était faux, pour trois raisons.**

1. **La base dev n'est pas la référence.** La production porte 3034 produits
   contre 2306, écart jamais expliqué. Trancher les deux Penta Harp sur la dev,
   c'est décider sur des données qui ne sont pas celles qu'on migrera. Travail
   jetable.
2. **Le rituel interdit de toucher à la production.** Une migration qui *exige*
   une source corrigée est une migration qui ne pourra jamais tourner sur la
   vraie base.
3. **Ce n'est pas ce que la phase locale doit prouver.** Elle doit établir que
   le tuyau fonctionne, pas que le catalogue est parfait.

**Le chargeur met donc en quarantaine au lieu de refuser.** Ce n'est pas un mode
dégradé, c'est le comportement normal :

- ce qui est sain se charge — 2299 produits sur 2306 ;
- ce qui est bloquant est **écarté et listé** ; le rapport de rejet *est* la
  liste de travail ;
- rien n'est corrigé, rien n'est perdu, aucune décision métier n'est prise par
  l'outil.

**Les décisions restent dues** — elles appartiennent à la migration de
production, que la décision du 10 août sépare explicitement de cette phase.

**Quand la production viendra**, les mêmes classes d'anomalies reviendront, en
plus grand nombre, et il sera toujours interdit de modifier AppPos. Les
corrections devront donc vivre **hors de la source** : un fichier de corrections
versionné ici, appliqué à la normalisation (`0ZXO3LxD4gtQS6qq → name =
designation`). Rejouable, traçable, et il survit à un rechargement. **À ne pas
écrire maintenant** — tant qu'on n'a pas vu les anomalies de la vraie base, on
dimensionnerait à l'aveugle. Mais le chargeur est conçu pour l'accueillir.

---

## 3. Le problème des identifiants — et sa réponse

**Constaté** (audit §4bis.5) : le `_id` NeDB tient comme clé, mais l'espace
n'est pas homogène — préfixes `cat_*`, longueurs de 8 à 30 caractères.

**PocketBase v0.22.22** (`go.mod:7`) génère des identifiants de **15
caractères**, et un identifiant fourni doit respecter ce format.
**À vérifier avant T4** — c'est le seul point du plan qui repose sur une
connaissance du moteur plutôt que sur une lecture de ce dépôt. S'il se
confirme, **les `_id` NeDB ne peuvent pas être réutilisés tels quels.**

**Proposé — un champ `legacy_id`, indexé, sur les quatre collections.**

- PocketBase génère ses identifiants ; `legacy_id` conserve le `_id` NeDB ;
- les relations se résolvent **pendant le chargement**, par une table de
  correspondance en mémoire `legacy_id → id` ;
- la migration devient **rejouable et vérifiable** : on peut à tout moment
  rapprocher un enregistrement PocketBase de sa source.

**C'est un champ de la case « à garder temporairement » du §4 ter du rituel, et
il porte donc une date de péremption :** `legacy_id` se supprime quand AppServe
est abandonné et qu'aucune réconciliation ne s'y appuie plus. Sans cette
échéance écrite, il devient un `woo_id` de plus.

**Écarté — forcer les `_id` NeDB comme identifiants PocketBase :** suppose que
le format le permette pour les 2792 enregistrements, ce qui est faux dès qu'un
`_id` ne fait pas 15 caractères. Et cela lierait durablement le nouveau modèle à
l'ancien.

**Écarté — ne rien conserver :** la vérification post-chargement (§6) devient
impossible, et la reprise des 222 + 5 anomalies aussi.

---

## 4. Où vit le code de migration

**Proposé, et c'est une décision d'architecture, pas de confort.**

**Pas dans `RunMigrations`.** `backend/migrations/migrations.go` s'exécute **à
chaque démarrage** de l'application. Un import de données n'est pas une
migration de schéma : il lit un répertoire externe, il est long, et il n'a rien
à faire dans le chemin de démarrage de la caisse.

**Proposé : une commande autonome**, hors du binaire Wails — par exemple
`backend/cmd/catalog-import/`. Elle prend en paramètres le répertoire NeDB et
l'entreprise cible, et elle se lance à la main.

**Ce qui reste dans `RunMigrations` :** le **schéma seul** (T1), inscrit dans la
liste de
[`migrations.go:13`](../../../../backend/migrations/migrations.go) — faute de
quoi il ne s'exécute jamais, sans erreur (`CLAUDE.md`).

**Écarté — un script Node ou Python :** le dépôt est Go et TypeScript ; la
lecture NeDB et l'écriture PocketBase se font mieux depuis Go, avec le même DAO
que l'application. Un troisième langage pour un outil qu'on relancera vingt fois
est un coût sans contrepartie.

---

## 5. Les tickets — mergeables seuls, sans effet observable

Découpage conforme au §7.3 du rituel. **Chacun se merge sans rien changer pour
l'utilisateur**, jusqu'à T7 qui est le seul à porter un drapeau.

### T1 — Le schéma cible

Une **nouvelle migration**, inscrite dans `migrations.go:13`. Elle ne modifie
pas `catalog.go` : les `ensure*Collection` sortent si la collection existe par
son nom (`catalog.go:17, 88, 163, 257`), donc l'éditer ne changerait aucune base
installée (`CLAUDE.md`).

Elle **recrée** les quatre collections du catalogue au modèle du §3 du 09 —
décision consignée : elles sont vides et n'ont jamais servi, la recréation est
sans risque et rend la migration rejouable.

**« Recréer » veut dire ces quatre collections, et elles seules.** La base réelle
en porte 23, dont la caisse, les factures, l'inventaire et le menu du site.
**Supprimer `data.db` est exclu.**

Contenu :

- les quatre collections au modèle cible, `company` requis ;
- **`categories.parent` réparé** — il cible actuellement une collection vide
  (§9.3 du 09), défaut invisible tant que la collection l'est aussi ;
- `external_refs` créée — trois relations optionnelles, une seule remplie ;
- `legacy_id` indexé sur les quatre ;
- **index uniques composites** `(company, sku)`, `(company, slug)` — et non
  globaux, le catalogue étant multi-entreprise ;
- `designation`, absent du schéma actuel alors que la caisse le consomme.

**Vérification :** l'application démarre, les 23 collections sont là, les quatre
du catalogue ont le nouveau schéma, `parent` cible bien `categories`.

### T2 — Le lecteur NeDB, en lecture seule — **fait le 10 août 2026**

`backend/catalog/nedb/reader.go` (reconstruction) et
`backend/cmd/catalog-import/` (rapport). **N'écrit nulle part** — ni dans NeDB,
ni dans PocketBase.

```bash
go run ./backend/cmd/catalog-import            # effectifs et comptabilité
go run ./backend/cmd/catalog-import -fields    # recensement des champs
```

**Résultat : 2306 / 219 / 224 / 34, conformes.**

Le rapport ne donne pas qu'un total : il rend la **comptabilité de lecture** —
lignes, vides, métadonnées, données, réécritures, suppressions, documents. Un
total seul ne permet pas de vérifier qu'on a bien lu ; l'arithmétique, si.
Sur la base dev : **0 ligne illisible, 0 réécriture, 0 suppression** — le
journal NeDB est propre, chaque document n'y figure qu'une fois.

**Ce que T2 a établi de neuf :**

- les lignes `$$indexCreated` sans `_id` ne sont pas des documents, et les
  compter surestime les effectifs (§1) ;
- **les six champs morts sont confirmés indépendamment** — `categories_refs`,
  `category_ref`, `description_short`, `specifications`, `sync_errors`,
  `woo_status`, tous à 0 document sur 2306. Le recensement les marque seul ;
- **52 champs sur `products`**, dont **21 à types mixtes** — `tax_rate` en
  `number|string`, `margin_rate` en `null|number|string`, `dateSoumission`,
  `last_sync`, `last_sold_at` et `updated_at` en `object|string`. PocketBase
  étant typé, c'est la matière de T3.

**Garde de production.** La commande refuse un répertoire ressemblant à
`%APPDATA%\AppPOS\AppPOS\data` sauf `-allow-production`. La lecture seule y
serait techniquement sans danger, mais un rapport produit sur la production et
lu comme venant de la dev conduirait à des décisions fausses — l'écart de
728 produits entre les deux bases n'est toujours pas expliqué (§8 du rituel).
Le rapport affiche systématiquement le chemin lu.

### T3 — Normalisation et rapport d'anomalies — **fait le 10 août 2026**

`backend/catalog/normalize/`. **N'écrit nulle part** : produit des structures
en mémoire et un rapport.

```bash
go run ./backend/cmd/catalog-import -normalize            # rapport
go run ./backend/cmd/catalog-import -normalize -detail 0  # tous les cas
```

**Verdict : 2 natures bloquantes, 7 cas — mis en quarantaine par T4**, pas
opposés au chargement (§2 bis).

| Anomalie | Cas | Niveau |
|---|---:|---|
| SKU en doublon | **6** | bloquant |
| **nom inexploitable** | **1** | bloquant |
| publié mais jamais mis en ligne | 222 | déclaratif |
| slug désambiguïsé | 30 | déclaratif |
| marge incohérente avec les deux hypothèses | 16 | déclaratif |
| marque orpheline | 6 | déclaratif |
| brouillon pourtant en ligne | 5 | déclaratif |
| catégorie orpheline | 4 | déclaratif |
| SKU de remplissage | 3 | déclaratif |

**Trois écarts avec les chiffres annoncés au §2, tous expliqués :**

- **6 doublons de SKU et non 7** : `-----` est normalisé en vide *avant* le
  contrôle d'unicité, donc ses 3 porteurs ne se collisionnent plus. Il restait
  bien 7 collisions dans la donnée brute ; il n'en reste que 6 à trancher.
- **16 marges incohérentes et non 12** : l'audit mesurait sur les 648 produits
  portant les cinq champs ; ce contrôle porte sur tous ceux ayant un prix
  d'achat. Plusieurs des 4 cas supplémentaires ont `tax_rate = 0`, ce qui rend
  les deux hypothèses de prix indiscernables.
- **847 correspondances WooCommerce et non 842** : 847 produits portent un
  `woo_id` ; l'audit comptait 842 « effectivement en ligne ». La définition
  diffère, et l'écart est à trancher en T5.

**Deux découvertes, absentes de tous les documents antérieurs :**

1. **Un produit nommé `/`** — `0ZXO3LxD4gtQS6qq`, `published`, 209 €, en stock.
   Son vrai libellé est dans `designation` : « CR77 MICRO Dynamic Stage Vocal ».
   `name` étant requis, il passerait le contrôle et écrirait une donnée fausse.
   Classé bloquant à ce titre : le chargement n'échouerait pas, il mentirait.
2. **Quatre marques en double** — « Gator », « Carl Martin », « CORDOBA » et
   « K&M » existent chacune deux fois, sous deux identifiants. Sans conséquence
   sur le chargement, les slugs étant désambiguïsés ; mais c'est une fusion à
   faire, et personne ne le savait.

**Ce que la normalisation fait, et ne fait pas.** Elle traduit : `tax_rate` en
nombre (7 conversions), `meta_data` en `barcode`, `contact` à plat, les slugs
fabriqués. Elle ne répare rien — un doublon reste un doublon, un orphelin reste
orphelin. Le rituel l'exige (§8 du 08) : identifier, pas corriger en silence.

### T3 — spécification d'origine

Transformation vers le modèle cible, **sans écrire dans PocketBase** :

- `barcode` extrait de `meta_data` — la logique existe déjà côté front,
  `extractBarcode` ([`apppos-transformers.ts:24`](../../../lib/apppos/apppos-transformers.ts)) ;
- `tax_rate` normalisé en nombre ;
- `slug` fabriqué — pour les catégories **avec le parent**, « Accessoires »
  existant deux fois ;
- `status` conservé, `type` conservé (`simple` / `service`) ;
- les champs supprimés du §3 du 09 simplement ignorés.

**Sortie principale : le rapport d'anomalies du §2.** C'est lui qui autorise T4.

### T4 — Le chargeur — **écrit le 11 août 2026, pas encore exécuté**

`backend/catalog/load/loader.go`. **Seul chemin de ce chantier qui écrit.**

```bash
# PocketApp doit être FERMÉ : SQLite n'accepte qu'un écrivain.
go run ./backend/cmd/catalog-import -load
```

L'écriture est derrière un drapeau explicite : sans `-load`, la commande reste
en lecture seule. `-pb` permet de viser une autre base que
`%LOCALAPPDATA%\PocketReact\pb_data`.

**Une seule transaction.** Purge et chargement des quatre collections s'y
déroulent ensemble : au moindre échec, tout est annulé et les collections
restent vides plutôt qu'à moitié pleines.

**Ce que le chargeur ne fait pas :** il ne corrige rien, ne choisit pas
d'entreprise, ne touche jamais NeDB, et n'écrit que dans les cinq collections
du catalogue — les 19 autres (factures, clients, caisse, menu) ne sont ni lues
ni purgées.

**Rapport produit à chaque exécution :** purge, chargé par collection,
quarantaine détaillée, et **relations perdues comptées** — une relation qui
disparaît parce que sa cible a été écartée est une donnée fausse, elle ne doit
pas s'évaporer en silence.

### T4 — spécification d'origine

Ordre imposé par les dépendances de relations :

```
entreprise (résolue, pas créée) → brands → categories → suppliers → products
```

Les catégories se chargent **en deux temps** : les enregistrements d'abord,
`parent` ensuite, une fois toutes les correspondances connues — un arbre ne se
charge pas dans l'ordre d'un fichier.

**Rejouabilité par purge, pas par convergence :** la commande vide les quatre
collections dans l'ordre inverse, puis charge. C'est la leçon du §9.5 du 09 —
l'idempotence par sortie anticipée produit une convergence silencieusement
fausse.

**Règle d'entreprise, à écrire noir sur blanc :** une entreprise et une seule
doit exister ; la migration s'y rattache. Zéro → elle s'arrête, c'est un
prérequis. Plusieurs → elle s'arrête et demande laquelle. **Constaté** : il y en
a une aujourd'hui, `SARL GALICHET`. La règle vaut pour demain.

**Tout ou rien.** Une transaction par collection au minimum ; un échec laisse
les quatre collections vides plutôt qu'à moitié pleines.

### T5 — `external_refs`

Alimentée depuis `woo_id`, `website_url` et `last_sync` des quatre entités
NeDB : une ligne par entité **effectivement en ligne**, `platform =
woocommerce`.

**Attendu : 842 produits en ligne** sur 1064 `published` — et c'est le contrôle
de ce ticket. L'absence de ligne signifie « jamais publié », ce que
`pending_sync` ne savait pas exprimer (§3.5 du 09).

**`pending_sync` n'est pas repris** : il signifie « déjà publié et modifié
depuis », pas « à publier » (audit §2.2). Le transposer importerait le
contresens.

### T6 — Les contrôles de conformité

Rejouables, en lecture seule, sur PocketBase cette fois :

- comptages par collection, égaux à ceux de T2 ;
- **aucune relation orpheline** — hors les 4 + 4 déjà rapportés ;
- l'arbre des catégories a la même forme qu'en NeDB : mêmes racines, mêmes
  profondeurs, 219 nœuds ;
- la règle de publication dérivée donne le **même ensemble** de catégories en
  ligne qu'aujourd'hui — vérifiée exacte sur la base dev, 0 écart : elle doit le
  rester après migration ;
- `legacy_id` unique et présent partout ;
- échantillon de 20 produits comparés champ à champ à leur source.

**C'est ce ticket qui dit si la migration est bonne**, pas l'absence d'erreur au
chargement.

### T7 — La bascule de lecture, drapeau par défaut sur AppPos

Le seul ticket à effet observable, et il n'en a aucun tant que le drapeau n'est
pas retourné (§7.4 du rituel).

Le module `stock` lit AppPos via `useStockModule`
([`useStockModule.ts:74-92`](../../stock/useStockModule.ts)). Un drapeau choisit
la source ; **par défaut, AppPos.** On compare les deux écrans côte à côte, dans
un navigateur, pas en lisant le code (§7.5).

**Contrainte, rappelée par `CLAUDE.md` :** il existe déjà **deux chemins
d'écriture**, et `useUpdateProductUniversal`
([`products.ts:180`](../../../lib/queries/products.ts)) route entre eux sur une
chaîne non typée. **Ne pas en créer un troisième.** Le module a par ailleurs
deux implémentations parallèles de chaque écran (`BrandList` /
`BrandListAppPos`, etc.) : la migration est l'occasion d'en **supprimer** une.

---

## 6. L'ordre, et ce qui bloque quoi

```
T1 schéma ──┐
T2 lecture ─┼─→ T3 anomalies ─→ [décision : les 7 SKU] ─→ T4 chargement
            │                                                   │
            └───────────────────────────────────────────────────┼─→ T5 external_refs
                                                                └─→ T6 contrôles ─→ T7 bascule
```

**T1 et T2 sont indépendants** et peuvent être menés en parallèle : l'un touche
le schéma, l'autre ne touche rien.

**Le seul point d'arrêt décisionnel est entre T3 et T4** : les 7 SKU en doublon.
Tout le reste s'enchaîne.

---

## 7. Ce que ce plan laisse ouvert

- **Les 7 SKU en doublon** — fusionner, suffixer, ou vider ? Décision métier,
  bloquante pour T4.
- **Les 12 produits à marge incohérente** — à examiner avant que `margin_*` ne
  disparaisse.
- **Le format d'identifiant PocketBase v0.22** — §3, seul point reposant sur une
  connaissance du moteur et non sur une lecture de ce dépôt. À vérifier avant
  T4 ; s'il permettait les `_id` NeDB, `legacy_id` resterait quand même
  préférable, mais l'argument changerait.
- **La date de péremption de `legacy_id`** — à fixer quand l'abandon d'AppServe
  sera daté.
- **Ce qui, dans la caisse, dépend d'AppServe** — question §6.5.3 du rituel,
  **toujours sans réponse**. Elle ne bloque pas ce plan, qui ne touche pas à
  AppPos ; elle bloquera la suite. Le relevé du terminal (§8 du 09) en a fait la
  moitié : la caisse ne consomme que dix champs produit.
- **Comment `frontend-wp` lit en local** — §6.5.4 du rituel. Le contrat de
  données s'écrit **avant** le code qui le consomme, donc pas ici.

---

## 8. Ce que ce plan ne referme pas, et qui reste prioritaire

**La faille 3.1 — clés WooCommerce en lecture-écriture dans le bundle public du
site.** Déclarée prioritaire depuis le premier jour, jamais traitée. La sortie
de WooCommerce la refermera ; **elle ne doit pas attendre cette mission.**

Également hors périmètre, et consignés pour ne pas être perdus :

- `GET /api/settings/pocketapp-key` renvoie une clé déchiffrée **sans garde
  admin** (`backend/routes/secrets_routes.go:125`) ;
- les identifiants AppPos en dur dans huit fichiers
  (`loginToAppPos('admin', 'admin123')`) ;
- les règles d'accès du catalogue sont `@request.auth.id != ''`, **sans
  filtrage par entreprise** (`catalog.go:33-37`) : sans effet avec une seule
  entreprise, faille d'isolation dès la deuxième ;
- `site_menu` hors de `pocketbase-types.ts`.

---

## 9. État réel au 11 août 2026

**T1 à T4 sont faits, exécutés et vérifiés.** Le catalogue de référence est
chargé dans le PocketBase local.

### 9.1 Ce qui est en base

| Collection | Chargé | Source |
|---|---:|---:|
| products | **2999** | 3034 − 35 en quarantaine |
| categories | **463** | 463 |
| brands | **287** | 287 |
| suppliers | **43** | 43 |
| external_refs | **0** | T5, non fait |

**Images : 4665 fichiers, 1,7 Go** dans le stockage PocketBase — 225 logos de
marque, 36 images de catégorie, les images produit et 747 galeries. L'arbre des
catégories est reconstruit **sans un seul parent introuvable**.

### 9.2 Anomalies sur la base de référence

| Anomalie | Cas | Niveau |
|---|---:|---|
| SKU en doublon | **35** | bloquant — en quarantaine |
| publié mais jamais mis en ligne | 160 | déclaratif |
| brouillon pourtant en ligne | **97** | déclaratif |
| slug désambiguïsé | 79 | déclaratif |
| marge incohérente | 7 | déclaratif |
| catégorie orpheline | 4 | déclaratif |
| taux de TVA absent | 1 | déclaratif |

**97 brouillons en ligne contre 5 sur la base dev.** L'écart est trop grand
pour être ignoré : il dit que la publication a beaucoup dérivé depuis la copie
de développement. À reprendre avec T5.

Le produit nommé `/` de la base dev **n'existe pas** dans la base de référence.

### 9.3 Ce que le modèle a dû corriger après le premier chargement

Quatre défauts, tous relevés par le propriétaire ou par la vérification qui a
suivi. Ils sont consignés ici parce qu'ils disent **comment** on s'est trompé :

1. **Les galeries produit étaient perdues.** L'audit avait mesuré
   `gallery_images` à 0 % sur les catégories et les marques ; la conclusion a
   glissé aux produits sans vérification. **747 produits** en portent une.
2. **Les images de catégorie chargeaient vide.** Leur champ `image` est un
   OBJET, comme celui des produits, et il était lu comme une chaîne.
3. **Le champ image des marques avait été supprimé** sur la mesure « 0 sur
   224 ». La mesure était juste, **la base ne l'était pas** : la référence en
   porte 225 sur 287.
4. **Les images ne survivaient pas à AppServe.** `image.src` est un chemin que
   seul AppServe sert ; `source_url`, que l'audit §1.3 donnait pour la source
   des URL, **n'existe pas**. D'où le passage en champs fichier et la copie.

**La leçon commune : une mesure juste sur la mauvaise base est une mesure
fausse.** Les quatre défauts viennent de là, pas d'une erreur de raisonnement.

### 9.4 Ce qui reste ouvert

- **36 images n'existent que sur WordPress.** Leur URL est dans
  `wp_image_url`. Les télécharger suppose un `User-Agent` explicite : la couche
  anti-bot d'axemusique.shop rejette celui de Go (`CLAUDE.md`).
- **261 homonymes dans `public/`.** L'index par nom retient le premier trouvé,
  ce qui est arbitraire. Ne concerne que les 63 images résolues par nom.
  **Non vérifié** : ce sont probablement des copies d'un même fichier.
- **Les 35 SKU en doublon**, en quarantaine, jamais tranchés.
- **`pnpm typegen` reste interdit** tant que `apppos-transformers.ts` n'est pas
  aligné sur le nouveau schéma : 21 fichiers référencent `price_ht`,
  `cost_price`, `active`, `stock_max`, `unit`, `weight`.

### 9.5 La trajectoire annoncée, qui change la nature de l'outil

**Propriétaire, 11 août 2026.** À terme :

1. **PocketApp importera depuis l'API AppPos** à laquelle il est déjà connecté,
   et non depuis les fichiers NeDB ;
2. **le module stock aura un sélecteur AppPos ↔ PocketBase.**

Conséquence directe : `backend/catalog/nedb/` est **transitoire**. Il a servi à
établir le modèle, le chargeur et les contrôles ; le chemin durable passera par
`frontend/lib/apppos/`, déjà en place. Le sélecteur, lui, **est** le drapeau de
T7 — le plan le prévoyait déjà, par défaut sur AppPos.

Rien de tout cela n'invalide T1 à T4 : le schéma, la normalisation, la
quarantaine et les contrôles se réutilisent tels quels quelle que soit la
source. Seul le **lecteur** change.

---
