// backend/backup/reel_test.go
//
// Mesure de la chaîne complète sur une VRAIE base client, pas sur une base
// fabriquée pour le test.
//
// Ignoré par défaut : il demande qu'on lui désigne une base par
// POCKETAPP_BASE_REELLE. C'est délibéré — un test qui dépend d'un fichier hors
// dépôt ne doit jamais faire échouer la suite de quelqu'un qui ne l'a pas.
//
//	POCKETAPP_BASE_REELLE="…/lundi_31_08/data.db" go test ./backend/backup/ -run Reelle -v
//
// Ce qu'il vérifie, et qu'aucun test synthétique ne peut vérifier : qu'une base
// PORTANT DES DONNÉES RÉELLES — ventes, factures, catalogue, WAL non replié —
// traverse la chaîne et revient identique. Il donne aussi les ordres de
// grandeur qui décident si le mécanisme est tenable au quotidien.

package backup

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
)

func TestChaineSurBaseReelle(t *testing.T) {
	source := os.Getenv("POCKETAPP_BASE_REELLE")
	if source == "" {
		t.Skip("POCKETAPP_BASE_REELLE non défini")
	}

	// On travaille sur une COPIE : ouvrir une base SQLite replie son WAL et
	// modifie donc les fichiers. Le socle ne doit pas bouger.
	travail := t.TempDir()
	copie := filepath.Join(travail, "data.db")
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

	avant, err := os.Stat(copie)
	if err != nil {
		t.Fatalf("stat : %v", err)
	}

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: travail})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("la base réelle ne s'ouvre pas : %v", err)
	}
	defer app.ResetBootstrapState()

	// Quelques comptages, pour que la mesure parle de données réelles et pas
	// d'octets anonymes.
	for _, table := range []string{"invoices", "pos_tickets", "z_reports", "products"} {
		var n int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM " + table).Row(&n); err == nil {
			t.Logf("   %-12s : %d", table, n)
		}
	}

	cle := cleDeTest(t)
	dossier := filepath.Join(travail, "sortie")

	debutFab := time.Now()
	snap, err := Fabriquer(app.DB(), dossier, cle)
	if err != nil {
		t.Fatalf("Fabriquer : %v", err)
	}
	defer snap.Nettoyer()
	dureeFab := time.Since(debutFab)

	chiffre, err := os.ReadFile(snap.CheminChiffre)
	if err != nil {
		t.Fatalf("lecture du chiffré : %v", err)
	}

	debutRes := time.Now()
	var clair bytes.Buffer
	empreinte, err := Restaurer(bytes.NewReader(chiffre), &clair, cle, snap.ID)
	if err != nil {
		t.Fatalf("Restaurer : %v", err)
	}
	dureeRes := time.Since(debutRes)

	if empreinte != snap.SHA256Clair {
		t.Fatalf("empreinte divergente sur une base réelle :\n  %s\n  %s", snap.SHA256Clair, empreinte)
	}

	// La base restaurée doit démarrer et se relire.
	dossierRestaure := filepath.Join(travail, "restauree")
	if err := os.MkdirAll(dossierRestaure, 0o700); err != nil {
		t.Fatalf("mkdir : %v", err)
	}
	if err := os.WriteFile(filepath.Join(dossierRestaure, "data.db"), clair.Bytes(), 0o600); err != nil {
		t.Fatalf("écriture : %v", err)
	}
	verif := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dossierRestaure})
	if err := verif.Bootstrap(); err != nil {
		t.Fatalf("la base RESTAURÉE ne démarre pas : %v", err)
	}
	defer verif.ResetBootstrapState()

	var factures int
	_ = verif.DB().NewQuery("SELECT COUNT(*) FROM invoices").Row(&factures)

	t.Log("─── mesures sur base réelle ───")
	t.Logf("   data.db d'origine  : %d Kio", avant.Size()/1024)
	t.Logf("   après VACUUM       : %d Kio", snap.TailleClaire/1024)
	t.Logf("   chiffré transporté : %d Kio  (%d tranches)", snap.TailleChiffree/1024, snap.NbTranches)
	t.Logf("   fabrication        : %s", dureeFab.Round(time.Millisecond))
	t.Logf("   restauration       : %s", dureeRes.Round(time.Millisecond))
	t.Logf("   factures relues    : %d", factures)
}
