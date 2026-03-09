// backend/routes/consignment_email_routes.go
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

type SendConsignmentEmailRequest struct {
	RecipientEmail string `json:"recipientEmail"`
	RecipientName  string `json:"recipientName"`
	Subject        string `json:"subject"`
	Message        string `json:"message"`
	PdfBase64      string `json:"pdfBase64"`
	PdfFilename    string `json:"pdfFilename"`
}

func RegisterConsignmentEmailRoutes(pb *pocketbase.PocketBase, e *echo.Echo) {
	e.POST("/api/consignment/send-email", func(c echo.Context) error {
		// Vérifier l'authentification
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		var req SendConsignmentEmailRequest
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Données invalides", err)
		}

		// Validation
		if req.RecipientEmail == "" {
			return apis.NewBadRequestError("recipientEmail requis", nil)
		}
		if _, err := mail.ParseAddress(req.RecipientEmail); err != nil {
			return apis.NewBadRequestError("Email invalide", err)
		}

		subject := req.Subject
		if subject == "" {
			subject = "Bordereau de dépôt-vente"
		}

		// Convertir les sauts de ligne en <br> pour le HTML
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
			Ce message a été envoyé automatiquement depuis notre système de gestion.
		</p>
	</div>
</body>
</html>`

		message := &mailer.Message{
			From: mail.Address{
				Address: pb.Settings().Meta.SenderAddress,
				Name:    pb.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: req.RecipientEmail, Name: req.RecipientName}},
			Subject: subject,
			HTML:    htmlBody,
		}

		// Pièce jointe PDF
		if req.PdfBase64 != "" {
			pdfData, err := base64.StdEncoding.DecodeString(req.PdfBase64)
			if err != nil {
				return apis.NewBadRequestError("PDF invalide (erreur de décodage base64)", err)
			}

			filename := req.PdfFilename
			if filename == "" {
				filename = "Depot-vente.pdf"
			}

			message.Attachments = map[string]io.Reader{
				filename: bytes.NewReader(pdfData),
			}
		}

		if err := pb.NewMailClient().Send(message); err != nil {
			return apis.NewBadRequestError("Erreur lors de l'envoi de l'email: "+err.Error(), err)
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Email envoyé avec succès",
		})
	}, apis.ActivityLogger(pb))
}
