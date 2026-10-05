package routes

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/labstack/echo/v5"
)

// Les deux tâches ajoutées à la route de retouche (champ « tache ») :
// « generation » — un texte seul — et « composition » — plusieurs images.
// La retouche d'origine est gardée par retouche_routes_test.go, inchangé.

type fichierTest struct {
	champ  string
	octets []byte
}

// appelTache envoie des fichiers (aucun, un, plusieurs) et des champs à la
// route, hors authentification, contre le faux mini-SaaS.
func appelTache(t *testing.T, d detourageDeps, fichiers []fichierTest, champs map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var corps bytes.Buffer
	mw := multipart.NewWriter(&corps)
	for _, f := range fichiers {
		entete := textproto.MIMEHeader{}
		entete.Set("Content-Disposition", `form-data; name="`+f.champ+`"; filename="x"`)
		part, _ := mw.CreatePart(entete)
		part.Write(f.octets)
	}
	for nom, valeur := range champs {
		mw.WriteField(nom, valeur)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/ai/image-to-image", &corps)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	c := echo.New().NewContext(req, rec)
	if err := traiterRetouche(c, d); err != nil {
		// Les refus « mauvaise requête » d'echo sortent en erreur, comme pour une image absente.
		rec.Code = http.StatusBadRequest
	}
	return rec
}

func images(n int) []fichierTest {
	f := make([]fichierTest, n)
	for i := range f {
		f[i] = fichierTest{champImages, pngTest}
	}
	return f
}

// Génération : un texte seul part. Aucune image, même jointe par erreur.
func TestGenerationTexteSeul(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("multipart: %v", err)
		}
		if n := len(r.MultipartForm.File); n != 0 {
			t.Errorf("%d champ(s) de fichier relayés : une génération n'envoie aucune image", n)
		}
		if r.FormValue("tache") != "generation" || r.FormValue("prompt") != "une guitare" || r.FormValue("qualite") != "rapide" || r.FormValue("format") != "16x9" {
			t.Errorf("champs relayés: %v", r.MultipartForm.Value)
		}
		if _, ok := r.MultipartForm.Value["nombre"]; ok {
			t.Errorf("« nombre » n'a pas de sens pour une génération")
		}
		if _, ok := r.MultipartForm.Value["model"]; ok {
			t.Errorf("un modèle a été relayé")
		}
		if r.Header.Get("X-API-Key") != "cle-test" || r.Header.Get("User-Agent") != relaisGeneration.userAgent {
			t.Errorf("en-têtes: %q %q", r.Header.Get("X-API-Key"), r.Header.Get("User-Agent"))
		}
		w.Header().Set("X-Billed-Cost", "0.05")
		w.Header().Set("X-Detourage-Ms", "4200")
		w.Write(pngTest)
	})
	champs := map[string]string{"tache": "generation", "prompt": " une guitare ", "qualite": "rapide", "format": "16x9", "model": "bfl:5@1"}
	for _, fichiers := range [][]fichierTest{nil, {{"image", pngTest}}, images(2)} {
		rec := appelTache(t, d, fichiers, champs)
		if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), pngTest) {
			t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Billed-Cost") != "0.05" || rec.Header().Get("X-Detourage-Ms") != "4200" {
			t.Fatalf("en-têtes non relayés: %v", rec.Header())
		}
	}
	if appels != 3 {
		t.Fatalf("%d appels, attendu 3 (un par envoi, jamais de second essai)", appels)
	}
}

// Composition : toutes les images partent sous « images[] », avec leur nombre.
func TestCompositionPlusieursImages(t *testing.T) {
	var appels int32
	d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("multipart: %v", err)
		}
		recus := r.MultipartForm.File[champImages]
		if len(recus) != 3 || len(r.MultipartForm.File) != 1 {
			t.Errorf("fichiers relayés: %v", r.MultipartForm.File)
		}
		for _, f := range recus {
			if f.Header.Get("Content-Type") != "image/png" {
				t.Errorf("type relayé %q : il se lit sur les octets", f.Header.Get("Content-Type"))
			}
		}
		if r.FormValue("tache") != "composition" || r.FormValue("nombre") != "3" || r.FormValue("prompt") != "x" {
			t.Errorf("champs relayés: %v", r.MultipartForm.Value)
		}
		if r.Header.Get("User-Agent") != relaisComposition.userAgent {
			t.Errorf("User-Agent %q", r.Header.Get("User-Agent"))
		}
		w.Write(pngTest)
	})
	// « nombre » envoyé par le renderer n'est pas cru : il est compté ici.
	rec := appelTache(t, d, images(3), map[string]string{"tache": "composition", "prompt": "x", "qualite": "soignee", "nombre": "1"})
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), pngTest) || appels != 1 {
		t.Fatalf("code %d, %d appel(s), corps %q", rec.Code, appels, rec.Body.String())
	}
}

func TestTachesRefusAvantEnvoi(t *testing.T) {
	gif := []byte("GIF89a-pas-une-image-acceptee")
	cas := []struct {
		nom      string
		fichiers []fichierTest
		champs   map[string]string
		statut   int
		code     string
	}{
		{"tâche inconnue", images(1), map[string]string{"tache": "video", "prompt": "x", "qualite": "rapide"}, 400, "format_inconnu"},
		{"« retouche » explicite n'est pas une tâche", []fichierTest{{"image", pngTest}}, map[string]string{"tache": "retouche", "prompt": "x", "qualite": "rapide"}, 400, "format_inconnu"},
		{"cinq images", images(5), map[string]string{"tache": "composition", "prompt": "x", "qualite": "rapide"}, 400, "trop_d_images"},
		{"composition sans image", nil, map[string]string{"tache": "composition", "prompt": "x", "qualite": "rapide"}, 400, ""},
		{"composition avec le champ de la retouche", []fichierTest{{"image", pngTest}}, map[string]string{"tache": "composition", "prompt": "x", "qualite": "rapide"}, 400, ""},
		{"une image refusée parmi trois", []fichierTest{{champImages, pngTest}, {champImages, gif}, {champImages, pngTest}}, map[string]string{"tache": "composition", "prompt": "x", "qualite": "rapide"}, 415, "type_refuse"},
		{"génération sans consigne", nil, map[string]string{"tache": "generation", "qualite": "rapide", "format": "1x1"}, 400, "prompt_absent"},
		{"génération, consigne trop longue", nil, map[string]string{"tache": "generation", "prompt": strings.Repeat("é", retoucheConsigneMax+1), "qualite": "rapide"}, 400, "prompt_trop_long"},
		{"composition sans qualité", images(2), map[string]string{"tache": "composition", "prompt": "x"}, 400, "qualite_inconnue"},
		{"génération, format mal formé", nil, map[string]string{"tache": "generation", "prompt": "x", "qualite": "rapide", "format": "16:9"}, 400, "format_inconnu"},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			var appels int32
			d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) { w.Write(pngTest) })
			rec := appelTache(t, d, c.fichiers, c.champs)
			if rec.Code != c.statut {
				t.Fatalf("code %d, attendu %d, corps %q", rec.Code, c.statut, rec.Body.String())
			}
			if c.code != "" && codeDe(t, rec) != c.code {
				t.Fatalf("corps %q, attendu le code %q", rec.Body.String(), c.code)
			}
			if atomic.LoadInt32(&appels) != 0 {
				t.Fatalf("le mini-SaaS a été appelé")
			}
		})
	}
}

// Le poids TOTAL des images d'une composition est borné comme celui d'une seule.
func TestCompositionPoidsTotal(t *testing.T) {
	lourde := append(append([]byte{}, pngTest...), make([]byte, detourageImageMaxBytes/2)...)
	_, echec := relaisComposition.relayerImages(nil, http.DefaultClient, "https://exemple.test/x", "cle", champImages, [][]byte{lourde, lourde, lourde}, nil)
	if echec == nil || echec.Code != "image_trop_lourde" {
		t.Fatalf("trois images de 10 Mio : %v", echec)
	}
}

// Les codes du mini-SaaS reviennent avec les mots de la tâche, jamais ceux de la retouche.
func TestTachesCodesDEchec(t *testing.T) {
	for tache, relais := range map[string]relaisImage{"generation": relaisGeneration, "composition": relaisComposition} {
		for _, code := range []string{"credit_epuise", "trop_d_images", "contenu_refuse", "fournisseur_en_echec", "delai_depasse", "format_inconnu"} {
			t.Run(tache+"/"+code, func(t *testing.T) {
				var appels int32
				d := fauxMiniSaaS(t, &appels, func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(relais.erreurs[code].Status)
					json.NewEncoder(w).Encode(map[string]string{"error": "consigne-secrete", "code": code})
				})
				fichiers := images(2)
				if tache == "generation" {
					fichiers = nil
				}
				rec := appelTache(t, d, fichiers, map[string]string{"tache": tache, "prompt": "consigne-secrete", "qualite": "rapide", "format": "1x1"})
				if codeDe(t, rec) != code || rec.Code != relais.erreurs[code].Status {
					t.Fatalf("code %d, corps %q", rec.Code, rec.Body.String())
				}
				if strings.Contains(rec.Body.String(), "consigne-secrete") {
					t.Fatalf("la consigne revient dans l'erreur: %q", rec.Body.String())
				}
				if strings.Contains(rec.Body.String(), "retouche") {
					t.Fatalf("message de la retouche pour une %s: %q", tache, rec.Body.String())
				}
				if appels != 1 {
					t.Fatalf("%d appels : pas de second essai", appels)
				}
			})
		}
		// Chaque code de la retouche a sa version dans la tâche.
		for code := range erreursRetouche {
			if _, ok := relais.erreurs[code]; !ok {
				t.Errorf("code %q absent des erreurs de %s", code, tache)
			}
		}
	}
	if strings.Contains(relaisGeneration.erreurs["contenu_refuse"].Message, "image") {
		t.Errorf("une génération n'a pas d'image à changer: %q", relaisGeneration.erreurs["contenu_refuse"].Message)
	}
}
