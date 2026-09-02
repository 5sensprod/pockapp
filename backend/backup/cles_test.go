// backend/backup/cles_test.go
//
// Gardien de la séparation des clés.
//
// Le 2 septembre 2026, la clé API a été collée dans le champ « clé de
// chiffrement », sur deux postes. Tout fonctionnait : les sauvegardes
// partaient, se restauraient, les empreintes concordaient. Et pourtant la
// propriété centrale du dispositif était tombée — `clients.api_key` est
// stockée EN CLAIR dans le mini-SaaS et affichée dans son interface, donc le
// serveur détenait de quoi déchiffrer ce qu'il stockait.
//
// C'est le défaut le plus dangereux rencontré sur ce mécanisme : il ne
// produisait AUCUN symptôme. D'où ce gardien.

package backup

import (
	"strings"
	"testing"
)

func TestClesIdentiquesSontRefusees(t *testing.T) {
	cle := "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"

	err := clesDistinctes(cle, cle)
	if err == nil {
		t.Fatal("une clé de chiffrement égale à la clé API a été acceptée")
	}
	// Le message doit dire QUOI FAIRE, pas seulement que c'est refusé : il
	// s'affiche à quelqu'un qui vient de découvrir le problème.
	if !strings.Contains(err.Error(), "Générer") {
		t.Fatalf("le message ne dit pas comment réparer : %s", err)
	}
}

// TestCasseIgnoree : les deux clés sont de l'hexadécimal, et `AB12` désigne
// les mêmes octets que `ab12`. Une comparaison stricte laisserait passer une
// majuscule — et le trou se rouvrirait sans qu'on le voie.
func TestCasseIgnoree(t *testing.T) {
	minuscules := "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
	majuscules := strings.ToUpper(minuscules)

	if err := clesDistinctes(majuscules, minuscules); err == nil {
		t.Fatal("la même clé, écrite en majuscules, a été acceptée")
	}
	if err := clesDistinctes("  "+minuscules+"  ", minuscules); err == nil {
		t.Fatal("la même clé, entourée d'espaces, a été acceptée")
	}
}

// TestClesDistinctesPassent : le cas nominal ne doit pas être bloqué.
func TestClesDistinctesPassent(t *testing.T) {
	chiffrement := "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
	api := "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff"

	if err := clesDistinctes(chiffrement, api); err != nil {
		t.Fatalf("deux clés distinctes ont été refusées : %v", err)
	}
}

// TestCleAPIAbsenteNeBloquePas : un poste sans clé API configurée ne doit pas
// voir sa sauvegarde refusée par ce contrôle — il échouera plus loin, avec un
// message qui dit la vraie cause.
func TestCleAPIAbsenteNeBloquePas(t *testing.T) {
	if err := clesDistinctes("a1b2c3d4", ""); err != nil {
		t.Fatalf("refus alors qu'aucune clé API n'est configurée : %v", err)
	}
	if err := clesDistinctes("", ""); err != nil {
		t.Fatalf("refus alors qu'aucune des deux n'est configurée : %v", err)
	}
}
