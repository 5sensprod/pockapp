// backend/pos/vfd.go
package pos

import (
	"bytes"
	"strings"

	"golang.org/x/text/encoding/charmap"
)

// VFD Protocol types
type VFDProtocol string

const (
	ProtocolLD220         VFDProtocol = "LD220"
	ProtocolEPSON_D101    VFDProtocol = "EPSON_D101"
	ProtocolAEDEX         VFDProtocol = "AEDEX"
	ProtocolUTC_S         VFDProtocol = "UTC_S"
	ProtocolUTC_P         VFDProtocol = "UTC_P"
	ProtocolADM788        VFDProtocol = "ADM788"
	ProtocolDSP800        VFDProtocol = "DSP800"
	ProtocolCD5220        VFDProtocol = "CD5220"
	ProtocolEMAX          VFDProtocol = "EMAX"
	ProtocolLOGIC_CONTROL VFDProtocol = "LOGIC_CONTROL"
)

// VFD Commands - EPSON POS D101 protocol (most common)
func VFD_Clear() []byte {
	// Clear display
	return []byte{0x0C}
}

func VFD_Home() []byte {
	// Cursor to home position
	return []byte{0x0B}
}

func VFD_Text(s string) []byte {
	// Encode UTF-8 → CP850 (compatible accents FR)
	enc := charmap.CodePage850.NewEncoder()
	out, err := enc.String(s)
	if err != nil {
		// fallback sécurisé
		return []byte(s)
	}
	return []byte(out)
}

// VFDMessage represents a message to display
type VFDMessage struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	ClearFirst bool   `json:"clearFirst"`
}

// BuildVFDCommand builds the command sequence for the VFD
// VERSION SIMPLIFIÉE - Juste du texte + saut de ligne
// VERSION MÉMOIRE LINÉAIRE - 40 caractères d'un coup
func BuildVFDCommand(msg VFDMessage, protocol VFDProtocol, brightness int) []byte {
	var b bytes.Buffer

	// Clear si demandé
	if msg.ClearFirst {
		b.Write(VFD_Clear())
	}

	// Home position
	b.Write(VFD_Home())

	// Construire les 40 caractères (20 ligne 1 + 20 ligne 2)
	line1 := padOrTruncate(msg.Line1, 20)
	line2 := padOrTruncate(msg.Line2, 20)

	// Envoyer les 40 caractères d'un coup (pas de CR/LF)
	fullText := line1 + line2
	b.Write(VFD_Text(fullText))

	return b.Bytes()
}

// BuildTestMessage creates a test message
func BuildTestMessage(brightness int, protocol VFDProtocol) []byte {
	msg := VFDMessage{
		Line1:      "TEST AFFICHEUR",
		Line2:      "20 colonnes x 2",
		ClearFirst: true,
	}
	return BuildVFDCommand(msg, protocol, brightness)
}

// padOrTruncate pads or truncates a string to exact length
func padOrTruncate(s string, length int) string {
	runes := []rune(s)
	if len(runes) > length {
		return string(runes[:length])
	}
	return s + strings.Repeat(" ", length-len(runes))
}
