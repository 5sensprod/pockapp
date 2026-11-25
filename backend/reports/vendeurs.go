// backend/reports/vendeurs.go
//
// Le détail PAR VENDEUR du rapport X et du journal des ventes.
//
// Une seule règle d'attribution, partagée : l'auteur d'un document est celui qui
// l'a ENCAISSÉ (`cashier_id`), à défaut celui qui l'a émis (`sold_by`). Un avoir
// est attribué à celui qui rembourse, pas au vendeur du ticket d'origine.
// Les documents sans auteur (anciens) tombent dans « Non attribué » : la somme
// des vendeurs égale toujours le total, rien ne disparaît.
//
// Ce n'est PAS un second agrégateur : les lignes (ventes du jour, règlements,
// acomptes, remboursements) viennent du classificateur du Z, déjà appliqué par
// l'appelant. Ce fichier ne fait que ranger des montants déjà classés.

package reports

import (
	"sort"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// VendeurTotal : ce qu'un utilisateur a fait sur la période ou la session.
type VendeurTotal struct {
	ID             string  `json:"id"`
	Nom            string  `json:"nom"`
	VentesDuJour   float64 `json:"ventes_du_jour"`
	Creances       float64 `json:"creances"`
	Acomptes       float64 `json:"acomptes"`
	Remboursements float64 `json:"remboursements"`
	Encaisse       float64 `json:"encaisse"`
	NbDocuments    int     `json:"nb_documents"`
}

// auteurDocument : cashier_id, sinon sold_by, sinon "" (non attribué).
func auteurDocument(inv *models.Record) string {
	if id := inv.GetString("cashier_id"); id != "" {
		return id
	}
	return inv.GetString("sold_by")
}

type cumulVendeurs struct {
	dao  *daos.Dao
	noms map[string]string
	m    map[string]*VendeurTotal
}

func nouveauCumulVendeurs(app *pocketbase.PocketBase) *cumulVendeurs {
	return &cumulVendeurs{
		dao:  app.Dao(),
		noms: make(map[string]string),
		m:    make(map[string]*VendeurTotal),
	}
}

// nom résout un identifiant en nom lisible (nom, sinon email), mis en cache.
func (c *cumulVendeurs) nom(id string) string {
	if id == "" {
		return "Non attribué"
	}
	if n, ok := c.noms[id]; ok {
		return n
	}
	n := id
	if u, err := c.dao.FindRecordById("users", id); err == nil && u != nil {
		if v := u.GetString("name"); v != "" {
			n = v
		} else if v := u.GetString("email"); v != "" {
			n = v
		}
	}
	c.noms[id] = n
	return n
}

// ajouter range un montant DÉJÀ classé. `montant` est positif, y compris pour
// un remboursement.
func (c *cumulVendeurs) ajouter(id string, ligne LigneZ, montant float64) {
	v, ok := c.m[id]
	if !ok {
		v = &VendeurTotal{ID: id, Nom: c.nom(id)}
		c.m[id] = v
	}
	switch ligne {
	case LigneVentesDuJour:
		v.VentesDuJour += montant
	case LigneCreances:
		v.Creances += montant
	case LigneAcomptes:
		v.Acomptes += montant
	case LigneRemboursements:
		v.Remboursements += montant
	default:
		return
	}
	v.NbDocuments++
}

// liste : arrondie, Encaissé calculé comme dans le journal, le plus gros en tête.
func (c *cumulVendeurs) liste() []VendeurTotal {
	out := make([]VendeurTotal, 0, len(c.m))
	for _, v := range c.m {
		v.VentesDuJour = roundAmount(v.VentesDuJour)
		v.Creances = roundAmount(v.Creances)
		v.Acomptes = roundAmount(v.Acomptes)
		v.Remboursements = roundAmount(v.Remboursements)
		v.Encaisse = roundAmount(v.VentesDuJour + v.Creances + v.Acomptes - v.Remboursements)
		out = append(out, *v)
	}
	sort.Slice(out, func(i, k int) bool {
		if out[i].Encaisse != out[k].Encaisse {
			return out[i].Encaisse > out[k].Encaisse
		}
		return out[i].Nom < out[k].Nom
	})
	return out
}
