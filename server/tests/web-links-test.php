<?php
/**
 * Tests de `lib/web-links.php`, en ligne de commande :
 *
 *     php server/tests/web-links-test.php
 *
 * ⚠️ NE PAS DÉPOSER sur le mutualisé : ce dossier ne sert qu'au poste de
 * développement. Le garde ci-dessous le rend muet en HTTP, par précaution.
 *
 * Les cas de refus sont LES MÊMES que `frontend/lib/catalog/web-links.test.ts` :
 * la règle existe des deux côtés du réseau, elle doit dire la même chose.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/web-links.php';

$echecs = 0;
$total = 0;

function verifier(bool $ok, string $cas): void
{
    global $echecs, $total;
    $total++;
    if (!$ok) {
        $echecs++;
        fwrite(STDERR, "ÉCHEC : $cas\n");
    }
}

// ── Ce qui passe ─────────────────────────────────────────────────────────────
verifier(
    web_link_normalise(['kind' => 'link', 'url' => 'https://yamaha.com/p', 'label' => '  Fiche  '])
        === ['kind' => 'link', 'url' => 'https://yamaha.com/p', 'label' => 'Fiche'],
    'une page https, libellé ébarbé'
);
verifier(
    web_link_normalise(['kind' => 'video', 'url' => 'https://youtu.be/abc'])
        === ['kind' => 'video', 'url' => 'https://youtu.be/abc', 'label' => ''],
    'une vidéo sans libellé : le libellé est vide, pas absent'
);
verifier(
    web_link_normalise(['url' => 'https://a.fr'])['kind'] === 'link',
    'kind absent : « lien », jamais « vidéo »'
);

// ── Ce qui est écarté ────────────────────────────────────────────────────────
verifier(web_link_normalise(['kind' => 'link', 'url' => 'http://a.fr']) === null, 'http en clair');
verifier(web_link_normalise(['kind' => 'link', 'url' => 'javascript:alert(1)']) === null, 'javascript: dans un href');
verifier(web_link_normalise(['kind' => 'link', 'url' => '/page']) === null, 'chemin relatif');
verifier(web_link_normalise(['kind' => 'link', 'url' => '']) === null, 'adresse vide');
verifier(web_link_normalise('https://a.fr') === null, 'une chaîne au lieu d’un objet');
verifier(web_link_normalise(['kind' => 'video', 'url' => 'https://vimeo.com/1']) === null, 'vidéo hors YouTube : l’iframe ne saurait rien en faire');
// L'hôte, jamais le texte : sans quoi l'iframe chargerait un tiers.
verifier(web_link_normalise(['kind' => 'video', 'url' => 'https://youtube.com.pirate.fr/v']) === null, 'hôte qui ressemble à YouTube');
verifier(web_link_normalise(['kind' => 'video', 'url' => 'https://exemple.fr/?r=youtube.com']) === null, 'URL qui contient « youtube.com » sans en être une');

// ── La liste ─────────────────────────────────────────────────────────────────
$liste = web_links_normalises([
    ['kind' => 'video', 'url' => 'https://www.youtube.com/watch?v=abc', 'label' => 'Démo'],
    ['kind' => 'link', 'url' => 'http://vieux.fr'],
    ['kind' => 'link', 'url' => 'https://b.fr', 'label' => ''],
]);
verifier(count($liste) === 2, 'une entrée refusée n’emporte pas les autres');
verifier($liste[0]['url'] === 'https://www.youtube.com/watch?v=abc' && $liste[1]['url'] === 'https://b.fr', 'l’ORDRE est conservé — c’est celui de l’affichage');
verifier(web_links_normalises('pas un tableau') === [], 'une valeur qui n’est pas une liste');
verifier(count(web_links_normalises(array_fill(0, 40, ['kind' => 'link', 'url' => 'https://a.fr']))) === WEB_LINKS_MAX, 'plafond à ' . WEB_LINKS_MAX);

// ── Aller-retour avec la colonne ─────────────────────────────────────────────
verifier(web_links_pour_base([]) === null, 'aucun lien : NULL, jamais "[]" — la clé absente EFFACE');
verifier(web_links_pour_base(null) === null, 'clé absente : NULL');
verifier(web_links_pour_base([['kind' => 'link', 'url' => 'http://a.fr']]) === null, 'une liste vidée de tout redevient NULL');
$json = web_links_pour_base([['kind' => 'link', 'url' => 'https://a.fr/x', 'label' => 'Notice été']]);
verifier(strpos((string) $json, '\/') === false, 'les barres obliques ne sont pas échappées : la colonne se relit à l’œil');
verifier(strpos((string) $json, 'été') !== false, 'les accents restent lisibles');
verifier(web_links_affiches($json) === [['kind' => 'link', 'url' => 'https://a.fr/x', 'label' => 'Notice été']], 'aller-retour fidèle');

verifier(web_links_affiches(null) === [], 'colonne NULL');
verifier(web_links_affiches('') === [], 'colonne vide');
verifier(web_links_affiches('{pas du json') === [], 'colonne illisible : liste vide, pas une exception');
// Une colonne écrite à la main, ou par une version antérieure : elle repasse
// par la même validation que ce qui entre. Le site pose ces adresses dans des
// `href` et dans une iframe.
verifier(web_links_affiches('[{"kind":"link","url":"javascript:alert(1)"}]') === [], 'la relecture revalide');

if ($echecs > 0) {
    fwrite(STDERR, "$echecs échec(s) sur $total\n");
    exit(1);
}
echo "$total vérifications passées\n";
