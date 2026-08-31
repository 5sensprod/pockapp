package migrations

import (
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/migrate"
)

func newCustomerTagsTestApp(t *testing.T) *pocketbase.PocketBase {
	t.Helper()

	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	customers := &models.Collection{Name: "customers", Type: models.CollectionTypeBase}
	customers.Schema.AddField(&schema.SchemaField{
		Name: "name",
		Type: schema.FieldTypeText,
	})
	customers.Schema.AddField(&schema.SchemaField{
		Name: "tags",
		Type: schema.FieldTypeSelect,
		Options: &schema.SelectOptions{
			MaxSelect: 10,
			Values:    []string{"vip", "prospect", "actif", "inactif"},
		},
	})
	if err := app.Dao().SaveCollection(customers); err != nil {
		t.Fatalf("création de customers: %v", err)
	}

	consignments := &models.Collection{Name: "consignment_items", Type: models.CollectionTypeBase}
	consignments.Schema.AddField(&schema.SchemaField{
		Name: "customer",
		Type: schema.FieldTypeText,
	})
	if err := app.Dao().SaveCollection(consignments); err != nil {
		t.Fatalf("création de consignment_items: %v", err)
	}

	return app
}

func createCustomerWithTags(
	t *testing.T,
	app *pocketbase.PocketBase,
	name string,
	tags ...string,
) *models.Record {
	t.Helper()

	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		t.Fatalf("collection customers: %v", err)
	}
	record := models.NewRecord(collection)
	record.Set("name", name)
	record.Set("tags", tags)
	if err := app.Dao().SaveRecord(record); err != nil {
		t.Fatalf("création du client %s: %v", name, err)
	}
	return record
}

func createConsignment(t *testing.T, app *pocketbase.PocketBase, customerID string) {
	t.Helper()

	collection, err := app.Dao().FindCollectionByNameOrId("consignment_items")
	if err != nil {
		t.Fatalf("collection consignment_items: %v", err)
	}
	record := models.NewRecord(collection)
	record.Set("customer", customerID)
	if err := app.Dao().SaveRecord(record); err != nil {
		t.Fatalf("création du dépôt: %v", err)
	}
}

func TestMigrateCustomerTagsPreserveLesTagsEtEstRejouable(t *testing.T) {
	app := newCustomerTagsTestApp(t)
	depositor := createCustomerWithTags(t, app, "Prospect déposant", "prospect")
	legacy := createCustomerWithTags(t, app, "VIP sans dépôt", "vip")
	createConsignment(t, app, depositor.Id)
	createConsignment(t, app, depositor.Id)

	if err := MigrateCustomerTags(app); err != nil {
		t.Fatalf("première migration: %v", err)
	}
	if err := MigrateCustomerTags(app); err != nil {
		t.Fatalf("seconde migration: %v", err)
	}

	reloadedDepositor, err := app.Dao().FindRecordById("customers", depositor.Id)
	if err != nil {
		t.Fatalf("relecture du déposant: %v", err)
	}
	if got := reloadedDepositor.GetStringSlice("tags"); !slices.Equal(
		got,
		[]string{"prospect", CustomerTagDepositor},
	) {
		t.Fatalf("le tag existant doit survivre et déposant ne doit apparaître qu'une fois : %v", got)
	}

	reloadedLegacy, err := app.Dao().FindRecordById("customers", legacy.Id)
	if err != nil {
		t.Fatalf("relecture du client historique: %v", err)
	}
	if got := reloadedLegacy.GetStringSlice("tags"); !slices.Equal(got, []string{"vip"}) {
		t.Fatalf("un client sans dépôt ne doit pas être retouché : %v", got)
	}

	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		t.Fatalf("relecture du schéma: %v", err)
	}
	field := collection.Schema.GetFieldByName("tags")
	options := field.Options.(*schema.SelectOptions)
	if !slices.Equal(options.Values, []string{"prospect", "déposant", "vip"}) {
		t.Fatalf("la valeur historique utilisée doit rester valide : %v", options.Values)
	}
	filtered, err := app.Dao().FindRecordsByFilter(
		"customers",
		`tags ~ "déposant"`,
		"",
		0,
		0,
	)
	if err != nil {
		t.Fatalf("filtre serveur des déposants: %v", err)
	}
	if len(filtered) != 1 || filtered[0].Id != depositor.Id {
		t.Fatalf("le filtre serveur doit rendre le seul déposant : %v", filtered)
	}
}

func TestPocketBaseLaisseUneValeurOrphelineQuandUneOptionEstRetiree(t *testing.T) {
	app := newCustomerTagsTestApp(t)
	client := createCustomerWithTags(t, app, "VIP", "vip")

	collection, err := app.Dao().FindCollectionByNameOrId("customers")
	if err != nil {
		t.Fatalf("collection customers: %v", err)
	}
	field := collection.Schema.GetFieldByName("tags")
	field.Options.(*schema.SelectOptions).Values = []string{"prospect"}
	if err := app.Dao().SaveCollection(collection); err != nil {
		t.Fatalf("PocketBase a refusé le retrait de l'option: %v", err)
	}

	reloaded, err := app.Dao().FindRecordById("customers", client.Id)
	if err != nil {
		t.Fatalf("relecture du client: %v", err)
	}
	if got := reloaded.GetStringSlice("tags"); !slices.Equal(got, []string{"vip"}) {
		t.Fatalf("comportement PocketBase attendu : valeur orpheline conservée, obtenu %v", got)
	}
}
