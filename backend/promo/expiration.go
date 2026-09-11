// backend/promo/expiration.go
// ═══════════════════════════════════════════════════════════════════════════
// UNE PROMO EXPIRÉE REPASSE SEULE EN « PLEIN TARIF »
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du 10 septembre 2026. Le lendemain de sa date de fin, une fiche
// soldée ou en promotion est RÉÉCRITE : `sale_state` vide, prix promo à 0,
// période effacée. La fiche dit alors la vérité d'elle-même, au lieu de
// montrer « Promotion » sur un prix que plus rien n'applique.
//
// ── CE QUI NE DÉPEND PAS DE CETTE TÂCHE ───────────────────────────────────
// La caisse et le site n'attendent PAS qu'elle passe : `prixPromoActif` et
// `catalog.php` lisent la période eux-mêmes. Elle peut donc tourner toutes les
// quinze minutes, ou s'être arrêtée avec le poste, sans qu'aucun ticket ne
// profite d'une promo finie. Elle ne fait que ranger la fiche.
//
// ── ET LE SITE ─────────────────────────────────────────────────────────────
// Réécrire la fiche change son empreinte d'export : elle passe « modifiée »
// dans /site. Rien ne part tout seul — aucune sortie réseau ici. La page
// publique, elle, a déjà retiré le prix barré à la date de fin
// (`catalog.php`), la synchro ne fait que remettre la ligne SQL d'accord.
//
// Les écritures passent par le Dao : le temps réel de PocketBase est accroché
// aux événements de modèle, les autres postes se mettent donc à jour seuls.
package promo

import (
	"log"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
)

const (
	// Laisser le poste démarrer : même raison que le planificateur de
	// sauvegarde, en plus court — l'opération est une requête filtrée.
	delaiPremierPassage = time.Minute
	periodeVerification = 15 * time.Minute
)

var demarree sync.Once

// DemarrerExpiration lance la tâche de fond. Rend la main immédiatement, et ne
// lance qu'une boucle même appelée deux fois.
func DemarrerExpiration(app *pocketbase.PocketBase) {
	demarree.Do(func() {
		go func() {
			time.Sleep(delaiPremierPassage)
			passer(app)
			ticker := time.NewTicker(periodeVerification)
			defer ticker.Stop()
			for range ticker.C {
				passer(app)
			}
		}()
	})
}

func passer(app *pocketbase.PocketBase) {
	n, err := ExpirerPromos(app.Dao(), JourParis(time.Now()))
	if err != nil {
		log.Printf("🏷️  promos : expiration impossible — %v", err)
		return
	}
	if n > 0 {
		log.Printf("🏷️  promos : %d fiche(s) repassée(s) en plein tarif", n)
	}
}

// ExpirerPromos remet en « Plein tarif » toute fiche dont la promo a pris fin
// avant `jour`. Rend le nombre de fiches réécrites.
//
// Le filtre SQL présélectionne ; `Expiree` tranche, pour que la règle ne vive
// qu'à un endroit côté Go. Une fiche en échec n'arrête pas les autres.
func ExpirerPromos(dao *daos.Dao, jour string) (int, error) {
	recs, err := dao.FindRecordsByFilter(
		"products",
		"(sale_state = 'sale' || sale_state = 'promo') && promo_end != '' && promo_end < {:jour}",
		"", 0, 0,
		dbx.Params{"jour": jour},
	)
	if err != nil {
		return 0, err
	}

	n := 0
	for _, rec := range recs {
		if !Expiree(rec.GetString("sale_state"), rec.GetString("promo_end"), jour) {
			continue
		}
		rec.Set("sale_state", "")
		rec.Set("promo_price_ttc", 0)
		rec.Set("promo_start", "")
		rec.Set("promo_end", "")
		if err := dao.SaveRecord(rec); err != nil {
			log.Printf("🏷️  promos : %s non réécrite — %v", rec.Id, err)
			continue
		}
		n++
	}
	return n, nil
}
