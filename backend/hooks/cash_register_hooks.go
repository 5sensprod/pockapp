package hooks

import (
	"errors"
	"fmt"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// RegisterCashRegisterHooks : « une seule caisse active par société » (décision
// du 29 août 2026 : une caisse, deux postes). Ces hooks ne se déclenchent que
// pour l'API REST ; le code Go écrit par le Dao et n'est pas concerné. La règle
// d'accès (administrateur seul) est dans la migration cash_registers.
//
// Une caisse existante ne se supprime pas et ne se désactive pas si c'est la
// seule : les tickets, sessions et rapports Z la nomment par son identifiant.
func RegisterCashRegisterHooks(app *pocketbase.PocketBase) {
	autresActives := func(company, sauf string) int {
		var n struct {
			N int `db:"n"`
		}
		q := app.Dao().DB().NewQuery(
			"SELECT COUNT(*) AS n FROM cash_registers WHERE owner_company = {:c} AND is_active = 1 AND id != {:id}",
		).Bind(dbx.Params{"c": company, "id": sauf})
		if err := q.One(&n); err != nil {
			return 0
		}
		return n.N
	}

	app.OnRecordBeforeCreateRequest("cash_registers").Add(func(e *core.RecordCreateEvent) error {
		if !e.Record.GetBool("is_active") {
			return nil
		}
		if autresActives(e.Record.GetString("owner_company"), "") > 0 {
			return errors.New("il existe déjà une caisse active pour cette société : une seule caisse est prévue")
		}
		return nil
	})

	app.OnRecordBeforeUpdateRequest("cash_registers").Add(func(e *core.RecordUpdateEvent) error {
		avant := e.Record.OriginalCopy()
		if avant.GetBool("is_active") && !e.Record.GetBool("is_active") &&
			autresActives(avant.GetString("owner_company"), avant.Id) == 0 {
			return errors.New("impossible de désactiver la seule caisse active : plus aucun encaissement ne serait possible")
		}
		if !avant.GetBool("is_active") && e.Record.GetBool("is_active") &&
			autresActives(e.Record.GetString("owner_company"), e.Record.Id) > 0 {
			return errors.New("il existe déjà une caisse active pour cette société")
		}
		return nil
	})

	app.OnRecordBeforeDeleteRequest("cash_registers").Add(func(e *core.RecordDeleteEvent) error {
		var n struct {
			N int `db:"n"`
		}
		_ = app.Dao().DB().NewQuery("SELECT COUNT(*) AS n FROM cash_sessions WHERE cash_register = {:id}").
			Bind(dbx.Params{"id": e.Record.Id}).One(&n)
		if n.N > 0 {
			return fmt.Errorf("cette caisse porte %d session(s) et des rapports Z : elle ne se supprime pas", n.N)
		}
		return nil
	})
}
