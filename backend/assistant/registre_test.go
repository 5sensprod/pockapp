package assistant

import (
	"encoding/json"
	"testing"
)

func outilDeTest(nom string, niveau Niveau) Outil {
	return Outil{
		Nom:      nom,
		Niveau:   niveau,
		Executer: func(Contexte, json.RawMessage) Resultat { return Resultat{Final: true} },
	}
}

// GARDIEN — un outil d'écriture ou d'envoi ne s'enregistre pas tant que la
// confirmation du vendeur n'est pas codée. Lever ce refus, c'est avoir écrit
// le chemin de confirmation décrit en tête de `registre.go`.
func TestLeRegistreRefuseToutCeQuiNEstPasDeLaLecture(t *testing.T) {
	r := NouveauRegistre()
	if err := r.Enregistrer(outilDeTest("lire", Lecture)); err != nil {
		t.Fatalf("un outil de lecture est refusé : %v", err)
	}
	for _, niveau := range []Niveau{Ecriture, Envoi, "", "admin"} {
		if err := r.Enregistrer(outilDeTest("autre-"+string(niveau), niveau)); err == nil {
			t.Fatalf("un outil de niveau %q a été accepté", niveau)
		}
	}
	if _, connu := r.Trouver("autre-ecriture"); connu {
		t.Fatal("l'outil refusé est quand même dans le registre")
	}
}

func TestLeRegistreRefuseUnDoublonEtUnOutilIncomplet(t *testing.T) {
	r := NouveauRegistre()
	if err := r.Enregistrer(outilDeTest("lire", Lecture)); err != nil {
		t.Fatal(err)
	}
	if err := r.Enregistrer(outilDeTest("lire", Lecture)); err == nil {
		t.Fatal("un second outil du même nom a été accepté")
	}
	if err := r.Enregistrer(Outil{Nom: "sans-fonction", Niveau: Lecture}); err == nil {
		t.Fatal("un outil sans fonction a été accepté")
	}
}
