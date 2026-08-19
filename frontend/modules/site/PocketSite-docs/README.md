# PocketSite — pilotage du site axemusique.shop

Module en production. **Mission « menu » terminée le 10 août 2026** : la
navigation d'axemusique.shop est éditée ici et publiée d'un clic ; le site ne
lit plus WordPress pour l'afficher.

**Mission suivante : migrer le catalogue de NeDB vers PocketBase, tout en
local** — pour s'affranchir d'AppServe. Point d'entrée :
[`10-plan-migration.md`](10-plan-migration.md).

> **13 août 2026 — la suite se joue ailleurs.** Ce que le site demandait est
> livré : il lit le catalogue PocketBase, et ses textes s'éditent ici. Ce qui
> reste — faire passer la **gestion interne** derrière une couche d'accès
> commune, puis vers PocketBase — est une mission du module `stock`, avec son
> propre rituel :
> [`../../stock/PocketStock-docs/00-rituel-migration-appstock.md`](../../stock/PocketStock-docs/00-rituel-migration-appstock.md).
> Ce dossier-ci reste l'autorité sur **le site** : contrat d'export, lecture
> publique, menu. Il ne suit pas l'avancement d'AppStock.

**La cible a changé le 10 août 2026** : elle n'est plus « publier le catalogue
vers une base SQL sur IONOS », mais « PocketBase devient la source de vérité »
([`docs/DECISIONS.md`](../../../../docs/DECISIONS.md)). Le
[`06-rituel-catalogue.md`](06-rituel-catalogue.md) reste valable pour ce qu'il
documente : il n'est pas périmé, il est **dépassé sur la cible**.

## Par où commencer

| Fichier | Quoi | Fiabilité |
|---|---|---|
| [`10-plan-migration.md`](10-plan-migration.md) | **À lire en premier pour la suite.** Les sept tickets de migration, leurs prérequis et leur ordre | plan, rien d'écrit |
| [`09-modele-cible.md`](09-modele-cible.md) | **Fait foi sur le modèle.** Les collections cibles, champ par champ ; §9 : confrontation au schéma PocketBase réel | mesuré et lu, décisions au journal |
| [`08-rituel-migration-pocketbase.md`](08-rituel-migration-pocketbase.md) | Le rituel qui a cadré la mission — remplace le 06 sur la cible | carte de départ |
| [`07-audit-flux-apppos.md`](07-audit-flux-apppos.md) | **Fait foi sur le flux AppPos ↔ WooCommerce** et sur l'état des données | lu dans le code, mesuré |
| [`06-rituel-catalogue.md`](06-rituel-catalogue.md) | Rituel précédent — **dépassé sur la cible**, valable sur le reste | carte de départ, inventaire non lu |
| [`03-audit-resultats.md`](03-audit-resultats.md) | **Fait foi.** Flux réel, failles, architecture retenue, tickets | lu dans le code, références données |
| [`05-contrat-menu.md`](05-contrat-menu.md) | **Fait foi sur la forme publiée.** URL, format du `menu.json`, notes pour les tickets 5 et 8 | contrat, à respecter |
| [`docs/DECISIONS.md`](../../../../docs/DECISIONS.md) | **Hors de ce dossier** — journal du dépôt. Contrat du menu, schéma de `site_menu` | fait foi sur ce qui a été écarté |
| [`00-contexte.md`](00-contexte.md) | Cadrage, arbitrages tranchés | corrigé après audit |
| [`archive/`](archive/) | Prompts déjà exécutés, énoncés de tickets | **ne fait pas foi** |

En cas de contradiction entre deux fichiers, `03-audit-resultats.md` gagne —
sauf sur la **forme du menu publié et son URL**, où `05-contrat-menu.md` gagne.
C'est le seul fichier d'ici destiné à être lu depuis les deux autres dépôts.

`03-audit-resultats.md` est un compte rendu daté : **on ne le réécrit pas** pour
suivre l'avancement. Son tableau de tickets dit ce qui était prévu le 6 août
2026 ; **le tableau ci-dessous fait foi sur l'état réel des tickets**, libellés
compris. Un ticket dont le périmètre a bougé est reformulé ici, pas là-bas.
Les prompts déjà exécutés sont dans [`archive/`](archive/) : ils disent ce qu'on
a demandé, pas ce qui est vrai.

## Où en est-on

**Les neuf tickets sont terminés. Le MVP est en production depuis le 10 août
2026.** 1 à 4 le 6 août, le 5 le 7, le 5b et le 6 le 8, les 7, 8 et 9 le 10.

**Le menu de navigation d'axemusique.shop ne vient plus de WordPress.** Il est
édité dans PocketApp, publié d'un clic, et servi en statique.

```
PocketApp (site_menu)
   │  composition + résolution ref → url, en React
   ▼
POST https://axemusique.shop/server/api/publish-menu.php   ← X-API-Key, depuis le Go
   │  validation du contrat, écriture atomique
   ▼
GET  https://axemusique.shop/data/menu.json                ← lecture statique, sans PHP
   │
   ▼
site React — seule source du menu affiché
```

**Constaté dans le bundle en production** (`/assets/index-By-vV8I8.js`) :
`data/menu.json` présent, **`wp/v2/menus` absent — zéro occurrence**. L'ancienne
source n'est pas désactivée par un drapeau, elle n'est plus dans le code livré.

**Le 5b n'était pas au plan initial.** Il porte le réglage de la clé et de
l'URL de publication, que le ticket 6 supposait acquis sans que rien ne les
range : section « Publication du site » dans Réglages > Clés API.

**Ce qui reste vrai et n'a pas été traité :** la faille 3.1 (clés WooCommerce
dans le bundle public) reste ouverte et prioritaire, et `wp-admin` conserve son
menu inutilisé.

## Le catalogue est sorti de WooCommerce — 11 août 2026

La phrase ci-dessus disait « les pages du site continuent de s'hydrater depuis
WooCommerce ». **Ce n'est plus vrai des pages catalogue.**

```
NeDB (référence)  ──catalog-import -load──▶  PocketBase local
                                                  │  règle de mise en ligne
                                                  │  (status = published)
                                                  ▼
                        POST  server/api/products-sync.php   ← X-API-Key, depuis le Go
                                                  │  upsert sur legacy_id
                                                  ▼
                                       base SQL Axemusique (ax_*)
                                                  │
                        GET   server/api/catalog.php         ← PUBLIC, sans clé
                                                  ▼
                                     site React — accueil, catégorie, produit
```

| Fait | Où |
|---|---|
| Vue « Catalogue en ligne », états absent / modifié / à jour | `frontend/modules/site/CatalogueEnLignePage.tsx` |
| Règle de mise en ligne, dérivée et testée | `frontend/modules/site/lib/online-catalog.ts` |
| Export par lots, empreintes SHA-1 | `frontend/modules/site/lib/catalog-export.ts` |
| Écriture SQL, upsert, slug figé | `server/api/products-sync.php` |
| Lecture publique, branche et ancêtres | `server/api/catalog.php` |
| Pages du site derrière `VITE_USE_AXE_CATALOG` | `src/pages/axe/` du dépôt site |

**Contrats :** [`12-contrat-catalogue.md`](12-contrat-catalogue.md) fait foi sur
l'export ET sur la lecture publique.

### Les textes du site s'éditent dans l'écran — révisé le 19 août 2026

La vue « Catalogue en ligne » n'était que lecture et export ; elle édite
désormais **le `name` canonique du produit et la `description` du produit, de la
catégorie et de la marque**. Ni prix, ni stock, ni statut : ils appartiennent à
AppStock.

**`name` fait office de titre de site** : `present_product`
(`server/api/catalog.php:134-141`) retombe sur `name` quand `site_title` est
vide. `toExportProduct` envoie toujours `site_title` à `null` : le même
nom/référence canonique fait donc foi dans PocketApp et sur le site. L'assistant
de fiche reçoit ce nom comme contexte mais ne génère et n'applique que la
description. Le champ titre garde une icône IA distincte ; son résultat ne
devient `name` qu'après l'enregistrement humain.

**Chaîne rapportée comme vérifiée par le propriétaire le 13 août 2026** :
produit renommé dans l'écran, carte repassée « modifiée », export, titre corrigé
lu sur la page produit du site. Le 19 août, le cache de la grille a été rendu
immédiat après écriture ; ce constat n'a pas été mesuré depuis le dépôt.

**Écriture directe dans les collections, pas de migration** (`docs/DECISIONS.md`,
2026-08-12). Contrepartie assumée : **`catalog-import -load` efface ces saisies**
— la campagne éditoriale réelle se fera après l'import définitif, et l'éditeur
affiche l'avertissement.

| Fait | Où |
|---|---|
| Règle de saisie — `name` canonique et description | `lib/catalog-edit.ts`, testée |
| Voie d'écriture unique, hors `useUpdateProductUniversal` | `hooks/use-catalog-editorial.ts` |
| L'éditeur | `components/online-catalog/EditorialDialog.tsx` |
| L'empreinte d'export suit toujours `name` et `description` | `lib/catalog-export.test.ts` |

**Quatre décisions structurantes**, toutes au journal du dépôt :

- la clé d'une entité est **`legacy_id`**, jamais l'identifiant PocketBase —
  qui est régénéré à chaque rechargement par purge ;
- **l'URL est figée au premier envoi**, et le serveur en est le seul gardien ;
- **l'endpoint de lecture est public et sans clé** — un secret dans un bundle
  public serait la faille 3.1 répétée ;
- **les destinations du menu viennent du catalogue PocketBase**, plus d'AppPos :
  433 catégories sur 463 n'avaient pas de slug chez lui et ne pouvaient donc pas
  figurer au menu.

**Ce qui n'est pas fait, et qui est connu :**

- **les images** — 4665 fichiers, 1,7 Go, non exportés ; les pages affichent une
  vignette de remplacement. Session dédiée ;
- **le retrait** d'un produit dépublié : l'export n'efface rien ;
- **les 257 produits** dont l'état de publication bascule, à trancher à l'export ;
- **les entrées de menu héritées** portent des URL manuelles écrites du temps de
  WordPress : certaines pointent un homonyme, d'autres un slug inexistant ;
- **les catégories homonymes** — deux « Guitares électriques », dont celle qui
  porte le slug propre n'a qu'un produit. À nettoyer côté NeDB de production ;
- **les marques n'ont pas de page** sur le site : elles sont listées dans
  l'éditeur de menu mais non sélectionnables ;
- **aucune date d'arrivée ne traverse la chaîne** — le site ne peut donc pas
  afficher « les derniers produits », et les produits venus de NeDB n'en auront
  jamais une qui leur soit propre. État des lieux couche par couche, ce que
  `dateSoumission` porte réellement en base, et les trois chemins possibles :
  [`13-dates-produits.md`](13-dates-produits.md). **Pas urgent, rien d'engagé.**
- **le bandeau de statistiques du site est masqué** sous le drapeau : il compte
  les produits et les marques dans WooCommerce, et `catalog.php` ne sait rendre
  ni un total de produits ni une liste de marques. Rituel prêt à exécuter, SQL
  compris : [`14-rituel-stats.md`](14-rituel-stats.md). **Pas urgent.**

| # | Ticket | Dépend de | Dépôt | État |
|---|---|---|---|---|
| 1 | Collection `site_menu` dans PocketBase local | — | PocketApp | **fait** |
| 2 | Squelette du module PocketSite et sa route | — | PocketApp | **fait** |
| 3 | Contrat JSON publié : URL, version, horodatage, entrées | — | doc | **fait** |
| 4 | Éditeur d'arbre libre | 1, 2, 3 | PocketApp | **fait** |
| 5 | Endpoint PHP de réception, `X-API-Key` | 3 | serveur (`server/`) | **fait** |
| 5b | Réglage de la clé et de l'URL de publication | 5 | PocketApp | **fait** |
| 6 | Action « Publier le menu » | 4, 5b | PocketApp | **fait** |
| 7 | Exposition du `menu.json` en lecture statique | 5 | serveur | **fait** |
| 8 | Bascule `.env` dans `loadMenu()` + purge cache + repli | 3, 7 | site | **fait, drapeau à `false`** |
| 9 | Drapeau par défaut sur la nouvelle source | 8 | site | **fait, en production** |

Les tickets 1 à 5 n'ont aucun effet observable en production. Détail et notes de
mise en œuvre : section 5 de `03-audit-resultats.md`.

**Prioritaire sur tout ceci et hors tickets :** la faille 3.1 — clés WooCommerce
en clair dans le bundle public du site.

## Notes laissées par le ticket 4

Quatre constats faits en écrivant l'éditeur. Aucun ne le bloque. Le second a
été traité le 7 août 2026 ; les deux derniers sont là pour éviter qu'on les
redécouvre au ticket 6.

**Une chose à faire reprendre, une déjà reprise :**

- **`site_menu` reste hors de `frontend/lib/pocketbase-types.ts`.** Non parce
  que `pnpm typegen` échoue — il fonctionne —, mais parce que le fichier commité
  n'est pas une sortie de générateur : il a été retouché à la main, et le
  régénérer efface ces retouches et sort cinq erreurs dans la chaîne
  produits/caisse. Les types de `site_menu` sont donc déclarés en tête de
  `frontend/lib/queries/site-menu.ts`, à la forme exacte de la sortie réelle du
  générateur. Détail et lignes fautives : le commentaire de ce fichier. Adopter
  la sortie du générateur est une session à part, sur le maillon le moins
  négociable.

- ~~**Rien n'authentifie AppPos au démarrage de l'application.**~~ **Corrigé le
  7 août 2026.** Le constat était : chacune des **neuf** pages qui lisent AppPos
  refaisait sa propre connexion dans un `useEffect`
  (`frontend/modules/stock/useStockModule.ts:55`,
  `frontend/modules/cash/CashTerminalPage.tsx:272`, et sept pages de
  `connect`), le jeton vivant ensuite en `sessionStorage`
  (`frontend/lib/apppos/apppos-api.ts:84-87`) — donc tout marchait, à condition
  d'être passé par une de ces pages d'abord. La dixième copie que le ticket 4
  avait laissée dans le module (`hooks/use-apppos-session.ts`) est **supprimée**.

  À sa place, un point unique : `AppPosSessionProvider`
  (`frontend/lib/apppos/apppos-session-provider.tsx`), monté dans
  `frontend/main.tsx` **au-dessus d'`AuthProvider`**. Il ouvre la session une
  fois au lancement et **ne bloque pas le rendu** : ses enfants s'affichent
  immédiatement, le contexte se met à jour quand la requête retombe — AppPos
  éteint reste un cas normal, l'application s'ouvre quand même. Il lit
  `VITE_APPPOS_USERNAME` / `VITE_APPPOS_PASSWORD`. Aucune nouvelle sortie
  réseau : AppPos est le point 2 de `CLAUDE.md`.

  `useAppPosSession()` s'importe désormais depuis `@/lib/apppos` et n'ouvre plus
  rien — c'est une **lecture** de l'état (`isConnected`, `isConnecting`,
  `error`). `MenuTreeEditor.tsx:134` s'en sert inchangé.

  **Les neuf appelants n'ont pas été touchés**, volontairement : leur garde
  `getAppPosToken()` les rend inoffensifs dès qu'une session existe en amont, et
  deux d'entre eux sont dans la caisse. **Reste ouvert, ticket à part :** les
  identifiants sont écrits **en dur** dans huit des neuf
  (`loginToAppPos('admin', 'admin123')`) et partent dans le bundle — même
  famille que la faille 3.1. Le point unique ne propage pas ce couple.

**Deux constats sans action, à connaître avant le ticket 6 :**

- **`AppPosProduct` ne déclare pas `woo_id`** — `frontend/lib/apppos/apppos-types.ts:56-118`,
  là où `AppPosCategory` et `AppPosBrand` le déclarent (`:128` et `:155`).
  **C'est le type qui est incomplet, pas la donnée** : `wooSyncController.js`
  d'AppPos écrit `woo_id` sur le produit à chaque synchronisation (lignes 357
  et 513) et filtre sur son absence (ligne 182) ; un produit publié en a un.
  Lu dans le dépôt AppPos, qu'on ne modifie pas. L'éditeur lit donc le champ
  défensivement plutôt que d'élargir le type : présent il sert, absent — jamais
  synchronisé — le produit est listé mais non sélectionnable.

- **La page produit du site est un gabarit vide** (`src/pages/Product.jsx` du
  dépôt du site : elle affiche « Produit #id »). Sans effet sur le ticket 4,
  mais une entrée de menu pointant vers un produit mènerait aujourd'hui à une
  page inachevée. À regarder au ticket 6, quand la résolution en URL se
  décidera.

## Après le ticket 8 — le menu ne dépend plus de WordPress du tout

**10 août 2026, hors tickets.** Deux changements demandés une fois le ticket 8
en place, parce que la bascule seule ne suffisait pas à couper WordPress.

- **Le menu WordPress a été importé dans `site_menu`** —
  [`scripts/import-wp-menu.mjs`](../../../../scripts/import-wp-menu.mjs), 26
  entrées, 6 racines, 20 enfants. Script autonome, joué une fois, **ne faisant
  pas partie de l'application** : lire WordPress depuis PocketApp aurait été une
  cinquième sortie réseau permanente pour un besoin ponctuel. Tout est importé
  en **lien manuel**, jamais en référence typée — la résolution `ref` → `url`
  lit le slug dans AppPos, absent pour 433 catégories sur 463 ; un import typé
  aurait produit un menu impubliable.

- **L'injection des sous-catégories WooCommerce est supprimée** dans
  `useNavigation.js` du dépôt du site. Le menu affiché est désormais exactement
  le menu publié. Raisons, prix et effet de bord sur la troncature d'URL : bloc
  « Le menu publié est la seule source du menu affiché » de `docs/DECISIONS.md`,
  qui **annule** celui pris quelques heures plus tôt.

## Notes laissées par le ticket 8

Écrit dans `I:\divi-child` le 10 août 2026. **Rien n'est déployé** : le drapeau
`VITE_USE_PUBLISHED_MENU` vaut `false`, `dist/` est ignoré par Git. Le ticket 9
est de le passer à `true` et de rebuilder.

**Vérifié dans un navigateur**, drapeau forcé sur une instance de test : le menu
publié s'affiche avec sa hiérarchie, sous-menu compris. Ce n'est pas une
déduction de lecture de code.

- **La conversion `parent: null` → `"0"` était indispensable, et invisible.**
  `useNavigation.js:109-111` cherche la racine par
  `item.parent === parentId.toString()` avec `parentId = "0"`. Le document
  publié met `null`. Mesuré sur le fichier réel : **sans conversion, zéro
  racine, menu vide** ; avec, l'arbre se construit. §6.3 du contrat annonçait un
  écart bénin (« `!item.parent` continue de fonctionner ») — c'était faux, le
  test réel n'est pas celui-là. L'adaptation est faite en un seul endroit,
  `src/services/published-menu.js` ; aucun composant de navigation n'est touché.

- **Deux dépendances résiduelles à WordPress, trouvées après coup :**
  `useWordPressData.js` lisait `CACHE_KEYS.MENU` en dur pour l'affichage
  immédiat (menu WordPress au premier rendu, même site basculé), et n'appelait
  `loadMenu()` que si `testConnection()` passait — donc WordPress en panne
  privait le site de son menu *alors qu'il ne le sert plus*. On aurait remplacé
  la source sans supprimer la dépendance. Corrigé par `activeMenuCacheKey()`,
  seul endroit qui décide de la clé.

- **Le repli a été réécrit, pas branché.** Détail dans `constants.js` : forme
  incompatible avec son unique consommateur, `parent` numériques, et URL ne
  correspondant à aucune route.

- **Le cache s'invalide par construction** : une clé par source. Basculer ne
  peut pas resservir l'ancien menu, revenir en arrière retrouve le sien, aucune
  purge à écrire. `clearAllCache()` efface bien les deux.

- **Le menu était affiché ~2,5 s trop tard, et ce n'était pas le mode
  développement.** Mesuré : le `menu.json` publié arrive en 0,13 s, les marques
  en 1,64 s, les catégories en ~2 s. Deux causes dans `useWordPressData.js`,
  toutes deux corrigées, **et c'est la seule incursion dans la performance** —
  §6 de l'audit la reporte, on n'ouvre pas ce chantier :

  1. le menu était posé dans le même `setData` que tout le reste, donc derrière
     un `Promise.allSettled` qui attendait produits, catégories et marques. Il a
     désormais sa propre promesse et s'affiche seul ;
  2. `testConnection()` s'exécutait **en série avant tout**, pour 0,64 s et
     328 Ko d'index `wp-json` que personne ne lit. Son seul rôle est de décider
     s'il faut interroger WordPress — question sans objet quand la source est le
     fichier publié. Il est sauté dans ce cas.

  Résultat mesuré dans le navigateur : menu prêt à **244 ms**, aucun appel à
  `/wp-json/wp/v2/`, le catalogue continuant de charger derrière sans le
  retenir. Le reste du chargement n'a pas été touché.

## Notes laissées par les tickets 6 et 7

- **L'hébergeur rejette l'agent utilisateur par défaut de Go.** Symptôme :
  publication en échec, « réponse inattendue du serveur », alors que tous les
  tests `curl` passent — parce que `curl` envoie son propre agent. Le PHP n'est
  jamais atteint. Table de comparaison et parade : section dédiée de
  [`server/README.md`](../../../../server/README.md), et contrainte inscrite
  dans `CLAUDE.md`.

- **Deux pièges d'interface corrigés en cours de route**, tous deux du même
  genre — l'information existait, l'écran ne la montrait pas :
  l'URL de publication était un `placeholder` (champ qui paraît rempli, ne
  s'enregistre pas, publication en `412`), et le corps de la réponse distante
  était remonté par le Go puis jeté par le hook. Un réglage obligatoire ne se
  suggère pas en gris, et un diagnostic transporté doit être affiché.

- **`/data/menu.json` est mis en cache par le navigateur** — pas de
  `Cache-Control`, seulement `etag`/`last-modified`. Une publication réussie
  peut donc sembler sans effet. **Deux caches à franchir au ticket 8**, pas un
  seul. Voir §6.3 du contrat.

- **`vitest` est désormais une dépendance du projet** — `pnpm test`. Neuf cas
  sur la composition dans `../lib/publish-menu.test.ts` : exemple du contrat,
  ordre des frères, descendance d'une entrée masquée, absence de parent
  orphelin, refus global sur une entrée non résolue, forme de `publishedAt`.
  C'est le premier test automatisé du dépôt.

  **Version 2, pas 4** : `vitest` 4 exige Vite 6, le projet est en Vite 5.
  Installer la dernière version laissait une dépendance de pair non satisfaite.

- **Avant le ticket 8 : lancer le site en local est un prérequis, pas un
  confort.** Le site part par FTP sans retour arrière (faille 3.7) ; comparer
  les deux sources en changeant un drapeau ne peut se faire qu'en local. Deux
  obstacles à connaître avant de commencer, tous deux consignés en §6.3 du
  contrat : le CORS sur `/data/menu.json`, et les **deux** caches.

## Notes laissées par le ticket 5b

- **`GET /api/settings/pocketapp-key` renvoie la clé du mini-SaaS déchiffrée
  sans garde admin** — `backend/routes/secrets_routes.go:125`, là où les quatre
  routes voisines portent `requireAdmin` (`:121`, `:154`, `:190`). Appelée ainsi
  par `frontend/lib/credits.ts:22`, ce qui explique probablement l'omission.
  **Non corrigé, hors périmètre**, et sans lien avec le menu — mais c'est la
  raison pour laquelle la clé de publication est une clé à part. Faille de la
  même famille que 3.1, à traiter dans une session dédiée.

- **Deux sections de réglages ont été retirées :** « Secret Webhook » (signait
  des webhooks sortants qui n'existent pas) et « Secrets personnalisés »
  (formulaire libre, permettait d'écraser une clé nommée par erreur). **Les
  routes Go correspondantes existent toujours**, désormais sans appelant, de
  même que quatre hooks de `frontend/lib/queries/secrets.ts`. Les supprimer est
  un nettoyage à part, pas un oubli.

## Notes laissées par le ticket 5

- ~~**Ce dont le ticket 6 aura besoin, et que ce dépôt ne contient pas :** l'URL
  de l'endpoint et la clé `X-API-Key`.~~ **Traité le 8 août 2026 par le
  ticket 5b.** Les deux se règlent depuis Réglages > Clés API, section
  « Publication du site » : la clé dans le `SecretManager` (chiffrée,
  `site_publish_api_key`), l'URL en réglage clair (`site_publish_url`). Le
  ticket 6 n'a plus qu'à les lire côté Go. Détail des arbitrages — clé dédiée,
  composition en React, POST émis par le Go — dans `docs/DECISIONS.md`.

- **Le contrat a bougé sur deux points mineurs**, consignés dans §6.1 de
  `05-contrat-menu.md` : `ref.type` est validé contre les quatre valeurs de §3,
  et `publishedAt` doit être en UTC avec suffixe `Z`. Le producteur du
  ticket 6 doit s'y conformer, sinon le document est refusé en `422`.

- **La taille maximale est fixée à 256 Kio** (§7 du contrat), en configuration
  serveur et non en dur.

- **Le mini-SaaS n'a toujours pas été lu** (§7.1 de l'audit, inchangé). La
  structure `api/` + configuration hors dépôt + `schema.sql` a été reprise de sa
  *description* dans §5 de l'audit, pas de son code.

## À ne pas anticiper

Performance, SEO, cache, images, migration des produits, bascule
AppPos → PocketApp, CI/CD du site, simplification du `.htaccess`, multi-poste,
authentification au-delà de `X-API-Key`. Liste complète en section 6 de
`03-audit-resultats.md`. Reporté veut dire reporté.

## Rituel de fin de session

Mettre à jour la ligne « ticket en cours » et la colonne État ci-dessus. C'est
tout ce que ce fichier demande.
