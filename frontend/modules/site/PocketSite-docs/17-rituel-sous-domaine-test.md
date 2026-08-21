# Rituel — servir la nouvelle version sur `axe.5sensprod.com`

**Écrit le 20 août 2026**, sur demande du propriétaire. À donner tel quel à la
session qui exposera le site de test.

---

Tu travailles sur **le serveur mutualisé d'axemusique.shop**, depuis
`I:\pockapp` (où vit `server/`, versionné mais déposé par FTP) et
`I:\divi-child\frontend-wp` (le bundle React). Lis d'abord `CLAUDE.md` à la
racine de PocketApp — la section « Contraintes à ne pas franchir » —, puis
[`../../../../server/README.md`](../../../../server/README.md).

## L'objectif

**Servir la nouvelle version du site sur `axe.5sensprod.com`**, pour la tester
en conditions réelles et l'auditer avec **Lighthouse**, sans que
`axemusique.shop` bouge d'un pixel.

Le levier est le `.htaccess`. Le décor a été précisé par le propriétaire :

- **même compte d'hébergement**, `axe.5sensprod.com` est un sous-domaine local ;
- **le build part dans un dossier `frontend/`** placé **dans la racine actuelle**,
  celle où vit WordPress ;
- **le sous-domaine pointe sur cette même racine** — pas sur `frontend/` ;
- le site de test lit **la base SQL et l'API PHP existantes**, comme en dév ;
- le sous-domaine doit être **invisible des moteurs**.

## Le fait central, dont tout découle

**Un seul dossier racine, un seul `.htaccess`, deux domaines.**

`axemusique.shop` et `axe.5sensprod.com` traversent le MÊME fichier de règles.
Toute directive écrite sans garde s'applique donc **aussi à la production**.

> ⚠️ **C'est le seul vrai danger de ce ticket, et il n'est pas théorique :** une
> règle de réécriture SPA sans condition d'hôte transformerait la boutique en
> ligne en site de test, instantanément, pour tous les visiteurs.

**Toute règle que tu ajoutes est donc précédée d'une condition d'hôte**, sans
exception, y compris les règles qui te semblent inoffensives :

```apache
RewriteCond %{HTTP_HOST} ^axe\.5sensprod\.com$ [NC]
```

## Le terrain est déjà connu — lis-le avant de l'inventer

**[`server/.htaccess`](../../../../server/.htaccess) est la copie versionnée du
`.htaccess` de production.** Il t'apprend quatre choses, et elles t'évitent
d'en découvrir trois à tes dépens :

1. **Le motif existe déjà.** La version React actuelle est servie depuis
   `/axemusique-react/`, par des règles **route par route** :
   `^produit/`, `^categorie-produit/`, `^shop/?$`, `^bons-plans/?$`, la racine
   et `^mentions-legales/?$` ;
2. **Les assets sont réécrits, pas déplacés** —
   `RewriteRule ^assets/(.*)$ /axemusique-react/assets/$1 [L]`. C'est la réponse
   au problème du §« Piège 1 » ci-dessous, et elle a déjà été payée une fois ;
3. **`/server/api` est exclu AVANT WordPress**, par
   `RewriteRule ^server/api(?:/|$) - [L]`. Sans cette ligne, l'API passerait
   par `index.php` et rendrait du HTML là où le site attend du JSON ;
4. **`/server/config` est interdit en HTTP** (`[F,L]`) : il porte la clé
   `X-API-Key`.

Le bloc WordPress `# BEGIN WordPress … # END WordPress` **est regénéré par
WordPress** quand on touche aux permaliens. N'écris jamais à l'intérieur : ce
que tu y mettrais disparaîtrait sans prévenir, un jour, sans rapport avec toi.

## Phase 1 — relever, avant d'écrire une seule ligne

**Rien ne se dépose tant que cette phase n'est pas écrite.** Le `.htaccess`
d'un mutualisé est un fichier où une erreur de syntaxe rend le site entier en
**500**, boutique comprise.

À relever, et à écrire noir sur blanc :

- **l'arborescence réelle de la racine** — où est `wp-config.php`, où est
  `server/`, où est `data/menu.json`, où est `axemusique-react/`, et si
  `frontend/` existe déjà ;
- **le `.htaccess` en place**, dans son état actuel. La copie du dépôt peut
  avoir divergé : c'est une copie, pas une source ;
- **vers quel dossier le sous-domaine pointe vraiment**, dans le panneau de
  l'hébergeur. Le propriétaire dit « la racine » ; vérifie-le, parce que la
  forme des règles en dépend entièrement. S'il pointait sur `frontend/`, tout
  ce ticket devient un `.htaccess` séparé dans `frontend/`, bien plus simple —
  et il faut alors le dire plutôt que de compliquer ;
- **si `AllowOverride` autorise `Options` et `Header`** — sur certains
  mutualisés, `Header set` sans `mod_headers` renvoie 500 ;
- **la version d'Apache** : `Require all denied` (2.4) et `Order allow,deny`
  (2.2) ne sont pas interchangeables, et `server/config/.htaccess` porte déjà
  les deux pour cette raison.

## Les trois pièges, nommés d'avance

### Piège 1 — `base: "/"` dans Vite

`vite.config.js:5` du dépôt site pose `base: "/"`. Le `index.html` construit
référence donc ses fichiers en **`/assets/index-….js`**, à la racine — pas dans
`/frontend/assets/`. Sous une racine partagée, ces requêtes tombent sur
WordPress et rendent **404**, ou pire, une page HTML servie comme du
JavaScript.

Deux issues, et tu choisis en le disant :

- **réécrire `/assets/` vers `/frontend/assets/`** sous condition d'hôte —
  c'est ce que fait déjà la production pour `/axemusique-react/` ;
- **construire avec `base: "/frontend/"`** — plus propre, mais le même bundle
  ne peut alors plus servir à la racine le jour de la bascule.

⚠️ N'oublie pas les autres fichiers du build à la racine : `favicon`, `manifest`,
`robots.txt`, les polices. Ce qui vaut pour `/assets/` vaut pour eux.

### Piège 2 — la règle SPA avale l'API

Une SPA veut « tout ce qui n'est pas un fichier → `index.html` ». Écrite
telle quelle, cette règle mange `/server/api/catalog.php`, `/data/menu.json`,
`/wp-admin`, `/wp-json`, `/wp-content`. Le site de test appellerait alors son
API et recevrait sa propre page d'accueil — **sans erreur**, ce qui est le pire
des cas : `catalog.php` répondrait 200 avec du HTML.

**Écris les exclusions AVANT la règle SPA, jamais après**, et vérifie-les une
par une en phase 3.

### Piège 3 — `wp-admin` et `wp-json`

`CLAUDE.md` l'interdit explicitement : **on ne touche pas à `wp-admin` ni à
`wp-json`** dans le `.htaccess` tant que WordPress sert le catalogue et la
médiathèque. Les exclure de TA règle n'est pas y toucher — c'est même
exactement ce qu'il faut faire.

## Phase 2 — la forme attendue

Un seul bloc, encadré par des marqueurs, **posé avant le bloc WordPress** et
après les règles `server/` :

```apache
# BEGIN AXE TEST — sous-domaine axe.5sensprod.com, 2026-08-XX
#   Retirer ce bloc entier suffit à revenir en arrière.
#   Toute règle ici est gardée par la condition d'hôte : sans elle,
#   axemusique.shop basculerait aussi.
# END AXE TEST
```

Trois exigences de forme, et elles valent plus que l'élégance :

1. **chaque `RewriteRule` du bloc est précédée de sa `RewriteCond %{HTTP_HOST}`.**
   Une `RewriteCond` ne vaut que pour la règle qui la suit immédiatement : c'est
   l'erreur classique, et elle ne se voit pas à la lecture ;
2. **le bloc est retirable d'un seul geste** — c'est ton plan de retour ;
3. **`noindex` par en-tête**, pour l'hôte de test seulement :
   `Header set X-Robots-Tag "noindex, nofollow"` sous `<IfModule mod_headers.c>`
   et condition d'hôte. Un `robots.txt` ne suffit pas : il n'empêche pas
   l'indexation d'une URL déjà connue, et le fichier serait partagé avec la
   production.

**Avant de déposer :** garde une copie horodatée du `.htaccess` en place. Le
retour en arrière doit être un remplacement de fichier, pas une réédition sous
pression.

## Phase 3 — vérifier, et ne rien conclure sans mesure

Chaque ligne du tableau est un `curl`, pas une opinion. **Les deux colonnes
comptent** : ce qui doit marcher sur le test, et ce qui ne doit pas avoir bougé
en production.

| Requête | Attendu |
|---|---|
| `https://axe.5sensprod.com/` | le `index.html` du nouveau build |
| `https://axe.5sensprod.com/produit/<un-slug-réel>` | la fiche produit, pas un 404 |
| `https://axe.5sensprod.com/assets/<un-fichier-du-build>` | 200, et `Content-Type` **JavaScript** — pas `text/html` |
| `https://axe.5sensprod.com/server/api/catalog.php?action=brands` | **du JSON**, pas la page d'accueil |
| `https://axe.5sensprod.com/data/menu.json` | le menu publié |
| en-têtes de `https://axe.5sensprod.com/` | `X-Robots-Tag: noindex` présent |
| `https://axemusique.shop/` | **inchangé** |
| `https://axemusique.shop/produit/<le même slug>` | **inchangé** |
| `https://axemusique.shop/server/api/catalog.php?action=brands` | **inchangé**, et sans `X-Robots-Tag` |
| `https://axemusique.shop/wp-admin/` | **inchangé** |

⚠️ **Une couche anti-bot filtre axemusique.shop avant Apache** et rejette
l'agent utilisateur par défaut de Go (`Go-http-client/1.1`) : 503 en HTML, le
PHP jamais atteint (constaté le 2026-08-10). Si tu scriptes ces appels, pose un
`User-Agent` explicite — sinon tu diagnostiqueras un `.htaccess` qui n'est pas
en cause.

## Phase 4 — Lighthouse, et ce qu'on en garde

C'est la raison d'être du ticket : **avoir des chiffres sur la vraie machine**,
pas sur `localhost`.

- passe sur **au moins trois pages** : l'accueil, une page catégorie fournie,
  une fiche produit avec galerie ;
- **mobile et desktop** — les deux profils, les écarts sont énormes ;
- consigne les **quatre scores** et, surtout, les métriques qui les portent :
  LCP, CLS, TBT, et le poids transféré.

Deux choses à savoir avant d'interpréter :

- **le bundle pèse 3,19 Mio** (947 Kio compressés), mesuré au dernier
  `pnpm build:client` de PocketApp sur son propre bundle — attends-toi à ce que
  Lighthouse le signale, et note-le comme un fait, pas comme une surprise ;
- **les images sont désormais servies par le mutualisé** (point 7 de
  `CLAUDE.md`), en URL complète composée par `media_urls()`. Leur poids et leur
  absence de dimensions déclarées sont les premiers suspects sur CLS et LCP.

**N'optimise rien dans cette session.** Mesurer et optimiser dans le même
mouvement produit des chiffres qu'on ne peut plus comparer à rien. Écris le
relevé ; les corrections seront un ticket qui s'appuiera dessus.

## Ce qui ne se rediscute pas

- **on ne touche pas à `wp-admin` ni `wp-json`** tant que WordPress sert le
  catalogue et la médiathèque ;
- **on n'écrit jamais dans le bloc `# BEGIN WordPress`** : il est regénéré ;
- **`server/config` reste interdit en HTTP** — il porte la clé d'API ;
- **la lecture publique n'a pas de clé** (§6 bis du contrat catalogue) : son
  consommateur est un bundle public ;
- **pas de FTP depuis PocketApp.** Le FTP est un geste manuel, documenté dans
  `server/README.md` ;
- **`server/` du dépôt est une copie de référence** : si tu modifies le
  `.htaccess` en ligne, **reporte-le dans `server/.htaccess`**, sinon la
  prochaine session lira un fichier périmé — ce qui a failli arriver ici.

## Interdits

- ne pas modifier AppPos ;
- ne pas toucher au module `stock` ;
- ne pas déposer un `.htaccess` non testé en fin de journée : une erreur de
  syntaxe rend **toute** la boutique en 500, et personne ne sera là pour le
  voir ;
- ne rien conclure d'un `curl` unique : un cache d'hébergeur peut servir
  l'ancienne réponse pendant plusieurs minutes.

## Contraintes de travail

- Français partout.
- **Distingue ce qui est lu — chemin et ligne — de ce qui est rapporté.**
  L'arborescence du serveur ne se devine pas : relève-la.
- **Vérifie en ligne, pas en relisant ton fichier de règles.** Apache ne fait
  pas ce qu'on croit avoir écrit.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Fais la **phase 1**. Écris l'arborescence relevée, le `.htaccess` en place, la
cible réelle du sous-domaine, et la forme que tu comptes donner au bloc. **Puis
arrête-toi.** Rien ne se dépose avant validation : ce fichier-là peut éteindre
la boutique.
