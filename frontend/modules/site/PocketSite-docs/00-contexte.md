# Refonte du flux de données — axemusique.shop

Note de cadrage. Deux prompts en découlent : `01-audit-architecture.md`
(le produit) et `02-methode-memoire-agents.md` (la façon de le construire).

> **Révisé le 6 août 2026, après audit.** Ce document contenait plusieurs
> affirmations que le code a démenties. Elles sont corrigées ci-dessous ;
> le détail des écarts et les références de fichiers sont dans
> `03-audit-resultats.md`, qui fait foi en cas de contradiction.

---

## Les deux couches de données — à ne pas confondre

C'était la confusion principale de la première version de ce document. Elle a
faussé la « question ouverte » ci-dessous pendant tout le cadrage initial.

| | **Couche locale** | **Couche distante** |
|---|---|---|
| Où | poste de caisse | serveur mutualisé |
| Quoi | PocketBase (SQLite) embarqué dans Wails | à construire |
| Statut | **acquis, non rediscuté** | **objet de la refonte** |
| Rôle | stockage de travail de PocketApp | source de données du site |
| Lecteur | PocketApp | axemusique.shop |

PocketApp **est** une application Wails qui embarque PocketBase. Ce n'est pas
une option à évaluer, c'est l'existant. Quand ce document parle de « couche de
données à définir », il s'agit **uniquement de la couche distante**.

## Stack réelle

| Brique | Nature | Rôle |
|---|---|---|
| PocketApp | Wails + React, **PocketBase local sur :8090** | Logiciel POS + pilotage du site |
| AppPos | React / Express / NeDB, local, **:3000 + WebSocket** | Backend, source de vérité, alimente Woo |
| axemusique.shop | Build React + WordPress/WooCommerce | **Vitrine — pas de vente en ligne** |
| WooCommerce | API | Catalogue consommé par le site |
| WordPress | API | Menu (via plugin) + médiathèque |
| pocketapp.5sensprod.com | **Mini-SaaS PHP/MySQL** | Notifications, clés API, crédits IA |

Volume : ~2000 produits, ~200 marques, ~200 catégories.
Les trois applications sont versionnées sous Git — **mais pas le code du
serveur mutualisé**, qui est l'angle mort actuel.

**Corrections par rapport à la version initiale :**

- PocketBase local était absent du tableau. AppPos y figurait comme unique
  backend, ce qui est faux.
- Le mini-SaaS distant était absent. Il existe, il fonctionne, et il fournit
  le modèle `X-API-Key` que réutilisera la publication du menu.
- axemusique.shop est un front React posé devant un WordPress/WooCommerce
  toujours actif. Le `.htaccess` réserve `panier`, `mon-compte` et `commander`
  à WooCommerce, **mais ces routes ne servent pas : le site est une vitrine,
  il n'y a pas de vente en ligne.** WooCommerce n'est utilisé qu'en **lecture,
  comme catalogue**. Aucun tunnel d'achat à préserver.

## Problème

WordPress/WooCommerce est un intermédiaire lourd entre AppPos — qui détient
déjà la donnée — et le site. Chargements lents, ressources disproportionnées
pour un besoin limité à produits / marques / catégories / navigation.

Avantages conservés : la médiathèque WP et la familiarité avec l'outil.
Le site étant une vitrine sans vente en ligne, rien de transactionnel ne
retient WordPress — la dépendance est purement une dépendance de lecture.

## Objectif

Sortir progressivement de la dépendance WP. D'abord comprendre le flux actuel
et ses failles — **fait, voir `03-audit-resultats.md`** — puis définir une
couche de données distante propre alimentée par PocketApp.

## Premier jalon (MVP)

Afficher sur le site en environnement dev — bascule par variable `.env` — un
menu de navigation piloté depuis PocketApp, stocké hors WordPress, et
synchronisable.

Découpé en 9 tickets ordonnés dans `03-audit-resultats.md`, section 5.

## Reporté

Performance, SEO, cache, optimisation des images. Étapes ultérieures, pas
contraintes de départ. Liste complète en section 6 de `03-audit-resultats.md`.

## Arbitrages déjà tranchés

- **Pas de surcouche d'orchestration d'agents.** Le problème est le contexte
  donné aux agents, pas la coordination entre eux. Claude Code en terminal
  dans le dépôt suffit.
- **Mémoire projet dans le dépôt**, pas dans Obsidian : versionnée avec le
  code, donc jamais désynchronisée. Obsidian garde le personnel et le
  transversal.
- **PocketBase local est acquis.** Wails + PocketBase, ce n'est pas rediscuté.
- **Architecture distante : JSON statique déposé par PHP, puis MySQL + JSON
  généré quand les produits arriveront.** Tranché après audit. Les critères de
  passage de l'un à l'autre sont en section 4.5 de `03-audit-resultats.md`.

## ~~Question ouverte~~ — tranchée

> *Version initiale : « Format de la couche de données : SQLite ou JSON. NeDB
> montre ses limites à ce volume. »*

La question était mal posée : elle mélangeait les deux couches. Reformulée et
tranchée :

- **Couche locale** : SQLite via PocketBase. Déjà en place, rien à décider.
- **Couche distante** : JSON statique pour le MVP. SQLite distant est
  impossible — l'hébergement est un mutualisé PHP/MySQL sans processus
  persistant, et un fichier SQLite ne s'y sert pas de façon fiable.

NeDB reste inconfortable à ce volume, mais c'est un sujet AppPos, sans effet
sur le MVP.

## Structure de PocketApp

PocketApp est modulaire. Chemin racine : `I:\pockapp\`

| Module | Rôle | État |
|---|---|---|
| PocketCash | Caisse enregistreuse | existant |
| PocketStock | Liste les produits venant de AppPos | existant, **lecture et écriture** |
| PocketSite | Gestion du site | à construire |

Front sous `frontend/modules/<nom>/`.
Doc du module dans `frontend/modules/<nom>/<Nom>-docs/`.

**Correction :** PocketStock était décrit comme « lecture seule ». C'est faux —
il crée, modifie et supprime, vers PocketBase **et** vers AppPos
(`frontend/lib/queries/products.ts`).

## État du flux, précisions

- **AppPos** conserve son fonctionnement avec l'API WooCommerce. Rien n'y est
  touché : c'est le maillon le moins négociable, la caisse en dépend. Il reste
  **source d'autorité** sur les produits, catégories, marques et fournisseurs —
  y compris ceux présents dans PocketBase local, qui en sont des copies.
  AppPos est la première itération du logiciel de caisse ; PocketApp est sa
  refonte et son remplaçant à terme.
- **Le site axemusique.shop** est branché en dur sur l'API WooCommerce, et
  charge son menu via `wordpressService.loadMenu()` → `/wp-json/wp/v2/menus`.
  **Cette route n'est pas du WordPress standard** : elle vient d'un plugin ou
  du thème enfant, non identifié à ce jour.
- **PocketSite** est le seul module concerné par la refonte à ce stade.

## Chemin retenu pour le MVP

PocketApp pousse le menu en HTTP vers un script PHP sur le mutualisé, protégé
par `X-API-Key` — même modèle que l'API de notifications existante. Le script
écrit un `menu.json`. Le site lit ce fichier en statique, sans PHP sur le
chemin de lecture. Publication manuelle, déclenchée depuis PocketSite.

> *La version initiale de ce document disait « à valider, pas à présumer », et
> mettait en garde contre une confirmation trop rapide de l'intuition. La mise
> en garde était justifiée : l'audit a écarté l'option « API Express » comme
> impossible sur mutualisé, et l'option « MySQL avec lecture PHP » comme
> contre-productive. Le raisonnement est en section 4.3.*

## Points de vigilance

- **Le double accès parallèle à la même donnée n'est pas un risque futur : il
  existe déjà.** `useUpdateProductUniversal` route les écritures vers AppPos ou
  PocketBase selon une chaîne de caractères non typée
  (`frontend/lib/queries/products.ts:180`). Ne pas en créer un troisième avec
  la couche distante.
- **Les identifiants WooCommerce et WordPress sont en clair dans le bundle
  public du site.** Faille indépendante de la refonte, plus urgente qu'elle.
  Détail en section 3.1 de `03-audit-resultats.md`.
- **Ne pas toucher `wp-admin` ni `wp-json`** dans le `.htaccess` tant que
  WordPress sert le catalogue et la médiathèque. Les routes `panier`,
  `mon-compte` et `commander` sont en revanche inutilisées et pourront être
  nettoyées plus tard.
