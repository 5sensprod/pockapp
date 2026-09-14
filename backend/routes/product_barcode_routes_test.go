package routes

import "testing"

// La clé est une règle arithmétique stable : quelques exemples publiés et les
// cas de bord valent mieux qu'un test qui recopierait seulement la boucle.
func TestEAN13(t *testing.T) {
	if got := CalculerCleEAN13("400638133393"); got != 1 {
		t.Fatalf("clé de 400638133393 : attendu 1, obtenu %d", got)
	}
	if got := CalculerCleEAN13("000000000000"); got != 0 {
		t.Fatalf("clé des douze zéros : attendu 0, obtenu %d", got)
	}

	for _, code := range []string{"4006381333931", "2000000000008"} {
		if !EAN13Valide(code) {
			t.Errorf("%s devrait être un EAN-13 valide", code)
		}
	}
	for _, code := range []string{"4006381333932", "123", "ABCDEFGHIJKLM"} {
		if EAN13Valide(code) {
			t.Errorf("%s ne devrait pas être accepté", code)
		}
	}
}

func TestGenerateurEAN13EcarteBaseEtPropositions(t *testing.T) {
	candidats := []string{
		"2000000000008", // déjà en base
		"2000000000015", // première proposition
		"2000000000015", // retiré une seconde fois : doit être réservé
		"2000000000022",
	}
	index := 0
	g := &generateurEAN13{
		proposes: make(map[string]struct{}),
		prochain: func() (string, error) {
			code := candidats[index]
			index++
			return code, nil
		},
	}
	existe := func(code string) (bool, error) {
		return code == "2000000000008", nil
	}

	premier, err := g.proposer(existe)
	if err != nil {
		t.Fatal(err)
	}
	second, err := g.proposer(existe)
	if err != nil {
		t.Fatal(err)
	}
	if premier != "2000000000015" || second != "2000000000022" {
		t.Fatalf("la base puis la proposition devaient être écartées : %q, %q", premier, second)
	}
}

func TestNouvelEAN13Interne(t *testing.T) {
	for i := 0; i < 100; i++ {
		code, err := nouvelEAN13Interne()
		if err != nil {
			t.Fatal(err)
		}
		if len(code) != 13 || code[:3] != prefixeEAN13Interne || !EAN13Valide(code) {
			t.Fatalf("code interne invalide : %q", code)
		}
	}
}
