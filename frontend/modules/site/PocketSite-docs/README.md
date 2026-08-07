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

**Ticket en cours : aucun.** Tickets 1 à 4 terminés le 6 août 2026. Le 5 est
sans dépendance et reste le prochain sur le chemin : le 6 attend les deux.

| # | Ticket | Dépend de | Dépôt | État |
|---|---|---|---|---|
| 1 | Collection `site_menu` dans PocketBase local | — | PocketApp | **fait** |
| 2 | Squelette du module PocketSite et sa route | — | PocketApp | **fait** |
| 3 | Contrat JSON publié : URL, version, horodatage, entrées | — | doc | **fait** |
| 4 | Éditeur d'arbre libre | 1, 2, 3 | PocketApp | **fait** |
| 5 | Endpoint PHP de réception, `X-API-Key` | 3 | serveur | à faire |
| 6 | Action « Publier le menu » | 4, 5 | PocketApp | à faire |
| 7 | Exposition du `menu.json` en lecture statique | 5 | serveur | à faire |
| 8 | Bascule `.env` dans `loadMenu()` + purge cache + repli | 3, 7 | site | à faire |
| 9 | Drapeau par défaut sur la nouvelle source | 8 | site | à faire |

Les tickets 1 à 5 n'ont aucun effet observable en production. Détail et notes de
mise en œuvre : section 5 de `03-audit-resultats.md`.

**Prioritaire sur tout ceci et hors tickets :** la faille 3.1 — clés WooCommerce
en clair dans le bundle public du site.

## Notes laissées par le ticket 4

Quatre constats faits en écrivant l'éditeur. Aucun ne le bloque ; les deux
premiers demandent une action, les deux autres sont là pour éviter qu'on les
redécouvre au ticket 6.

**Deux choses à faire reprendre :**

- **`site_menu` reste hors de `frontend/lib/pocketbase-types.ts`.** Non parce
  que `pnpm typegen` échoue — il fonctionne —, mais parce que le fichier commité
  n'est pas une sortie de générateur : il a été retouché à la main, et le
  régénérer efface ces retouches et sort cinq erreurs dans la chaîne
  produits/caisse. Les types de `site_menu` sont donc déclarés en tête de
  `frontend/lib/queries/site-menu.ts`, à la forme exacte de la sortie réelle du
  générateur. Détail et lignes fautives : le commentaire de ce fichier. Adopter
  la sortie du générateur est une session à part, sur le maillon le moins
  négociable.

- **Rien n'authentifie AppPos au démarrage de l'application.** Constaté le
  7 août 2026, lu dans le code : chacune des **neuf** pages qui lisent AppPos
  refait sa propre connexion dans un `useEffect`
  (`frontend/modules/stock/useStockModule.ts:47`,
  `frontend/modules/cash/CashTerminalPage.tsx:272`, et sept pages de
  `connect`). Le jeton vit ensuite en `sessionStorage`
  (`frontend/lib/apppos/apppos-api.ts:20`), ce qui donne l'illusion que tout
  fonctionne — à condition d'être passé par une de ces pages d'abord. Ouvrir
  PocketSite en premier affichait des identifiants bruts au lieu des noms de
  catégories.

  Le module a reçu sa propre connexion
  (`frontend/modules/site/hooks/use-apppos-session.ts`) pour ne plus dépendre
  de l'ordre de navigation. **C'est une dixième copie, pas une correction** ;
  la bonne place est un point unique au lancement. Deux points à traiter
  ensemble ce jour-là : les identifiants sont écrits **en dur** dans huit des
  neuf appelants (`loginToAppPos('admin', 'admin123')`) et partent donc dans le
  bundle — même famille que la faille 3.1, ticket à part ; et un point unique ne
  doit pas retarder l'ouverture de l'application, AppPos éteint étant un cas
  normal. Refactorer les neuf appelants n'est pas nécessaire : leur garde
  `getAppPosToken()` les rend inoffensifs dès qu'une session existe en amont,
  donc la caisse n'a pas à être touchée.

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

## À ne pas anticiper

Performance, SEO, cache, images, migration des produits, bascule
AppPos → PocketApp, CI/CD du site, simplification du `.htaccess`, multi-poste,
authentification au-delà de `X-API-Key`. Liste complète en section 6 de
`03-audit-resultats.md`. Reporté veut dire reporté.

## Rituel de fin de session

Mettre à jour la ligne « ticket en cours » et la colonne État ci-dessus. C'est
tout ce que ce fichier demande.
