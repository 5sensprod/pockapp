// backend/hooks/cash_session_hooks.go
// ✨ Version complète et améliorée avec toutes les protections

package hooks

import (
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterCashSessionHooks(app *pocketbase.PocketBase) {

	// ==========================================================================
	// HOOK 1 : AVANT CRÉATION SESSION
	// ==========================================================================
	app.OnRecordBeforeCreateRequest("cash_sessions").Add(func(e *core.RecordCreateEvent) error {
		record := e.Record

		// 🔒 Vérifier qu'il n'y a pas déjà une session ouverte
		cashRegister := record.GetString("cash_register")
		if cashRegister != "" {
			existing, err := app.Dao().FindFirstRecordByFilter(
				"cash_sessions",
				fmt.Sprintf("cash_register = '%s' && status = 'open'", cashRegister),
			)

			if err == nil && existing != nil {
				return errors.New("une session est déjà ouverte pour cette caisse")
			}
		}

		// ✅ Initialiser les compteurs à zéro
		if record.Get("invoice_count") == nil {
			record.Set("invoice_count", 0)
		}
		if record.Get("total_ttc") == nil {
			record.Set("total_ttc", 0.0)
		}
		if record.Get("totals_by_method") == nil {
			record.Set("totals_by_method", map[string]interface{}{})
		}

		// ✅ S'assurer que opened_at est défini
		if record.GetString("opened_at") == "" {
			record.Set("opened_at", time.Now().Format(time.RFC3339))
		}

		log.Printf("🔓 Ouverture session caisse %s", cashRegister)
		return nil
	})

	// ==========================================================================
	// HOOK 2 : APRÈS CRÉATION SESSION → Audit Log
	// ==========================================================================
	app.OnRecordAfterCreateRequest("cash_sessions").Add(func(e *core.RecordCreateEvent) error {
		session := e.Record

		log.Printf("✅ Session %s créée avec succès", session.Id)

		return createAuditLog(app, e.HttpContext, AuditLogParams{
			Action:       "cash_session_opened",
			EntityType:   "cash_session",
			EntityID:     session.Id,
			EntityNumber: session.GetString("cash_register"),
			OwnerCompany: session.GetString("owner_company"),
			Details: map[string]interface{}{
				"cash_register": session.GetString("cash_register"),
				"opening_float": session.GetFloat("opening_float"),
				"opened_by":     session.GetString("opened_by"),
				"opened_at":     session.GetString("opened_at"),
			},
		})
	})

	// ==========================================================================
	// HOOK 3 : AVANT MISE À JOUR SESSION
	// ==========================================================================
	app.OnRecordBeforeUpdateRequest("cash_sessions").Add(func(e *core.RecordUpdateEvent) error {
		original := e.Record.OriginalCopy()
		updated := e.Record

		// 🔒 PROTECTION : Empêcher modification d'une session fermée
		if original.GetString("status") == "closed" || original.GetString("status") == "canceled" {
			return errors.New("modification interdite : la session est déjà clôturée")
		}

		// 📊 Détection de la fermeture
		if original.GetString("status") == "open" && updated.GetString("status") == "closed" {
			sessionId := updated.Id

			log.Printf("🔐 Fermeture session %s...", sessionId)

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 1 : Récupérer tous les TICKETS POS de cette session
			// ─────────────────────────────────────────────────────────────────
			log.Printf("🔍 Recherche des tickets POS pour session: %s", sessionId)

			invoices, err := app.Dao().FindRecordsByFilter(
				"invoices",
				fmt.Sprintf("session = '%s' && is_pos_ticket = true", sessionId), // ✅ FILTRE CORRIGÉ
				"",
				0,
				0,
			)

			log.Printf("🔍 Nombre de tickets POS trouvés: %d", len(invoices))

			if err != nil {
				log.Printf("⚠️ Erreur récupération tickets session %s: %v", sessionId, err)
				// On continue quand même pour permettre la fermeture
			}

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 2 : Calculer les totaux des factures
			// ─────────────────────────────────────────────────────────────────
			var invoiceCount int
			var totalTTC float64
			totalsByMethod := make(map[string]float64)
			var cashFromSales float64

			for _, inv := range invoices {
				// ⚠️ IMPORTANT : Ne compter que les factures validées/envoyées
				// (pas les brouillons)
				status := inv.GetString("status")
				if status == "draft" {
					log.Printf("  ⏭️ Brouillon %s ignoré", inv.GetString("number"))
					continue
				}

				invoiceCount++
				ttc := inv.GetFloat("total_ttc")
				totalTTC += ttc

				method := inv.GetString("payment_method")
				if method != "" {
					totalsByMethod[method] += ttc

					// Comptabiliser les espèces pour le calcul d'écart
					if method == "especes" {
						cashFromSales += ttc
					}
				}

				log.Printf("  ✅ Ticket %s : %.2f € (%s)",
					inv.GetString("number"), ttc, method)
			}

			log.Printf("📊 Total tickets POS : %d tickets, %.2f € TTC", invoiceCount, totalTTC)

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 3 : Récupérer les mouvements de caisse
			// ─────────────────────────────────────────────────────────────────
			movements, err := app.Dao().FindRecordsByFilter(
				"cash_movements",
				fmt.Sprintf("session = '%s'", sessionId),
				"",
				0,
				0,
			)

			var movementsTotal float64
			if err == nil {
				for _, mov := range movements {
					movType := mov.GetString("movement_type")
					amount := mov.GetFloat("amount")

					switch movType {
					case "cash_in":
						movementsTotal += amount
						log.Printf("  💰 Entrée espèces : +%.2f €", amount)
					case "cash_out", "safe_drop":
						movementsTotal -= amount
						log.Printf("  💸 Sortie espèces : -%.2f €", amount)
					case "adjustment":
						// Peut être positif ou négatif
						movementsTotal += amount
						log.Printf("  🔧 Ajustement : %.2f €", amount)
					}
				}
			} else {
				log.Printf("⚠️ Erreur récupération mouvements: %v", err)
			}

			log.Printf("💵 Total mouvements : %.2f €", movementsTotal)

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 4 : Calculer les espèces attendues
			// ─────────────────────────────────────────────────────────────────
			openingFloat := updated.GetFloat("opening_float")
			expectedCashTotal := openingFloat + cashFromSales + movementsTotal

			log.Printf("💰 Espèces attendues :")
			log.Printf("  • Fond de caisse    : %.2f €", openingFloat)
			log.Printf("  • Ventes espèces    : %.2f €", cashFromSales)
			log.Printf("  • Mouvements        : %.2f €", movementsTotal)
			log.Printf("  • TOTAL ATTENDU     : %.2f €", expectedCashTotal)

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 5 : Mettre à jour la session
			// ─────────────────────────────────────────────────────────────────
			updated.Set("invoice_count", invoiceCount)
			updated.Set("total_ttc", totalTTC)
			updated.Set("totals_by_method", totalsByMethod)
			updated.Set("expected_cash_total", expectedCashTotal)

			// ─────────────────────────────────────────────────────────────────
			// ÉTAPE 6 : Calculer l'écart si espèces comptées
			// ─────────────────────────────────────────────────────────────────
			countedCash := updated.GetFloat("counted_cash_total")

			if countedCash > 0 {
				difference := countedCash - expectedCashTotal
				updated.Set("cash_difference", difference)

				log.Printf("💵 Espèces comptées   : %.2f €", countedCash)
				if difference == 0 {
					log.Printf("✅ CAISSE ÉQUILIBRÉE (écart : 0.00 €)")
				} else if difference > 0 {
					log.Printf("⚠️ SURPLUS de %.2f €", difference)
				} else {
					log.Printf("❌ MANQUE de %.2f €", -difference)
				}
			} else {
				// Si pas de comptage, on met les espèces attendues par défaut
				updated.Set("counted_cash_total", expectedCashTotal)
				updated.Set("cash_difference", 0.0)
				log.Printf("ℹ️ Pas de comptage espèces, écart = 0 par défaut")
			}

			// ✅ S'assurer que closed_at est défini
			if updated.GetString("closed_at") == "" {
				updated.Set("closed_at", time.Now().Format(time.RFC3339))
			}

			log.Printf("✅ Session %s fermée avec succès", sessionId)
		}

		return nil
	})

	// ==========================================================================
	// HOOK 4 : APRÈS MISE À JOUR SESSION → Audit Log
	// ==========================================================================
	app.OnRecordAfterUpdateRequest("cash_sessions").Add(func(e *core.RecordUpdateEvent) error {
		original := e.Record.OriginalCopy()
		updated := e.Record

		oldStatus := original.GetString("status")
		newStatus := updated.GetString("status")

		// Si fermeture de session, créer un audit log
		if oldStatus == "open" && newStatus == "closed" {
			return createAuditLog(app, e.HttpContext, AuditLogParams{
				Action:       "cash_session_closed",
				EntityType:   "cash_session",
				EntityID:     updated.Id,
				EntityNumber: updated.GetString("cash_register"),
				OwnerCompany: updated.GetString("owner_company"),
				Details: map[string]interface{}{
					"cash_register":       updated.GetString("cash_register"),
					"closed_by":           updated.GetString("closed_by"),
					"closed_at":           updated.GetString("closed_at"),
					"invoice_count":       updated.GetInt("invoice_count"),
					"total_ttc":           updated.GetFloat("total_ttc"),
					"opening_float":       updated.GetFloat("opening_float"),
					"expected_cash_total": updated.GetFloat("expected_cash_total"),
					"counted_cash_total":  updated.GetFloat("counted_cash_total"),
					"cash_difference":     updated.GetFloat("cash_difference"),
					"totals_by_method":    updated.Get("totals_by_method"),
				},
			})
		}

		return nil
	})

	// ==========================================================================
	// HOOK 5 : EMPÊCHER SUPPRESSION SESSIONS
	// ==========================================================================
	app.OnRecordBeforeDeleteRequest("cash_sessions").Add(func(e *core.RecordDeleteEvent) error {
		return errors.New("suppression interdite : les sessions de caisse doivent être conservées pour audit")
	})

	// ==========================================================================
	// HOOK 6 : EMPÊCHER SUPPRESSION MOUVEMENTS DE CAISSE
	// ==========================================================================
	app.OnRecordBeforeDeleteRequest("cash_movements").Add(func(e *core.RecordDeleteEvent) error {
		return errors.New("suppression interdite : les mouvements de caisse doivent être conservés pour audit")
	})
}
