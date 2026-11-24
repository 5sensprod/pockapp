// backend/assistant/boucle.go
//
// LA BOUCLE : Gemini propose un appel d'outil, le Go l'exécute, et l'on
// recommence — dans des bornes. Généralisation de la boucle de
// `backend/routes/photos_routes.go`, qui ne connaît qu'un outil.
//
// Ce paquet ne lit aucune clé et ne déclare aucun jeton : la route lui donne
// la clé et reçoit les compteurs. Rien n'est journalisé ici.

package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Gemini : où et comment appeler le modèle. La clé part dans l'en-tête, jamais
// dans l'adresse.
type Gemini struct {
	URL       string
	Cle       string
	UserAgent string
	Client    *http.Client
}

// Tour : un échange passé. Role vaut « user » ou « model ».
type Tour struct {
	Role  string
	Texte string
}

type Demande struct {
	Systeme    string
	Historique []Tour
	// Message : le dernier tour du vendeur, contexte compris.
	Message string
	// ToursMax : appels à Gemini pour UNE demande. AppelsMax : exécutions d'outil.
	ToursMax     int
	AppelsMax    int
	JetonsSortie int
}

// Issue d'une demande. Un seul de Texte et Resultat est rempli ; aucun des
// deux si les bornes ont été atteintes sans réponse.
type Issue struct {
	// Texte : ce que le MODÈLE a dit, sans outil. À relire avant de l'afficher.
	Texte string
	// Outil et Resultat : l'outil qui a clos la demande, et ce qu'il a rendu.
	Outil    string
	Resultat *Resultat
	// Appels : exécutions d'outil. Tours : appels à Gemini.
	Appels, Tours  int
	Entree, Sortie int
}

// ErreurHTTP : Gemini a répondu autre chose qu'un 2xx.
type ErreurHTTP struct{ Status int }

func (e *ErreurHTTP) Error() string { return fmt.Sprintf("Gemini a répondu HTTP %d", e.Status) }

type contenu struct {
	Role  string           `json:"role,omitempty"`
	Parts []map[string]any `json:"parts"`
}

func contenuTexte(role, texte string) json.RawMessage {
	raw, _ := json.Marshal(contenu{Role: role, Parts: []map[string]any{{"text": texte}}})
	return raw
}

// historiqueNet rend les tours passés sous la forme que Gemini accepte :
// alternés, commençant par le vendeur et finissant par le modèle.
func historiqueNet(tours []Tour) []json.RawMessage {
	var nets []Tour
	for _, t := range tours {
		texte := strings.TrimSpace(t.Texte)
		if texte == "" || (t.Role != "user" && t.Role != "model") {
			continue
		}
		if len(nets) == 0 && t.Role == "model" {
			continue
		}
		if n := len(nets); n > 0 && nets[n-1].Role == t.Role {
			nets[n-1].Texte += "\n" + texte
			continue
		}
		nets = append(nets, Tour{t.Role, texte})
	}
	if n := len(nets); n > 0 && nets[n-1].Role == "user" {
		nets = nets[:n-1]
	}
	contenus := make([]json.RawMessage, 0, len(nets)+1)
	for _, t := range nets {
		contenus = append(contenus, contenuTexte(t.Role, t.Texte))
	}
	return contenus
}

type appel struct {
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

type reponseGemini struct {
	// brut : le contenu du modèle, renvoyé TEL QUEL au tour suivant — il peut
	// porter une signature de pensée que Gemini exige de retrouver.
	brut           json.RawMessage
	texte          string
	appel          *appel
	entree, sortie int
}

func appeler(ctx context.Context, g Gemini, corps map[string]any) (reponseGemini, error) {
	charge, err := json.Marshal(corps)
	if err != nil {
		return reponseGemini{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.URL, bytes.NewReader(charge))
	if err != nil {
		return reponseGemini{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", g.Cle)
	req.Header.Set("User-Agent", g.UserAgent)

	reponse, err := g.Client.Do(req)
	if err != nil {
		return reponseGemini{}, err
	}
	defer reponse.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(reponse.Body, 1024*1024))
	if err != nil {
		return reponseGemini{}, err
	}
	if reponse.StatusCode < 200 || reponse.StatusCode >= 300 {
		return reponseGemini{}, &ErreurHTTP{Status: reponse.StatusCode}
	}

	var rendu struct {
		Candidates []struct {
			Content json.RawMessage `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(raw, &rendu); err != nil {
		return reponseGemini{}, err
	}
	r := reponseGemini{entree: rendu.UsageMetadata.PromptTokenCount, sortie: rendu.UsageMetadata.CandidatesTokenCount}
	if len(rendu.Candidates) == 0 || len(rendu.Candidates[0].Content) == 0 {
		return r, errors.New("Gemini n'a rendu aucun candidat")
	}
	r.brut = rendu.Candidates[0].Content
	var lu struct {
		Parts []struct {
			Text         string `json:"text"`
			Thought      bool   `json:"thought"`
			FunctionCall *appel `json:"functionCall"`
		} `json:"parts"`
	}
	if err := json.Unmarshal(r.brut, &lu); err != nil {
		return r, err
	}
	var morceaux []string
	for _, p := range lu.Parts {
		// Un seul appel par tour : le premier. Les suivants sont ignorés.
		if p.FunctionCall != nil && r.appel == nil {
			r.appel = p.FunctionCall
		}
		if !p.Thought && strings.TrimSpace(p.Text) != "" {
			morceaux = append(morceaux, strings.TrimSpace(p.Text))
		}
	}
	r.texte = strings.Join(morceaux, " ")
	return r, nil
}

// Dialoguer mène UNE demande. Les compteurs de jetons de l'Issue sont justes
// même quand une erreur est rendue : ce qui a été dépensé se déclare.
func Dialoguer(ctx context.Context, g Gemini, registre *Registre, c Contexte, d Demande) (Issue, error) {
	contenus := append(historiqueNet(d.Historique), contenuTexte("user", d.Message))
	corps := map[string]any{
		"system_instruction": contenu{Parts: []map[string]any{{"text": d.Systeme}}},
		"tools":              registre.declarations(),
		"generationConfig": map[string]any{
			"maxOutputTokens": d.JetonsSortie,
			"thinkingConfig":  map[string]any{"thinkingLevel": "minimal"},
		},
	}

	var issue Issue
	for issue.Tours < d.ToursMax {
		corps["contents"] = contenus
		reponse, err := appeler(ctx, g, corps)
		issue.Tours++
		issue.Entree += reponse.entree
		issue.Sortie += reponse.sortie
		if err != nil {
			return issue, err
		}
		if reponse.appel == nil {
			issue.Texte = reponse.texte
			return issue, nil
		}
		if issue.Appels >= d.AppelsMax {
			return issue, nil
		}
		issue.Appels++

		var resultat Resultat
		outil, connu := registre.Trouver(reponse.appel.Name)
		switch {
		case !connu:
			resultat = Resultat{PourModele: map[string]any{"erreur": "outil inconnu"}}
		case outil.Niveau != Lecture:
			// Ne peut pas arriver tant que Enregistrer les refuse ; la boucle ne
			// s'en remet pas à lui.
			resultat = Resultat{PourModele: map[string]any{"erreur": "cet outil exige une confirmation du vendeur"}}
		default:
			resultat = outil.Executer(c, reponse.appel.Args)
		}
		if resultat.Final || resultat.Erreur != nil {
			issue.Outil = reponse.appel.Name
			issue.Resultat = &resultat
			return issue, nil
		}
		retour, _ := json.Marshal(contenu{Role: "user", Parts: []map[string]any{{
			"functionResponse": map[string]any{"name": reponse.appel.Name, "response": resultat.PourModele},
		}}})
		contenus = append(contenus, reponse.brut, retour)
	}
	return issue, nil
}
