// backend/migrations/site_menu.go
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION - COLLECTION site_menu  (ticket 1)
// ═══════════════════════════════════════════════════════════════════════════
// Stockage local des entrées du menu de navigation d'axemusique.shop.
//
// Ce qui est stocké ici n'a PAS la forme de ce qui est publié. Le fichier
// publié est décrit par frontend/modules/site/PocketSite-docs/05-contrat-menu.md
// et se calcule à partir de cette collection au ticket 6 :
//
//	base (édition)              →  document publié (contrat)
//	────────────────────────────────────────────────────────────────────────
//	id (PocketBase)             →  items[].id
//	title                       →  items[].title
//	parent (relation)           →  items[].parent  (null à la racine)
//	position                    →  l'ordre du tableau items[], pas un champ
//	visible = false             →  entrée absente, elle et sa descendance (§4)
//	link_type + ref_id          →  items[].ref  {type, id}
//	link_type + link_url        →  items[].url, résolue à la publication (§3)
//
// Trois écarts assumés, et ils sont la raison d'être de ce commentaire :
//
//  1. `position` existe en base et pas dans le contrat. Le contrat dit que
//     l'ordre d'affichage est l'ordre d'apparition dans `items` (§2.3) ; une
//     table SQL n'a pas d'ordre, il lui faut un rang explicite. La publication
//     trie par `position` et laisse tomber le champ.
//  2. `visible` existe en base et pas dans le contrat. La visibilité est un
//     état d'édition (§4) : le fichier publié ne contient que ce qui s'affiche.
//  3. `url` publiée est *résolue*. En base on garde la référence (`link_type`
//     + `ref_id`) ; la résolution a lieu à la publication, dans PocketApp,
//     parce que PocketApp est le seul des trois dépôts à savoir ce qu'est une
//     catégorie (§3).
//
// `ref_id` est une chaîne opaque, délibérément : lequel des trois référentiels
// (AppPos, WooCommerce, PocketBase local) fait foi pour une destination est
// tranché au ticket 4, pas ici (§7 du contrat). Une relation PocketBase aurait
// figé cet arbitrage.
//
// Pas de champ `company` : le menu porte sur un site unique. Le multi-poste est
// explicitement reporté (§6 de 03-audit-resultats.md).
// ═══════════════════════════════════════════════════════════════════════════

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// LinkTypeValues énumère les origines possibles d'une destination.
//
// `none` et `manual` produisent `ref: null` dans le document publié ; les
// quatre autres correspondent un pour un aux `ref.type` du contrat (§3).
var LinkTypeValues = []string{
	"none",     // entrée porte-sous-menu, url publiée "#"
	"manual",   // lien libre saisi à la main, url publiée = link_url
	"category", // catégorie du catalogue
	"brand",    // marque
	"product",  // produit
	"page",     // page du site
}

// ensureSiteMenuCollection crée la collection site_menu si elle n'existe pas.
// Idempotente : si la collection est là, on la conserve telle quelle.
func ensureSiteMenuCollection(app *pocketbase.PocketBase) error {
	const collectionName = "site_menu"

	if _, err := app.Dao().FindCollectionByNameOrId(collectionName); err == nil {
		log.Println("📦 Collection 'site_menu' existe déjà")
		return nil
	}

	log.Println("📦 Création de la collection 'site_menu'...")

	collection := &models.Collection{
		Name:       collectionName,
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			// Libellé affiché. → items[].title
			&schema.SchemaField{
				Name:        "title",
				Type:        schema.FieldTypeText,
				Required:    true,
				Presentable: true,
				Options:     &schema.TextOptions{Min: types.Pointer(1), Max: types.Pointer(100)},
			},
			// Rang entre frères. Ne survit pas à la publication : il y devient
			// l'ordre du tableau items[] (§2.3 du contrat).
			&schema.SchemaField{
				Name:     "position",
				Type:     schema.FieldTypeNumber,
				Required: false,
			},
			// État d'édition. Une entrée masquée est absente du fichier publié,
			// elle et sa descendance (§4 du contrat).
			&schema.SchemaField{
				Name: "visible",
				Type: schema.FieldTypeBool,
			},
			// Origine de la destination. Discrimine ce qu'il faut lire ensuite :
			// link_url pour `manual`, ref_id pour les quatre types de référence,
			// ni l'un ni l'autre pour `none`.
			&schema.SchemaField{
				Name:     "link_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    LinkTypeValues,
				},
			},
			// URL saisie à la main. Chemin relatif ou URL absolue, comme
			// l'autorise §2.3 du contrat. Renseignée quand link_type = manual.
			&schema.SchemaField{
				Name:    "link_url",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			// Identifiant de la cible, chaîne opaque. Renseigné quand link_type
			// vaut category, brand, product ou page. → items[].ref.id
			&schema.SchemaField{
				Name:    "ref_id",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	// Auto-relation : le champ ne peut être ajouté qu'une fois l'ID connu.
	// CascadeDelete : supprimer une entrée supprime sa descendance. Sans quoi
	// on produirait des entrées orphelines, que le contrat interdit dans le
	// document publié (§4).
	collection.Schema.AddField(&schema.SchemaField{
		Name: "parent",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  collection.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: true,
		},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ Collection 'site_menu' créée")
	return nil
}
