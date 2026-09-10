package load

import "testing"

func TestEstUneImageReconnaitLesFormatsDuCatalogue(t *testing.T) {
	cas := []struct {
		nom    string
		octets []byte
		attend string
	}{
		{"webp", append([]byte("RIFF____WEBP"), 0), "webp"},
		{"jpeg", []byte{0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0}, "jpeg"},
		{"png", []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0}, "png"},
		{"gif", []byte("GIF89a___"), "gif"},
		{"avif", []byte{0, 0, 0, 0x1C, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f'}, "avif/heif"},
	}
	for _, c := range cas {
		got, ok := EstUneImage(c.octets)
		if !ok || got != c.attend {
			t.Fatalf("%s : attendu %q, obtenu %q (ok=%v)", c.nom, c.attend, got, ok)
		}
	}
}

func TestEstUneImageRefuseCeQuiNEnEstPasUne(t *testing.T) {
	// Le cas qui compte : un mutualisé qui rend une page d'erreur en HTTP 200.
	// Enregistrée comme visuel de produit, elle ne se verrait qu'à l'écran,
	// des semaines plus tard.
	cas := [][]byte{
		[]byte("<!DOCTYPE html><html><body>The page is temporarily unavailable"),
		[]byte(`{"error":"not found"}`),
		[]byte("RIFF____WAVE"), // un RIFF qui n'est pas du WebP
		{},
		[]byte("ab"),
	}
	for i, b := range cas {
		if typ, ok := EstUneImage(b); ok {
			t.Fatalf("cas %d : accepté à tort comme %q", i, typ)
		}
	}
}
