// backend/migrations/add_commercial_state_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// L'ÉTAT COMMERCIAL SORT DE L'ARBRE DES CATÉGORIES
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du propriétaire, 24 août 2026 : « Occasion » et « LOCATION »
// deviennent un champ du produit. Voir docs/DECISIONS.md.
//
// ── Pourquoi ce n'étaient pas des catégories ───────────────────────────────
//
// L'arbre cible est LOGISTIQUE : une catégorie dit ce que l'objet EST — ce
// qu'on range, ce qu'on compte, ce qu'on réassortit. « Occasion » et
// « LOCATION » disent comment il se VEND. Les garder comme branches force un
// choix qui n'a pas de bonne réponse : ranger un ukulélé d'occasion avec les
// ukulélés, ou avec les occasions ? On veut les deux — et surtout, on veut
// inventorier les ukulélés sans en oublier neuf.
//
// Mesuré sur la NeDB de production le 24 août 2026 : 10 produits en
// « Occasion », 9 en « LOCATION », et **18 des 19 n'ont AUCUNE autre
// catégorie**. C'est la démonstration du défaut : l'état commercial avait
// mangé le rangement.
//
// ── Un select mono-valeur, et pourquoi ce n'est pas un pari ────────────────
//
// Mesuré : AUCUN produit n'est à la fois en occasion et en location — 0 sur
// 3055. Un champ à valeur unique décrit donc exactement ce qui existe.
//
// Et il ne ferme pas la porte : PocketBase stocke un `select` en tableau JSON
// quel que soit `MaxSelect`. Passer à 2 le jour où un instrument d'occasion
// part en location est une migration d'une ligne, sans réécriture de données.
// L'inverse — partir d'un multi-valeurs « au cas où » — coûterait tout de
// suite, dans chaque écran et chaque filtre, un cas qui ne s'est jamais
// produit.
//
// ── La valeur par défaut est l'ABSENCE ─────────────────────────────────────
//
// Le neuf n'a pas de valeur : `commercial_state` vide VEUT DIRE neuf. C'est le
// cas des 3036 autres produits, et leur en imposer une obligerait à écrire
// 3036 enregistrements pour n'exprimer que « rien de particulier ». Le champ
// n'est donc pas `Required`.
//
// ⚠️ Ce champ NE DÉCIDE PAS de la publication. Un produit d'occasion se publie
// comme un autre ; c'est `status` qui tranche, et lui seul (DECISIONS,
// 2026-08-21). Croiser les deux ferait disparaître des pages sans que rien ne
// le dise.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// CommercialStateValues — les états qu'un produit peut porter, hors neuf.
//
// Exportée parce que l'import de reprise s'en sert pour convertir les
// catégories « Occasion » et « LOCATION » (backend/catalog/mapping), et qu'une
// seconde liste écrite ailleurs finirait par diverger de celle du schéma.
var CommercialStateValues = []string{"used", "rental"}

// AddCommercialStateToProducts ajoute `commercial_state` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection : ajouter le
// champ avant le ferait détruire avec elle, sans erreur.
func AddCommercialStateToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddCommercialStateToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("commercial_state") != nil {
		log.Println("✅ commercial_state déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name: "commercial_state",
		Type: schema.FieldTypeSelect,
		Options: &schema.SelectOptions{
			MaxSelect: 1,
			Values:    CommercialStateValues,
		},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ commercial_state ajouté sur products (used, rental)")
	return nil
}
