// backend/backup/selectif_reel_test.go
//
// La restauration sélective, exercée sur une VRAIE base client.
//
// Ignoré par défaut, comme `reel_test.go` : il demande qu'on lui désigne une
// base par POCKETAPP_BASE_REELLE. Un test qui dépend d'un fichier hors dépôt ne
// doit jamais faire échouer la suite de quelqu'un qui ne l'a pas.
//
//	POCKETAPP_BASE_REELLE="…/lundi_31_08/data.db" go test ./backend/backup/ -run SelectiveReelle -v
//
// ─── Ce qu'aucun test synthétique ne peut établir ──────────────────────────
// Que sur 3000 produits et 460 catégories réels — avec leurs factures, leurs
// tickets, leurs rapports Z et leurs sessions à côté —, l'écart calculé soit
// EXACTEMENT ce qu'on a semé, et que l'écriture ne touche rien d'autre. C'est
// la promesse de l'écran ; elle se mesure, elle ne se déduit pas.
//
// Le scénario est celui de la recette : deux copies de la même base, on
// travaille dans l'une (rangement, dépublication, désignation), on en fait un
// snapshot, et on ramène ce travail dans l'autre.

package backup

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
)

// copierBaseReelle copie le socle dans un dossier neuf. On travaille TOUJOURS
// sur une copie : ouvrir une base SQLite replie son WAL, donc l'ouvrir modifie
// les fichiers. Le socle ne doit pas bouger.
func copierBaseReelle(t *testing.T, source, dossier string) string {
	t.Helper()

	if err := os.MkdirAll(dossier, 0o700); err != nil {
		t.Fatalf("mkdir : %v", err)
	}
	copie := filepath.Join(dossier, "data.db")
	for _, suffixe := range []string{"", "-wal", "-shm"} {
		octets, err := os.ReadFile(source + suffixe)
		if err != nil {
			if suffixe == "" {
				t.Fatalf("lecture de la base : %v", err)
			}
			continue // -wal et -shm peuvent manquer, c'est normal
		}
		if err := os.WriteFile(copie+suffixe, octets, 0o600); err != nil {
			t.Fatalf("copie : %v", err)
		}
	}
	return copie
}

func compter(t *testing.T, app *pocketbase.PocketBase, requete string) int {
	t.Helper()
	var n int
	if err := app.DB().NewQuery(requete).Row(&n); err != nil {
		t.Fatalf("%s : %v", requete, err)
	}
	return n
}

func TestRestaurationSelectiveReelle(t *testing.T) {
	socle := os.Getenv("POCKETAPP_BASE_REELLE")
	if socle == "" {
		t.Skip("POCKETAPP_BASE_REELLE non défini")
	}

	travail := t.TempDir()

	// ── La base « du client » : celle qu'on ne doit pas abîmer ─────────────
	copierBaseReelle(t, socle, filepath.Join(travail, "cible"))
	cible := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: filepath.Join(travail, "cible"),
	})
	if err := cible.Bootstrap(); err != nil {
		t.Fatalf("la base réelle ne s'ouvre pas : %v", err)
	}
	defer cible.ResetBootstrapState()

	// ── Le témoin : ce qui ne doit pas bouger ──────────────────────────────
	//
	// On prend une empreinte AVANT, sur tout ce que la restauration sélective
	// promet de ne pas toucher. Comparer les mêmes nombres après est ce qui
	// distingue « je crois que ça n'a rien cassé » de « je l'ai vérifié ».
	temoins := map[string]string{
		// Les tickets de caisse ne sont pas une table à part : ce sont des
		// `invoices` portant `is_pos_ticket` (backend/reports/cash_reports.go).
		"factures":        "SELECT COUNT(*) FROM invoices WHERE is_pos_ticket = 0",
		"tickets":         "SELECT COUNT(*) FROM invoices WHERE is_pos_ticket = 1",
		"rapports Z":      "SELECT COUNT(*) FROM z_reports",
		"sessions":        "SELECT COUNT(*) FROM cash_sessions",
		"mouvements":      "SELECT COUNT(*) FROM cash_movements",
		"produits":        "SELECT COUNT(*) FROM products",
		"catégories":      "SELECT COUNT(*) FROM categories",
		"images princ.":   "SELECT COUNT(*) FROM products WHERE image != '' AND image IS NOT NULL",
		"galeries":        "SELECT COUNT(*) FROM products WHERE gallery != '[]' AND gallery != '' AND gallery IS NOT NULL",
		"stock non nul":   "SELECT COUNT(*) FROM products WHERE stock != 0",
		"prix non nuls":   "SELECT COUNT(*) FROM products WHERE price_ttc != 0",
		"slugs non vides": "SELECT COUNT(*) FROM products WHERE slug != '' AND slug IS NOT NULL",
	}
	avant := map[string]int{}
	t.Log("─── la base réelle, avant ───")
	for nom, requete := range temoins {
		avant[nom] = compter(t, cible, requete)
		t.Logf("   %-15s : %d", nom, avant[nom])
	}

	// La somme des prix et des stocks : un compte identique ne prouverait rien
	// si les valeurs avaient bougé.
	var sommeAvant struct {
		Prix  float64 `db:"prix"`
		Stock float64 `db:"stock"`
	}
	if err := cible.DB().NewQuery(
		"SELECT COALESCE(SUM(price_ttc),0) AS prix, COALESCE(SUM(stock),0) AS stock FROM products",
	).One(&sommeAvant); err != nil {
		t.Fatalf("sommes : %v", err)
	}

	// ── La base « de développement » : on y fait le travail d'organisation ──
	copierBaseReelle(t, socle, filepath.Join(travail, "source"))
	source := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: filepath.Join(travail, "source"),
	})
	if err := source.Bootstrap(); err != nil {
		t.Fatalf("la copie de travail ne s'ouvre pas : %v", err)
	}

	// Le travail semé, en SQL direct : on fabrique un snapshot, pas un écran.
	//   • 7 catégories renommées
	//   • 11 produits dépubliés
	//   • 5 désignations réécrites
	// Et, pour vérifier que le bruit ne passe PAS, on salit aussi des champs
	// hors périmètre sur les mêmes fiches : nom, prix, slug.
	type semis struct {
		libelle string
		requete string
	}
	for _, s := range []semis{
		{"catégories renommées", `UPDATE categories SET name = name || ' [RANGÉ]'
			WHERE id IN (SELECT id FROM categories ORDER BY id LIMIT 7)`},
		{"produits dépubliés", `UPDATE products SET status = 'draft'
			WHERE id IN (SELECT id FROM products WHERE status = 'published' ORDER BY id LIMIT 11)`},
		{"désignations réécrites", `UPDATE products SET designation = 'DESIGN-2026'
			WHERE id IN (SELECT id FROM products ORDER BY id DESC LIMIT 5)`},
		{"BRUIT — noms salis", `UPDATE products SET name = name || ' [NE DOIT PAS PASSER]'
			WHERE id IN (SELECT id FROM products ORDER BY id LIMIT 11)`},
		{"BRUIT — prix salis", `UPDATE products SET price_ttc = 1
			WHERE id IN (SELECT id FROM products ORDER BY id LIMIT 11)`},
		{"BRUIT — slugs salis", `UPDATE products SET slug = 'slug-du-snapshot-' || id
			WHERE id IN (SELECT id FROM products ORDER BY id LIMIT 11)`},
		{"BRUIT — stock sali", `UPDATE products SET stock = 999
			WHERE id IN (SELECT id FROM products ORDER BY id LIMIT 11)`},
	} {
		if _, err := source.DB().NewQuery(s.requete).Execute(); err != nil {
			t.Fatalf("%s : %v", s.libelle, err)
		}
	}

	snapshot := filepath.Join(travail, "snapshot.db")
	if _, err := source.DB().NewQuery(
		"VACUUM INTO '" + filepath.ToSlash(snapshot) + "'",
	).Execute(); err != nil {
		t.Fatalf("VACUUM INTO : %v", err)
	}
	source.ResetBootstrapState()

	info, _ := os.Stat(snapshot)

	// ── 1. LA SIMULATION ───────────────────────────────────────────────────
	debut := time.Now()
	simulation, err := RestaurerSelectivement(cible, snapshot, "reel-test",
		OptionsSelectif{})
	if err != nil {
		t.Fatalf("simulation : %v", err)
	}
	dureeSimulation := time.Since(debut)

	t.Log("─── l'écart calculé ───")
	t.Logf("   snapshot           : %d Kio", info.Size()/1024)
	t.Logf("   durée              : %s", dureeSimulation.Round(time.Millisecond))
	t.Logf("   produits           : %d à changer, %d identiques, %d intacts, %d absents d'ici",
		simulation.Produits.AChanger, simulation.Produits.Identiques,
		simulation.Produits.NbIntactes, simulation.Produits.NbAbsentesCible)
	t.Logf("   par champ          : %v", simulation.Produits.ParChamp)
	t.Logf("   catégories         : %d à changer, %d identiques",
		simulation.Categories.AChanger, simulation.Categories.Identiques)
	t.Logf("   repartiront en ligne : %d produits, %d catégories",
		simulation.Effet.ProduitsARepublier, simulation.Effet.CategoriesARepublier)

	// Exactement ce qui a été semé, et rien de plus. Un seul champ en trop —
	// `name`, `price_ttc`, `slug` — se verrait ici.
	if got := simulation.Categories.ParChamp["name"]; got != 7 {
		t.Errorf("catégories renommées : %d, attendu 7", got)
	}
	if got := simulation.Produits.ParChamp["status"]; got != 11 {
		t.Errorf("produits dépubliés : %d, attendu 11", got)
	}
	if got := simulation.Produits.ParChamp["designation"]; got != 5 {
		t.Errorf("désignations : %d, attendu 5", got)
	}
	if got := simulation.Produits.ParChamp["categories"]; got != 0 {
		t.Errorf("rangements : %d, attendu 0 (aucun n'a été semé)", got)
	}
	for _, interdit := range []string{"name", "price_ttc", "slug", "stock"} {
		if got := simulation.Produits.ParChamp[interdit]; got != 0 {
			t.Fatalf("LE CHAMP HORS PÉRIMÈTRE %q EST DANS L'ÉCART (%d fiches)", interdit, got)
		}
	}

	// La simulation n'a rien écrit.
	if simulation.Ecrites != 0 || simulation.SauvegardeAvant != "" {
		t.Fatalf("la simulation a écrit : %d, sauvegarde %q",
			simulation.Ecrites, simulation.SauvegardeAvant)
	}

	// ── 2. L'ÉCRITURE ──────────────────────────────────────────────────────
	debut = time.Now()
	applique, err := RestaurerSelectivement(cible, snapshot, "reel-test",
		OptionsSelectif{Appliquer: true, DossierSauvegarde: filepath.Join(travail, "sauvegardes")})
	if err != nil {
		t.Fatalf("écriture : %v", err)
	}
	dureeEcriture := time.Since(debut)

	attendu := 7 + 11 + 5
	// Les 11 dépubliés et les 5 redésignés sont des fiches distinctes (LIMIT
	// dans un sens et dans l'autre sur ~3000 produits), donc 23 écritures.
	if applique.Ecrites != attendu {
		t.Errorf("écritures = %d, attendu %d", applique.Ecrites, attendu)
	}
	if _, err := os.Stat(filepath.Join(applique.SauvegardeAvant, "data.db")); err != nil {
		t.Fatalf("la sauvegarde d'avant est introuvable : %v", err)
	}

	// ── 3. CE QUI NE DEVAIT PAS BOUGER N'A PAS BOUGÉ ───────────────────────
	t.Log("─── la base réelle, après ───")
	for nom, requete := range temoins {
		apres := compter(t, cible, requete)
		// Le nombre de produits publiés change, c'est le but ; les autres
		// témoins doivent être identiques au nombre près.
		if apres != avant[nom] {
			t.Errorf("%s : %d → %d, ce compte ne devait pas changer", nom, avant[nom], apres)
			continue
		}
		t.Logf("   %-15s : %d (inchangé)", nom, apres)
	}

	var sommeApres struct {
		Prix  float64 `db:"prix"`
		Stock float64 `db:"stock"`
	}
	if err := cible.DB().NewQuery(
		"SELECT COALESCE(SUM(price_ttc),0) AS prix, COALESCE(SUM(stock),0) AS stock FROM products",
	).One(&sommeApres); err != nil {
		t.Fatalf("sommes : %v", err)
	}
	if fmt.Sprintf("%.2f", sommeApres.Prix) != fmt.Sprintf("%.2f", sommeAvant.Prix) {
		t.Errorf("LA SOMME DES PRIX A BOUGÉ : %.2f → %.2f", sommeAvant.Prix, sommeApres.Prix)
	}
	if sommeApres.Stock != sommeAvant.Stock {
		t.Errorf("LA SOMME DES STOCKS A BOUGÉ : %.0f → %.0f", sommeAvant.Stock, sommeApres.Stock)
	}

	// Aucun slug du snapshot n'a atterri ici.
	if n := compter(t, cible,
		"SELECT COUNT(*) FROM products WHERE slug LIKE 'slug-du-snapshot-%'"); n != 0 {
		t.Fatalf("%d SLUG(S) DU SNAPSHOT ONT ÉTÉ ÉCRITS", n)
	}
	if n := compter(t, cible,
		"SELECT COUNT(*) FROM products WHERE name LIKE '%[NE DOIT PAS PASSER]%'"); n != 0 {
		t.Fatalf("%d NOM(S) DU SNAPSHOT ONT ÉTÉ ÉCRITS", n)
	}

	// ── 4. CE QUI DEVAIT REVENIR EST REVENU ────────────────────────────────
	if n := compter(t, cible,
		"SELECT COUNT(*) FROM categories WHERE name LIKE '%[RANGÉ]'"); n != 7 {
		t.Errorf("catégories renommées relues : %d, attendu 7", n)
	}
	if n := compter(t, cible,
		"SELECT COUNT(*) FROM products WHERE designation = 'DESIGN-2026'"); n != 5 {
		t.Errorf("désignations relues : %d, attendu 5", n)
	}

	// ── 5. REJOUER NE FAIT PLUS RIEN ───────────────────────────────────────
	//
	// L'opération est idempotente : une seconde passe ne trouve plus d'écart.
	// Sans quoi on ne saurait jamais si un écart affiché est du travail à
	// ramener ou le fantôme de la fois d'avant.
	rejeu, err := RestaurerSelectivement(cible, snapshot, "reel-test", OptionsSelectif{})
	if err != nil {
		t.Fatalf("rejeu : %v", err)
	}
	if rejeu.Produits.AChanger != 0 || rejeu.Categories.AChanger != 0 {
		t.Errorf("le rejeu voit encore un écart : %d produits, %d catégories",
			rejeu.Produits.AChanger, rejeu.Categories.AChanger)
	}

	t.Log("─── mesures ───")
	t.Logf("   simulation         : %s", dureeSimulation.Round(time.Millisecond))
	t.Logf("   écriture           : %s (%d enregistrements)",
		dureeEcriture.Round(time.Millisecond), applique.Ecrites)
	t.Logf("   sauvegarde d'avant : %s", applique.SauvegardeAvant)
}
