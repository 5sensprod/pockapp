package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

// RunMigrations exécute toutes les migrations dans l'ordre
func RunMigrations(app *pocketbase.PocketBase) error {
	log.Println("🚀 Démarrage des migrations...")

	migrations := []func(*pocketbase.PocketBase) error{
		// 1. Companies (base, pas de dépendances)
		ensureCompaniesCollection,

		// 2. Catalogue (dépend de companies)
		ensureBrandsCollection,
		ensureCategoriesCollection,
		ensureSuppliersCollection,
		ensureProductsCollection,

		// 3. Clients (dépend de companies)
		ensureCustomersCollection,

		// 4. Documents commerciaux (dépend de companies + customers)
		ensureInvoicesCollection,
		ensureQuotesCollection,

		// 5. Clôtures et audit (dépend de companies + invoices)
		ensureClosuresCollection,
		ensureAuditLogsCollection,

		// 6. Caisse (dépend de companies)
		ensureCashRegistersCollection,
		ensureCashSessionsCollection,
		ensureCashMovementsCollection,

		// 7. Rapports Z (dépend de cash_registers + cash_sessions)
		ensureZReportsCollection,
		AddZReportIdToCashSessions,
		AddRoleToUsers,
		AddCompanyToUsers,
		MigrateAppSettings,

		// Moyens de paiement
		ensurePaymentMethodsCollection,
		AddPaymentMethodLabelToInvoices,

		EnsureAllCompaniesHavePaymentMethods,

		// Type de client et délais de paiement
		AddCustomerTypeToCustomers,
		AddPaymentTermsToCustomers,
		BackfillCustomerType,
		FixInvoiceTotalsNonzero,

		// 8. 🆕 Inventaire physique
		// sessions d'abord — entries dépend de son ID via RelationField
		ensureInventorySessionsCollection,
		ensureInventoryEntriesCollection,

		FixInventoryCollectionFields,
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
		}
	}

	log.Println("✅ Migrations terminées")
	return nil
}
