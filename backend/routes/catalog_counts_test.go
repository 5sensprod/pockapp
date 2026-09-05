// backend/routes/catalog_counts_test.go
//
// Ce qui est gardé ici, c'est la règle qui a coûté cher ailleurs : **le total
// d'une branche n'est PAS la somme des totaux de ses enfants.** Un produit
// rangé dans deux catégories sœurs ne compte qu'une fois dans leur ancêtre
// commun. C'est la même règle que `countsOf` côté React et que le §6 bis du
// contrat catalogue ; elle n'est plus écrite qu'une fois, et ce fichier est ce
// qui l'y maintient.

package routes

import (
	"database/sql"
	"testing"
	"time"
)

func texte(valeur string) sql.NullString {
	return sql.NullString{String: valeur, Valid: true}
}

// L'arbre des cas : racine › {gauche, droite}, et un nœud isolé.
var arbreDeTest = map[string]string{
	"racine": "",
	"gauche": "racine",
	"droite": "racine",
	"seule":  "",
}

func TestAgregerDecomptes(t *testing.T) {
	t.Run("un produit dans deux sœurs ne compte qu'une fois dans l'ancêtre", func(t *testing.T) {
		sortie := agregerDecomptes([]ligneProduit{
			{Categories: texte(`["gauche","droite"]`)},
		}, arbreDeTest)

		if got := sortie.ParCategorie["racine"].Total; got != 1 {
			t.Fatalf("total de la racine = %d, attendu 1 — la somme naïve aurait donné 2", got)
		}
		if got := sortie.ParCategorie["gauche"].Direct; got != 1 {
			t.Errorf("direct de gauche = %d, attendu 1", got)
		}
		if got := sortie.ParCategorie["droite"].Direct; got != 1 {
			t.Errorf("direct de droite = %d, attendu 1", got)
		}
		// L'ancêtre ne porte rien LUI-MÊME : `direct` et `total` sont deux
		// nombres distincts, et c'est tout l'intérêt d'en rendre deux.
		if got := sortie.ParCategorie["racine"].Direct; got != 0 {
			t.Errorf("direct de la racine = %d, attendu 0", got)
		}
	})

	t.Run("deux produits distincts s'additionnent, eux", func(t *testing.T) {
		sortie := agregerDecomptes([]ligneProduit{
			{Categories: texte(`["gauche"]`)},
			{Categories: texte(`["droite"]`)},
		}, arbreDeTest)

		if got := sortie.ParCategorie["racine"].Total; got != 2 {
			t.Fatalf("total de la racine = %d, attendu 2", got)
		}
	})

	t.Run("une branche sans produit n'apparaît pas", func(t *testing.T) {
		sortie := agregerDecomptes([]ligneProduit{
			{Categories: texte(`["gauche"]`)},
		}, arbreDeTest)

		if compte, present := sortie.ParCategorie["seule"]; present && compte.Total != 0 {
			t.Errorf("« seule » rend %+v, attendu absente ou vide", compte)
		}
	})

	t.Run("les marques se comptent", func(t *testing.T) {
		sortie := agregerDecomptes([]ligneProduit{
			{Brand: texte("fender")},
			{Brand: texte("fender")},
			{Brand: texte("gibson")},
			{Brand: sql.NullString{}}, // sans marque
		}, arbreDeTest)

		if got := sortie.ParMarque["fender"]; got != 2 {
			t.Errorf("fender = %d, attendu 2", got)
		}
		if got := sortie.ParMarque["gibson"]; got != 1 {
			t.Errorf("gibson = %d, attendu 1", got)
		}
		if _, present := sortie.ParMarque[""]; present {
			t.Error("un produit sans marque ne doit pas créer une marque vide")
		}
		if sortie.TotalProduits != 4 {
			t.Errorf("total = %d, attendu 4", sortie.TotalProduits)
		}
	})

	t.Run("les fournisseurs se comptent", func(t *testing.T) {
		sortie := agregerDecomptes([]ligneProduit{
			{Supplier: texte("algam")},
			{Supplier: texte(`["algam"]`)},
			{Supplier: texte("saico")},
			{Supplier: sql.NullString{}}, // sans fournisseur
		}, arbreDeTest)

		if got := sortie.ParFournisseur["algam"]; got != 2 {
			t.Errorf("algam = %d, attendu 2", got)
		}
		if got := sortie.ParFournisseur["saico"]; got != 1 {
			t.Errorf("saico = %d, attendu 1", got)
		}
		if _, present := sortie.ParFournisseur[""]; present {
			t.Error("un produit sans fournisseur ne doit pas créer un fournisseur vide")
		}
	})

	// Sans la garde, la remontée tournerait sans fin et la requête resterait
	// pendue — écran figé, pas message d'erreur.
	t.Run("un cycle dans l'arbre ne fige pas la remontée", func(t *testing.T) {
		cycle := map[string]string{"a": "b", "b": "a"}

		fini := make(chan *CatalogCountsOutput, 1)
		go func() {
			fini <- agregerDecomptes([]ligneProduit{
				{Categories: texte(`["a"]`)},
			}, cycle)
		}()

		select {
		case sortie := <-fini:
			// Les deux nœuds du cycle portent le produit, une fois chacun.
			if sortie.ParCategorie["a"].Total != 1 || sortie.ParCategorie["b"].Total != 1 {
				t.Errorf("totaux du cycle = a:%d b:%d, attendu 1 et 1",
					sortie.ParCategorie["a"].Total, sortie.ParCategorie["b"].Total)
			}
		case <-time.After(2 * time.Second):
			t.Fatal("la remontée n'a pas terminé : le cycle n'est pas gardé")
		}
	})
}

// Le décodage tolérant : parier sur une seule forme de stockage rendrait des
// décomptes tous à zéro, sans la moindre erreur.
func TestDecodeRelation(t *testing.T) {
	cas := []struct {
		nom     string
		valeur  sql.NullString
		attendu []string
	}{
		{"tableau JSON", texte(`["a","b"]`), []string{"a", "b"}},
		{"chaîne nue", texte("a"), []string{"a"}},
		{"tableau vide", texte(`[]`), nil},
		{"relation vidée", texte(`[""]`), nil},
		{"NULL", sql.NullString{}, nil},
		{"chaîne vide", texte(""), nil},
		{"JSON illisible", texte(`["a"`), nil},
	}

	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			got := decodeRelationMultiple(c.valeur)
			if len(got) != len(c.attendu) {
				t.Fatalf("%q → %v, attendu %v", c.valeur.String, got, c.attendu)
			}
			for i := range got {
				if got[i] != c.attendu[i] {
					t.Fatalf("%q → %v, attendu %v", c.valeur.String, got, c.attendu)
				}
			}
		})
	}

	if got := decodeUnRelation(texte(`["seul"]`)); got != "seul" {
		t.Errorf("decodeUnRelation sur un tableau → %q, attendu \"seul\"", got)
	}
	if got := decodeUnRelation(texte("seul")); got != "seul" {
		t.Errorf("decodeUnRelation sur une chaîne nue → %q, attendu \"seul\"", got)
	}
	if got := decodeUnRelation(sql.NullString{}); got != "" {
		t.Errorf("decodeUnRelation sur NULL → %q, attendu \"\"", got)
	}
}
