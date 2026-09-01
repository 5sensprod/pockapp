// backend/migrations/add_name_sort_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// UNE CLÉ DE TRI POUR LE NOM DU PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Le tri « Produit · A à Z » du catalogue partait déjà sur le bon champ ; ce
// qui était faux, c'est l'ORDRE que SQLite en tirait — collation BINARY, donc
// octets. Le détail mesuré est dans `backend/catalog/sortkey`.
//
// Ce fichier ajoute `products.name_sort`, son index, et remplit la colonne pour
// les fiches déjà là. Le maintien à l'écriture est un hook
// (`backend/hooks/product_name_sort_hook.go`) : sans lui, toute fiche créée au
// comptoir repartirait mal classée, et sans la moindre erreur.
//
// ── Pourquoi le backfill vit ICI, et pas dans une commande ─────────────────
//
// Le client installe un binaire ; il ne lance pas d'outil en ligne de commande.
// Une migration inscrite dans `RunMigrations` s'exécute au démarrage, chez lui,
// à la première ouverture de la version téléchargée — c'est le seul endroit qui
// atteigne sa base. Elle est idempotente : elle ne réécrit que les lignes dont
// la clé diffère, et ne fait donc rien aux démarrages suivants.
//
// ── Pourquoi le backfill passe par du SQL, et non par SaveRecord ───────────
//
// `name_sort` est une valeur DÉRIVÉE : elle ne change ni le nom, ni le prix, ni
// une relation. Passer par `SaveRecord` diffuserait 3028 événements de modèle
// — donc 3028 invalidations de cache sur chaque poste connecté (le temps réel
// est accroché aux événements de modèle, cf. CLAUDE.md) — et toucherait le
// champ `updated`, qui n'a aucune raison de bouger. Un UPDATE en transaction ne
// dit rien à personne, ce qui est exactement ce qu'on veut.
//
// ⚠️ `name_sort` n'entre dans AUCUN checksum d'export : elle ne voyage pas vers
// le site, elle n'existe que pour l'ORDER BY.
package migrations

import (
	"fmt"
	"log"

	"pocket-react/backend/catalog/sortkey"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// CollectionsAvecCleDeTri — les collections dont le nom se trie. Les quatre du
// catalogue : le défaut de collation ne dépend pas de la table, seulement du
// fait qu'on classe des libellés français. Doit rester la même liste que celle
// du hook (`backend/hooks/product_name_sort_hook.go`), sans quoi une collection
// serait remplie une fois par la migration puis laissée à dériver.
var CollectionsAvecCleDeTri = []string{
	"products",
	"brands",
	"categories",
	"suppliers",
}

func indexNameSort(collection string) string {
	return fmt.Sprintf(
		"CREATE INDEX idx_%s_name_sort ON %s (name_sort)",
		collection, collection,
	)
}

// AddNameSortToProducts ajoute `name_sort` sur les collections du catalogue,
// leur index, et remplit la colonne pour les fiches existantes.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée ces collections : placée
// avant, le champ serait détruit avec elles, sans erreur.
//
// Le nom a gardé son « ToProducts » d'origine : il est inscrit tel quel dans
// `RunMigrations`, et une migration ne se renomme pas pour élargir sa portée.
func AddNameSortToProducts(app *pocketbase.PocketBase) error {
	for _, nom := range CollectionsAvecCleDeTri {
		if err := ajouterCleDeTri(app, nom); err != nil {
			return err
		}
	}
	return nil
}

func ajouterCleDeTri(app *pocketbase.PocketBase, nom string) error {
	collection, err := app.Dao().FindCollectionByNameOrId(nom)
	if err != nil {
		log.Printf("⚠️ AddNameSortToProducts: collection %s introuvable", nom)
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if collection.Schema.GetFieldByName("name_sort") == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "name_sort",
			Type:    schema.FieldTypeText,
			System:  false,
			Options: &schema.TextOptions{},
		})

		if !contientIndex(collection.Indexes, indexNameSort(nom)) {
			collection.Indexes = append(collection.Indexes, indexNameSort(nom))
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Printf("✅ Champ name_sort ajouté sur %s", nom)
	}

	return backfillNameSort(app, nom)
}

func contientIndex(indexes types.JsonArray[string], recherche string) bool {
	for _, idx := range indexes {
		if idx == recherche {
			return true
		}
	}
	return false
}

// backfillNameSort recalcule la clé partout où elle diffère. Idempotente.
func backfillNameSort(app *pocketbase.PocketBase, nom string) error {
	type ligne struct {
		Id       string `db:"id"`
		Name     string `db:"name"`
		NameSort string `db:"name_sort"`
	}

	var lignes []ligne
	if err := app.Dao().DB().
		NewQuery(fmt.Sprintf(
			"SELECT id, name, COALESCE(name_sort, '') AS name_sort FROM %s", nom,
		)).
		All(&lignes); err != nil {
		return err
	}

	aCorriger := make(map[string]string)
	for _, l := range lignes {
		cle := sortkey.Cle(l.Name)
		if cle != l.NameSort {
			aCorriger[l.Id] = cle
		}
	}

	if len(aCorriger) == 0 {
		log.Printf("✅ name_sort déjà à jour sur %s", nom)
		return nil
	}

	if err := app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		for id, cle := range aCorriger {
			if _, err := tx.DB().Update(
				nom,
				dbx.Params{"name_sort": cle},
				dbx.HashExp{"id": id},
			).Execute(); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}

	log.Printf("✅ name_sort calculée pour %d ligne(s) de %s", len(aCorriger), nom)
	return nil
}
