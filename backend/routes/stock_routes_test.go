package routes

import "testing"

func ptr(v float64) *float64 { return &v }

// La règle de calcul était côté client jusqu'au 19 août 2026. Elle y était
// testée ; elle doit l'être ici maintenant, sinon elle change de camp sans
// gardien.
func TestNextStock(t *testing.T) {
	cas := []struct {
		nom     string
		avant   float64
		mvt     StockMovementInput
		attendu float64
	}{
		{"un mouvement relatif s'ajoute", 10, StockMovementInput{Delta: ptr(-3)}, 7},
		{"un retour aussi", 10, StockMovementInput{Delta: ptr(2)}, 12},
		// L'inventaire ne corrige pas, il constate.
		{"le comptage pose sa valeur", 10, StockMovementInput{Absolute: ptr(4)}, 4},
		{
			"le comptage prime sur le mouvement",
			10,
			StockMovementInput{Absolute: ptr(4), Delta: ptr(99)},
			4,
		},
		// Un stock négatif dit qu'il s'est vendu plus que ce que la base croyait
		// détenir. L'écraser masquerait la cause.
		{"rien n'est plafonné à zéro", 1, StockMovementInput{Delta: ptr(-3)}, -2},
		// Un mouvement vide ne bouge rien plutôt que de remettre le stock à zéro.
		{"ni delta ni absolu ne change rien", 5, StockMovementInput{}, 5},
	}

	for _, c := range cas {
		if got := NextStock(c.avant, c.mvt); got != c.attendu {
			t.Errorf("%s : attendu %v, obtenu %v", c.nom, c.attendu, got)
		}
	}
}

// ⚠️ CE QUI N'EST PAS TESTÉ ICI, ET POURQUOI
//
// L'atomicité elle-même — deux ventes concurrentes du même produit qui
// retirent bien deux unités — n'a pas de test. Elle demanderait de démarrer un
// vrai PocketBase avec ses collections, harnais qui n'existe pas dans ce dépôt.
//
// Elle repose sur une propriété LUE dans la bibliothèque, v0.22.22 :
// `core/base.go:1035` pose `nonconcurrentDB.SetMaxOpenConns(1)`, et
// `daos/base.go:130` fait tourner `RunInTransaction` sur cette connexion.
// Si PocketBase est mis à jour, c'est ce point-là qu'il faut revérifier — pas
// ce fichier.
