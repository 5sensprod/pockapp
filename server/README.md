# `server/` — code de la couche distante

Le code qui tourne sur le **serveur mutualisé** d'axemusique.shop. Il ne
s'exécute pas dans PocketApp, il est seulement versionné avec lui : voir le bloc
« Où vit le code du serveur mutualisé » de [`docs/DECISIONS.md`](../docs/DECISIONS.md).

Ce dossier est **le seul endroit du dépôt dont le contenu part par FTP**. Rien
d'ici n'est compilé, importé ou lu par le binaire Wails.

## Ce que ça fait

Le ticket 5 : recevoir le menu publié par PocketApp, le valider, l'écrire.

```
PocketApp ──POST + X-API-Key──▶ api/publish-menu.php ──écriture atomique──▶ /data/menu.json
                                                                                  │
                                              site React ◀── lecture statique ────┘
```

Aucun PHP sur le chemin de **lecture** — c'est l'option A de §4.3 de
[`03-audit-resultats.md`](../frontend/modules/site/PocketSite-docs/03-audit-resultats.md),
et c'est ce qui rend le `.htaccess` inutile à modifier (§1.1 du contrat).

La forme du document reçu est fixée par
[`05-contrat-menu.md`](../frontend/modules/site/PocketSite-docs/05-contrat-menu.md).
**Ce fichier-là fait autorité** : toute divergence avec le PHP est un bogue du
PHP.

## Contenu

| Chemin | Rôle | Versionné |
|---|---|---|
| `api/publish-menu.php` | l'endpoint de réception du menu | oui |
| `api/products-sync.php` | l'endpoint d'export du **catalogue** vers MySQL | oui |
| `api/catalog.php` | la lecture **publique** du catalogue, pour le site | oui |
| `sql/schema.sql` | les quatre tables du catalogue, à exécuter une fois | oui |
| `config/config.php.example` | modèle de configuration | oui |
| `config/config.php` | la configuration réelle, **avec la clé** | **non** (`.gitignore`) |
| `config/.htaccess` | interdit l'accès HTTP au dossier de configuration | oui |

**Deux endpoints pour le catalogue, et deux régimes.** `products-sync.php`
écrit et exige la clé ; `catalog.php` lit et n'en veut aucune — son consommateur
est un bundle public, où un secret serait lisible de tous. Voir le bloc
« L'endpoint de lecture du catalogue est public et sans clé » de
[`docs/DECISIONS.md`](../docs/DECISIONS.md).

**`sql/schema.sql` est revenu le 11 août 2026, pour le catalogue** — les quatre
tables `ax_products`, `ax_categories`, `ax_brands` et `ax_product_categories`.
Ce n'est pas le retour de celui d'avant : le paragraphe ci-dessous annonçait
justement un schéma « qui n'a rien à voir », et c'est celui-là. La clé y est
`legacy_id`, jamais l'identifiant PocketBase — §1 du contrat.

**`schema.sql` a été supprimé le 10 août 2026.** Il décrivait le stockage du
*menu* en MySQL — l'option C de §4.3 de l'audit — et cette piste est abandonnée :
le menu tient en quelques kilo-octets, le fichier statique lui convient, et
aucun des quatre déclencheurs de §4.5 n'a été atteint après mise en production.

Le garder aurait été trompeur pour la mission suivante — sortir le **catalogue**
de WooCommerce —, qui aura bien besoin d'une base SQL, mais d'un schéma qui n'a
rien à voir avec celui-là. Voir le bloc « Le menu reste en JSON statique » de
`docs/DECISIONS.md`.

---

## Déploiement — fait le 7 août 2026

**Déployé et validé en conditions réelles sur le mutualisé le 7 août 2026.** Ce
qui suit est la marche à suivre telle qu'elle a effectivement fonctionné, pas
une proposition. Le FTP sert à **déposer le script**, une seule fois ; il n'est
pas le canal de publication — une fois en place, PocketApp publie en POST
(ticket 6).

### 1. L'arborescence en ligne

À la racine web d'axemusique.shop (le répertoire qui contient le `.htaccess`
racine, `index.php` et `wp-config.php`) :

```
racine web/
  .htaccess
  index.php
  wp-config.php
  wp-admin/  wp-content/  wp-includes/

  axemusique-react/         ← le frontend React compilé (existant)
    index.html
    assets/

  server/                   ← la couche serveur PocketApp
    api/
      publish-menu.php      ← copie de server/api/publish-menu.php
    config/
      .htaccess             ← copie de server/config/.htaccess
      config.php            ← créé sur place, PAS versionné

  data/
    menu.json               ← créé par le script, pas par vous
```

**Le dossier en ligne porte le même nom que celui du dépôt : `server/`.** C'est
délibéré — un fichier se redépose au même chemin sans traduction mentale. Le
`/pocketapp/` d'une version antérieure de ce document n'a pas été retenu ; il
n'apportait rien.

Le dossier `data/` doit exister et être **inscriptible par PHP** (`755`, ou
`775` selon la configuration de l'hébergeur). C'est la seule permission à
régler. **`menu.json` n'est pas à créer à la main** : le script l'écrit — c'est
vérifié, la première publication réelle l'a créé de zéro.

`server/` est hors de `wp-content/`, comme `data/` : une mise à jour ou une
restauration WordPress ne les balaie pas (§1 du contrat).

### Les deux URL

```
POST https://axemusique.shop/server/api/publish-menu.php    ← publication
GET  https://axemusique.shop/data/menu.json                 ← lecture statique
```

La seconde est celle du contrat (§1), et elle ne bouge pas. La première est à
reporter dans PocketApp au ticket 6.

### 2. Fabriquer une clé

Sur le poste, ou dans n'importe quel PHP :

```bash
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

À défaut de PHP local :

```bash
openssl rand -hex 32
```

### 3. Écrire `config.php` sur le serveur

Copier `config/config.php.example` en `config/config.php` **sur le serveur**,
puis remplir deux valeurs :

- `api_key` : la clé fabriquée à l'étape 2 ;
- `target_file` : le chemin **système** de `menu.json` — pas l'URL. C'est le
  fichier physique, dont `https://axemusique.shop/data/menu.json` est la
  représentation publique.

  Avec l'arborescence retenue, `config.php` étant dans `server/config/`, la
  forme robuste est **dérivée de `__DIR__`** plutôt qu'écrite en dur :

  ```php
  'target_file' => __DIR__ . '/../../data/menu.json',
  ```

  Un chemin relatif nu (`../../data/menu.json`) fonctionne aussi, mais il dépend
  du répertoire courant de PHP, que l'hébergeur peut changer sans prévenir.
  `__DIR__` ne dépend de rien. Un chemin absolu en dur
  (`/home/<compte>/public_html/data/menu.json`) marche également et casse le
  jour d'un changement d'hébergeur.

La clé est ensuite à reporter côté PocketApp au **ticket 6**. Ce dépôt ne la
contient jamais : `config/config.php` est ignoré par Git.

### 4. Vérifier que la desserte statique est bien là

Le `.htaccess` racine du serveur distant a été lu à l'occasion du ticket 3 : ses
deux règles de réécriture sont gardées par `RewriteCond %{REQUEST_FILENAME} !-f`,
donc un fichier réellement présent est servi tel quel. Rien à modifier. Le test
de l'étape suivante le confirme de toute façon.

---

## Vérification — comment savoir que ça marche

Rien n'appelle l'endpoint avant le ticket 6 : ces tests sont le seul moyen de
constater qu'il fonctionne. Remplacer `LA_CLE` par la clé de `config.php`.

Les six premiers doivent **échouer**. C'est le but : un endpoint qui accepte
tout n'est pas un endpoint validé.

> **Passés en réel sur le mutualisé le 7 août 2026.** Constaté : `405` sur GET
> et HEAD, `401` sans clé et avec une mauvaise clé, `400` sur JSON invalide,
> `422` sur `contractVersion: 2` avec le message
> `contractVersion 2 inconnue de ce script (connues : 1).`, et `200` sur un
> document conforme — `{"ok":true,"bytes":340,"items":1,…}`, avec création de
> `data/menu.json` de zéro.
>
> Ce qu'établit la publication réussie, au-delà du code : Apache dessert bien
> `publish-menu.php`, PHP lit `server/config/config.php`, **l'hébergeur propage
> l'en-tête `X-API-Key`** (le repli `RewriteRule` décrit plus bas n'est pas
> nécessaire), `data/` est inscriptible, et le renommage atomique aboutit.
>
> Sous PowerShell, voir la section dédiée plus bas : `curl` y est un alias
> d'`Invoke-WebRequest` et les commandes ci-dessous ne marchent pas telles
> quelles.

### 1. Sans clé → 401

```bash
curl -i -X POST https://axemusique.shop/server/api/publish-menu.php -d '{}'
```

### 2. En GET → 405

```bash
curl -i https://axemusique.shop/server/api/publish-menu.php
```

### 3. JSON invalide → 400

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data 'pas du json' https://axemusique.shop/server/api/publish-menu.php
```

### 4. Version de format inconnue → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":2,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[]}}' https://axemusique.shop/server/api/publish-menu.php
```

La réponse doit dire `contractVersion 2 inconnue`. C'est le point qui ne se
rattrape pas : un endpoint qui accepte une version qu'il ne connaît pas écrit un
fichier que le site ne saura pas lire, et le contrat perd sa raison d'être.

### 5. Parent orphelin → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[{"id":"a","title":"Orphelin","url":"/x","parent":"fantome","ref":null}]}}' https://axemusique.shop/server/api/publish-menu.php
```

### 6. Identifiants en double → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[{"id":"a","title":"Un","url":"/1","parent":null,"ref":null},{"id":"a","title":"Deux","url":"/2","parent":null,"ref":null}]}}' https://axemusique.shop/server/api/publish-menu.php
```

### 7. Document valide → 200, et le fichier apparaît

C'est l'exemple de §2 du contrat, mot pour mot.

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-06T14:32:11Z","menu":{"name":"Menu Principal","items":[{"id":"k3f9d2m1x8a7b0c","title":"Accueil","url":"/","parent":null,"ref":null},{"id":"p7q2w9e4r1t6y3u","title":"Instruments","url":"#","parent":null,"ref":null},{"id":"z5x8c1v4b7n0m3q","title":"Guitares","url":"/categorie-produit/guitares","parent":"p7q2w9e4r1t6y3u","ref":{"type":"category","id":"142"}}]}}' https://axemusique.shop/server/api/publish-menu.php
```

Réponse attendue : `{"ok":true,"bytes":…,"items":3,…}`.

### 8. Le fichier est lisible en statique, sans PHP

```bash
curl -i https://axemusique.shop/data/menu.json
```

Doit renvoyer `200` et le JSON. Si c'est une page WordPress ou l'`index.html` de
React qui revient, le fichier n'a pas été écrit là où le `.htaccess` le laisse
passer : vérifier `target_file`.

### 9. L'écriture est atomique

Impossible à observer en une commande ; c'est une propriété du code, pas un
comportement à provoquer. Ce qui se vérifie : republier l'étape 7 en boucle
pendant qu'on lit l'étape 8 en boucle ne doit **jamais** renvoyer un JSON
tronqué. Le mécanisme est `tempnam()` dans le répertoire de destination, puis
`rename()` — atomique parce que source et cible sont sur le même système de
fichiers.

Si `target_file` était un jour déplacé sur un autre point de montage, cette
garantie tomberait sans erreur visible.

### En cas de refus incompris

Chaque réponse d'erreur porte un tableau `errors` avec **toutes** les
divergences trouvées, pas seulement la première. C'est ce qu'il faut lire.

Si l'authentification échoue alors que la clé est bonne : certains mutualisés ne
propagent pas les en-têtes non standard. Le script regarde `HTTP_X_API_KEY`,
`REDIRECT_HTTP_X_API_KEY` et `apache_request_headers()`. Si aucune des trois ne
porte la valeur, il faut une ligne
`RewriteRule .* - [E=HTTP_X_API_KEY:%{HTTP:X-API-Key}]` dans un `.htaccess` de
`server/` — à ne poser qu'après avoir constaté le problème. **Constaté le 7 août
2026 : ce n'est pas nécessaire sur cet hébergeur**, l'en-tête passe.

---

## Tester depuis Windows PowerShell

Deux pièges, tous deux rencontrés le 7 août 2026.

**`curl` est un alias d'`Invoke-WebRequest`.** Écrire `curl.exe` explicitement,
sinon les options ci-dessus ne veulent rien dire.

**Le quoting PowerShell abîme un gros JSON passé en ligne de commande.** Passer
par un fichier. La méthode qui a fonctionné :

```powershell
$body = @{ contractVersion = 1; publishedAt = "2026-08-07T16:42:00Z"; menu = @{ name = "Menu Principal"; items = @(@{ id = "accueil"; title = "Accueil"; url = "/"; parent = $null; ref = $null }) } } | ConvertTo-Json -Depth 10 -Compress
```

```powershell
[System.IO.File]::WriteAllText("$PWD\body.json", $body, [System.Text.UTF8Encoding]::new($false))
```

L'encodeur explicite **sans BOM** n'est pas un détail : `Out-File` ajoute un BOM
UTF-8 que `json_decode()` refuse, et l'endpoint répond alors `400 JSON invalide`
sur un document pourtant correct.

```powershell
curl.exe -i -H "X-API-Key: $apiKey" -H "Content-Type: application/json" --data-binary "@body.json" "https://axemusique.shop/server/api/publish-menu.php"
```

Charger la clé sans l'écrire dans l'historique du terminal :

```powershell
$apiKey = Read-Host "Cle API"
```

Puis contrôler sans l'afficher — une clé issue d'`openssl rand -hex 32` fait 64
caractères :

```powershell
$apiKey.Length
```

---

## Une couche anti-bot filtre les requêtes avant Apache

**Constaté le 10 août 2026, en cherchant pourquoi la publication échouait alors
que tous les tests `curl` passaient.**

L'hébergement place un filtre devant Apache — ses en-têtes `X-WS-Origin` et
`X-WS-RateLimit-*` apparaissent sur toute réponse. Il **rejette l'agent
utilisateur par défaut de Go**. À clé, URL et corps rigoureusement identiques :

| `User-Agent` | Réponse |
|---|---|
| `Go-http-client/1.1` | `503` + page HTML « The page is temporarily unavailable » |
| `curl/8.0` | `422` JSON — la réponse normale de l'endpoint |
| `PocketApp/1.0 (publication menu)` | `422` JSON |

**Le symptôme est trompeur et coûteux à diagnostiquer** : le PHP n'est jamais
atteint, donc ni son journal, ni ses validations, ni aucun des tests de la
section précédente ne peuvent en témoigner — ils passent tous par `curl`, qui
envoie son propre agent. Côté PocketApp, cela remontait en « réponse inattendue
du serveur de publication ».

`backend/routes/site_publish_routes.go` pose donc un `User-Agent` explicite.
**Tout nouvel appel vers ce domaine doit en faire autant.**

**Ce que ça implique pour la suite :** l'endpoint est protégé par une couche
qu'on ne contrôle pas et dont les règles peuvent changer sans préavis — rythme
des requêtes, taille du corps, agent. La parade n'est pas de la deviner, c'est
de **remonter le corps de la réponse** plutôt qu'un message résumé, ce que fait
désormais la chaîne Go → React.

---

## Hygiène

- **Aucun script de diagnostic ne reste en ligne.** Un `debug-key.php` ou
  équivalent déposé le temps d'un test se supprime le test fini. Il n'y en a
  pas dans ce dépôt, et il ne doit pas y en avoir sur le serveur.
- **`server/config/config.php` ne remonte jamais dans Git** (`server/.gitignore`)
  et son dossier reste interdit en HTTP (`config/.htaccess`).
- **Une clé vue ailleurs que dans `config.php` est compromise** — terminal
  partagé, capture d'écran, ticket, conversation, historique de commandes. On la
  remplace, on ne la surveille pas.

---

## Ce que ce dossier ne fait pas

- **Pas de MySQL.** Le menu est un fichier, et le reste.
- **Pas de lecture.** Le site lit le fichier statique, pas un endpoint.
- **Pas d'historique, pas de retour arrière.** Une publication écrase la
  précédente. C'est le déclencheur n°2 de §4.5 qui fera basculer sur l'option C.
- **Pas d'authentification au-delà de `X-API-Key`.** §6 de l'audit le reporte
  explicitement.
- **Pas de dépôt FTP depuis PocketApp.** Le FTP dépose ce script, une fois.
  Ensuite, le canal est le POST.
