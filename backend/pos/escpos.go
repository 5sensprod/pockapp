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
func AlignRight() []byte  { return []byte{0x1B, 0x61, 0x02} }

func BoldOn() []byte  { return []byte{0x1B, 0x45, 0x01} }
func BoldOff() []byte { return []byte{0x1B, 0x45, 0x00} }

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

type ReceiptItem struct {
	Name         string   `json:"name"`
	Qty          int      `json:"qty"`
	UnitTtc      float64  `json:"unitTtc"`
	TotalTtc     float64  `json:"totalTtc"`
	TvaRate      float64  `json:"tvaRate"`
	HasDiscount  bool     `json:"hasDiscount"`
	BaseUnitTtc  *float64 `json:"baseUnitTtc"`
	DiscountText *string  `json:"discountText"`
}

type VatBreakdown struct {
	Rate     float64 `json:"rate"`
	BaseHt   float64 `json:"baseHt"`
	Vat      float64 `json:"vat"`
	TotalTtc float64 `json:"totalTtc"`
}

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

	GrandSubtotal      *float64 `json:"grandSubtotal"`
	LineDiscountsTotal *float64 `json:"lineDiscountsTotal"`
	SubtotalTtc        float64  `json:"subtotalTtc"`
	DiscountAmount     *float64 `json:"discountAmount"`
	DiscountPercent    *float64 `json:"discountPercent"`
	TotalTtc           float64  `json:"totalTtc"`
	TaxAmount          float64  `json:"taxAmount"`
	TotalSavings       *float64 `json:"totalSavings"`

	VatBreakdown []VatBreakdown `json:"vatBreakdown"`

	PaymentMethod string   `json:"paymentMethod"`
	Received      *float64 `json:"received"`
	Change        *float64 `json:"change"`
	Width         int      `json:"width"`
}

func rightAlign(text string, width int) string {
	if len(text) >= width {
		return text
	}
	return strings.Repeat(" ", width-len(text)) + text
}

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
	b.Write([]byte{0x1B, 0x74, 0x02})

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
		// Nom du produit (sans TVA)
		name := it.Name
		if len([]rune(name)) > lineWidth-2 {
			name = string([]rune(name)[:lineWidth-2])
		}
		b.Write(BoldOn())
		b.Write(Text(name))
		b.Write(BoldOff())
		b.Write(NL())

		if it.HasDiscount && it.BaseUnitTtc != nil {
			discAmt := *it.BaseUnitTtc - it.UnitTtc
			if discAmt < 0 {
				discAmt = 0
			}

			isPercent := false
			if it.DiscountText != nil {
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

			// ✅ Ligne avec TVA
			line1 := fmt.Sprintf("  %dx %.2fEUR (TVA %.2g%%) %s",
				it.Qty,
				*it.BaseUnitTtc,
				it.TvaRate,
				discountLabel,
			)
			b.Write(SmallTextOn())
			b.Write(Text(line1))
			b.Write(SmallTextOff())
			b.Write(NL())

			netPrice := fmt.Sprintf("= %.2fEUR", it.UnitTtc)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line2 := labelValue("  "+netPrice, total, lineWidth)
			b.Write(Text(line2))
			b.Write(NL())
		} else {
			// ✅ Format: "2x 10.00EUR (TVA 5.5%)     20.00EUR"
			qtyPrice := fmt.Sprintf("  %dx %.2fEUR (TVA %.2g%%)", it.Qty, it.UnitTtc, it.TvaRate)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line := labelValue(qtyPrice, total, lineWidth)
			b.Write(Text(line))
			b.Write(NL())
		}

		b.Write(NL())
	}

	// =========== TOTAUX ===========
	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	if r.GrandSubtotal != nil && *r.GrandSubtotal > r.SubtotalTtc {
		line := labelValue("Sous-total", fmt.Sprintf("%.2fEUR", *r.GrandSubtotal), lineWidth)
		b.Write(SmallTextOn())
		b.Write(Text(line))
		b.Write(SmallTextOff())
		b.Write(NL())
	}

	if r.LineDiscountsTotal != nil && *r.LineDiscountsTotal > 0 {
		line := labelValue("Remises articles", fmt.Sprintf("-%.2fEUR", *r.LineDiscountsTotal), lineWidth)
		b.Write(Text(line))
		b.Write(NL())
	}

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

	// ✅ TVA DÉTAILLÉE (une ligne par taux)
	if len(r.VatBreakdown) > 0 {
		for _, vb := range r.VatBreakdown {
			label := fmt.Sprintf("TVA %.2g%% sur %.2fEUR HT", vb.Rate, vb.BaseHt)
			value := fmt.Sprintf("%.2fEUR", vb.Vat)
			line := labelValue(label, value, lineWidth)
			b.Write(Text(line))
			b.Write(NL())
		}
	} else {
		// Fallback
		line := labelValue("TVA", fmt.Sprintf("%.2fEUR", r.TaxAmount), lineWidth)
		b.Write(Text(line))
		b.Write(NL())
	}

	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	// TOTAL TTC
	b.Write(BoldOn())
	total := labelValue("TOTAL TTC", fmt.Sprintf("%.2fEUR", r.TotalTtc), lineWidth)
	b.Write(Text(total))
	b.Write(BoldOff())
	b.Write(NL())

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
		changeLine := labelValue("Rendu", fmt.Sprintf("%.2fEUR", *r.Change), lineWidth)
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
