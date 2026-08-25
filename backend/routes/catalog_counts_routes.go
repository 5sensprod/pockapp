// backend/routes/catalog_counts_routes.go
//
// LES DÉCOMPTES DU CATALOGUE, CALCULÉS OÙ VIVENT LES DONNÉES.
//
// ── LE DÉFAUT QUE CE FICHIER CORRIGE ──────────────────────────────────────
// Trois écrans du module `stock` affichaient des décomptes en balayant le
// catalogue ENTIER depuis le navigateur :
//
//	/stock/marques     `useProductCountsByBrand`   — 2999 produits
//	/stock/categories  `useProductIdsByCategory`   — 2999 produits
//	/stock/produits    `useProductIdsByCategory`   — 2999 produits
//
// Et `getFullList` du SDK n'est pas une requête : batch de 500 par défaut, et
// la page suivante ne part QU'APRÈS la réponse de la précédente (lu dans
// `node_modules/pocketbase/dist/pocketbase.es.mjs`, `request(i+1)` dans le
// `.then`). 2999 produits, c'est donc **six allers-retours HTTP en série**,
// puis 2999 objets JSON désérialisés — à chaque montage d'écran, et à chaque
// rechargement de l'application, où aucun cache client ne peut aider.
//
// Ici, une requête SQL locale et une réponse de quelques kilo-octets.
//
// ── POURQUOI LE TOTAL D'UNE BRANCHE EST CALCULÉ ICI ───────────────────────
// `useProductIdsByCategory` rendait des IDENTIFIANTS et non des décomptes,
// pour une raison qui n'a pas disparu : un produit rattaché à deux catégories
// sœurs ne doit compter qu'UNE fois dans leur ancêtre commun. Additionner des
// décomptes en remontant l'arbre donne un total faux.
//
// On ne peut donc pas se contenter de rendre `direct` et laisser le client
// remonter l'arbre — il lui manquerait de quoi dédoublonner. C'est pourquoi la
// route rend DEUX nombres par catégorie : `direct`, ce qui est rattaché au
// nœud lui-même, et `total`, les produits DISTINCTS de toute la
// sous-arborescence. Le dédoublonnage se fait par produit : on calcule
// l'ensemble de ses catégories ancêtres, ensemble par nature sans répétition,
// et on incrémente une fois chacune.
//
// C'est la même règle que `countsOf` côté React et que le §6 bis du contrat
// catalogue. Elle est désormais écrite UNE fois, et c'est le point : deux
// comptages écrits séparément finissent toujours par diverger.
//
// ── CE QUE CETTE ROUTE NE FAIT PAS ────────────────────────────────────────
// Elle ne filtre pas sur `status`. Les deux hooks qu'elle remplace ne le
// faisaient pas non plus : un brouillon compte dans les décomptes du module
// stock, qui est un écran de gestion et non la vitrine. Changer cela ici
// changerait des chiffres affichés sans que personne l'ait demandé.
//
// Pas de nouvelle sortie réseau : la route est locale, servie par le
// PocketBase embarqué (point 1 de CLAUDE.md).

package routes

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

// CategoryCounts — les deux nombres d'une catégorie.
type CategoryCounts struct {
	// Produits rattachés à CE nœud.
	Direct int `json:"direct"`
	// Produits distincts de la sous-arborescence, ce nœud compris.
	Total int `json:"total"`
}

type CatalogCountsOutput struct {
	ParMarque    map[string]int            `json:"par_marque"`
	ParCategorie map[string]CategoryCounts `json:"par_categorie"`
	// Le catalogue entier, sous le même filtre d'entreprise. Rendu parce que
	// l'appelant l'a sous la main gratuitement et qu'il évite une requête de
	// plus pour afficher « n produits ».
	TotalProduits int `json:"total_produits"`
}

// ligneProduit — le strict nécessaire. `sql.NullString` parce que les deux
// colonnes sont nulles pour un produit sans marque ni catégorie, et qu'un
// `string` échouerait au scan.
type ligneProduit struct {
	Brand      sql.NullString `db:"brand"`
	Categories sql.NullString `db:"categories"`
}

type ligneCategorie struct {
	ID     string         `db:"id"`
	Parent sql.NullString `db:"parent"`
}

func RegisterCatalogCountsRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/catalog/counts", func(c echo.Context) error {
		companyID := c.QueryParam("company")

		sortie, err := computeCatalogCounts(app, companyID)
		if err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"décomptes du catalogue indisponibles", err)
		}

		return c.JSON(http.StatusOK, sortie)
	}, apis.RequireRecordAuth())
}

func computeCatalogCounts(app *pocketbase.PocketBase, companyID string) (*CatalogCountsOutput, error) {
	db := app.Dao().DB()

	// ── Les catégories, pour pouvoir remonter l'arbre ──────────────────────
	var categories []ligneCategorie
	requeteCategories := db.Select("id", "parent").From("categories")
	if companyID != "" {
		requeteCategories = requeteCategories.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteCategories.All(&categories); err != nil {
		return nil, err
	}

	parentDe := make(map[string]string, len(categories))
	for _, categorie := range categories {
		parentDe[categorie.ID] = decodeUnRelation(categorie.Parent)
	}

	// ── Les produits, en une requête et deux colonnes ──────────────────────
	var produits []ligneProduit
	requeteProduits := db.Select("brand", "categories").From("products")
	if companyID != "" {
		requeteProduits = requeteProduits.Where(dbx.HashExp{"company": companyID})
	}
	if err := requeteProduits.All(&produits); err != nil {
		return nil, err
	}

	return agregerDecomptes(produits, parentDe), nil
}

// agregerDecomptes — la RÈGLE, séparée de la base pour être testée seule.
// Tout ce qui pouvait diverger d'un comptage à l'autre est ici.
func agregerDecomptes(produits []ligneProduit, parentDe map[string]string) *CatalogCountsOutput {
	sortie := &CatalogCountsOutput{
		ParMarque:     map[string]int{},
		ParCategorie:  map[string]CategoryCounts{},
		TotalProduits: len(produits),
	}

	// Réutilisé d'un produit à l'autre pour ne pas rallouer 2999 fois.
	ancetres := make(map[string]struct{}, 8)

	for _, produit := range produits {
		if marque := decodeUnRelation(produit.Brand); marque != "" {
			sortie.ParMarque[marque]++
		}

		directes := decodeRelationMultiple(produit.Categories)
		if len(directes) == 0 {
			continue
		}

		for cle := range ancetres {
			delete(ancetres, cle)
		}

		for _, categoryID := range directes {
			compte := sortie.ParCategorie[categoryID]
			compte.Direct++
			sortie.ParCategorie[categoryID] = compte

			// Remontée jusqu'à la racine. `ancetres` sert DEUX fois : il
			// dédoublonne le total — deux catégories sœurs partagent un ancêtre,
			// qui ne doit compter le produit qu'une fois — et il arrête la
			// remontée sur un cycle. Une donnée importée peut porter un parent
			// qui est aussi son propre descendant, et une boucle naïve tournerait
			// alors sans fin, requête pendue.
			courante := categoryID
			for courante != "" {
				if _, deja := ancetres[courante]; deja {
					break
				}
				ancetres[courante] = struct{}{}
				courante = parentDe[courante]
			}
		}

		for categoryID := range ancetres {
			compte := sortie.ParCategorie[categoryID]
			compte.Total++
			sortie.ParCategorie[categoryID] = compte
		}
	}

	return sortie
}

// decodeUnRelation — une relation `MaxSelect: 1` (`brand`, `supplier`,
// `categories.parent`).
//
// ⚠️ Le stockage n'est PAS garanti d'être une chaîne nue. Selon la façon dont
// la valeur a été écrite — import en masse, API REST, migration — la colonne
// peut porter `abc123` ou `["abc123"]`. Les deux formes sont acceptées ici
// plutôt que pariées : se tromper rendrait des décomptes tous à zéro, sans la
// moindre erreur.
func decodeUnRelation(valeur sql.NullString) string {
	ids := decodeRelationMultiple(valeur)
	if len(ids) == 0 {
		return ""
	}
	return ids[0]
}

// decodeRelationMultiple — une relation multiple (`categories`), stockée en
// tableau JSON. Tolère la chaîne nue, pour la raison ci-dessus.
func decodeRelationMultiple(valeur sql.NullString) []string {
	if !valeur.Valid || valeur.String == "" {
		return nil
	}

	brut := valeur.String
	if brut[0] != '[' {
		return []string{brut}
	}

	var ids []string
	if err := json.Unmarshal([]byte(brut), &ids); err != nil {
		// Un JSON illisible n'est pas une raison de refuser TOUS les décomptes :
		// la ligne est ignorée, les 2998 autres sont rendues.
		return nil
	}

	// `[""]` existe en base pour une relation vidée.
	filtres := ids[:0]
	for _, id := range ids {
		if id != "" {
			filtres = append(filtres, id)
		}
	}
	return filtres
}
