package routes

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
)

// appelRetouche envoie image et champs à la route (hors authentification)
// contre le faux mini-SaaS de detourage_routes_test.go.
func appelRetouche(t *testing.T, d detourageDeps, image []byte, champs map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	entete := textproto.MIMEHeader{}
	entete.Set("Content-Disposition", `form-data; name="image"; filename="x"`)
	part, _ := mw.CreatePart(entete)
	part.Write(image)
	for nom, valeur := range champs {
		mw.WriteField(nom, valeur)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/ai/image-to-image", &corps)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	if err := traiterRetouche(c, d); err != nil {
		t.Fatalf("traiterRetouche: %v", err)
	}
	return rec
}

func TestRetoucheSucces(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "cle-test" || r.Header.Get("User-Agent") != retoucheUserAgent {
			t.Errorf("en-têtes: clé %q, agent %q", r.Header.Get("X-API-Key"), r.Header.Get("User-Agent"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("multipart: %v", err)
		}
		if r.FormValue("prompt") != "un fond bleu" || r.FormValue("qualite") != "soignee" {
			t.Errorf("champs: %q / %q", r.FormValue("prompt"), r.FormValue("qualite"))
		}
		// Ni modèle ni dimensions : le poste ne choisit jamais un modèle Runware.
		for _, interdit := range []string{"model", "modele", "width", "height"} {
			if _, present := r.MultipartForm.Value[interdit]; present {
				t.Errorf("champ %q relayé", interdit)
			}
		}
		if f, _, err := r.FormFile("image"); err != nil {
			t.Errorf("image absente: %v", err)
		} else {
			f.Close()
		}
		w.Header().Set("X-Billed-Cost", "0.15")
		w.Header().Set("X-Detourage-Ms", "5200")
		w.Write(pngTest)
	})
	rec := appelRetouche(t, d, jpegTest, map[string]string{
		"prompt": "  un fond bleu  ", "qualite": "soignee",
		"model": "bfl:5@1", "width": "2048", "height": "2048",
	})
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), pngTest) {
		t.Fatalf("code %d", rec.Code)
	}
	if rec.Header().Get("X-Billed-Cost") != "0.15" || rec.Header().Get("X-Detourage-Ms") != "5200" {
		t.Fatalf("en-têtes relayés: %v", rec.Header())
	}
	if appels != 1 {
		t.Fatalf("%d appels", appels)
	}
}

func TestRetoucheRefusAvantEnvoi(t *testing.T) {
	cas := []struct {
		nom    string
		champs map[string]string
		code   string
	}{
		{"sans consigne", map[string]string{"qualite": "rapide"}, "prompt_absent"},
		{"consigne vide", map[string]string{"prompt": "  \n ", "qualite": "rapide"}, "prompt_absent"},
		{"consigne trop longue", map[string]string{"prompt": strings.Repeat("é", retoucheConsigneMax+1), "qualite": "rapide"}, "prompt_trop_long"},
		{"sans qualité", map[string]string{"prompt": "x"}, "qualite_inconnue"},
		{"un modèle à la place d'une qualité", map[string]string{"prompt": "x", "qualite": "runware:400@4"}, "qualite_inconnue"},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			var appels int32
			d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) { w.Write(pngTest) })
			rec := appelRetouche(t, d, pngTest, c.champs)
			if rec.Code != 400 || codeDe(t, rec) != c.code {
				t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
			}
			if appels != 0 {
				t.Fatalf("le mini-SaaS a été appelé")
			}
		})
	}
}

// Format et définition : relayés quand ils sont là, absents sinon, refusés mal formés.
func TestRetoucheFormatEtDefinition(t *testing.T) {
	var appels int32
	var recu map[string][]string
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		recu = r.MultipartForm.Value
		w.Write(pngTest)
	})
	base := map[string]string{"prompt": "x", "qualite": "rapide"}
	if rec := appelRetouche(t, d, pngTest, base); rec.Code != 200 {
		t.Fatalf("sans format: %d", rec.Code)
	}
	if _, present := recu["format"]; present || len(recu["definition"]) != 0 {
		t.Fatalf("champs absents relayés: %v", recu)
	}
	rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": "x", "qualite": "rapide", "format": "16x9", "definition": "haute"})
	if rec.Code != 200 || recu["format"][0] != "16x9" || recu["definition"][0] != "haute" {
		t.Fatalf("code %d, reçu %v", rec.Code, recu)
	}
	avant := appels
	for _, mauvais := range []string{"2048x2048 px", "A4;", strings.Repeat("a", retoucheQualiteMax+1)} {
		rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": "x", "qualite": "rapide", "format": mauvais})
		if rec.Code != 400 || codeDe(t, rec) != "format_inconnu" {
			t.Fatalf("%q: code %d, corps %q", mauvais, rec.Code, rec.Body.String())
		}
	}
	if appels != avant {
		t.Fatal("un format mal formé est parti au mini-SaaS")
	}
}

func TestRetoucheConsigneALaLimite(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) { w.Write(pngTest) })
	rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": strings.Repeat("é", retoucheConsigneMax), "qualite": "rapide"})
	if rec.Code != 200 {
		t.Fatalf("500 caractères accentués refusés: %d", rec.Code)
	}
}

func TestRetoucheCodesDEchec(t *testing.T) {
	cas := []struct {
		statut int
		code   string
	}{
		{402, "credit_epuise"},
		{400, "qualite_inconnue"},
		{400, "prompt_absent"},
		{400, "prompt_trop_long"},
		{422, "contenu_refuse"},
		{502, "fournisseur_en_echec"},
		{504, "delai_depasse"},
		{413, "image_trop_lourde"},
	}
	for _, c := range cas {
		t.Run(c.code, func(t *testing.T) {
			var appels int32
			d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(c.statut)
				json.NewEncoder(w).Encode(map[string]string{"error": "x", "code": c.code})
			})
			rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": "x", "qualite": "rapide"})
			if got := codeDe(t, rec); got != c.code {
				t.Fatalf("code = %q, attendu %q", got, c.code)
			}
			if rec.Code != erreursRetouche[c.code].Status {
				t.Fatalf("statut %d", rec.Code)
			}
			if appels != 1 {
				t.Fatalf("%d appels : pas de second essai", appels)
			}
		})
	}
	refus := erreursRetouche["contenu_refuse"]
	if strings.Contains(refus.Message, "Réessaie") || refus.Status == erreursRetouche["fournisseur_en_echec"].Status {
		t.Fatalf("un contenu refusé ne doit pas inviter à réessayer: %q", refus.Message)
	}
	// Chaque code du détourage a sa version « retouche ».
	for code := range erreursDetourage {
		if _, ok := erreursRetouche[code]; !ok {
			t.Errorf("code %q absent de erreursRetouche", code)
		}
	}
}

// La consigne du vendeur ne revient jamais dans une réponse d'erreur.
func TestRetoucheLaConsigneNeRevientPas(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		w.WriteHeader(422)
		json.NewEncoder(w).Encode(map[string]string{"error": "refusé : " + r.FormValue("prompt"), "code": "contenu_refuse"})
	})
	rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": "CONSIGNE-SECRETE", "qualite": "rapide"})
	if codeDe(t, rec) != "contenu_refuse" || strings.Contains(rec.Body.String(), "SECRETE") {
		t.Fatalf("corps %q", rec.Body.String())
	}
}

func TestRetoucheDelaiDuPoste(t *testing.T) {
	var appels int32
	liberer := make(chan struct{})
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-liberer:
		case <-time.After(5 * time.Second):
		}
		w.Write(pngTest)
	})
	t.Cleanup(func() { close(liberer) })
	d.client.Timeout = 200 * time.Millisecond
	rec := appelRetouche(t, d, pngTest, map[string]string{"prompt": "x", "qualite": "rapide"})
	if rec.Code != 504 || codeDe(t, rec) != "delai_depasse" {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "décompté") || !strings.Contains(rec.Body.String(), "retouche") {
		t.Fatalf("message du délai du poste: %q", rec.Body.String())
	}
	if appels != 1 {
		t.Fatalf("%d appels : pas de second essai", appels)
	}
}

func TestRetoucheGardesCommunes(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("<html>")) })
	champs := map[string]string{"prompt": "x", "qualite": "rapide"}
	if got := codeDe(t, appelRetouche(t, d, pngTest, champs)); got != "reponse_invalide" {
		t.Fatalf("réponse non PNG: %q", got)
	}
	if got := codeDe(t, appelRetouche(t, d, []byte("GIF89a...."), champs)); got != "type_refuse" {
		t.Fatalf("GIF: %q", got)
	}
	d.endpoint = "http://exemple.test/api/retouche.php"
	if got := codeDe(t, appelRetouche(t, d, pngTest, champs)); got != "adresse_non_securisee" {
		t.Fatalf("hors HTTPS: %q", got)
	}
	d.cle = func() (string, error) { return "", nil }
	if got := codeDe(t, appelRetouche(t, d, pngTest, champs)); got != "cle_absente" {
		t.Fatalf("clé absente: %q", got)
	}
	if appels != 1 {
		t.Fatalf("%d appels : seul le premier cas devait partir", appels)
	}
	if !strings.HasPrefix(pocketAppRetoucheURL, "https://") {
		t.Fatal("adresse par défaut non HTTPS")
	}
}
