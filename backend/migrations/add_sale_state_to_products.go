// backend/migrations/add_sale_state_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// L'OPÉRATION COMMERCIALE EST UN CHAMP À PART — PAS UNE VALEUR DE PLUS
// ═══════════════════════════════════════════════════════════════════════════
//
// Demande : pouvoir marquer un produit `solde`, `promo`, ou rien (« normal »).
//
// ── Pourquoi PAS dans `commercial_state` ───────────────────────────────────
//
// `commercial_state` (add_commercial_state_to_products.go, DECISIONS
// 2026-08-24) dit ce que l'objet EST au regard de la vente : d'occasion, en
// location. Il est MONO-VALEUR, et ce choix repose sur une mesure : aucun
// produit n'est à la fois `used` et `rental` — 0 sur 3055.
//
// Cette mesure ne dit RIEN de `solde`/`promo`, et le bon sens du magasin dit
// même l'inverse : un instrument d'occasion soldé est un cas ordinaire, pas
// une bizarrerie. Verser `sale`/`promo` dans le même select le rendrait
// INEXPRIMABLE — on serait forcé de choisir entre « occasion » et « soldé ».
// Le rattraper demanderait `MaxSelect: 2`, donc un champ qui mélangerait deux
// axes indépendants dans un tableau, et chaque écran devrait alors distinguer
// « quelle valeur est de quel genre » à la lecture.
//
// Et les deux axes ne vivent pas au même rythme : la nature d'un objet ne
// change qu'une fois (on le reprend d'occasion), l'opération commerciale est
// TEMPORAIRE et se pose puis se retire par campagnes. Deux durées de vie, deux
// champs.
//
// ── La valeur par défaut est l'ABSENCE ─────────────────────────────────────
//
// « normal » ne s'écrit pas : `sale_state` vide VEUT DIRE normal. Même
// raisonnement que pour le neuf — imposer une valeur obligerait à écrire les
// ~3000 fiches du catalogue pour n'exprimer que « rien de particulier ». Le
// champ n'est donc pas `Required`, et il est mono-valeur : un produit est
// soldé OU en promotion, pas les deux (une remise ne se cumule pas avec
// elle-même).
//
// ⚠️ Ce champ NE DÉCIDE PAS de la publication, exactement comme
// `commercial_state` : c'est `status` qui tranche, et lui seul (DECISIONS,
// 2026-08-21). Un produit soldé se publie et se dépublie comme un autre.
//
// ⚠️ Il ne PORTE PAS DE PRIX. `price_ttc` reste le prix de vente ; ce champ
// n'est qu'une étiquette d'état. Le jour où une remise chiffrée est demandée,
// c'est un champ de plus (montant, ou pourcentage, et des dates), pas une
// valeur de plus ici.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// SaleStateValues — les opérations commerciales qu'un produit peut porter,
// hors « normal » (qui est l'absence de valeur).
//
// Exportée pour la même raison que `CommercialStateValues` : une seconde liste
// écrite ailleurs finirait par diverger de celle du schéma.
var SaleStateValues = []string{"sale", "promo"}

// AddSaleStateToProducts ajoute `sale_state` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection : ajouter le
// champ avant le ferait détruire avec elle, sans erreur. Gardien :
// backend/migrations/ordre_test.go.
func AddSaleStateToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddSaleStateToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("sale_state") != nil {
		log.Println("✅ sale_state déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name: "sale_state",
		Type: schema.FieldTypeSelect,
		Options: &schema.SelectOptions{
			MaxSelect: 1,
			Values:    SaleStateValues,
		},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ sale_state ajouté sur products (sale, promo)")
	return nil
}
