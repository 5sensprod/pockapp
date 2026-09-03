// backend/pos/gdiprint_other.go
//go:build !windows

package pos

import "errors"

type PageSizeMM struct {
	WidthMM  float64 `json:"widthMm"`
	HeightMM float64 `json:"heightMm"`
	DpiX     int     `json:"dpiX"`
	DpiY     int     `json:"dpiY"`
}

func PrinterPageMM(printerName string, lengthMM float64) (PageSizeMM, error) {
	return PageSizeMM{}, errors.New("PrinterPageMM n'est disponible que sous Windows")
}

func PrintImageGDI(printerName string, imgBytes []byte, copies int, lengthMM float64) error {
	return errors.New("PrintImageGDI n'est disponible que sous Windows")
}
