// backend/routes/credits_routes_test.go
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — la clé du mini-SaaS ne descend plus dans le renderer
// ═══════════════════════════════════════════════════════════════════════════
//
// Jusqu'au 6 octobre 2026, `GET /api/settings/pocketapp-key` rendait la clé
// déchiffrée à quiconque joignait le PocketBase, sans session. La route est
// supprimée ; le solde se lit par `GET /api/credits/balance`, où le Go pose
// lui-même la clé et ne rend que le solde.

package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v5"
)

const cleDeTest = "cle-du-mini-saas-de-test"

// faux mini-SaaS : note ce qu'il a reçu, rend un solde.
type fauxSolde struct {
	serveur   *httptest.Server
	appels    int
	cleRecue  string
	agentRecu string
	requete   string
}

func nouveauFauxSolde(t *testing.T, statut int, corps string) *fauxSolde {
	t.Helper()
	f := &fauxSolde{}
	f.serveur = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.appels++
		f.cleRecue = r.Header.Get("X-API-Key")
		f.agentRecu = r.Header.Get("User-Agent")
		f.requete = r.URL.RawQuery
		w.WriteHeader(statut)
		_, _ = w.Write([]byte(corps))
	}))
	t.Cleanup(f.serveur.Close)
	return f
}

func (a *appAdmin) brancherSolde(f *fauxSolde, cle string) {
	deps := creditsDeps{
		cle:      func() (string, error) { return cle, nil },
		endpoint: f.serveur.URL,
		client:   f.serveur.Client(),
	}
	a.routeur.GET("/api/test/solde", func(c echo.Context) error {
		return traiterSoldeCredits(c, deps)
	})
}

func (a *appAdmin) lire(chemin, jeton string) (int, string) {
	req := httptest.NewRequest(http.MethodGet, chemin, nil)
	if jeton != "" {
		req.Header.Set("Authorization", "Bearer "+jeton)
	}
	rec := httptest.NewRecorder()
	a.routeur.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func TestCredits_LaRouteQuiRendaitLaCleNExistePlus(t *testing.T) {
	a := nouvelleAppAdmin(t)
	for _, jeton := range []string{"", a.vraiJeton(t, a.vendeur), a.vraiJeton(t, a.admin)} {
		if code, _ := a.lire("/api/settings/pocketapp-key", jeton); code != http.StatusNotFound {
			t.Errorf("GET /api/settings/pocketapp-key : %d, attendu 404", code)
		}
	}
}

func TestCredits_SansSessionRienNePart(t *testing.T) {
	a := nouvelleAppAdmin(t)
	f := nouveauFauxSolde(t, http.StatusOK, `{"balance_eur":"3.5"}`)
	a.brancherSolde(f, cleDeTest)

	jetons := a.jetonsFabriques(t)
	jetons["aucun jeton"] = ""
	for nom, jeton := range jetons {
		for _, chemin := range []string{"/api/test/solde", "/api/credits/balance"} {
			if code, _ := a.lire(chemin, jeton); code != http.StatusUnauthorized {
				t.Errorf("%s sur %s : %d, attendu 401", nom, chemin, code)
			}
		}
	}
	if f.appels != 0 {
		t.Errorf("le mini-SaaS a été appelé %d fois sans session", f.appels)
	}
}

func TestCredits_UneSessionLitLeSoldeEtJamaisLaCle(t *testing.T) {
	for nom, corps := range map[string]string{
		"solde en chaîne": `{"balance_eur":"3.5","api_key":"` + cleDeTest + `"}`,
		"solde en nombre": `{"balance_eur":3.5}`,
	} {
		a := nouvelleAppAdmin(t)
		f := nouveauFauxSolde(t, http.StatusOK, corps)
		a.brancherSolde(f, cleDeTest)

		// Un vendeur suffit : l'en-tête affiche le solde à tout le monde.
		code, rendu := a.lire("/api/test/solde", a.vraiJeton(t, a.vendeur))
		if code != http.StatusOK {
			t.Fatalf("%s : %d, attendu 200 (%s)", nom, code, rendu)
		}
		if !strings.Contains(rendu, `"balance_eur":3.5`) || !strings.Contains(rendu, `"configured":true`) {
			t.Errorf("%s : réponse inattendue %s", nom, rendu)
		}
		if strings.Contains(rendu, cleDeTest) {
			t.Errorf("%s : la clé est dans la réponse : %s", nom, rendu)
		}
		if f.cleRecue != cleDeTest || f.requete != "balance=1" {
			t.Errorf("%s : le mini-SaaS a reçu clé=%q requête=%q", nom, f.cleRecue, f.requete)
		}
		// La couche anti-bot rejette l'agent par défaut de Go.
		if f.agentRecu == "" || strings.HasPrefix(f.agentRecu, "Go-http-client") {
			t.Errorf("%s : User-Agent %q", nom, f.agentRecu)
		}
	}
}

func TestCredits_SansCleRienNePart(t *testing.T) {
	a := nouvelleAppAdmin(t)
	f := nouveauFauxSolde(t, http.StatusOK, `{"balance_eur":1}`)
	a.brancherSolde(f, "")

	code, rendu := a.lire("/api/test/solde", a.vraiJeton(t, a.vendeur))
	if code != http.StatusOK || !strings.Contains(rendu, `"configured":false`) {
		t.Errorf("sans clé : %d %s", code, rendu)
	}
	if f.appels != 0 {
		t.Errorf("le mini-SaaS a été appelé %d fois sans clé", f.appels)
	}
}

func TestCredits_PanneDuMiniSaaS(t *testing.T) {
	a := nouvelleAppAdmin(t)
	f := nouveauFauxSolde(t, http.StatusUnauthorized, `{"error":"clé `+cleDeTest+` refusée"}`)
	a.brancherSolde(f, cleDeTest)

	code, rendu := a.lire("/api/test/solde", a.vraiJeton(t, a.vendeur))
	if code != http.StatusBadGateway {
		t.Errorf("panne : %d, attendu 502", code)
	}
	if strings.Contains(rendu, cleDeTest) {
		t.Errorf("la clé est dans le message d'erreur : %s", rendu)
	}
}

func TestCredits_RefuseHorsHTTPS(t *testing.T) {
	a := nouvelleAppAdmin(t)
	clair := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("la clé est partie en clair : %q", r.Header.Get("X-API-Key"))
	}))
	t.Cleanup(clair.Close)
	deps := creditsDeps{
		cle:      func() (string, error) { return cleDeTest, nil },
		endpoint: clair.URL,
		client:   clair.Client(),
	}
	a.routeur.GET("/api/test/solde-clair", func(c echo.Context) error {
		return traiterSoldeCredits(c, deps)
	})
	if code, _ := a.lire("/api/test/solde-clair", a.vraiJeton(t, a.vendeur)); code != http.StatusBadGateway {
		t.Errorf("hors HTTPS : %d, attendu 502", code)
	}
}
