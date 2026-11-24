// backend/assistant/registre.go
//
// LE REGISTRE DES OUTILS DE L'ASSISTANT (6 octobre 2026).
// Doc : frontend/modules/stock/PocketStock-docs/06-assistant-catalogue.md.
//
// Un assistant qui « exécute des opérations avec les outils de l'application »
// n'a le droit de faire que ce qui est inscrit ici. Un outil, c'est un nom, un
// schéma d'arguments, un NIVEAU, et une fonction Go : le modèle remplit des
// arguments typés, le Go les valide et fait le travail par les chemins
// existants. Le modèle n'écrit ni SQL, ni filtre PocketBase.
//
// ── LES NIVEAUX ────────────────────────────────────────────────────────────
// `lecture` : exécuté par la boucle, sans confirmation.
// `ecriture`, `envoi` : PRÉVUS, PAS CODÉS. Ils exigeront une confirmation du
// vendeur ; la boucle ne les exécutera jamais elle-même. Tant que ce chemin de
// confirmation n'existe pas, `Enregistrer` les REFUSE — un outil d'écriture ne
// peut pas entrer par inadvertance (gardien : `registre_test.go`).
//
// Pour ajouter un outil d'écriture, le jour venu :
//  1. donner à `Outil` une fonction `Preparer` (arguments validés → un
//     récapitulatif écrit par le Go, sans rien écrire) à côté de `Executer` ;
//  2. faire rendre à la boucle, pour ces niveaux, une PROPOSITION au lieu d'un
//     résultat, et s'arrêter là ;
//  3. exécuter depuis une seconde route, sur un identifiant à usage unique
//     rendu avec la proposition, après le « oui » du vendeur ;
//  4. lever alors le refus de `Enregistrer` pour le niveau concerné.

package assistant

import (
	"context"
	"encoding/json"
	"fmt"
)

type Niveau string

const (
	Lecture  Niveau = "lecture"
	Ecriture Niveau = "ecriture"
	Envoi    Niveau = "envoi"
)

// Contexte : ce que la ROUTE sait de la demande. Rien ici ne vient du modèle.
type Contexte struct {
	Ctx        context.Context
	Entreprise string
}

// Resultat d'un outil.
type Resultat struct {
	// PourModele repart chez Gemini (rôle de `functionResponse`). Borné par
	// l'outil : c'est la seule chose d'un résultat qui sort du poste.
	PourModele map[string]any
	// Final : la demande est traitée, la boucle s'arrête SANS rappeler le
	// modèle. Texte, Effet et Question vont au renderer, jamais à Gemini.
	Final bool
	// Texte : une phrase écrite par le Go (question, « aucune correspondance »).
	Texte string
	// Effet : ce que l'écran doit faire. Opaque pour le registre.
	Effet any
	// Question : une ambiguïté à faire lever par le vendeur.
	Question any
	// Erreur : une panne (lecture de la base), pas un refus d'arguments.
	Erreur error
}

type Outil struct {
	Nom         string
	Description string
	Niveau      Niveau
	// Parametres : le schéma déclaré à Gemini (`type: OBJECT`, `properties`…).
	// Il GUIDE le modèle ; il ne valide rien. La validation est dans Executer.
	Parametres map[string]any
	Executer   func(c Contexte, arguments json.RawMessage) Resultat
}

type Registre struct {
	outils []Outil
	rangs  map[string]int
}

func NouveauRegistre() *Registre {
	return &Registre{rangs: map[string]int{}}
}

func (r *Registre) Enregistrer(o Outil) error {
	if o.Nom == "" || o.Executer == nil {
		return fmt.Errorf("outil incomplet : %q", o.Nom)
	}
	if o.Niveau != Lecture {
		return fmt.Errorf("outil %q de niveau %q refusé : seul le niveau « lecture » est exécutable tant que la confirmation du vendeur n'existe pas", o.Nom, o.Niveau)
	}
	if _, deja := r.rangs[o.Nom]; deja {
		return fmt.Errorf("outil %q déjà enregistré", o.Nom)
	}
	r.rangs[o.Nom] = len(r.outils)
	r.outils = append(r.outils, o)
	return nil
}

func (r *Registre) Trouver(nom string) (Outil, bool) {
	rang, connu := r.rangs[nom]
	if !connu {
		return Outil{}, false
	}
	return r.outils[rang], true
}

// declarations : le bloc `tools` d'une requête Gemini.
func (r *Registre) declarations() []map[string]any {
	fonctions := make([]map[string]any, 0, len(r.outils))
	for _, o := range r.outils {
		fonctions = append(fonctions, map[string]any{
			"name":        o.Nom,
			"description": o.Description,
			"parameters":  o.Parametres,
		})
	}
	return []map[string]any{{"functionDeclarations": fonctions}}
}
