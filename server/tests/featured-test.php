<?php
/**
 * Tests de `lib/featured.php`, en ligne de commande :
 *
 *     php server/tests/featured-test.php
 *
 * ⚠️ NE PAS DÉPOSER sur le mutualisé : ce dossier ne sert qu'au poste de
 * développement. Le garde ci-dessous le rend muet en HTTP, par précaution.
 *
 * Les cas sont LES MÊMES que `frontend/lib/catalog/featured.test.ts` : la règle
 * existe des deux côtés du réseau, elle doit dire la même chose. Retoucher la
 * borne ou la normalisation d'un côté sans l'autre, c'est laisser le serveur
 * écrire ce que PocketApp refuse.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/featured.php';

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

// ── Le libellé ───────────────────────────────────────────────────────────────
verifier(featured_label_normalise('  Coup de cœur  ') === 'Coup de cœur', 'espaces de bord retirés');
verifier(featured_label_normalise("Spécial   rentrée\t2026") === 'Spécial rentrée 2026', 'suites d’espaces réduites');
verifier(featured_label_normalise("Notre\nsélection") === 'Notre sélection', 'une pastille est UNE ligne');
verifier(featured_label_normalise("Coup\u{00A0}de cœur") === 'Coup de cœur', 'l’espace insécable d’un copier-coller');

verifier(featured_label_normalise('') === null, 'vide : NULL, donc le défaut du site');
verifier(featured_label_normalise('   ') === null, 'que des espaces : NULL');
verifier(featured_label_normalise(null) === null, 'clé absente : NULL');
verifier(featured_label_normalise(42) === null, 'ce qui n’est pas un texte : NULL');

// La coupe, en CARACTÈRES et non en octets : une coupe au milieu d'un « œ »
// produirait une chaîne que `json_encode` refuserait ensuite, et `catalog.php`
// rendrait 500 sur un produit — pour un libellé trop long.
$long = str_repeat('œ', FEATURED_LABEL_MAX + 20);
$coupe = featured_label_normalise($long);
verifier(mb_strlen((string) $coupe) === FEATURED_LABEL_MAX, 'coupé à ' . FEATURED_LABEL_MAX . ' caractères');
verifier(json_encode(['l' => $coupe]) !== false, 'la coupe reste de l’UTF-8 valide');

// Coupé, pas refusé : un libellé trop long est une maladresse de saisie, pas
// une donnée dangereuse — contrairement à une URL, où le refus est la réponse.
verifier(featured_label_normalise(str_repeat('a', 500)) !== null, 'trop long : coupé, JAMAIS refusé');

// ── Ce que le site reçoit ────────────────────────────────────────────────────
verifier(featured_affiche(0, 'Notre sélection') === null, 'non mis en avant : null, même avec un libellé');
verifier(featured_affiche(false, null) === null, 'non mis en avant : null');
verifier(featured_affiche(1, null) === ['label' => null], 'en vitrine sans libellé : le site prendra SON défaut');
verifier(featured_affiche(1, '  À  découvrir ') === ['label' => 'À découvrir'], 'en vitrine, libellé normalisé');

// Le défaut n'est NI ici NI en base. S'il s'y invitait, le changer un jour
// demanderait de réécrire les fiches — et les deux copies divergeraient d'ici
// là. Même raison que l'identifiant d'une vidéo YouTube.
verifier(featured_affiche(1, null)['label'] === null, 'le libellé par défaut ne s’écrit pas côté serveur');
verifier(!defined('FEATURED_LABEL_DEFAUT'), 'aucun libellé par défaut n’est déclaré ici');

// Une colonne écrite par une version antérieure, ou à la main : elle repasse
// par la même normalisation que ce qui entre. Le site pose ce texte dans son DOM.
verifier(featured_affiche(1, "  <script>  ") === ['label' => '<script>'], 'la relecture normalise — l’échappement, lui, est au bundle React');

if ($echecs > 0) {
    fwrite(STDERR, "$echecs échec(s) sur $total\n");
    exit(1);
}
echo "$total vérifications passées\n";
