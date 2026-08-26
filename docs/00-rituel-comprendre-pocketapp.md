# Rituel — comprendre PocketApp avant d'y toucher

Ce document se lit au début d'une session, humaine ou agent. Il ne raconte pas
le code : il dit **dans quel ordre** le regarder, et **comment vérifier** ce
qu'on croit avoir compris. Il complète `CLAUDE.md` (les règles) et
`docs/DECISIONS.md` (les pourquoi) ; il ne les répète pas.

Durée visée : vingt minutes. Ce dépôt est volumineux — on ne l'explore pas
librement, on part d'un fichier nommé et on suit ses imports.

---

## 1. Situer, avant de lire (3 min)

Trois dépôts, un seul documenté :

- **PocketApp** (ici) — la caisse et le pilotage du site.
- **AppPos** — l'ancien logiciel, React/Express/NeDB. **On n'y écrit jamais.**
  Il sert encore de référence de forme, et d'unique lecture résiduelle
  (`MenuTreeEditor.tsx`).
- **Le site** — `I:\divi-child\frontend-wp`, vitrine sans vente en ligne.

Puis le sens de circulation, qui explique presque toutes les décisions :

```
PocketBase (local, source de vérité)
      │  export par lots        │  miroir d'images
      ▼                         ▼
   products-sync.php        images-sync.php
      └──────────► base SQL distante ◄──────┘
                        │
                        ▼  catalog.php
                  le site public
```

Le site **lit**. Il n'écrit jamais dans PocketApp. Aucun processus persistant
côté hébergeur : mutualisé PHP/MySQL, pas de Node, pas de WebSocket serveur.

## 2. Lire les cinq fichiers qui tiennent l'application (10 min)

Dans cet ordre. Ne pas ouvrir autre chose pendant cette étape.

| # | Fichier | Ce qu'on y cherche |
|---|---|---|
| 1 | `CLAUDE.md` | les points d'entrée réseau et les contraintes. C'est la carte, pas un préambule |
| 2 | `main.go` (~l. 15, 71-75) | PocketBase embarqué, et **où vit la base** — `%LOCALAPPDATA%\PocketReact\pb_data`, jamais dans le dépôt |
| 3 | `frontend/main.tsx` | l'ordre des providers : session, authentification, temps réel, **file de synchronisation**, routeur, toasts. Tout ce qui doit survivre à la navigation est monté ici |
| 4 | `backend/migrations/migrations.go` | la liste des migrations. Une migration absente de cette liste **ne s'exécute jamais, sans erreur** |
| 5 | `frontend/lib/queries/` | la couche d'accès. Un écran ne parle jamais à PocketBase directement |

À la fin de cette étape, on doit pouvoir répondre sans rouvrir un fichier :
*où vit la base, qui a le droit d'écrire, et qu'est-ce qui survit à un
changement d'écran.*

## 3. Choisir son module, et lire sa doc avant son code (5 min)

Un module = un domaine. Sa documentation est versionnée **avec lui** :

- `cash` — tickets, sessions, rapports X et Z → `PocketCash-docs/`
- `stock` — le catalogue, en lecture et en écriture → `PocketStock-docs/`
- `site` — menu, export catalogue, images, éditorial → `PocketSite-docs/`
- `stats` — journal des ventes

Le `README.md` de chaque dossier de docs tient l'état réel. Le lire **avant** le
code du module : il dit ce qui a été essayé, mesuré, et abandonné.

## 4. Les six invariants qu'on ne redécouvre pas par soi-même

Chacun a coûté une panne. Ils sont détaillés dans `CLAUDE.md` ; ils sont
rappelés ici parce que les enfreindre ne produit **aucune erreur visible**.

1. **Le stock ne s'écrit jamais depuis le client** — `POST /api/stock/adjust`.
   Deux postes s'écraseraient : 60 ventes concurrentes, 15 retirées.
2. **L'image principale se désigne, elle ne s'écrase pas** —
   `POST /api/catalog/products/:id/promote-image`. Et la galerie s'envoie
   **entière** : une entrée omise supprime le fichier.
3. **Un slug non vide ne se retouche jamais.** Renommer un produit ne déplace
   pas sa page.
4. **Un seul chemin d'agrégation pour la caisse** (`aggregateZ`). Une seconde
   implémentation des mêmes règles a produit trois mois de Z faux, sur un
   document fiscal.
5. **Les décomptes se calculent côté serveur** (`/api/catalog/counts`), jamais
   en balayant 2999 produits depuis le navigateur.
6. **Deux empreintes, pas une** : le checksum d'entité ne couvre aucun champ
   image. C'est pour ça que les images ont leur propre `image_checksum` et leur
   propre route.

## 5. Vérifier au lieu de croire (le cœur du rituel)

Quatre pièges de ce dépôt échouent **en silence**. Les connaître évite de
chercher un bug là où il n'est pas.

- **Un champ absent de la liste `fields` revient vide, sans erreur.** Découvert
  deux fois : `gallery` manquant côté export (1767 fichiers ne partaient
  jamais), `description` manquant côté fiche produit (4476 caractères invisibles).
  → Quand une valeur est vide alors que la base la porte : **soupçonner la
  chaîne `fields` avant le composant.**
- **`ensureQueryData` rend le cache même invalidé.** La file exportait le
  produit d'*avant* l'enregistrement. → `fetchQuery` quand on veut la valeur
  fraîche.
- **Le SDK PocketBase auto-annule deux `getFullList` de même chemin.** Deux
  listes lancées ensemble se tuent mutuellement. → `requestKey` explicite.
- **`ensure*Collection` sort si la collection existe par son nom.** Modifier
  `backend/migrations/catalog.go` ne modifie **aucune base déjà installée.**

Et la règle de langage qui va avec : distinguer toujours ce qui est **lu dans le
code** (donner le chemin et la ligne) de ce qui est **rapporté**. Ne jamais
présenter le second comme le premier. Perdre le fil vaut mieux que deviner : le
dire.

## 6. Travailler

- Répondre en français.
- `pnpm format` **réécrit tout le dépôt** — ne formater que ses propres fichiers.
- `pnpm router:generate` après tout ajout ou renommage de route.
- `pnpm typegen` **casserait le front** en l'état : ne pas le lancer.
- Ne pas lancer de build, de test ou de serveur sans le demander : le
  propriétaire a VS Code et l'application ouverts, il voit lui-même ce dont
  Biome ou TypeScript se plaint.
- Toute nouvelle sortie réseau s'inscrit dans la liste de `CLAUDE.md`, dans le
  même geste que le code.

## 7. Refermer

Une décision qui a coûté une mesure va dans `docs/DECISIONS.md`, avec le
chiffre. Un état de chantier va dans le `README.md` du module concerné. Le code
seul ne se souvient de rien : c'est ce qui rend ce rituel nécessaire.
