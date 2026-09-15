package routes

import "testing"

// L'URL du retrait n'est PAS un réglage de plus : elle se déduit de
// `site_catalog_url`, dont les deux fichiers sont voisins dans `server/api/`.
// Ce qui se déduit doit se vérifier — une adresse devinée posterait une
// suppression n'importe où.
func TestEndpointVoisin(t *testing.T) {
	cas := []struct {
		nom     string
		entree  string
		attendu string
		erreur  bool
	}{
		{
			nom:     "le voisin de products-sync.php",
			entree:  "https://axemusique.shop/server/api/products-sync.php",
			attendu: "https://axemusique.shop/server/api/catalog-delete.php",
		},
		{
			nom:     "une chaîne de requête ne suit pas le voisin",
			entree:  "https://axemusique.shop/server/api/products-sync.php?action=inventory",
			attendu: "https://axemusique.shop/server/api/catalog-delete.php",
		},
		{
			nom:     "les espaces autour du réglage sont tolérés",
			entree:  "  https://axemusique.shop/server/api/products-sync.php  ",
			attendu: "https://axemusique.shop/server/api/catalog-delete.php",
		},
		{
			// Sans cette garde, on posterait une suppression sur une adresse
			// inventée — ici « https://axemusique.shop/catalog-delete.php ».
			nom:    "un réglage qui ne désigne pas un .php est refusé",
			entree: "https://axemusique.shop/server/api/",
			erreur: true,
		},
		{
			nom:    "un réglage vide est refusé",
			entree: "",
			erreur: true,
		},
	}

	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			obtenu, err := endpointVoisin(c.entree, "catalog-delete.php")
			if c.erreur {
				if err == nil {
					t.Fatalf("erreur attendue, obtenu %q", obtenu)
				}
				return
			}
			if err != nil {
				t.Fatalf("erreur inattendue : %v", err)
			}
			if obtenu != c.attendu {
				t.Fatalf("attendu %q, obtenu %q", c.attendu, obtenu)
			}
		})
	}
}

// `legacy_id` finit en NOM DE RÉPERTOIRE côté serveur (`<kind>/<legacy_id>/`).
// La liste fermée est donc une garde de sécurité, pas une politesse.
func TestLegacyIDValide(t *testing.T) {
	valides := []string{
		"0eZtUIbYxLjkaZWe",    // identifiant NeDB
		"pa_3mwpkyre6yem22b3", // clé PocketApp
		"a",
	}
	for _, id := range valides {
		if !legacyIDValide(id) {
			t.Errorf("%q devrait être accepté", id)
		}
	}

	invalides := []string{
		"",
		"..",
		"../../etc/passwd",
		"pa_avec espace",
		"pa/slash",
		"pa.point",
	}
	for _, id := range invalides {
		if legacyIDValide(id) {
			t.Errorf("%q devrait être refusé", id)
		}
	}
}
