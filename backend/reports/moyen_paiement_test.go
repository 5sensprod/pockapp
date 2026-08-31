package reports

import (
	"testing"

	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

func documentAvecMoyen(code, libelle string) *models.Record {
	col := &models.Collection{
		Name: "invoices",
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "payment_method", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "payment_method_label", Type: schema.FieldTypeText},
		),
	}
	rec := models.NewRecord(col)
	rec.Set("payment_method", code)
	rec.Set("payment_method_label", libelle)
	return rec
}

// Le même moyen de paiement ne doit apparaître que sur UNE ligne de
// ventilation. Mesuré le 31 août 2026 : 347 documents portaient `cb` sans
// libellé (53 617,97 €) et se ventilaient à côté des 512 documents « Carte
// bancaire ». Le Z, le X et le journal des ventes partagent ce point de
// passage : les trois se contredisaient de la même façon.
func TestUnCodeHeriteSeVentileSousLeLibelleDuReferentiel(t *testing.T) {
	cas := []struct {
		code   string
		attend string
	}{
		{"cb", "Carte bancaire"},
		{"card", "Carte bancaire"},
		{"especes", "Espèces"},
		{"cash", "Espèces"},
		{"cheque", "Chèque"},
		{"check", "Chèque"},
		{"virement", "Virement"},
		{"transfer", "Virement"},
	}
	for _, c := range cas {
		if got := libelleMoyenPaiement(documentAvecMoyen(c.code, "")); got != c.attend {
			t.Errorf("code %q : %q au lieu de %q", c.code, got, c.attend)
		}
	}
}

// `autre` et `multi` sans libellé ne sont pas des synonymes mal orthographiés :
// ce sont des absences d'information, 12 106 € au 31 août 2026. Leur donner un
// libellé de référentiel les ferait passer pour un moyen connu.
func TestUneAbsenceDeMoyenNeSeVoitPasInventerUnLibelle(t *testing.T) {
	for _, code := range []string{"autre", "multi"} {
		if got := libelleMoyenPaiement(documentAvecMoyen(code, "")); got != code {
			t.Errorf("code %q traduit en %q ; il doit rester tel quel", code, got)
		}
	}
	if got := libelleMoyenPaiement(documentAvecMoyen("", "")); got != "Non précisé" {
		t.Errorf("document sans moyen : %q au lieu de « Non précisé »", got)
	}
}

// Le libellé porté par le document l'emporte sur son code, et la table ne doit
// pas le court-circuiter : c'est lui qui distingue « Pass Culture » de
// « Chorus », tous deux stockés sous le code `autre`.
func TestLeLibelleDuDocumentLEmporteSurLaTable(t *testing.T) {
	if got := libelleMoyenPaiement(documentAvecMoyen("autre", "Pass Culture")); got != "Pass Culture" {
		t.Errorf("%q au lieu de « Pass Culture »", got)
	}
	if got := libelleMoyenPaiement(documentAvecMoyen("cb", "3XCB")); got != "3XCB" {
		t.Errorf("%q au lieu de « 3XCB »", got)
	}
}

func avoirRembourse(refund, paiement, libelle string) *models.Record {
	rec := documentAvecMoyen(paiement, libelle)
	rec.Set("refund_method", refund)
	return rec
}

// Un remboursement se ventile sous le MÊME libellé que l'encaissement.
// Mesuré le 31 août 2026 : sept rapports portaient encore `cb` ou `especes` en
// négatif, à côté de « Carte bancaire » et « Espèces » — quatre endroits
// lisaient `refund_method` en direct, sans passer par la table.
func TestUnRemboursementSeVentileSousLeMemeLibelleQuUnEncaissement(t *testing.T) {
	cas := []struct{ refund, attend string }{
		{"cb", "Carte bancaire"},
		{"especes", "Espèces"},
		{"cheque", "Chèque"},
		{"virement", "Virement"},
	}
	for _, c := range cas {
		if got := libelleMoyenRemboursement(avoirRembourse(c.refund, "", "")); got != c.attend {
			t.Errorf("refund_method %q : %q au lieu de %q", c.refund, got, c.attend)
		}
	}
}

// L'ordre de résolution : le libellé du document, puis le moyen de
// remboursement, puis le moyen d'encaissement d'origine, puis « autre ».
func TestLeMoyenDeRemboursementSeResoutDansCetOrdre(t *testing.T) {
	if got := libelleMoyenRemboursement(avoirRembourse("cb", "especes", "Pass Culture")); got != "Pass Culture" {
		t.Errorf("le libellé du document doit primer, obtenu %q", got)
	}
	if got := libelleMoyenRemboursement(avoirRembourse("", "cb", "")); got != "Carte bancaire" {
		t.Errorf("sans refund_method, le moyen d'origine ; obtenu %q", got)
	}
	if got := libelleMoyenRemboursement(avoirRembourse("", "", "")); got != "autre" {
		t.Errorf("sans rien : %q au lieu de « autre »", got)
	}
	if got := libelleMoyenRemboursement(avoirRembourse("autre", "", "")); got != "autre" {
		t.Errorf("un `autre` explicite reste « autre », obtenu %q", got)
	}
}
