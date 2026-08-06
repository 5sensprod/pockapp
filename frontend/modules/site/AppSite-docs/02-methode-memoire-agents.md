# Prompt 2 — Méthode de travail, mémoire et agents

## Rôle
Tu m'aides à mettre en place une méthode de travail durable pour un projet
multi-dépôts, en tant que développeur junior travaillant avec des agents de
code (Claude Code, Codex).

## Situation actuelle
- PocketApp : application Wails modulaire (AppCash, AppStock, AppSite),
  embarquant PocketBase. AppPos et le site axemusique.shop sont deux
  dépôts distincts.
- Doc de module dans `frontend/modules/<nom>/<Nom>-docs/`, versionnée
  avec le code. Convention déjà éprouvée sur AppSite.
- Outils : Claude Code (application de bureau), VS Code, GitHub, Obsidian
  ouvert sur le dossier de doc. Pas de surcouche d'orchestration d'agents.
## Ce que je veux résoudre
1. Où vit la connaissance du projet ? Que met-on dans le dépôt (versionné avec
   le code, donc toujours cohérent) et que met-on dans un espace de notes
   séparé ?
2. Comment donner du contexte à un agent au début d'une session sans réexpliquer
   toute l'architecture à chaque fois.
3. Comment capturer les décisions d'architecture au moment où elles sont prises,
   plutôt que de les reconstituer six mois plus tard.
4. Comment garder README, notes et code synchronisés sans que ce soit une
   corvée qui finit abandonnée.

## Ce que j'attends
- Une proposition concrète d'arborescence documentaire, fichier par fichier,
  avec ce que contient chacun et quand on le met à jour.
- Une convention de commits et de branches adaptée à un solo dev qui travaille
  avec des agents.
- Un rituel court de début et de fin de session d'agent.
- Un arbitrage argumenté : qu'est-ce qui gagne à être dans le dépôt, qu'est-ce
  qui gagne à être dans Obsidian, et pourquoi.
- Dis-moi quel est le plus petit ensemble de fichiers de documentation qui
  rende un agent immédiatement opérationnel sur un dépôt qu'il découvre.
  Trois fichiers maximum. Justifie chacun.
- Le tout dimensionné pour un développeur seul. Refuse explicitement toute
  cérémonie de process qui ne se justifie qu'en équipe.

## Contraintes
- Pose-moi d'abord les questions nécessaires sur mon rythme de travail réel,
  mon usage actuel d'Obsidian, et si j'accepte de versionner mes notes.
- Sois direct sur ce qui, dans mes intentions, risque de ne pas tenir dans le
  temps.
