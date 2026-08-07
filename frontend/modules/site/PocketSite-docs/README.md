# PocketSite — pilotage du site axemusique.shop

Module en construction. Objectif de la phase en cours : sortir le menu de
navigation de WordPress.

## Par où commencer

| Fichier | Quoi | Fiabilité |
|---|---|---|
| [`03-audit-resultats.md`](03-audit-resultats.md) | **Fait foi.** Flux réel, failles, architecture retenue, tickets | lu dans le code, références données |
| [`05-contrat-menu.md`](05-contrat-menu.md) | **Fait foi sur la forme publiée.** URL, format du `menu.json`, notes pour les tickets 5 et 8 | contrat, à respecter |
| [`docs/DECISIONS.md`](../../../../docs/DECISIONS.md) | **Hors de ce dossier** — journal du dépôt. Contrat du menu, schéma de `site_menu` | fait foi sur ce qui a été écarté |
| [`00-contexte.md`](00-contexte.md) | Cadrage, arbitrages tranchés | corrigé après audit |
| [`01-audit-architecture.md`](01-audit-architecture.md) | Prompt de la session d'audit | archive |
| [`02-methode-memoire-agents.md`](02-methode-memoire-agents.md) | Prompt de la session méthode | archive |
| [`04-lancer-un-agent.md`](04-lancer-un-agent.md) | Installer Claude Code, lancer les sessions | archive |

En cas de contradiction entre deux fichiers, `03-audit-resultats.md` gagne —
sauf sur la **forme du menu publié et son URL**, où `05-contrat-menu.md` gagne.
C'est le seul fichier d'ici destiné à être lu depuis les deux autres dépôts.

`03-audit-resultats.md` est un compte rendu daté : **on ne le réécrit pas** pour
suivre l'avancement. Son tableau de tickets dit ce qui était prévu le 6 août
2026 ; **le tableau ci-dessous fait foi sur l'état réel des tickets**, libellés
compris. Un ticket dont le périmètre a bougé est reformulé ici, pas là-bas.
Les fichiers `01`, `02`, `04` sont des prompts déjà exécutés : ils disent ce
qu'on a demandé, pas ce qui est vrai.

## Où en est-on

**Ticket en cours : aucun.** Tickets 1 à 4 terminés le 6 août 2026, le 5 le
7 août. Le 6 (« Publier le menu ») est le prochain sur le chemin ; le 7 aussi,
et il est indépendant.

**Le ticket 5 est écrit, pas déployé.** Le code est dans
[`server/`](../../../../server/) ; il ne tournera qu'une fois déposé à la main
sur le mutualisé. Marche à suivre et tests de vérification :
[`server/README.md`](../../../../server/README.md). Tant que ce dépôt n'est pas
fait, l'endpoint n'existe pas — et rien ne l'appelle avant le ticket 6.

| # | Ticket | Dépend de | Dépôt | État |
|---|---|---|---|---|
| 1 | Collection `site_menu` dans PocketBase local | — | PocketApp | **fait** |
| 2 | Squelette du module PocketSite et sa route | — | PocketApp | **fait** |
| 3 | Contrat JSON publié : URL, version, horodatage, entrées | — | doc | **fait** |
| 4 | Éditeur d'arbre libre | 1, 2, 3 | PocketApp | **fait** |
| 5 | Endpoint PHP de réception, `X-API-Key` | 3 | serveur (`server/`) | **écrit, à déposer** |
| 6 | Action « Publier le menu » | 4, 5 | PocketApp | à faire |
| 7 | Exposition du `menu.json` en lecture statique | 5 | serveur | à faire |
| 8 | Bascule `.env` dans `loadMenu()` + purge cache + repli | 3, 7 | site | à faire |
| 9 | Drapeau par défaut sur la nouvelle source | 8 | site | à faire |

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

## Notes laissées par le ticket 5

- **Ce dont le ticket 6 aura besoin, et que ce dépôt ne contient pas :** l'URL
  de l'endpoint (`https://axemusique.shop/pocketapp/api/publish-menu.php`, à
  confirmer après dépôt) et **la clé `X-API-Key`**, qui n'existe que dans
  `config/config.php` sur le serveur. La clé ne doit pas entrer dans le dépôt ni
  dans le bundle : le canal existant pour ce genre de secret est le
  `SecretManager` de PocketApp (`remote_notifications.go:5-6, 54`, réglé depuis
  Settings > Clés API). C'est la piste, pas une décision — le ticket 6 tranche.

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
