// backend/pos/rawprint_windows.go
//go:build windows

package pos

import (
	"syscall"
	"unsafe"
)

var (
	procOpenPrinterW     = winspool.NewProc("OpenPrinterW")
	procClosePrinter     = winspool.NewProc("ClosePrinter")
	procStartDocPrinterW = winspool.NewProc("StartDocPrinterW")
	procEndDocPrinter    = winspool.NewProc("EndDocPrinter")
	procStartPagePrinter = winspool.NewProc("StartPagePrinter")
	procEndPagePrinter   = winspool.NewProc("EndPagePrinter")
	procWritePrinter     = winspool.NewProc("WritePrinter")
)

type docInfo1 struct {
	pDocName    *uint16
	pOutputFile *uint16
	pDatatype   *uint16
}

func RawPrint(printerName string, data []byte) error {
	if printerName == "" {
		return syscall.EINVAL
	}
	if len(data) == 0 {
		return nil
	}

	namePtr, err := syscall.UTF16PtrFromString(printerName)
	if err != nil {
		return err
	}

	var hPrinter syscall.Handle
	r1, _, e1 := procOpenPrinterW.Call(
		uintptr(unsafe.Pointer(namePtr)),
		uintptr(unsafe.Pointer(&hPrinter)),
		0,
	)
	if r1 == 0 {
		if e1 != nil && e1 != syscall.Errno(0) {
			return e1
		}
		return syscall.EINVAL
	}
	defer procClosePrinter.Call(uintptr(hPrinter))

	docName, _ := syscall.UTF16PtrFromString("POS Receipt")
	dataType, _ := syscall.UTF16PtrFromString("RAW")

	di := docInfo1{
		pDocName:  docName,
		pDatatype: dataType,
	}

	r2, _, e2 := procStartDocPrinterW.Call(
		uintptr(hPrinter),
		1,
		uintptr(unsafe.Pointer(&di)),
	)
	if r2 == 0 {
		if e2 != nil && e2 != syscall.Errno(0) {
			return e2
		}
		return syscall.EINVAL
	}
	defer procEndDocPrinter.Call(uintptr(hPrinter))

	r3, _, e3 := procStartPagePrinter.Call(uintptr(hPrinter))
	if r3 == 0 {
		if e3 != nil && e3 != syscall.Errno(0) {
			return e3
		}
		return syscall.EINVAL
	}
	defer procEndPagePrinter.Call(uintptr(hPrinter))

	var written uint32
	r4, _, e4 := procWritePrinter.Call(
		uintptr(hPrinter),
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(uint32(len(data))),
		uintptr(unsafe.Pointer(&written)),
	)
	if r4 == 0 {
		if e4 != nil && e4 != syscall.Errno(0) {
			return e4
		}
		return syscall.EINVAL
	}

	return nil
}
