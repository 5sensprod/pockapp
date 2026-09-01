// backend/catalog/sortkey/sortkey.go
// ═══════════════════════════════════════════════════════════════════════════
// LA CLÉ DE TRI DU NOM DE PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// SQLite — donc PocketBase — trie `ORDER BY name` en collation BINARY :
// l'ordre est celui des octets UTF-8, pas celui de l'alphabet. Mesuré le
// 1er septembre 2026 sur la base de développement (3028 produits) :
//
//   • 149 fiches commencent par une minuscule et sont donc rejetées APRÈS la
//     totalité des fiches en majuscule ;
//   • les accents passent après « Z » : en tri décroissant, la première page
//     n'est faite que de « émetteur… », « écouvillon… », « ÉTUDES… » ;
//   • au sein d'un même nom, « 10" CL Clear » est classé avant « 10" CL clear ».
//
// `COLLATE NOCASE` n'y suffirait pas : SQLite ne l'applique qu'à l'ASCII, les
// accents resteraient en fin de liste. D'où une clé dérivée, calculée une fois
// à l'écriture et stockée dans `products.name_sort`.
//
// ⚠️ Cette clé sert AU TRI, jamais à l'affichage ni à la comparaison
// d'identité : elle perd la casse et les accents, deux noms distincts peuvent
// donc la partager. C'est `name` qui reste le nom.
package sortkey

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// Cle rend la forme triable d'un nom : accents dépliés, minuscules, espaces
// normalisés. « Émetteur  XSW » et « emetteur xsw » donnent la même chaîne.
//
// La décomposition NFD sépare la lettre de son accent ; on retire ensuite les
// marques combinantes (catégorie Unicode Mn). C'est ce qui range « éclat »
// entre « ébène » et « écran » plutôt qu'après « zoom ».
func Cle(nom string) string {
	decompose := norm.NFD.String(nom)

	var b strings.Builder
	b.Grow(len(decompose))
	espaceEnAttente := false

	for _, r := range decompose {
		if unicode.Is(unicode.Mn, r) {
			continue // l'accent, séparé de sa lettre par la décomposition
		}
		if unicode.IsSpace(r) {
			// Les espaces répétés ne doivent pas changer l'ordre : « A  B » et
			// « A B » se trient au même endroit.
			espaceEnAttente = b.Len() > 0
			continue
		}
		if espaceEnAttente {
			b.WriteRune(' ')
			espaceEnAttente = false
		}
		b.WriteRune(unicode.ToLower(r))
	}

	return b.String()
}
