// backend/backup/apres_z.go
// ═══════════════════════════════════════════════════════════════════════════
// UNE SAUVEGARDE APRÈS CHAQUE RAPPORT Z
// ═══════════════════════════════════════════════════════════════════════════
// Le Z est le document qui scelle une journée. C'est aussi le seul instant où
// l'on sait que la journée est FINIE : après lui, plus rien ne s'ajoute. Une
// sauvegarde à ce moment-là capture une journée entière et cohérente, plutôt
// qu'un instant arbitraire choisi par une horloge.
//
// C'est un COMPLÉMENT à la sauvegarde périodique, pas son remplacement : un
// poste dont la journée n'est jamais clôturée doit continuer d'être sauvegardé,
// et 69 % de l'argent hors caisse tombe justement de journées sans clôture
// (voir le module `stats` dans CLAUDE.md).
//
// ─── Accroché au MODÈLE, pas à la route ────────────────────────────────────
// `OnRecordAfterCreateRequest` ne verrait que l'API REST. Le Z est scellé par
// du Go (`saveZReport`, backend/reports/cash_reports.go:1952), appelé depuis
// la route de clôture — une écriture par `Dao()`, invisible aux hooks de
// requête. Le niveau modèle est le seul par lequel passent tous les chemins.
// C'est la même leçon que backend/hooks/product_name_sort_hook.go.
//
// ─── Trois précautions, et chacune répare un défaut prévisible ─────────────
//  1. DIFFÉRÉ. Le hook se déclenche dans la transaction qui scelle le Z ;
//     lancer un VACUUM à cet instant ferait travailler SQLite contre lui-même.
//     Et le caissier attend son ticket de clôture, pas un envoi réseau.
//  2. NON BLOQUANT. Une goroutine détachée. La clôture ne doit JAMAIS échouer
//     parce qu'un mutualisé est lent — c'est un document fiscal.
//  3. AMORTI. Rejouer 60 rapports Z (`backend/cmd/z-repair`) ne doit pas
//     déclencher 60 sauvegardes. Une seule suffit : elles porteraient toutes
//     le même contenu final.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"log"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

// Variables et non constantes : les tests les réduisent pour exercer le hook
// sans attendre deux minutes. Elles ne sont modifiées nulle part ailleurs.
var (
	// delaiApresZ laisse la clôture se terminer : transaction commise, ticket
	// imprimé, PDF produit. Assez pour ne gêner personne, assez court pour que
	// la sauvegarde ait lieu avant l'extinction du poste.
	delaiApresZ = 2 * time.Minute

	// amortiApresZ : si une sauvegarde a réussi depuis moins de ce délai, on
	// n'en refait pas. C'est ce qui absorbe un rejeu en masse, et le cas banal
	// de deux caisses clôturant à quelques minutes d'intervalle.
	amortiApresZ = 30 * time.Minute
)

// SurRapportZ déclenche une sauvegarde après chaque Z scellé.
//
// À appeler une fois, au démarrage, après la construction du planificateur.
func (p *Planificateur) SurRapportZ(pb *pocketbase.PocketBase) {
	pb.OnModelAfterCreate("z_reports").Add(func(e *core.ModelEvent) error {
		// La valeur de retour d'un hook `After` peut faire échouer l'opération
		// appelante. On ne rend donc JAMAIS d'erreur ici : aucune défaillance
		// de sauvegarde ne doit empêcher un rapport Z d'être scellé.
		numero := ""
		if r, ok := e.Model.(interface{ GetString(string) string }); ok {
			numero = r.GetString("number")
		}

		go p.sauvegarderApresZ(numero)
		return nil
	})

	log.Println("💾 sauvegarde : armée après chaque rapport Z")
}

func (p *Planificateur) sauvegarderApresZ(numero string) {
	select {
	case <-time.After(delaiApresZ):
	case <-p.arret:
		return // le poste s'éteint : la sauvegarde périodique reprendra demain
	}

	if !p.actif() {
		return
	}

	// L'amortisseur. Il lit le dernier SUCCÈS, pas la dernière tentative :
	// une série d'échecs ne doit pas empêcher de retenter après le Z suivant.
	etat := p.LireEtat()
	if etat.DernierSucces != "" {
		if dernier, err := time.Parse(time.RFC3339, etat.DernierSucces); err == nil {
			if time.Since(dernier) < amortiApresZ {
				log.Printf("💾 sauvegarde : Z %s — une sauvegarde récente existe déjà, on n'en refait pas", numero)
				return
			}
		}
	}

	log.Printf("💾 sauvegarde : déclenchée par le rapport Z %s", numero)
	if err := p.Executer(); err != nil {
		// Journalisé, jamais affiché : le caissier vient de clôturer sa
		// journée, un message d'erreur réseau au comptoir ne lui apprend rien
		// et l'inquiète pour rien.
		log.Printf("💾 sauvegarde après Z %s : échec — %v", numero, err)
	}
}
