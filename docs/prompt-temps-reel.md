# Prompt de passage de main — le temps réel après la sortie d'AppPos

**Écrit le 19 août 2026**, au terme de la migration du catalogue vers
PocketBase. À donner tel quel à la session — ou à l'agent — qui reprendra les
interactions temps réel.

---

Tu travailles dans `I:\pockapp` (PocketApp : Wails, Go + React/TypeScript,
PocketBase embarqué sur `:8090`). Lis d'abord `CLAUDE.md` à la racine, en
particulier la liste des **points d'entrée réseau** : elle est exhaustive, et
toute nouvelle sortie s'y ajoute.

## Le contexte, et pourquoi cette mission existe maintenant

**PocketApp ne lit plus rien d'AppPos**, sauf un écran d'inventaire. Entre le 13
et le 19 août 2026, le catalogue, la caisse, les documents commerciaux et les
mouvements de stock sont passés sur PocketBase
(`frontend/modules/stock/PocketStock-docs/00-rituel-migration-appstock.md`,
§6 quater à §6 undecies).

**Ce qui n'a pas été traité en chemin, et qui est ta mission :** AppPos
apportait aussi un **canal WebSocket**, et la caisse en dépendait pour se tenir
à jour. Il n'est plus branché nulle part depuis le front E. Personne n'a décidé
de ce qui le remplace — ni s'il doit l'être. **C'est cette décision qu'on
attend de toi, avant tout code.**

## L'état mesuré, le 19 août 2026

### Ce que le canal AppPos portait

`frontend/lib/apppos/apppos-websocket.ts` (372 lignes) et
`apppos-hooks-websocket.ts` (637 lignes). Les types d'événement, lus dans le
second :

| Événement | Ce qu'il servait |
|---|---|
| `products.created` / `.updated` / `.deleted` | rafraîchir le cache catalogue |
| `categories.tree.changed`, `suppliers.tree.changed` | rafraîchir les arbres |
| `stock.statistics.changed` | les compteurs d'un écran de stock |
| `cashier_session.status.changed`, `.stats.updated` | la session de caisse |
| `cashier_drawer.movement.added` | le tiroir-caisse |
| `lcd.ownership.changed`, `.connection.lost` / `.restored` / `.failed` | **l'afficheur client** |

**Les quatre premiers groupes n'ont plus d'objet** : leurs données vivent
désormais dans PocketBase, qui a son propre temps réel. **Les deux derniers
sont d'une autre nature** — session de caisse, tiroir, afficheur LCD : ce sont
des périphériques et un état de poste, pas des données de catalogue. C'est là
qu'est la vraie question.

### Ce qui reste branché, et ce qui ne l'est plus

- **plus aucun écran n'écoute le canal AppPos.** `useAppPosStockUpdates` a été
  débranché de la caisse au front E ; seul `AppPosSessionProvider`
  (`frontend/main.tsx:37`) ouvre encore une session AppPos au démarrage, et
  `MenuTreeEditor.tsx:136` lit `useAppPosSession` ;
- **la scanette n'est PAS concernée.** `frontend/lib/pos/scanner.ts:65` parle à
  `ws://…/api/scanner/ws`, servi par le **backend Go local** (`:8090`), pas par
  AppPos. Elle survit telle quelle — ne la casse pas en faisant le ménage ;
- **le backend Go a déjà deux mécanismes temps réel** :
  `backend/routes/sse_routes.go` (Server-Sent Events, avec son magasin de
  clients) et `backend/routes/presence_routes.go` ;
- **PocketBase a son temps réel natif**, déjà utilisé côté front —
  `frontend/lib/presence/use-presence.ts` en est le précédent le plus proche.

## Ta mission

**Décider ce qui remplace le canal AppPos, poste par poste, puis le brancher.**
Trois questions, dans cet ordre :

1. **Y a-t-il plusieurs postes ?** Tout le reste en dépend. Un poste unique n'a
   besoin d'aucun temps réel pour le catalogue : le cache TanStack Query suffit.
   Plusieurs postes en ont besoin, et la question devient « lequel des trois
   mécanismes déjà présents » — abonnement PocketBase, SSE Go, ou rien ;
2. **Que devient l'afficheur client (LCD) ?** C'est le seul usage du canal qui
   ne se remplace pas par un abonnement à une collection : il s'agit de piloter
   un périphérique, et les événements `lcd.*` disaient qui le possède et s'il
   répond. Mesure d'abord s'il est **encore utilisé** — rien dans le front n'y
   réagit aujourd'hui, hors du fichier AppPos lui-même ;
3. **Que devient `lib/apppos/` ?** Si la réponse aux deux premières est « rien
   à reprendre », alors 1009 lignes de WebSocket et le provider de session
   peuvent partir. **Une session qui retire sans rien casser est une bonne
   session** — le module `stock` a perdu 12 fichiers en six jours.

## Ce qui est décidé, et ne se rediscute pas

- **on n'écrit jamais dans AppPos**, et **PocketApp ne lit plus son
  catalogue** (`docs/DECISIONS.md`, 2026-08-19) ;
- **toute nouvelle sortie réseau s'ajoute à la liste de `CLAUDE.md`**, dans ce
  fichier, au moment où elle est écrite ;
- **la caisse est le maillon le moins négociable.** Aucune étape ne doit
  pouvoir empêcher un encaissement. En cas de doute, on n'expédie pas ;
- **`lib/queries/stock-adjust.ts` porte une limite connue** : lecture puis
  écriture sans transaction, PocketBase n'ayant pas d'incrément atomique en
  REST. **Deux postes vendant en même temps peuvent s'écraser.** Si ta réponse à
  la question 1 est « plusieurs postes », **ce défaut devient ta priorité**, et
  il se corrige par un hook PocketBase côté serveur — pas côté client.

## Les pièges déjà payés

- **un abonnement qui invalide tout un cache à chaque événement** coûte plus
  cher que le rechargement qu'il évite. `useCatalogProducts` pagine côté
  serveur : invalider `['catalog-products']` recharge une page de 25, pas 2999
  produits — vérifie que c'est bien ce qui se passe ;
- **`getList(1, 50)` est une page, pas une liste.** Ce défaut a déjà donné « 0
  produit » sur 205 marques ;
- **AppPos éteint est un cas normal, pas une panne** : c'est la règle posée par
  `apppos-session-provider.tsx`, et elle doit rester vraie de tout ce que tu
  écris.

## Contraintes de travail

- Français partout.
- `npx tsc -b`, `pnpm biome check --write` **sur les fichiers touchés** — viser
  un répertoire reformate tout le module et rend le diff illisible ;
  `pnpm test`. Côté Go : `go build ./backend/...`, `go test ./backend/...`,
  `gofmt`.
- **Écris un test pour toute règle qui n'a pas d'autre gardien.**
- **Distingue ce qui est lu dans le code — chemin et ligne — de ce qui est
  rapporté.**
- **Vérifie dans l'application ou dans la base**, pas en relisant ton code.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Réponds à la question 1 — **combien de postes** — avec le propriétaire, pas avec
le code : elle n'est pas dans le dépôt. Puis mesure l'usage réel du LCD et écris
un résumé bref : ce que tu as lu, ce que tu constates, ce que tu proposes.
**Arrête-toi là.** La décision se consigne dans `docs/DECISIONS.md` avant la
première ligne de code.
