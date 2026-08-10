# Décisions

Ce que le code ne peut pas dire : pourquoi il est comme ça, et surtout ce qui a
été écarté. Une décision = un bloc. On ajoute en haut. **On ne réécrit jamais un
bloc existant** — une décision annulée reçoit un nouveau bloc qui l'annule, et
la mention `— annulée le <date> par <titre>` est ajoutée sur l'ancienne.

Format : titre, date, la décision en une phrase, les options écartées et
pourquoi, ce qui pourrait la remettre en cause.

---

## Le menu reste en JSON statique — l'option C est abandonnée pour lui — 2026-08-10

Le menu ne passera pas en MySQL. `server/schema.sql`, qui décrivait ce stockage,
est **supprimé**. Le fichier statique reste, définitivement, la forme du menu
publié.

Ce bloc **clôt** la partie « C ensuite » du bloc « Couche distante : JSON
statique déposé par PHP » du 2026-08-06, pour le seul menu. Le raisonnement de
ce bloc-là n'est pas désavoué — il est arrivé à son terme : on a soigné le
contrat, pris le stockage le plus simple, et le plus simple a suffi.

**Ce qui le justifie, après mise en production :** le document publié fait
quelques kilo-octets, aucun des quatre déclencheurs de §4.5 de l'audit n'est
atteint, et le menu s'affiche en ~244 ms sans PHP ni base sur le chemin de
lecture. Le passage à MySQL n'apporterait que l'historique des publications —
un besoin qui ne s'est pas manifesté en trois jours d'usage.

**Pourquoi supprimer le fichier plutôt que le garder « au cas où » :** il aurait
été trompeur. La mission suivante — sortir le **catalogue** de WooCommerce —
aura bien besoin d'une base SQL, et quelqu'un aurait ouvert `schema.sql` en
croyant y trouver un point de départ. Il décrit des publications de menu, table
`menu_publication` et colonne `payload` comprises : rien de réutilisable pour
des produits, des catégories et des marques.

**Remise en cause si :** un besoin de retour arrière sur publication du menu
apparaît — déclencheur n°2 de §4.5, toujours valable. Il se traiterait alors
sans doute dans la base du catalogue plutôt que dans une base à lui.

## Le menu publié est la seule source du menu affiché — 2026-08-10

**Annule le bloc « Le menu affiché n'est pas seulement le menu publié » du même
jour.** L'injection des sous-catégories WooCommerce dans le menu est
**supprimée** : `useNavigation.js` du dépôt du site ne lit plus les catégories,
et `useWordPress()` n'y est même plus importé. Le menu rendu est exactement le
contenu de `menu.json`.

**Ce qui a changé en quelques heures, et ce n'est pas un fait nouveau :** le
bloc annulé arbitrait en faveur du confort — l'arborescence se maintenait seule.
Le propriétaire du projet a posé une exigence qui prime : **plus aucun lien avec
WordPress pour l'affichage du menu.** Or WooCommerce est servi par WordPress.
Garder l'injection, c'était retirer la dépendance au *menu* WordPress tout en la
laissant intacte pour son *contenu* — la moitié du travail, avec l'apparence de
la totalité.

**Ce qui rend l'échange acceptable :** le menu WordPress importé porte déjà
20 sous-entrées choisies à la main. Elles remplacent exactement ce que
l'injection produisait automatiquement, en mieux : triées, nommées et masquables
depuis PocketApp. On ne perd pas une fonctionnalité, on la reprend en main.

**Trois gains, qui sont les raisons de la décision :**

- **`menu.json` redevient diagnosticable seul.** Lire le fichier publié suffit à
  savoir ce que voit un visiteur — c'était l'un des deux buts de `ref` en §3 du
  contrat, perdu par l'injection.
- **Le menu ne dépend plus d'aucune API à l'affichage.** Ni `wp/v2`, ni `wc/v3`.
  Vérifié : 15 liens rendus, tous présents dans le document publié, aucun ajout.
- **Ordre, libellé et visibilité des sous-entrées reviennent à PocketApp**, ce
  que l'injection interdisait.

**Le prix, assumé :** le menu ne suit plus le catalogue. Une nouvelle
sous-catégorie n'apparaîtra que si on l'ajoute dans PocketApp et qu'on republie.
C'est l'échange demandé — l'indépendance contre l'automatisme.

**Effet de bord qu'il a fallu traiter en même temps, et qui n'était pas
évident :** `convertToReactUrl` ne gardait que le **premier segment** d'une URL
de catégorie. C'était sans conséquence tant que les sous-catégories injectées
portaient leur `reactUrl` déjà calculée — elles ne passaient pas par cette
fonction. L'injection coupée, une entrée `guitares-folk/folk-electro` aurait été
tronquée en `guitares-folk` et aurait mené à la catégorie **parente, sans
erreur**. La troncature est supprimée ; `CategoryPage` résout sur le dernier
segment et accepte le chemin complet. Vérifié dans un navigateur.

**Remise en cause si :** maintenir les sous-entrées à la main devient une charge
— auquel cas la réponse n'est pas de rétablir l'injection, mais de générer ces
entrées dans PocketApp au moment de l'édition, où elles resteraient
maîtrisables et publiées.

## ~~Le menu affiché n'est pas seulement le menu publié~~ — 2026-08-10 — annulée le 2026-08-10 par « Le menu publié est la seule source du menu affiché »

**Constat d'abord, décision ensuite.** Le site n'affiche pas le document publié
tel quel : quand une entrée pointe vers une catégorie racine, il y **greffe les
sous-catégories lues chez WooCommerce**, au moment du rendu.
`useNavigation.js:119-135` du dépôt du site (`buildCategoryChildren`, `:85-106`)
— code antérieur au MVP, découvert en vérifiant le ticket 8, pas écrit pour lui.

Vérifié le 10 août 2026 : une entrée « Guitare classique » vers la catégorie
1096 produit à l'écran sept sous-entrées (Classiques 1/4 & 1/2, 3/4, 4/4, 7/8,
électro, pour gauchers, Flamenco) et un « Voir tout → », dont **aucune n'est
dans `menu.json`**.

**Décision : on garde.** L'arborescence reste à jour toute seule, sans rien
republier, et c'est le modèle d'hydratation voulu — le catalogue vient de
WooCommerce pendant toute la transition.

**Écarté — publier les sous-catégories comme entrées réelles :** il faudrait
recopier dans `site_menu` une arborescence qui vit ailleurs, et republier à
chaque évolution du catalogue. On échangerait une hydratation automatique
contre un problème de synchronisation que PocketApp devrait résoudre — soit la
faille 3.3 (copies non réconciliées) étendue au menu.

**Ce que ça coûte, et qu'il faut assumer les yeux ouverts :**

- **`menu.json` ne décrit pas entièrement ce que voit un visiteur.** Diagnostiquer
  le menu en lisant le seul fichier publié — un des deux buts de `ref` selon §3
  du contrat — ne suffit plus.
- **Aucun contrôle depuis PocketApp** sur les sous-catégories injectées :
  ni masquage, ni renommage, ni ordre, ni exclusion.
- **Le menu dépend encore de WooCommerce à l'affichage.** Le MVP a retiré la
  dépendance au *menu* WordPress, pas celle-ci.
- **La faille 3.2 s'applique en silence** : le site ne charge que 188 catégories
  (2 pages de 100, `hide_empty`) ; au-delà, des enfants manqueraient sans erreur.
- **Décalage visible** : menu publié prêt à ~470 ms, catégories à ~4,2 s. Le
  sous-menu se remplit après coup.
- **Condition non évidente** : l'injection n'a lieu que pour une catégorie
  **racine** (`cat.parent === 0`, `useNavigation.js:128`) et si
  `VITE_USE_REACT_CATEGORIES` vaut `true`. Une entrée vers une sous-catégorie
  n'aura pas d'enfants, sans que rien ne le signale.

**Remise en cause si :** la couche distante remplace WooCommerce comme catalogue
— l'injection n'aurait alors plus de source, et la question se reposera d'
elle-même. Ou si le besoin apparaît de maîtriser l'ordre ou la visibilité des
sous-entrées depuis PocketApp.

## Clé de publication dédiée, document composé en React, POST émis par le Go — 2026-08-08

Trois décisions liées, prises ensemble parce qu'elles se déterminent l'une
l'autre. Mise en œuvre : ticket 5b (le réglage), ticket 6 (l'usage).

**1. La clé de publication est distincte de celle du mini-SaaS.**
`site_publish_api_key` (`backend/secrets/secrets.go`), chiffrée dans
`app_settings` par le `SecretManager`, saisie depuis Réglages > Clés API. L'URL
de l'endpoint l'accompagne en réglage **non chiffré** (`site_publish_url`) :
ce n'est pas un secret, et en dur elle imposerait de recompiler pour viser un
autre serveur.

**Écarté — réutiliser `notification_api_key` :** c'est ce qui avait été fait au
premier essai, la clé ayant été générée par le mini-SaaS. Deux raisons de ne pas
le garder. D'abord un secret unique pour deux services sans rapport : le
mini-SaaS peut la faire tourner sans savoir que la publication en dépend, et la
publication tomberait en `401` sans explication. Ensuite, et c'est décisif,
`GET /api/settings/pocketapp-key` (`backend/routes/secrets_routes.go:125`) la
renvoie **déchiffrée sans garde admin**, contrairement aux quatre routes
voisines — elle est appelée ainsi par `frontend/lib/credits.ts:22`. Tout ce qui
atteint `127.0.0.1:8090` peut donc la lire. **Cette route est une faille
connue, non corrigée, et hors périmètre du ticket** : la décision consiste à ne
pas lui confier une seconde responsabilité.

**2. Le document publié est composé en React, pas en Go.**
L'éditeur (ticket 4) produit le JSON complet — aplatissement, exclusion des
entrées masquées et de leurs descendants, résolution `ref` → `url` — et l'envoie
à la couche Go.

**Écarté — tout composer en Go :** la résolution part d'un identifiant
WooCommerce lu dans AppPos (bloc « Origine des destinations du menu »), et le
client AppPos n'existe **qu'en TypeScript** (`frontend/lib/apppos/`) ; aucun
fichier `.go` ne parle à `:3000` — vérifié. Il aurait fallu réécrire ce client
en Go : seconde authentification, second jeton, second chemin vers AppPos, donc
le point 2 de `CLAUDE.md` en double.

**Coût accepté :** le Go poste un document qu'il n'a pas composé et ne peut donc
pas garantir conforme. L'endpoint PHP reste le seul gardien du contrat — c'est
son rôle, et la raison pour laquelle il renvoie la liste **complète** des
erreurs plutôt que la première.

**3. Le POST part du Go, jamais du React.** Le front envoie le document à sa
propre couche Go, qui lit la clé et pose l'en-tête `X-API-Key`. La clé ne
descend jamais dans le renderer — aucune route ne la relit, contrairement au
schéma de `credits.ts`.

**Écarté — poster depuis le React avec la clé récupérée par une route :** ce
serait reproduire exactement le problème du point 1, et rapprocher la clé du
bundle, famille de la faille 3.1.

**Écarté — une variable `VITE_` :** tout ce qui est préfixé `VITE_` est inliné
en clair dans le JavaScript livré. C'est la faille 3.1 elle-même.

**Remise en cause si :** un client AppPos en Go apparaît pour une autre raison
(alors le point 2 se rediscute), ou la publication doit avoir lieu sans
interface — tâche planifiée, second poste — car le React ne serait plus là pour
composer.

## Où vit le code du serveur mutualisé — 2026-08-07

Le code PHP qui tourne sur l'hébergement d'axemusique.shop est versionné dans
**ce dépôt-ci, sous `server/`**. Il ne s'exécute pas dans PocketApp : il est
déposé par FTP, à la main, une fois. Rien du binaire Wails ne l'importe.

C'est la question ouverte de §7.2 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` — « dépôt dédié,
ou dossier dans PocketApp ? », renvoyée au ticket 5.

**Ce qui tranche :** PocketApp est le seul appelant de cet endpoint, et le
contrat qu'ils partagent (`05-contrat-menu.md`) vit déjà ici. Les deux côtés du
même contrat changent ensemble, dans le même commit, ou ils divergent.

**Écarté — un dépôt dédié :** quelques fichiers PHP dans un dépôt à eux, c'est
le maillon qu'on oublie de cloner, qu'on ne met pas à jour, et dont on découvre
six mois plus tard qu'il ne correspond plus à ce qui est en ligne. C'est
exactement l'angle mort que la note « Tickets 5 et 7 : versionner le code
serveur » de §5 de l'audit voulait éviter.

**Écarté — le thème enfant WordPress (`I:\divi-child`, dossier `child/`) :**
c'est pourtant un domicile réel, versionné, et déjà déployé sur ce serveur —
c'est là que vit `functions.php`. Trois raisons de ne pas y aller. Le MVP existe
pour **sortir** le menu de WordPress : y remettre le code de sortie le rend
dépendant du thème, donc d'une mise à jour de thème ou d'un changement de
constructeur de page. Le contrat et son producteur seraient alors dans deux
dépôts, avec le consommateur (`frontend-wp/`) dans le même que le producteur —
la pire répartition des trois. Enfin `child/` est chargé par WordPress à chaque
requête du site, alors que cet endpoint doit rester **hors du chemin WordPress**
(§1 du contrat : hors `wp-content/`, qu'une restauration WP peut balayer).

**Aucune clé dans le dépôt.** `server/config/config.php` porte la clé
`X-API-Key` et est ignoré par Git (`server/.gitignore`) ; `config.php.example`
est versionné à côté. Modèle repris du mini-SaaS `pocketapp.5sensprod.com`
(`api/`, configuration hors dépôt, `schema.sql`), comme le recommandait §5 de
l'audit.

**`server/schema.sql` est versionné mais n'est pas joué.** Il décrit le stockage
MySQL de l'option C, pour que la bascule reste une après-midi. Aucun des quatre
déclencheurs de §4.5 n'est atteint : la décision « A pour le MVP, C ensuite »
tient inchangée.

**Remise en cause si :** un second consommateur du code serveur apparaît sans
lien avec PocketApp, ou le serveur acquiert un déploiement automatisé — auquel
cas c'est le pipeline, pas le dépôt, qui décide.

## Cible à terme : la couche distante remplace WooCommerce comme catalogue — 2026-08-07

**Intention consignée, rien d'étudié, aucun travail engagé.** Ce bloc existe
pour que la cible ne se reperde pas entre deux sessions, pas pour la commencer.

À terme, la couche distante posée au ticket 5 — script PHP de réception,
données servies en statique — a vocation à porter **le catalogue** du site
(produits, catégories, marques), et non le seul menu. WooCommerce cesserait
alors d'être la source du site ; sa médiathèque, elle, reste (§4.6 de l'audit).

**Ce qui rend la cible envisageable :** le site est une vitrine sans vente en
ligne (§2.4 de l'audit). Pas de tunnel d'achat, pas de compte client, pas de
commande à préserver. C'est un problème de lecture de données. Et c'est aussi la
réponse durable à la faille 3.1 : plus de clés WooCommerce dans le bundle si le
site ne parle plus à WooCommerce.

**Ce qui n'est pas tranché** — les trois questions de §7.3 de l'audit restent
ouvertes, mot pour mot : le volume réel une fois publié, la stratégie d'images,
la recherche côté site. À quoi s'ajoute que ~2000 produits ne se servent pas en
un fichier unique — c'est le déclencheur n°1 de §4.5, donc cette cible **passe
par l'option C**, elle ne s'atteint pas depuis A.

**Ce que ce bloc n'autorise pas :** anticiper. La migration des produits et la
bascule AppPos → PocketApp sont explicitement reportées en §6 de l'audit, et
AppPos reste autorité pendant toute la transition. Aucun ticket du MVP ne s'en
approche.

**Remise en cause si :** le MVP menu échoue à tenir en production, ou WordPress
doit rester pour une raison qui n'apparaît qu'à l'usage — auquel cas la cible
n'est pas seulement repoussée, elle est fausse.

## Origine des destinations du menu — 2026-08-06

L'éditeur du ticket 4 propose les destinations **lues depuis AppPos**, en
lecture seule via le client existant (`frontend/lib/apppos/`), et `ref_id`
stocke l'**identifiant WooCommerce** de la cible. Aucun nouveau point d'entrée
réseau : AppPos est déjà le point 2 de `CLAUDE.md`.

C'est l'arbitrage que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` renvoyait
explicitement au ticket 4, et dont `ref_id` en chaîne opaque attendait la
réponse.

**Les deux faits qui l'imposent sont DÉCLARÉS, pas lus dans le code** — ils
n'étaient écrits nulle part avant ce bloc, et personne ne les a vérifiés
depuis le dépôt :

1. les collections `products`, `brands`, `categories` et `suppliers` de
   PocketBase local sont **vides** : elles ne contiennent pas encore les
   données d'AppPos ;
2. AppPos porte dans NeDB les **identifiants WooCommerce** des catégories,
   marques et produits, parce qu'il est synchronisé avec Woo.

**Écarté — PocketBase local :** le fait 1 le disqualifie. Les hooks existants
(`frontend/lib/queries/categories.ts`) sont branchés, mais sur des collections
sans lignes ; l'éditeur n'aurait rien à proposer. Le choisir aurait aussi
désigné la copie comme autorité, ce que le ticket 1 avait justement refusé de
faire par effet de bord du typage.

**Écarté — WooCommerce interrogé directement :** ce serait une quatrième sortie
réseau, à inscrire dans `CLAUDE.md`, et elle s'appuierait sur les clés
WooCommerce qui sont la faille 3.1 — déclarée prioritaire sur tous les tickets.
Passer par AppPos donne le même identifiant sans ouvrir ce chemin.

**Écarté — repousser l'arbitrage (liens manuels seuls au ticket 4) :** le
contrat posait la question ici. La laisser ouverte aurait obligé à revenir sur
l'éditeur une fois écrit.

**Conséquence pour le ticket 6 :** la résolution `ref` → `url` part d'un
identifiant WooCommerce, ce qui est aussi la forme de l'exemple du contrat
(`"ref": { "type": "category", "id": "142" }`). Aucune table de correspondance
intermédiaire à construire.

**Remise en cause si :** AppPos cesse d'être synchronisé avec WooCommerce, ou
le site cesse de servir ses URL de catégorie depuis WooCommerce. Le
remplissage des collections locales par les données d'AppPos ne suffirait pas :
il faudrait en plus que ces copies portent l'identifiant WooCommerce.

**Effet sur le bloc suivant :** la condition de remise en cause de `ref_id` en
relation PocketBase est **renforcée, pas levée**. Le ticket 4 ne désigne pas
PocketBase local comme référentiel des destinations — il désigne AppPos. La
première des deux conditions est donc non seulement non remplie, mais écartée
sur un fait structurel.

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
