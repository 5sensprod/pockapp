// backend/catalog/searchkey/searchkey.go
// ═══════════════════════════════════════════════════════════════════════════
// LA CLÉ DE RECHERCHE DU PRODUIT — SANS CASSE, SANS ACCENT
// ═══════════════════════════════════════════════════════════════════════════
//
// La recherche du catalogue (`buildCatalogProductsFilter`) part en `LIKE` sur
// SQLite, qui ne connaît PAS les accents : « e » n'est pas « é ». Mesuré le
// 24 septembre 2026 (`catalog_search_test.go`) : taper « eclat » ne trouvait pas
// « Éclat ». La casse d'un « É », elle, est pliée par ce build — mais s'en
// remettre à ce détail du moteur, c'est parier sur lui : la clé plie les deux.
//
// D'où une colonne dérivée, `products.search_text`, remplie une fois à
// l'écriture : les champs propres du produit (nom, désignation, référence,
// code-barres) pliés comme `sortkey`, et la requête est pliée de la même façon
// côté client (`frontend/lib/catalog/search-key.ts`). Les deux côtés du `LIKE`
// sont alors normalisés, et la comparaison ne dépend plus du moteur.
//
// La marque et les catégories n'y sont PAS recopiées : elles portent déjà leur
// propre `name_sort`, et la recherche les interroge par relation
// (`brand.name_sort`, `categories.name_sort`). Recopier leur nom ici obligerait
// à réécrire des centaines de produits à chaque renommage de catégorie, et le
// jour où un hook raterait un cas la recherche mentirait sans erreur.
//
// ⚠️ Le repli de « œ » et « æ » n'existe QUE dans cette clé, pas dans
// `sortkey` : « cœur » se trouve en tapant « coeur », mais le tri des noms n'en
// est pas modifié. Le repli doit rester le même qu'en TypeScript — cas partagés
// dans `searchkey_test.go` et `search-key.test.ts`.
//
// ⚠️ Comme `name_sort`, cette clé sert à CHERCHER, jamais à afficher ni à
// comparer une identité. Elle ne voyage pas vers le site.
package searchkey

import (
	"strings"

	"pocket-react/backend/catalog/sortkey"
)

var ligatures = strings.NewReplacer(
	"œ", "oe", "Œ", "oe",
	"æ", "ae", "Æ", "ae",
)

// Cle plie un texte : ligatures dépliées, accents retirés, minuscules,
// espaces normalisés.
func Cle(texte string) string {
	return sortkey.Cle(ligatures.Replace(texte))
}

// Texte assemble les champs propres d'un produit en une seule chaîne
// cherchable. Les champs vides ne laissent pas d'espace parasite.
func Texte(champs ...string) string {
	morceaux := make([]string, 0, len(champs))
	for _, champ := range champs {
		if cle := Cle(champ); cle != "" {
			morceaux = append(morceaux, cle)
		}
	}
	return strings.Join(morceaux, " ")
}
