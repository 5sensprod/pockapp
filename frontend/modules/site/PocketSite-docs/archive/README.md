# Archive

Documents qui ont servi et ne servent plus. **Rien ici ne fait foi sur l'état.**

**Ils gardent en revanche leur valeur de méthode.** Ces rituels et ces prompts
sont écrits pour être rejoués : ce sont des candidats à devenir des *skills* ou
des prompts système, et c'est la raison pour laquelle ils sont conservés
entiers plutôt que résumés (intention du propriétaire, 20 août 2026).

Archivés le 10 août 2026, à la fin de la mission « sortir le menu de
WordPress ». Ils sont conservés parce qu'ils disent ce qu'on a demandé et
comment on s'y est pris — pas ce qui est vrai aujourd'hui.

| Fichier | Ce que c'était | Pourquoi il est ici |
|---|---|---|
| `01-audit-architecture.md` | prompt de la session d'audit | exécuté ; son résultat est `03-audit-resultats.md` |
| `02-methode-memoire-agents.md` | prompt de la session méthode | exécuté ; son résultat est le bloc « Documentation dans le dépôt » de `docs/DECISIONS.md` |
| `04-lancer-un-agent.md` | installer Claude Code, lancer les sessions | procédure d'amorçage, faite |
| `Ticket 5.md` | énoncé du ticket 5 | exécuté ; son résultat est `server/` et deux blocs de `docs/DECISIONS.md` |

## Deuxième vague — 20 août 2026

Archivés à la clôture des missions « catalogue » et « images », une fois
l'objectif de découplage atteint côté PocketApp.

| Fichier | Ce que c'était | Pourquoi il est ici |
|---|---|---|
| `06-rituel-catalogue.md` | rituel de la cible « base SQL sur IONOS » | **dépassé sur la cible** le 10 août 2026 : PocketBase est devenu la source de vérité. Valable sur ce qu'il documente |
| `08-rituel-migration-pocketbase.md` | rituel « PocketBase source de vérité » | mission terminée |
| `10-plan-migration.md` | les sept tickets de migration du catalogue | T1 à T4 faits ; son §9 dit l'état à la fin |
| `11-rituel-reprise.md` | rituel de reprise de cette migration | mission terminée |
| `13-prompt-images-site.md` | premier prompt images | écrit avant la galerie, remplacé le jour même |
| `15-prompt-sync-images.md` | prompt de la synchro d'images | **exécuté** ; son résultat est `16-conception-images.md` et le miroir en ligne |
| `14-rituel-stats.md` | rituel du bandeau de statistiques | **exécuté le 20 août 2026** ; son résultat est l'action `stats` de `catalog.php`. Son en-tête dit ce qui a été fait au-delà (`brands`, `latest`) |

**Ce qui n'est PAS archivé, et pourquoi :**

- `03-audit-resultats.md` — fait toujours foi sur les failles, dont la 3.1 qui
  reste ouverte. Compte rendu daté, corrigé par notes datées, jamais réécrit.
- `05-contrat-menu.md` — le contrat du document publié, lu par trois dépôts.
- `00-contexte.md` — cadrage d'origine, corrigé après audit.
- `07-audit-flux-apppos.md` — décrit le flux AppPos ↔ WooCommerce **tel qu'il
  était**. Il redevient utile pour reprendre la base de production du client.
- `09-modele-cible.md`, `12-contrat-catalogue.md`, `16-conception-images.md` —
  ils font foi, respectivement, sur le modèle, sur l'export et la lecture
  publique, et sur le miroir d'images.
- `13-dates-produits.md`, `14-rituel-stats.md` — chantiers **non engagés**.
- `README.md` — état réel des missions et de ce qui reste.
