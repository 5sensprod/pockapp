package remise

import (
	"testing"

	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

func fiche(champs map[string]any) *models.Record {
	col := &models.Collection{Name: "products"}
	for nom, v := range champs {
		t := schema.FieldTypeNumber
		if _, ok := v.(string); ok {
			t = schema.FieldTypeText
		}
		col.Schema.AddField(&schema.SchemaField{Name: nom, Type: t})
	}
	r := models.NewRecord(col)
	for nom, v := range champs {
		r.Set(nom, v)
	}
	return r
}

func utilisateur(role string, actif bool, pct float64) *models.Record {
	col := &models.Collection{Name: "users"}
	col.Schema.AddField(&schema.SchemaField{Name: "role", Type: schema.FieldTypeText})
	col.Schema.AddField(&schema.SchemaField{Name: "discount_limit_enabled", Type: schema.FieldTypeBool})
	col.Schema.AddField(&schema.SchemaField{Name: "max_discount_percent", Type: schema.FieldTypeNumber})
	r := models.NewRecord(col)
	r.Set("role", role)
	r.Set("discount_limit_enabled", actif)
	r.Set("max_discount_percent", pct)
	return r
}

func TestPlafondAdminEtDesactiveNeLimitentPas(t *testing.T) {
	if _, l := Plafond(nil); l {
		t.Error("sans utilisateur : pas de limite")
	}
	if _, l := Plafond(utilisateur("admin", true, 5)); l {
		t.Error("admin : pas de limite")
	}
	if _, l := Plafond(utilisateur("caissier", false, 5)); l {
		t.Error("plafond désactivé : pas de limite")
	}
	if p, l := Plafond(utilisateur("caissier", true, 0)); !l || p != 0 {
		t.Errorf("0 %% activé doit limiter à 0, obtenu %v %v", p, l)
	}
}

func TestVerifierLigne(t *testing.T) {
	ligne := func(net float64) []Ligne {
		return []Ligne{{Nom: "Guitare", Quantite: 2, NetTTC: net, Reference: 100}}
	}
	if err := Verifier(ligne(180), 180, 10); err != nil {
		t.Errorf("10 %% pile doit passer : %v", err)
	}
	if err := Verifier(ligne(179), 179, 10); err == nil {
		t.Error("10,5 % doit être refusé")
	}
	if err := Verifier(ligne(200), 200, 0); err != nil {
		t.Errorf("sans remise à 0 %% : %v", err)
	}
}

func TestVerifierRemisePanier(t *testing.T) {
	lignes := []Ligne{
		{Nom: "A", Quantite: 1, NetTTC: 100, Reference: 100},
		{Nom: "B", Quantite: 1, NetTTC: 100, Reference: 100},
	}
	if err := Verifier(lignes, 170, 10); err == nil {
		t.Error("15 % sur le panier doit être refusé")
	}
	if err := Verifier(lignes, 180, 10); err != nil {
		t.Errorf("10 %% sur le panier doit passer : %v", err)
	}
}

func TestReferenceFichePromoEtStockB(t *testing.T) {
	jour := "2026-09-17"
	p := fiche(map[string]any{
		"price_ttc": 100.0, "promo_price_ttc": 80.0, "stock_b_price_ttc": 60.0,
		"sale_state": "promo", "promo_start": "", "promo_end": "",
	})
	if r := ReferenceFiche(p, "Guitare", jour, 0); r != 80 {
		t.Errorf("promo en vigueur : référence 80, obtenu %v", r)
	}
	if r := ReferenceFiche(p, "Guitare (Stock B)", jour, 0); r != 60 {
		t.Errorf("ligne Stock B : référence 60, obtenu %v", r)
	}

	p.Set("promo_end", "2026-09-16")
	if r := ReferenceFiche(p, "Guitare", jour, 0); r != 100 {
		t.Errorf("promo expirée : référence 100, obtenu %v", r)
	}

	// Le prix retapé plus bas ne sert pas de référence quand la fiche existe.
	if r := ReferenceFiche(p, "Guitare", jour, 50); r != 100 {
		t.Errorf("prix saisi ignoré : référence 100, obtenu %v", r)
	}
}

func TestRemiseGlobaleInterdite(t *testing.T) {
	if VerifierRemiseGlobale(0) != nil {
		t.Error("sans remise globale : accepté")
	}
	if VerifierRemiseGlobale(5) == nil {
		t.Error("remise globale : refusée")
	}
}

// Remise « monétaire » : un prix unitaire posé à 9,52 € sur 11,90 € fait
// 20 % — jugé sur le net, quel que soit le mode de saisie.
func TestVerifierRemiseEnEuros(t *testing.T) {
	l := []Ligne{{Nom: "Câble", Quantite: 1, NetTTC: 9.52, Reference: 11.90}}
	if err := Verifier(l, 9.52, 20); err != nil {
		t.Errorf("20 %% en euros doit passer : %v", err)
	}
	if err := Verifier(l, 9.52, 15); err == nil {
		t.Error("20 % en euros au-delà de 15 % doit être refusé")
	}
}
