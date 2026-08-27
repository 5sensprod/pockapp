package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
)

// RunMigrations exécute toutes les migrations dans l'ordre
func RunMigrations(app *pocketbase.PocketBase) error {
	log.Println("🚀 Démarrage des migrations...")

	migrations := []func(*pocketbase.PocketBase) error{
		FixTokenKeys,
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
		ensureOrdersCollection,

		AddSourceOrderIdToInvoices,

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
		// Ticket Z-1 : le Z passe au modèle « un total, quatre lignes ».
		AddCollectedToZReports,
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
		AddCustomerNumberToCustomers,
		BackfillCustomerNumber,
		FixInvoiceTotalsNonzero,

		// 8. Inventaire physique
		// sessions d'abord — entries dépend de son ID via RelationField
		ensureInventorySessionsCollection,
		ensureInventoryEntriesCollection,
		backfillInventoryStats,
		purgeEmptyInventorySessions,
		FixInventoryCollectionFields,
		ensureProductEventsCollection,
		AddDepositFieldsToInvoices,

		// 9. 🆕 Dépôt-vente instruments d'occasion (dépend de customers + companies)
		EnsureConsignmentItemsCollection,

		// 10. 🆕 Garanties (dépend de companies)
		AddWarrantiesToCompanies,

		// 11. Menu du site axemusique.shop — aucune dépendance
		ensureSiteMenuCollection,

		// 12. Schéma cible du catalogue (ticket T1 de la migration NeDB →
		// PocketBase). DOIT rester APRÈS les ensure*Collection du point 2 :
		// elle reprend ce qu'elles ont créé. Elle ne touche pas aux autres
		// collections, et refuse de s'exécuter si le catalogue n'est pas vide.
		MigrateCatalogV2,

		// 13. Correctif : les champs JSON de `suppliers` étaient déclarés sans
		// MaxSize, donc à 0, ce qui rendait TOUTE mise à jour d'un fournisseur
		// impossible. DOIT rester après MigrateCatalogV2, qui crée la collection.
		FixSupplierJsonMaxSize,

		// 14. L'état commercial — « occasion », « location » — sort de l'arbre
		// des catégories et devient un champ du produit (DECISIONS,
		// 2026-08-24). DOIT rester après MigrateCatalogV2, qui recrée
		// `products` : placée avant, elle serait détruite avec la collection,
		// et sans la moindre erreur.
		AddCommercialStateToProducts,

		// 15. L'opération commerciale — « solde », « promo » — est un champ
		// DISTINCT de l'état commercial : un produit d'occasion peut être
		// soldé, et `commercial_state` est mono-valeur. Même contrainte
		// d'ordre : après MigrateCatalogV2, qui recrée `products`.
		AddSaleStateToProducts,

		// 16. Réparation de DONNÉES, pas de schéma : les fiches dont le nom EN
		// LIGNE n'est que le `sku`, séquelle de l'import AppPos. Après
		// MigrateCatalogV2, qui recrée `products` — et idempotente, donc sans
		// effet aux démarrages suivants.
		BackfillProductNameFromDesignation,
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
		}
	}

	log.Println("✅ Migrations terminées")
	return nil
}
