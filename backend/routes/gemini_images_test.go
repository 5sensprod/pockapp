package routes

import (
	"encoding/base64"
	"strings"
	"testing"
)

// pngMinimal : les huit octets de signature suivis d'un chunk quelconque.
// Ils suffisent : `formatImageReel` ne décode rien, il lit l'en-tête.
func pngMinimal() []byte {
	return append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, []byte("IHDR")...)
}

func jpegMinimal() []byte {
	return append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, []byte("JFIF")...)
}

func TestFicheAccepteUneCaptureEtLuiDonneSonContrat(t *testing.T) {
	payload, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name: "P-145",
		Files: []productSheetFile{{
			Name:     "capture.png",
			MIMEType: "image/png",
			Data:     base64.StdEncoding.EncodeToString(pngMinimal()),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	parts := payload.Contents[0].Parts
	if len(parts) != 2 || parts[1].InlineData == nil || parts[1].InlineData.MIMEType != "image/png" {
		t.Fatalf("la capture n'est pas partie en inline_data: %#v", parts)
	}
	// Sans cette consigne, le modèle décrit la PAGE — suggestions, prix,
	// bandeaux — au lieu du seul produit du bloc principal.
	if !strings.Contains(parts[0].Text, "IMAGES") {
		t.Fatalf("le contrat de lecture visuelle est absent du prompt: %s", parts[0].Text)
	}
}

func TestPlusieursImagesPartentEnsemble(t *testing.T) {
	fichier := productSheetFile{
		Name:     "packaging.jpg",
		MIMEType: "image/jpeg",
		Data:     base64.StdEncoding.EncodeToString(jpegMinimal()),
	}
	payload, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name:  "P-145",
		Files: []productSheetFile{fichier, fichier, fichier},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(payload.Contents[0].Parts) != 4 {
		t.Fatalf("parts = %d, attendu 1 prompt + 3 images", len(payload.Contents[0].Parts))
	}
}

// Le type MIME vient du navigateur, souvent de la seule extension : renommer un
// PDF en .png suffisait à le faire annoncer comme une image. Gemini refusait
// alors la requête entière, et le refus revenait à l'écran en « Gemini n'a pas
// produit de fiche exploitable » — qui n'explique rien.
func TestUnMIMEMenteurEstRefuseIci(t *testing.T) {
	_, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name: "P-145",
		Files: []productSheetFile{{
			Name:     "faux.png",
			MIMEType: "image/png",
			Data:     base64.StdEncoding.EncodeToString(jpegMinimal()),
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "n'est pas du image/png") {
		t.Fatalf("MIME mensonger accepté: %v", err)
	}
}

func TestBase64InvalideEstRefuse(t *testing.T) {
	_, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name: "P-145",
		Files: []productSheetFile{{
			Name:     "capture.png",
			MIMEType: "image/png",
			Data:     "pas du base64 !!!",
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "invalide") {
		t.Fatalf("base64 invalide accepté: %v", err)
	}
}

func TestImageTropLourdeEstRefusee(t *testing.T) {
	gros := append(pngMinimal(), make([]byte, productSheetMaxFileBytes)...)
	_, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name: "P-145",
		Files: []productSheetFile{{
			Name:     "capture.png",
			MIMEType: "image/png",
			Data:     base64.StdEncoding.EncodeToString(gros),
		}},
	})
	if err == nil || !strings.Contains(err.Error(), "Mio") {
		t.Fatalf("image hors plafond acceptée: %v", err)
	}
}

// Le HEIC d'un iPhone n'est décodable par aucun navigateur : il ne peut pas
// être redimensionné avant l'envoi, mais Gemini le lit nativement.
func TestHEICPasseTelQuel(t *testing.T) {
	payload, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name: "P-145",
		Files: []productSheetFile{{
			Name:     "photo.heic",
			MIMEType: "image/heic",
			Data:     base64.StdEncoding.EncodeToString([]byte("ftypheic....")),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if payload.Contents[0].Parts[1].InlineData.MIMEType != "image/heic" {
		t.Fatal("le HEIC n'a pas gardé son type")
	}
}

// Le titre est ce qui manque le plus souvent : le modèle exact est SUR
// l'emballage, et la route ne savait pas le lire.
func TestTitreLitAussiLesImages(t *testing.T) {
	payload, err := buildGeminiTitleRequest(ProductTitleRequest{
		Name: "clavier",
		Files: []productSheetFile{{
			Name:     "packaging.jpg",
			MIMEType: "image/jpeg",
			Data:     base64.StdEncoding.EncodeToString(jpegMinimal()),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	parts := payload.Contents[0].Parts
	if len(parts) != 2 || parts[1].InlineData == nil {
		t.Fatalf("l'image n'est pas partie avec le titre: %#v", parts)
	}
	if !strings.Contains(parts[0].Text, "image du produit est jointe") {
		t.Fatalf("consigne d'image absente: %s", parts[0].Text)
	}
}

// Le modèle rend le format demandé et dit son doute à part : c'est
// l'utilisateur qui tranche. Le champ ne doit donc jamais manquer du schéma —
// sans lui, le doute se perd dans la prose de l'introduction.
func TestLeDouteSurLeFormatEstUnChampDeSortie(t *testing.T) {
	for _, format := range []string{"short", "detailed"} {
		payload, err := buildGeminiProductSheetRequest(ProductSheetRequest{
			Name:              "Vis de fixation micro guitare",
			DescriptionFormat: format,
		})
		if err != nil {
			t.Fatal(err)
		}
		props := payload.GenerationConfig.ResponseSchema.Properties
		if _, ok := props["format_note"]; !ok {
			t.Fatalf("format_note absent du schéma %s", format)
		}
		if _, ok := props["suggested_format"]; !ok {
			t.Fatalf("suggested_format absent du schéma %s", format)
		}
	}
}

// Une visserie n'a ni point fort ni conseil d'entretien : le prompt doit le
// dire, sinon le modèle remplit les sections parce qu'elles existent.
func TestLaFicheDetailleeNExigePlusToutesLesSections(t *testing.T) {
	payload, err := buildGeminiProductSheetRequest(ProductSheetRequest{
		Name:              "Vis de fixation micro guitare",
		DescriptionFormat: "detailed",
	})
	if err != nil {
		t.Fatal(err)
	}
	prompt := payload.Contents[0].Parts[0].Text
	if !strings.Contains(prompt, "SEULEMENT les sections que le produit justifie") {
		t.Fatalf("le prompt exige encore toutes les sections: %s", prompt)
	}
	if !strings.Contains(productSheetSystemInstruction, "laisse ces sections VIDES") {
		t.Fatal("la règle de proportion est absente de l'instruction système")
	}
}

// Un format inventé par le modèle ne doit pas ressortir jusqu'à l'écran : le
// bouton proposé s'appuie dessus.
func TestUnFormatSuggereInconnuEstIgnore(t *testing.T) {
	brut := []byte(`{"candidates":[{"content":{"parts":[{"text":"{\"intro\":\"Une vis.\",\"format_note\":\"trop court\",\"suggested_format\":\"moyen\"}"}]},"finishReason":"STOP"}]}`)
	generation, err := extractGeminiProductSheet(brut)
	if err != nil {
		t.Fatal(err)
	}
	if generation.SuggestedFormat != "" {
		t.Fatalf("format suggéré inconnu retenu: %q", generation.SuggestedFormat)
	}
	if generation.FormatNote != "trop court" {
		t.Fatalf("note perdue: %q", generation.FormatNote)
	}
}
