// backend/migrations/add_web_links_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LES LIENS D'UNE FICHE — UN SEUL CHAMP, UNE LISTE ORDONNÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 15 septembre 2026. La fiche produit porte une section de liens :
// pages web (fiche constructeur, notice PDF, test en ligne) et vidéos YouTube.
//
// ── POURQUOI UN SEUL CHAMP JSON, ET PAS DEUX ───────────────────────────────
// Un champ `links` et un champ `videos` auraient imposé deux colonnes SQL, deux
// clés au contrat d'export, deux décodages dans `catalog.php` et deux blocs
// dans le site — pour une différence qui tient dans un mot. Le type est donc
// une DONNÉE de l'entrée (`kind`), pas une structure du schéma. L'ordre du
// tableau est l'ordre d'affichage, comme pour `gallery` : c'est le vendeur qui
// décide ce qui vient en premier.
//
// ── POURQUOI PAS UNE COLLECTION ────────────────────────────────────────────
// Ces liens n'ont ni vie propre, ni existence hors de leur fiche, ni requête
// qui les cherche : une relation ajouterait une collection à migrer, à
// exporter et à joindre, pour zéro usage. Ils suivent leur produit — y compris
// vers le site, où ils voyagent dans le corps du produit (§4.1 quater du
// contrat) et non par un lot à eux.
//
// ── CE QUI EST DANS LE CHAMP ───────────────────────────────────────────────
//
//	[{"kind":"link","url":"https://…","label":"Fiche constructeur"},
//	 {"kind":"video","url":"https://youtu.be/…","label":"Démo"}]
//
// `label` peut être vide — le site retombe alors sur le domaine. `url` est
// toujours en `https`, contrôlé à la saisie (`product-detail-form.ts`) puis à
// l'entrée du serveur (`products-sync.php`). L'identifiant d'une vidéo n'est
// PAS stocké : il se dérive de l'URL, et il se dérive au SEUL endroit qui
// l'affiche, le site.
//
// Le champ est ABSENT du corps d'export quand la liste est vide : sans cela
// les 2412 fiches publiées changeraient d'empreinte d'un coup et repartiraient
// en entier (`champsFacultatifs`, `catalog-export.ts`).
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// 16 Kio : environ deux cents entrées. Un plafond qui n'arrivera jamais en
// usage, et qui borne quand même ce qu'un poste peut écrire.
const tailleMaxWebLinks = 16384

// AddWebLinksToProducts ajoute `web_links` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection. Gardien :
// backend/migrations/ordre_test.go.
func AddWebLinksToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddWebLinksToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("web_links") != nil {
		log.Println("✅ web_links déjà présent sur products")
		return nil
	}

	products.Schema.AddField(&schema.SchemaField{
		Name:    "web_links",
		Type:    schema.FieldTypeJson,
		Options: &schema.JsonOptions{MaxSize: tailleMaxWebLinks},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ web_links ajouté sur products")
	return nil
}
