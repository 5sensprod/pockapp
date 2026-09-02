# Sauvegarde de la base du client vers le mini-SaaS

**Mise en place : 1er septembre 2026.** Pas encore en production — la mise en
service demande trois gestes, listés au §7.

Deux besoins, un seul mécanisme :

1. **sauvegarder** ce qui compte, factures en tête ;
2. **récupérer les données réelles du client** pour reproduire un bogue en
   développement sur des données représentatives.

Un snapshot complet de la base sert les deux. Un flux incrémental par
collections aurait servi le premier et mal le second : la copie n'aurait pas
été une PocketBase, et la rejouer aurait demandé un importateur de plus.

---

## 1. Ce qui part, et ce qui ne part pas

| | Dans le snapshot | Pourquoi |
|---|---|---|
| `data.db` | **oui**, compacté par `VACUUM INTO` | c'est la base : ventes, factures, Z, catalogue, clients |
| `storage/` (1,7 Gio d'images) | **non** | déjà miroité vers axemusique.shop (point 7 de `CLAUDE.md`). L'ajouter multiplierait par cent le volume pour dupliquer un miroir existant |
| `logs.db` | **non** | journal technique de PocketBase, sans valeur métier |

**Conséquence à connaître avant de la découvrir :** une base restaurée en
développement affiche les fiches produits **sans leurs images**. Les données
sont entières, les octets des images ne le sont pas.

### Mesuré sur la base réelle du client

Le 1er septembre 2026, sur le miroir du 31 août
(`pb_data_sans_storage\lundi_31_08`, 1236 factures, 65 rapports Z,
3028 produits), par `TestChaineSurBaseReelle` :

| | |
|---|---|
| `data.db` d'origine | 15 184 Kio |
| après `VACUUM INTO` | 14 760 Kio |
| **chiffré transporté** | **3 754 Kio, en 4 tranches** |
| fabrication | 1,5 s |
| restauration | 228 ms |
| factures relues après restauration | **1236** |

Soit **~3,7 Mio par sauvegarde**. Une rétention de 14 snapshots occupe une
cinquantaine de Mio sur le mutualisé, et une sauvegarde quotidienne ne pèse sur
rien.

Et `logs.db`, exclu, pèse **28,9 Mio** dans cette même base — presque le double
des données utiles. L'exclure n'était pas un détail.

---

## 2. Pourquoi `VACUUM INTO`, et pas une copie de fichier

C'est le choix qui porte tout le reste.

`data.db` vit en **mode WAL** : à un instant donné, une partie des écritures
est dans `data.db-wal` et **pas** dans `data.db`. D'où deux façons de se
tromper, toutes deux silencieuses :

- copier le seul `data.db` donne une base **en retard** ;
- copier les trois fichiers pendant qu'une vente s'écrit donne une base
  **incohérente**.

`VACUUM INTO` s'exécute dans une transaction de lecture : SQLite écrit une base
neuve, complète et cohérente à l'instant du début, WAL replié dedans. Les
écritures concurrentes **ne sont pas bloquées** — un lecteur n'empêche pas
l'écrivain en mode WAL —, elles sont simplement absentes du snapshot, ce qui
est exactement ce qu'on attend d'une sauvegarde datée.

C'est ce qui rend l'opération transparente pour la caisse, et c'est vérifié
plutôt qu'affirmé : `backend/backup/snapshot_test.go` monte une vraie
PocketBase, la sauvegarde, la restaure, la **redémarre** et y relit ses lignes.

---

## 3. La chaîne

```
poste du client                                   mini-SaaS (mutualisé PHP)
───────────────                                   ─────────────────────────
VACUUM INTO                                       init     → dossier + manifeste
    ↓                                             etat     → tranches déjà là
  gzip                                            tranche  → écrit, rename atomique
    ↓                                             valider  → assemble, vérifie, publie
AES-256-GCM par tranches de 1 Mio  ──HTTPS──▶              → purge les anciens
```

La clé de chiffrement **ne quitte jamais le poste**. Le serveur reçoit et
stocke de l'opaque : il ne sait pas ce qu'est une base PocketBase et n'a pas
les moyens de le savoir. **Une fuite de l'hébergement mutualisé ne livre aucune
facture.** C'est la propriété centrale du dispositif, et elle tient
entièrement au fait que la clé ne monte jamais — ne pas ajouter de champ
« clé » au manifeste.

### Pourquoi des tranches scellées séparément

Un envoi se fait en plusieurs requêtes HTTP, et on veut reprendre après une
coupure sans tout refaire. Chaque tranche est donc scellée seule — ce qui
ouvre trois attaques classiques, fermées en liant à chaque tranche
(dans l'AAD) :

| Dans l'AAD | Ce que ça interdit |
|---|---|
| l'identifiant du snapshot | mélanger deux snapshots |
| le rang de la tranche | les réordonner |
| un marqueur de fin | **tronquer le flux** |

Le troisième est le seul qui protège vraiment des factures : il empêche qu'un
envoi coupé au milieu passe pour une sauvegarde complète. Une sauvegarde qui se
restaure à moitié en silence est pire que pas de sauvegarde, parce qu'on lui
fait confiance. Gardien : `TestFluxTronqueEstRefuse`.

---

## 4. Ce que le serveur peut vérifier, et ce qu'il ne peut pas

Il **ne peut pas** vérifier l'empreinte du clair : il n'a pas la clé, c'est le
but. Il vérifie donc ce qui est vérifiable sans elle — le compte des tranches,
leur taille, l'empreinte de chaque tranche chiffrée, et la taille totale
assemblée contre celle annoncée.

La vérification du clair a lieu **à la restauration**, contre `plain_sha256`
du manifeste. Les deux ensemble couvrent la chaîne entière. `snapshot-restore`
affiche l'empreinte obtenue et demande explicitement de la comparer.

---

## 5. Transparence pour le client

Cinq règles, tenues dans `backend/backup/planificateur.go` :

1. **tout est dans une goroutine détachée** — aucun chemin de la caisse
   n'attend jamais une sauvegarde ;
2. **une seule à la fois** — sans ce verrou, un réseau lent empilerait les
   envois, et le symptôme serait « la caisse rame » ;
3. **une échéance manquée ne se rattrape pas en rafale** — un poste éteint
   deux semaines ne déclenche pas quatorze sauvegardes ;
4. **un échec est journalisé, jamais affiché** — un message d'erreur réseau au
   comptoir est une nuisance, pas une information ;
5. **le premier passage est différé de 10 minutes** — au démarrage, le poste
   ouvre sa journée et monte son temps réel ; c'est le seul moment où la
   sauvegarde se verrait.

L'échéance se compte depuis le dernier **succès**, pas la dernière tentative :
sinon une série d'échecs réseau repousserait indéfiniment la sauvegarde et le
poste finirait sans copie sans que personne ne l'ait décidé.

---

## 6. Restaurer

**Il n'y a aucun chemin de restauration dans l'application du client**, et il
ne doit pas y en avoir : restaurer par-dessus une base vivante efface des
ventes. La restauration est un geste de développement.

```bash
go run ./backend/cmd/snapshot-restore -list
```

```bash
go run ./backend/cmd/snapshot-restore -client <CLIENT_ID> -snapshot <SNAPSHOT_ID> -out ./pb_data_client
```

L'outil **refuse** d'écrire dans un dossier contenant déjà un `data.db`, et
refuse nommément `%LOCALAPPDATA%\PocketReact\pb_data` — celui qu'on risque le
plus de désigner par habitude, un soir de diagnostic.

Il faut **deux clés**, et ce n'est pas une lourdeur : ce sont deux serrures
distinctes, et c'est ce qui fait tenir le dispositif.

| Clé | Donne | Passée par |
|---|---|---|
| **super-admin** | l'accès aux OCTETS — lister, télécharger, supprimer | `-super-key` ou `BACKUP_SUPER_KEY` |
| **chiffrement** | l'accès au CONTENU | `-key` ou `BACKUP_ENCRYPTION_KEY` |

Avoir la première sans la seconde ne donne qu'un fichier illisible. C'est
exactement ce qu'on veut : le mini-SaaS détient les octets et ne peut rien en
faire.

(`-file` restaure depuis un `.bin` déjà téléchargé, sans toucher au serveur.)

### ⚠️ Sauvegarder la clé

La clé AES-256 est **générée automatiquement au premier snapshot** et rangée
dans le SecretManager du poste. Ce choix évite qu'une installation neuve reste
sans sauvegarde faute d'un clic que personne ne fera. Son prix :

> **Perdre la clé, c'est perdre toutes les sauvegardes.** Elle doit être
> conservée ailleurs que sur le poste qu'elle sauvegarde. Un poste dont le
> disque meurt emporte sa clé et rend son propre dépôt distant illisible.

C'est le point de rupture du dispositif. Il est ici et nulle part ailleurs.

---

## 7. Mise en service — ce qui reste à faire

### 7.1 HTTPS

**HTTPS est actif sur `pocketapp.5sensprod.com`** (rapporté par le
propriétaire, 1er septembre 2026). Rien à faire.

⚠️ Le commentaire du `.htaccess` du mini-SaaS dit l'inverse — « redirection
HTTPS désactivée […] réactivez ce bloc lorsque le certificat SSL fonctionnera »
— et il est **périmé**. Ne pas s'y fier ; il a déjà induit en erreur.

La redirection `RewriteRule` reste, elle, commentée. La rétablir n'est **pas**
requis par la sauvegarde (les deux bouts exigent déjà HTTPS et refusent le
clair : `NouveauClient` côté Go, `estHttps()` côté PHP) et n'est pas anodin :
un `301` sur `/api/` casserait tout appelant HTTP qui ne suit pas les
redirections en POST — les postes sur un ancien build, notamment. À décider
séparément.

### 7.2 Vérifier que le dépôt n'est pas servi par Apache

`BACKUP_ROOT` vaut par défaut `<un cran au-dessus de la racine web>/pocketapp-backups`.
Ce chemin dépend de l'arborescence réelle de l'hébergement, que je n'ai pas pu
lire d'ici.

`racineSauvegardes()` pose un `.htaccess` de refus **et** vérifie que le
dossier n'est pas sous `DOCUMENT_ROOT`, en échouant bruyamment si c'est le cas
— une ceinture et des bretelles, parce que le `.htaccess` ne sert à rien si
l'hébergeur applique `AllowOverride None`, ce qui ne se voit pas depuis PHP.

**À faire malgré tout, après le premier dépôt :** demander l'URL d'un
`snapshot.bin` dans un navigateur et **exiger un 403 ou un 404**.

### 7.3 Les trois gestes

1. jouer `schema-backups.sql` sur la base du mini-SaaS ;
2. déposer `api/backup.php`, `api/backup-config.php`, `api/admin/backups.php` ;
3. côté poste, renseigner `backup_url` et `backup_api_key` dans les réglages.

**Deux pièges de MySQL, rencontrés le 1er septembre 2026 à cette étape.** Ils
sont désamorcés dans `schema-backups.sql` et commentés sur place ; ne pas les
défaire en « simplifiant » le fichier.

- `ADD COLUMN IF NOT EXISTS` est une extension **MariaDB**. En MySQL, `#1064`.
  D'où le détour par `information_schema` dans une procédure — c'est la seule
  façon portable de rendre un `ALTER` rejouable.
- `created_at TIMESTAMP NOT NULL` étant la **première** colonne TIMESTAMP de la
  table, MySQL lui ajoute silencieusement `ON UPDATE CURRENT_TIMESTAMP` (quand
  `explicit_defaults_for_timestamp` est à OFF, ce qui est courant sur un
  mutualisé). Or la validation fait un `UPDATE` sur cette ligne : l'instant du
  `VACUUM` aurait été **réécrit à l'heure de la validation**, à chaque
  snapshot, sans erreur ni trace — date fausse, et ordre de la rétention faux
  avec elle. Les deux colonnes sont donc en `DATETIME`, écrites explicitement.

Et toutes les dates de cette table sont en **UTC** — `UTC_TIMESTAMP()` côté
serveur, `gmdate()` côté poste. `clients.last_seen_at` reste en heure locale :
c'est une colonne préexistante, écrite ainsi par les autres endpoints.

`backup_api_key` est la clé du client dans la table `clients` : c'est **elle**
qui détermine l'espace de dépôt. Le serveur ne lit jamais d'identifiant de
client dans le corps d'une requête, il le **déduit** de la clé — un poste ne
peut donc pas écrire dans l'espace d'un autre, faute de paramètre par lequel le
demander.

### 7.4 Non vérifié d'ici

- Le `post_max_size` réel de l'hébergement. Les tranches font 1 Mio, sous le
  défaut usuel de 8 Mio, mais ça n'a pas été **mesuré**.
- Le protocole HTTP n'a pas été exercé contre le vrai serveur : il demande
  MySQL et un dépôt FTP. La chaîne locale, elle, est mesurée sur la base réelle
  du client (§1).

---

## 7 bis. Le socle de développement, et ce qu'il devient

`%LOCALAPPDATA%\PocketReact\pb_data_sans_storage\lundi_31_08` est le miroir
de la base du client arrêté au 31 août 2026, repris à la main.

**Il n'y a aucune logique de delta à écrire.** Un snapshot est complet : dès que
le poste du client aura déposé le sien, il ne complétera pas le socle, il le
**remplacera**. Rapatrier « ce que le client a fait depuis » et rapatrier toute
sa base sont ici la même opération, pour 3,7 Mio — c'est précisément ce que le
choix du snapshot complet achète, et pourquoi aucun mapping par collection n'a
été écrit.

Le socle garde deux usages : travailler tout de suite sans attendre la mise en
service, et servir de témoin de mesure — c'est lui que
`TestChaineSurBaseReelle` traverse.

---

## 7 ter. Les trois clés, et pourquoi elles sont trois

C'est le point qu'on se remet le plus souvent en tête, alors le voici en un
tableau.

| Clé | Où elle vit | Ce qu'elle permet | Ce qu'elle ne permet PAS |
|---|---|---|---|
| **API du client** (`clients.api_key`) | sur le poste, et en clair dans le mini-SaaS | **déposer** un snapshot, dans SON espace | ni lire, ni télécharger, ni supprimer |
| **super-admin** (`backup_super_keys`) | chez l'éditeur ; en **empreinte** côté serveur | lister, télécharger, supprimer, chez TOUS les clients | **déposer** — elle ne peut pas fabriquer de fausse sauvegarde |
| **chiffrement** | sur le poste, JAMAIS sur le serveur | **lire** le contenu | rien d'autre : elle n'ouvre aucun accès réseau |

Les pouvoirs ne se croisent jamais, et c'est délibéré : un poste compromis ne
rapatrie pas l'historique, une clé super-admin volée ne falsifie rien, et le
mini-SaaS entier ne lit rien.

L'empreinte plutôt que la clé, pour la super-admin : `clients.api_key` est en
clair parce que l'interface doit la réafficher pour configurer un poste ;
celle-ci se copie une fois et ne se réaffiche jamais. La stocker en clair
ferait d'une lecture de cette base un accès à toutes les sauvegardes de tous
les clients.

Chaque usage d'une clé super-admin est **journalisé** (`backup_super_log`) —
lectures comprises. Pour une suppression, c'est la seule trace qui restera.

---

## 8. Où est quoi

| Fichier | Rôle |
|---|---|
| `backend/backup/snapshot.go` | `VACUUM INTO`, gzip, chiffrement, et le chemin inverse |
| `backend/backup/envoi.go` | le protocole côté poste, avec reprise |
| `backend/backup/planificateur.go` | l'horloge, le verrou, l'état |
| `backend/backup/snapshot_test.go` | les gardiens : aller-retour, troncature, mauvaise clé, réordonnancement |
| `backend/routes/backup_routes.go` | `GET /api/backup/status`, `POST /api/backup/run` |
| `backend/cmd/snapshot-restore/` | la restauration, hors application |
| `pocketApp_minisaas/api/backup.php` | la réception |
| `pocketApp_minisaas/api/backup-config.php` | où atterrissent les octets, et les bornes |
| `pocketApp_minisaas/api/backup-admin.php` | lister, télécharger, supprimer — par clé super-admin, pour les OUTILS |
| `pocketApp_minisaas/api/admin/backups.php` | idem sous session admin, pour le navigateur |
| `pocketApp_minisaas/api/admin/backup-diag.php` | diagnostic de mise en service |
| `pocketApp_minisaas/schema-super-keys.sql` | les tables `backup_super_keys` et `backup_super_log` |
| `pocketApp_minisaas/schema-backups.sql` | la table `backups` |
