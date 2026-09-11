<?php
/**
 * Tests de `lib/promo.php`, en ligne de commande :
 *
 *     php server/tests/promo-test.php
 *
 * ⚠️ NE PAS DÉPOSER sur le mutualisé : ce dossier ne sert qu'au poste de
 * développement. Le garde ci-dessous le rend muet en HTTP, par précaution.
 *
 * Les cas de période sont LES MÊMES que `backend/promo/promo_test.go` et
 * `frontend/lib/pricing/promo-price.test.ts` : la règle existe en trois
 * langages, ses bornes doivent dire la même chose partout.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../lib/promo.php';

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

// ── Jour à Paris ─────────────────────────────────────────────────────────────
verifier(promo_jour_paris(new DateTimeImmutable('2026-09-30T22:30:00Z')) === '2026-10-01', 'été : 22:30Z est déjà le lendemain à Paris');
verifier(promo_jour_paris(new DateTimeImmutable('2026-12-31T23:30:00Z')) === '2027-01-01', 'hiver : 23:30Z est déjà le lendemain à Paris');
verifier(promo_jour_paris(new DateTimeImmutable('2026-12-31T22:30:00Z')) === '2026-12-31', 'hiver : 22:30Z est encore le jour même');

// ── Période, bornes incluses ────────────────────────────────────────────────
foreach ([
    ['', '', '2026-09-10', true],
    ['2026-09-10', '2026-09-20', '2026-09-10', true],
    ['2026-09-10', '2026-09-20', '2026-09-20', true],
    ['2026-09-10', '2026-09-20', '2026-09-09', false],
    ['2026-09-10', '2026-09-20', '2026-09-21', false],
    ['2026-09-10', '', '2026-12-31', true],
    ['', '2026-09-20', '2026-01-01', true],
] as [$debut, $fin, $jour, $attendu]) {
    verifier(promo_en_cours($debut, $fin, $jour) === $attendu, "promo_en_cours($debut, $fin, $jour)");
}

// ── Lecture des dates reçues ────────────────────────────────────────────────
verifier(promo_date(null) === null, 'date absente');
verifier(promo_date('') === null, 'date vide');
verifier(promo_date('2026-09-10') === '2026-09-10', 'date valide');
verifier(promo_date('2026-02-30') === false, 'jour inexistant');
verifier(promo_date('10/09/2026') === false, 'format français refusé');
verifier(promo_date('2026-09-10T00:00:00Z') === false, 'instant refusé');
verifier(promo_date(20260910) === false, 'nombre refusé');

// ── Prix promo affiché ──────────────────────────────────────────────────────
verifier(promo_active('promo', 499.0, 450.0, null, null, '2026-09-10') === ['price_ttc' => 450.0, 'ends_on' => null], 'promo sans période');
verifier(promo_active('sale', 499.0, 450.0, '2026-09-01', '2026-09-20', '2026-09-20') === ['price_ttc' => 450.0, 'ends_on' => '2026-09-20'], 'solde le dernier jour');
verifier(promo_active('promo', 499.0, 450.0, '2026-09-01', '2026-09-20', '2026-09-21') === null, 'promo expirée');
verifier(promo_active('promo', 499.0, 450.0, '2026-09-15', null, '2026-09-10') === null, 'promo programmée');
verifier(promo_active('', 499.0, 450.0, null, null, '2026-09-10') === null, 'plein tarif : prix promo inerte');
verifier(promo_active('promo', 499.0, null, null, null, '2026-09-10') === null, 'sans prix promo');
verifier(promo_active('promo', 499.0, 499.0, null, null, '2026-09-10') === null, 'prix promo égal au prix');
verifier(promo_active('promo', 0.0, 10.0, null, null, '2026-09-10') === null, 'prix nul');

// ── Opération affichée ──────────────────────────────────────────────────────
verifier(promo_etat_affiche('promo', null, null, '2026-09-10') === 'promo', 'sans période : telle quelle');
verifier(promo_etat_affiche('sale', null, '2026-09-09', '2026-09-10') === '', 'expirée : plein tarif');
verifier(promo_etat_affiche('promo', '2026-09-11', null, '2026-09-10') === '', 'programmée : pas encore');

// ── Stock B ─────────────────────────────────────────────────────────────────
verifier(stock_b_affiche(0, 499.0, 380.0) === null, 'pas de Stock B');
verifier(stock_b_affiche(2, 499.0, 380.0) === ['quantity' => 2, 'price_ttc' => 380.0], 'Stock B avec prix');
verifier(stock_b_affiche(1, 499.0, null) === ['quantity' => 1, 'price_ttc' => null], 'Stock B sans prix');
verifier(stock_b_affiche(1, 499.0, 520.0) === ['quantity' => 1, 'price_ttc' => null], 'prix B qui n’est pas une baisse');

if ($echecs > 0) {
    fwrite(STDERR, "$echecs échec(s) sur $total\n");
    exit(1);
}
echo "$total vérifications passées\n";
