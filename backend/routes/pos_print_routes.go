// backend/routes/pos_print_routes.go
package routes

import (
	"net/http"
	"pocket-react/backend/pos"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
)

// RegisterPosPrintRoutes enregistre les routes pour l'impression POS et le tiroir caisse
// Ces routes permettent l'impression depuis n'importe quel appareil du réseau
func RegisterPosPrintRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	// Groupe /api/pos
	posGroup := router.Group("/api/pos")

	// Liste des imprimantes Windows disponibles
	posGroup.GET("/printers", func(c echo.Context) error {
		printers, err := pos.ListPrinters()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"printers": printers,
		})
	})

	// Liste des ports série disponibles (pour afficheur VFD)
	posGroup.GET("/serial-ports", func(c echo.Context) error {
		ports, err := pos.ListSerialPorts()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"ports": ports,
		})
	})

	// Impression d'un ticket de caisse
	posGroup.POST("/print", func(c echo.Context) error {
		var input struct {
			PrinterName string          `json:"printerName"`
			Width       int             `json:"width"`
			CompanyId   string          `json:"companyId"`
			Receipt     pos.ReceiptData `json:"receipt"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		// Validation
		if input.PrinterName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "printerName is required",
			})
		}

		if input.Width != 58 && input.Width != 80 {
			input.Width = 58 // Valeur par défaut
		}

		receipt := input.Receipt
		receipt.Width = input.Width

		// Enrichissement des données company depuis PocketBase (optionnel)
		if input.CompanyId != "" {
			rec, err := pb.Dao().FindRecordById("companies", input.CompanyId)
			if err == nil && rec != nil {
				// Enrichir receipt avec les données de l'entreprise
				if receipt.CompanyName == "" {
					tradeName := rec.GetString("trade_name")
					legalName := rec.GetString("name")
					if tradeName != "" {
						receipt.CompanyName = tradeName
					} else {
						receipt.CompanyName = legalName
					}
				}

				if receipt.CompanyLine1 == "" {
					receipt.CompanyLine1 = rec.GetString("address_line1")
				}
				if receipt.CompanyLine2 == "" {
					receipt.CompanyLine2 = rec.GetString("address_line2")
				}
				if receipt.CompanyLine3 == "" {
					zip := rec.GetString("zip_code")
					city := rec.GetString("city")
					if zip != "" || city != "" {
						receipt.CompanyLine3 = zip + " " + city
					}
				}
				if receipt.CompanyPhone == "" {
					receipt.CompanyPhone = rec.GetString("phone")
				}
				if receipt.CompanyEmail == "" {
					receipt.CompanyEmail = rec.GetString("email")
				}
				if receipt.CompanySiret == "" {
					receipt.CompanySiret = rec.GetString("siret")
				}
				if receipt.CompanyVat == "" {
					receipt.CompanyVat = rec.GetString("vat_number")
				}
			}
		}

		// Construction et impression
		raw := pos.BuildReceipt(receipt)
		if err := pos.RawPrint(input.PrinterName, raw); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Ticket imprimé avec succès",
		})
	})

	type receiptInput struct {
		Width     int             `json:"width"`
		CompanyId string          `json:"companyId"`
		Receipt   pos.ReceiptData `json:"receipt"`
	}

	enrichCompany := func(receipt *pos.ReceiptData, companyId string) {
		if companyId == "" {
			return
		}
		rec, err := pb.Dao().FindRecordById("companies", companyId)
		if err != nil || rec == nil {
			return
		}

		if receipt.CompanyName == "" {
			tradeName := rec.GetString("trade_name")
			legalName := rec.GetString("name")
			if strings.TrimSpace(tradeName) != "" {
				receipt.CompanyName = tradeName
			} else {
				receipt.CompanyName = legalName
			}
		}

		if receipt.CompanyLine1 == "" {
			receipt.CompanyLine1 = rec.GetString("address_line1")
		}
		if receipt.CompanyLine2 == "" {
			receipt.CompanyLine2 = rec.GetString("address_line2")
		}
		if receipt.CompanyLine3 == "" {
			zip := rec.GetString("zip_code")
			city := rec.GetString("city")
			if zip != "" || city != "" {
				receipt.CompanyLine3 = strings.TrimSpace(zip + " " + city)
			}
		}
		if receipt.CompanyPhone == "" {
			receipt.CompanyPhone = rec.GetString("phone")
		}
		if receipt.CompanyEmail == "" {
			receipt.CompanyEmail = rec.GetString("email")
		}
		if receipt.CompanySiret == "" {
			receipt.CompanySiret = rec.GetString("siret")
		}
		if receipt.CompanyVat == "" {
			receipt.CompanyVat = rec.GetString("vat_number")
		}
	}

	// Preview texte
	posGroup.POST("/preview/text", func(c echo.Context) error {
		var input receiptInput
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		}

		if input.Width != 58 && input.Width != 80 {
			input.Width = 58
		}

		receipt := input.Receipt
		receipt.Width = input.Width
		enrichCompany(&receipt, input.CompanyId)

		out := pos.BuildReceiptPreviewText(receipt)
		return c.Blob(http.StatusOK, "text/plain; charset=utf-8", []byte(out))
	})

	// Preview HTML (affichage direct + impression navigateur en PDF)
	posGroup.POST("/preview/html", func(c echo.Context) error {
		var input receiptInput
		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		}

		if input.Width != 58 && input.Width != 80 {
			input.Width = 58
		}

		receipt := input.Receipt
		receipt.Width = input.Width
		enrichCompany(&receipt, input.CompanyId)

		out := pos.BuildReceiptPreviewHTML(receipt)
		return c.HTML(http.StatusOK, out)
	})

	// Ouverture du tiroir caisse
	posGroup.POST("/drawer/open", func(c echo.Context) error {
		var input struct {
			PrinterName string `json:"printerName"`
			Width       int    `json:"width"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		// Validation
		if input.PrinterName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "printerName is required",
			})
		}

		// Commande ESC/POS pour ouvrir le tiroir
		cmd := pos.OpenDrawerCmd()
		if err := pos.RawPrint(input.PrinterName, cmd); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Tiroir caisse ouvert",
		})
	})

	// Test d'impression (ticket de démonstration)
	posGroup.POST("/test-print", func(c echo.Context) error {
		var input struct {
			PrinterName string `json:"printerName"`
			Width       int    `json:"width"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.PrinterName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "printerName is required",
			})
		}

		if input.Width != 58 && input.Width != 80 {
			input.Width = 58
		}

		// Ticket de test
		testReceipt := pos.ReceiptData{
			CompanyName:   "TEST BOUTIQUE",
			InvoiceNumber: "TEST-001",
			DateLabel:     "Test impression",
			Items: []pos.ReceiptItem{
				{
					Name:     "Article Test",
					Qty:      1,
					UnitTtc:  10.0,
					TotalTtc: 10.0,
					TvaRate:  20.0,
				},
			},
			SubtotalTtc:   10.0,
			TotalTtc:      10.0,
			TaxAmount:     1.67,
			PaymentMethod: "Test",
			Width:         input.Width,
		}

		raw := pos.BuildReceipt(testReceipt)
		if err := pos.RawPrint(input.PrinterName, raw); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Ticket de test envoyé",
		})
	})

	// Envoi de texte sur afficheur VFD
	posGroup.POST("/display/send", func(c echo.Context) error {
		var input struct {
			PortName   string `json:"portName"`
			BaudRate   string `json:"baudRate"`
			Protocol   string `json:"protocol"`
			Line1      string `json:"line1"`
			Line2      string `json:"line2"`
			ClearFirst bool   `json:"clearFirst"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.PortName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "portName is required",
			})
		}

		baudRate := 9600
		if input.BaudRate == "19200" {
			baudRate = 19200
		}

		msg := pos.VFDMessage{
			Line1:      input.Line1,
			Line2:      input.Line2,
			ClearFirst: input.ClearFirst,
		}

		protocol := pos.VFDProtocol(input.Protocol)
		data := pos.BuildVFDCommand(msg, protocol, 100)

		if err := pos.SendToSerialPort(input.PortName, baudRate, data); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Texte envoyé à l'afficheur",
		})
	})

	// Test afficheur VFD
	posGroup.POST("/display/test", func(c echo.Context) error {
		var input struct {
			PortName string `json:"portName"`
			BaudRate string `json:"baudRate"`
			Protocol string `json:"protocol"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.PortName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "portName is required",
			})
		}

		baudRate := 9600
		if input.BaudRate == "19200" {
			baudRate = 19200
		}

		protocol := pos.VFDProtocol(input.Protocol)
		data := pos.BuildTestMessage(100, protocol)

		if err := pos.SendToSerialPort(input.PortName, baudRate, data); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Message de test envoyé",
		})
	})
}
