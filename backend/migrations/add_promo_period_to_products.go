// backend/migrations/add_promo_period_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LA PÉRIODE D'UNE PROMOTION — DEUX JOURS, PAS DEUX INSTANTS
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 10 septembre 2026. Un prix promo peut porter une date de début et
// une date de fin, bornes INCLUSES. Vides, la promo vaut tant que l'opération
// commerciale est posée — c'était la règle avant ces champs, elle reste celle de
// toutes les fiches existantes.
//
// ── POURQUOI DU TEXTE « AAAA-MM-JJ » ET PAS UN CHAMP DATE ──────────────────
// Un champ date PocketBase est un INSTANT UTC. « Fin le 30 septembre » saisi à
// Paris y deviendrait « 29 septembre 22:00Z », et chacun des trois lecteurs —
// la caisse (TypeScript), la tâche d'expiration (Go), `catalog.php` (PHP) —
// devrait refaire la conversion de fuseau, à l'identique, heure d'été
// comprise. Une date calendaire en texte se compare telle quelle, dans les
// trois langages, par simple ordre lexicographique.
//
// Le JOUR de référence est celui de Paris, donné par le serveur Go
// (`backend/promo/jour.go`) : la caisse ne lit jamais l'horloge du navigateur.
//
// Une promo dont la fin est passée REPASSE SEULE en « Plein tarif » : voir
// `backend/promo/expiration.go`.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// motifJour : une date calendaire, et rien d'autre. Un champ vide n'est pas
// contrôlé par le motif — il veut dire « sans borne ».
const motifJour = `^\d{4}-\d{2}-\d{2}$`

// AddPromoPeriodToProducts ajoute `promo_start` et `promo_end` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection. Gardien :
// backend/migrations/ordre_test.go.
func AddPromoPeriodToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddPromoPeriodToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	ajoute := false
	for _, nom := range []string{"promo_start", "promo_end"} {
		if products.Schema.GetFieldByName(nom) != nil {
			continue
		}
		products.Schema.AddField(&schema.SchemaField{
			Name:    nom,
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Pattern: motifJour},
		})
		ajoute = true
	}

	if !ajoute {
		log.Println("✅ promo_start et promo_end déjà présents sur products")
		return nil
	}

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champs promo_start et promo_end ajoutés sur products")
	return nil
}
