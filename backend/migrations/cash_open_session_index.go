package migrations

import (
	"log"
	"strings"

	"github.com/pocketbase/pocketbase"
)

const indexSessionOuverteUnique = "idx_cash_sessions_one_open"

// AddUniqueOpenSessionIndex garantit, DANS LA BASE, qu'une caisse n'a jamais
// deux sessions ouvertes à la fois. Le verrou de processus
// (backend/session_verrou.go) l'empêche déjà ; l'index est la ceinture.
//
// Idempotente. Si des doublons existent déjà, elle ne force rien : elle le dit
// dans le journal et laisse la base telle quelle (il faut d'abord fermer
// l'excédent, à la main) — créer l'index échouerait de toute façon.
func AddUniqueOpenSessionIndex(app *pocketbase.PocketBase) error {
	col, err := app.Dao().FindCollectionByNameOrId("cash_sessions")
	if err != nil {
		return nil // la collection n'existe pas encore : rien à faire
	}
	for _, idx := range col.Indexes {
		if strings.Contains(idx, indexSessionOuverteUnique) {
			return nil
		}
	}

	var doublons []struct {
		Caisse string `db:"cash_register"`
		N      int    `db:"n"`
	}
	err = app.Dao().DB().NewQuery(
		"SELECT cash_register, COUNT(*) AS n FROM cash_sessions WHERE status = 'open' GROUP BY cash_register HAVING n > 1",
	).All(&doublons)
	if err != nil {
		log.Printf("⚠️ index session ouverte : contrôle des doublons impossible (%v) — non posé", err)
		return nil
	}
	if len(doublons) > 0 {
		log.Printf("⚠️ index session ouverte NON posé : %d caisse(s) ont plusieurs sessions ouvertes — fermez l'excédent", len(doublons))
		return nil
	}

	col.Indexes = append(col.Indexes,
		"CREATE UNIQUE INDEX `"+indexSessionOuverteUnique+"` ON `cash_sessions` (`cash_register`) WHERE `status` = 'open'",
	)
	if err := app.Dao().SaveCollection(col); err != nil {
		log.Printf("⚠️ index session ouverte non posé : %v", err)
		return nil
	}
	log.Println("✅ Index unique « une session ouverte par caisse » posé")
	return nil
}
