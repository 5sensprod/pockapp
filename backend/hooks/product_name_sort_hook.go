// backend/hooks/product_name_sort_hook.go
// ═══════════════════════════════════════════════════════════════════════════
// `name_sort` SUIT `name`, QUEL QUE SOIT LE CHEMIN D'ÉCRITURE
// ═══════════════════════════════════════════════════════════════════════════
//
// La clé de tri (`backend/catalog/sortkey`) n'a d'intérêt que si elle est
// toujours juste. Sans ce hook, la migration classerait correctement les fiches
// d'hier et laisserait toute fiche créée ou renommée au comptoir avec une clé
// vide ou périmée — donc en tête ou au mauvais endroit de la liste, sans la
// moindre erreur.
//
// ⚠️ Accroché aux événements de MODÈLE, pas aux requêtes REST. Les hooks
// `OnRecordBefore*Request` ne voient que l'API : ils rateraient les écritures
// Go faites par `Dao()` — l'import du catalogue, l'ajustement de stock, les
// migrations de reprise. Le niveau modèle est le seul par lequel passent TOUS
// les chemins d'écriture (c'est aussi celui auquel PocketBase accroche son
// temps réel, cf. `apis/realtime.go:257`).
package hooks

import (
	"pocket-react/backend/catalog/sortkey"
	"pocket-react/backend/migrations"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/models"
)

// RegisterProductNameSortHook maintient `name_sort` sur les quatre collections
// du catalogue, à chaque écriture. À appeler dans main.go, à côté des autres
// hooks.
//
// La liste des collections est celle de la migration
// (`migrations.CollectionsAvecCleDeTri`) : une seconde liste écrite ici
// finirait par en diverger, et la collection oubliée serait remplie une fois
// puis laissée à dériver — sans erreur, et invisible jusqu'à ce qu'un libellé
// nouvellement saisi se range au mauvais endroit.
func RegisterProductNameSortHook(pb *pocketbase.PocketBase) {
	for _, collection := range migrations.CollectionsAvecCleDeTri {
		pb.OnModelBeforeCreate(collection).Add(func(e *core.ModelEvent) error {
			poserCleDeTri(e.Model)
			return nil
		})

		pb.OnModelBeforeUpdate(collection).Add(func(e *core.ModelEvent) error {
			poserCleDeTri(e.Model)
			return nil
		})
	}
}

// poserCleDeTri écrit la clé dérivée du nom. Silencieuse sur tout modèle qui
// n'est pas un enregistrement : le hook ne doit jamais faire échouer une
// écriture pour une valeur d'affichage.
func poserCleDeTri(model interface{}) {
	record, ok := model.(*models.Record)
	if !ok {
		return
	}
	record.Set("name_sort", sortkey.Cle(record.GetString("name")))
}
