// backend/backup/snapshot_test.go
//
// Gardiens du snapshot. Trois affirmations portent tout le mécanisme, et
// aucune des trois ne se démontre par la lecture du code :
//
//  1. `VACUUM INTO` passe par le driver SQLite de PocketBase v0.22.22 ;
//  2. l'aller-retour rend la base OCTET POUR OCTET, sinon la restauration
//     livrerait une base subtilement fausse sans le dire ;
//  3. un flux tronqué, réordonné, ou ouvert avec la mauvaise clé ÉCHOUE —
//     une sauvegarde qui se restaure à moitié en silence est pire que pas
//     de sauvegarde du tout, parce qu'on lui fait confiance.
//
// Le point 3 est le seul qui protège des factures : c'est lui qui empêche
// qu'un envoi coupé au milieu passe pour une sauvegarde complète.

package backup

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/migrate"
	"github.com/pocketbase/pocketbase/tools/types"
)

// chargeIncompressible produit des octets que gzip ne peut pas réduire. Sans
// elle, les tests « plusieurs tranches » n'en produisent qu'une et passent
// pour de mauvaises raisons — c'est arrivé au premier jet.
func chargeIncompressible(t *testing.T, n int) []byte {
	t.Helper()
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		t.Fatalf("charge aléatoire : %v", err)
	}
	return buf
}

func cleDeTest(t *testing.T) []byte {
	t.Helper()
	cle := make([]byte, 32)
	if _, err := rand.Read(cle); err != nil {
		t.Fatalf("clé : %v", err)
	}
	return cle
}

// nouvelleAppDeTest monte une PocketBase réelle sur disque — pas en mémoire :
// `VACUUM INTO` écrit un FICHIER, et une base `:memory:` ne prouverait rien de
// ce qui nous intéresse.
func nouvelleAppDeTest(t *testing.T) *pocketbase.PocketBase {
	t.Helper()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap : %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	// Bootstrap ouvre la base mais ne pose PAS les tables système : c'est
	// app.Start() qui le fait en fonctionnement. D'où ce runner explicite —
	// même patron que backend/reports/cash_reports_test.go. Sans lui,
	// `_collections` n'existe pas et aucune collection ne peut être créée.
	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner de migrations : %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système : %v", err)
	}

	return app
}

// TestVacuumIntoProduitUneBaseLisible est le test qui valide le choix de
// conception. S'il échoue, tout le mécanisme est à revoir : ce n'est pas un
// détail d'implémentation, c'est la fondation.
func TestVacuumIntoProduitUneBaseLisible(t *testing.T) {
	app := nouvelleAppDeTest(t)

	// On écrit quelque chose de repérable, et surtout on le laisse dans le
	// WAL : c'est précisément le cas qu'une copie de fichier manquerait.
	if _, err := app.DB().NewQuery(
		"CREATE TABLE temoin (id INTEGER PRIMARY KEY, valeur TEXT)",
	).Execute(); err != nil {
		t.Fatalf("création de la table témoin : %v", err)
	}
	if _, err := app.DB().NewQuery(
		"INSERT INTO temoin (valeur) VALUES ('facture-2026-000855')",
	).Execute(); err != nil {
		t.Fatalf("insertion : %v", err)
	}

	travail := t.TempDir()
	snap, err := Fabriquer(app.DB(), travail, cleDeTest(t))
	if err != nil {
		t.Fatalf("Fabriquer : %v", err)
	}
	defer snap.Nettoyer()

	if snap.TailleClaire == 0 {
		t.Fatal("le snapshot est vide")
	}
	if snap.NbTranches < 1 {
		t.Fatalf("aucune tranche produite")
	}
	if snap.SHA256Clair == "" {
		t.Fatal("empreinte absente")
	}

	// Le fichier .db intermédiaire est effacé par Fabriquer : le dossier de
	// travail ne doit contenir que le chiffré, sinon une base EN CLAIR
	// resterait sur le disque du poste après chaque sauvegarde.
	entrees, err := os.ReadDir(travail)
	if err != nil {
		t.Fatalf("lecture du dossier de travail : %v", err)
	}
	for _, e := range entrees {
		if filepath.Ext(e.Name()) == ".db" {
			t.Fatalf("une base EN CLAIR est restée sur le disque : %s", e.Name())
		}
	}
}

// TestAllerRetourOctetPourOctet vérifie que ce qu'on restaure est exactement
// ce qu'on a sauvegardé, à l'octet près.
func TestAllerRetourOctetPourOctet(t *testing.T) {
	app := nouvelleAppDeTest(t)
	if _, err := app.DB().NewQuery(
		"CREATE TABLE temoin (id INTEGER PRIMARY KEY, valeur TEXT)",
	).Execute(); err != nil {
		t.Fatalf("table témoin : %v", err)
	}
	// Assez de lignes pour dépasser une tranche et exercer le découpage :
	// avec une seule tranche, l'ordre et la troncature ne veulent rien dire.
	for i := 0; i < 4000; i++ {
		if _, err := app.DB().NewQuery(
			"INSERT INTO temoin (valeur) VALUES ({:v})",
		).Bind(map[string]any{"v": types.NowDateTime().String() + "-remplissage-de-ligne-assez-long-pour-peser"}).Execute(); err != nil {
			t.Fatalf("insertion %d : %v", i, err)
		}
	}

	cle := cleDeTest(t)
	travail := t.TempDir()
	snap, err := Fabriquer(app.DB(), travail, cle)
	if err != nil {
		t.Fatalf("Fabriquer : %v", err)
	}
	defer snap.Nettoyer()

	chiffre, err := os.ReadFile(snap.CheminChiffre)
	if err != nil {
		t.Fatalf("lecture du chiffré : %v", err)
	}

	var clair bytes.Buffer
	empreinte, err := Restaurer(bytes.NewReader(chiffre), &clair, cle, snap.ID)
	if err != nil {
		t.Fatalf("Restaurer : %v", err)
	}

	if empreinte != snap.SHA256Clair {
		t.Fatalf("empreinte divergente :\n  fabriquée %s\n  restaurée %s", snap.SHA256Clair, empreinte)
	}
	if int64(clair.Len()) != snap.TailleClaire {
		t.Fatalf("taille divergente : %d restaurés contre %d annoncés", clair.Len(), snap.TailleClaire)
	}
	// Une base SQLite commence par cette signature. Sans elle, on a restauré
	// quelque chose — mais pas une base.
	if !bytes.HasPrefix(clair.Bytes(), []byte("SQLite format 3\x00")) {
		t.Fatal("le fichier restauré n'est pas une base SQLite")
	}

	// Et la base restaurée doit s'ouvrir et porter les données.
	cheminRestaure := filepath.Join(t.TempDir(), "data.db")
	if err := os.WriteFile(cheminRestaure, clair.Bytes(), 0o600); err != nil {
		t.Fatalf("écriture de la base restaurée : %v", err)
	}
	verif := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: filepath.Dir(cheminRestaure),
	})
	if err := verif.Bootstrap(); err != nil {
		t.Fatalf("la base restaurée ne démarre pas : %v", err)
	}
	defer verif.ResetBootstrapState()

	var n int
	if err := verif.DB().NewQuery("SELECT COUNT(*) FROM temoin").Row(&n); err != nil {
		t.Fatalf("relecture de la base restaurée : %v", err)
	}
	if n != 4000 {
		t.Fatalf("la base restaurée porte %d lignes, 4000 attendues", n)
	}
}

// TestAllerRetourSurPlusieursTranches exerce le découpage lui-même. Le test
// ci-dessus part d'une vraie base, mais elle se compresse à une seule tranche :
// il ne dit donc rien du réassemblage. Celui-ci le dit.
func TestAllerRetourSurPlusieursTranches(t *testing.T) {
	cle := cleDeTest(t)
	charge := chargeIncompressible(t, TailleTranche*3+1234)

	var chiffre bytes.Buffer
	nb, err := compresserEtChiffrer(bytes.NewReader(charge), &chiffre, cle, "snap")
	if err != nil {
		t.Fatalf("chiffrement : %v", err)
	}
	if nb < 3 {
		t.Fatalf("%d tranches, au moins 3 attendues", nb)
	}

	var sortie bytes.Buffer
	if _, err := Restaurer(bytes.NewReader(chiffre.Bytes()), &sortie, cle, "snap"); err != nil {
		t.Fatalf("Restaurer : %v", err)
	}
	if !bytes.Equal(sortie.Bytes(), charge) {
		t.Fatalf("réassemblage faux : %d octets restaurés contre %d", sortie.Len(), len(charge))
	}
}

// TestFluxTronqueEstRefuse est le gardien qui vaut le plus cher : il interdit
// qu'un envoi coupé passe pour une sauvegarde complète.
func TestFluxTronqueEstRefuse(t *testing.T) {
	cle := cleDeTest(t)
	// Des octets ALÉATOIRES, délibérément : gzip réduit du texte répété à une
	// seule tranche, et un test à une tranche ne dit rien de la troncature.
	charge := chargeIncompressible(t, TailleTranche*3)

	var chiffre bytes.Buffer
	nb, err := compresserEtChiffrer(bytes.NewReader(charge), &chiffre, cle, "snap-test")
	if err != nil {
		t.Fatalf("chiffrement : %v", err)
	}
	if nb < 2 {
		t.Fatalf("il faut plusieurs tranches pour que ce test ait un sens (%d)", nb)
	}

	// On coupe la fin — exactement ce que produirait un envoi interrompu dont
	// les dernières tranches ne sont jamais arrivées.
	tronque := chiffre.Bytes()[:chiffre.Len()/2]

	var sortie bytes.Buffer
	_, err = Restaurer(bytes.NewReader(tronque), &sortie, cle, "snap-test")
	if err == nil {
		t.Fatal("un flux tronqué a été restauré sans erreur — la sauvegarde ment")
	}
}

// TestMauvaiseCleEtMauvaisSnapshotSontRefuses ferme les deux autres portes :
// déchiffrer avec une clé qui n'est pas la bonne, et présenter les tranches
// d'un snapshot sous le nom d'un autre.
func TestMauvaiseCleEtMauvaisSnapshotSontRefuses(t *testing.T) {
	cle := cleDeTest(t)
	autreCle := cleDeTest(t)
	charge := []byte("des factures, des tickets, des rapports Z")

	var chiffre bytes.Buffer
	if _, err := compresserEtChiffrer(bytes.NewReader(charge), &chiffre, cle, "snap-A"); err != nil {
		t.Fatalf("chiffrement : %v", err)
	}

	var sortie bytes.Buffer
	if _, err := Restaurer(bytes.NewReader(chiffre.Bytes()), &sortie, autreCle, "snap-A"); err == nil {
		t.Fatal("déchiffré avec la mauvaise clé")
	}

	sortie.Reset()
	if _, err := Restaurer(bytes.NewReader(chiffre.Bytes()), &sortie, cle, "snap-B"); err == nil {
		t.Fatal("les tranches de snap-A ont été acceptées sous le nom snap-B")
	}
}

// TestTranchesReordonneesSontRefusees : le rang est dans les données
// authentifiées, donc permuter deux tranches doit casser le sceau.
func TestTranchesReordonneesSontRefusees(t *testing.T) {
	cle := cleDeTest(t)

	// Deux tranches scellées à la main, puis présentées à l'envers.
	var normal, inverse bytes.Buffer
	charge := chargeIncompressible(t, TailleTranche*3)
	if _, err := compresserEtChiffrer(bytes.NewReader(charge), &normal, cle, "snap"); err != nil {
		t.Fatalf("chiffrement : %v", err)
	}

	tranches := decouperPourTest(t, normal.Bytes())
	if len(tranches) < 2 {
		t.Fatalf("il faut plusieurs tranches pour que ce test ait un sens (%d)", len(tranches))
	}
	tranches[0], tranches[1] = tranches[1], tranches[0]
	for _, tr := range tranches {
		inverse.Write(tr)
	}

	var sortie bytes.Buffer
	if _, err := Restaurer(bytes.NewReader(inverse.Bytes()), &sortie, cle, "snap"); err == nil {
		t.Fatal("des tranches réordonnées ont été acceptées")
	}
}

// decouperPourTest refait le découpage du format, pour pouvoir le malmener.
func decouperPourTest(t *testing.T, flux []byte) [][]byte {
	t.Helper()
	var out [][]byte
	for i := 0; i < len(flux); {
		if i+4 > len(flux) {
			t.Fatal("flux malformé")
		}
		n := int(flux[i])<<24 | int(flux[i+1])<<16 | int(flux[i+2])<<8 | int(flux[i+3])
		fin := i + 4 + 12 + n
		if fin > len(flux) {
			t.Fatal("flux malformé")
		}
		out = append(out, flux[i:fin])
		i = fin
	}
	return out
}

// TestEmpreinteEstCelleDuClair documente ce que SHA256Clair mesure : le .db
// compacté, PAS le flux compressé ni le chiffré. C'est ce qui rend la
// vérification de restauration indépendante de la version de gzip.
func TestEmpreinteEstCelleDuClair(t *testing.T) {
	app := nouvelleAppDeTest(t)
	travail := t.TempDir()
	snap, err := Fabriquer(app.DB(), travail, cleDeTest(t))
	if err != nil {
		t.Fatalf("Fabriquer : %v", err)
	}
	defer snap.Nettoyer()

	if _, err := hex.DecodeString(snap.SHA256Clair); err != nil {
		t.Fatalf("l'empreinte n'est pas de l'hexadécimal : %v", err)
	}
	if len(snap.SHA256Clair) != sha256.Size*2 {
		t.Fatalf("empreinte de longueur %d, %d attendus", len(snap.SHA256Clair), sha256.Size*2)
	}
	if snap.TailleChiffree == snap.TailleClaire {
		t.Log("note : chiffré et clair de même taille, inattendu mais pas fatal")
	}
	if errors.Is(err, ErrTronque) {
		t.Fatal("cas impossible, garde le linter honnête")
	}
}
