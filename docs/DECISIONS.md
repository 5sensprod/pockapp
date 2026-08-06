# Décisions

Ce que le code ne peut pas dire : pourquoi il est comme ça, et surtout ce qui a
été écarté. Une décision = un bloc. On ajoute en haut. **On ne réécrit jamais un
bloc existant** — une décision annulée reçoit un nouveau bloc qui l'annule, et
la mention `— annulée le <date> par <titre>` est ajoutée sur l'ancienne.

Format : titre, date, la décision en une phrase, les options écartées et
pourquoi, ce qui pourrait la remettre en cause.

---

## Schéma de la collection `site_menu` — 2026-08-06

La destination d'une entrée est stockée en **référence dénormalisée**
(`link_type` en `select`, `ref_id` en chaîne opaque), et la collection **n'a
pas de champ `company`**. Schéma complet : `backend/migrations/site_menu.go`.

**Écarté — `ref_id` en relation PocketBase :** elle aurait tranché, au ticket 1,
une question que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` laisse explicitement
ouverte jusqu'au ticket 4 — lequel des trois référentiels (AppPos, WooCommerce,
PocketBase local) fait foi pour une destination. Une relation ne peut pointer
que vers PocketBase local, qui n'est qu'une copie des référentiels d'AppPos
(faille 3.3 de l'audit) ; l'exemple du contrat, lui, porte un identifiant
WooCommerce. Choisir la relation aurait donc désigné la copie comme autorité
par un effet de bord du typage, et il aurait fallu une migration pour le
défaire.

**L'absence de `company` est délibérée, ce n'est pas un oubli.** `categories`,
`products`, `customers` et `invoices` portent toutes une relation `company`
requise ; `site_menu` en est la seule exception du catalogue local, et un
lecteur futur y verrait une erreur sans cette note. La raison : ces collections
décrivent l'activité d'une entreprise, `site_menu` décrit **un site**, et il
n'y en a qu'un. Ajouter le champ aurait anticipé le multi-site sans besoin, et
imposé de choisir une société à la publication alors que la publication ne
s'adresse qu'à axemusique.shop.

**Remise en cause si :**

- `ref_id` — le ticket 4 désigne PocketBase local comme référentiel des
  destinations, **et** on veut que l'intégrité référentielle détecte les
  destinations orphelines, plutôt que la vérification faite à la publication.
  Les deux conditions, pas une seule : sans la première, une relation ne peut
  pas pointer vers la bonne source.
- `company` — un second site est piloté depuis PocketApp, ou le multi-poste
  arrive (§6 de `03-audit-resultats.md` le reporte aujourd'hui).

## Contrat du menu publié — 2026-08-06

Le menu publié est servi à une **URL stable et non versionnée**,
`https://axemusique.shop/data/menu.json`, et chaque entrée porte une
**référence typée `{type, id}` accompagnée de l'`url` résolue à la
publication**. Forme complète : `frontend/modules/site/PocketSite-docs/05-contrat-menu.md`.

**Écarté — URL versionnée (`menu.v1.json`) :** changer de version obligerait à
redéployer le site, par FTP et sans retour arrière (faille 3.7). Or c'est
précisément ce que le contrat existe pour éviter. La version est un champ dans
le document, comme le prévoyait déjà §4.4 de l'audit.

**Écarté — destination en URL brute, sans référence typée :** le site ne saurait
pas d'où vient un lien, et personne ne pourrait détecter une destination devenue
orpheline. La référence seule, sans URL résolue, a été écartée symétriquement :
elle obligerait le site à savoir ce qu'est une catégorie WooCommerce et à
refaire la résolution — du travail dans le dépôt le plus coûteux à redéployer.
On publie donc les deux : le site ne lit que `url` et reste bête, PocketApp
garde `ref` et l'intelligence.

**Écarté — arbre imbriqué à `children` :** le site consomme aujourd'hui une
liste plate `{id, title, url, parent}` (`wordpress.js:52-71` du dépôt du site).
Publier un arbre aurait imposé un aplatissement, donc une modification des
composants de navigation, pour un bénéfice nul.

**Le raisonnement, commun aux trois :** c'est §4.4 de l'audit appliqué un cran
plus bas — mettre l'intelligence du côté qui se redéploie facilement. PocketApp
se rebuilde à volonté ; le site part par FTP sans retour arrière.

**Vérifié à cette occasion :** le `.htaccess` racine garde ses deux règles de
réécriture par `RewriteCond %{REQUEST_FILENAME} !-f`. Un fichier réellement
présent à `/data/menu.json` est servi en statique, sans PHP sur le chemin de
lecture, sans modification du `.htaccess` au ticket 7.

**Remise en cause si :** la couche distante doit accueillir autre chose que le
menu — un second objet publié remettrait en question le chemin `/data/menu.json`
et l'idée d'un document unique. Ou si un consommateur autre que le site doit
lire le fichier et a besoin de plus que `url`.

## Documentation dans le dépôt, Obsidian pour le personnel — 2026-08-06

`CLAUDE.md`, `docs/DECISIONS.md` et les `<Nom>-docs/` de module sont versionnés
avec le code. Obsidian sert d'éditeur Markdown sur ces fichiers, et de vault
séparé non versionné pour le personnel et le transversal.

**Écarté :** tenir la connaissance projet dans Obsidian. Elle se désynchronise
du code dès le premier renommage, et un agent ne la lit pas.

**Remise en cause si :** un second contributeur arrive, ou si les notes
personnelles commencent à contenir des décisions projet — signe que la
frontière ne tient pas.

## Pas de surcouche d'orchestration d'agents — 2026-08-06

Claude Code dans le dépôt suffit. Le problème est le contexte donné aux agents,
pas la coordination entre eux.

**Écarté :** frameworks multi-agents. Ils résolvent un problème de coordination
qu'un développeur seul n'a pas.

**Remise en cause si :** des sessions parallèles sur des modules différents
deviennent la norme.

## Couche distante : JSON statique déposé par PHP — 2026-08-06

Pour le MVP menu : PocketApp pousse en HTTP vers un script PHP protégé par
`X-API-Key`, le script écrit un `menu.json`, le site le lit en statique — **pas
de PHP sur le chemin de lecture**. Ensuite : MySQL en stockage, JSON statique
en lecture (option C), quand les produits arriveront.

**Écarté — MySQL avec endpoints PHP en lecture :** paie le coût de MySQL sur le
chemin de lecture du site. On ne quitte pas un intermédiaire PHP+MySQL pour en
rebâtir un plus petit.

**Écarté — API Node/Express, PocketBase distant, SQLite distant :** impossibles
sur mutualisé, aucun processus persistant.

**Le raisonnement, qui est la vraie décision :** ce qui engage n'est pas le
stockage mais le **contrat** — l'URL appelée et la forme du JSON. Le contrat est
coûteux à changer parce qu'il vit dans un build déployé par FTP sans retour
arrière. Ce qu'il y a derrière l'URL se remplace en une après-midi. Donc :
soigner le contrat, prendre le stockage le plus simple.

**Remise en cause si :** un des quatre déclencheurs de la section 4.5 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` est atteint.

## PocketBase local est acquis — antérieur, consigné le 2026-08-06

Wails embarque PocketBase (SQLite) sur `:8090`. Ce n'est pas une option à
réévaluer, c'est l'existant. La question « SQLite ou JSON » ne concernait que la
couche **distante** ; la couche locale est déjà tranchée.

**Remise en cause si :** jamais, dans le cadre de la refonte du site.

## AppPos reste autorité pendant la transition — antérieur, consigné le 2026-08-06

AppPos détient produits, catégories, marques et fournisseurs. PocketBase local
en contient des copies. PocketApp le remplacera, mais pas maintenant.

**Coût accepté et connu :** chaque fonctionnalité de PocketApp qui lit AppPos
alourdit la bascule finale. Coût croissant avec le temps.

**Remise en cause si :** le coût de la bascule devient supérieur à celui de
maintenir les deux — à réévaluer, pas à subir.
