package sortkey

import "sort"
import "testing"

func TestCleDeplieAccentsEtCasse(t *testing.T) {
	cas := map[string]string{
		"Émetteur XSW":  "emetteur xsw",
		"écouvillon":    "ecouvillon",
		"10\" CL Clear": "10\" cl clear",
		"10\" CL clear": "10\" cl clear",
		"  A   B  ":     "a b",
		"":              "",
	}
	for entree, attendu := range cas {
		if got := Cle(entree); got != attendu {
			t.Errorf("Cle(%q) = %q, attendu %q", entree, got, attendu)
		}
	}
}

// C'est le défaut mesuré le 1er septembre 2026 : trié sur le nom brut, cet
// échantillon sort dans l'ordre des octets — les majuscules d'abord, les
// accents après « Z ».
func TestCleRangeCommeLAlphabet(t *testing.T) {
	noms := []string{"zoom", "Écran", "ampli", "Basse", "éclat"}

	brut := append([]string(nil), noms...)
	sort.Strings(brut)
	if brut[0] == "ampli" {
		t.Fatal("le tri binaire ne devrait PAS déjà donner l'ordre alphabétique")
	}

	parCle := append([]string(nil), noms...)
	sort.Slice(parCle, func(i, j int) bool { return Cle(parCle[i]) < Cle(parCle[j]) })

	attendu := []string{"ampli", "Basse", "éclat", "Écran", "zoom"}
	for i := range attendu {
		if parCle[i] != attendu[i] {
			t.Fatalf("ordre = %v, attendu %v", parCle, attendu)
		}
	}
}
