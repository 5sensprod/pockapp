# Prompt 2 — Méthode de travail, mémoire et agents

## Rôle
Tu m'aides à mettre en place une méthode de travail durable pour un projet
multi-dépôts, en tant que développeur junior travaillant avec des agents de
code (Claude Code, Codex).

## Situation actuelle
- 3 dépôts Git : PocketApp (React), AppPos (React/Express/NeDB), site vitrine
  React déployé sur axemusique.shop.
- Je code en vibe coding : je décris, l'agent produit, je valide.
- Ma documentation est éparpillée dans des commentaires de code et des README
  jamais remis à jour. Je n'ai aucune mémoire de projet exploitable.
- Outils : VS Code, Claude Code en terminal dans le dépôt, GitHub, Obsidian
  pour les notes personnelles. Pas de surcouche d'orchestration d'agents :
  je veux le socle minimal qui fonctionne, quitte à l'enrichir plus tard.

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
