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
		// Ticket S-1 : le Z compte séparément ses tickets et ses factures.
		AddSalesCountsToZReports,
		// Ticket L-1 : le Z porte la liste des documents de sa ligne 1.
		AddSalesDocumentsToZReports,
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
		// Le select multi-valeurs des clients et le rattrapage des déposants
		// dépendent tous deux de consignment_items.
		MigrateCustomerTags,

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

		// 16. Le déposant d'un produit d'occasion est un client, jamais un
		// fournisseur. Relation facultative, après MigrateCatalogV2 qui recrée
		// `products`.
		AddConsignorToProducts,

		// 17. Réparation de DONNÉES, pas de schéma : les fiches dont le nom EN
		// LIGNE n'est que le `sku`, séquelle de l'import AppPos. Après
		// MigrateCatalogV2, qui recrée `products` — et idempotente, donc sans
		// effet aux démarrages suivants.
		BackfillProductNameFromDesignation,

		// 18. Réparation de DONNÉES : une catégorie créée dans PocketApp sans
		// slug partait en ligne avec `slug: null`. Ne touche jamais un slug non
		// vide ; le checksum de chaque catégorie réparée change volontairement.
		BackfillCategorySlugs,

		// 19. Le tri « Produit · A à Z » du catalogue sortait dans l'ordre des
		// octets — majuscules d'abord, accents après « Z ». `name_sort` porte la
		// forme triable du nom ; le hook `RegisterProductNameSortHook` la tient
		// à jour, sans quoi seules les fiches d'hier seraient bien classées.
		// Après MigrateCatalogV2, qui recrée `products`.
		AddNameSortToProducts,

		// 20. Un mouvement de stock manuel porte un motif — réassort, correction,
		// casse, Stock B, autre — et chaque motif son type d'événement. Après
		// ensureProductEventsCollection, qui crée la collection.
		AddStockReasonsToProductEvents,

		// 21. Le Stock B est une seconde quantité du produit, pas un état.
		// Après MigrateCatalogV2, qui recrée `products`.
		AddStockBToProducts,

		// 22. Le prix promo : un second prix, appliqué en REMISE DE LIGNE quand
		// le produit est soldé ou en promotion. Le prix d'origine ne bouge pas.
		// Après MigrateCatalogV2, qui recrée `products`.
		AddPromoPriceToProducts,

		// 23. Le prix d'une unité Stock B, posé en remise de ligne quand la
		// caisse vend du B. Après MigrateCatalogV2, qui recrée `products`.
		AddStockBPriceToProducts,

		// 24. La période d'une promo — deux dates calendaires « AAAA-MM-JJ »,
		// bornes incluses. Après MigrateCatalogV2, qui recrée `products`.
		AddPromoPeriodToProducts,
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
		}
	}

	log.Println("✅ Migrations terminées")
	return nil
}
