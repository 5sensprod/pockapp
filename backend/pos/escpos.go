package pos

import (
	"bytes"
	"fmt"
	"strings"
)

func OpenDrawerCmd() []byte {
	// ESC p m t1 t2
	// m=0, t1=60, t2=120 (valeurs courantes)
	return []byte{0x1B, 0x70, 0x00, 0x3C, 0x78}
}

func CutCmd() []byte {
	// GS V 1 (partial cut)
	return []byte{0x1D, 0x56, 0x01}
}

func InitCmd() []byte {
	return []byte{0x1B, 0x40}
}

func AlignCenter() []byte { return []byte{0x1B, 0x61, 0x01} }
func AlignLeft() []byte   { return []byte{0x1B, 0x61, 0x00} }

func BoldOn() []byte  { return []byte{0x1B, 0x45, 0x01} }
func BoldOff() []byte { return []byte{0x1B, 0x45, 0x00} }

func Text(s string) []byte {
	// ESC/POS est souvent CP437/CP850; ici on envoie UTF-8 tel quel.
	// Si ton imprimante n'aime pas l'UTF-8, on ajustera l'encodage ensuite.
	return []byte(s)
}

func NL() []byte { return []byte("\n") }

type ReceiptItem struct {
	Name     string  `json:"name"`
	Qty      int     `json:"qty"`
	UnitTtc  float64 `json:"unitTtc"`
	TotalTtc float64 `json:"totalTtc"`
}

type ReceiptData struct {
	CompanyName    string        `json:"companyName"`
	InvoiceNumber  string        `json:"invoiceNumber"`
	DateLabel      string        `json:"dateLabel"`
	Items          []ReceiptItem `json:"items"`
	SubtotalTtc    float64       `json:"subtotalTtc"`
	DiscountAmount float64       `json:"discountAmount"`
	TotalTtc       float64       `json:"totalTtc"`
	TaxAmount      float64       `json:"taxAmount"`
	PaymentMethod  string        `json:"paymentMethod"`
	Received       *float64      `json:"received"`
	Change         *float64      `json:"change"`
	Width          int           `json:"width"`
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
	b.Write(AlignCenter())
	b.Write(BoldOn())
	b.Write(Text(strings.TrimSpace(r.CompanyName)))
	b.Write(BoldOff())
	b.Write(NL())
	b.Write(Text(fmt.Sprintf("Ticket %s", r.InvoiceNumber)))
	b.Write(NL())
	b.Write(Text(r.DateLabel))
	b.Write(NL())
	b.Write(NL())

	b.Write(AlignLeft())
	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())

	for _, it := range r.Items {
		name := it.Name
		if len([]rune(name)) > lineWidth-10 {
			name = string([]rune(name)[:lineWidth-10])
		}
		b.Write(Text(fmt.Sprintf("%dx %s", it.Qty, name)))
		b.Write(NL())
		b.Write(Text(fmt.Sprintf("  %.2f EUR  ->  %.2f EUR", it.UnitTtc, it.TotalTtc)))
		b.Write(NL())
	}

	b.Write(Text(strings.Repeat("-", lineWidth)))
	b.Write(NL())
	b.Write(Text(fmt.Sprintf("Sous-total: %.2f EUR", r.SubtotalTtc)))
	b.Write(NL())
	if r.DiscountAmount > 0 {
		b.Write(Text(fmt.Sprintf("Remise: -%.2f EUR", r.DiscountAmount)))
		b.Write(NL())
	}
	b.Write(Text(fmt.Sprintf("TVA: %.2f EUR", r.TaxAmount)))
	b.Write(NL())
	b.Write(BoldOn())
	b.Write(Text(fmt.Sprintf("TOTAL: %.2f EUR", r.TotalTtc)))
	b.Write(BoldOff())
	b.Write(NL())
	b.Write(NL())

	b.Write(Text(fmt.Sprintf("Paiement: %s", r.PaymentMethod)))
	b.Write(NL())
	if r.Received != nil {
		b.Write(Text(fmt.Sprintf("Recu: %.2f EUR", *r.Received)))
		b.Write(NL())
	}
	if r.Change != nil {
		b.Write(Text(fmt.Sprintf("Monnaie: %.2f EUR", *r.Change)))
		b.Write(NL())
	}

	b.Write(NL())
	b.Write(AlignCenter())
	b.Write(Text("Merci !"))
	b.Write(NL())
	b.Write(NL())
	b.Write(NL())

	b.Write(CutCmd())
	return b.Bytes()
}
