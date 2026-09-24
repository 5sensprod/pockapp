// backend/hooks/product_search_text_hook.go
// ═══════════════════════════════════════════════════════════════════════════
// `search_text` SUIT LE PRODUIT, QUEL QUE SOIT LE CHEMIN D'ÉCRITURE
// ═══════════════════════════════════════════════════════════════════════════
//
// Même raison, et même niveau d'accroche, que `name_sort`
// (`product_name_sort_hook.go`) : le texte de recherche n'a d'intérêt que s'il
// est toujours juste. Sans ce hook, la migration remplirait les fiches d'hier et
// laisserait toute fiche créée ou renommée au comptoir INTROUVABLE — sans la
// moindre erreur, juste un zéro résultat.
//
// ⚠️ Accroché aux événements de MODÈLE, pas aux requêtes REST : c'est le seul
// niveau par lequel passent TOUS les chemins d'écriture, les écritures Go
// (`Dao()`) comprises. Voir le hook du tri pour le détail.
//
// Les champs propres du produit seulement : la marque et les catégories sont
// cherchées par relation, sur leur propre `name_sort`
// (`backend/catalog/searchkey`) — les recopier ici obligerait à réécrire des
// centaines de produits à chaque renommage.
package hooks

import (
	"pocket-react/backend/catalog/searchkey"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

// RegisterProductSearchTextHook maintient `search_text` sur `products`, à
// chaque écriture. À appeler dans main.go, à côté des autres hooks.
func RegisterProductSearchTextHook(pb *pocketbase.PocketBase) {
	pb.OnModelBeforeCreate("products").Add(func(e *core.ModelEvent) error {
		poserTexteDeRecherche(e.Model)
		return nil
	})
	pb.OnModelBeforeUpdate("products").Add(func(e *core.ModelEvent) error {
		poserTexteDeRecherche(e.Model)
		return nil
	})
}

// poserTexteDeRecherche écrit le texte dérivé. Silencieuse sur tout modèle qui
// n'est pas un enregistrement, et sur une base dont le schéma n'a pas encore le
// champ : le hook ne doit jamais faire échouer une écriture pour une valeur de
// recherche.
func poserTexteDeRecherche(model interface{}) {
	record, ok := model.(*models.Record)
	if !ok {
		return
	}
	if record.Collection().Schema.GetFieldByName("search_text") == nil {
		return
	}
	record.Set("search_text", searchkey.Texte(
		record.GetString("name"),
		record.GetString("designation"),
		record.GetString("sku"),
		record.GetString("barcode"),
	))
}
