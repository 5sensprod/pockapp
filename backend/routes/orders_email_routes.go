// backend/routes/orders_email_routes.go
package routes

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/mail"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

type SendOrderEmailRequest struct {
	OrderID        string `json:"orderId"`
	RecipientEmail string `json:"recipientEmail"`
	RecipientName  string `json:"recipientName"`
	Subject        string `json:"subject"`
	Message        string `json:"message"`
	PdfBase64      string `json:"pdfBase64"`
	PdfFilename    string `json:"pdfFilename"`
}

func RegisterOrderEmailRoutes(pb *pocketbase.PocketBase, e *echo.Echo) {
	e.POST("/api/orders/send-email", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifie", nil)
		}

		var req SendOrderEmailRequest
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Donnees invalides", err)
		}

		if req.OrderID == "" {
			return apis.NewBadRequestError("orderId requis", nil)
		}
		if req.RecipientEmail == "" {
			return apis.NewBadRequestError("recipientEmail requis", nil)
		}
		if _, err := mail.ParseAddress(req.RecipientEmail); err != nil {
			return apis.NewBadRequestError("Email invalide", err)
		}

		order, err := pb.Dao().FindRecordById("orders", req.OrderID)
		if err != nil {
			return apis.NewNotFoundError("Bon de commande introuvable", err)
		}

		subject := req.Subject
		if subject == "" {
			subject = "Bon de commande " + order.GetString("number")
		}

		messageHTML := strings.ReplaceAll(req.Message, "\n", "<br>")
		htmlBody := `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
	<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
		<p>` + messageHTML + `</p>
		<hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
		<p style="color: #999; font-size: 12px;">
			Ce message a ete envoye automatiquement depuis notre systeme de gestion.
		</p>
	</div>
</body>
</html>`

		msg := &mailer.Message{
			From: mail.Address{
				Address: pb.Settings().Meta.SenderAddress,
				Name:    pb.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: req.RecipientEmail, Name: req.RecipientName}},
			Subject: subject,
			HTML:    htmlBody,
		}

		if req.PdfBase64 != "" {
			pdfData, err := base64.StdEncoding.DecodeString(req.PdfBase64)
			if err != nil {
				return apis.NewBadRequestError("PDF invalide (erreur de decodage base64)", err)
			}

			filename := req.PdfFilename
			if filename == "" {
				filename = "BonDeCommande_" + order.GetString("number") + ".pdf"
			}

			msg.Attachments = map[string]io.Reader{
				filename: bytes.NewReader(pdfData),
			}
		}

		if err := pb.NewMailClient().Send(msg); err != nil {
			return apis.NewBadRequestError("Erreur lors de l'envoi de l'email: "+err.Error(), err)
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Email envoye avec succes",
		})
	}, apis.ActivityLogger(pb))
}
