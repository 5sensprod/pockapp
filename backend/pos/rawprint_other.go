// backend/pos/rawprint_other.go
//go:build !windows

package pos

import "errors"

func RawPrint(printerName string, data []byte) error {
	return errors.New("RawPrint not implemented on this OS")
}
