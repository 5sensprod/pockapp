// backend/pos/receipt_preview.go
package pos

import (
	"fmt"
	"html"
	"strings"
)

func receiptLineWidth(width int) int {
	if width == 80 {
		return 48
	}
	return 32
}

func centerText(s string, width int) string {
	s = strings.TrimSpace(s)
	l := len([]rune(s))
	if l == 0 || l >= width {
		return s
	}
	pad := (width - l) / 2
	return strings.Repeat(" ", pad) + s
}

func BuildReceiptPreviewText(r ReceiptData) string {
	lineWidth := receiptLineWidth(r.Width)
	var b strings.Builder

	// =========== EN-TÊTE (AlignCenter sur imprimante) ===========
	b.WriteString(centerText(r.CompanyName, lineWidth))
	b.WriteString("\n")

	if strings.TrimSpace(r.CompanyLine1) != "" {
		b.WriteString(centerText(r.CompanyLine1, lineWidth))
		b.WriteString("\n")
	}
	if strings.TrimSpace(r.CompanyLine2) != "" {
		b.WriteString(centerText(r.CompanyLine2, lineWidth))
		b.WriteString("\n")
	}
	if strings.TrimSpace(r.CompanyLine3) != "" {
		b.WriteString(centerText(r.CompanyLine3, lineWidth))
		b.WriteString("\n")
	}
	if strings.TrimSpace(r.CompanyPhone) != "" {
		b.WriteString(centerText("Tel: "+strings.TrimSpace(r.CompanyPhone), lineWidth))
		b.WriteString("\n")
	}
	if strings.TrimSpace(r.CompanyEmail) != "" {
		b.WriteString(centerText(strings.TrimSpace(r.CompanyEmail), lineWidth))
		b.WriteString("\n")
	}
	if strings.TrimSpace(r.CompanySiret) != "" || strings.TrimSpace(r.CompanyVat) != "" {
		var parts []string
		if strings.TrimSpace(r.CompanySiret) != "" {
			parts = append(parts, "SIRET "+strings.TrimSpace(r.CompanySiret))
		}
		if strings.TrimSpace(r.CompanyVat) != "" {
			parts = append(parts, "TVA "+strings.TrimSpace(r.CompanyVat))
		}
		b.WriteString(centerText(strings.Join(parts, " - "), lineWidth))
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n")

	// le ticket physique repasse AlignLeft ici : on ne centre pas
	b.WriteString(fmt.Sprintf("TICKET: %s", r.InvoiceNumber))
	b.WriteString("\n")
	b.WriteString(r.DateLabel)
	b.WriteString("\n")
	if strings.TrimSpace(r.SellerName) != "" {
		b.WriteString(fmt.Sprintf("Vendeur: %s", r.SellerName))
		b.WriteString("\n")
	}
	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n\n")

	// =========== ARTICLES (AlignLeft) ===========
	for _, it := range r.Items {
		name := it.Name
		if len([]rune(name)) > lineWidth-2 {
			name = string([]rune(name)[:lineWidth-2])
		}
		b.WriteString(name)
		b.WriteString("\n")

		if it.HasDiscount && it.BaseUnitTtc != nil {
			discAmt := *it.BaseUnitTtc - it.UnitTtc
			if discAmt < 0 {
				discAmt = 0
			}

			isPercent := false
			if it.DiscountText != nil {
				for _, rr := range *it.DiscountText {
					if rr == '%' {
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

			line1 := fmt.Sprintf("  %dx %.2fEUR (TVA %.2g%%) %s",
				it.Qty, *it.BaseUnitTtc, it.TvaRate, discountLabel,
			)
			b.WriteString(line1)
			b.WriteString("\n")

			netPrice := fmt.Sprintf("= %.2fEUR", it.UnitTtc)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line2 := labelValue("  "+netPrice, total, lineWidth)
			b.WriteString(line2)
			b.WriteString("\n")
		} else {
			qtyPrice := fmt.Sprintf("  %dx %.2fEUR (TVA %.2g%%)", it.Qty, it.UnitTtc, it.TvaRate)
			total := fmt.Sprintf("%.2fEUR", it.TotalTtc)
			line := labelValue(qtyPrice, total, lineWidth)
			b.WriteString(line)
			b.WriteString("\n")
		}

		b.WriteString("\n")
	}

	// =========== TOTAUX ===========
	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n")

	if r.GrandSubtotal != nil && *r.GrandSubtotal > r.SubtotalTtc {
		line := labelValue("Sous-total", fmt.Sprintf("%.2fEUR", *r.GrandSubtotal), lineWidth)
		b.WriteString(line)
		b.WriteString("\n")
	}

	if r.LineDiscountsTotal != nil && *r.LineDiscountsTotal > 0 {
		line := labelValue("Remises articles", fmt.Sprintf("-%.2fEUR", *r.LineDiscountsTotal), lineWidth)
		b.WriteString(line)
		b.WriteString("\n")
	}

	if r.DiscountAmount != nil && *r.DiscountAmount > 0 {
		label := "Remise commerciale"
		if r.DiscountPercent != nil && *r.DiscountPercent > 0 {
			label = fmt.Sprintf("Remise commerciale (%.0f%%)", *r.DiscountPercent)
		}
		line := labelValue(label, fmt.Sprintf("-%.2fEUR", *r.DiscountAmount), lineWidth)
		b.WriteString(line)
		b.WriteString("\n")
	}

	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n")

	if len(r.VatBreakdown) > 0 {
		for _, vb := range r.VatBreakdown {
			label := fmt.Sprintf("TVA %.2g%% sur %.2fEUR HT", vb.Rate, vb.BaseHt)
			value := fmt.Sprintf("%.2fEUR", vb.Vat)
			line := labelValue(label, value, lineWidth)
			b.WriteString(line)
			b.WriteString("\n")
		}
	} else {
		line := labelValue("TVA", fmt.Sprintf("%.2fEUR", r.TaxAmount), lineWidth)
		b.WriteString(line)
		b.WriteString("\n")
	}

	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n")

	total := labelValue("TOTAL TTC", fmt.Sprintf("%.2fEUR", r.TotalTtc), lineWidth)
	b.WriteString(total)
	b.WriteString("\n")

	if r.TotalSavings != nil && *r.TotalSavings > 0 {
		b.WriteString("\n")
		savingsLine := labelValue("VOUS ECONOMISEZ", fmt.Sprintf("%.2fEUR", *r.TotalSavings), lineWidth)
		b.WriteString(savingsLine)
		b.WriteString("\n")
	}

	b.WriteString(strings.Repeat("-", lineWidth))
	b.WriteString("\n")

	// =========== PAIEMENT ===========
	b.WriteString("\n")
	paymentLine := labelValue("Paiement", r.PaymentMethod, lineWidth)
	b.WriteString(paymentLine)
	b.WriteString("\n")

	if r.Received != nil {
		receivedLine := labelValue("Recu", fmt.Sprintf("%.2fEUR", *r.Received), lineWidth)
		b.WriteString(receivedLine)
		b.WriteString("\n")
	}
	if r.Change != nil && *r.Change > 0 {
		changeLine := labelValue("Rendu", fmt.Sprintf("%.2fEUR", *r.Change), lineWidth)
		b.WriteString(changeLine)
		b.WriteString("\n")
	}

	// =========== FOOTER (AlignCenter) ===========
	b.WriteString("\n\n")
	b.WriteString(centerText("MERCI DE VOTRE VISITE !", lineWidth))
	b.WriteString("\n\n\n")

	return b.String()
}

func BuildReceiptPreviewHTML(r ReceiptData) string {
	txt := BuildReceiptPreviewText(r)
	return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Receipt Preview</title>
<style>
  body { margin: 16px; }
  .paper {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 14px;
    line-height: 1.25;
    white-space: pre;
  }
</style>
</head><body><div class="paper">` + html.EscapeString(txt) + `</div></body></html>`
}
