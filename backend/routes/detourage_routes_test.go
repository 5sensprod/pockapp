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
	"strings"
	"sync/atomic"
	"testing"
	"time"

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
	return appelDetourageChamps(t, d, image, nil)
}

// appelDetourageChamps est appelDetourage avec des champs texte en plus de l'image.
func appelDetourageChamps(t *testing.T, d detourageDeps, image []byte, champs map[string]string) *httptest.ResponseRecorder {
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
		w.Header().Set("X-Detourage-Ms", "5123")
		w.Write(pngTest)
	})
	rec := appelDetourage(t, d, jpegTest)
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), pngTest) {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Type") != "image/png" || rec.Header().Get("X-Billed-Cost") != "0.0006" {
		t.Fatalf("en-têtes: %v", rec.Header())
	}
	if rec.Header().Get("X-Detourage-Ms") != "5123" {
		t.Fatalf("durée non relayée: %v", rec.Header())
	}
}

// Un mini-SaaS pas encore redéposé ne rend pas la durée ; un en-tête qui n'est
// pas un entier n'est pas relayé.
func TestDetourageDureeAbsenteOuInvalide(t *testing.T) {
	for _, valeur := range []string{"", "abc", "12; DROP", "-5", "1234567890"} {
		var appels int32
		d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
			if valeur != "" {
				w.Header().Set("X-Detourage-Ms", valeur)
			}
			w.Write(pngTest)
		})
		rec := appelDetourage(t, d, pngTest)
		if rec.Code != 200 || rec.Header().Get("X-Detourage-Ms") != "" {
			t.Fatalf("%q: code %d, en-tête %q", valeur, rec.Code, rec.Header().Get("X-Detourage-Ms"))
		}
	}
}

// Le délai dépassé du mini-SaaS garde son code, distinct de la panne, et dit que
// rien n'a été décompté.
func TestDetourageDelaiDepasseCoteServeur(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(504)
		json.NewEncoder(w).Encode(map[string]string{"error": "x", "code": "delai_depasse"})
	})
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 504 || codeDe(t, rec) != "delai_depasse" {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "rien n'a été décompté") {
		t.Fatalf("message: %q", rec.Body.String())
	}
	if erreursDetourage["delai_depasse"].Status == erreursDetourage["fournisseur_en_echec"].Status {
		t.Fatal("même statut pour délai dépassé et panne")
	}
}

// Un mini-SaaS qui répond LENTEMENT, au-delà du délai du poste : délai dépassé,
// un seul appel (aucun second essai), et aucune promesse sur le décompte — le
// serveur a pu finir après que le poste a cessé d'attendre.
func TestDetourageDelaiDuPoste(t *testing.T) {
	var appels int32
	liberer := make(chan struct{})
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-liberer:
		case <-time.After(5 * time.Second):
		}
		w.Write(pngTest)
	})
	// Enregistré APRÈS le Close du faux serveur : il s'exécute donc avant lui
	t.Cleanup(func() { close(liberer) })
	d.client.Timeout = 200 * time.Millisecond
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 504 || codeDe(t, rec) != "delai_depasse" {
		t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "décompté") {
		t.Fatalf("le poste ne peut pas promettre le décompte: %q", rec.Body.String())
	}
	if appels != 1 {
		t.Fatalf("%d appels : pas de second essai", appels)
	}
}

// Un serveur lent mais dans le délai : l'image arrive, avec sa durée.
func TestDetourageLentMaisDansLeDelai(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("X-Detourage-Ms", "300")
		w.Write(pngTest)
	})
	d.client.Timeout = 5 * time.Second
	rec := appelDetourage(t, d, pngTest)
	if rec.Code != 200 || rec.Header().Get("X-Detourage-Ms") != "300" {
		t.Fatalf("code %d", rec.Code)
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

// La qualité part telle quelle, et SEULE : un « model » du renderer n'est jamais relayé.
func TestDetourageQualiteRelayee(t *testing.T) {
	for _, q := range []string{"rapide", "precis"} {
		t.Run(q, func(t *testing.T) {
			var appels int32
			d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
				r.ParseMultipartForm(1 << 20)
				if got := r.FormValue("qualite"); got != q {
					t.Errorf("qualite relayée = %q, attendu %q", got, q)
				}
				if len(r.MultipartForm.Value) != 1 {
					t.Errorf("champs relayés: %v (la qualité seule)", r.MultipartForm.Value)
				}
				w.Write(pngTest)
			})
			rec := appelDetourageChamps(t, d, pngTest, map[string]string{"qualite": q, "model": "runware:999@9", "width": "9999"})
			if rec.Code != 200 || appels != 1 {
				t.Fatalf("code %d, appels %d", rec.Code, appels)
			}
		})
	}
}

// Un renderer plus ancien n'envoie pas de qualité : rien n'est joint, le
// mini-SaaS prend la sienne par défaut.
func TestDetourageQualiteAbsenteNEstPasInventee(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(1 << 20)
		if _, la := r.MultipartForm.Value["qualite"]; la {
			t.Errorf("une qualité a été inventée: %v", r.MultipartForm.Value)
		}
		w.Write(pngTest)
	})
	if rec := appelDetourage(t, d, pngTest); rec.Code != 200 || appels != 1 {
		t.Fatalf("code %d, appels %d", rec.Code, appels)
	}
}

// Une qualité présente mais vide ou mal formée est refusée AVANT l'envoi, avec un
// code nommé : jamais remplacée par une autre.
func TestDetourageQualiteMalFormeeRefusee(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {})
	for _, q := range []string{"", "  ", "Rapide", "runware:112@5", "rapide;x", strings.Repeat("a", retoucheQualiteMax+1)} {
		rec := appelDetourageChamps(t, d, pngTest, map[string]string{"qualite": q})
		if rec.Code != 400 || codeDe(t, rec) != "qualite_inconnue" {
			t.Fatalf("%q: code %d, corps %q", q, rec.Code, rec.Body.String())
		}
	}
	if appels != 0 {
		t.Fatalf("%d appel(s) parti(s) malgré la qualité refusée", appels)
	}
}

// Le mini-SaaS, qui seul connaît la table, refuse une qualité inconnue : le code
// revient tel quel au renderer.
func TestDetourageQualiteInconnueDuServeur(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": "x", "code": "qualite_inconnue"})
	})
	rec := appelDetourageChamps(t, d, pngTest, map[string]string{"qualite": "ultra"})
	if rec.Code != 400 || codeDe(t, rec) != "qualite_inconnue" || appels != 1 {
		t.Fatalf("code %d, appels %d, corps %q", rec.Code, appels, rec.Body.String())
	}
}
