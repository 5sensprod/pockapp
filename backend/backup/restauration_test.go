// backend/backup/restauration_test.go
//
// Gardiens de la restauration. C'est le geste le plus destructeur de
// l'application : il remplace la base d'un magasin. Quatre règles le tiennent,
// et aucune ne se vérifie à la lecture.
//
//  1. une base restaurée dont l'empreinte ne correspond pas n'est JAMAIS mise
//     en attente — on refuse tant qu'on peut encore refuser sans rien casser ;
//  2. l'échange déplace les TROIS fichiers, `-wal` compris : laisser le
//     journal de l'ancienne base à côté de la nouvelle est une corruption
//     silencieuse ;
//  3. la base remplacée est ARCHIVÉE, jamais effacée ;
//  4. un marqueur sans fichier ne fait pas boucler l'application au démarrage.

package backup

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// preparerFluxDeTest fabrique un flux chiffré à partir d'octets arbitraires,
// précédés de la signature SQLite pour passer le contrôle de forme.
func preparerFluxDeTest(t *testing.T, cle []byte, id string, charge []byte) []byte {
	t.Helper()
	var chiffre bytes.Buffer
	if _, err := compresserEtChiffrer(bytes.NewReader(charge), &chiffre, cle, id); err != nil {
		t.Fatalf("chiffrement : %v", err)
	}
	return chiffre.Bytes()
}

func fausseBase() []byte {
	// Signature d'une base SQLite, puis du remplissage. Suffit à
	// verifierEnteteSQLite, qui ne lit que les 16 premiers octets.
	return append([]byte("SQLite format 3\x00"), bytes.Repeat([]byte("données"), 100)...)
}

// TestRestaurationRefuseUneEmpreinteDivergente est le gardien qui compte le
// plus : il empêche qu'une base fausse soit armée pour remplacer une vraie.
func TestRestaurationRefuseUneEmpreinteDivergente(t *testing.T) {
	dataDir := t.TempDir()
	cle := cleDeTest(t)
	flux := preparerFluxDeTest(t, cle, "snap", fausseBase())

	err := PreparerRestauration(
		dataDir, bytes.NewReader(flux), cle, "snap",
		"0000000000000000000000000000000000000000000000000000000000000000",
		RestaurationEnAttente{},
	)
	if err == nil {
		t.Fatal("une empreinte divergente a été acceptée")
	}
	if !strings.Contains(err.Error(), "empreinte") {
		t.Fatalf("erreur peu explicite : %v", err)
	}

	// Et RIEN ne doit rester derrière : ni base en attente, ni marqueur.
	if LireRestaurationEnAttente(dataDir) != nil {
		t.Fatal("un marqueur a été posé malgré le refus")
	}
	for _, nom := range []string{fichierEnAttente, fichierEnAttente + ".partiel"} {
		if _, err := os.Stat(filepath.Join(dataDir, nom)); err == nil {
			t.Fatalf("%s est resté sur le disque après un refus", nom)
		}
	}
}

// TestRestaurationRefuseCeQuiNEstPasUneBase ferme le cas où la clé serait
// bonne mais le contenu pas une base SQLite.
func TestRestaurationRefuseCeQuiNEstPasUneBase(t *testing.T) {
	dataDir := t.TempDir()
	cle := cleDeTest(t)
	flux := preparerFluxDeTest(t, cle, "snap", []byte("<html>page de connexion</html>"))

	err := PreparerRestauration(dataDir, bytes.NewReader(flux), cle, "snap", "", RestaurationEnAttente{})
	if err == nil {
		t.Fatal("un contenu qui n'est pas une base a été accepté")
	}
	if LireRestaurationEnAttente(dataDir) != nil {
		t.Fatal("un marqueur a été posé malgré le refus")
	}
}

// TestEchangeDeplaceLesTroisFichiers vérifie la règle 2, celle dont l'oubli
// corromprait la base sans rien dire.
func TestEchangeDeplaceLesTroisFichiers(t *testing.T) {
	dataDir := t.TempDir()
	cle := cleDeTest(t)

	// La base « en service », avec son WAL et son SHM.
	ancienne := append([]byte("SQLite format 3\x00"), []byte("ANCIENNE BASE")...)
	ecrire(t, filepath.Join(dataDir, "data.db"), ancienne)
	ecrire(t, filepath.Join(dataDir, "data.db-wal"), []byte("WAL DE L ANCIENNE"))
	ecrire(t, filepath.Join(dataDir, "data.db-shm"), []byte("SHM"))

	// Celle qui doit la remplacer.
	nouvelle := append([]byte("SQLite format 3\x00"), []byte("NOUVELLE BASE")...)
	flux := preparerFluxDeTest(t, cle, "snap", nouvelle)

	if err := PreparerRestauration(dataDir, bytes.NewReader(flux), cle, "snap", "",
		RestaurationEnAttente{ClientNom: "Test", Origine: "poste-test"}); err != nil {
		t.Fatalf("PreparerRestauration : %v", err)
	}

	// Avant l'échange, la base en service ne doit PAS avoir bougé.
	if !bytes.Equal(lire(t, filepath.Join(dataDir, "data.db")), ancienne) {
		t.Fatal("la base en service a été modifiée AVANT le redémarrage")
	}

	AppliquerRestaurationEnAttente(dataDir)

	// 1. La nouvelle est en place.
	if !bytes.Equal(lire(t, filepath.Join(dataDir, "data.db")), nouvelle) {
		t.Fatal("la base n'a pas été remplacée")
	}

	// 2. Le WAL de l'ANCIENNE ne traîne plus à côté de la nouvelle. C'est la
	//    règle qui évite la corruption silencieuse.
	for _, suffixe := range []string{"-wal", "-shm"} {
		if _, err := os.Stat(filepath.Join(dataDir, "data.db"+suffixe)); err == nil {
			t.Fatalf("data.db%s de l'ancienne base est resté en place", suffixe)
		}
	}

	// 3. L'ancienne est archivée, pas effacée.
	archives, _ := filepath.Glob(filepath.Join(dataDir, "avant-restauration-*"))
	if len(archives) != 1 {
		t.Fatalf("%d dossier(s) d'archive, 1 attendu", len(archives))
	}
	if !bytes.Equal(lire(t, filepath.Join(archives[0], "data.db")), ancienne) {
		t.Fatal("l'archive ne contient pas la base remplacée")
	}
	if !bytes.Equal(lire(t, filepath.Join(archives[0], "data.db-wal")), []byte("WAL DE L ANCIENNE")) {
		t.Fatal("le WAL de l'ancienne base n'a pas été archivé avec elle")
	}

	// 4. Désarmé : un second démarrage ne rejoue pas la restauration.
	if LireRestaurationEnAttente(dataDir) != nil {
		t.Fatal("le marqueur est resté : la restauration se rejouerait au prochain démarrage")
	}
	AppliquerRestaurationEnAttente(dataDir)
	if !bytes.Equal(lire(t, filepath.Join(dataDir, "data.db")), nouvelle) {
		t.Fatal("un second passage a modifié la base")
	}
}

// TestMarqueurSansFichierNeBoucleP as : un marqueur orphelin doit se désarmer
// tout seul, sinon chaque démarrage rejouerait un échec.
func TestMarqueurSansFichierSeDesarme(t *testing.T) {
	dataDir := t.TempDir()
	base := append([]byte("SQLite format 3\x00"), []byte("BASE")...)
	ecrire(t, filepath.Join(dataDir, "data.db"), base)
	ecrire(t, filepath.Join(dataDir, fichierMarqueur), []byte(`{"snapshot_id":"orphelin"}`))

	AppliquerRestaurationEnAttente(dataDir)

	if LireRestaurationEnAttente(dataDir) != nil {
		t.Fatal("le marqueur orphelin n'a pas été retiré")
	}
	if !bytes.Equal(lire(t, filepath.Join(dataDir, "data.db")), base) {
		t.Fatal("la base a été touchée alors qu'il n'y avait rien à restaurer")
	}
}

// TestAnnulationDesarme vérifie qu'on peut changer d'avis entre la préparation
// et le redémarrage.
func TestAnnulationDesarme(t *testing.T) {
	dataDir := t.TempDir()
	cle := cleDeTest(t)
	base := append([]byte("SQLite format 3\x00"), []byte("EN SERVICE")...)
	ecrire(t, filepath.Join(dataDir, "data.db"), base)

	flux := preparerFluxDeTest(t, cle, "snap", fausseBase())
	if err := PreparerRestauration(dataDir, bytes.NewReader(flux), cle, "snap", "", RestaurationEnAttente{}); err != nil {
		t.Fatalf("PreparerRestauration : %v", err)
	}
	if LireRestaurationEnAttente(dataDir) == nil {
		t.Fatal("rien n'a été armé")
	}

	if err := AnnulerRestauration(dataDir); err != nil {
		t.Fatalf("AnnulerRestauration : %v", err)
	}
	if LireRestaurationEnAttente(dataDir) != nil {
		t.Fatal("toujours armé après annulation")
	}
	if _, err := os.Stat(filepath.Join(dataDir, fichierEnAttente)); err == nil {
		t.Fatal("la base en attente est restée sur le disque")
	}

	AppliquerRestaurationEnAttente(dataDir)
	if !bytes.Equal(lire(t, filepath.Join(dataDir, "data.db")), base) {
		t.Fatal("la base a été remplacée malgré l'annulation")
	}
}

func ecrire(t *testing.T, chemin string, contenu []byte) {
	t.Helper()
	if err := os.WriteFile(chemin, contenu, 0o600); err != nil {
		t.Fatalf("écriture de %s : %v", chemin, err)
	}
}

func lire(t *testing.T, chemin string) []byte {
	t.Helper()
	b, err := os.ReadFile(chemin)
	if err != nil {
		t.Fatalf("lecture de %s : %v", chemin, err)
	}
	return b
}
