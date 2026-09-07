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

**Il n'y a aucun chemin de restauration COMPLÈTE dans l'application du
client**, et il ne doit pas y en avoir : remplacer une base vivante efface des
ventes. La restauration complète est un geste de développement.

⚠️ Depuis le 6 septembre 2026, il existe un second chemin, qui n'est PAS
celui-ci : la **restauration sélective** (§11), à chaud, qui ne ramène qu'une
liste blanche de champs et ne peut pas toucher un document commercial. Les deux
ne se confondent pas, et l'écran non plus : l'une est dans les réglages, sous
« Sauvegarde » ; l'autre dans le module `site`, sous « Restauration
sélective ».

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

### ⛔ La clé de chiffrement ne doit JAMAIS valoir la clé API

C'est le défaut le plus dangereux rencontré sur ce mécanisme, parce qu'il **ne
produit aucun symptôme** : les sauvegardes partent, se restaurent, les
empreintes concordent — et la protection n'existe plus.

`clients.api_key` est stockée **en clair** dans la base du mini-SaaS et
affichée dans son interface d'administration. Si la clé de chiffrement porte la
même valeur, **le serveur détient de quoi déchiffrer ce qu'il stocke**, et la
propriété centrale du dispositif tombe.

Arrivé le 2 septembre 2026 : les deux champs se ressemblent — 64 caractères
hexadécimaux chacun — et rien à l'écran ne les distinguait.

Trois gardes désormais :

- **refus à la saisie**, dans les deux sens (poser une clé API égale à la clé
  de chiffrement est refusé aussi) ;
- **refus à l'exécution** (`clesDistinctes`, `planificateur.go`) — c'est celui
  qui compte, il rattrape un poste déjà configuré de travers, et il vaut mieux
  ne pas sauvegarder du tout que sauvegarder en donnant la clé au serveur ;
- **quatre tests** (`cles_test.go`), dont la comparaison insensible à la casse :
  `AB12` et `ab12` désignent les mêmes octets, une comparaison stricte
  rouvrirait le trou.

**Réparation, si le cas se présente** : générer une clé neuve, la poser sur
tous les postes, puis **effacer tout ce qui est déjà sur le serveur** —
snapshots et images. Ce qui a été déposé sous l'ancienne valeur reste
déchiffrable par quiconque lit la base du mini-SaaS.

### L'empreinte de clé

Chaque snapshot annonce l'empreinte de la clé qui l'a scellé — huit caractères
dérivés par SHA-256, jamais la clé. L'écran marque alors les lignes illisibles
ici :

```
20260902T163012Z-…  AXE-CAISSE                      ← lisible
20260902T161045Z-…  AXE-CAISSE  ⚠ autre clé (ab12cd34)
```

Sans elle, une clé qui ne correspond pas ne se manifeste que par « sceau
invalide » au moment de restaurer : un message exact, et inutilisable — il ne
dit ni quelle clé manque, ni lesquels des snapshots sont lisibles. Deux postes
peuvent aussi comparer leurs empreintes pour vérifier qu'ils partagent la même
clé, sans jamais se la montrer.

---

Chaque usage d'une clé super-admin est **journalisé** (`backup_super_log`) —
lectures comprises. Pour une suppression, c'est la seule trace qui restera.

---

## 9. Le miroir des images — n'envoyer que ce que l'autre n'a pas

Le snapshot ne porte **aucun octet d'image** (§1). Le miroir comble ce trou,
sans jamais retransporter les 1,6 Gio que l'éditeur détient déjà.

### Trois faits mesurés le 2 septembre 2026

| | |
|---|---|
| fichiers dans `storage/` | **9422** (4712 originaux + autant de `.attrs`) |
| volume | **1591 Mio** |
| vignettes `thumbs_*` | 96 — **dérivées, non transportées** |

### Le chemin est l'identité

PocketBase suffixe chaque fichier d'un aléa à l'upload
(`methode_1754471692119_wDmqA0HWAM.png`) : remplacer une image n'écrase pas le
fichier, elle en crée un autre. **Un chemin donné a donc toujours le même
contenu.**

C'est ce qui permet d'inventorier **sans lire un seul octet**. Sans cette
propriété, chaque synchronisation devrait hacher 1,6 Gio sur une caisse en
service. ⚠️ **C'est LA supposition à revérifier** avant toute évolution : si
PocketBase réécrivait un jour un fichier en place, il faudrait une empreinte.

### Pourquoi un inventaire, et pas une date de coupure

« Les images ajoutées depuis le 29 août » suppose de se fier aux dates des
fichiers. Or copier ou restaurer un `storage/` les remet à zéro — et le jour où
ça arrive, on ne s'en aperçoit pas : on croit sauvegarder et on ne sauvegarde
rien. Le serveur tient donc la liste de ce qu'il **connaît**, et le poste
n'envoie que l'écart.

### Le socle : la ligne sans octets

Une ligne de `backup_storage` peut exister avec `has_bytes = 0` : le serveur
**sait** que le fichier existe, ne l'a pas, et ne le demandera jamais — parce
que l'éditeur le détient. C'est toute l'astuce du dispositif.

> ⚠️ **Déclarer le socle AVANT la première sauvegarde d'un poste.** Sans lui,
> celui-ci croit devoir tout envoyer et commence à téléverser 1,6 Gio par
> paquets de 500 fichiers.

Déclarer est réservé à la **clé super-admin** : un poste qui pourrait affirmer
« j'ai déjà tout » cesserait de sauvegarder ses images sans que personne ne le
remarque. Seul celui qui détient vraiment les fichiers peut l'affirmer.

### Ce que ça donne

Mesuré le 2 septembre 2026, bout en bout : socle déclaré (9422 chemins, zéro
octet), une image ajoutée à un produit, sauvegarde → **2 fichiers envoyés**
(l'image et son `.attrs`). Produit supprimé, base restaurée, « Rapatrier les
images » → **2 fichiers écrits**, vérifiés sur le disque.

Le `.attrs` part avec l'image, et ce n'est pas un détail : il porte le type
MIME, et sans lui PocketBase sert le fichier en `application/octet-stream`.

### Un piège de vérification, rencontré le jour même

Après restauration, la fiche produit **affichait son image alors que le fichier
n'était pas sur le disque** : le navigateur la resservait depuis son cache,
l'URL étant identique. Un faux positif parfait sur la seule chose que le test
devait prouver.

**Vérifier sur le système de fichiers, jamais à l'écran** — et recharger par
Ctrl+F5.

### Supprimer

Un produit supprimé emporte son image **localement**, mais **le miroir la
garde** : un snapshot antérieur la référence encore, et le serveur ne peut pas
le savoir — il ne sait pas lire ce qu'il stocke. La purge du miroir est donc un
geste séparé et explicite (`storage-supprimer`), qui désigne les chemins un par
un.

---

## 10. Une sauvegarde après chaque rapport Z

Depuis le 2 septembre 2026, un rapport Z scellé déclenche une sauvegarde
(`backend/backup/apres_z.go`).

**Pourquoi le Z** : c'est le seul instant où l'on SAIT qu'une journée est
finie. La sauvegarde qui le suit capture une journée entière et cohérente,
plutôt qu'un instant arbitraire choisi par une horloge.

**Complément, jamais remplacement** : un poste dont la journée n'est jamais
clôturée doit continuer d'être sauvegardé — et 69 % de l'argent hors caisse
tombe justement de journées sans clôture.

Accroché aux événements de **modèle**, pas aux requêtes REST : le Z est scellé
par du Go (`saveZReport`, `cash_reports.go:1952`), invisible aux hooks de
requête. Même leçon que `product_name_sort_hook.go`.

Trois précautions, chacune réparant un défaut prévisible :

| | |
|---|---|
| **différé de 2 min** | le hook s'exécute dans la transaction qui scelle le Z ; un `VACUUM` à cet instant ferait travailler SQLite contre lui-même, et le caissier attend son ticket |
| **non bloquant** | la clôture ne doit jamais échouer parce qu'un mutualisé est lent — c'est un document fiscal |
| **amorti 30 min** | rejouer 60 rapports Z (`z-repair`) ne doit pas déclencher 60 sauvegardes |

Le hook ne rend **jamais** d'erreur : dans PocketBase, la valeur de retour d'un
hook `After` peut faire échouer l'opération appelante, et aucune défaillance de
sauvegarde ne doit empêcher un Z d'être scellé.

---

## 8. Où est quoi

| Fichier | Rôle |
|---|---|
| `backend/backup/snapshot.go` | `VACUUM INTO`, gzip, chiffrement, et le chemin inverse |
| `backend/backup/envoi.go` | le protocole côté poste, avec reprise |
| `backend/backup/planificateur.go` | l'horloge, le verrou, l'état |
| `backend/backup/apres_z.go` | le déclenchement après chaque rapport Z |
| `backend/backup/cles_test.go` | le gardien « chiffrement ≠ clé API » |
| `backend/backup/storage.go` | l'inventaire et l'envoi différentiel des images |
| `backend/backup/super.go` | la clé super-admin : lister, télécharger, socle, rapatriement |
| `backend/backup/restauration.go` | la restauration en deux temps |
| `backend/backup/restauration_test.go` | ses cinq gardiens, dont celui du WAL |
| `backend/backup/storage_test.go` | `.attrs` transportés, vignettes exclues, chemins en `/` |
| `backend/backup/snapshot_test.go` | les gardiens : aller-retour, troncature, mauvaise clé, réordonnancement |
| `backend/routes/backup_routes.go` | `GET /api/backup/status`, `POST /api/backup/run` |
| `backend/cmd/snapshot-restore/` | la restauration, hors application |
| `pocketApp_minisaas/api/backup.php` | la réception |
| `pocketApp_minisaas/api/backup-config.php` | où atterrissent les octets, et les bornes |
| `pocketApp_minisaas/api/backup-admin.php` | lister, télécharger, supprimer — par clé super-admin, pour les OUTILS |
| `pocketApp_minisaas/api/admin/backups.php` | idem sous session admin, pour le navigateur |
| `pocketApp_minisaas/api/admin/backup-diag.php` | diagnostic de mise en service |
| `pocketApp_minisaas/schema-super-keys.sql` | les tables `backup_super_keys` et `backup_super_log` |
| `pocketApp_minisaas/api/backup-storage.php` | la réception des images |
| `pocketApp_minisaas/schema-storage.sql` | la table `backup_storage` |
| `pocketApp_minisaas/schema-backups.sql` | la table `backups` |

---

## 11. La restauration sélective — trois champs, et rien d'autre

**Mise en place le 6 septembre 2026.** Écran : `/site/restauration`.

Le besoin est l'inverse du §6 : livrer dans la base d'un client **un travail
d'organisation fait en développement** — le rangement du catalogue, l'état de
publication, les désignations — sans toucher à une seule de ses ventes.

|  | Restauration complète (§6) | Restauration sélective |
|---|---|---|
| Portée | `data.db` en ENTIER | une liste blanche de champs |
| Quand | au démarrage suivant | **à chaud**, tout de suite |
| La caisse | écrasée | intacte |
| Créations / suppressions | toute la base | **aucune**, sauf le menu si on le demande |
| Aperçu | non | **oui, et c'est le mode par défaut** |

### 11.1 Ce qui passe

```
products    → categories, status, designation
categories  → name
site_menu   → la structure entière, sur case cochée
```

Et rien d'autre. `image`, `gallery`, `stock`, `price_ttc`,
`purchase_price_ht`, `sku`, `slug`, `legacy_id`, `barcode`, `brand`,
`supplier`, ainsi que **toutes les autres collections**, sont hors périmètre.

`ChampsAutorises` (`backend/backup/selectif.go`) est la seule porte, et
`appliquerChamps` **refuse** un champ qui n'y figure pas — même présenté par un
plan, même porté par le snapshot, ce qui est toujours le cas puisqu'un snapshot
est la base entière. Gardien : `TestChampHorsListeBlancheRefuse`.

La protection est déclarée **par collection** (`ChampsProteges`), et ce n'est
pas une subtilité inutile : `name` est le champ à ramener sur une catégorie et
un champ à ne surtout pas toucher sur un produit — le nom d'un produit est
celui de sa fiche en ligne, `designation` étant celui du ticket (règle du
27 août 2026).

### 11.2 Sur quelle clé les deux bases se reconnaissent

**`id` PocketBase d'abord, `legacy_id` en repli, jamais le nom ni le slug.**

Les deux bases descendent du même snapshot — la base de développement EST une
restauration de celle du client —, donc les identifiants coïncident et sont la
clé exacte. `legacy_id` rattrape le cas d'une base rechargée par
`catalog-import`, qui reçoit des `id` neufs mais garde ses clés stables. Le nom
est exclu : « Accessoires » existe deux fois dans l'arbre, et apparier sur un
homonyme écrirait sur la mauvaise fiche, en silence.

Un `legacy_id` vide n'apparie rien : PocketBase stocke `''` et non NULL, et
sans cette garde toutes les fiches sans clé stable s'apparieraient entre elles
(`TestLegacyIDVideNAppariePas`).

### 11.3 L'absence n'est pas une instruction

C'est la règle qui protège le client :

- une fiche du snapshot absente de la base est **comptée et nommée, jamais
  créée** ;
- une fiche de la base absente du snapshot **reste intacte**. C'est le produit
  né en caisse — clé `pa_…`, jamais passé par le poste de développement. Il n'a
  aucune raison d'être dans mon snapshot, et il ne doit surtout pas en être
  déduit qu'il faut le dépublier.

Gardien : `TestRienNestCreeNiEfface`.

**Une exception, nommée : le menu.** `site_menu` est un arbre ordonné ; le
ramener signifie créer et supprimer des entrées, un menu à moitié restauré
n'étant pas un demi-menu mais un menu cassé. C'est le seul geste destructeur du
mécanisme, il est derrière une case à cocher distincte, et les entrées sont
recréées **sous leur identifiant d'origine** — ce qui conserve les
rattachements `parent` et rend l'opération rejouable.

### 11.4 Ce que ça déclenche vers le site, et qu'il faut dire

`status` et `categories` entrent dans le checksum d'export des produits
(`catalog-export.ts`, `CHAMPS_PRODUIT_EXPORTES`), `name` dans celui des
catégories. Une fiche dont l'un d'eux change devient donc `modified` et
**repartira au prochain export du catalogue**.

Ce n'est pas un défaut : le site doit apprendre qu'une fiche a changé de
rangement ou d'état de publication. Mais un ré-export de plusieurs centaines de
fiches ne doit pas être une surprise, donc l'écran l'annonce **avec son
nombre**, avant d'écrire (`EffetExport`).

`designation` est le seul des trois champs produits qui n'a aucun effet en
ligne — elle est nommément exclue de l'export. Une fiche dont seule la
désignation change n'est donc PAS comptée comme « repartira »
(`TestDesignationSeuleNeRepubliePas`).

### 11.5 Les deux propriétés techniques qui portent le reste

**Le snapshot s'ouvre en `mode=ro`.** La règle « une seule connexion en
écriture » (CLAUDE.md) tient parce que SQLite refuse, pas parce qu'on
s'abstient : mesuré, « attempt to write a readonly database ». Aucun `-wal` ni
`-shm` n'est créé à côté, donc rien qui puisse être confondu avec la base en
service. Le nom du pilote est CHOISI et non écrit en dur — `sqlite` (modernc)
sans CGO, `pb_sqlite3` (mattn) avec.

**La sauvegarde d'avant passe par `VACUUM INTO`, pas par la copie des trois
fichiers.** C'est une différence assumée avec `sauvegarderBase`
(`backend/cmd/catalog-rattraper/main.go:404`), et elle découle du §2 : cet
outil-là refuse de tourner tant que PocketApp est ouvert, ici la base est **en
service**. Copier `data.db`, `-wal` et `-shm` pendant qu'une vente s'écrit donne
une base incohérente, silencieusement. Le résultat est un `data.db` unique,
cohérent, sans journal à recoller.

### 11.6 Mesuré sur la base réelle du client

Le 6 septembre 2026, sur le miroir du 31 août (`lundi_31_08` : 3046 produits,
463 catégories, 881 tickets, 388 factures, 68 rapports Z, 75 sessions), par
`TestRestaurationSelectiveReelle`. Le snapshot y porte 7 catégories renommées,
11 produits dépubliés et 5 désignations réécrites — **et, sur les mêmes fiches,
des noms, prix, slugs et stocks délibérément salis**, pour vérifier qu'ils ne
passent pas.

| | |
|---|---|
| snapshot ouvert | 15 196 Kio |
| **simulation** | **205 ms** |
| **écriture** | **973 ms, 23 enregistrements** |
| écart vu | `name` × 7 (catégories), `status` × 11, `designation` × 5 |
| écart vu sur les champs salis | **0** — `name`, `price_ttc`, `slug`, `stock` |
| annoncé « repartiront en ligne » | 11 produits, 7 catégories |
| témoins après écriture | factures, tickets, Z, sessions, mouvements, images, galeries, stocks, prix, slugs : **tous inchangés** |
| sommes prix et stock | **identiques** |
| rejeu immédiat | **aucun écart** — l'opération est idempotente |

### 11.7 Ce qu'il faut savoir avant de s'en servir

- **Comparer laisse la sauvegarde DÉCHIFFRÉE sur le poste**, dans
  `pb_data/restauration-selective/`. C'est délibéré : l'écriture doit porter
  sur exactement ce qui a été montré, pas sur un second téléchargement. Elle
  est effacée après l'écriture, et un bouton l'efface si l'on renonce — un
  snapshot déchiffré est la base du client en clair.
- **Une catégorie du snapshot que la base ne connaît pas écarte la fiche.**
  Rien ne se crée, donc le rattachement ne peut pas être écrit ; plutôt qu'un
  produit rangé à moitié, on refuse la fiche et on la nomme. Si le cas est
  fréquent, c'est que ces catégories doivent d'abord être créées à la main.
- **Le menu ne se propage pas en temps réel.** `products` et `categories` sont
  dans `COLLECTIONS_SURVEILLEES` (`frontend/lib/realtime/catalog-realtime.ts`),
  `site_menu` non : sur les autres postes, le menu n'apparaît qu'au
  rechargement de la page. L'écran le dit.
- **Le `buster` du cache persisté n'a pas changé**, et n'avait pas à changer :
  la FORME des réponses `categories` et `catalog-counts` est la même, seules
  leurs valeurs bougent. Le hook les périme explicitement, parce qu'elles sont
  écrites sur le disque (`CLES_PERSISTEES`, `frontend/main.tsx`) et qu'un écran
  en retard qui LE RESTE après un rechargement est le pire cas.

### 11.8 Où est quoi

| Fichier | Rôle |
|---|---|
| `backend/backup/selectif.go` | la liste blanche, l'appariement, l'écart, l'écriture |
| `backend/backup/selectif_travail.go` | le snapshot déchiffré, conservé entre l'aperçu et l'écriture |
| `backend/backup/selectif_test.go` | les gardiens : liste blanche, slug, rien créé ni effacé, simulation |
| `backend/backup/selectif_reel_test.go` | la mesure du §11.6, sur la base du client |
| `backend/routes/backup_selectif_routes.go` | `POST /api/backup/selective-restore` |
| `frontend/lib/queries/restauration-selective.ts` | les hooks, et l'invalidation des caches |
| `frontend/modules/site/RestaurationSelectivePage.tsx` | l'écran |
