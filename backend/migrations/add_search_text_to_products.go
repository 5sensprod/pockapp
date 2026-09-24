// backend/migrations/add_search_text_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// UN TEXTE DE RECHERCHE POUR LE PRODUIT — SANS CASSE, SANS ACCENT
// ═══════════════════════════════════════════════════════════════════════════
//
// Le `LIKE` de SQLite ne connaît pas les accents : « eclat » ne trouvait pas
// « Éclat » (mesuré, `backend/routes/catalog_search_test.go`). Le pourquoi complet, et la
// règle de pliage, sont dans `backend/catalog/searchkey`.
//
// Ce fichier ajoute `products.search_text` et remplit la colonne pour les
// fiches déjà là. Le maintien à l'écriture est un hook
// (`backend/hooks/product_search_text_hook.go`) : sans lui, toute fiche créée ou
// renommée au comptoir resterait introuvable, sans la moindre erreur.
//
// ── Le backfill est du SQL, comme celui de `name_sort` ─────────────────────
//
// La colonne est DÉRIVÉE : passer par `SaveRecord` diffuserait ~3000 événements
// de modèle — donc autant d'invalidations de cache sur chaque poste connecté —
// et toucherait `updated`. Un UPDATE en transaction ne dit rien à personne.
// Idempotent : ne réécrit que les lignes dont la clé diffère, donc sans effet
// aux démarrages suivants. C'est aussi ce qui rattrape un `catalog-import -load`,
// dont l'application n'enregistre pas les hooks.
//
// ⚠️ `search_text` n'entre dans AUCUN checksum d'export et ne voyage pas vers le
// site : elle n'existe que pour le `LIKE`.
//
// Pas d'index : `LIKE '%mot%'` ne peut pas s'en servir, et ~3000 lignes se
// balayent en quelques millisecondes.
package migrations

import (
	"log"

	"pocket-react/backend/catalog/searchkey"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddSearchTextToProducts ajoute `search_text` sur products et remplit la
// colonne pour les fiches existantes.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection : placée avant,
// le champ serait détruit avec elle, sans erreur. Gardien : ordre_test.go.
func AddSearchTextToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddSearchTextToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("search_text") == nil {
		products.Schema.AddField(&schema.SchemaField{
			Name:    "search_text",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{},
		})
		if err := app.Dao().SaveCollection(products); err != nil {
			return err
		}
		log.Println("✅ Champ search_text ajouté sur products")
	}

	return backfillSearchText(app)
}

func backfillSearchText(app *pocketbase.PocketBase) error {
	type ligne struct {
		Id          string `db:"id"`
		Name        string `db:"name"`
		Designation string `db:"designation"`
		Sku         string `db:"sku"`
		Barcode     string `db:"barcode"`
		SearchText  string `db:"search_text"`
	}

	var lignes []ligne
	if err := app.Dao().DB().
		NewQuery(
			"SELECT id, COALESCE(name, '') AS name, COALESCE(designation, '') AS designation, " +
				"COALESCE(sku, '') AS sku, COALESCE(barcode, '') AS barcode, " +
				"COALESCE(search_text, '') AS search_text FROM products",
		).
		All(&lignes); err != nil {
		return err
	}

	aCorriger := make(map[string]string)
	for _, l := range lignes {
		cle := searchkey.Texte(l.Name, l.Designation, l.Sku, l.Barcode)
		if cle != l.SearchText {
			aCorriger[l.Id] = cle
		}
	}

	if len(aCorriger) == 0 {
		log.Println("✅ search_text déjà à jour sur products")
		return nil
	}

	if err := app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		for id, cle := range aCorriger {
			if _, err := tx.DB().Update(
				"products",
				dbx.Params{"search_text": cle},
				dbx.HashExp{"id": id},
			).Execute(); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}

	log.Printf("✅ search_text calculé pour %d ligne(s) de products", len(aCorriger))
	return nil
}
