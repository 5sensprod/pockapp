package routes

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
)

// fauxFacebook monte UN serveur TLS qui joue le mini-SaaS (`facebook.php`) et
// compte ses appels. Aucun vrai Graph, aucune publication réelle.
type fauxFacebook struct {
	deps   facebookDeps
	appels int32
	srv    *httptest.Server
}

func monterFauxFacebook(t *testing.T, saas http.HandlerFunc) *fauxFacebook {
	t.Helper()
	f := &fauxFacebook{}
	f.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&f.appels, 1)
		if r.Method != http.MethodPost || r.Header.Get("X-API-Key") != "cle-test" || r.Header.Get("User-Agent") != facebookUserAgent {
			t.Errorf("mini-SaaS: %s, clé %q, agent %q", r.Method, r.Header.Get("X-API-Key"), r.Header.Get("User-Agent"))
		}
		// Rien dans l'adresse : ni clé, ni jeton, ni message
		if r.URL.RawQuery != "" {
			t.Errorf("paramètres dans l'adresse: %q", r.URL.RawQuery)
		}
		saas(w, r)
	}))
	t.Cleanup(f.srv.Close)
	f.deps = facebookDeps{
		cle:      func() (string, error) { return "cle-test", nil },
		endpoint: f.srv.URL,
		client:   f.srv.Client(),
	}
	return f
}

func appelFacebookJSON(t *testing.T, methode, corps string, traiter func(echo.Context) error) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(methode, "/api/facebook/x", strings.NewReader(corps))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if err := traiter(echo.New().NewContext(req, rec)); err != nil {
		t.Fatalf("route: %v", err)
	}
	return rec
}

var pngFacebook = append(append([]byte{}, pngSignature...), bytes.Repeat([]byte{0}, 64)...)

const envoiTest = "envoi-de-test-000001"

// publierFB appelle la route de publication avec un formulaire multipart.
func publierFB(t *testing.T, d facebookDeps, image []byte, champs map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	if image != nil {
		part, _ := mw.CreateFormFile("image", "affiche.png")
		part.Write(image)
	}
	for nom, valeur := range champs {
		mw.WriteField(nom, valeur)
	}
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/facebook/publier", &corps)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	if err := traiterFacebookPublier(echo.New().NewContext(req, rec), d); err != nil {
		t.Fatalf("route: %v", err)
	}
	return rec
}

func codeFacebook(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var rendu struct {
		Code string `json:"code"`
	}
	json.Unmarshal(rec.Body.Bytes(), &rendu)
	return rendu.Code
}

func attendreCode(t *testing.T, rec *httptest.ResponseRecorder, statut int, code string) {
	t.Helper()
	if rec.Code != statut || codeFacebook(t, rec) != code {
		t.Fatalf("attendu %d %s, reçu %d %s", statut, code, rec.Code, rec.Body.String())
	}
}

const etatConnecte = `{"configure":true,"connecte":true,"page":{"id":"1001","nom":"Axe Musique"},"depuis":"2026-10-06T10:00:00Z","a_choisir":[]}`

func TestFacebookEtat(t *testing.T) {
	var formulaire map[string][]string
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		formulaire = r.PostForm
		// Un mini-SaaS fautif qui laisserait fuir un jeton : il ne doit pas traverser
		io.WriteString(w, `{"configure":true,"connecte":true,"page":{"id":"1001","nom":"Axe Musique","token_enc":"v1.FUITE"},"depuis":"2026-10-06T10:00:00Z","a_choisir":[{"id":"1002","nom":"Atelier","access_token":"FUITE"},{"id":"pas-un-id","nom":"x"}],"jeton":"FUITE"}`)
	})
	rec := appelFacebookJSON(t, http.MethodGet, "", func(c echo.Context) error { return traiterFacebookEtat(c, f.deps) })
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	if formulaire["action"][0] != "etat" || len(formulaire) != 1 {
		t.Fatalf("formulaire: %v", formulaire)
	}
	var etat facebookEtat
	if err := json.Unmarshal(rec.Body.Bytes(), &etat); err != nil {
		t.Fatal(err)
	}
	if !etat.Connecte || etat.Page == nil || etat.Page.Nom != "Axe Musique" || len(etat.AChoisir) != 1 || etat.AChoisir[0].ID != "1002" {
		t.Fatalf("état: %+v", etat)
	}
	if strings.Contains(rec.Body.String(), "FUITE") || strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("un champ inconnu a traversé: %s", rec.Body.String())
	}
}

func TestFacebookConnecter(t *testing.T) {
	var formulaire map[string][]string
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		formulaire = r.PostForm
		io.WriteString(w, `{"configure":true,"connecte":false,"page":null,"depuis":null,"a_choisir":[{"id":"1001","nom":"Axe Musique"},{"id":"1002","nom":"Atelier"}]}`)
	})
	connecter := func(corps string) *httptest.ResponseRecorder {
		return appelFacebookJSON(t, http.MethodPost, corps, func(c echo.Context) error { return traiterFacebookConnecter(c, f.deps) })
	}

	rec := connecter(`{"jeton":"  EAAGjetonUtilisateur123  "}`)
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	if formulaire["action"][0] != "connecter" || formulaire["jeton"][0] != "EAAGjetonUtilisateur123" {
		t.Fatalf("formulaire: %v", formulaire)
	}
	// Le jeton ne revient jamais au renderer
	if strings.Contains(rec.Body.String(), "EAAG") {
		t.Fatalf("le jeton est revenu: %s", rec.Body.String())
	}
	var etat facebookEtat
	json.Unmarshal(rec.Body.Bytes(), &etat)
	if etat.Connecte || len(etat.AChoisir) != 2 {
		t.Fatalf("état: %+v", etat)
	}

	// Refus avant tout envoi
	avant := atomic.LoadInt32(&f.appels)
	attendreCode(t, connecter(`{"jeton":"   "}`), 400, "jeton_absent")
	attendreCode(t, connecter(`{"jeton":"un jeton avec espace"}`), 400, "jeton_refuse")
	attendreCode(t, connecter(`{"jeton":"`+strings.Repeat("a", facebookJetonMax+1)+`"}`), 400, "jeton_refuse")
	if atomic.LoadInt32(&f.appels) != avant {
		t.Fatalf("un jeton refusé est parti")
	}
}

func TestFacebookChoisirEtDeconnecter(t *testing.T) {
	var formulaire map[string][]string
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		formulaire = r.PostForm
		io.WriteString(w, etatConnecte)
	})
	choisir := func(corps string) *httptest.ResponseRecorder {
		return appelFacebookJSON(t, http.MethodPost, corps, func(c echo.Context) error { return traiterFacebookChoisir(c, f.deps) })
	}
	if rec := choisir(`{"page_id":"1001"}`); rec.Code != 200 || formulaire["action"][0] != "choisir" || formulaire["page_id"][0] != "1001" {
		t.Fatalf("choisir: %d %v", rec.Code, formulaire)
	}
	avant := atomic.LoadInt32(&f.appels)
	attendreCode(t, choisir(`{"page_id":"1001; DROP"}`), 404, "page_inconnue")
	attendreCode(t, choisir(`{}`), 404, "page_inconnue")
	if atomic.LoadInt32(&f.appels) != avant {
		t.Fatalf("un identifiant de Page mal formé est parti")
	}
	rec := appelFacebookJSON(t, http.MethodPost, "", func(c echo.Context) error { return traiterFacebookDeconnecter(c, f.deps) })
	if rec.Code != 200 || formulaire["action"][0] != "deconnecter" {
		t.Fatalf("déconnecter: %d %v", rec.Code, formulaire)
	}
}

func TestFacebookPublierSucces(t *testing.T) {
	var (
		champs  map[string][]string
		image   []byte
		typeMIM string
	)
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("multipart: %v", err)
		}
		champs = r.MultipartForm.Value
		if recus := r.MultipartForm.File["image"]; len(recus) == 1 {
			typeMIM = recus[0].Header.Get("Content-Type")
			fichier, _ := recus[0].Open()
			image, _ = io.ReadAll(fichier)
		}
		io.WriteString(w, `{"lien":"https://www.facebook.com/1001_999","post_id":"1001_999","page":{"id":"1001","nom":"Axe Musique","access_token":"FUITE"}}`)
	})
	rec := publierFB(t, f.deps, pngFacebook, map[string]string{
		"message": "  Promo de Noël\r\nJusqu'à samedi  ",
		"envoi":   envoiTest,
		// Ce que le poste n'a pas à décider ne part pas
		"page_id": "9999", "access_token": "x", "action": "connecter",
	})
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var rendu facebookPublication
	json.Unmarshal(rec.Body.Bytes(), &rendu)
	if rendu.Lien != "https://www.facebook.com/1001_999" || rendu.Page == nil || rendu.Page.Nom != "Axe Musique" {
		t.Fatalf("réponse: %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "FUITE") {
		t.Fatalf("un jeton a traversé: %s", rec.Body.String())
	}
	if len(champs) != 3 || champs["action"][0] != "publier" || champs["envoi"][0] != envoiTest || champs["message"][0] != "Promo de Noël\nJusqu'à samedi" {
		t.Fatalf("champs relayés: %v", champs)
	}
	if !bytes.Equal(image, pngFacebook) || typeMIM != "image/png" {
		t.Fatalf("image relayée: %d octets, %q", len(image), typeMIM)
	}
	if atomic.LoadInt32(&f.appels) != 1 {
		t.Fatalf("%d envois", f.appels)
	}
}

func TestFacebookPublierRefusAvantEnvoi(t *testing.T) {
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("rien ne devait partir")
	})
	bon := map[string]string{"message": "Bonjour", "envoi": envoiTest}
	avec := func(nom, valeur string) map[string]string {
		m := map[string]string{"message": "Bonjour", "envoi": envoiTest}
		m[nom] = valeur
		return m
	}

	attendreCode(t, publierFB(t, f.deps, pngFacebook, avec("message", strings.Repeat("é", facebookMessageMax+1))), 400, "message_trop_long")
	attendreCode(t, publierFB(t, f.deps, pngFacebook, avec("envoi", "")), 400, "envoi_invalide")
	attendreCode(t, publierFB(t, f.deps, pngFacebook, avec("envoi", "trop court")), 400, "envoi_invalide")
	attendreCode(t, publierFB(t, f.deps, nil, bon), 400, "image_absente")
	attendreCode(t, publierFB(t, f.deps, []byte("<html>pas une image</html>"), bon), 415, "type_refuse")
	attendreCode(t, publierFB(t, f.deps, []byte("GIF89a"+strings.Repeat("x", 40)), bon), 415, "type_refuse")
	lourde := append(append([]byte{}, pngSignature...), make([]byte, facebookImageMaxBytes)...)
	attendreCode(t, publierFB(t, f.deps, lourde, bon), 413, "image_trop_lourde")

	// Clé absente
	sansCle := f.deps
	sansCle.cle = func() (string, error) { return "  ", nil }
	attendreCode(t, publierFB(t, sansCle, pngFacebook, bon), 503, "cle_absente")
	rec := appelFacebookJSON(t, http.MethodGet, "", func(c echo.Context) error { return traiterFacebookEtat(c, sansCle) })
	attendreCode(t, rec, 503, "cle_absente")

	// HTTP refusé : ni un jeton ni une affiche ne partent en clair
	enClair := f.deps
	enClair.endpoint = strings.Replace(f.srv.URL, "https://", "http://", 1)
	attendreCode(t, publierFB(t, enClair, pngFacebook, bon), 503, "adresse_non_securisee")
	rec = appelFacebookJSON(t, http.MethodPost, `{"jeton":"EAAGjeton"}`, func(c echo.Context) error { return traiterFacebookConnecter(c, enClair) })
	attendreCode(t, rec, 503, "adresse_non_securisee")
}

func TestFacebookCodesRelayes(t *testing.T) {
	cas := []struct {
		statutSaas int
		corps      string
		statut     int
		code       string
	}{
		{401, `{"code":"cle_invalide"}`, 503, "cle_invalide"},
		{503, `{"code":"configuration_absente"}`, 503, "configuration_absente"},
		{409, `{"code":"page_non_connectee"}`, 409, "page_non_connectee"},
		// Jeton expiré : ni 401 ni 403 vers le renderer, et « rien n'a été publié »
		{403, `{"code":"jeton_expire"}`, 409, "jeton_expire"},
		{403, `{"code":"permission_manquante"}`, 409, "permission_manquante"},
		{422, `{"code":"contenu_refuse"}`, 422, "contenu_refuse"},
		{409, `{"code":"deja_envoye"}`, 409, "deja_envoye"},
		{502, `{"code":"fournisseur_en_echec"}`, 502, "fournisseur_en_echec"},
		{504, `{"code":"publication_incertaine"}`, 504, "publication_incertaine"},
		{413, `{"code":"image_trop_lourde"}`, 413, "image_trop_lourde"},
		// Refus net et inconnu : rien n'est parti
		{400, `{"code":"code_jamais_vu"}`, 502, "fournisseur_en_echec"},
		// 5xx sans code connu (PHP en panne, couche anti-bot) : on ne sait pas
		{500, `{"code":"erreur_interne"}`, 504, "publication_incertaine"},
		{503, `<html>The page is temporarily unavailable</html>`, 504, "publication_incertaine"},
		// 200 illisible : la photo est sans doute en ligne, on ne propose pas de renvoyer
		{200, `<html>pas du json</html>`, 504, "publication_incertaine"},
		{200, `{"lien":"https://exemple.test/1001_999","post_id":"1001_999"}`, 504, "publication_incertaine"},
		{200, `{"lien":"https://www.facebook.com/1001_999","post_id":"autre"}`, 504, "publication_incertaine"},
		{200, `{}`, 504, "publication_incertaine"},
	}
	for _, c := range cas {
		f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(c.statutSaas)
			io.WriteString(w, c.corps)
		})
		rec := publierFB(t, f.deps, pngFacebook, map[string]string{"message": "Bonjour", "envoi": envoiTest})
		if rec.Code != c.statut || codeFacebook(t, rec) != c.code {
			t.Errorf("%d %s → attendu %d %s, reçu %d %s", c.statutSaas, c.corps, c.statut, c.code, rec.Code, rec.Body.String())
		}
		if atomic.LoadInt32(&f.appels) != 1 {
			t.Errorf("%s : %d envois, un seul attendu", c.code, f.appels)
		}
	}
	if !strings.Contains(erreursFacebook["jeton_expire"].Message, "Rien n'a été publié") {
		t.Errorf("le message de jeton_expire doit dire que rien n'est publié")
	}
}

func TestFacebookEtatReponseMalFormee(t *testing.T) {
	for _, corps := range []string{`<html>`, `{"page":{"id":"pas-un-id","nom":"x"}}`} {
		f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, corps) })
		rec := appelFacebookJSON(t, http.MethodGet, "", func(c echo.Context) error { return traiterFacebookEtat(c, f.deps) })
		attendreCode(t, rec, 502, "reponse_invalide")
	}
	// Hors publication, un 5xx inconnu est une panne ordinaire
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) })
	rec := appelFacebookJSON(t, http.MethodGet, "", func(c echo.Context) error { return traiterFacebookEtat(c, f.deps) })
	attendreCode(t, rec, 502, "service_indisponible")
}

func TestFacebookPublierDelaiEtPanne(t *testing.T) {
	// Le poste cesse d'attendre : l'affiche a pu partir, et UN seul envoi a eu lieu
	f := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		time.Sleep(400 * time.Millisecond)
	})
	f.deps.client.Timeout = 100 * time.Millisecond
	rec := publierFB(t, f.deps, pngFacebook, map[string]string{"message": "Bonjour", "envoi": envoiTest})
	attendreCode(t, rec, 504, "publication_incertaine")
	time.Sleep(500 * time.Millisecond)
	if atomic.LoadInt32(&f.appels) != 1 {
		t.Fatalf("%d envois après un délai : jamais de second essai", f.appels)
	}

	// Serveur injoignable : rien n'est parti, on peut le dire
	ferme := monterFauxFacebook(t, func(w http.ResponseWriter, r *http.Request) {})
	ferme.srv.Close()
	rec = publierFB(t, ferme.deps, pngFacebook, map[string]string{"message": "Bonjour", "envoi": envoiTest})
	attendreCode(t, rec, 502, "service_indisponible")
}
