# PocketApp — carte du dépôt

Logiciel de caisse Wails (Go + React) embarquant PocketBase. Remplaçant à terme
d'AppPos. Pilote aussi le site vitrine axemusique.shop.

`README.md` à la racine est le README du template d'origine, pas celui du
projet. Ne pas s'y fier.

## Les trois dépôts

| Dépôt | Rôle | Statut |
|---|---|---|
| **PocketApp** (`I:\pockapp`, ce dépôt) | Caisse + pilotage du site | actif |
| **AppPos** (non versionné ici) | React / Express / NeDB `:3000` — **autorité** sur produits, catégories, marques, fournisseurs | on n'y touche pas |
| **Site** (`I:\divi-child\frontend-wp`) | Build React devant WordPress/WooCommerce — vitrine, **pas de vente en ligne**. Lit le menu publié, et depuis le 2026-08-11 ses premiers produits dans notre base SQL via `server/api/catalog.php` — drapeau `VITE_USE_AXE_CATALOG`, par défaut `false` | modifié aux tickets 8-9 |

Ce dépôt est le seul documenté. AppPos et le site sont décrits ici, jamais
depuis leur propre dépôt.

## Structure

```
main.go, proxy.go, app.go      Wails + PocketBase embarqué (:8090)
remote_notifications.go        canal vers le mini-SaaS distant (X-API-Key)
backend/migrations/            schéma PocketBase, importé par main.go:15
pb_hooks/                      hooks PocketBase
migrations/                    non importé — vestige, ne pas y ajouter
frontend/routes/               routes TanStack Router (générées)
frontend/modules/<nom>/        un module = un domaine métier
frontend/modules/<nom>/<Nom>-docs/   doc du module, versionnée avec lui
frontend/lib/queries/          accès données (TanStack Query)
frontend/lib/apppos/           client HTTP vers AppPos (REST seul depuis le 19/08)
server/                        code PHP du serveur mutualisé d'axemusique.shop —
                               versionné ici, déposé par FTP, ne s'exécute pas
                               dans PocketApp. Voir server/README.md
docs/DECISIONS.md              pourquoi les choses sont comme elles sont
```

Modules : `cash` (caisse), `stock` (produits, lecture **et** écriture),
`site` (pilotage du site — en construction), plus `auth`, `home`, `settings`,
`stats`, `stick`, `connect`, `updater`, `common`.

## Points d'entrée réseau

Trois, et trois seulement :

1. **PocketBase local** — `frontend/lib/use-pocketbase.ts:5` — `127.0.0.1:8090`
   sous Wails, sinon proxy Vite (`VITE_BACKEND_URL`).
2. **AppPos** — `frontend/lib/apppos/apppos-config.ts:5` — `VITE_APPPOS_URL`,
   sinon `127.0.0.1:3000`. Jeton Bearer en `sessionStorage`. **REST seul** : le
   canal WebSocket est retiré depuis le 19 août 2026, il n'avait plus aucun
   consommateur. Un seul lecteur subsiste, `MenuTreeEditor.tsx:55`, pour nommer
   les destinations du menu.
3. **Mini-SaaS distant** — `remote_notifications.go:27` et
   `backend/routes/gemini_routes.go` —
   `pocketapp.5sensprod.com/api/notifications.php` pour les notifications et
   `/api/usage.php` pour déclarer les jetons Gemini, en-tête `X-API-Key`.
   Notifications, clés API, crédits IA. Télémétrie uniquement, jamais de
   catalogue.

Toute nouvelle sortie réseau s'ajoute à cette liste, dans ce fichier.

4. **Publication du menu** — `backend/routes/site_publish_routes.go` —
   `https://axemusique.shop/server/api/publish-menu.php`, POST, en-tête
   `X-API-Key`. Sortante uniquement, déclenchée par le bouton « Publier le
   menu » (ticket 6). L'URL et la clé sont des réglages
   (`site_publish_url`, `site_publish_api_key`) ; rien n'est en dur.
   Le code serveur qui reçoit est dans `server/`.

5. **Export du catalogue** — `backend/routes/site_catalog_routes.go` —
   `https://axemusique.shop/server/api/products-sync.php`, en-tête `X-API-Key`
   et `User-Agent` explicite (même couche anti-bot). **GET** pour lire
   l'inventaire de la base SQL distante, **POST** pour y pousser un lot.
   Réglages `site_catalog_url` et `site_catalog_api_key`, distincts de ceux du
   menu : cette clé-là écrit dans la base de données du catalogue. Contrat :
   `frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md`.

6. **Assistant éditorial Gemini** — `backend/routes/gemini_routes.go` —
   `https://generativelanguage.googleapis.com`. Le titre et les documents
   utilisent `gemini-3.1-flash-lite` ; Google Search utilise
   `gemini-2.5-flash-lite`, dont le niveau gratuit accepte le grounding. Le
   renderer appelle la route locale authentifiée et restitue les sources. La
   clé `GEMINI_API_KEY` reste dans le processus Go et part dans l'en-tête
   `x-goog-api-key`, jamais dans le bundle ni dans l'URL.

## Commandes

```bash
pnpm dev              # Wails en dev (front + PocketBase)
pnpm build:windows    # binaire Windows
pnpm format           # Biome, à passer avant commit
pnpm router:generate  # après ajout/renommage d'une route
pnpm typegen          # types TS depuis le schéma PocketBase (serveur démarré)
```

## Contraintes à ne pas franchir

- **Ne pas modifier AppPos.** La caisse en dépend, c'est le maillon le moins
  négociable. PocketApp lit AppPos ; l'inverse n'existe pas.
- **Le catalogue PocketBase est chargé depuis le 2026-08-11** :
  2999 produits, 463 catégories, 287 marques, 43 fournisseurs, et 4665 images
  (1,7 Go) dans `%LOCALAPPDATA%\PocketReact\pb_data`. Il a été une
  **projection de NeDB**, reconstructible par
  `go run ./backend/cmd/catalog-import -load`.
  **Ce n'est plus vrai depuis le 2026-08-19** : la base porte des ventes, des
  comptages et des produits nés en caisse. `backend/catalog/load/guard.go`
  refuse la purge dès qu'il en trouve, et `-force-purge` détruit sans retour.
- **La base NeDB de référence est `%APPDATA%\AppPOS\data`** (installation).
  `I:\AppPOS\AppServe\data` est une copie de développement **périmée** —
  2306 produits contre 3034, 219 catégories contre 463, et **aucun logo de
  marque** alors que la référence en porte 225. Tout chiffre mesuré avant le
  2026-08-11 vient de la base périmée. Voir `docs/DECISIONS.md`.
- **`pnpm typegen` casserait le front** tant que `apppos-transformers.ts` n'est
  pas aligné : le schéma catalogue n'a plus `price_ht`, `cost_price`, `active`,
  `stock_max`, `unit` ni `weight`, et 21 fichiers les référencent.
- **La base PocketBase est dans `%LOCALAPPDATA%\PocketReact\pb_data`**
  (`main.go:71-75`), pas dans le dépôt. **`I:\pockapp\pb_data` est un vestige**
  de novembre 2025, avec un schéma `products` incompatible (`price`, `cost`,
  `stock`) : ne jamais s'y fier pour juger du schéma en place.
- **`categories.parent` est cassé au schéma** — `collectionId` vide,
  `backend/migrations/catalog.go:143` annonce un correctif jamais écrit.
  Invisible tant que la collection est vide. À réparer avant toute écriture.
- **Les fonctions `ensure*Collection` sortent si la collection existe par son
  nom** (`catalog.go:17, 88, 163, 257`). Modifier `catalog.go` ne modifie donc
  **aucune base déjà installée**, et une base portant des collections homonymes
  plus anciennes est acceptée sans erreur ni mise à niveau. Toute évolution du
  schéma passe par une nouvelle migration.
- **Un seul chemin d'écriture pour les produits**, depuis le 18 août 2026 :
  `useCreateCatalogProduct` / `useUpdateCatalogProduct`
  (`frontend/lib/queries/catalog-products.ts`), vers PocketBase.
  `useUpdateProductUniversal` — qui routait entre les deux bases sur une chaîne
  non typée, `source === 'apppos_products'` en paramètre **optionnel** — a été
  supprimé avec son unique appelant. **Ne pas le réintroduire :** la source se
  déclare au point d'appel, typée. Un test le garde
  (`frontend/modules/stock/single-source.test.ts`).
- **Il n'y a plus qu'un écran catalogue**, `/stock/produits`, sur PocketBase
  (2026-08-18). `/stock` y renvoie. `/stock-apppos` et sa moitié AppPos —
  `StockView`, `StockPageAppPos`, `useStockModule`, `BrandFilterPanel`,
  `CategoryTreeAppPos`, `SupplierListAppPos` — sont supprimés, comme l'étaient
  déjà `StockPage.tsx`, `ProductDialog.tsx` et `CategoryPickerAppPos.tsx`.
  **Les images des produits sont servies par PocketBase**, par
  `pb.files.getUrl` : elles y sont depuis l'import du 2026-08-11 (2639 images
  principales, 747 galeries, 1,7 Go). Depuis le 2026-08-19, **plus aucun
  fichier du module `stock` n'importe `@/lib/apppos`** — l'inventaire physique
  était le dernier ; un test le garde
  (`frontend/modules/stock/single-source.test.ts`).
- **Le déploiement est multi-postes** (19 août 2026) : un poste sur
  l'application bureau, les autres au navigateur, sur le même PocketBase.
- **Le stock ne se lit ni ne s'écrit depuis le client.** Le mouvement passe par
  `POST /api/stock/adjust` (`backend/routes/stock_routes.go`), qui tient la
  lecture et l'écriture dans une seule transaction ; `stock-adjust.ts` ne fait
  plus qu'appeler la route et journaliser. **Ne pas réintroduire un
  `pb.collection('products').update({ stock })`** : deux postes s'écraseraient
  — mesuré, 60 ventes concurrentes n'en retiraient que 15. Deux gardiens :
  `backend/routes/stock_atomic_test.go` et le faux PocketBase de
  `frontend/lib/queries/stock-adjust.test.ts`, qui lève dès qu'on touche la
  collection. L'atomicité repose sur une propriété **de PocketBase v0.22.22**
  (une seule connexion d'écriture) : à revérifier à chaque mise à jour, voir
  `docs/DECISIONS.md`.
- **Le front n'utilise aucun `subscribe()` PocketBase.** Son seul temps réel
  est le SSE Go — `backend/routes/sse_routes.go:101` et
  `frontend/lib/presence/use-presence-events.ts:120`. La scanette
  (`frontend/lib/pos/scanner.ts:65`) et l'afficheur client VFD
  (`backend/pos/vfd.go`, binding Wails, `CashTerminalPage.tsx:204`) sont
  locaux et n'ont jamais dépendu d'AppPos.
- **Une migration non inscrite dans la liste de `RunMigrations`**
  (`backend/migrations/migrations.go:13`) ne s'exécute jamais, sans erreur.
- **L'hébergement du site est un mutualisé PHP/MySQL.** Aucun processus
  persistant : pas de Node, pas de Docker, pas de WebSocket serveur, pas de
  SQLite distant. Ne pas proposer de solution qui en suppose un.
- **Une couche anti-bot filtre axemusique.shop avant Apache**, et elle **rejette
  l'agent utilisateur par défaut de Go** (`Go-http-client/1.1`) : page HTML
  « The page is temporarily unavailable » en `503`, le PHP n'étant jamais
  atteint. Tout appel Go vers ce domaine doit poser un `User-Agent` explicite —
  voir `backend/routes/site_publish_routes.go`. Constaté le 2026-08-10, à clé,
  URL et corps identiques.
- **Ne pas toucher `wp-admin` ni `wp-json`** dans le `.htaccess` du site tant
  que WordPress sert le catalogue et la médiathèque.
- **Secrets :** `package.json` contient le mot de passe PocketBase en clair
  dans le script `typegen`, et le bundle du site expose les clés WooCommerce.
  Ne pas en ajouter ; voir `docs/DECISIONS.md`.

## Travail en cours

**Mission ouverte le 13 août 2026 — faire passer AppStock derrière une couche
d'accès aux données commune**, pour que ses écrans cessent de dépendre de la
provenance de ce qu'ils affichent : AppPos aujourd'hui, PocketBase à terme.
Quatre entités, `products`, `categories`, `brands`, `suppliers`.

**Point d'entrée :**
[`00-rituel-migration-appstock.md`](frontend/modules/stock/PocketStock-docs/00-rituel-migration-appstock.md).
Le §7 tient l'état ; le §6 quater dit ce qui a été branché et vérifié.

**État au 18 août 2026 — le module `stock` est sur PocketBase**, en lecture et
en écriture, sous `/stock/produits`, `/stock/marques`, `/stock/categories`,
`/stock/fournisseurs`. L'étape 3 (couche unique) et les fronts A et B du plan
sont faits : un seul écran catalogue, images comprises. Un test garde la règle
« une seule provenance » (`frontend/modules/stock/single-source.test.ts`).

**Au 19 août 2026, PocketApp n'écrit plus jamais dans AppPos**, et sa caisse
n'en dépend plus : catalogue, création de produit, vente, inventaire et
reclassement passent tous par PocketBase (fronts A à E du plan,
[`02-plan-source-unique.md`](frontend/modules/stock/PocketStock-docs/02-plan-source-unique.md)).
Les mouvements de stock ont un chemin unique,
`frontend/lib/queries/stock-adjust.ts`.

**Les fronts A à G sont faits.** Le rechargement par purge est gardé
(`backend/catalog/load/guard.go`), et l'inventaire physique lit son snapshot
dans PocketBase (`frontend/lib/queries/catalog-snapshot.ts`).

**Ce qui reste, et ce n'est plus du code** : l'historique d'inventaire est en
identifiants NeDB — sur 2465 entrées, 2370 se résolvent par `legacy_id` et
**95 ne désignent plus aucun produit** et s'affichent « produit absent du
catalogue » (`docs/DECISIONS.md`, 2026-08-19). Le pont `legacy_id` reste donc
nécessaire à la LECTURE tant que ces sessions se relisent.

**AppPos sort de la logique à la prochaine release** (`docs/DECISIONS.md`,
2026-08-13) : l'écriture dans PocketBase est ouverte, la caisse et l'inventaire
se raccordent en dernier, et les divergences NeDB ↔ PocketBase sont acceptées
d'ici là. Deux règles en découlent et ne bougent pas : **on n'écrit jamais dans
AppPos**, et **les identifiants des deux bases ne sont pas interchangeables** —
le pont est `legacy_id`, devenu « clé stable », que PocketApp génère (`pa_…`)
pour toute entité créée ici.

### Mission précédente — terminée

**Migrer le catalogue de NeDB vers PocketBase, tout en local.** Cible :
s'affranchir d'AppServe, PocketBase devient la source de vérité
(`docs/DECISIONS.md`, 2026-08-10). Aucune synchronisation de production dans
cette phase.

**Point d'entrée pour reprendre :**
[`11-rituel-reprise.md`](frontend/modules/site/PocketSite-docs/11-rituel-reprise.md).
Les tickets T1 à T4 sont faits — schéma, lecture NeDB, normalisation,
chargement. L'état réel est au §9 de
[`10-plan-migration.md`](frontend/modules/site/PocketSite-docs/10-plan-migration.md) ;
le modèle est arrêté (`docs/DECISIONS.md`).

En amont, dans l'ordre où ils ont été écrits : le rituel
[`08-rituel-migration-pocketbase.md`](frontend/modules/site/PocketSite-docs/08-rituel-migration-pocketbase.md),
le modèle [`09-modele-cible.md`](frontend/modules/site/PocketSite-docs/09-modele-cible.md)
— dont le §9 confronte le modèle au schéma PocketBase réel —, et l'audit
préalable du flux AppPos ↔ WooCommerce
[`07-audit-flux-apppos.md`](frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md).

Sortir le menu de navigation de WordPress : **fait, en production
depuis le 10 août 2026.** Le menu est édité dans le module `site`, publié vers
`axemusique.shop` (point 4 ci-dessus), et servi en statique — le site ne lit
plus `/wp-json/wp/v2/menus`, l'appel a disparu de son bundle.

Historique des neuf tickets et état réel :
[`frontend/modules/site/PocketSite-docs/README.md`](frontend/modules/site/PocketSite-docs/README.md).

**Prioritaire et non traité :** la faille 3.1 — clés WooCommerce en clair dans
le bundle public du site. Indépendante de la refonte, elle lui était déclarée
prioritaire du premier jour et ne l'a jamais été dans les faits.

## Attentes de travail

- Répondre en français.
- Ce dépôt est volumineux : partir d'un fichier nommé et suivre ses imports,
  plutôt que d'explorer librement.
- Distinguer ce qui est **lu dans le code** (donner le chemin et la ligne) de
  ce qui est **rapporté**. Ne pas présenter le second comme le premier.
- Perdre le fil vaut mieux que deviner : le dire.
