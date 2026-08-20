<?php
/**
 * Miroir des images du catalogue — marques, catégories et produits.
 *
 * Mécanisme décrit par
 * frontend/modules/site/PocketSite-docs/16-conception-images.md, §4 :
 *
 *   GET  ?action=inventory  → legacy_id → image_checksum, par table
 *   POST  (multipart)       → TOUTES les images d'une entité, plus son empreinte
 *
 * ─── Trois règles, et elles expliquent tout le fichier ─────────────────────
 *
 * 1. **Le nom distant est CALCULÉ, jamais transporté** (§4.1) :
 *        <media_root>/<brands|categories>/<legacy_id>/<rang>.<ext>
 *    Le rang 0 est l'image principale. Rien de ce que l'appelant envoie
 *    n'entre dans un chemin de fichier, à l'exception du `legacy_id`, qui est
 *    contraint à [A-Za-z0-9_-] avant tout usage, et de l'extension, prise dans
 *    une liste fermée. Un nom de fichier venu du client ne touche jamais le
 *    disque.
 *
 * 2. **Les octets d'abord, la ligne SQL ensuite** (§4.3). Tant que la ligne
 *    SQL est vide, le site n'affiche rien — ce qu'il fait déjà. Une
 *    interruption entre les deux laisse des octets que personne ne désigne,
 *    invisibles, et le rejeu répare. L'ordre inverse montrerait des images
 *    cassées à un visiteur, ce qui est le seul état vraiment coûteux.
 *
 * 3. **Ce script ne DÉCIDE de rien**, comme products-sync.php : il ne
 *    recalcule pas l'empreinte, ne redimensionne pas, ne juge pas de ce qui
 *    est publiable. Il reçoit `image_checksum` et le réémet tel quel (§2 du
 *    contrat).
 *
 * Un envoi = une entité, ENTIÈRE. Les rangs au-delà de la nouvelle longueur
 * disparaissent de la ligne SQL, ET LEURS OCTETS SONT EFFACÉS. On ne supprime
 * pas une entité, on réécrit son état.
 *
 * ⚠️ Ce dernier point est un CHANGEMENT du 20 août 2026. Le §4.3 posait que
 * les octets devenus inutiles « restent sur le disque, inertes », et que
 * c'était « sans coût, sauf l'espace disque ». Cette phrase a été écrite pour
 * 57 Mio de marques. Les produits pèsent 1,503 Gio, l'espace du mutualisé est
 * inconnu, et une galerie qui raccourcit laisse des rangs derrière elle à
 * chaque retouche : la parenthèse est devenue le sujet. Voir `menage()`.
 *
 * La ligne SQL est mise à jour par UN SEUL `UPDATE` : un visiteur lit l'ancien
 * état ou le nouveau, jamais un état mi-écrit.
 *
 * **Les produits sont acceptés depuis le 20 août 2026.** Le premier livrable
 * — marques et catégories, 57 Mio — a servi à mesurer la vitesse réelle avant
 * d'ouvrir les 1,503 Gio de produits (§4.4). Ils n'apportent pas un mécanisme
 * de plus : le rang 0 est leur image principale, les rangs suivants leur
 * galerie DANS SON ORDRE, et le reste est identique.
 *
 * Aucun secret ici : identifiants de base et clé API vivent dans
 * ../config/config.php, non versionné.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

/** @param array<string,mixed> $payload */
function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function reject(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

/** @param array<string,mixed> $config */
function images_log(array $config, string $line): void
{
    if (empty($config['log_file'])) {
        return;
    }
    @file_put_contents(
        $config['log_file'],
        sprintf("%s\timages\t%s\n", gmdate('c'), $line),
        FILE_APPEND | LOCK_EX
    );
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

$configFile = __DIR__ . '/../config/config.php';

if (!is_file($configFile)) {
    reject(500, 'Configuration absente sur le serveur.');
}

/** @var array<string,mixed> $config */
$config = require $configFile;

$defaults = [
    'catalog_api_key' => '',
    'db'              => [],
    'table_prefix'    => 'ax_',
    // Racine des octets, chemin ABSOLU côté système de fichiers. Sous la
    // racine web : les images sont servies directement par Apache, sans PHP.
    'media_root'      => null,
    // Préfixe d'URL publique correspondant à `media_root`. Il n'est pas utilisé
    // pour écrire — il est RENVOYÉ, pour que l'appelant sache sous quelle URL
    // l'image sera lisible, et que catalog.php puisse le composer plus tard.
    'media_base_url'  => null,
    // Un seul fichier ne peut pas dépasser cela. Le pire cas mesuré côté
    // catégories est 2,7 Mo (19 août 2026) ; côté produits, 4,95 Mo.
    'image_max_bytes' => 8 * 1024 * 1024,
    'log_file'        => null,
];
$config = array_merge($defaults, is_array($config) ? $config : []);

if (!is_string($config['catalog_api_key']) || strlen($config['catalog_api_key']) < 16) {
    reject(500, 'Configuration invalide sur le serveur : catalog_api_key.');
}

$mediaRoot = is_string($config['media_root']) ? rtrim($config['media_root'], '/\\') : '';
if ($mediaRoot === '') {
    reject(500, 'Configuration invalide sur le serveur : media_root.');
}

$db = is_array($config['db']) ? $config['db'] : [];
foreach (['host', 'name', 'user', 'pass'] as $needed) {
    if (!isset($db[$needed]) || !is_string($db[$needed])) {
        reject(500, sprintf('Configuration invalide sur le serveur : db.%s.', $needed));
    }
}

$prefix = (string) $config['table_prefix'];
// Le préfixe entre dans des noms de table, donc dans du SQL non paramétrable.
if (preg_match('/^[A-Za-z0-9_]*$/', $prefix) !== 1) {
    reject(500, 'Configuration invalide sur le serveur : table_prefix.');
}

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------
// Même clé que products-sync.php : même base, même portée d'écriture. Et même
// contournement des mutualisés Apache/CGI qui ne propagent pas les en-têtes
// non standard dans $_SERVER.

function read_api_key(): string
{
    if (isset($_SERVER['HTTP_X_API_KEY'])) {
        return (string) $_SERVER['HTTP_X_API_KEY'];
    }
    if (isset($_SERVER['REDIRECT_HTTP_X_API_KEY'])) {
        return (string) $_SERVER['REDIRECT_HTTP_X_API_KEY'];
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'X-API-Key') === 0) {
                return (string) $value;
            }
        }
    }
    return '';
}

$providedKey = read_api_key();
if ($providedKey === '' || !hash_equals((string) $config['catalog_api_key'], $providedKey)) {
    images_log($config, 'refus auth');
    reject(401, 'Clé API absente ou invalide.');
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']),
        $db['user'],
        $db['pass'],
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    images_log($config, 'connexion SQL impossible : ' . $e->getMessage());
    reject(500, 'Connexion à la base impossible.');
}

/**
 * Les seules tables acceptées. `products` s'y ajoute le 20 août 2026, la
 * mécanique ayant été mesurée en ligne sur les marques (§4.4) ; ses colonnes
 * `image_*` étaient créées d'avance par `server/sql/images.sql`, précisément
 * pour que cette ligne ne coûte pas un verrou de table sur 2999 lignes.
 */
$TABLES = [
    'brands'     => $prefix . 'brands',
    'categories' => $prefix . 'categories',
    'products'   => $prefix . 'products',
];

$method = $_SERVER['REQUEST_METHOD'] ?? '';

// ---------------------------------------------------------------------------
// GET — inventaire d'images  (§4.2)
// ---------------------------------------------------------------------------
// Le même geste que l'inventaire d'entités, sur l'autre empreinte. Une requête
// SQL par table, et l'appelant y lit les mêmes trois états : absent, modifié,
// à jour.

if ($method === 'GET') {
    $action = isset($_GET['action']) ? (string) $_GET['action'] : '';
    if ($action !== 'inventory') {
        reject(400, 'Action inconnue. Attendu : action=inventory.');
    }

    /** @return array<string,string> */
    $inventory = static function (PDO $pdo, string $table): array {
        $out = [];
        $rows = $pdo->query(sprintf(
            'SELECT legacy_id, image_checksum FROM `%s` WHERE image_checksum IS NOT NULL',
            $table
        ));
        foreach ($rows as $row) {
            $out[(string) $row['legacy_id']] = (string) $row['image_checksum'];
        }
        return $out;
    };

    try {
        $brands     = $inventory($pdo, $TABLES['brands']);
        $categories = $inventory($pdo, $TABLES['categories']);
        $products   = $inventory($pdo, $TABLES['products']);
    } catch (PDOException $e) {
        images_log($config, 'inventaire images impossible : ' . $e->getMessage());
        reject(500, 'Lecture de l\'inventaire d\'images impossible. Les colonnes image_* sont-elles en place ?');
    }

    // L'ESPACE DISQUE, rendu avec l'inventaire.
    //
    // Le §6.4 de la conception le déclarait « inconnu », et il l'est resté tant
    // que seuls 57 Mio partaient. Les produits en pèsent 1,503 Gio : envoyer
    // sans savoir ce qui reste, c'est découvrir la limite au milieu d'un lot,
    // avec des octets écrits et des lignes SQL qui ne le sont pas.
    //
    // C'est une LECTURE, elle ne décide de rien : le script ne refuse pas un
    // envoi parce que le disque lui paraît petit — ce serait décider, et §3 le
    // lui interdit. Il rend le chiffre, l'humain regarde. `null` si l'hébergeur
    // a désactivé ces fonctions, ce qui arrive sur les mutualisés.
    $libre = @disk_free_space($mediaRoot);
    $total = @disk_total_space($mediaRoot);

    respond(200, [
        'ok'     => true,
        'counts' => [
            'brands'     => count($brands),
            'categories' => count($categories),
            'products'   => count($products),
        ],
        // Objets vides encodés en objets, pas en tableaux : le consommateur
        // indexe par legacy_id, un `[]` casserait sa lecture.
        'brands'       => (object) $brands,
        'categories'   => (object) $categories,
        'products'     => (object) $products,
        'mediaBaseUrl' => is_string($config['media_base_url']) ? $config['media_base_url'] : null,
        'disk'         => [
            'freeBytes'  => is_float($libre) ? (int) $libre : null,
            'totalBytes' => is_float($total) ? (int) $total : null,
        ],
        'readAt'       => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    reject(405, 'Méthode non autorisée. GET ou POST.');
}

// ---------------------------------------------------------------------------
// POST — les images d'UNE entité  (§4.3)
// ---------------------------------------------------------------------------

$kind = isset($_POST['kind']) ? (string) $_POST['kind'] : '';
if (!isset($TABLES[$kind])) {
    reject(422, sprintf(
        'kind inconnu : « %s ». Attendu : brands, categories ou products.',
        $kind
    ));
}
$table = $TABLES[$kind];

$legacyId = isset($_POST['legacy_id']) ? trim((string) $_POST['legacy_id']) : '';
// Contrainte AVANT tout usage : ce jeton devient un nom de répertoire. Les
// clés réelles sont soit des identifiants NeDB (16 caractères alphanumériques),
// soit des clés PocketApp `pa_…` — les deux passent, rien d'autre.
if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $legacyId) !== 1) {
    reject(422, 'legacy_id absent ou de forme inacceptable.');
}

$imageChecksum = isset($_POST['image_checksum']) ? trim((string) $_POST['image_checksum']) : '';
if (preg_match('/^[A-Za-z0-9-]{1,64}$/', $imageChecksum) !== 1) {
    reject(422, 'image_checksum absent ou de forme inacceptable.');
}

// L'entité doit exister côté SQL : les images sont un ÉTAT de la ligne, pas
// une entité à part. Envoyer des octets pour une marque que le site ne connaît
// pas laisserait des fichiers que rien ne désigne, sans un mot.
try {
    $exists = $pdo->prepare(sprintf('SELECT 1 FROM `%s` WHERE legacy_id = ?', $table));
    $exists->execute([$legacyId]);
    if ($exists->fetchColumn() === false) {
        reject(409, sprintf(
            'Entité inconnue de la base du site : %s/%s. Exporter l\'entité avant ses images.',
            $kind,
            $legacyId
        ));
    }
} catch (PDOException $e) {
    images_log($config, 'lecture entité impossible : ' . $e->getMessage());
    reject(500, 'Lecture de l\'entité impossible.');
}

/**
 * Extensions acceptées. Liste FERMÉE, et c'est le point : `media_root` est sous
 * la racine web, donc tout ce qui s'y écrit est servi par Apache. Un `.php`
 * déposé ici serait exécuté.
 */
$ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'];

$maxBytes = (int) $config['image_max_bytes'];

// Les rangs sont lus dans l'ORDRE, en s'arrêtant au premier trou : `image_0`,
// `image_1`, … Un trou dans la numérotation décalerait silencieusement la
// galerie, donc il arrête la lecture au lieu d'être comblé.
$uploads = [];
for ($rank = 0; isset($_FILES['image_' . $rank]); $rank++) {
    $file = $_FILES['image_' . $rank];

    if (!is_array($file) || !isset($file['error'])) {
        reject(422, sprintf('Rang %d : envoi illisible.', $rank));
    }
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        // Le cas que §6.2 de la conception annonçait : les plafonds PHP du
        // mutualisé ne sont pas mesurés. Le dire explicitement plutôt que de
        // rendre « erreur 1 ».
        reject(413, sprintf(
            'Rang %d : fichier refusé par les plafonds PHP de l\'hébergeur (upload_max_filesize / post_max_size).',
            $rank
        ));
    }
    if ($file['error'] !== UPLOAD_ERR_OK) {
        reject(422, sprintf('Rang %d : envoi en erreur (code %d).', $rank, (int) $file['error']));
    }
    if ((int) $file['size'] > $maxBytes) {
        reject(413, sprintf('Rang %d : %d octets, maximum %d.', $rank, (int) $file['size'], $maxBytes));
    }

    // L'extension vient du nom transmis, mais elle n'y est pas PRISE : elle est
    // cherchée dans la liste fermée, et tout le reste du nom est jeté.
    $ext = strtolower((string) pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if ($ext === 'jpeg') {
        $ext = 'jpg';
    }
    if (!in_array($ext, $ALLOWED_EXT, true)) {
        reject(422, sprintf('Rang %d : extension « %s » non acceptée.', $rank, $ext));
    }

    $uploads[] = ['tmp' => (string) $file['tmp_name'], 'ext' => $ext];
}

if ($uploads === [] && $imageChecksum !== 'aucune-image') {
    reject(422, 'Aucun fichier reçu alors que l\'empreinte en annonce.');
}

// ── Les octets d'abord ──────────────────────────────────────────────────────

$dir = $mediaRoot . '/' . $kind . '/' . $legacyId;
if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
    images_log($config, 'mkdir impossible : ' . $dir);
    reject(500, 'Création du répertoire impossible sur le serveur.');
}

$paths = [];
foreach ($uploads as $rank => $upload) {
    $name = $rank . '.' . $upload['ext'];
    $destination = $dir . '/' . $name;

    // Écriture par fichier temporaire puis renommage : `rename` est atomique
    // sur le même système de fichiers, donc un visiteur ne peut pas lire une
    // image à moitié écrite. Le temporaire est dans le MÊME répertoire, sans
    // quoi le renommage cesserait de l'être.
    $temporary = $destination . '.tmp';
    if (!@move_uploaded_file($upload['tmp'], $temporary)) {
        @unlink($temporary);
        images_log($config, 'écriture impossible : ' . $destination);
        reject(500, sprintf('Écriture du rang %d impossible.', $rank));
    }
    if (!@rename($temporary, $destination)) {
        @unlink($temporary);
        images_log($config, 'renommage impossible : ' . $destination);
        reject(500, sprintf('Renommage du rang %d impossible.', $rank));
    }
    @chmod($destination, 0644);

    $paths[] = $kind . '/' . $legacyId . '/' . $name;
}

// ── La ligne SQL ensuite, en UN SEUL UPDATE ─────────────────────────────────
// `image_paths` porte la liste ORDONNÉE, en JSON. C'est elle qui fait foi pour
// le site — pas le `ls` du répertoire, qui peut porter des rangs devenus
// inutiles et des extensions abandonnées. Un octet que plus personne ne
// désigne est invisible et sans coût, sauf l'espace disque (§3).

try {
    $update = $pdo->prepare(sprintf(
        'UPDATE `%s` SET image_checksum = ?, image_paths = ?, images_exported_at = UTC_TIMESTAMP() WHERE legacy_id = ?',
        $table
    ));
    $update->execute([
        $imageChecksum,
        json_encode($paths, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        $legacyId,
    ]);
} catch (PDOException $e) {
    // Les octets sont écrits, la ligne non : l'état visible du site est
    // inchangé (il n'affiche que ce que dit la ligne), et le rejeu répare.
    images_log($config, 'update images impossible : ' . $e->getMessage());
    reject(500, 'Mise à jour de la ligne impossible. Les colonnes image_* sont-elles en place ?');
}

// ── Le ménage en DERNIER ────────────────────────────────────────────────────
// Efface, dans le dossier de CETTE entité, tout fichier que la nouvelle liste
// ne désigne plus.
//
// ─── Pourquoi il existe ────────────────────────────────────────────────────
// Le §4.3 posait que les rangs abandonnés « restent sur le disque, inertes »,
// et le §3 que c'était « sans coût, sauf l'espace disque ». Vrai pour 57 Mio
// de marques. Les produits pèsent 1,503 Gio pour 4132 fichiers, l'espace du
// mutualisé n'est pas connu, et chaque galerie qu'on raccourcit ou dont on
// change l'extension laisse un rang derrière elle. Ce qui était une parenthèse
// est devenu le sujet : un dossier n'a pas à garder une photo inutile.
//
// ─── Pourquoi EN DERNIER, et pas ailleurs ──────────────────────────────────
// C'est le seul geste destructeur de tout le mécanisme. L'ordre du §4.3 ne
// bouge pas — octets, puis SQL — et le ménage vient APRÈS les deux :
//
//   * après les octets, sinon on effacerait un rang avant de savoir si son
//     remplaçant s'écrit ;
//   * après le SQL, parce que `image_paths` est ce qui fait foi pour le site.
//     Tant que la ligne n'est pas à jour, un fichier que la NOUVELLE liste
//     ignore peut encore être celui que l'ANCIENNE désigne, donc celui qu'un
//     visiteur est en train de charger.
//
// S'il échoue, l'état visible est déjà correct : l'entité reste simplement un
// peu grasse, et le prochain envoi rattrapera. C'est pourquoi il ne rejette
// jamais — refuser ici annoncerait un échec après une réussite.
//
// ─── Pourquoi il est sûr ───────────────────────────────────────────────────
// Il ne regarde QUE `<media_root>/<kind>/<legacy_id>/`, jamais au-dessus et
// jamais en dessous : `glob` sans récursion, et `is_file` écarte les
// répertoires. `$kind` vient d'une liste fermée et `$legacyId` est contraint à
// [A-Za-z0-9_-] depuis le début du script — aucun des deux ne peut porter un
// `..`. Et il compare des NOMS DE BASE à ceux qu'on vient d'écrire, pas des
// chemins : rien de ce que l'appelant a envoyé n'entre dans la décision.

$garder = [];
foreach ($paths as $chemin) {
    $garder[basename($chemin)] = true;
}

$efface = 0;
$octetsLiberes = 0;
foreach ((array) @glob($dir . '/*') as $trouve) {
    if (!is_string($trouve) || !is_file($trouve)) {
        continue;
    }
    $nom = basename($trouve);
    if (isset($garder[$nom])) {
        continue;
    }
    // Un `.tmp` oublié par un envoi interrompu est justement ce qu'on veut
    // voir partir : il n'est dans aucune liste, donc il tombe ici.
    $taille = (int) @filesize($trouve);
    if (@unlink($trouve)) {
        $efface++;
        $octetsLiberes += $taille;
    } else {
        images_log($config, 'ménage : effacement impossible : ' . $trouve);
    }
}

images_log($config, sprintf(
    '%s/%s : %d image(s), %s, ménage %d fichier(s) %d octet(s)',
    $kind,
    $legacyId,
    count($paths),
    $imageChecksum,
    $efface,
    $octetsLiberes
));

respond(200, [
    'ok'             => true,
    'kind'           => $kind,
    'legacy_id'      => $legacyId,
    'image_checksum' => $imageChecksum,
    'paths'          => $paths,
    // Ce que le ménage a repris. Rendu parce qu'un effacement doit se VOIR :
    // c'est le seul geste du mécanisme qui détruit, il ne se fait pas en
    // silence.
    'cleaned'        => ['files' => $efface, 'bytes' => $octetsLiberes],
    'mediaBaseUrl'   => is_string($config['media_base_url']) ? $config['media_base_url'] : null,
    'writtenAt'      => gmdate('Y-m-d\TH:i:s\Z'),
]);
