// backend/migrations/add_featured_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PRODUIT MIS EN AVANT — UN TROISIÈME AXE, ET SON LIBELLÉ
// ═══════════════════════════════════════════════════════════════════════════
//
// Demande du 15 septembre 2026 : pouvoir désigner une fiche comme « mise en
// avant » et lui faire porter une pastille dont le client écrit le texte —
// « Coup de cœur », « Spécial rentrée 2026 », « Notre sélection »…
//
// ── POURQUOI PAS UNE VALEUR DE `sale_state` ────────────────────────────────
//
// Exactement le raisonnement qui a séparé `sale_state` de `commercial_state`
// (add_sale_state_to_products.go), appliqué une fois de plus : un produit
// soldé PEUT être un coup de cœur, et c'est même le cas qu'on veut mettre en
// vitrine. Verser `featured` dans le select des opérations commerciales le
// rendrait INEXPRIMABLE — il faudrait choisir entre « Soldes » et « Coup de
// cœur ».
//
// Et les trois axes ne vivent pas au même rythme : ce que l'objet EST
// (`commercial_state`) ne change qu'une fois, l'opération commerciale
// (`sale_state`) se pose par campagnes, la mise en avant se pose et se retire
// à la semaine, au gré de la vitrine. Trois durées de vie, trois champs.
//
// ── POURQUOI DEUX CHAMPS, ET PAS UN SEUL TEXTE ─────────────────────────────
//
// « le libellé non vide VEUT DIRE mis en avant » aurait tenu dans un champ.
// C'est refusé pour une raison d'usage, pas d'esthétique : la demande dit
// « par défaut, Coup de cœur ». Avec un champ unique, cocher sans écrire est
// impossible — le client DOIT taper quelque chose pour que la pastille
// apparaisse, et effacer le texte pour la retirer la ferait disparaître au
// milieu d'une correction de frappe.
//
// Donc : `featured` (booléen) dit SI la pastille s'affiche, `featured_label`
// dit CE QU'ELLE PORTE. Le libellé vide est le cas NORMAL — c'est le site qui
// retombe alors sur « Coup de cœur », au seul endroit qui l'affiche, comme
// l'identifiant d'une vidéo YouTube se dérive au seul endroit qui l'affiche.
// Écrire le défaut dans la base ferait 3000 fiches portant un texte que
// personne n'a choisi, et rendrait impossible de changer ce défaut plus tard.
//
// ── LE LIBELLÉ EST UN TEXTE LIBRE, ET IL FINIT DANS LE DOM DU SITE ─────────
//
// Sa longueur est bornée ici (40) parce qu'une pastille n'est pas un champ de
// description : au-delà elle déborde de la carte. La règle de normalisation
// est UNIQUE côté PocketApp (`frontend/lib/catalog/featured.ts`) et REVALIDÉE
// côté serveur (`server/lib/featured.php`) — un poste sur un vieux build n'est
// pas une hypothèse, celui du client en est un.
//
// ⚠️ Ce champ NE DÉCIDE PAS de la publication : `status` reste seul juge, comme
// pour `sale_state`. Un produit mis en avant et dépublié part en `draft` et
// disparaît du site, pastille comprise.
//
// ⚠️ Il ne PORTE AUCUN PRIX et n'ouvre droit à aucune remise. C'est une
// étiquette de vitrine, rien d'autre.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// FeaturedLabelMaxLength — la longueur du libellé de pastille, au schéma.
//
// Exportée pour la même raison que `SaleStateValues` : la même borne existe en
// TypeScript (`MAX_LIBELLE`) et en PHP (`FEATURED_LABEL_MAX`), et une valeur
// écrite en dur ici finirait par diverger des deux autres sans que rien ne le
// dise. Gardien : backend/migrations/ordre_test.go.
const FeaturedLabelMaxLength = 40

// AddFeaturedToProducts ajoute `featured` et `featured_label` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection : ajouter les
// champs avant les ferait détruire avec elle, sans erreur. Gardien :
// backend/migrations/ordre_test.go.
func AddFeaturedToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddFeaturedToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	modifie := false

	if products.Schema.GetFieldByName("featured") == nil {
		// Un booléen, et NON un select à deux valeurs : il n'y a rien à nommer
		// ici, et un champ Bool absent vaut `false` — donc « pas mis en avant »,
		// qui est l'état des ~3000 fiches. Aucun rattrapage.
		products.Schema.AddField(&schema.SchemaField{
			Name:    "featured",
			Type:    schema.FieldTypeBool,
			Options: &schema.BoolOptions{},
		})
		modifie = true
	}

	if products.Schema.GetFieldByName("featured_label") == nil {
		max := FeaturedLabelMaxLength
		products.Schema.AddField(&schema.SchemaField{
			Name: "featured_label",
			Type: schema.FieldTypeText,
			// PAS `Required` : le libellé vide est le cas normal — le site
			// retombe sur son défaut. Exiger une valeur obligerait à écrire un
			// texte dès qu'on coche la case.
			Options: &schema.TextOptions{Max: &max},
		})
		modifie = true
	}

	if !modifie {
		log.Println("✅ featured / featured_label déjà présents sur products")
		return nil
	}

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champs featured et featured_label ajoutés sur products")
	return nil
}
