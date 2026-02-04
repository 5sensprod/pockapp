// backend/hash/migrate_invoices_only.go
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION CIBLÉE - Corrige les hashes des FACTURES et AVOIRS uniquement
// ═══════════════════════════════════════════════════════════════════════════
// Ce script NE TOUCHE PAS aux tickets POS (is_pos_ticket = true)
// À exécuter après avoir constaté des anomalies sur la chaîne FAC-*/AVO-*
// ═══════════════════════════════════════════════════════════════════════════

package hash

import (
	"fmt"
	"log"
	"sort"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

// MigrationStats contient les statistiques de migration
type MigrationStats struct {
	TotalScanned   int
	HashMismatches int
	ChainBroken    int
	Updated        int
	Errors         int
	SkippedTickets int
}

// DocumentAnomaly décrit une anomalie détectée
type DocumentAnomaly struct {
	Number           string
	SequenceNumber   int
	InvoiceType      string
	HashMismatch     bool
	ChainBroken      bool
	ExpectedPrevHash string
	ActualPrevHash   string
	ExpectedHash     string
	ActualHash       string
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DIAGNOSTIC - Analyse les anomalies SANS modifier
// ═══════════════════════════════════════════════════════════════════════════

// DiagnoseInvoicesChain analyse la chaîne des factures/avoirs et liste les anomalies
// Ne modifie rien, retourne un rapport détaillé
func DiagnoseInvoicesChain(app *pocketbase.PocketBase) ([]DocumentAnomaly, MigrationStats, error) {
	log.Println("═══════════════════════════════════════════════════════════════")
	log.Println("🔍 DIAGNOSTIC: Analyse de la chaîne FACTURES/AVOIRS")
	log.Println("═══════════════════════════════════════════════════════════════")

	dao := app.Dao()
	var anomalies []DocumentAnomaly
	stats := MigrationStats{}

	// Récupérer UNIQUEMENT les factures et avoirs (pas les tickets POS)
	// is_pos_ticket = false OU is_pos_ticket est NULL (anciennes données)
	records, err := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("sequence_number > 0 AND (is_pos_ticket = false OR is_pos_ticket IS NULL)"),
	)
	if err != nil {
		return nil, stats, fmt.Errorf("erreur chargement factures: %w", err)
	}

	// Trier par sequence_number
	sort.Slice(records, func(i, j int) bool {
		return records[i].GetInt("sequence_number") < records[j].GetInt("sequence_number")
	})

	// Compter les tickets ignorés
	allRecords, _ := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("sequence_number > 0"),
	)
	stats.SkippedTickets = len(allRecords) - len(records)
	stats.TotalScanned = len(records)

	log.Printf("📋 %d facture(s)/avoir(s) à analyser", len(records))
	log.Printf("⏭️  %d ticket(s) POS ignoré(s)", stats.SkippedTickets)

	if len(records) == 0 {
		log.Println("✅ Aucune facture/avoir à analyser")
		return anomalies, stats, nil
	}

	// Grouper par owner_company
	byCompany := make(map[string][]*models.Record)
	for _, r := range records {
		company := r.GetString("owner_company")
		byCompany[company] = append(byCompany[company], r)
	}

	for company, docs := range byCompany {
		log.Printf("\n🏢 Company: %s (%d documents)", company, len(docs))

		// Trier par sequence_number croissant
		sort.Slice(docs, func(i, j int) bool {
			return docs[i].GetInt("sequence_number") < docs[j].GetInt("sequence_number")
		})

		// Analyser chaque document
		for i, doc := range docs {
			seq := doc.GetInt("sequence_number")
			number := doc.GetString("number")
			invoiceType := doc.GetString("invoice_type")
			currentHash := doc.GetString("hash")
			currentPrevHash := doc.GetString("previous_hash")

			// Calculer le previous_hash attendu
			var expectedPrevHash string
			if i == 0 {
				// Premier document de cette company dans notre liste
				// Vérifier s'il y a un document précédent (seq-1)
				if seq == 1 {
					expectedPrevHash = GENESIS_HASH
				} else {
					// Chercher le document précédent
					prevDoc := findPreviousDocumentBySeq(dao, company, seq, false)
					if prevDoc != nil {
						expectedPrevHash = prevDoc.GetString("hash")
					} else {
						expectedPrevHash = GENESIS_HASH
					}
				}
			} else {
				// Document précédent dans notre liste triée
				expectedPrevHash = docs[i-1].GetString("hash")
			}

			// Calculer le hash attendu (avec le previous_hash corrigé si nécessaire)
			// On simule ce que serait le hash si previous_hash était correct
			tempDoc := doc
			if currentPrevHash != expectedPrevHash {
				// Créer une copie pour calculer le hash attendu
				tempDoc = cloneRecordForHashCalc(doc)
				tempDoc.Set("previous_hash", expectedPrevHash)
			}
			expectedHash := ComputeDocumentHash(tempDoc)

			// Détecter les anomalies
			hashMismatch := currentHash != expectedHash
			chainBroken := currentPrevHash != expectedPrevHash

			if hashMismatch || chainBroken {
				anomaly := DocumentAnomaly{
					Number:           number,
					SequenceNumber:   seq,
					InvoiceType:      invoiceType,
					HashMismatch:     hashMismatch,
					ChainBroken:      chainBroken,
					ExpectedPrevHash: expectedPrevHash,
					ActualPrevHash:   currentPrevHash,
					ExpectedHash:     expectedHash,
					ActualHash:       currentHash,
				}
				anomalies = append(anomalies, anomaly)

				if hashMismatch {
					stats.HashMismatches++
				}
				if chainBroken {
					stats.ChainBroken++
				}

				// Log détaillé
				log.Printf("   ❌ %s (seq=%d, type=%s):", number, seq, invoiceType)
				if chainBroken {
					log.Printf("      🔗 previous_hash: %s... → attendu: %s...",
						truncateHash(currentPrevHash), truncateHash(expectedPrevHash))
				}
				if hashMismatch {
					log.Printf("      #️⃣ hash: %s... → attendu: %s...",
						truncateHash(currentHash), truncateHash(expectedHash))
				}
			}
		}
	}

	// Résumé
	log.Println("\n═══════════════════════════════════════════════════════════════")
	log.Printf("📊 RÉSUMÉ DIAGNOSTIC:")
	log.Printf("   • Documents analysés: %d", stats.TotalScanned)
	log.Printf("   • Tickets ignorés: %d", stats.SkippedTickets)
	log.Printf("   • Anomalies hash: %d", stats.HashMismatches)
	log.Printf("   • Chaînes brisées: %d", stats.ChainBroken)
	log.Printf("   • Total anomalies: %d", len(anomalies))
	log.Println("═══════════════════════════════════════════════════════════════")

	return anomalies, stats, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MIGRATION - Corrige les hashes (avec option dry-run)
// ═══════════════════════════════════════════════════════════════════════════

// MigrateInvoicesHashes corrige les hashes des factures et avoirs
// Si dryRun=true, affiche ce qui serait fait sans modifier
func MigrateInvoicesHashes(app *pocketbase.PocketBase, dryRun bool) (MigrationStats, error) {
	mode := "MIGRATION"
	if dryRun {
		mode = "DRY-RUN (simulation)"
	}

	log.Println("═══════════════════════════════════════════════════════════════")
	log.Printf("🔧 %s: Correction des hashes FACTURES/AVOIRS", mode)
	log.Println("═══════════════════════════════════════════════════════════════")

	dao := app.Dao()
	stats := MigrationStats{}

	// Récupérer UNIQUEMENT les factures et avoirs
	records, err := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("sequence_number > 0 AND (is_pos_ticket = false OR is_pos_ticket IS NULL)"),
	)
	if err != nil {
		return stats, fmt.Errorf("erreur chargement factures: %w", err)
	}

	// Trier par sequence_number
	sort.Slice(records, func(i, j int) bool {
		return records[i].GetInt("sequence_number") < records[j].GetInt("sequence_number")
	})

	stats.TotalScanned = len(records)
	log.Printf("📋 %d facture(s)/avoir(s) à traiter", len(records))

	if len(records) == 0 {
		log.Println("✅ Aucune facture/avoir à migrer")
		return stats, nil
	}

	// Grouper par owner_company
	byCompany := make(map[string][]*models.Record)
	for _, r := range records {
		company := r.GetString("owner_company")
		byCompany[company] = append(byCompany[company], r)
	}

	for company, docs := range byCompany {
		log.Printf("\n🏢 Company: %s (%d documents)", company, len(docs))

		// Trier par sequence_number croissant (CRUCIAL pour le chaînage)
		sort.Slice(docs, func(i, j int) bool {
			return docs[i].GetInt("sequence_number") < docs[j].GetInt("sequence_number")
		})

		// Traiter chaque document dans l'ordre
		for i, doc := range docs {
			seq := doc.GetInt("sequence_number")
			number := doc.GetString("number")
			oldHash := doc.GetString("hash")
			oldPrevHash := doc.GetString("previous_hash")

			// ═══════════════════════════════════════════════════════════════
			// ÉTAPE 1: Déterminer le previous_hash correct
			// ═══════════════════════════════════════════════════════════════
			var expectedPrevHash string

			if i == 0 {
				// Premier document de cette company
				if seq == 1 {
					expectedPrevHash = GENESIS_HASH
				} else {
					// Il y a peut-être des tickets avant ce document
					// Chercher le dernier document (tous types) avec seq < current seq
					prevDoc := findPreviousDocumentBySeq(dao, company, seq, true) // true = inclure tickets
					if prevDoc != nil {
						expectedPrevHash = prevDoc.GetString("hash")
					} else {
						expectedPrevHash = GENESIS_HASH
					}
				}
			} else {
				// Le document précédent dans NOTRE liste (factures/avoirs uniquement)
				// Mais attention: il peut y avoir des tickets entre les deux!
				prevSeq := docs[i-1].GetInt("sequence_number")

				if seq == prevSeq+1 {
					// Séquence continue → le previous est le doc précédent
					expectedPrevHash = docs[i-1].GetString("hash")
				} else {
					// Il y a un "trou" → chercher le vrai précédent (peut être un ticket)
					prevDoc := findPreviousDocumentBySeq(dao, company, seq, true)
					if prevDoc != nil {
						expectedPrevHash = prevDoc.GetString("hash")
					} else {
						expectedPrevHash = docs[i-1].GetString("hash")
					}
				}
			}

			// ═══════════════════════════════════════════════════════════════
			// ÉTAPE 2: Corriger previous_hash si nécessaire
			// ═══════════════════════════════════════════════════════════════
			prevHashChanged := false
			if oldPrevHash != expectedPrevHash {
				prevHashChanged = true
				if !dryRun {
					doc.Set("previous_hash", expectedPrevHash)
				}
				log.Printf("   🔗 %s (seq=%d): previous_hash corrigé", number, seq)
				log.Printf("      %s... → %s...", truncateHash(oldPrevHash), truncateHash(expectedPrevHash))
			}

			// ═══════════════════════════════════════════════════════════════
			// ÉTAPE 3: Recalculer le hash
			// ═══════════════════════════════════════════════════════════════
			var newHash string
			if dryRun && prevHashChanged {
				// En dry-run, simuler avec le previous_hash corrigé
				tempDoc := cloneRecordForHashCalc(doc)
				tempDoc.Set("previous_hash", expectedPrevHash)
				newHash = ComputeDocumentHash(tempDoc)
			} else {
				newHash = ComputeDocumentHash(doc)
			}

			hashChanged := oldHash != newHash
			if hashChanged {
				if !dryRun {
					doc.Set("hash", newHash)
				}
				log.Printf("   🔄 %s (seq=%d): hash recalculé", number, seq)
				log.Printf("      %s... → %s...", truncateHash(oldHash), truncateHash(newHash))
			}

			// ═══════════════════════════════════════════════════════════════
			// ÉTAPE 4: Sauvegarder si modifié
			// ═══════════════════════════════════════════════════════════════
			if prevHashChanged || hashChanged {
				if !dryRun {
					if err := dao.SaveRecord(doc); err != nil {
						log.Printf("   ❌ Erreur sauvegarde %s: %v", number, err)
						stats.Errors++
					} else {
						stats.Updated++
					}
				} else {
					stats.Updated++ // En dry-run, compter ce qui SERAIT mis à jour
				}
			}
		}
	}

	// Résumé
	log.Println("\n═══════════════════════════════════════════════════════════════")
	if dryRun {
		log.Printf("📊 RÉSUMÉ DRY-RUN (aucune modification effectuée):")
		log.Printf("   • Documents analysés: %d", stats.TotalScanned)
		log.Printf("   • SERAIENT mis à jour: %d", stats.Updated)
	} else {
		log.Printf("📊 RÉSUMÉ MIGRATION:")
		log.Printf("   • Documents analysés: %d", stats.TotalScanned)
		log.Printf("   • Mis à jour: %d", stats.Updated)
		log.Printf("   • Erreurs: %d", stats.Errors)
	}
	log.Println("═══════════════════════════════════════════════════════════════")

	return stats, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VÉRIFICATION POST-MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

// VerifyInvoicesChain vérifie l'intégrité de la chaîne après migration
func VerifyInvoicesChain(app *pocketbase.PocketBase) error {
	log.Println("\n═══════════════════════════════════════════════════════════════")
	log.Println("🔍 VÉRIFICATION POST-MIGRATION: Chaîne FACTURES/AVOIRS")
	log.Println("═══════════════════════════════════════════════════════════════")

	anomalies, stats, err := DiagnoseInvoicesChain(app)
	if err != nil {
		return err
	}

	if len(anomalies) == 0 {
		log.Println("\n✅ SUCCÈS: Toute la chaîne des factures/avoirs est intègre!")
		return nil
	}

	log.Printf("\n⚠️ ATTENTION: %d anomalie(s) détectée(s) après migration", len(anomalies))
	log.Printf("   • Hash incorrects: %d", stats.HashMismatches)
	log.Printf("   • Chaînes brisées: %d", stats.ChainBroken)

	return fmt.Errorf("%d anomalies restantes", len(anomalies))
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES (noms uniques pour éviter les conflits avec migrate.go)
// ═══════════════════════════════════════════════════════════════════════════

// findPreviousDocumentBySeq trouve le document avec sequence_number = seq-1
// Si includeTickets=true, cherche dans TOUS les documents
// Si includeTickets=false, cherche uniquement dans les factures/avoirs
func findPreviousDocumentBySeq(dao *daos.Dao, company string, seq int, includeTickets bool) *models.Record {
	var expr dbx.Expression
	if includeTickets {
		expr = dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq}",
			dbx.Params{"company": company, "seq": seq - 1})
	} else {
		expr = dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq} AND (is_pos_ticket = false OR is_pos_ticket IS NULL)",
			dbx.Params{"company": company, "seq": seq - 1})
	}

	records, err := dao.FindRecordsByExpr("invoices", expr)
	if err != nil || len(records) == 0 {
		return nil
	}
	return records[0]
}

// cloneRecordForHashCalc crée une copie superficielle du record pour calculer un hash
// sans modifier l'original
func cloneRecordForHashCalc(original *models.Record) *models.Record {
	clone := &models.Record{}
	*clone = *original
	return clone
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION PRINCIPALE D'EXÉCUTION
// ═══════════════════════════════════════════════════════════════════════════

// RunFullChainMigration recalcule TOUTE la chaîne de documents
// Factures + Tickets + Avoirs - TOUT d'un coup dans l'ordre
func RunFullChainMigration(app *pocketbase.PocketBase) error {
	log.Println("═══════════════════════════════════════════════════════════════")
	log.Println("🔧 MIGRATION COMPLÈTE: Recalcul de TOUTE la chaîne")
	log.Println("═══════════════════════════════════════════════════════════════")

	dao := app.Dao()

	// Récupérer TOUS les documents avec un sequence_number
	records, err := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("sequence_number > 0"),
	)
	if err != nil {
		return fmt.Errorf("erreur chargement documents: %w", err)
	}

	log.Printf("📋 %d document(s) à traiter", len(records))

	if len(records) == 0 {
		log.Println("✅ Aucun document à migrer")
		return nil
	}

	// Grouper par owner_company
	byCompany := make(map[string][]*models.Record)
	for _, r := range records {
		company := r.GetString("owner_company")
		byCompany[company] = append(byCompany[company], r)
	}

	totalUpdated := 0
	totalErrors := 0

	for company, docs := range byCompany {
		log.Printf("\n🏢 Company: %s (%d documents)", company, len(docs))

		// Trier par sequence_number croissant
		sort.Slice(docs, func(i, j int) bool {
			return docs[i].GetInt("sequence_number") < docs[j].GetInt("sequence_number")
		})

		// Recalculer les hashes dans l'ordre
		for i, doc := range docs {
			seq := doc.GetInt("sequence_number")
			number := doc.GetString("number")
			oldHash := doc.GetString("hash")
			oldPrevHash := doc.GetString("previous_hash")

			// Déterminer le previous_hash correct
			var expectedPrevHash string
			if seq == 1 {
				expectedPrevHash = GENESIS_HASH
			} else if i > 0 && docs[i-1].GetInt("sequence_number") == seq-1 {
				// Le document précédent est dans notre liste
				expectedPrevHash = docs[i-1].GetString("hash")
			} else {
				// Chercher le document précédent dans la DB
				prevRecords, _ := dao.FindRecordsByExpr("invoices",
					dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq}",
						dbx.Params{"company": company, "seq": seq - 1}),
				)
				if len(prevRecords) > 0 {
					expectedPrevHash = prevRecords[0].GetString("hash")
				} else {
					expectedPrevHash = GENESIS_HASH
				}
			}

			// Corriger previous_hash si nécessaire
			prevHashChanged := oldPrevHash != expectedPrevHash
			if prevHashChanged {
				doc.Set("previous_hash", expectedPrevHash)
			}

			// Recalculer le hash
			newHash := ComputeDocumentHash(doc)
			hashChanged := oldHash != newHash
			if hashChanged {
				doc.Set("hash", newHash)
			}

			// Sauvegarder si modifié
			if prevHashChanged || hashChanged {
				log.Printf("   🔄 %s (seq=%d)", number, seq)
				if err := dao.SaveRecord(doc); err != nil {
					log.Printf("   ❌ Erreur: %v", err)
					totalErrors++
				} else {
					totalUpdated++
				}
			}
		}
	}

	log.Println("\n═══════════════════════════════════════════════════════════════")
	log.Printf("✅ MIGRATION TERMINÉE: %d document(s) corrigé(s), %d erreur(s)", totalUpdated, totalErrors)
	log.Println("═══════════════════════════════════════════════════════════════")

	return nil
}

// FixSingleTicket corrige le hash d'un ticket spécifique (ex: TIK-2026-000001)
// Appel: hash.FixSingleTicket(pb, "TIK-2026-000001")
func FixSingleTicket(app *pocketbase.PocketBase, ticketNumber string) error {
	log.Printf("🔧 Correction du ticket: %s", ticketNumber)
	dao := app.Dao()

	// 1. Trouver le ticket
	records, err := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("number = {:num}", dbx.Params{"num": ticketNumber}),
	)
	if err != nil || len(records) == 0 {
		return fmt.Errorf("ticket %s introuvable", ticketNumber)
	}
	ticket := records[0]

	seq := ticket.GetInt("sequence_number")
	company := ticket.GetString("owner_company")
	oldHash := ticket.GetString("hash")
	oldPrevHash := ticket.GetString("previous_hash")

	log.Printf("   Ticket trouvé: seq=%d, company=%s", seq, company)
	log.Printf("   Hash actuel: %s...", truncateHash(oldHash))
	log.Printf("   PrevHash actuel: %s...", truncateHash(oldPrevHash))

	// 2. Trouver le document précédent (sequence_number - 1)
	var expectedPrevHash string
	if seq == 1 {
		expectedPrevHash = GENESIS_HASH
	} else {
		prevRecords, err := dao.FindRecordsByExpr("invoices",
			dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq}",
				dbx.Params{"company": company, "seq": seq - 1}),
		)
		if err != nil || len(prevRecords) == 0 {
			log.Printf("   ⚠️ Document précédent (seq=%d) introuvable, utilisation GENESIS_HASH", seq-1)
			expectedPrevHash = GENESIS_HASH
		} else {
			expectedPrevHash = prevRecords[0].GetString("hash")
			log.Printf("   Document précédent trouvé: %s (seq=%d)",
				prevRecords[0].GetString("number"), seq-1)
		}
	}

	log.Printf("   PrevHash attendu: %s...", truncateHash(expectedPrevHash))

	// 3. Corriger previous_hash si nécessaire
	if oldPrevHash != expectedPrevHash {
		ticket.Set("previous_hash", expectedPrevHash)
		log.Printf("   🔗 previous_hash corrigé")
	}

	// 4. Recalculer le hash
	newHash := ComputeDocumentHash(ticket)
	log.Printf("   Hash recalculé: %s...", truncateHash(newHash))

	if oldHash != newHash {
		ticket.Set("hash", newHash)
		log.Printf("   🔄 hash mis à jour")
	}

	// 5. Sauvegarder
	if err := dao.SaveRecord(ticket); err != nil {
		return fmt.Errorf("erreur sauvegarde: %w", err)
	}

	log.Printf("✅ Ticket %s corrigé avec succès!", ticketNumber)
	return nil
}

// RunTicketsMigration recalcule TOUTE la chaîne des tickets POS
// C'est la fonction à appeler pour corriger tous les tickets d'un coup
func RunTicketsMigration(app *pocketbase.PocketBase, dryRun bool) error {
	mode := "MIGRATION"
	if dryRun {
		mode = "DRY-RUN"
	}

	log.Println("═══════════════════════════════════════════════════════════════")
	log.Printf("🎫 %s: Recalcul chaîne TICKETS POS", mode)
	log.Println("═══════════════════════════════════════════════════════════════")

	dao := app.Dao()

	// Récupérer TOUS les tickets POS
	records, err := dao.FindRecordsByExpr("invoices",
		dbx.NewExp("sequence_number > 0 AND is_pos_ticket = true"),
	)
	if err != nil {
		return fmt.Errorf("erreur chargement tickets: %w", err)
	}

	log.Printf("📋 %d ticket(s) POS à traiter", len(records))

	if len(records) == 0 {
		log.Println("✅ Aucun ticket à migrer")
		return nil
	}

	// Trier par sequence_number
	sort.Slice(records, func(i, j int) bool {
		return records[i].GetInt("sequence_number") < records[j].GetInt("sequence_number")
	})

	// Grouper par owner_company
	byCompany := make(map[string][]*models.Record)
	for _, r := range records {
		company := r.GetString("owner_company")
		byCompany[company] = append(byCompany[company], r)
	}

	totalUpdated := 0
	totalErrors := 0

	for company, tickets := range byCompany {
		log.Printf("\n🏢 Company: %s (%d tickets)", company, len(tickets))

		// Trier par sequence_number
		sort.Slice(tickets, func(i, j int) bool {
			return tickets[i].GetInt("sequence_number") < tickets[j].GetInt("sequence_number")
		})

		for i, ticket := range tickets {
			seq := ticket.GetInt("sequence_number")
			number := ticket.GetString("number")
			oldHash := ticket.GetString("hash")
			oldPrevHash := ticket.GetString("previous_hash")

			// Déterminer le previous_hash correct
			var expectedPrevHash string
			if i == 0 {
				// Premier ticket de cette company
				if seq == 1 {
					expectedPrevHash = GENESIS_HASH
				} else {
					// Chercher le document précédent (tous types)
					prevRecords, _ := dao.FindRecordsByExpr("invoices",
						dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq}",
							dbx.Params{"company": company, "seq": seq - 1}),
					)
					if len(prevRecords) > 0 {
						expectedPrevHash = prevRecords[0].GetString("hash")
					} else {
						expectedPrevHash = GENESIS_HASH
					}
				}
			} else {
				// Le ticket précédent dans notre liste
				prevSeq := tickets[i-1].GetInt("sequence_number")
				if seq == prevSeq+1 {
					expectedPrevHash = tickets[i-1].GetString("hash")
				} else {
					// Trou dans la séquence - chercher le vrai précédent
					prevRecords, _ := dao.FindRecordsByExpr("invoices",
						dbx.NewExp("owner_company = {:company} AND sequence_number = {:seq}",
							dbx.Params{"company": company, "seq": seq - 1}),
					)
					if len(prevRecords) > 0 {
						expectedPrevHash = prevRecords[0].GetString("hash")
					} else {
						expectedPrevHash = tickets[i-1].GetString("hash")
					}
				}
			}

			// Corriger previous_hash si nécessaire
			prevHashChanged := false
			if oldPrevHash != expectedPrevHash {
				prevHashChanged = true
				if !dryRun {
					ticket.Set("previous_hash", expectedPrevHash)
				}
			}

			// Recalculer le hash
			var newHash string
			if dryRun && prevHashChanged {
				tempDoc := &models.Record{}
				*tempDoc = *ticket
				tempDoc.Set("previous_hash", expectedPrevHash)
				newHash = ComputeDocumentHash(tempDoc)
			} else {
				newHash = ComputeDocumentHash(ticket)
			}

			hashChanged := oldHash != newHash
			if hashChanged && !dryRun {
				ticket.Set("hash", newHash)
			}

			// Sauvegarder si modifié
			if prevHashChanged || hashChanged {
				log.Printf("   🔄 %s (seq=%d): corrigé", number, seq)
				if !dryRun {
					if err := dao.SaveRecord(ticket); err != nil {
						log.Printf("   ❌ Erreur: %v", err)
						totalErrors++
					} else {
						totalUpdated++
					}
				} else {
					totalUpdated++
				}
			}
		}
	}

	log.Println("\n═══════════════════════════════════════════════════════════════")
	if dryRun {
		log.Printf("📊 DRY-RUN: %d ticket(s) SERAIENT corrigé(s)", totalUpdated)
	} else {
		log.Printf("✅ MIGRATION: %d ticket(s) corrigé(s), %d erreur(s)", totalUpdated, totalErrors)
	}
	log.Println("═══════════════════════════════════════════════════════════════")

	return nil
}

// RunInvoicesMigration exécute la migration complète avec diagnostic et vérification
// C'est la fonction à appeler depuis main.go ou une route admin
func RunInvoicesMigration(app *pocketbase.PocketBase, dryRun bool) error {
	log.Println("")
	log.Println("╔═══════════════════════════════════════════════════════════════╗")
	log.Println("║   MIGRATION HASHES FACTURES/AVOIRS - NF525 COMPLIANT          ║")
	log.Println("╚═══════════════════════════════════════════════════════════════╝")
	log.Println("")

	// Étape 1: Diagnostic initial
	log.Println("📌 ÉTAPE 1/3: Diagnostic initial")
	anomalies, _, err := DiagnoseInvoicesChain(app)
	if err != nil {
		return fmt.Errorf("erreur diagnostic: %w", err)
	}

	if len(anomalies) == 0 {
		log.Println("\n✅ Aucune anomalie détectée. Migration non nécessaire.")
		return nil
	}

	// Étape 2: Migration
	log.Println("\n📌 ÉTAPE 2/3: Migration")
	stats, err := MigrateInvoicesHashes(app, dryRun)
	if err != nil {
		return fmt.Errorf("erreur migration: %w", err)
	}

	if dryRun {
		log.Println("\n⚠️ MODE DRY-RUN: Aucune modification effectuée.")
		log.Println("   Relancez avec dryRun=false pour appliquer les corrections.")
		return nil
	}

	// Étape 3: Vérification post-migration
	log.Println("\n📌 ÉTAPE 3/3: Vérification post-migration")
	if err := VerifyInvoicesChain(app); err != nil {
		return err
	}

	log.Println("")
	log.Println("╔═══════════════════════════════════════════════════════════════╗")
	log.Printf("║   ✅ MIGRATION TERMINÉE: %d document(s) corrigé(s)            ║", stats.Updated)
	log.Println("╚═══════════════════════════════════════════════════════════════╝")
	log.Println("")

	return nil
}
