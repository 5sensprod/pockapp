<?php
/**
 * Endpoint de réception du menu publié — ticket 5.
 *
 * Reçoit en POST le document décrit par
 * frontend/modules/site/PocketSite-docs/05-contrat-menu.md, le valide
 * intégralement (§6.1), puis l'écrit de façon ATOMIQUE à l'emplacement servi
 * en statique par le site (§1 du contrat : /data/menu.json).
 *
 * Le contrat fait autorité. Toute divergence entre ce fichier et le contrat
 * est un bogue de ce fichier.
 *
 * Aucun secret ici : la clé vit dans ../config/config.php, non versionné.
 * Modèle repris du mini-SaaS pocketapp.5sensprod.com (api/, config hors dépôt).
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

/**
 * Répond en JSON et termine. Toute sortie de ce script passe par ici.
 *
 * @param array<string,mixed> $payload
 */
function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Refus de validation. `errors` est la liste complète, pas la première trouvée :
 * corriger un producteur une erreur à la fois coûte un aller-retour chacune.
 *
 * @param string[] $errors
 */
function reject(int $status, string $message, array $errors = []): void
{
    respond($status, ['ok' => false, 'error' => $message, 'errors' => $errors]);
}

/**
 * Journal best-effort. Ne fait jamais échouer une publication valide.
 *
 * @param array<string,mixed> $config
 */
function publish_log(array $config, string $line): void
{
    if (empty($config['log_file'])) {
        return;
    }
    @file_put_contents(
        $config['log_file'],
        sprintf("%s\t%s\n", gmdate('c'), $line),
        FILE_APPEND | LOCK_EX
    );
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

$configFile = __DIR__ . '/../config/config.php';

if (!is_file($configFile)) {
    // Cas d'installation incomplète : on le dit clairement, sans révéler le chemin.
    reject(500, 'Configuration absente sur le serveur.');
}

/** @var array<string,mixed> $config */
$config = require $configFile;

$defaults = [
    'api_key'                       => '',
    'target_file'                   => '',
    'targets'                       => [],
    'max_body_bytes'                => 262144, // 256 Kio — voir README, §4.5 de l'audit
    'supported_contract_versions'   => [1],
    'log_file'                      => null,
];
$config = array_merge($defaults, is_array($config) ? $config : []);

if (!is_string($config['api_key']) || strlen($config['api_key']) < 16) {
    reject(500, 'Configuration invalide sur le serveur : api_key.');
}
if (!is_string($config['target_file']) || $config['target_file'] === '') {
    reject(500, 'Configuration invalide sur le serveur : target_file.');
}

// ---------------------------------------------------------------------------
// Méthode et authentification
// ---------------------------------------------------------------------------

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'POST') {
    header('Allow: POST');
    reject(405, 'Méthode non autorisée. POST uniquement.');
}

/**
 * Certains mutualisés Apache/CGI ne propagent pas les en-têtes non standard
 * dans $_SERVER. On regarde les trois formes connues.
 */
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
if ($providedKey === '' || !hash_equals((string) $config['api_key'], $providedKey)) {
    publish_log($config, 'refus auth');
    reject(401, 'Clé API absente ou invalide.');
}

// ---------------------------------------------------------------------------
// Corps de la requête
// ---------------------------------------------------------------------------

$maxBytes = (int) $config['max_body_bytes'];

$declaredLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($declaredLength > $maxBytes) {
    reject(413, sprintf('Corps trop volumineux : maximum %d octets.', $maxBytes));
}

$body = file_get_contents('php://input');
if ($body === false) {
    reject(400, 'Corps de requête illisible.');
}
if (strlen($body) === 0) {
    reject(400, 'Corps de requête vide.');
}
if (strlen($body) > $maxBytes) {
    reject(413, sprintf('Corps trop volumineux : maximum %d octets.', $maxBytes));
}

$document = json_decode($body, true, 64);
if (json_last_error() !== JSON_ERROR_NONE) {
    reject(400, 'JSON invalide : ' . json_last_error_msg());
}
if (!is_array($document) || array_is_list_compat($document)) {
    reject(422, 'Le document doit être un objet JSON.');
}

// ---------------------------------------------------------------------------
// Validation — §6.1 du contrat
// ---------------------------------------------------------------------------

/**
 * PHP 7.4 n'a pas array_is_list(). Un objet JSON décodé en tableau associatif
 * n'est pas une liste ; c'est ce test-là qui distingue `{}` de `[]`.
 *
 * @param array<mixed> $value
 */
function array_is_list_compat(array $value): bool
{
    if ($value === []) {
        return true; // `[]` et `{}` décodent pareil ; traité au cas par cas.
    }
    return array_keys($value) === range(0, count($value) - 1);
}

/** @return string[] */
function validate_document(array $document, array $supportedVersions): array
{
    $errors = [];

    // --- Enveloppe (§2.1) ---------------------------------------------------

    if (!array_key_exists('contractVersion', $document)) {
        $errors[] = 'contractVersion : champ absent.';
    } elseif (!is_int($document['contractVersion'])) {
        $errors[] = 'contractVersion : entier attendu.';
    } elseif (!in_array($document['contractVersion'], $supportedVersions, true)) {
        // Refus explicite d'une version inconnue : §5 du contrat. On ne tente
        // pas de l'interpréter au mieux, c'est la raison d'être du champ.
        $errors[] = sprintf(
            'contractVersion %d inconnue de ce script (connues : %s).',
            $document['contractVersion'],
            implode(', ', $supportedVersions)
        );
    }

    if (!array_key_exists('publishedAt', $document)) {
        $errors[] = 'publishedAt : champ absent.';
    } elseif (!is_string($document['publishedAt']) || !is_iso8601_utc($document['publishedAt'])) {
        $errors[] = 'publishedAt : date ISO 8601 UTC attendue, suffixe Z (ex. 2026-08-06T14:32:11Z).';
    }

    if (!array_key_exists('menu', $document)) {
        $errors[] = 'menu : champ absent.';
        return $errors; // rien à valider en dessous
    }
    if (!is_array($document['menu']) || array_is_list_compat($document['menu'])) {
        $errors[] = 'menu : objet attendu.';
        return $errors;
    }

    $menu = $document['menu'];

    // --- menu (§2.2) --------------------------------------------------------

    if (!isset($menu['name']) || !is_string($menu['name']) || trim($menu['name']) === '') {
        $errors[] = 'menu.name : chaîne non vide attendue.';
    }
    if (!array_key_exists('items', $menu)) {
        $errors[] = 'menu.items : champ absent.';
        return $errors;
    }
    if (!is_array($menu['items']) || !array_is_list_compat($menu['items'])) {
        $errors[] = 'menu.items : tableau attendu.';
        return $errors;
    }

    // --- items[] (§2.3) -----------------------------------------------------

    $ids = [];
    $parents = [];

    foreach ($menu['items'] as $index => $item) {
        $at = sprintf('menu.items[%d]', $index);

        if (!is_array($item) || array_is_list_compat($item)) {
            $errors[] = $at . ' : objet attendu.';
            continue;
        }

        // Les cinq champs sont obligatoires, y compris ceux qui valent null.
        foreach (['id', 'title', 'url', 'parent', 'ref'] as $field) {
            if (!array_key_exists($field, $item)) {
                $errors[] = sprintf('%s.%s : champ absent.', $at, $field);
            }
        }

        foreach (['id', 'title', 'url'] as $field) {
            if (array_key_exists($field, $item)
                && (!is_string($item[$field]) || $item[$field] === '')) {
                $errors[] = sprintf('%s.%s : chaîne non vide attendue.', $at, $field);
            }
        }

        if (array_key_exists('id', $item) && is_string($item['id']) && $item['id'] !== '') {
            if (isset($ids[$item['id']])) {
                $errors[] = sprintf('%s.id : "%s" déjà utilisé par une autre entrée.', $at, $item['id']);
            }
            $ids[$item['id']] = true;
        }

        if (array_key_exists('parent', $item)) {
            if ($item['parent'] === null) {
                // racine, valide
            } elseif (is_string($item['parent']) && $item['parent'] !== '') {
                $parents[] = [$at, $item['parent']];
            } else {
                $errors[] = sprintf('%s.parent : chaîne non vide ou null attendu.', $at);
            }
        }

        if (array_key_exists('ref', $item) && $item['ref'] !== null) {
            $errors = array_merge($errors, validate_ref($item['ref'], $at . '.ref'));
        }
    }

    // --- Intégrité des parents (§4) ----------------------------------------

    foreach ($parents as [$at, $parentId]) {
        if (!isset($ids[$parentId])) {
            $errors[] = sprintf(
                '%s.parent : "%s" ne correspond à l\'id d\'aucune entrée du document.',
                $at,
                $parentId
            );
        }
    }

    return $errors;
}

/**
 * §3 du contrat. Les quatre types sont énumérés et le producteur est unique :
 * un type inconnu est un bogue de PocketApp, pas une extension à tolérer.
 *
 * @param mixed $ref
 * @return string[]
 */
function validate_ref($ref, string $at): array
{
    $known = ['category', 'brand', 'product', 'page'];

    if (!is_array($ref) || array_is_list_compat($ref)) {
        return [$at . ' : objet ou null attendu.'];
    }

    $errors = [];

    if (!isset($ref['type']) || !is_string($ref['type'])) {
        $errors[] = $at . '.type : chaîne attendue.';
    } elseif (!in_array($ref['type'], $known, true)) {
        $errors[] = sprintf('%s.type : "%s" inconnu (attendus : %s).', $at, $ref['type'], implode(', ', $known));
    }

    if (!isset($ref['id']) || !is_string($ref['id']) || $ref['id'] === '') {
        $errors[] = $at . '.id : chaîne non vide attendue.';
    }

    return $errors;
}

/**
 * ISO 8601 UTC strict, suffixe Z, tel que produit par PocketApp (§2.1).
 * On refuse les décalages horaires : le contrat dit UTC, pas « une date ».
 */
function is_iso8601_utc(string $value): bool
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/', $value) !== 1) {
        return false;
    }
    $format = strpos($value, '.') === false ? 'Y-m-d\TH:i:s\Z' : 'Y-m-d\TH:i:s.u\Z';
    $parsed = DateTimeImmutable::createFromFormat($format, $value, new DateTimeZone('UTC'));
    if ($parsed === false) {
        return false;
    }

    // getLastErrors() renvoie false depuis PHP 8.2 quand tout va bien, un
    // tableau avant. Les deux formes sont gérées.
    $lastErrors = DateTimeImmutable::getLastErrors();
    if (is_array($lastErrors) && ($lastErrors['warning_count'] > 0 || $lastErrors['error_count'] > 0)) {
        return false;
    }

    // Aller-retour : rejette 2026-02-30, que createFromFormat normalise en mars.
    // Comparaison sur la seconde uniquement — `u` reformate toujours sur six
    // chiffres, ce qui ferait échouer une entrée à trois décimales pourtant
    // valide.
    return $parsed->format('Y-m-d\TH:i:s') === substr($value, 0, 19);
}

$errors = validate_document($document, (array) $config['supported_contract_versions']);
if ($errors !== []) {
    publish_log($config, sprintf('refus validation (%d erreurs) : %s', count($errors), $errors[0]));
    reject(422, 'Document refusé : il ne respecte pas le contrat.', $errors);
}

// ---------------------------------------------------------------------------
// Écriture atomique
// ---------------------------------------------------------------------------
//
// Jamais d'écriture en place : le site lit ce fichier en statique, sans PHP sur
// le chemin de lecture (§1.1 du contrat), donc sans aucun verrou possible côté
// lecteur. Un fopen('w') laisserait une fenêtre où un visiteur lit un JSON
// tronqué. rename() sur le même système de fichiers est atomique : un lecteur
// voit l'ancien fichier entier, ou le nouveau entier, jamais un intermédiaire.

// ── Cible : la principale, ou une cible NOMMÉE de la configuration ─────────
//
// Ajouté le 11 août 2026 pour que le raccordement du menu au catalogue `ax_`
// se teste SANS toucher au menu en production, qui est servi depuis août.
//
// `?target=<nom>` choisit une entrée de `targets` dans config.php. Le nom est
// une CLÉ D'UN TABLEAU DE LA CONFIGURATION, jamais un chemin : rien de ce que
// l'appelant envoie n'entre dans un chemin de fichier. Un nom inconnu est
// refusé, il ne retombe pas sur la cible principale — se tromper de nom et
// écraser la production sans s'en apercevoir serait exactement ce qu'on essaie
// d'éviter.
//
// Sans paramètre, le comportement est inchangé : la cible principale.

$targetName = isset($_GET['target']) ? (string) $_GET['target'] : '';

if ($targetName !== '') {
    $targets = is_array($config['targets']) ? $config['targets'] : [];
    if (!isset($targets[$targetName]) || !is_string($targets[$targetName]) || $targets[$targetName] === '') {
        publish_log($config, sprintf('refus cible inconnue : %s', $targetName));
        reject(422, sprintf('Cible « %s » inconnue de la configuration du serveur.', $targetName));
    }
    $targetFile = (string) $targets[$targetName];
} else {
    $targetFile = (string) $config['target_file'];
}

$targetDir = dirname($targetFile);

if (!is_dir($targetDir)) {
    reject(500, 'Répertoire de destination absent sur le serveur.');
}
if (!is_writable($targetDir)) {
    reject(500, 'Répertoire de destination non inscriptible.');
}

// On réencode plutôt que d'écrire $body tel quel : ce qui est publié est alors
// exactement ce qui a été validé, sans commentaire, ni BOM, ni octet en trop.
$encoded = json_encode(
    $document,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);
if ($encoded === false) {
    reject(500, 'Réencodage du document impossible.');
}

// Le fichier temporaire est dans le MÊME répertoire que la cible : rename()
// n'est atomique qu'à l'intérieur d'un système de fichiers.
$tmpFile = @tempnam($targetDir, 'menu-');
if ($tmpFile === false) {
    reject(500, 'Création du fichier temporaire impossible.');
}

$written = @file_put_contents($tmpFile, $encoded);
if ($written === false || $written !== strlen($encoded)) {
    @unlink($tmpFile);
    reject(500, 'Écriture du fichier temporaire incomplète.');
}

@chmod($tmpFile, 0644); // tempnam crée en 0600 ; le site doit pouvoir lire.

if (!@rename($tmpFile, $targetFile)) {
    @unlink($tmpFile);
    reject(500, 'Renommage vers le fichier de destination impossible.');
}

@clearstatcache(true, $targetFile);

publish_log($config, sprintf(
    'publié %d octets, %d entrées, publishedAt=%s, cible=%s',
    strlen($encoded),
    count($document['menu']['items']),
    $document['publishedAt'],
    $targetName !== '' ? $targetName : 'principale'
));

respond(200, [
    'ok'          => true,
    'bytes'       => strlen($encoded),
    'items'       => count($document['menu']['items']),
    'publishedAt' => $document['publishedAt'],
    // Dire QUELLE cible a été écrite : c'est la seule chose qui distingue une
    // publication de test d'une publication en production, et l'opérateur doit
    // pouvoir le lire sans aller ouvrir le journal.
    'target'      => $targetName !== '' ? $targetName : 'principale',
    'receivedAt'  => gmdate('Y-m-d\TH:i:s\Z'),
]);
