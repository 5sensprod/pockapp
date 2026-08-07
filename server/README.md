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
| `api/publish-menu.php` | l'endpoint de réception | oui |
| `config/config.php.example` | modèle de configuration | oui |
| `config/config.php` | la configuration réelle, **avec la clé** | **non** (`.gitignore`) |
| `config/.htaccess` | interdit l'accès HTTP au dossier de configuration | oui |
| `schema.sql` | schéma MySQL de l'option C — **non joué** | oui |

`schema.sql` est là pour que le passage de A à C reste une après-midi. Il ne
décrit rien de ce qui tourne aujourd'hui. Ne pas le jouer.

---

## Déploiement — à faire une fois, à la main

Le FTP sert à **déposer le script**, une seule fois. Il n'est pas le canal de
publication : une fois en place, PocketApp publie en POST (ticket 6).

### 1. Créer l'arborescence sur le serveur

À la racine web d'axemusique.shop (le répertoire qui contient le `.htaccess`
racine et `wp-config.php`) :

```
public_html/
  pocketapp/
    api/
      publish-menu.php        ← copie de server/api/publish-menu.php
    config/
      .htaccess               ← copie de server/config/.htaccess
      config.php              ← à créer sur place, PAS versionné
  data/
    menu.json                 ← créé par le script, pas par vous
```

Le dossier `data/` doit exister et être **inscriptible par PHP** (`755`, ou
`775` selon la configuration de l'hébergeur). C'est la seule permission à
régler.

`pocketapp/` est hors de `wp-content/`, comme `data/` : une mise à jour ou une
restauration WordPress ne les balaie pas (§1 du contrat).

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
- `target_file` : le chemin **absolu système** de `menu.json` — pas l'URL.
  Typiquement `/home/<compte>/public_html/data/menu.json`. Le chemin exact se
  lit dans le panneau de l'hébergeur, ou avec un `<?php echo __DIR__;` déposé
  puis retiré.

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

### 1. Sans clé → 401

```bash
curl -i -X POST https://axemusique.shop/pocketapp/api/publish-menu.php -d '{}'
```

### 2. En GET → 405

```bash
curl -i https://axemusique.shop/pocketapp/api/publish-menu.php
```

### 3. JSON invalide → 400

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data 'pas du json' https://axemusique.shop/pocketapp/api/publish-menu.php
```

### 4. Version de format inconnue → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":2,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[]}}' https://axemusique.shop/pocketapp/api/publish-menu.php
```

La réponse doit dire `contractVersion 2 inconnue`. C'est le point qui ne se
rattrape pas : un endpoint qui accepte une version qu'il ne connaît pas écrit un
fichier que le site ne saura pas lire, et le contrat perd sa raison d'être.

### 5. Parent orphelin → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[{"id":"a","title":"Orphelin","url":"/x","parent":"fantome","ref":null}]}}' https://axemusique.shop/pocketapp/api/publish-menu.php
```

### 6. Identifiants en double → 422

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-07T10:00:00Z","menu":{"name":"Menu Principal","items":[{"id":"a","title":"Un","url":"/1","parent":null,"ref":null},{"id":"a","title":"Deux","url":"/2","parent":null,"ref":null}]}}' https://axemusique.shop/pocketapp/api/publish-menu.php
```

### 7. Document valide → 200, et le fichier apparaît

C'est l'exemple de §2 du contrat, mot pour mot.

```bash
curl -i -X POST -H "X-API-Key: LA_CLE" --data '{"contractVersion":1,"publishedAt":"2026-08-06T14:32:11Z","menu":{"name":"Menu Principal","items":[{"id":"k3f9d2m1x8a7b0c","title":"Accueil","url":"/","parent":null,"ref":null},{"id":"p7q2w9e4r1t6y3u","title":"Instruments","url":"#","parent":null,"ref":null},{"id":"z5x8c1v4b7n0m3q","title":"Guitares","url":"/categorie-produit/guitares","parent":"p7q2w9e4r1t6y3u","ref":{"type":"category","id":"142"}}]}}' https://axemusique.shop/pocketapp/api/publish-menu.php
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
`pocketapp/` — à ne poser qu'après avoir constaté le problème.

---

## Ce que ce dossier ne fait pas

- **Pas de MySQL.** Voir `schema.sql`.
- **Pas de lecture.** Le site lit le fichier statique, pas un endpoint.
- **Pas d'historique, pas de retour arrière.** Une publication écrase la
  précédente. C'est le déclencheur n°2 de §4.5 qui fera basculer sur l'option C.
- **Pas d'authentification au-delà de `X-API-Key`.** §6 de l'audit le reporte
  explicitement.
- **Pas de dépôt FTP depuis PocketApp.** Le FTP dépose ce script, une fois.
  Ensuite, le canal est le POST.
