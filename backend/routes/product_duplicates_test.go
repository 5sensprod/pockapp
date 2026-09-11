package routes

import (
	"reflect"
	"testing"
)

var catalogueDoublons = []ProduitCandidat{
	{ID: "a", Designation: "Guitare  Folk", Sku: "GF-01", Barcode: "0123456789"},
	{ID: "b", Name: "Ampli Été", Sku: "AMP", Barcode: "999"},
	{ID: "c", Designation: "Capo", Sku: "gf-01"},
}

func champsDe(doublons []DoublonProduit) map[string][]string {
	sortie := map[string][]string{}
	for _, d := range doublons {
		sortie[d.Product.ID] = d.Fields
	}
	return sortie
}

func TestTrouverDoublons(t *testing.T) {
	t.Run("la désignation ignore casse et espaces répétés", func(t *testing.T) {
		got := champsDe(trouverDoublons(catalogueDoublons, IdentiteProduit{Designation: " guitare folk "}, ""))
		if !reflect.DeepEqual(got, map[string][]string{"a": {"designation"}}) {
			t.Fatalf("got %v", got)
		}
	})

	t.Run("sans désignation, le nom en tient lieu, accents compris", func(t *testing.T) {
		if got := champsDe(trouverDoublons(catalogueDoublons, IdentiteProduit{Designation: "AMPLI ÉTÉ"}, "")); len(got["b"]) != 1 {
			t.Fatalf("got %v", got)
		}
		// Depuis le 11 septembre 2026, l'accent retiré RESSEMBLE
		// (product_similarity.go) ; il ne rend toujours pas la fiche identique.
		if got := trouverDoublons(catalogueDoublons, IdentiteProduit{Designation: "Ampli Ete"}, ""); len(got) != 1 || got[0].Kind != "similar" {
			t.Fatalf("un accent retiré ne doit pas rendre identique : %v", got)
		}
	})

	t.Run("référence et code-barres : exacts, zéros de tête compris", func(t *testing.T) {
		got := champsDe(trouverDoublons(catalogueDoublons, IdentiteProduit{Sku: " GF-01", Barcode: "0123456789"}, ""))
		if !reflect.DeepEqual(got, map[string][]string{"a": {"sku", "barcode"}}) {
			t.Fatalf("got %v — la casse de la référence compte", got)
		}
		if got := trouverDoublons(catalogueDoublons, IdentiteProduit{Barcode: "123456789"}, ""); len(got) != 0 {
			t.Fatalf("0123456789 n'est pas 123456789 : %v", got)
		}
	})

	t.Run("la fiche en cours est exclue", func(t *testing.T) {
		if got := trouverDoublons(catalogueDoublons, IdentiteProduit{Sku: "GF-01"}, "a"); len(got) != 0 {
			t.Fatalf("got %v", got)
		}
	})

	t.Run("un champ vide ne correspond à rien", func(t *testing.T) {
		if !identiteVide(IdentiteProduit{Designation: "  ", Sku: " "}) {
			t.Fatal("identité blanche non reconnue")
		}
		if got := trouverDoublons(catalogueDoublons, IdentiteProduit{Designation: "Capo", Barcode: " "}, ""); len(got) != 1 {
			t.Fatalf("got %v — un code-barres vide aurait rapproché les fiches sans code", got)
		}
	})
}
