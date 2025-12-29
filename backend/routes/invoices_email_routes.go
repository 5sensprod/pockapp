// backend/routes/invoices_email_routes.go
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

type SendInvoiceEmailRequest struct {
	InvoiceID      string `json:"invoiceId"`
	RecipientEmail string `json:"recipientEmail"`
	RecipientName  string `json:"recipientName"`
	Subject        string `json:"subject"`
	Message        string `json:"message"`
	PdfBase64      string `json:"pdfBase64"`
	PdfFilename    string `json:"pdfFilename"`
}

func RegisterInvoiceEmailRoutes(pb *pocketbase.PocketBase, e *echo.Echo) {
	e.POST("/api/invoices/send-email", func(c echo.Context) error {
		// Vérifier l'authentification
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		var req SendInvoiceEmailRequest
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Données invalides", err)
		}

		// Validation
		if req.InvoiceID == "" {
			return apis.NewBadRequestError("invoiceId requis", nil)
		}
		if req.RecipientEmail == "" {
			return apis.NewBadRequestError("recipientEmail requis", nil)
		}

		// Valider l'email
		if _, err := mail.ParseAddress(req.RecipientEmail); err != nil {
			return apis.NewBadRequestError("Email invalide", err)
		}

		// Récupérer la facture
		invoice, err := pb.Dao().FindRecordById("invoices", req.InvoiceID)
		if err != nil {
			return apis.NewNotFoundError("Facture introuvable", err)
		}

		// Vérifier que la facture n'est pas un brouillon
		if invoice.GetString("status") == "draft" {
			return apis.NewBadRequestError("Impossible d'envoyer un brouillon. Veuillez d'abord valider la facture.", nil)
		}

		// Préparer le sujet
		subject := req.Subject
		if subject == "" {
			invoiceType := invoice.GetString("invoice_type")
			if invoiceType == "credit_note" {
				subject = "Avoir " + invoice.GetString("number")
			} else {
				subject = "Facture " + invoice.GetString("number")
			}
		}

		// Convertir les sauts de ligne en <br> pour le HTML
		messageHTML := strings.ReplaceAll(req.Message, "\n", "<br>")

		// Préparer le message HTML
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

		// Préparer l'email
		message := &mailer.Message{
			From: mail.Address{
				Address: pb.Settings().Meta.SenderAddress,
				Name:    pb.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: req.RecipientEmail, Name: req.RecipientName}},
			Subject: subject,
			HTML:    htmlBody,
		}

		// Ajouter le PDF en pièce jointe si fourni
		if req.PdfBase64 != "" {
			pdfData, err := base64.StdEncoding.DecodeString(req.PdfBase64)
			if err != nil {
				return apis.NewBadRequestError("PDF invalide (erreur de décodage base64)", err)
			}

			filename := req.PdfFilename
			if filename == "" {
				invoiceType := invoice.GetString("invoice_type")
				if invoiceType == "credit_note" {
					filename = "Avoir_" + invoice.GetString("number") + ".pdf"
				} else {
					filename = "Facture_" + invoice.GetString("number") + ".pdf"
				}
			}

			message.Attachments = map[string]io.Reader{
				filename: bytes.NewReader(pdfData),
			}
		}

		// Envoyer l'email
		if err := pb.NewMailClient().Send(message); err != nil {
			return apis.NewBadRequestError("Erreur lors de l'envoi de l'email: "+err.Error(), err)
		}

		// Mettre à jour le statut de la facture si elle était "validated" -> "sent"
		if invoice.GetString("status") == "validated" {
			invoice.Set("status", "sent")
			if err := pb.Dao().SaveRecord(invoice); err != nil {
				// Log mais ne pas bloquer
				pb.Logger().Error("Erreur mise à jour statut facture", "error", err)
			}
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Email envoyé avec succès",
		})
	}, apis.ActivityLogger(pb))
}
