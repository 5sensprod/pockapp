// backend/migrations/add_availability_to_products.go
// ═══════════════════════════════════════════════════════════════════════════
// LE MESSAGE DE DISPONIBILITÉ — CE QUE LE SITE DIT QUAND LE STOCK EST À ZÉRO
// ═══════════════════════════════════════════════════════════════════════════
//
// Demande du 24 septembre 2026. Le site affichait « Réappro » en dur dès que le
// stock neuf d'une fiche valait 0 ou moins. Or un magasin d'instruments a
// plusieurs raisons d'être à zéro, et le client veut les dire : « Sur
// commande », « Livraison prochaine », « Retour en octobre »…
//
// ── POURQUOI CE CHAMP REMPLACE `manage_stock` ──────────────────────────────
//
// `manage_stock` devait porter « cet article suit-il un stock ? ». Il n'a
// jamais été lu par personne, et la question a déjà sa réponse dans `type` :
// un service n'a pas de stock. Deux champs pour un même fait, sans rien qui les
// tienne d'accord. Le besoin réel, lui, n'était pas de savoir SI on suit un
// stock, mais CE QU'ON DIT quand il est vide — un réglage de vitrine, donc, pas
// de stock. Voir docs/DECISIONS.md, 2026-09-24.
//
// C'est le champ `availability` que le modèle cible avait noté en intuition
// (09-modele-cible.md, section Stock) : un champ métier neuf, « et pas la
// réintroduction du miroir stock_status ». Il arrive ici en TEXTE LIBRE plutôt
// qu'en énumération, sur décision du propriétaire : le magasin écrit ce qu'il
// veut, avec des suggestions de saisie côté formulaire.
//
// ── UN SEUL CHAMP, ET PAS DE BOOLÉEN ───────────────────────────────────────
//
// Contrairement à la mise en avant (`featured` + `featured_label`), il n'y a
// rien à cocher : le message n'a de sens QUE lorsque le stock est à zéro, et
// c'est le serveur du site qui juge ce moment (`catalog.php`). Un champ vide
// veut dire « le défaut du site », qui ne s'écrit NI ici, NI dans l'export, NI
// dans le serveur : il se décide au seul endroit qui l'affiche.
//
// ⚠️ Le message n'est JAMAIS affiché tant que le produit est en stock : le
// vendeur qui écrit « Sur commande » sur une fiche à 12 unités ne fait pas
// mentir la vitrine.
//
// ⚠️ Il ne décide pas de la publication — `status` reste seul juge — et ne
// porte ni prix ni quantité.
//
// ── LE TEXTE FINIT DANS LE DOM DU SITE ─────────────────────────────────────
//
// Sa longueur est bornée (60) : ce n'est pas un champ de description. La règle
// de normalisation est UNIQUE côté PocketApp
// (`frontend/lib/catalog/availability.ts`) et REVALIDÉE côté serveur
// (`server/lib/availability.php`) — un poste sur un vieux build n'est pas une
// hypothèse, celui du client en est un.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AvailabilityLabelMaxLength — la longueur du message, au schéma.
//
// Exportée pour la même raison que `FeaturedLabelMaxLength` : la même borne
// existe en TypeScript (`MAX_MESSAGE`) et en PHP (`AVAILABILITY_LABEL_MAX`), et
// une valeur écrite en dur ici finirait par diverger des deux autres sans que
// rien ne le dise. Gardien : backend/migrations/ordre_test.go.
const AvailabilityLabelMaxLength = 60

// AddAvailabilityToProducts ajoute `availability_label` sur products.
//
// Doit tourner APRÈS MigrateCatalogV2, qui recrée la collection : ajouter le
// champ avant le ferait détruire avec elle, sans erreur. Gardien :
// backend/migrations/ordre_test.go.
func AddAvailabilityToProducts(app *pocketbase.PocketBase) error {
	products, err := app.Dao().FindCollectionByNameOrId("products")
	if err != nil {
		log.Println("⚠️ AddAvailabilityToProducts: collection products introuvable")
		return nil // non bloquant : une base incomplète n'est pas une panne
	}

	if products.Schema.GetFieldByName("availability_label") != nil {
		log.Println("✅ availability_label déjà présent sur products")
		return nil
	}

	max := AvailabilityLabelMaxLength
	products.Schema.AddField(&schema.SchemaField{
		Name: "availability_label",
		Type: schema.FieldTypeText,
		// PAS `Required` : le message vide est le cas NORMAL — le site retombe sur
		// son défaut. Exiger une valeur obligerait à écrire un texte sur les
		// 3000 fiches.
		Options: &schema.TextOptions{Max: &max},
	})

	if err := app.Dao().SaveCollection(products); err != nil {
		return err
	}

	log.Println("✅ Champ availability_label ajouté sur products")
	return nil
}
