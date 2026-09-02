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

	err := ClesDistinctes(cle, cle)
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

	if err := ClesDistinctes(majuscules, minuscules); err == nil {
		t.Fatal("la même clé, écrite en majuscules, a été acceptée")
	}
	if err := ClesDistinctes("  "+minuscules+"  ", minuscules); err == nil {
		t.Fatal("la même clé, entourée d'espaces, a été acceptée")
	}
}

// TestClesDistinctesPassent : le cas nominal ne doit pas être bloqué.
func TestClesDistinctesPassent(t *testing.T) {
	chiffrement := "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
	api := "0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff"

	if err := ClesDistinctes(chiffrement, api); err != nil {
		t.Fatalf("deux clés distinctes ont été refusées : %v", err)
	}
}

// TestCleAPIAbsenteNeBloquePas : un poste sans clé API configurée ne doit pas
// voir sa sauvegarde refusée par ce contrôle — il échouera plus loin, avec un
// message qui dit la vraie cause.
func TestCleAPIAbsenteNeBloquePas(t *testing.T) {
	if err := ClesDistinctes("a1b2c3d4", ""); err != nil {
		t.Fatalf("refus alors qu'aucune clé API n'est configurée : %v", err)
	}
	if err := ClesDistinctes("", ""); err != nil {
		t.Fatalf("refus alors qu'aucune des deux n'est configurée : %v", err)
	}
}

// TestCorrigerLesDeuxClesEnsembleEstAccepte est né d'un blocage réel, le
// 3 septembre 2026.
//
// Sortir d'une configuration fautive suppose de changer les DEUX clés dans le
// même geste : poser la clé API à sa bonne valeur, et une clé de chiffrement
// distincte. La première version du contrôle comparait chaque clé soumise à
// l'ANCIENNE valeur de l'autre — donc à la valeur fautive — et refusait la
// correction elle-même. L'écran disait « elles doivent être distinctes » alors
// que c'est exactement ce qu'on venait de saisir.
//
// La règle : le contrôle porte sur l'état FINAL, jamais sur ce qui est encore
// en base.
func TestCorrigerLesDeuxClesEnsembleEstAccepte(t *testing.T) {
	fautive := "87875a3997c75edb323328201a86e4fc38f03356e4b552a9d63bfe61c7686e11"
	neuve := "1b27791ca3896c06ef685ac563e70483f18f7ba0552027c2c5368a7d16ac067f"

	// L'état final : clé API = l'ancienne valeur fautive (elle est légitime en
	// tant que clé API), clé de chiffrement = une valeur neuve et distincte.
	if err := ClesDistinctes(neuve, fautive); err != nil {
		t.Fatalf("la correction simultanée des deux clés a été refusée : %v", err)
	}
}
