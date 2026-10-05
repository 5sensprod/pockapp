package routes

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"sync/atomic"
	"testing"

	"github.com/labstack/echo/v5"
)

var (
	pngTest  = append(append([]byte{}, pngSignature...), []byte("IHDR-faux-contenu")...)
	jpegTest = []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 'J', 'F', 'I', 'F', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0}
)

// appelDetourage envoie `image` à la route (hors authentification) contre le
// faux mini-SaaS et rend la réponse enregistrée.
func appelDetourage(t *testing.T, d detourageDeps, image []byte) *httptest.ResponseRecorder {
	t.Helper()
	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	entete := textproto.MIMEHeader{}
	entete.Set("Content-Disposition", `form-data; name="image"; filename="x"`)
	part, _ := mw.CreatePart(entete)
	part.Write(image)
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/ai/remove-background", &corps)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	if err := traiterDetourage(c, d); err != nil {
		t.Fatalf("traiterDetourage: %v", err)
	}
	return rec
}

func fauxMiniSaaS(t *testing.T, appels *int32, handler http.HandlerFunc) detourageDeps {
	t.Helper()
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(appels, 1)
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return detourageDeps{
		cle:      func() (string, error) { return "cle-test", nil },
		endpoint: srv.URL,
		client:   srv.Client(),
	}
}

func codeDe(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var corps struct {
		Code  string `json:"code"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &corps); err != nil {
		t.Fatalf("réponse non JSON: %q", rec.Body.String())
	}
	if corps.Error == "" {
		t.Fatalf("message français manquant")
	}
	return corps.Code
}

func TestDetourageSucces(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "cle-test" {
			t.Errorf("X-API-Key = %q", r.Header.Get("X-API-Key"))
		}
		if r.Header.Get("User-Agent") != detourageUserAgent {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		f, _, err := r.FormFile("image")
		if err != nil {
			t.Errorf("champ image: %v", err)
		} else if octets, _ := io.ReadAll(f); !bytes.Equal(octets, jpegTest) {
			t.Errorf("octets modifiés en route")
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("X-Billed-Cost", "0.0006")
		w.Write(pngTest)
	})
	rec := appelDetourage(t, d, jpegTest)
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), pngTest) {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/png" || rec.Header().Get("X-Billed-Cost") != "0.0006" {
		t.Fatalf("en-têtes: %v", rec.Header())
	}
}

func TestDetourageCodesDEchec(t *testing.T) {
	cas := []struct {
		statut int
		code   string
	}{
		{401, "cle_invalide"},
		{402, "credit_epuise"},
		{413, "image_trop_lourde"},
		{415, "type_refuse"},
		{502, "fournisseur_en_echec"},
	}
	for _, c := range cas {
		t.Run(c.code, func(t *testing.T) {
			var appels int32
			d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(c.statut)
				json.NewEncoder(w).Encode(map[string]string{"error": "x", "code": c.code})
			})
			rec := appelDetourage(t, d, pngTest)
			if got := codeDe(t, rec); got != c.code {
				t.Fatalf("code = %q, attendu %q", got, c.code)
			}
			if rec.Code != erreursDetourage[c.code].Status {
				t.Fatalf("statut %d", rec.Code)
			}
		})
	}
	// Crédit épuisé et panne doivent rester distinguables.
	if erreursDetourage["credit_epuise"].Status == erreursDetourage["fournisseur_en_echec"].Status {
		t.Fatal("même statut pour crédit épuisé et panne")
	}
}

func TestDetourageEchecInconnuOuIllisible(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(503)
		w.Write([]byte("<html>The page is temporarily unavailable</html>"))
	})
	if got := codeDe(t, appelDetourage(t, d, pngTest)); got != "fournisseur_en_echec" {
		t.Fatalf("code = %q", got)
	}
}

func TestDetourageCleAbsente(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {})
	d.cle = func() (string, error) { return "  ", nil }
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 503 || codeDe(t, rec) != "cle_absente" || appels != 0 {
		t.Fatalf("code %d, appels %d", rec.Code, appels)
	}
	d.cle = func() (string, error) { return "", errors.New("pas de secret") }
	if codeDe(t, appelDetourage(t, d, pngTest)) != "cle_absente" {
		t.Fatal("erreur de lecture du secret mal rendue")
	}
}

func TestDetourageTypeRefuseAvantEnvoi(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {})
	// Un PDF, et du HTML qui se dirait PNG : seuls les octets comptent.
	for _, octets := range [][]byte{[]byte("%PDF-1.4 contenu"), []byte("<html><script>alert(1)</script></html>")} {
		rec := appelDetourage(t, d, octets)
		if rec.Code != 415 || codeDe(t, rec) != "type_refuse" {
			t.Fatalf("code %d", rec.Code)
		}
	}
	if appels != 0 {
		t.Fatalf("%d appel(s) parti(s) malgré le type refusé", appels)
	}
}

func TestDetourageReponseQuiNEstPasUnPNG(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("<html>pas un png</html>"))
	})
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 502 || codeDe(t, rec) != "reponse_invalide" {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
}

func TestDetourageRefuseHorsHTTPS(t *testing.T) {
	var appels int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&appels, 1)
	}))
	defer srv.Close()
	d := detourageDeps{
		cle:      func() (string, error) { return "cle-test", nil },
		endpoint: srv.URL,
		client:   srv.Client(),
	}
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 503 || codeDe(t, rec) != "adresse_non_securisee" || appels != 0 {
		t.Fatalf("code %d, appels %d", rec.Code, appels)
	}
}

func TestDetourageServiceInjoignable(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {})
	d.endpoint = "https://127.0.0.1:1/api/detourage.php"
	if got := codeDe(t, appelDetourage(t, d, pngTest)); got != "service_indisponible" {
		t.Fatalf("code = %q", got)
	}
}

func TestDetourageAdresseParDefautEstHTTPS(t *testing.T) {
	if len(pocketAppDetourageURL) < 8 || pocketAppDetourageURL[:8] != "https://" {
		t.Fatal(pocketAppDetourageURL)
	}
}
