# AppSite — pilotage du site axemusique.shop

Module en construction. Objectif de la phase en cours : sortir le menu de
navigation de WordPress.

## Par où commencer

| Fichier | Quoi | Fiabilité |
|---|---|---|
| [`03-audit-resultats.md`](03-audit-resultats.md) | **Fait foi.** Flux réel, failles, architecture retenue, tickets | lu dans le code, références données |
| [`05-contrat-menu.md`](05-contrat-menu.md) | **Fait foi sur la forme publiée.** URL, format du `menu.json`, notes pour les tickets 5 et 8 | contrat, à respecter |
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

**Ticket en cours : aucun.** Ticket 3 terminé le 6 août 2026 —
[`05-contrat-menu.md`](05-contrat-menu.md). Prochain : 1 ou 2, indépendants.
Le 5 est également débloqué.

| # | Ticket | Dépend de | Dépôt | État |
|---|---|---|---|---|
| 1 | Collection `site_menu` dans PocketBase local | — | PocketApp | à faire |
| 2 | Squelette du module AppSite et sa route | — | PocketApp | à faire |
| 3 | Contrat JSON publié : URL, version, horodatage, entrées | — | doc | **fait** |
| 4 | Éditeur d'arbre libre | 1, 2, 3 | PocketApp | à faire |
| 5 | Endpoint PHP de réception, `X-API-Key` | 3 | serveur | à faire |
| 6 | Action « Publier le menu » | 4, 5 | PocketApp | à faire |
| 7 | Exposition du `menu.json` en lecture statique | 5 | serveur | à faire |
| 8 | Bascule `.env` dans `loadMenu()` + purge cache + repli | 3, 7 | site | à faire |
| 9 | Drapeau par défaut sur la nouvelle source | 8 | site | à faire |

Les tickets 1 à 5 n'ont aucun effet observable en production. Détail et notes de
mise en œuvre : section 5 de `03-audit-resultats.md`.

**Prioritaire sur tout ceci et hors tickets :** la faille 3.1 — clés WooCommerce
en clair dans le bundle public du site.

## À ne pas anticiper

Performance, SEO, cache, images, migration des produits, bascule
AppPos → PocketApp, CI/CD du site, simplification du `.htaccess`, multi-poste,
authentification au-delà de `X-API-Key`. Liste complète en section 6 de
`03-audit-resultats.md`. Reporté veut dire reporté.

## Rituel de fin de session

Mettre à jour la ligne « ticket en cours » et la colonne État ci-dessus. C'est
tout ce que ce fichier demande.
