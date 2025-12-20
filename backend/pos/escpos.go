package pos

import (
	"bytes"
	"fmt"
	"strings"

	"golang.org/x/text/encoding/charmap"
)

func OpenDrawerCmd() []byte {
	return []byte{0x1B, 0x70, 0x00, 0x3C, 0x78}
}

func CutCmd() []byte {
	return []byte{0x1D, 0x56, 0x01}
}

func InitCmd() []byte {
	return []byte{0x1B, 0x40}
}

func AlignCenter() []byte { return []byte{0x1B, 0x61, 0x01} }
func AlignLeft() []byte   { return []byte{0x1B, 0x61, 0x00} }
func AlignRight() []byte  { return []byte{0x1B, 0x61, 0x02} } // ✅ AJOUTER

func BoldOn() []byte  { return []byte{0x1B, 0x45, 0x01} }
func BoldOff() []byte { return []byte{0x1B, 0x45, 0x00} }

// ✅ AJOUTER pour texte plus petit
func SmallTextOn() []byte  { return []byte{0x1B, 0x21, 0x01} }
func SmallTextOff() []byte { return []byte{0x1B, 0x21, 0x00} }

func Text(s string) []byte {
	enc := charmap.CodePage850.NewEncoder()
	out, err := enc.String(s)
	if err != nil {
		return []byte(s)
	}
	return []byte(out)
}

func NL() []byte { return []byte("\n") }

// ✅ MODIFIER ReceiptItem
type ReceiptItem struct {
	Name     string  `json:"name"`
	Qty      int     `json:"qty"`
	UnitTtc  float64 `json:"unitTtc"`
	TotalTtc float64 `json:"totalTtc"`
	// ✅ AJOUTER pour remises
	HasDiscount  bool     `json:"hasDiscount"`
	BaseUnitTtc  *float64 `json:"baseUnitTtc"`
	DiscountText *string  `json:"discountText"`
}

// ✅ MODIFIER ReceiptData
type ReceiptData struct {
	CompanyName  string `json:"companyName"`
	CompanyLine1 string `json:"companyLine1"`
	CompanyLine2 string `json:"companyLine2"`
	CompanyLine3 string `json:"companyLine3"`
	CompanyPhone string `json:"companyPhone"`
	CompanyEmail string `json:"companyEmail"`
	CompanySiret string `json:"companySiret"`
	CompanyVat   string `json:"companyVat"`

	InvoiceNumber string        `json:"invoiceNumber"`
	DateLabel     string        `json:"dateLabel"`
	SellerName    string        `json:"sellerName"`
	Items         []ReceiptItem `json:"items"`

	// ✅ AJOUTER totaux détaillés
	GrandSubtotal      *float64 `json:"grandSubtotal"`
	LineDiscountsTotal *float64 `json:"lineDiscountsTotal"`
	SubtotalTtc        float64  `json:"subtotalTtc"`
	DiscountAmount     *float64 `json:"discountAmount"`
	DiscountPercent    *float64 `json:"discountPercent"`
	TotalTtc           float64  `json:"totalTtc"`
	TaxAmount          float64  `json:"taxAmount"`
	TotalSavings       *float64 `json:"totalSavings"`

	PaymentMethod string   `json:"paymentMethod"`
	Received      *float64 `json:"received"`
	Change        *float64 `json:"change"`
	Width         int      `json:"width"`
}

// Helper pour aligner droite avec padding
func rightAlign(text string, width int) string {
	if len(text) >= width {
		return text
	}
	return strings.Repeat(" ", width-len(text)) + text
}

// Helper pour ligne avec label à gauche et valeur à droite
func labelValue(label string, value string, width int) string {
	available := width - len(label) - len(value)
	if available < 1 {
		return label + value
	}
	return label + strings.Repeat(" ", available) + value
}

func BuildReceipt(r ReceiptData) []byte {
	var lineWidth int
	if r.Width == 80 {
		lineWidth = 48
	} else {
		lineWidth = 32
	}

	var b bytes.Buffer
	b.Write(InitCmd())
	b.Write([]byte{0x1B, 0x74, 0x02}) // Charset

	// =========== EN-TÊTE ===========
	b.Write(AlignCenter())
	b.Write(BoldOn())
	b.Write(Text(strings.TrimSpace(r.CompanyName)))
	b.Write(BoldOff())
	b.Write(NL())

	if strings.TrimSpace(r.CompanyLine1) != "" {
		b.Write(Text(strings.TrimSpace(r.CompanyLine1)))
		b.Write(NL())
	}
	if strings.TrimSpace(r.CompanyLine2) != "" {
		b.Write(Text(strings.TrimSpace(r.CompanyLine2)))
		b.Write(NL())
	}
	if strings.TrimSpace(r.CompanyLine3) != "" {
		b.Write(Text(strings.TrimSpace(r.CompanyLine3)))
		b.Write(NL())
	}
	if strings.TrimSpace(r.CompanyPhone) != "" {
		b.Write(Text("Tel: " + strings.TrimSpace(r.CompanyPhone)))
		b.Write(NL())
	}
	if strings.TrimSpace(r.CompanyEmail) != "" {
		b.Write(Text(strings.TrimSpace(r.CompanyEmail)))
		b.Write(NL())
	}
	if strings.TrimSpace(r.CompanySiret) != "" || strings.TrimSpace(r.CompanyVat) != "" {
		var parts []string
		if strings.TrimSpace(r.CompanySiret) != "" {
			parts = append(parts, "SIRET "+strings.TrimSpace(r.CompanySiret))
		}
		if strings.TrimSpace(r.CompanyVat) != "" {
			parts = append(parts, "TVA "+strings.TrimSpace(r.CompanyVat))
		}
		b.Write(Text(strings.Join(parts, " - ")))
		b.Write(NL())
	}

	b.Write(NL())
	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())
	b.Write(Text(fmt.Sprintf("TICKET: %s", r.InvoiceNumber)))
	b.Write(NL())
	b.Write(Text(r.DateLabel))
	b.Write(NL())
	if strings.TrimSpace(r.SellerName) != "" {
		b.Write(Text(fmt.Sprintf("Vendeur: %s", r.SellerName)))
		b.Write(NL())
	}
	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())
	b.Write(NL())

	// =========== ARTICLES ===========
	b.Write(AlignLeft())

	for _, it := range r.Items {
		// Nom du produit (gras)
		name := it.Name
		if len([]rune(name)) > lineWidth-2 {
			name = string([]rune(name)[:lineWidth-2])
		}
		b.Write(BoldOn())
		b.Write(Text(name))
		b.Write(BoldOff())
		b.Write(NL())

		// ✅ Détails avec ou sans remise
		if it.HasDiscount && it.BaseUnitTtc != nil {
			// On ne fait PAS confiance à DiscountText (peut contenir des caractères bizarres en remise "montant")
			// On reconstruit l'affichage de la remise à partir des valeurs numériques sûres.
			discAmt := *it.BaseUnitTtc - it.UnitTtc
			if discAmt < 0 {
				discAmt = 0
			}

			// Si tu as un vrai flag/mode pour distinguer % vs montant, branche-le ici.
			// Sinon, on essaie d'utiliser DiscountText uniquement pour détecter le "%" (mais on n'imprime pas le texte).
			isPercent := false
			if it.DiscountText != nil {
				// simple détection
				for _, r := range *it.DiscountText {
					if r == '%' {
						isPercent = true
						break
					}
				}
			}

			discountLabel := ""
			if isPercent {
				pct := 0.0
				if *it.BaseUnitTtc > 0 {
					pct = (discAmt / *it.BaseUnitTtc) * 100
				}
				discountLabel = fmt.Sprintf("-%g%%", pct)
			} else {
				discountLabel = fmt.Sprintf("-%.2f EUR", discAmt)
			}

			// Ligne 1 : Qté x Prix avant remise + Remise
			line1 := fmt.Sprintf("  %dx %.2fEUR %s",
				it.Qty,
				*it.BaseUnitTtc,
				discountLabel,
			)
			b.Write(SmallTextOn())
			b.Write(Text(line1))
			b.Write(SmallTextOff())
			b.Write(NL())

			// Ligne 2 : Prix net + Total aligné droite
			netPrice := fmt.Sprintf("= %.2fEUR", it.UnitTtc)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line2 := labelValue("  "+netPrice, total, lineWidth)
			b.Write(Text(line2))
			b.Write(NL())
		} else {
			// SANS REMISE - Format classique
			qtyPrice := fmt.Sprintf("  %dx %.2fEUR", it.Qty, it.UnitTtc)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line := labelValue(qtyPrice, total, lineWidth)
			b.Write(Text(line))
			b.Write(NL())
		}

		b.Write(NL()) // Espace entre articles
	}
	// =========== TOTAUX ===========
	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	// ✅ Sous-total avant remises (si remises existent)
	if r.GrandSubtotal != nil && *r.GrandSubtotal > r.SubtotalTtc {
		line := labelValue("Sous-total", fmt.Sprintf("%.2fEUR", *r.GrandSubtotal), lineWidth)
		b.Write(SmallTextOn())
		b.Write(Text(line))
		b.Write(SmallTextOff())
		b.Write(NL())
	}

	// ✅ Remises articles
	if r.LineDiscountsTotal != nil && *r.LineDiscountsTotal > 0 {
		line := labelValue("Remises articles", fmt.Sprintf("-%.2fEUR", *r.LineDiscountsTotal), lineWidth)
		b.Write(Text(line))
		b.Write(NL())
	}

	// ✅ Remise commerciale/globale
	if r.DiscountAmount != nil && *r.DiscountAmount > 0 {
		label := "Remise commerciale"
		if r.DiscountPercent != nil && *r.DiscountPercent > 0 {
			label = fmt.Sprintf("Remise commerciale (%.0f%%)", *r.DiscountPercent)
		}
		line := labelValue(label, fmt.Sprintf("-%.2fEUR", *r.DiscountAmount), lineWidth)
		b.Write(Text(line))
		b.Write(NL())
	}

	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	// TVA
	line := labelValue("TVA (20%)", fmt.Sprintf("%.2fEUR", r.TaxAmount), lineWidth)
	b.Write(Text(line))
	b.Write(NL())

	// TOTAL TTC (GRAS + GRAND)
	b.Write(BoldOn())
	total := labelValue("TOTAL TTC", fmt.Sprintf("%.2fEUR", r.TotalTtc), lineWidth)
	b.Write(Text(total))
	b.Write(BoldOff())
	b.Write(NL())

	// ✅ Économie totale
	if r.TotalSavings != nil && *r.TotalSavings > 0 {
		b.Write(NL())
		savingsLine := labelValue("VOUS ECONOMISEZ", fmt.Sprintf("%.2fEUR", *r.TotalSavings), lineWidth)
		b.Write(BoldOn())
		b.Write(Text(savingsLine))
		b.Write(BoldOff())
		b.Write(NL())
	}

	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	// =========== PAIEMENT ===========
	b.Write(NL())
	paymentLine := labelValue("Paiement", r.PaymentMethod, lineWidth)
	b.Write(Text(paymentLine))
	b.Write(NL())

	if r.Received != nil {
		receivedLine := labelValue("Recu", fmt.Sprintf("%.2fEUR", *r.Received), lineWidth)
		b.Write(Text(receivedLine))
		b.Write(NL())
	}
	if r.Change != nil && *r.Change > 0 {
		changeLine := labelValue("Monnaie", fmt.Sprintf("%.2fEUR", *r.Change), lineWidth)
		b.Write(Text(changeLine))
		b.Write(NL())
	}

	// =========== FOOTER ===========
	b.Write(NL())
	b.Write(NL())
	b.Write(AlignCenter())
	b.Write(Text("MERCI DE VOTRE VISITE !"))
	b.Write(NL())
	b.Write(NL())
	b.Write(NL())

	b.Write(CutCmd())
	return b.Bytes()
}
