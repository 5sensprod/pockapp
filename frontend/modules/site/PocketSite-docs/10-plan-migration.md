# Plan de migration — NeDB vers PocketBase, tout en local

**Écrit le 10 août 2026.** Suite de
[`09-modele-cible.md`](09-modele-cible.md), dont le modèle est **arrêté** et
consigné dans [`docs/DECISIONS.md`](../../../../docs/DECISIONS.md). Le rituel
[`08-rituel-migration-pocketbase.md`](08-rituel-migration-pocketbase.md)
n'autorisait aucun plan avant cette validation ; elle est acquise.

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

**Proposé — l'ordre compte.** Les deux premières lignes bloquent le chargement ;
les autres non. Le ticket T3 produit le **rapport d'anomalies**, et c'est lui qui
dit si T4 peut tourner. Écrire T4 avant d'avoir lu ce rapport, c'est découvrir
les 7 doublons dans un message d'erreur d'index unique.

**Les 7 doublons de SKU ne se tranchent pas ici :** fusionner, suffixer ou vider
est une décision métier. Ce plan la signale, il ne la prend pas.

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

**Verdict : 2 natures bloquantes, 7 cas. T4 ne doit pas tourner avant leur
règlement.** La commande sort en erreur tant qu'il en reste.

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

### T4 — Le chargeur, idempotent par purge

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
