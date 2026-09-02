// backend/backup/storage_test.go
//
// Gardiens de l'inventaire du storage. Trois règles, et chacune a un coût
// précis si elle tombe :
//
//  1. les `.attrs` PARTENT — sans eux, PocketBase sert les images en
//     `application/octet-stream` et le navigateur les télécharge au lieu de
//     les afficher ;
//  2. les vignettes NE partent PAS — elles sont dérivées, PocketBase les
//     regénère, et les transporter gonfle le miroir pour rien ;
//  3. les chemins sortent en séparateurs `/`, même sous Windows — ils
//     nomment des dossiers sur un serveur Linux.

package backup

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// arbreStorageDeTest reproduit la forme réelle mesurée le 2 septembre 2026 :
// <collectionId>/<recordId>/<fichier>, plus un dossier de vignettes.
func arbreStorageDeTest(t *testing.T) string {
	t.Helper()
	dataDir := t.TempDir()

	fichiers := map[string]string{
		"storage/3h41uwjcnqvjk9m/003ka79z7felyot/methode_png_1754471692119_wDmqA0HWAM.png":       "octets image",
		"storage/3h41uwjcnqvjk9m/003ka79z7felyot/methode_png_1754471692119_wDmqA0HWAM.png.attrs": `{"user.content_type":"image/png"}`,
		"storage/3h41uwjcnqvjk9m/00l2rwcck6skqfh/crayon_jpg_1773828824661_STXVMZN8Zu.jpg":        "autre image",
		// Une vignette, dans son dossier dédié : ne doit PAS être inventoriée.
		"storage/3h41uwjcnqvjk9m/0h5pg15asdcmgme/thumbs_paws_jpg_x/100x100.jpg": "vignette",
		// Un fichier posé à la racine du storage : ni collection ni
		// enregistrement, ce n'est pas une pièce jointe.
		"storage/LISEZ-MOI.txt": "PocketBase",
	}

	for chemin, contenu := range fichiers {
		complet := filepath.Join(dataDir, filepath.FromSlash(chemin))
		if err := os.MkdirAll(filepath.Dir(complet), 0o700); err != nil {
			t.Fatalf("mkdir : %v", err)
		}
		if err := os.WriteFile(complet, []byte(contenu), 0o600); err != nil {
			t.Fatalf("écriture : %v", err)
		}
	}
	return dataDir
}

func TestInventaireStorage(t *testing.T) {
	dataDir := arbreStorageDeTest(t)

	fichiers, err := InventorierStorage(dataDir)
	if err != nil {
		t.Fatalf("InventorierStorage : %v", err)
	}

	vus := map[string]bool{}
	for _, f := range fichiers {
		vus[f.Chemin] = true

		// Règle 3 : jamais d'antislash, même produit sous Windows.
		if strings.Contains(f.Chemin, "\\") {
			t.Fatalf("chemin à antislash : %q — il nommera un dossier sous Linux", f.Chemin)
		}
		if f.Taille <= 0 {
			t.Fatalf("taille nulle pour %s", f.Chemin)
		}
	}

	// Règle 1 : l'image ET son .attrs.
	attendus := []string{
		"3h41uwjcnqvjk9m/003ka79z7felyot/methode_png_1754471692119_wDmqA0HWAM.png",
		"3h41uwjcnqvjk9m/003ka79z7felyot/methode_png_1754471692119_wDmqA0HWAM.png.attrs",
		"3h41uwjcnqvjk9m/00l2rwcck6skqfh/crayon_jpg_1773828824661_STXVMZN8Zu.jpg",
	}
	for _, a := range attendus {
		if !vus[a] {
			t.Errorf("absent de l'inventaire : %s", a)
		}
	}

	// Règle 2 : pas de vignette.
	for chemin := range vus {
		if strings.Contains(chemin, "thumbs_") {
			t.Errorf("une vignette a été inventoriée : %s", chemin)
		}
	}

	// Ni le fichier de racine.
	if vus["LISEZ-MOI.txt"] {
		t.Error("un fichier de la racine du storage a été inventorié")
	}

	if len(fichiers) != len(attendus) {
		t.Fatalf("%d fichiers inventoriés, %d attendus : %v", len(fichiers), len(attendus), vus)
	}
}

// TestInventaireStorageAbsent : une installation neuve n'a pas encore de
// `storage/`. Ce n'est pas une erreur, et ça ne doit pas faire échouer une
// sauvegarde.
func TestInventaireStorageAbsent(t *testing.T) {
	fichiers, err := InventorierStorage(t.TempDir())
	if err != nil {
		t.Fatalf("un storage absent ne doit pas être une erreur : %v", err)
	}
	if len(fichiers) != 0 {
		t.Fatalf("%d fichiers inventoriés sans storage", len(fichiers))
	}
}

// TestFichierStorageSceleParSonChemin vérifie que le chiffrement d'un fichier
// est lié à SON chemin : présenter les octets d'une image sous le nom d'une
// autre doit échouer. C'est ce qui empêche qu'un miroir mélangé remette la
// mauvaise image sur la mauvaise fiche.
func TestFichierStorageSceleParSonChemin(t *testing.T) {
	cle := cleDeTest(t)
	octets := []byte("les octets d'une image de produit")

	var chiffre bytes.Buffer
	if _, err := compresserEtChiffrer(bytes.NewReader(octets), &chiffre, cle, "col/rec/photo.png"); err != nil {
		t.Fatalf("chiffrement : %v", err)
	}

	// Sous son propre chemin : lisible.
	var bon bytes.Buffer
	if _, err := Restaurer(bytes.NewReader(chiffre.Bytes()), &bon, cle, "col/rec/photo.png"); err != nil {
		t.Fatalf("relecture sous le bon chemin : %v", err)
	}
	if bon.String() != string(octets) {
		t.Fatal("contenu altéré par l'aller-retour")
	}

	// Sous un autre : refusé.
	var mauvais bytes.Buffer
	if _, err := Restaurer(bytes.NewReader(chiffre.Bytes()), &mauvais, cle, "col/rec/autre.png"); err == nil {
		t.Fatal("les octets ont été acceptés sous le nom d'un AUTRE fichier")
	}
}
