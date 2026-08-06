# Installer et lancer un agent sur ces prompts

## Quel agent pour cette phase

Les prompts 01 et 02 ne demandent aucun code. Ils demandent une critique
d'architecture et une série de questions. **Claude Code** convient mieux ici :
il lit le dépôt directement et tient une conversation. Codex viendra à l'étape
d'implémentation, une fois les tickets définis.

Une session par prompt. Les mélanger dilue les deux : le 01 raisonne sur le
produit, le 02 sur la méthode de travail.

---

## Installation sur Windows

### Prérequis

- Windows 10 version 1809 ou plus récent
- 4 Go de RAM minimum
- Un compte Claude **Pro, Max, Team ou Enterprise**. Le plan gratuit ne donne
  pas accès à Claude Code.

### Git for Windows (recommandé)

Optionnel mais conseillé : sans lui, Claude Code utilise PowerShell comme shell
au lieu de Git Bash.

Télécharger : https://git-scm.com/downloads/win

Sur l'écran PATH de l'installeur, laisser l'option du milieu
(« Git from the command line and also from 3rd-party software »).

### Installer Claude Code

Dans **PowerShell** (pas CMD — le prompt affiche `PS C:\`), sans droits
administrateur :

```powershell
irm https://claude.ai/install.ps1 | iex
```

Alternative via WinGet :

```powershell
winget install Anthropic.ClaudeCode
```

Note : l'installation native se met à jour seule en arrière-plan. WinGet non
(`winget upgrade Anthropic.ClaudeCode` à faire manuellement).

### Vérifier

```powershell
claude --version
```

Doit afficher un numéro de version. En cas d'erreur `command not found`, le
dossier `%USERPROFILE%\.local\bin` n'est probablement pas dans le PATH —
redémarrer le terminal, puis lancer `claude doctor` pour un diagnostic.

### Première connexion

```powershell
claude
```

Le navigateur s'ouvre pour la connexion. Une seule fois.

### Alternative sans terminal

L'application de bureau permet d'utiliser Claude Code sans ligne de commande :
https://claude.com/download

Documentation complète : https://code.claude.com/docs/en/setup

---

## Session 1 — l'audit

```powershell
cd I:\pockapp
claude
```

Puis, dans la session :

```
Lis frontend/modules/site/AppSite-docs/00-contexte.md, puis applique
les instructions de 01-audit-architecture.md.

Le dépôt est volumineux : ne l'explore pas librement. Pars de ce fichier
et remonte ses imports de proche en proche :

  frontend\modules\stock\components\ProductTable.tsx

Suis la chaîne jusqu'à trouver où la donnée entre réellement dans
l'application : appel HTTP, configuration d'URL, variables d'env.
Arrête-toi là.

Si tu perds le fil — import dynamique, barrel file, chemin ambigu —
dis-le moi plutôt que de deviner ou d'élargir la recherche.

Restitue-moi la chaîne sous forme de liste ordonnée avant toute analyse,
en signalant les écarts avec ce qu'affirme le contexte.
```

Le dernier paragraphe compte. Le contexte est déclaratif, écrit sans avoir vu
une ligne du code réel. L'agent, lui, peut vérifier.

### Pendant la session

L'agent doit **commencer par poser ses questions**. S'il enchaîne directement
sur des propositions, l'arrêter : il a sauté l'étape la plus utile.

Point de vigilance : ne pas le laisser confirmer l'intuition « SQL distante ou
API simple » sans l'avoir examinée. C'est une hypothèse, pas une décision.

### En fin de session

```
Résume nos conclusions dans un fichier
frontend/modules/site/AppSite-docs/03-audit-resultats.md :
le flux tel qu'il est réellement, les failles retenues, l'architecture
choisie et pourquoi, les tickets du MVP dans l'ordre.
```

Puis commiter. Ce fichier devient le point d'entrée des sessions suivantes,
et le début concret de la mémoire projet évoquée dans le prompt 02.

---

## Session 2 — méthode et mémoire

À lancer **après** la session 1, une fois `03-audit-resultats.md` écrit.

```
Lis frontend/modules/site/AppSite-docs/00-contexte.md et
03-audit-resultats.md, puis applique 02-methode-memoire-agents.md.
```

Cette session produira la structure documentaire définitive. Il est probable
qu'elle propose de réorganiser ces fichiers — c'est attendu, et c'est le bon
moment pour le faire.
