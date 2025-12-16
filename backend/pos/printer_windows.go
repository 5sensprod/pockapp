// backend/pos/printers_windows.go
//go:build windows

package pos

import (
	"fmt"
	"sort"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	procEnumPrintersW = winspool.NewProc("EnumPrintersW")
)

const (
	PRINTER_ENUM_LOCAL       = 0x00000002
	PRINTER_ENUM_CONNECTIONS = 0x00000004
)

type printerInfo4W struct {
	pPrinterName *uint16
	pServerName  *uint16
	Attributes   uint32
}

func utf16PtrToString(p *uint16) string {
	if p == nil {
		return ""
	}
	// read until NUL
	var u16 []uint16
	for i := 0; ; i++ {
		v := *(*uint16)(unsafe.Pointer(uintptr(unsafe.Pointer(p)) + uintptr(i)*2))
		if v == 0 {
			break
		}
		u16 = append(u16, v)
	}
	return string(utf16.Decode(u16))
}

func ListPrinters() ([]string, error) {
	flags := uint32(PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS)
	level := uint32(4)

	var needed uint32
	var returned uint32

	// 1) query needed buffer
	r1, _, e1 := procEnumPrintersW.Call(
		uintptr(flags),
		0,
		uintptr(level),
		0,
		0,
		uintptr(unsafe.Pointer(&needed)),
		uintptr(unsafe.Pointer(&returned)),
	)
	_ = r1

	if needed == 0 {
		if e1 != nil && e1 != syscall.Errno(0) {
			return nil, fmt.Errorf("EnumPrintersW size: %w", e1)
		}
		return []string{}, nil
	}

	buf := make([]byte, needed)

	// 2) actual call
	r2, _, e2 := procEnumPrintersW.Call(
		uintptr(flags),
		0,
		uintptr(level),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(needed),
		uintptr(unsafe.Pointer(&needed)),
		uintptr(unsafe.Pointer(&returned)),
	)
	if r2 == 0 {
		if e2 != nil && e2 != syscall.Errno(0) {
			return nil, fmt.Errorf("EnumPrintersW: %w", e2)
		}
		return nil, syscall.EINVAL
	}

	infos := unsafe.Slice((*printerInfo4W)(unsafe.Pointer(&buf[0])), returned)

	seen := map[string]struct{}{}
	out := make([]string, 0, returned)

	for _, pi := range infos {
		name := utf16PtrToString(pi.pPrinterName)
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}

	sort.Strings(out)
	return out, nil
}
