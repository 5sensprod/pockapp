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

		// 7. 🆕 Rapports Z (dépend de cash_registers + cash_sessions)
		ensureZReportsCollection,   // Crée la collection z_reports
		AddZReportIdToCashSessions, // Ajoute z_report_id sur cash_sessions
		AddRoleToUsers,
		AddCompanyToUsers,
		MigrateAppSettings,

		// 🆕 Moyens de paiement
		ensurePaymentMethodsCollection,  // Crée la collection
		AddPaymentMethodLabelToInvoices, // Ajoute payment_method_label sur invoices

		EnsureAllCompaniesHavePaymentMethods,

		// 🆕 Type de client et délais de paiement
		AddCustomerTypeToCustomers, // Ajoute customer_type (individual, professional, administration, association)
		AddPaymentTermsToCustomers, // Ajoute payment_terms (immediate, 30_days, 45_days, 60_days)
		BackfillCustomerType,       // Remplit "individual" par défaut pour les clients existants
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
		}
	}

	log.Println("✅ Migrations terminées")
	return nil
}
