// backend/pos/receipt_pdf.go
//
// Génère un PDF du ticket de caisse en rendant le HTML via chromedp (headless Chrome).
// Chromedp utilise le Chrome/Chromium installé sur la machine.
//
// Prérequis : Chrome ou Chromium doit être installé sur le serveur.
// Sur Windows, Chrome est généralement présent sur les machines POS.

package pos

import (
	"context"
	"fmt"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

// BuildReceiptPreviewPDF génère un PDF A4 (portrait, marges réduites) depuis
// le HTML produit par BuildReceiptPreviewHTML.
//
// Le PDF est dimensionné pour ressembler à un ticket thermique :
// marges minimales, police monospace, largeur contrainte.
func BuildReceiptPreviewPDF(r ReceiptData) ([]byte, error) {
	html := BuildReceiptPreviewHTML(r)
	return htmlToPDF(html)
}

// htmlToPDF convertit du HTML en PDF via chromedp.
func htmlToPDF(htmlContent string) ([]byte, error) {
	// Contexte avec timeout — 30s est large pour un ticket simple
	ctx, cancel := chromedp.NewContext(context.Background())
	defer cancel()

	ctx, cancelTimeout := context.WithTimeout(ctx, 30*time.Second)
	defer cancelTimeout()

	var pdfBuf []byte

	// Encode le HTML en data URL pour éviter les problèmes de chemin
	dataURL := fmt.Sprintf("data:text/html;charset=utf-8,%s", urlEncode(htmlContent))

	err := chromedp.Run(ctx,
		chromedp.Navigate(dataURL),
		// Attendre que le contenu soit rendu (fonts, images)
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.ActionFunc(func(ctx context.Context) error {
			var err error
			pdfBuf, _, err = page.PrintToPDF().
				// Format A4 portrait
				WithPaperWidth(8.27).
				WithPaperHeight(11.69).
				// Marges minimales (en inches)
				WithMarginTop(0.2).
				WithMarginBottom(0.2).
				WithMarginLeft(0.2).
				WithMarginRight(0.2).
				// Pas de header/footer Chrome natif
				WithDisplayHeaderFooter(false).
				// Fond blanc (couleurs CSS respectées)
				WithPrintBackground(true).
				// Scale légèrement pour centrer le ticket dans la page
				WithScale(0.8).
				Do(ctx)
			return err
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp PDF generation: %w", err)
	}

	return pdfBuf, nil
}

// urlEncode encode le HTML pour une data URL (encodage minimal).
// On encode uniquement les caractères strictement nécessaires pour éviter
// les problèmes de parsing d'URL dans Chrome.
func urlEncode(s string) string {
	var out []byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == ' ':
			out = append(out, '%', '2', '0')
		case c == '#':
			out = append(out, '%', '2', '3')
		case c == '%':
			out = append(out, '%', '2', '5')
		case c == '&':
			out = append(out, '%', '2', '6')
		case c == '+':
			out = append(out, '%', '2', 'B')
		default:
			out = append(out, c)
		}
	}
	return string(out)
}
