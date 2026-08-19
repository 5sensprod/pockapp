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
| **Site** (`I:\divi-child\frontend-wp`) | Build React devant WordPress/WooCommerce — vitrine, **pas de vente en ligne** | modifié aux tickets 8-9 |

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
frontend/lib/apppos/           client HTTP + WebSocket vers AppPos
docs/DECISIONS.md              pourquoi les choses sont comme elles sont
```

Modules : `cash` (caisse), `stock` (produits, lecture **et** écriture),
`site` (pilotage du site — en construction), plus `auth`, `home`, `settings`,
`stats`, `stick`, `connect`, `updater`, `common`.

## Points d'entrée réseau

Six, et six seulement :

1. **PocketBase local** — `frontend/lib/use-pocketbase.ts:5` — `127.0.0.1:8090`
   sous Wails, sinon proxy Vite (`VITE_BACKEND_URL`).
2. **AppPos** — `frontend/lib/apppos/apppos-config.ts:5` — `VITE_APPPOS_URL`,
   sinon `127.0.0.1:3000`. Jeton Bearer en `sessionStorage`. WebSocket en plus
   du REST (`apppos-websocket.ts`).
3. **Mini-SaaS distant** — `remote_notifications.go:27` et
   `backend/routes/gemini_routes.go` —
   `pocketapp.5sensprod.com/api/notifications.php` pour les notifications et
   `/api/usage.php` pour déclarer les jetons Gemini, en-tête `X-API-Key`.
   Notifications, clés API, crédits IA. Télémétrie uniquement, jamais de
   catalogue.
4. **Publication du menu** — `backend/routes/site_publish_routes.go` —
   `https://axemusique.shop/server/api/publish-menu.php`, POST, en-tête
   `X-API-Key`. L'URL et la clé sont des réglages ; rien n'est en dur.
5. **Export du catalogue** — `backend/routes/site_catalog_routes.go` —
   `https://axemusique.shop/server/api/products-sync.php`, GET et POST,
   en-tête `X-API-Key`. Contrat :
   `frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md`.
6. **Gemini Developer API** — `backend/routes/gemini_routes.go` —
   `generativelanguage.googleapis.com`. `gemini-3.1-flash-lite` propose les
   titres et les fiches depuis documents ; `gemini-2.5-flash-lite` porte le
   mode Google Search, disponible au niveau gratuit. Les sources web sont
   rendues à l'utilisateur. La clé `GEMINI_API_KEY` reste dans le Go et part
   dans l'en-tête `x-goog-api-key`, jamais dans le renderer ni dans l'URL.

Toute nouvelle sortie réseau s'ajoute à cette liste, dans ce fichier.

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
- **Ne pas créer un troisième chemin d'écriture.** Il en existe déjà deux, et
  `useUpdateProductUniversal` (`frontend/lib/queries/products.ts:180`) route
  entre eux sur une chaîne non typée. Dette connue, à ne pas aggraver.
- **Une migration non inscrite dans la liste de `RunMigrations`**
  (`backend/migrations/migrations.go:13`) ne s'exécute jamais, sans erreur.
- **L'hébergement du site est un mutualisé PHP/MySQL.** Aucun processus
  persistant : pas de Node, pas de Docker, pas de WebSocket serveur, pas de
  SQLite distant. Ne pas proposer de solution qui en suppose un.
- **Ne pas toucher `wp-admin` ni `wp-json`** dans le `.htaccess` du site tant
  que WordPress sert le catalogue et la médiathèque.
- **Secrets :** `package.json` contient le mot de passe PocketBase en clair
  dans le script `typegen`, et le bundle du site expose les clés WooCommerce.
  Ne pas en ajouter ; voir `docs/DECISIONS.md`.

## Travail en cours

Sortir le menu de navigation de WordPress. 9 tickets ordonnés dans
[`frontend/modules/site/PocketSite-docs/README.md`](frontend/modules/site/PocketSite-docs/README.md).

## Attentes de travail

- Répondre en français.
- Ce dépôt est volumineux : partir d'un fichier nommé et suivre ses imports,
  plutôt que d'explorer librement.
- Distinguer ce qui est **lu dans le code** (donner le chemin et la ligne) de
  ce qui est **rapporté**. Ne pas présenter le second comme le premier.
- Perdre le fil vaut mieux que deviner : le dire.
