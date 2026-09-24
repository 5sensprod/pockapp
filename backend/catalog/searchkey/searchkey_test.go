package searchkey

import "testing"

// Les mêmes cas que `frontend/lib/catalog/search-key.test.ts` : la clé existe
// des deux côtés du réseau, et une divergence ferait chercher sur une forme que
// la base ne porte pas — sans erreur, avec zéro résultat.
var casPartages = map[string]string{
	"Éclat":          "eclat",
	"ÉCLAT":          "eclat",
	"eclat":          "eclat",
	"Cœur de Lion":   "coeur de lion",
	"COEUR":          "coeur",
	"Æther":          "aether",
	"Guitare   FOLK": "guitare folk",
	"  Ukulélé  ":    "ukulele",
	"ABG S14SH":      "abg s14sh",
	"10\" CL Clear":  "10\" cl clear",
	"Crème brûlée":   "creme brulee",
	"":               "",
	"   ":            "",
}

func TestCleReplieCasseAccentsEtLigatures(t *testing.T) {
	for entree, attendu := range casPartages {
		if got := Cle(entree); got != attendu {
			t.Errorf("Cle(%q) = %q, attendu %q", entree, got, attendu)
		}
	}
}

func TestCleNeChangePasLeTriDesNoms(t *testing.T) {
	// La ligature n'est repliée que dans la clé de RECHERCHE : `sortkey` garde
	// « œ » tel quel, pour ne pas déplacer les noms déjà triés.
	if Cle("œ") == "œ" {
		t.Fatal("la clé de recherche doit déplier les ligatures")
	}
}

func TestTexteAssembleSansEspaceParasite(t *testing.T) {
	got := Texte("Guitare Éclat", "", "SKU 1", "  ", "3700000000000")
	attendu := "guitare eclat sku 1 3700000000000"
	if got != attendu {
		t.Fatalf("Texte = %q, attendu %q", got, attendu)
	}
	if Texte("", " ") != "" {
		t.Fatal("un produit sans aucun champ donne une clé vide")
	}
}
