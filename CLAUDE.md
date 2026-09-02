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
| **Site** (`I:\divi-child\frontend-wp`) | Build React devant WordPress/WooCommerce — vitrine, **pas de vente en ligne**. Lit le menu publié, et depuis le 2026-08-11 ses premiers produits dans notre base SQL via `server/api/catalog.php` — drapeau `VITE_USE_AXE_CATALOG`, **à `true` et en production**. Depuis le 2026-08-20 l'accueil aussi : bandeau de chiffres, carrousel de marques et aperçu du catalogue passent par `catalog.php` (`stats`, `brands`, `latest`). **Audité le même jour : plus aucun appel WooCommerce ne part du site** — mais les clés restent dans le bundle, par imports statiques, et `wp-json/wp/v2/site-data` est encore appelé à chaque page | menu, catalogue, images |

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

Modules : `cash` (caisse — tickets, sessions, rapports X et Z ; sa doc est
dans `frontend/modules/cash/PocketCash-docs/`), `stock` (produits, lecture
**et** écriture),
`site` (pilotage du site — en construction), `stats` (**journal des ventes**,
depuis le 24 août 2026 — servi par `/api/reports/journal`, qui réutilise le
classificateur du Z ; il lit les documents jour par jour et NON les `z_reports`,
parce que 69 % de l'argent hors caisse tombe des journées sans clôture), plus
`auth`, `home`, `settings`, `stick`, `connect`, `updater`, `common`.

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

7. **Miroir des images du catalogue** — `backend/routes/site_images_routes.go` —
   `https://axemusique.shop/server/api/images-sync.php`, en-tête `X-API-Key` et
   `User-Agent` explicite (même couche anti-bot). **GET** pour l'inventaire
   `legacy_id → image_checksum`, **POST multipart** pour envoyer TOUTES les
   images d'une entité. Réglage `site_images_url` ; la **clé est celle du
   catalogue** (`site_catalog_api_key`) — même base, même portée d'écriture.
   Route distincte du point 5 parce que son plafond de corps n'a rien à voir :
   24 Mio ici contre 1 Mio là. Mécanisme :
   `frontend/modules/site/PocketSite-docs/16-conception-images.md`.
   Depuis le 2026-08-20, le serveur accepte aussi **`products`** — image
   principale au rang 0, galerie derrière dans son ordre — et **fait le ménage**
   dans le dossier de l'entité : les rangs que la nouvelle liste ne désigne plus
   sont EFFACÉS. C'est le seul geste destructeur du mécanisme ; il vient APRÈS
   les octets et APRÈS le `UPDATE`, ne rejette jamais, et ce qu'il a repris est
   rendu (`cleaned`) puis affiché. L'inventaire rend aussi l'espace disque du
   mutualisé (§9 de la conception).

8. **Sauvegarde de la base vers le mini-SaaS** — `backend/backup/envoi.go` —
   `https://pocketapp.5sensprod.com/api/backup.php`, en-tête `X-API-Key` et
   `User-Agent` explicite. Quatre actions (`init`, `etat`, `tranche`,
   `valider`), tranches de 1 Mio, reprise après coupure. Ce qui part est un
   **`VACUUM INTO` de `data.db`**, gzippé puis **chiffré en AES-256-GCM sur le
   poste** : le serveur n'a pas la clé et ne peut rien lire. Sans `storage/`
   (déjà miroité, point 7) ni `logs.db`. Réglages `backup_url`,
   `backup_interval_hours`, `backup_enabled` ; secrets `backup_api_key` et
   `backup_encryption_key`. Le client **refuse de partir hors HTTPS**.
   Déclenchée par l'horloge ET **après chaque rapport Z**
   (`backend/backup/apres_z.go`, hook de modèle, différé et amorti).
   Les **images** ont leur propre miroir différentiel, par la même porte
   (`storage-diff` / `storage-fichier`) : le CHEMIN est l'identité du contenu —
   PocketBase suffixe chaque fichier d'un aléa —, donc aucun hachage, et un
   « socle » déclaré par la clé super-admin évite de transporter les 1,6 Gio
   que l'éditeur détient déjà. Un troisième pouvoir existe, la **clé
   super-admin** (`backup-admin.php`) : elle lit, télécharge et supprime chez
   tous les clients, mais ne peut **pas** déposer.
   Conception : `docs/SAUVEGARDE.md`.

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
- **Le slug est figé, mais c'est PocketApp qui le pose** (20 août 2026).
  `frontend/lib/queries/slug.ts` le dérive du nom à la création, l'unicité
  étant vérifiée dans PocketBase — le serveur ne décide de rien (§2 du
  contrat), et `products-sync.php` protège un slug existant sans jamais en
  inventer. **Un slug non vide ne se retouche jamais** : renommer un produit ne
  déplace pas sa page. Avant cette date, un produit créé au comptoir partait en
  ligne sans adresse et sa page rendait « Produit introuvable ». Le dialogue
  produit l'AFFICHE en lecture seule, et enregistrer une fiche qui n'en a pas
  la répare — il faut alors la ré-exporter. Gardiens : `slug.test.ts` et
  `catalog-fields.test.ts`.
- **L'image principale d'un produit ne s'écrase pas, elle se désigne**
  (19 août 2026). Tout fichier importé entre par `gallery` ; `image` est une
  désignation. **Promouvoir passe obligatoirement par
  `POST /api/catalog/products/:id/promote-image`**
  (`backend/routes/product_image_routes.go`) : l'API REST de PocketBase refuse
  un nom de fichier venu d'un autre champ — mesuré,
  `forms/record_upsert.go:428-435`, « The field contains unknown filenames. »
  L'ordre du tableau `gallery` **est** l'ordre des vignettes, et la liste
  s'envoie toujours ENTIÈRE : une entrée omise supprime le fichier, sans
  confirmation. Gardiens : `backend/routes/product_image_test.go`,
  `frontend/lib/queries/gallery-order.test.ts` et les tests galerie de
  `image-upload.test.ts`.
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
- **Les décomptes du catalogue se calculent côté serveur** (25 août 2026) :
  `GET /api/catalog/counts` (`backend/routes/catalog_counts_routes.go`) rend,
  par marque et par catégorie, ce que trois écrans du module `stock`
  obtenaient en balayant les 2999 produits depuis le navigateur. Et
  `getFullList` n'est pas une requête : lots de 500, chacun demandé APRÈS la
  réponse du précédent — **six allers-retours en série**, refaits à chaque
  montage d'écran. La route rend **deux** nombres par catégorie, `direct` et
  `total`, parce que le total d'une branche n'est PAS la somme de ceux de ses
  enfants : un produit rangé dans deux catégories sœurs ne compte qu'une fois
  dans leur ancêtre commun. **Ne pas recalculer ces décomptes côté React** —
  c'est la même règle que pour l'agrégation de la caisse, et pour la même
  raison. Gardiens : `backend/routes/catalog_counts_test.go` et
  `frontend/lib/realtime/catalog-realtime.test.ts`, qui exige que
  `catalog-counts` soit périmée par `products` ET par `categories` (déplacer
  une catégorie change deux branches sans qu'aucun produit ne bouge).
- **Le cache TanStack Query est persisté, mais PAS en entier** (25 août 2026).
  `frontend/main.tsx` monte un `PersistQueryClientProvider` sur `localStorage`
  — sans lui, un simple rechargement vidait tout et les écrans repartaient de
  zéro quel que soit leur `staleTime`. **Quatre clés seulement**, nommées dans
  `CLES_PERSISTEES` : `brands`, `categories`, `suppliers`, `catalog-counts`.
  Ni caisse, ni factures, ni clients — données commerciales et nominatives, sur
  un poste partagé, alors que `main.tsx` efface déjà la session PocketBase à
  chaque démarrage. Élargir cette liste, c'est décider d'écrire ces données sur
  le disque du poste : le faire sciemment, et changer le `buster` si la forme
  d'une réponse persistée change.
- **Le catalogue se met à jour d'un poste à l'autre sans rechargement**
  (19 août 2026) : `frontend/lib/realtime/` s'abonne au temps réel natif de
  PocketBase sur `products`, `categories`, `brands`, `suppliers`, et invalide
  les caches TanStack Query correspondants. Monté une fois, sous
  l'authentification (`frontend/main.tsx`). Deux règles gardées par
  `frontend/lib/realtime/catalog-realtime.test.ts` : les événements sont
  **regroupés** (un ticket de trente lignes n'invalide qu'une fois), et la
  table `COLLECTIONS_SURVEILLEES` doit périmer **exactement** ce que périme
  `invalidateCatalog` — sinon l'écran se tient à jour quand on modifie
  soi-même, et pas quand un autre poste modifie.
  Les écritures Go diffusent aussi : le temps réel de PocketBase est accroché
  aux événements de **modèle**, pas à l'API REST (`apis/realtime.go:257`).
- **L'autre temps réel est le SSE Go**, pour la présence —
  `backend/routes/sse_routes.go:101` et
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
- **Les images du catalogue partent par un miroir, pas par le lot d'entités**
  (19 août 2026). Le checksum d'entité (§4.4 du contrat) ne couvre AUCUN champ
  image : promouvoir une image ou réordonner une galerie n'écrit ni nom, ni
  prix, ni relation, et un export incrémental fondé sur lui ne verrait jamais
  un changement d'image. D'où une **seconde empreinte**, `image_checksum` —
  SHA-1 de la liste ordonnée des SHA-256 des octets, principale en tête
  (`frontend/modules/site/lib/image-checksum.ts`). Ne pas élargir le premier
  checksum : cela marquerait les 2563 produits « modifiés » d'un coup.
  L'arborescence distante est `<kind>/<legacy_id>/<rang>.<ext>` — **le nom
  distant est calculé, jamais transporté** —, un envoi porte toutes les images
  d'une entité, et **les octets s'écrivent avant la ligne SQL**. Marques,
  catégories **et produits** depuis le 2026-08-20 : pour un produit, le rang 0
  est `image`, les rangs suivants sont `gallery` DANS SON ORDRE. Deux règles
  d'échelle en découlent, et elles sont dans le code, pas dans l'intention :
  **calculer une empreinte lit les octets** (1,503 Gio pour les 2412 produits
  publiés), d'où un cache persistant, un plafond et une annulation
  (`frontend/modules/site/lib/image-checksum-store.ts`) ; et **`site-catalog.ts`
  a sa propre chaîne `fields`** — sans `gallery` dedans, 1767 fichiers ne
  partiraient jamais, sans une erreur (gardien :
  `frontend/lib/queries/catalog-fields.test.ts`).
  **Le site LIT ces images par `catalog.php`, en URL COMPLÈTE**, composée côté
  serveur par `media_urls()` à partir de `media_base_url` et de `image_paths` ;
  le bundle la consomme telle quelle et ne la préfixe jamais — il est public et
  déjà en production, il ne doit pas porter le préfixe des médias. Trois
  champs : `brand.image` (rang 0 de la marque), `product.image` (rang 0 du
  produit) et `product.gallery` (rangs 1..n) — ce dernier **sur la seule action
  `product`**, parce qu'aucune grille n'affiche de galerie ; il est absent des
  listes, pas vide. Les deux tables ayant une colonne `image_paths` homonyme,
  les alias `brand_image_paths` / `product_image_paths` sont obligatoires :
  sans eux PDO écrase l'une par l'autre, sans erreur.
  **La campagne est terminée le 20 août 2026** — marques, catégories et les
  2412 produits publiés sont en ligne (rapporté par le propriétaire ; l'état
  réel vit dans la base SQL distante et se relit par l'inventaire du miroir).
  Mesuré le même jour par `catalog.php?action=brands` : **179 des 218 marques
  en ligne portent un logo**.
  Le repli reste néanmoins silencieux, et le cadre a la même taille avec ou
  sans image — mesuré, 248×248 dans les deux cas (`BrandBadge`,
  `AxeProductImage`, `ProductGallery`, dans le dépôt du site) : une entité
  ajoutée après la campagne s'affichera sans visuel, sans rien casser.
  Gardiens : `frontend/modules/site/lib/image-checksum.test.ts` et
  `frontend/lib/queries/create-legacy-key.test.ts` — c'est `legacy_id` qui
  nomme toute l'arborescence, et les trois `create` doivent le poser
  (`withLegacyKey`, `frontend/lib/queries/legacy-key.ts`).
- **Dépublier un produit, c'est l'exporter en `draft`** (21 août 2026). Le
  contrat n'a aucune opération de suppression : `products-sync.php` accepte
  `status` valant `published` ou `draft`, l'écrit sans l'interpréter, et
  `catalog.php` ne sert que `published` — la page disparaît, la ligne SQL reste
  avec son `first_seen_at`, ses images et ses rattachements. **`status` entre
  dans le checksum d'export** : une fiche passée en brouillon devient `modified`
  d'elle-même, part, puis redevient `synced`. L'écran lit les brouillons par
  `useUnpublishedProducts` et ne retient que ceux que l'inventaire distant
  connaît (compteur « À retirer ») ; ils n'entrent jamais dans les grilles ni
  dans le panneau d'images. Avant cette date, `toExportProduct` écrivait
  `status: 'published'` en dur et un produit dépublié restait en ligne
  indéfiniment. Gardiens : `catalog-export.test.ts`.
- **Ne pas toucher `wp-admin` ni `wp-json`** dans le `.htaccess` du site tant
  que WordPress sert le catalogue et la médiathèque.
- **Le rapport Z dit « un total, quatre lignes », et `schema_version` dit sous
  quelle règle** (24 août 2026, en production). `total_ht` / `total_tva` /
  `total_ttc` ne portent QUE la ligne 1 — les ventes du jour : tickets des
  sessions du Z, plus factures hors caisse **émises ET encaissées le même
  jour** (91,3 % des cas, mesuré). Les lignes 2 à 4 — règlements de factures
  antérieures, acomptes, remboursements — sont en **TTC seul**, et c'est ce qui
  rend une addition accidentelle avec du chiffre d'affaires impossible : la TVA
  d'une facture antérieure a déjà été déclarée à son émission, la refondre dans
  la ligne 1 la ferait déclarer deux fois. Le total encaissé est
  `collected_ttc`, ventilé par `collected_by_method`.
  **`schema_version` entre dans le hash, avec tous les `collected_*`** : un Z
  antérieur au contrat vaut 1, ce contrat vaut 2, et un document scellé **se
  relit sous la règle qui l'a produit** — l'écran, le PDF et le dialogue X
  branchent tous sur le même prédicat `estZQuatreLignes`
  (`frontend/lib/types/cash.types.ts`). Les 46 rapports ont été rejoués en
  production le 24 août : 46 sur 46 en version 2, aucun déséquilibre, aucun
  maillon de hachage rompu.
  Contrat, cas limites et mesures :
  `frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md`.
- **Un seul chemin d'agrégation pour la caisse**, et ce n'est pas négociable :
  `aggregateZ` (`backend/reports/cash_reports.go`), partagée par
  `GenerateRapportZ` et `backend/cmd/z-repair`, et le classificateur
  `backend/reports/z_lignes.go`, partagé en plus par `GenerateRapportX`. **Une
  seconde implémentation des mêmes règles est exactement ce qui a produit la
  régression du 20 mai 2026** — les tickets comptés deux fois du Z-022 au
  Z-045, pendant trois mois, sur un document fiscal. Ne jamais recalculer ces
  règles côté React : l'écran affiche ce que le Go a calculé. Gardiens :
  `backend/reports/cash_reports_test.go`.
- **Une `cash_session` ne s'efface JAMAIS**, ni la collection, ni un
  enregistrement (29 août 2026). `recalculerRapport`
  (`backend/reports/z_repair.go:224-231`) relit `session_ids` et **échoue si une
  session manque** : effacer les sessions rendrait les 60 rapports Z
  **irréparables** — plus de vérification par recalcul, plus de correction, et
  `z-repair` renverrait 60 erreurs. Depuis cette date les sessions sont sorties
  de l'usage : **une par journée**, ouverte par « Commencer la journée » sur le
  terminal (`CashTerminalPage.tsx`) ou, en filet, par `SessionDuJour`
  (`backend/session_du_jour.go`) au premier encaissement — c'est ce filet qui
  empêche `CreateCashMovementIfEspeces` de **perdre** un mouvement espèces reçu
  hors session, ce qu'il faisait en silence jusque-là. Le fonds ne se saisit
  plus : il est **reporté** (`backend/reports/fonds_reporte.go`), le dernier
  tiroir compté augmenté des flux lus dans le journal des espèces. Et une
  session fermée par passage de journée porte un `closed_at` à la **fin de sa
  propre journée** : `GenerateRapportZ` ne retient que les sessions closes dans
  la journée du rapport (`cash_reports.go:1490-1496`), un `closed_at` du
  lendemain les ferait sortir de toute clôture **sans erreur**. Contrat :
  `frontend/modules/cash/PocketCash-docs/07-sortir-des-sessions.md`.
- **Les conversions de ticket s'excluent par une résolution nommée**, pas par
  `original_invoice_id = ''`. Ce filtre disait vouloir écarter les conversions
  et écartait AUSSI les acomptes et les factures de solde, qui portent le même
  champ — `DepositsTTC` en est resté structurellement à zéro pendant des mois.
  On résout l'origine et on ne rejette que si elle est `is_pos_ticket = true`
  (même résolution que `frontend/lib/queries/closures.ts` : le champ est du
  TEXTE, pas une relation, on ne peut pas le déréférencer dans un filtre).
- **Un dossier acompte / solde ne se somme pas naïvement.** `deposit.go` produit
  trois documents pour un seul encaissement possible — la parente, les
  acomptes, la facture de solde — et les trois peuvent porter `is_paid = true`.
  Si un solde existe, la parente n'entre pas ; sinon elle entre amputée des
  acomptes encaissés. Mesuré : 7 parentes, 2 523,70 € qui seraient comptés deux
  fois.
- **Secrets :** `package.json` contient le mot de passe PocketBase en clair
  dans le script `typegen`, et le bundle du site expose les clés WooCommerce.
  Ne pas en ajouter ; voir `docs/DECISIONS.md`.

## Travail en cours

**Au 20 août 2026, l'objectif de découplage est atteint côté PocketApp.**
Mesuré : zéro appel `wp-json` ou `wc/v3` dans `frontend/` et `backend/`, et
**deux** importateurs de `@/lib/apppos` — `main.tsx:6` (session) et
`MenuTreeEditor.tsx:55` (nommer les destinations du menu). Ni caisse, ni
catalogue, ni stock, ni inventaire n'en dépendent plus.

**Trois chantiers restent, et un seul est gros :**

| # | Chantier | Où | Note |
|---|---|---|---|
| **A** | **Reprendre la base de production du client** pour remettre le développement à niveau | PocketApp | **La grosse étape.** La PocketBase de dév a divergé : ventes, factures et produits créés en caisse chez le client n'y sont pas. Périmètre à définir ; **session séparée** |
| **B** | Fermer la faille 3.1 : **sortir les clés WooCommerce du bundle** | site | **Reformulé le 20 août 2026, après audit.** Ce n'est PAS un appel à couper : sous le drapeau, aucun des dix importateurs de `services/woocommerce.js` n'est atteignable, et le carrousel « Soldes » ne se monte que sur une slide **en commentaire**. Les clés partent dans le bundle parce qu'`App.jsx` importe ce service et les quatre pages WooCommerce **statiquement**. Il faut `React.lazy`, ou sortir les clés du code. S'y ajoute `wp-json/wp/v2/site-data`, appelé sans condition à chaque page, avec un mot de passe d'application dont l'endpoint n'a pas besoin |
| **C** | Couper la dernière lecture AppPos (`MenuTreeEditor.tsx:55`) | PocketApp | **PocketApp doit être totalement indépendant à la prochaine release** |

État détaillé et archives :
[`frontend/modules/site/PocketSite-docs/README.md`](frontend/modules/site/PocketSite-docs/README.md).

### Mission terminée — AppStock derrière une couche unique

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
[`11-rituel-reprise.md`](frontend/modules/site/PocketSite-docs/archive/11-rituel-reprise.md).
Les tickets T1 à T4 sont faits — schéma, lecture NeDB, normalisation,
chargement. L'état réel est au §9 de
[`10-plan-migration.md`](frontend/modules/site/PocketSite-docs/archive/10-plan-migration.md) ;
le modèle est arrêté (`docs/DECISIONS.md`).

En amont, dans l'ordre où ils ont été écrits : le rituel
[`08-rituel-migration-pocketbase.md`](frontend/modules/site/PocketSite-docs/archive/08-rituel-migration-pocketbase.md),
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
