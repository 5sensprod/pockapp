// backend/migrations/add_discount_limit_to_users.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PLAFOND DE REMISE D'UN VENDEUR
// ═══════════════════════════════════════════════════════════════════════════
//
// Demande du 17 septembre 2026 : l'administrateur fixe, par utilisateur, le
// pourcentage de remise maximal qu'il peut accorder — en caisse, sur une
// facture et sur un devis.
//
// Deux champs, pour la même raison que `featured` / `featured_label` : un
// nombre seul ne distingue pas « 0 % autorisé » de « pas de plafond ».
//   - `discount_limit_enabled` (booléen) dit SI le plafond s'applique ;
//   - `max_discount_percent` (0 à 100) dit LEQUEL.
//
// Absent ou faux = aucun plafond : c'est l'état de tous les comptes existants,
// pour ne rien bloquer au magasin le jour de la mise à jour.
//
// ⚠️ Ces champs ne décident de RIEN côté React. La règle est en Go
// (`backend/remise`), appliquée par `POST /api/pos/ticket` et par les hooks
// de `invoices` et `quotes`.
//
// ── LA RÈGLE DE MISE À JOUR DE `users` ─────────────────────────────────────
// Un utilisateur modifie sa propre fiche (profil, avatar, mot de passe :
// `frontend/lib/queries/profile.ts`), mais PAS son rôle ni son plafond — sans
// quoi Jason lèverait sa propre limite par l'API REST. L'administrateur passe
// par `PATCH /api/users/:id`, qui écrit par le Dao et ignore cette règle.
package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

const regleMiseAJourUsers = `id = @request.auth.id && ` +
	`@request.data.role:isset = false && ` +
	`@request.data.company:isset = false && ` +
	`@request.data.discount_limit_enabled:isset = false && ` +
	`@request.data.max_discount_percent:isset = false`

func AddDiscountLimitToUsers(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		log.Printf("Collection users introuvable, plafond de remise ignoré")
		return nil
	}

	modifie := false

	if collection.Schema.GetFieldByName("discount_limit_enabled") == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "discount_limit_enabled",
			Type: schema.FieldTypeBool,
		})
		modifie = true
	}

	if collection.Schema.GetFieldByName("max_discount_percent") == nil {
		min, max := 0.0, 100.0
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "max_discount_percent",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: &min, Max: &max},
		})
		modifie = true
	}

	if collection.UpdateRule == nil || *collection.UpdateRule != regleMiseAJourUsers {
		collection.UpdateRule = types.Pointer(regleMiseAJourUsers)
		modifie = true
	}

	if !modifie {
		return nil
	}
	if err := app.Dao().SaveCollection(collection); err != nil {
		log.Printf("❌ Plafond de remise sur users : %v", err)
		return err
	}
	log.Println("✅ users : plafond de remise et règle de mise à jour posés")
	return nil
}
