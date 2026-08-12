# Décisions

Ce que le code ne peut pas dire : pourquoi il est comme ça, et surtout ce qui a
été écarté. Une décision = un bloc. On ajoute en haut. **On ne réécrit jamais un
bloc existant** — une décision annulée reçoit un nouveau bloc qui l'annule, et
la mention `— annulée le <date> par <titre>` est ajoutée sur l'ancienne.

Format : titre, date, la décision en une phrase, les options écartées et
pourquoi, ce qui pourrait la remettre en cause.

---

## L'endpoint de lecture du catalogue est public et sans clé — 2026-08-11

`server/api/catalog.php` n'attend **aucun** `X-API-Key`, et ne doit jamais en
attendre. Mis en service le 11 août 2026 : le site lit ses premiers produits
hors WooCommerce.

**Pourquoi, en une phrase :** son consommateur est un bundle JavaScript public,
et tout secret qu'il porterait serait lisible par n'importe quel visiteur.

C'est très exactement la faille 3.1 — `VITE_WC_CONSUMER_KEY` et
`VITE_WC_CONSUMER_SECRET`, en lecture-écriture, dans le bundle du site. Elle est
déclarée prioritaire depuis le premier jour et jamais traitée. **On ne la
reproduit pas en la déplaçant sur notre propre base.**

**La protection n'est pas une clé, c'est la portée :**

- que des `SELECT`, sur des données déjà destinées à être publiques ;
- aucune écriture, aucune suppression ;
- ni `purchase_price_ht`, ni fournisseur, ni marge, ni stock d'alerte — la
  liste des champs publiés est énumérée, pas obtenue par soustraction ;
- l'écriture reste derrière `products-sync.php` et sa clé, que seul PocketApp
  détient.

**Écarté — une clé « de lecture » dans le bundle :** elle n'authentifie
personne. Elle donne l'illusion d'une protection tout en étant publique, ce qui
est pire que pas de clé du tout : on finit par lui confier des données qu'on
n'aurait pas exposées sans elle.

**Écarté — restreindre par `Origin` ou `Referer` :** ces en-têtes sont posés par
le client. Ils gênent un navigateur, jamais un script.

**Remise en cause si :** on veut publier par cet endpoint une donnée qui n'est
pas publique — un prix réservé, un stock exact, un client. Alors ce n'est plus
le même besoin, et il lui faudra son propre chemin authentifié, pas un
paramètre de plus sur celui-ci.

## Les 257 produits dont l'état de publication va basculer se tranchent à l'export — 2026-08-11

Décision du propriétaire, prise en constatant les 2562 produits publiés de la
vue « Catalogue en ligne ». **On ne tranche pas maintenant ; on avance, et le
sort de ces 257 produits se décide au moment de l'export vers la base SQL
Axemusique.**

**Ce qui est mesuré**, sur la base de référence `%APPDATA%\AppPOS\data`, par
`catalog-import -fields` et `-normalize`, en lecture seule :

| | produits |
|---|---:|
| dans NeDB | 3034 |
| portant un `woo_id` — donc réellement en ligne aujourd'hui | **2528** |
| `published` **sans** `woo_id` — publiés jamais mis en ligne | **160** |
| `draft` **avec** `woo_id` — brouillons pourtant en ligne | **97** |
| `published` dans NeDB | 2591 *(2528 − 97 + 160)* |
| `published` chargés dans PocketBase | **2562** *(observé à l'écran)* |

L'écart de 29 entre 2591 et 2562 est le nombre de produits publiés parmi les 35
mis en quarantaine pour SKU en doublon. **C'est une déduction arithmétique, pas
une lecture** — seul point de ce tableau qui ne soit pas mesuré directement.

**Ce que la bascule produit :** `status` devenant la seule autorité, les 160
apparaîtront sur le site pour la première fois et les 97 en disparaîtront.
**257 produits changent d'état visible d'un coup, à la première synchronisation.**

**Ce qui est écarté, et pourquoi :**

- **Trancher maintenant, produit par produit** — 257 décisions métier à froid,
  sans le contexte de l'export, pour un site qui n'est pas encore alimenté.
- **Un onglet « à vérifier » dans la vue** — il suppose de charger
  `external_refs` avec les correspondances WooCommerce, ce que la direction du
  11 août a précisément annulé. Importer la dette pour l'afficher.

**Ce que cette décision coûte si elle est tenue trop longtemps :** `woo_id` est
le **seul témoin** de ce qui est réellement en ligne, et il disparaît avec
WooCommerce. Passé ce point, plus rien ne permet de dire quels produits ont
changé d'état. La liste des 257 se reproduit à volonté par `catalog-import`
tant que la base NeDB de référence existe ; elle ne se reproduit plus après.

**Remise en cause si :** l'export approche sans que la question soit reprise,
ou si WooCommerce est arrêté avant que la liste ait été regardée une fois.

## La base NeDB de référence est celle de l'installation, pas celle de développement — 2026-08-11

Décision du propriétaire, prise en constatant que le catalogue chargé était
incomplet.

**La référence est `%APPDATA%\AppPOS\data`.** `I:\AppPOS\AppServe\data` est une
copie de développement **périmée**, et tout ce qui a été mesuré dessus est à
reprendre.

| | produits | catégories | marques | fournisseurs |
|---|---:|---:|---:|---:|
| **installation — référence** | **3034** | **463** | **287** | **43** |
| développement — périmée | 2306 | 219 | 224 | 34 |

**Plus du double de catégories.** L'audit du 2026-08-10 ne relevait que l'écart
sur les produits (+728), en le déclarant inexpliqué ; celui sur les catégories
n'était mentionné nulle part.

**Ce que la mauvaise base a coûté, et c'est le vrai enseignement :** le modèle
cible avait **supprimé le champ image des marques** sur la mesure « 0 image sur
224 ». La mesure était exacte. La base ne l'était pas. La référence porte
**225 logos sur 287**, dont **26 seulement** ont une URL WordPress : sans la
décision de copier les fichiers, 199 logos étaient perdus sans que personne le
voie.

*Une mesure juste sur la mauvaise base est une mesure fausse.* Les quatre
défauts corrigés le 11 août viennent tous de là, aucun d'une erreur de
raisonnement.

**À reprendre en conséquence :** tous les chiffres de
[`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)
et de [`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md).
Le rituel annonçait d'ailleurs « 43 fournisseurs » — chiffre de l'installation —
à côté de « 2306 produits » — chiffre de la dev : **il mélangeait déjà les deux
sans le dire**, et personne ne l'avait vu.

**Écarté — corriger les documents antérieurs :** ils sont datés et font foi sur
ce qu'ils ont constaté *ce jour-là*. Ils reçoivent un avertissement en tête ;
l'état réel est au §9 de
[`10-plan-migration.md`](../frontend/modules/site/PocketSite-docs/10-plan-migration.md).

**Ce que ça ne change pas :** la contrainte de ne pas toucher à la production
reste entière **côté écriture**. L'outil lit ces bases, il n'y écrit jamais.

**Remise en cause si :** la base d'installation cesse d'être la plus à jour —
par exemple si le travail reprend sur un autre poste.

## Les images du catalogue sont copiées dans PocketBase — 2026-08-11

Décision du propriétaire. **Annule le §9.2b de
[`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md)**,
qui tranchait pour un champ texte portant des URL.

**Constaté, et c'est ce qui a fait changer d'avis :**

```
image.src   chemin AppServe relatif, servi par :3000 seulement   1710 / 1710
image.url   URL WordPress absolue                                  845 / 1710
source_url  n'existe pas
```

L'audit §1.3 affirmait que « les URL d'images viennent du `source_url`
WordPress et ne bougent pas ». **Le champ n'existe nulle part**, et l'URL ne
couvre que la moitié des images. Charger `src` produisait des images que seul
AppServe sait servir — or s'affranchir d'AppServe est l'objet de la migration.

**Donc : champs fichier, et copie des fichiers.** 4665 fichiers, 1,7 Go.
`wp_image_url` conserve l'URL d'origine quand elle existe, pour la
réconciliation avec le site.

**Écarté — ne garder que l'URL WordPress :** 865 images sur 1710 n'en ont
aucune. On en perdait la moitié.

**Écarté — faire servir `public/` par PocketApp :** remplace une dépendance à
AppServe par une autre, sans rien régler.

**Trois défauts corrigés en même temps :** les galeries produit sont conservées
(747 produits en portent une, l'audit avait conclu de leur absence sur les
*catégories* à leur absence sur les *produits*) ; les images de catégorie sont
des **objets** et étaient lues comme des chaînes ; le champ image des marques
est rétabli.

**Reste ouvert :** 36 images n'existent que sur WordPress. Les télécharger
suppose un `User-Agent` explicite — la couche anti-bot d'axemusique.shop rejette
celui de Go, voir `CLAUDE.md`.

**Remise en cause si :** le volume devient un problème, ou si une politique de
médias centralisée apparaît.

## Le lecteur de fichiers NeDB est transitoire — 2026-08-11

**Trajectoire annoncée par le propriétaire.** À terme :

1. **PocketApp importera le catalogue depuis l'API AppPos** à laquelle il est
   déjà connecté, et non depuis les fichiers NeDB ;
2. **le module stock aura un sélecteur AppPos ↔ PocketBase**, pour basculer la
   source de lecture.

**Conséquence :** `backend/catalog/nedb/` est un outil d'établissement, pas
d'exploitation. Il a servi à fixer le modèle, le chargeur et les contrôles ; le
chemin durable passera par `frontend/lib/apppos/`, qui existe déjà.

**Ce que ça préserve :** le schéma, la normalisation, la quarantaine et les
contrôles se réutilisent tels quels quelle que soit la source. **Seul le lecteur
change.** C'est précisément pourquoi la normalisation a été séparée de la
lecture dès le premier jour.

**Le sélecteur est le drapeau de bascule** prévu au ticket T7 du plan, par
défaut sur AppPos.

---

## Le modèle cible du catalogue PocketBase est arrêté — 2026-08-10

Aboutissement de la séquence imposée par le bloc « Le modèle cible se conçoit
avant la migration ». Détail complet, champ par champ, dans
[`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md).
Ce bloc consigne les décisions ; il ne les remplace pas.

**Principe directeur retenu :** *ce qui est calculable n'est pas stocké ; ce qui
appartient à une plateforme externe ne vit pas sur l'entité métier.*

**Six collections :** `products`, `categories`, `brands`, `suppliers`
transformées ; `external_refs` créée ; `promotions` non créée.

### Ce qui est tranché

- **Le prix est TTC.** Mesuré : sur 648 produits, l'hypothèse « `price` TTC,
  marge sur base HT » est cohérente sur **636**, l'hypothèse HT sur **0**.
  Les champs deviennent `price_ttc` et `purchase_price_ht` — un champ de prix
  sans unité dans son nom est un piège qui se repaie à chaque lecture.
  `price_ht` **n'est pas stocké**, il se calcule.
- **Pas de mécanisme de promotion.** La caisse remise déjà à la ligne et au
  ticket, sans jamais lire un champ de promotion du produit. Si le besoin
  catalogue apparaît, ce sera une **entité datée**, jamais deux colonnes sur le
  produit.
- **Pas de champ `availability`.** Le besoin (« sur commande », « en réappro »)
  est crédible mais appuyé sur rien : `stock_status` n'a aucun lecteur. S'il se
  confirme, ce sera un champ neuf — pas la réintroduction du miroir WooCommerce.
- **La publication des catégories est dérivée**, pas saisie : *une catégorie est
  en ligne si elle contient un produit `published`, descendants compris ; ses
  ancêtres le sont par voie de conséquence.* Règle vérifiée exacte sur la base
  dev, 0 écart.
- **La relation marque ↔ fournisseur est réelle**, portée par
  `suppliers.brands`. Elle est saisie au formulaire fournisseur, et le schéma
  PocketBase la modélise déjà de ce côté.
- **Un produit a un ensemble de catégories, sans catégorie principale.**
- **Les identifiants externes sortent des entités**, dans `external_refs` —
  trois relations optionnelles (`product`, `category`, `brand`), une seule
  remplie. Une deuxième plateforme n'ajoute aucune colonne, et l'échec de
  publication devient une donnée au lieu d'une ligne de console.
- **Le catalogue est multi-entreprise**, avec une seule entreprise pour
  l'instant. `company` reste requis sur les quatre collections.
- **`suppliers.siren` est ajouté** — seul champ créé de toutes pièces par ce
  modèle. Même nom et même contrôle que sur `companies` (`^\d{9}$`).
- **Conservés pour un usage à construire, et non pour un usage existant :**
  `min_stock` et `manage_stock` (alertes de seuil), `banking` et
  `payment_terms` (achat fournisseur). Aucun n'a de lecteur aujourd'hui ; le
  motif est écrit pour que la conservation reste réexaminable.

### Ce qui est écarté, et pourquoi

**Écarté — garder `woo_id` sur chaque table « pour la transition » :** c'est
l'état actuel, et il a produit exactement les défauts qu'`external_refs` corrige.

**Écarté — `entity_type` + `entity_id` dans `external_refs` :** PocketBase n'a
pas de relation polymorphe ; le couple imposerait un champ texte non contraint,
donc la perte de l'intégrité référentielle — ce qu'on reproche à NeDB.

**Écarté — un champ `status` explicite sur les catégories :** il introduirait
219 valeurs dont personne n'est responsable, c'est-à-dire le mécanisme exact qui
a produit `brandsRefs`. Le choix n'est pas symétrique : passer de la règle
dérivée au champ explicite coûte une initialisation, l'inverse ne se fait pas.

**Écarté — conserver les statistiques de vente sur le produit :** `total_sold`,
`sales_count`, `revenue_total`, `last_sold_at` n'ont **aucun lecteur** dans
`frontend/`. Elles ne passent pas la migration ; leur source légitime est
`sales`.

**Écarté — `tax_rate` en énumération :** figerait le schéma sur les taux en
vigueur ; un changement de TVA imposerait une migration de collection.

**Écarté — une unicité globale sur `sku` et les `slug` :** dans un modèle
multi-entreprise elle serait fausse dès la deuxième entreprise, deux magasins
ayant légitimement le même SKU fournisseur. **Index composites `(company, sku)`
et `(company, slug)`.**

### Ce qui reste ouvert

Les autres identifiants légaux du fournisseur (`siret`, `vat_number`, `rcs`,
`ape_naf`) — à décider avec l'écran d'achat fournisseur, pas maintenant. Et la
cible de publication (WooCommerce, base SQL distante, ou les deux), qui n'a pas
à être répondue pour concevoir le modèle.

### Remise en cause si

Un besoin métier contredit une des suppressions **avec une mesure à l'appui**,
et non par principe de précaution. Les champs conservés « pour un usage à
construire » se réexaminent si l'usage n'existe toujours pas quand la logique de
stock est reprise.

## Les collections catalogue de PocketBase sont un premier jet abandonné — 2026-08-10

**Fait rapporté par le propriétaire**, et il répond à la question que le rituel
posait sans réponse (§6.5.1 : *d'où vient le schéma existant ?*).

Les collections `products`, `categories`, `brands` et `suppliers` de PocketBase
sont la **résurgence d'un premier jet**, écrit avant qu'on décide de se brancher
directement sur AppPos — décision prise, selon ses termes, *par paresse et pour
aller vite*. Elles n'ont jamais servi : elles sont vides, et le catalogue est lu
depuis AppServe.

**Conséquence sur la façon de les traiter :** elles ne sont **pas un acquis à
préserver**, et l'écart entre elles et le modèle cible n'est pas une dette à
justifier. Elles se réécrivent librement.

**Ce que la confrontation a néanmoins établi, et qui mérite d'être dit :** ce
premier jet était bon. Il porte déjà les relations dans le bon sens — dont
`suppliers.brands` du bon côté —, le contact fournisseur à plat, `barcode` en
champ de premier rang, et **aucun champ WooCommerce, aucun cache dénormalisé,
aucune statistique de vente**. Le principe directeur du modèle cible y était
déjà appliqué. Trois de ses choix ont été retrouvés indépendamment par la
conception ; c'est une confirmation, pas une coïncidence.

**Trois défauts constatés sur la base réelle**
(`%LOCALAPPDATA%\PocketReact\pb_data`, lue en copie, en lecture seule) :

1. **`categories.parent` ne cible aucune collection** —
   `collectionId = ""`. `backend/migrations/catalog.go:143` annonce en
   commentaire un correctif *« fixé après création »* qui **n'a jamais été
   écrit**. Seule relation cassée du catalogue ; invisible parce que la
   collection est vide, elle se serait manifestée à la première insertion d'un
   arbre — c'est-à-dire pendant la migration.
2. **`images` est un champ fichier**, incompatible avec la décision de conserver
   les URL WordPress. Un champ fichier PocketBase n'accepte pas une URL.
3. **`designation` est absent**, alors que la caisse et le stock le consomment —
   au point que le transformer l'ajoute hors schéma. Les collections, en l'état,
   ne pourraient pas servir le terminal.

**Piège actif, à connaître avant d'écrire la migration :** chaque
`ensure*Collection` sort si la collection **existe par son nom**
(`catalog.go:17, 88, 163, 257`). Modifier `catalog.go` ne modifiera donc aucune
base déjà installée, et une base portant d'anciennes collections homonymes
verrait `RunMigrations` les accepter telles quelles, **sans erreur et sans mise
à niveau**. Ce n'est pas seulement une gêne : c'est une convergence
silencieusement fausse.

**Deux bases coexistent, et une seule compte :**

| Base | Ce qu'elle est |
|---|---|
| `%LOCALAPPDATA%\PocketReact\pb_data` | **la vraie** — `main.go:71-75`, 23 collections |
| `I:\pockapp\pb_data` | **vestige** de novembre 2025, 8 collections, produit par le dossier `migrations/` de la racine que `CLAUDE.md` signale déjà comme non importé. Son `products` porte `price`, `cost`, `stock`, `image` |

**Ne jamais juger du schéma en place sur `I:\pockapp\pb_data`.**

**Décision d'exécution :** les quatre collections du catalogue seront
**recréées**, pas altérées — elles sont vides, la reprise est sans risque, et
c'est ce qui rend la migration rejouable (exigence du §6.5.2 du rituel).
« Recréer » signifie **ces quatre collections seulement** : la base réelle porte
aussi la caisse, les factures, l'inventaire et le menu du site. Supprimer
`data.db` est exclu.

**Remise en cause si :** le catalogue local cesse d'être vide — auquel cas la
recréation n'est plus gratuite et il faut de vraies migrations d'altération.

---

## Le modèle cible se conçoit avant la migration — on ne transpose pas AppServe — 2026-08-10

Décision du propriétaire, complément immédiat du bloc suivant.

**Recréer dans PocketBase les collections actuelles à l'identique est écarté.**
Le modèle NeDB porte les choix d'AppServe et les contraintes de WooCommerce ;
les transposer reviendrait à migrer la dette avec les données.

Séquence imposée : comprendre le modèle actuel → **concevoir le modèle cible**
→ déterminer les collections et relations nécessaires → décider du sort des
champs hérités → migrer → déplacer la logique métier.

**Les collections PocketBase déjà présentes ne sont pas définitives** —
certaines seront supprimées, d'autres profondément adaptées.

**Principe directeur :** séparer la donnée **métier** de la donnée propre à une
**plateforme externe**. Un identifiant WooCommerce n'est pas une propriété du
produit, c'est une propriété de la relation entre ce produit et une plateforme.

**Écarté — migrer d'abord, nettoyer ensuite :** le nettoyage n'arrive jamais, et
chaque écran écrit entre-temps s'appuie sur les champs qu'on voulait retirer.

**Écarté — repartir de zéro sans reprise :** 2306 produits et 842 fiches en
ligne existent ; NeDB reste la source de référence des données.

**Ce que la mesure a déjà tranché** (§4 bis de
[`08-rituel-migration-pocketbase.md`](../frontend/modules/site/PocketSite-docs/08-rituel-migration-pocketbase.md),
base dev, lecture seule) :

- **aucune variante n'existe** — `type` vaut `simple` (2297) ou `service` (9) ;
- **le modèle promotionnel est une fiction** — `regular_price` diffère de
  `price` sur **4** produits, `sale_price` est renseigné sur **5**. Ces champs
  n'existent que parce que WooCommerce les attend ;
- **`meta_data` ne contient qu'une clé, `barcode`**, sur 1870 produits — une
  donnée pleinement métier à promouvoir en champ de premier rang ;
- **six champs produit sont à zéro document** : `specifications`,
  `category_ref`, `categories_refs`, `woo_status`, `sync_errors`,
  `description_short` ;
- **les marques n'ont aucune image** (0 sur 224).

**Remise en cause si :** la conception du modèle cible s'enlise au-delà de ce
que la migration ferait gagner — auquel cas on réduit le périmètre du modèle,
pas la rigueur de la séquence.

## PocketBase devient la source de vérité, et la refonte se fait d'abord tout en local — 2026-08-10

Décision du propriétaire, prise à la fin de l'audit du flux catalogue.

**La cible ultime n'est plus « publier le catalogue vers une base distante »,
c'est « s'affranchir d'AppServe ».** PocketBase, déjà embarqué dans PocketApp,
devient la source de vérité du catalogue. AppServe et sa base NeDB deviennent
une **source de référence pour les données existantes**, à migrer, puis à
abandonner.

**Et la refonte commence entièrement en local**, sans aucune contrainte de
production :

```
NeDB existante → migration des entités → PocketBase / module stock → frontend-wp local
```

Deux problèmes sont ainsi séparés, et c'est le cœur de la décision :

1. **refondre l'architecture et la source de vérité**, en local, vérifiable de
   bout en bout ;
2. **puis seulement** concevoir le transfert vers la production.

**Écarté — publier d'abord vers la base SQL distante (la cible du 2026-08-07) :**
cela revenait à figer un contrat de données avec WooCommerce et l'hébergeur
mutualisé dans l'équation, alors que la source de vérité elle-même est
appelée à changer. On aurait conçu deux fois.

**Écarté — migrer en gardant la synchronisation de production active :** l'audit
a montré que le flux actuel dérive précisément parce qu'il mélange les deux
préoccupations (§3 et §4bis.6 de [`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)).
Reproduire ce mélange dans la refonte serait reproduire le défaut.

**Ce que cette décision ne fait pas :** elle n'annule pas « Cible à terme : la
couche distante remplace WooCommerce comme catalogue » (2026-08-07). Elle la
**réordonne** : la couche distante reste la cible pour le site, mais elle est
désormais alimentée par PocketBase, pas par AppServe, et elle vient **après**
la refonte locale.

**Conséquence à assumer, et elle touche une contrainte de `CLAUDE.md` :**
« Ne pas modifier AppPos » et « AppPos reste autorité pendant la transition »
restent vraies **pendant la phase d'analyse**, mais la trajectoire les périme à
terme — « adapter AppPOS pour ne plus dépendre d'AppServe » signifie
explicitement modifier AppPos. Le jour où un ticket y touche, il faudra un
nouveau bloc qui annule ces contraintes, et `CLAUDE.md` devra être mis à jour
le même jour. **Ce bloc-ci ne l'autorise pas.**

**Remise en cause si :** la migration révèle qu'une fonction de la caisse dépend
d'AppServe d'une manière non reproductible dans PocketBase — auquel cas c'est le
périmètre de la migration qui se réduit, pas la caisse qui s'adapte.

## Les slugs sont fabriqués par nous, la clé de référence est le `_id` NeDB — 2026-08-10

Décision du propriétaire. Deux points liés, pris pendant l'audit du flux
catalogue ([`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)) :

1. **Les `slug` ne viennent plus de WooCommerce, AppPos les fabrique.**
   Aujourd'hui ils sont produits par Woo à la synchronisation, ce qui explique
   que 190 catégories sur 219 n'en aient pas : elles n'ont jamais été
   synchronisées. Sortir de WooCommerce sans reprendre la fabrication des slugs
   laisserait la majorité du catalogue sans URL.
2. **La clé de référence entre AppPos et la base SQL distante est le `_id`
   NeDB.** Pas le `woo_id` — 63 % des produits n'en ont pas et il disparaîtra ;
   pas le `sku` — 7 doublons locaux et 3 produits n'en ont pas.

**Écarté — garder `woo_id` comme clé :** revient à faire dépendre la nouvelle
base de celle qu'on retire. Et elle est absente là où on en aurait le plus
besoin (§4bis.4 de l'audit).

**Écarté — le `sku` comme clé :** signifiant donc modifiable, non unique dans
les faits, et absent sur 3 produits.

**Écarté — laisser WooCommerce fabriquer les slugs encore un temps :** c'est
l'état actuel, et il produit exactement le trou qu'on cherche à combler.

**Ce que la décision n'a pas encore tranché**, et qui revient au contrat de
données :

- **l'unicité des slugs.** Mesuré sur la base dev : une génération naïve depuis
  `name` produit **28 produits, 23 catégories et 8 marques en collision**. Il
  faut une règle de désambiguïsation, et pour les catégories elle devra
  probablement intégrer le parent (« Accessoires » existe deux fois à des
  endroits différents de l'arbre) ;
- **la stabilité.** Un slug qui suit le `name` change quand le nom change, donc
  l'URL change. Il faut décider s'il est figé à la création ou recalculé ;
- **les 847 produits qui ont déjà une `website_url` WooCommerce.** Des slugs
  fabriqués autrement changeraient ces URL déjà publiques. À arbitrer
  explicitement, ce n'est pas un détail technique.

**Ne pas réutiliser les deux `_generateSlug` existants d'AppPos tels quels.**
Ils sont deux, ils divergent sur 8 noms de marque, et celui de
`ProductSync.js:73` a deux défauts constatés : `\w` conserve le tiret bas, et
`.trim()` ne retire que les espaces — d'où `"Keeley "` → `"keeley-"`.

**Remise en cause si :** la reprise des URL existantes s'avère prioritaire sur
la cohérence des nouvelles — auquel cas il faudrait importer les slugs
WooCommerce actuels comme valeurs initiales plutôt que de tout regénérer.

**Précision ajoutée le 2026-08-10, quelques heures après ce bloc** — le corps
ci-dessus n'est pas réécrit, conformément à la règle du fichier. La phrase
« 190 catégories sur 219 n'en ont pas : elles n'ont jamais été synchronisées »
donne le bon chiffre mais la mauvaise cause. **L'absence de `woo_id` signifie
« pas en ligne », et c'est l'état voulu pour la plupart d'entre elles** : le
catalogue est celui du magasin, pas celui du site. Voir §4bis.6 de l'audit.
La décision elle-même est inchangée, et même renforcée : il faudra fabriquer
les slugs **des seules entités destinées au site**, ce qui réduit d'autant le
volume concerné.

## Le menu reste en JSON statique — l'option C est abandonnée pour lui — 2026-08-10

Le menu ne passera pas en MySQL. `server/schema.sql`, qui décrivait ce stockage,
est **supprimé**. Le fichier statique reste, définitivement, la forme du menu
publié.

Ce bloc **clôt** la partie « C ensuite » du bloc « Couche distante : JSON
statique déposé par PHP » du 2026-08-06, pour le seul menu. Le raisonnement de
ce bloc-là n'est pas désavoué — il est arrivé à son terme : on a soigné le
contrat, pris le stockage le plus simple, et le plus simple a suffi.

**Ce qui le justifie, après mise en production :** le document publié fait
quelques kilo-octets, aucun des quatre déclencheurs de §4.5 de l'audit n'est
atteint, et le menu s'affiche en ~244 ms sans PHP ni base sur le chemin de
lecture. Le passage à MySQL n'apporterait que l'historique des publications —
un besoin qui ne s'est pas manifesté en trois jours d'usage.

**Pourquoi supprimer le fichier plutôt que le garder « au cas où » :** il aurait
été trompeur. La mission suivante — sortir le **catalogue** de WooCommerce —
aura bien besoin d'une base SQL, et quelqu'un aurait ouvert `schema.sql` en
croyant y trouver un point de départ. Il décrit des publications de menu, table
`menu_publication` et colonne `payload` comprises : rien de réutilisable pour
des produits, des catégories et des marques.

**Remise en cause si :** un besoin de retour arrière sur publication du menu
apparaît — déclencheur n°2 de §4.5, toujours valable. Il se traiterait alors
sans doute dans la base du catalogue plutôt que dans une base à lui.

## Le menu publié est la seule source du menu affiché — 2026-08-10

**Annule le bloc « Le menu affiché n'est pas seulement le menu publié » du même
jour.** L'injection des sous-catégories WooCommerce dans le menu est
**supprimée** : `useNavigation.js` du dépôt du site ne lit plus les catégories,
et `useWordPress()` n'y est même plus importé. Le menu rendu est exactement le
contenu de `menu.json`.

**Ce qui a changé en quelques heures, et ce n'est pas un fait nouveau :** le
bloc annulé arbitrait en faveur du confort — l'arborescence se maintenait seule.
Le propriétaire du projet a posé une exigence qui prime : **plus aucun lien avec
WordPress pour l'affichage du menu.** Or WooCommerce est servi par WordPress.
Garder l'injection, c'était retirer la dépendance au *menu* WordPress tout en la
laissant intacte pour son *contenu* — la moitié du travail, avec l'apparence de
la totalité.

**Ce qui rend l'échange acceptable :** le menu WordPress importé porte déjà
20 sous-entrées choisies à la main. Elles remplacent exactement ce que
l'injection produisait automatiquement, en mieux : triées, nommées et masquables
depuis PocketApp. On ne perd pas une fonctionnalité, on la reprend en main.

**Trois gains, qui sont les raisons de la décision :**

- **`menu.json` redevient diagnosticable seul.** Lire le fichier publié suffit à
  savoir ce que voit un visiteur — c'était l'un des deux buts de `ref` en §3 du
  contrat, perdu par l'injection.
- **Le menu ne dépend plus d'aucune API à l'affichage.** Ni `wp/v2`, ni `wc/v3`.
  Vérifié : 15 liens rendus, tous présents dans le document publié, aucun ajout.
- **Ordre, libellé et visibilité des sous-entrées reviennent à PocketApp**, ce
  que l'injection interdisait.

**Le prix, assumé :** le menu ne suit plus le catalogue. Une nouvelle
sous-catégorie n'apparaîtra que si on l'ajoute dans PocketApp et qu'on republie.
C'est l'échange demandé — l'indépendance contre l'automatisme.

**Effet de bord qu'il a fallu traiter en même temps, et qui n'était pas
évident :** `convertToReactUrl` ne gardait que le **premier segment** d'une URL
de catégorie. C'était sans conséquence tant que les sous-catégories injectées
portaient leur `reactUrl` déjà calculée — elles ne passaient pas par cette
fonction. L'injection coupée, une entrée `guitares-folk/folk-electro` aurait été
tronquée en `guitares-folk` et aurait mené à la catégorie **parente, sans
erreur**. La troncature est supprimée ; `CategoryPage` résout sur le dernier
segment et accepte le chemin complet. Vérifié dans un navigateur.

**Remise en cause si :** maintenir les sous-entrées à la main devient une charge
— auquel cas la réponse n'est pas de rétablir l'injection, mais de générer ces
entrées dans PocketApp au moment de l'édition, où elles resteraient
maîtrisables et publiées.

## ~~Le menu affiché n'est pas seulement le menu publié~~ — 2026-08-10 — annulée le 2026-08-10 par « Le menu publié est la seule source du menu affiché »

**Constat d'abord, décision ensuite.** Le site n'affiche pas le document publié
tel quel : quand une entrée pointe vers une catégorie racine, il y **greffe les
sous-catégories lues chez WooCommerce**, au moment du rendu.
`useNavigation.js:119-135` du dépôt du site (`buildCategoryChildren`, `:85-106`)
— code antérieur au MVP, découvert en vérifiant le ticket 8, pas écrit pour lui.

Vérifié le 10 août 2026 : une entrée « Guitare classique » vers la catégorie
1096 produit à l'écran sept sous-entrées (Classiques 1/4 & 1/2, 3/4, 4/4, 7/8,
électro, pour gauchers, Flamenco) et un « Voir tout → », dont **aucune n'est
dans `menu.json`**.

**Décision : on garde.** L'arborescence reste à jour toute seule, sans rien
republier, et c'est le modèle d'hydratation voulu — le catalogue vient de
WooCommerce pendant toute la transition.

**Écarté — publier les sous-catégories comme entrées réelles :** il faudrait
recopier dans `site_menu` une arborescence qui vit ailleurs, et republier à
chaque évolution du catalogue. On échangerait une hydratation automatique
contre un problème de synchronisation que PocketApp devrait résoudre — soit la
faille 3.3 (copies non réconciliées) étendue au menu.

**Ce que ça coûte, et qu'il faut assumer les yeux ouverts :**

- **`menu.json` ne décrit pas entièrement ce que voit un visiteur.** Diagnostiquer
  le menu en lisant le seul fichier publié — un des deux buts de `ref` selon §3
  du contrat — ne suffit plus.
- **Aucun contrôle depuis PocketApp** sur les sous-catégories injectées :
  ni masquage, ni renommage, ni ordre, ni exclusion.
- **Le menu dépend encore de WooCommerce à l'affichage.** Le MVP a retiré la
  dépendance au *menu* WordPress, pas celle-ci.
- **La faille 3.2 s'applique en silence** : le site ne charge que 188 catégories
  (2 pages de 100, `hide_empty`) ; au-delà, des enfants manqueraient sans erreur.
- **Décalage visible** : menu publié prêt à ~470 ms, catégories à ~4,2 s. Le
  sous-menu se remplit après coup.
- **Condition non évidente** : l'injection n'a lieu que pour une catégorie
  **racine** (`cat.parent === 0`, `useNavigation.js:128`) et si
  `VITE_USE_REACT_CATEGORIES` vaut `true`. Une entrée vers une sous-catégorie
  n'aura pas d'enfants, sans que rien ne le signale.

**Remise en cause si :** la couche distante remplace WooCommerce comme catalogue
— l'injection n'aurait alors plus de source, et la question se reposera d'
elle-même. Ou si le besoin apparaît de maîtriser l'ordre ou la visibilité des
sous-entrées depuis PocketApp.

## Clé de publication dédiée, document composé en React, POST émis par le Go — 2026-08-08

Trois décisions liées, prises ensemble parce qu'elles se déterminent l'une
l'autre. Mise en œuvre : ticket 5b (le réglage), ticket 6 (l'usage).

**1. La clé de publication est distincte de celle du mini-SaaS.**
`site_publish_api_key` (`backend/secrets/secrets.go`), chiffrée dans
`app_settings` par le `SecretManager`, saisie depuis Réglages > Clés API. L'URL
de l'endpoint l'accompagne en réglage **non chiffré** (`site_publish_url`) :
ce n'est pas un secret, et en dur elle imposerait de recompiler pour viser un
autre serveur.

**Écarté — réutiliser `notification_api_key` :** c'est ce qui avait été fait au
premier essai, la clé ayant été générée par le mini-SaaS. Deux raisons de ne pas
le garder. D'abord un secret unique pour deux services sans rapport : le
mini-SaaS peut la faire tourner sans savoir que la publication en dépend, et la
publication tomberait en `401` sans explication. Ensuite, et c'est décisif,
`GET /api/settings/pocketapp-key` (`backend/routes/secrets_routes.go:125`) la
renvoie **déchiffrée sans garde admin**, contrairement aux quatre routes
voisines — elle est appelée ainsi par `frontend/lib/credits.ts:22`. Tout ce qui
atteint `127.0.0.1:8090` peut donc la lire. **Cette route est une faille
connue, non corrigée, et hors périmètre du ticket** : la décision consiste à ne
pas lui confier une seconde responsabilité.

**2. Le document publié est composé en React, pas en Go.**
L'éditeur (ticket 4) produit le JSON complet — aplatissement, exclusion des
entrées masquées et de leurs descendants, résolution `ref` → `url` — et l'envoie
à la couche Go.

**Écarté — tout composer en Go :** la résolution part d'un identifiant
WooCommerce lu dans AppPos (bloc « Origine des destinations du menu »), et le
client AppPos n'existe **qu'en TypeScript** (`frontend/lib/apppos/`) ; aucun
fichier `.go` ne parle à `:3000` — vérifié. Il aurait fallu réécrire ce client
en Go : seconde authentification, second jeton, second chemin vers AppPos, donc
le point 2 de `CLAUDE.md` en double.

**Coût accepté :** le Go poste un document qu'il n'a pas composé et ne peut donc
pas garantir conforme. L'endpoint PHP reste le seul gardien du contrat — c'est
son rôle, et la raison pour laquelle il renvoie la liste **complète** des
erreurs plutôt que la première.

**3. Le POST part du Go, jamais du React.** Le front envoie le document à sa
propre couche Go, qui lit la clé et pose l'en-tête `X-API-Key`. La clé ne
descend jamais dans le renderer — aucune route ne la relit, contrairement au
schéma de `credits.ts`.

**Écarté — poster depuis le React avec la clé récupérée par une route :** ce
serait reproduire exactement le problème du point 1, et rapprocher la clé du
bundle, famille de la faille 3.1.

**Écarté — une variable `VITE_` :** tout ce qui est préfixé `VITE_` est inliné
en clair dans le JavaScript livré. C'est la faille 3.1 elle-même.

**Remise en cause si :** un client AppPos en Go apparaît pour une autre raison
(alors le point 2 se rediscute), ou la publication doit avoir lieu sans
interface — tâche planifiée, second poste — car le React ne serait plus là pour
composer.

## Où vit le code du serveur mutualisé — 2026-08-07

Le code PHP qui tourne sur l'hébergement d'axemusique.shop est versionné dans
**ce dépôt-ci, sous `server/`**. Il ne s'exécute pas dans PocketApp : il est
déposé par FTP, à la main, une fois. Rien du binaire Wails ne l'importe.

C'est la question ouverte de §7.2 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` — « dépôt dédié,
ou dossier dans PocketApp ? », renvoyée au ticket 5.

**Ce qui tranche :** PocketApp est le seul appelant de cet endpoint, et le
contrat qu'ils partagent (`05-contrat-menu.md`) vit déjà ici. Les deux côtés du
même contrat changent ensemble, dans le même commit, ou ils divergent.

**Écarté — un dépôt dédié :** quelques fichiers PHP dans un dépôt à eux, c'est
le maillon qu'on oublie de cloner, qu'on ne met pas à jour, et dont on découvre
six mois plus tard qu'il ne correspond plus à ce qui est en ligne. C'est
exactement l'angle mort que la note « Tickets 5 et 7 : versionner le code
serveur » de §5 de l'audit voulait éviter.

**Écarté — le thème enfant WordPress (`I:\divi-child`, dossier `child/`) :**
c'est pourtant un domicile réel, versionné, et déjà déployé sur ce serveur —
c'est là que vit `functions.php`. Trois raisons de ne pas y aller. Le MVP existe
pour **sortir** le menu de WordPress : y remettre le code de sortie le rend
dépendant du thème, donc d'une mise à jour de thème ou d'un changement de
constructeur de page. Le contrat et son producteur seraient alors dans deux
dépôts, avec le consommateur (`frontend-wp/`) dans le même que le producteur —
la pire répartition des trois. Enfin `child/` est chargé par WordPress à chaque
requête du site, alors que cet endpoint doit rester **hors du chemin WordPress**
(§1 du contrat : hors `wp-content/`, qu'une restauration WP peut balayer).

**Aucune clé dans le dépôt.** `server/config/config.php` porte la clé
`X-API-Key` et est ignoré par Git (`server/.gitignore`) ; `config.php.example`
est versionné à côté. Modèle repris du mini-SaaS `pocketapp.5sensprod.com`
(`api/`, configuration hors dépôt, `schema.sql`), comme le recommandait §5 de
l'audit.

**`server/schema.sql` est versionné mais n'est pas joué.** Il décrit le stockage
MySQL de l'option C, pour que la bascule reste une après-midi. Aucun des quatre
déclencheurs de §4.5 n'est atteint : la décision « A pour le MVP, C ensuite »
tient inchangée.

**Remise en cause si :** un second consommateur du code serveur apparaît sans
lien avec PocketApp, ou le serveur acquiert un déploiement automatisé — auquel
cas c'est le pipeline, pas le dépôt, qui décide.

## Cible à terme : la couche distante remplace WooCommerce comme catalogue — 2026-08-07

**Intention consignée, rien d'étudié, aucun travail engagé.** Ce bloc existe
pour que la cible ne se reperde pas entre deux sessions, pas pour la commencer.

À terme, la couche distante posée au ticket 5 — script PHP de réception,
données servies en statique — a vocation à porter **le catalogue** du site
(produits, catégories, marques), et non le seul menu. WooCommerce cesserait
alors d'être la source du site ; sa médiathèque, elle, reste (§4.6 de l'audit).

**Ce qui rend la cible envisageable :** le site est une vitrine sans vente en
ligne (§2.4 de l'audit). Pas de tunnel d'achat, pas de compte client, pas de
commande à préserver. C'est un problème de lecture de données. Et c'est aussi la
réponse durable à la faille 3.1 : plus de clés WooCommerce dans le bundle si le
site ne parle plus à WooCommerce.

**Ce qui n'est pas tranché** — les trois questions de §7.3 de l'audit restent
ouvertes, mot pour mot : le volume réel une fois publié, la stratégie d'images,
la recherche côté site. À quoi s'ajoute que ~2000 produits ne se servent pas en
un fichier unique — c'est le déclencheur n°1 de §4.5, donc cette cible **passe
par l'option C**, elle ne s'atteint pas depuis A.

**Ce que ce bloc n'autorise pas :** anticiper. La migration des produits et la
bascule AppPos → PocketApp sont explicitement reportées en §6 de l'audit, et
AppPos reste autorité pendant toute la transition. Aucun ticket du MVP ne s'en
approche.

**Remise en cause si :** le MVP menu échoue à tenir en production, ou WordPress
doit rester pour une raison qui n'apparaît qu'à l'usage — auquel cas la cible
n'est pas seulement repoussée, elle est fausse.

## Origine des destinations du menu — 2026-08-06

L'éditeur du ticket 4 propose les destinations **lues depuis AppPos**, en
lecture seule via le client existant (`frontend/lib/apppos/`), et `ref_id`
stocke l'**identifiant WooCommerce** de la cible. Aucun nouveau point d'entrée
réseau : AppPos est déjà le point 2 de `CLAUDE.md`.

C'est l'arbitrage que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` renvoyait
explicitement au ticket 4, et dont `ref_id` en chaîne opaque attendait la
réponse.

**Les deux faits qui l'imposent sont DÉCLARÉS, pas lus dans le code** — ils
n'étaient écrits nulle part avant ce bloc, et personne ne les a vérifiés
depuis le dépôt :

1. les collections `products`, `brands`, `categories` et `suppliers` de
   PocketBase local sont **vides** : elles ne contiennent pas encore les
   données d'AppPos ;
2. AppPos porte dans NeDB les **identifiants WooCommerce** des catégories,
   marques et produits, parce qu'il est synchronisé avec Woo.

**Écarté — PocketBase local :** le fait 1 le disqualifie. Les hooks existants
(`frontend/lib/queries/categories.ts`) sont branchés, mais sur des collections
sans lignes ; l'éditeur n'aurait rien à proposer. Le choisir aurait aussi
désigné la copie comme autorité, ce que le ticket 1 avait justement refusé de
faire par effet de bord du typage.

**Écarté — WooCommerce interrogé directement :** ce serait une quatrième sortie
réseau, à inscrire dans `CLAUDE.md`, et elle s'appuierait sur les clés
WooCommerce qui sont la faille 3.1 — déclarée prioritaire sur tous les tickets.
Passer par AppPos donne le même identifiant sans ouvrir ce chemin.

**Écarté — repousser l'arbitrage (liens manuels seuls au ticket 4) :** le
contrat posait la question ici. La laisser ouverte aurait obligé à revenir sur
l'éditeur une fois écrit.

**Conséquence pour le ticket 6 :** la résolution `ref` → `url` part d'un
identifiant WooCommerce, ce qui est aussi la forme de l'exemple du contrat
(`"ref": { "type": "category", "id": "142" }`). Aucune table de correspondance
intermédiaire à construire.

**Remise en cause si :** AppPos cesse d'être synchronisé avec WooCommerce, ou
le site cesse de servir ses URL de catégorie depuis WooCommerce. Le
remplissage des collections locales par les données d'AppPos ne suffirait pas :
il faudrait en plus que ces copies portent l'identifiant WooCommerce.

**Effet sur le bloc suivant :** la condition de remise en cause de `ref_id` en
relation PocketBase est **renforcée, pas levée**. Le ticket 4 ne désigne pas
PocketBase local comme référentiel des destinations — il désigne AppPos. La
première des deux conditions est donc non seulement non remplie, mais écartée
sur un fait structurel.

## Schéma de la collection `site_menu` — 2026-08-06

La destination d'une entrée est stockée en **référence dénormalisée**
(`link_type` en `select`, `ref_id` en chaîne opaque), et la collection **n'a
pas de champ `company`**. Schéma complet : `backend/migrations/site_menu.go`.

**Écarté — `ref_id` en relation PocketBase :** elle aurait tranché, au ticket 1,
une question que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` laisse explicitement
ouverte jusqu'au ticket 4 — lequel des trois référentiels (AppPos, WooCommerce,
PocketBase local) fait foi pour une destination. Une relation ne peut pointer
que vers PocketBase local, qui n'est qu'une copie des référentiels d'AppPos
(faille 3.3 de l'audit) ; l'exemple du contrat, lui, porte un identifiant
WooCommerce. Choisir la relation aurait donc désigné la copie comme autorité
par un effet de bord du typage, et il aurait fallu une migration pour le
défaire.

**L'absence de `company` est délibérée, ce n'est pas un oubli.** `categories`,
`products`, `customers` et `invoices` portent toutes une relation `company`
requise ; `site_menu` en est la seule exception du catalogue local, et un
lecteur futur y verrait une erreur sans cette note. La raison : ces collections
décrivent l'activité d'une entreprise, `site_menu` décrit **un site**, et il
n'y en a qu'un. Ajouter le champ aurait anticipé le multi-site sans besoin, et
imposé de choisir une société à la publication alors que la publication ne
s'adresse qu'à axemusique.shop.

**Remise en cause si :**

- `ref_id` — le ticket 4 désigne PocketBase local comme référentiel des
  destinations, **et** on veut que l'intégrité référentielle détecte les
  destinations orphelines, plutôt que la vérification faite à la publication.
  Les deux conditions, pas une seule : sans la première, une relation ne peut
  pas pointer vers la bonne source.
- `company` — un second site est piloté depuis PocketApp, ou le multi-poste
  arrive (§6 de `03-audit-resultats.md` le reporte aujourd'hui).

## Contrat du menu publié — 2026-08-06

Le menu publié est servi à une **URL stable et non versionnée**,
`https://axemusique.shop/data/menu.json`, et chaque entrée porte une
**référence typée `{type, id}` accompagnée de l'`url` résolue à la
publication**. Forme complète : `frontend/modules/site/PocketSite-docs/05-contrat-menu.md`.

**Écarté — URL versionnée (`menu.v1.json`) :** changer de version obligerait à
redéployer le site, par FTP et sans retour arrière (faille 3.7). Or c'est
précisément ce que le contrat existe pour éviter. La version est un champ dans
le document, comme le prévoyait déjà §4.4 de l'audit.

**Écarté — destination en URL brute, sans référence typée :** le site ne saurait
pas d'où vient un lien, et personne ne pourrait détecter une destination devenue
orpheline. La référence seule, sans URL résolue, a été écartée symétriquement :
elle obligerait le site à savoir ce qu'est une catégorie WooCommerce et à
refaire la résolution — du travail dans le dépôt le plus coûteux à redéployer.
On publie donc les deux : le site ne lit que `url` et reste bête, PocketApp
garde `ref` et l'intelligence.

**Écarté — arbre imbriqué à `children` :** le site consomme aujourd'hui une
liste plate `{id, title, url, parent}` (`wordpress.js:52-71` du dépôt du site).
Publier un arbre aurait imposé un aplatissement, donc une modification des
composants de navigation, pour un bénéfice nul.

**Le raisonnement, commun aux trois :** c'est §4.4 de l'audit appliqué un cran
plus bas — mettre l'intelligence du côté qui se redéploie facilement. PocketApp
se rebuilde à volonté ; le site part par FTP sans retour arrière.

**Vérifié à cette occasion :** le `.htaccess` racine garde ses deux règles de
réécriture par `RewriteCond %{REQUEST_FILENAME} !-f`. Un fichier réellement
présent à `/data/menu.json` est servi en statique, sans PHP sur le chemin de
lecture, sans modification du `.htaccess` au ticket 7.

**Remise en cause si :** la couche distante doit accueillir autre chose que le
menu — un second objet publié remettrait en question le chemin `/data/menu.json`
et l'idée d'un document unique. Ou si un consommateur autre que le site doit
lire le fichier et a besoin de plus que `url`.

## Documentation dans le dépôt, Obsidian pour le personnel — 2026-08-06

`CLAUDE.md`, `docs/DECISIONS.md` et les `<Nom>-docs/` de module sont versionnés
avec le code. Obsidian sert d'éditeur Markdown sur ces fichiers, et de vault
séparé non versionné pour le personnel et le transversal.

**Écarté :** tenir la connaissance projet dans Obsidian. Elle se désynchronise
du code dès le premier renommage, et un agent ne la lit pas.

**Remise en cause si :** un second contributeur arrive, ou si les notes
personnelles commencent à contenir des décisions projet — signe que la
frontière ne tient pas.

## Pas de surcouche d'orchestration d'agents — 2026-08-06

Claude Code dans le dépôt suffit. Le problème est le contexte donné aux agents,
pas la coordination entre eux.

**Écarté :** frameworks multi-agents. Ils résolvent un problème de coordination
qu'un développeur seul n'a pas.

**Remise en cause si :** des sessions parallèles sur des modules différents
deviennent la norme.

## Couche distante : JSON statique déposé par PHP — 2026-08-06

Pour le MVP menu : PocketApp pousse en HTTP vers un script PHP protégé par
`X-API-Key`, le script écrit un `menu.json`, le site le lit en statique — **pas
de PHP sur le chemin de lecture**. Ensuite : MySQL en stockage, JSON statique
en lecture (option C), quand les produits arriveront.

**Écarté — MySQL avec endpoints PHP en lecture :** paie le coût de MySQL sur le
chemin de lecture du site. On ne quitte pas un intermédiaire PHP+MySQL pour en
rebâtir un plus petit.

**Écarté — API Node/Express, PocketBase distant, SQLite distant :** impossibles
sur mutualisé, aucun processus persistant.

**Le raisonnement, qui est la vraie décision :** ce qui engage n'est pas le
stockage mais le **contrat** — l'URL appelée et la forme du JSON. Le contrat est
coûteux à changer parce qu'il vit dans un build déployé par FTP sans retour
arrière. Ce qu'il y a derrière l'URL se remplace en une après-midi. Donc :
soigner le contrat, prendre le stockage le plus simple.

**Remise en cause si :** un des quatre déclencheurs de la section 4.5 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` est atteint.

## PocketBase local est acquis — antérieur, consigné le 2026-08-06

Wails embarque PocketBase (SQLite) sur `:8090`. Ce n'est pas une option à
réévaluer, c'est l'existant. La question « SQLite ou JSON » ne concernait que la
couche **distante** ; la couche locale est déjà tranchée.

**Remise en cause si :** jamais, dans le cadre de la refonte du site.

## AppPos reste autorité pendant la transition — antérieur, consigné le 2026-08-06

AppPos détient produits, catégories, marques et fournisseurs. PocketBase local
en contient des copies. PocketApp le remplacera, mais pas maintenant.

**Coût accepté et connu :** chaque fonctionnalité de PocketApp qui lit AppPos
alourdit la bascule finale. Coût croissant avec le temps.

**Remise en cause si :** le coût de la bascule devient supérieur à celui de
maintenir les deux — à réévaluer, pas à subir.
