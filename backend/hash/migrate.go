// backend/hash/migrate.go
// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT DE MIGRATION - Recalcule tous les hashes existants
// ═══════════════════════════════════════════════════════════════════════════
// À EXÉCUTER UNE SEULE FOIS après avoir modifié la fonction de hash
// ═══════════════════════════════════════════════════════════════════════════

package hash

import (
	"fmt"
	"log"
	"sort"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
)

// MigrateRecalculateAllHashes recalcule tous les hashes de la chaîne
// Cette fonction doit être appelée UNE SEULE FOIS après modification de la formule de hash
func MigrateRecalculateAllHashes(app *pocketbase.PocketBase) error {
	log.Println("═══════════════════════════════════════════════════════════════")
	log.Println("🔧 MIGRATION: Recalcul de tous les hashes")
	log.Println("═══════════════════════════════════════════════════════════════")

	dao := app.Dao()

	// Récupérer TOUS les documents avec un sequence_number
	records, err := dao.FindRecordsByFilter(
		"invoices",
		"sequence_number > 0",
		"sequence_number",
		10000,
		0,
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

			// Déterminer le previous_hash correct
			var expectedPreviousHash string
			if seq == 1 {
				expectedPreviousHash = GENESIS_HASH
			} else if i > 0 {
				// Le document précédent dans la liste (déjà mis à jour)
				expectedPreviousHash = docs[i-1].GetString("hash")
			} else {
				// Cas où on filtre par company mais seq > 1 et i == 0
				// Chercher le document précédent
				prevDocs, _ := dao.FindRecordsByFilter(
					"invoices",
					fmt.Sprintf("owner_company = '%s' && sequence_number = %d", company, seq-1),
					"",
					1,
					0,
				)
				if len(prevDocs) > 0 {
					expectedPreviousHash = prevDocs[0].GetString("hash")
				} else {
					expectedPreviousHash = GENESIS_HASH
				}
			}

			// Corriger previous_hash si nécessaire
			currentPreviousHash := doc.GetString("previous_hash")
			if currentPreviousHash != expectedPreviousHash {
				doc.Set("previous_hash", expectedPreviousHash)
				log.Printf("   🔗 %s (seq=%d): previous_hash corrigé", number, seq)
			}

			// Recalculer le hash avec la nouvelle fonction
			newHash := ComputeDocumentHash(doc)

			if oldHash != newHash {
				doc.Set("hash", newHash)
				log.Printf("   🔄 %s (seq=%d): %s... → %s...",
					number, seq,
					truncateHash(oldHash),
					truncateHash(newHash))

				// Sauvegarder
				if err := dao.SaveRecord(doc); err != nil {
					log.Printf("   ❌ Erreur sauvegarde %s: %v", number, err)
					totalErrors++
				} else {
					totalUpdated++
				}
			} else {
				// Hash identique, mais vérifier si previous_hash a changé
				if currentPreviousHash != expectedPreviousHash {
					if err := dao.SaveRecord(doc); err != nil {
						log.Printf("   ❌ Erreur sauvegarde %s: %v", number, err)
						totalErrors++
					} else {
						totalUpdated++
					}
				}
			}
		}
	}

	log.Println("\n═══════════════════════════════════════════════════════════════")
	log.Printf("✅ Migration terminée: %d mis à jour, %d erreurs", totalUpdated, totalErrors)
	log.Println("═══════════════════════════════════════════════════════════════")

	return nil
}

// VerifyChainIntegrity vérifie l'intégrité de toute la chaîne après migration
func VerifyChainIntegrity(app *pocketbase.PocketBase) error {
	log.Println("\n🔍 Vérification de l'intégrité de la chaîne...")

	dao := app.Dao()

	records, err := dao.FindRecordsByFilter(
		"invoices",
		"sequence_number > 0",
		"sequence_number",
		10000,
		0,
	)
	if err != nil {
		return err
	}

	// Grouper par company
	byCompany := make(map[string][]*models.Record)
	for _, r := range records {
		company := r.GetString("owner_company")
		byCompany[company] = append(byCompany[company], r)
	}

	allValid := true

	for company, docs := range byCompany {
		sort.Slice(docs, func(i, j int) bool {
			return docs[i].GetInt("sequence_number") < docs[j].GetInt("sequence_number")
		})

		log.Printf("\n🏢 Company: %s", company)
		companyValid := true

		for i, doc := range docs {
			seq := doc.GetInt("sequence_number")
			number := doc.GetString("number")
			hash := doc.GetString("hash")
			previousHash := doc.GetString("previous_hash")

			// Vérifier le hash
			expectedHash := ComputeDocumentHash(doc)
			hashValid := hash == expectedHash

			// Vérifier le chaînage
			var chainValid bool
			if seq == 1 {
				chainValid = previousHash == GENESIS_HASH
			} else if i > 0 {
				chainValid = previousHash == docs[i-1].GetString("hash")
			} else {
				chainValid = true // On ne peut pas vérifier si c'est le premier de la liste
			}

			if !hashValid || !chainValid {
				companyValid = false
				allValid = false
				log.Printf("   ❌ %s (seq=%d): hash=%v, chain=%v", number, seq, hashValid, chainValid)
				if !hashValid {
					log.Printf("      Attendu: %s...", truncateHash(expectedHash))
					log.Printf("      Trouvé:  %s...", truncateHash(hash))
				}
			}
		}

		if companyValid {
			log.Printf("   ✅ Tous les documents sont valides (%d)", len(docs))
		}
	}

	if allValid {
		log.Println("\n✅ Toute la chaîne est intègre!")
	} else {
		log.Println("\n⚠️ Des anomalies ont été détectées")
	}

	return nil
}

// truncateHash retourne les 8 premiers caractères d'un hash
func truncateHash(hash string) string {
	if len(hash) > 8 {
		return hash[:8]
	}
	return hash
}

// DebugDocument affiche les détails du calcul de hash pour un document
func DebugDocument(app *pocketbase.PocketBase, documentID string) error {
	dao := app.Dao()

	record, err := dao.FindRecordById("invoices", documentID)
	if err != nil {
		return fmt.Errorf("document introuvable: %w", err)
	}

	log.Println("\n═══════════════════════════════════════════════════════════════")
	log.Printf("🔍 DEBUG: %s", record.GetString("number"))
	log.Println("═══════════════════════════════════════════════════════════════")

	data, jsonStr := DebugHashData(record)

	log.Println("\n📋 Données utilisées pour le hash:")
	for k, v := range data {
		log.Printf("   %s: %v (%T)", k, v, v)
	}

	log.Printf("\n📝 JSON sérialisé:\n%s", jsonStr)

	currentHash := record.GetString("hash")
	expectedHash := ComputeDocumentHash(record)

	log.Printf("\n🔐 Hash stocké:  %s", currentHash)
	log.Printf("🔐 Hash calculé: %s", expectedHash)

	if currentHash == expectedHash {
		log.Println("\n✅ Les hashes correspondent!")
	} else {
		log.Println("\n❌ Les hashes sont différents!")
	}

	return nil
}
