<?php
/**
 * Tests de `lib/availability.php`, en ligne de commande :
 *
 *     php server/tests/availability-test.php
 *
 * ⚠️ NE PAS DÉPOSER sur le mutualisé : ce dossier ne sert qu'au poste de
 * développement. Le garde ci-dessous le rend muet en HTTP, par précaution.
 *
 * Les cas de normalisation sont LES MÊMES que
 * `frontend/lib/catalog/availability.test.ts` : la règle existe des deux côtés
 * du réseau, elle doit dire la même chose. Retoucher la borne ou la
 * normalisation d'un côté sans l'autre, c'est laisser le serveur écrire ce que
 * PocketApp refuse.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/availability.php';

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

// ── Le message ───────────────────────────────────────────────────────────────
verifier(availability_label_normalise('  Sur commande  ') === 'Sur commande', 'espaces de bord retirés');
verifier(availability_label_normalise("Livraison\n  prochaine\t!") === 'Livraison prochaine !', 'sauts de ligne et suites d’espaces réduits');
verifier(availability_label_normalise("Sur\u{00A0}commande") === 'Sur commande', 'l’espace insécable d’un copier-coller');

verifier(availability_label_normalise('') === null, 'vide : NULL, donc le défaut du site');
verifier(availability_label_normalise('   ') === null, 'que des espaces : NULL');
verifier(availability_label_normalise(null) === null, 'clé absente : NULL');
verifier(availability_label_normalise(42) === null, 'ce qui n’est pas un texte : NULL');

// La coupe, en CARACTÈRES et non en octets : une coupe au milieu d'un « œ »
// produirait une chaîne que `json_encode` refuserait ensuite, et `catalog.php`
// rendrait 500 sur un produit — pour un message trop long.
$long = str_repeat('œ', AVAILABILITY_LABEL_MAX + 20);
$coupe = availability_label_normalise($long);
verifier(mb_strlen((string) $coupe) === AVAILABILITY_LABEL_MAX, 'coupé à ' . AVAILABILITY_LABEL_MAX . ' caractères');
verifier(json_encode(['l' => $coupe]) !== false, 'la coupe reste de l’UTF-8 valide');

// Coupé, pas refusé : une maladresse de saisie, pas une donnée dangereuse.
verifier(availability_label_normalise(str_repeat('a', 500)) !== null, 'trop long : coupé, JAMAIS refusé');

// ── Ce que le site reçoit ────────────────────────────────────────────────────
// Le message n'existe QUE stock à zéro : le serveur juge, pas le site.
verifier(availability_affiche(12, 'Sur commande') === null, 'en stock : rien, même avec un message');
verifier(availability_affiche(1, 'Sur commande') === null, 'une seule unité : en stock');
verifier(availability_affiche(0, 'Sur commande') === ['label' => 'Sur commande'], 'stock à zéro : le message');
verifier(availability_affiche(-2, 'Sur commande') === ['label' => 'Sur commande'], 'stock NÉGATIF (ordinaire en caisse) : le message aussi');
verifier(availability_affiche('0', 'Sur commande') === ['label' => 'Sur commande'], 'un stock lu comme chaîne par PDO');

// Rien d'écrit : rien de rendu, et le site retombe sur SON défaut.
verifier(availability_affiche(0, null) === null, 'stock à zéro sans message : null, le site prend son défaut');
verifier(availability_affiche(0, '   ') === null, 'un message d’espaces vaut absent');

// Un stock qui n'est pas un nombre n'est pas « à zéro ».
verifier(availability_affiche(null, 'Sur commande') === null, 'stock inconnu : on ne devine pas');

// Le défaut n'est NI ici NI en base. S'il s'y invitait, le changer un jour
// demanderait de réécrire les fiches — et les deux copies divergeraient.
verifier(!defined('AVAILABILITY_LABEL_DEFAUT'), 'aucun message par défaut n’est déclaré ici');

// Une colonne écrite par une version antérieure, ou à la main : elle repasse
// par la même normalisation que ce qui entre. Le site pose ce texte dans son DOM.
verifier(availability_affiche(0, "  <script>  ") === ['label' => '<script>'], 'la relecture normalise — l’échappement, lui, est au bundle React');

if ($echecs > 0) {
    fwrite(STDERR, "$echecs échec(s) sur $total\n");
    exit(1);
}
echo "$total vérifications passées\n";
