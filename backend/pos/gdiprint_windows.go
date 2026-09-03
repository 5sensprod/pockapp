// backend/pos/gdiprint_windows.go
//
// IMPRIMER UNE IMAGE PAR LE PILOTE WINDOWS.
//
// `RawPrint` (rawprint_windows.go) envoie des octets bruts à la file : c'est
// ce qu'attend une imprimante ESC/POS. Une étiqueteuse Brother QL-600 n'est
// PAS en ESC/POS — c'est un périphérique GDI, elle n'imprime que ce que son
// pilote lui compose. D'où ce second chemin, qui passe par le pilote au lieu
// de le contourner : CreateDC sur « WINSPOOL », puis StretchDIBits.
//
// Une seule tâche de spool pour toutes les copies : StartDoc une fois,
// StartPage/EndPage par exemplaire. AppPos lançait un processus PowerShell
// PAR étiquette ; cent étiquettes faisaient cent tâches.
//
//go:build windows

package pos

import (
	"fmt"
	"image"
	"image/draw"
	"runtime"
	"syscall"
	"unsafe"
)

var (
	gdi32 = syscall.NewLazyDLL("gdi32.dll")

	procCreateDCW      = gdi32.NewProc("CreateDCW")
	procDeleteDC       = gdi32.NewProc("DeleteDC")
	procStartDocW      = gdi32.NewProc("StartDocW")
	procEndDoc         = gdi32.NewProc("EndDoc")
	procStartPage      = gdi32.NewProc("StartPage")
	procEndPage        = gdi32.NewProc("EndPage")
	procStretchDIBits  = gdi32.NewProc("StretchDIBits")
	procGetDeviceCaps  = gdi32.NewProc("GetDeviceCaps")
	procSetStretchBltM = gdi32.NewProc("SetStretchBltMode")

	procDocumentPropertiesW = winspool.NewProc("DocumentPropertiesW")
)

const (
	capHorzRes    = 8  // largeur imprimable, en pixels du périphérique
	capVertRes    = 10 // hauteur imprimable
	capLogPixelsX = 88 // points par pouce, horizontalement
	capLogPixelsY = 90 // points par pouce, verticalement

	// DEVMODE — de quoi imposer une longueur de coupe sur un rouleau continu.
	dmOrientation = 0x00000001
	dmPaperSize   = 0x00000002
	dmPaperLength = 0x00000004
	dmPaperUser   = 256
	dmOutBuffer   = 2
	dmInBuffer    = 8

	biRGB        = 0
	dibRGBColors = 0
	srcCopy      = 0x00CC0020
	halftone     = 4 // SetStretchBltMode : le seul mode qui rééchantillonne
)

// devmodeW — l'en-tête de DEVMODEW. Le pilote rend un tampon plus grand (il
// y ajoute ses propres données, `dmDriverExtra`) : on ne recopie jamais cette
// structure, on écrit dans le tampon du pilote à travers elle.
type devmodeW struct {
	dmDeviceName    [32]uint16
	dmSpecVersion   uint16
	dmDriverVersion uint16
	dmSize          uint16
	dmDriverExtra   uint16
	dmFields        uint32
	dmOrientation   int16
	dmPaperSize     int16
	dmPaperLength   int16
	dmPaperWidth    int16
	dmScale         int16
	dmCopies        int16
	dmDefaultSource int16
	dmPrintQuality  int16
}

type docInfoW struct {
	cbSize       int32
	lpszDocName  *uint16
	lpszOutput   *uint16
	lpszDatatype *uint16
	fwType       uint32
}

type bitmapInfoHeader struct {
	biSize          uint32
	biWidth         int32
	biHeight        int32
	biPlanes        uint16
	biBitCount      uint16
	biCompression   uint32
	biSizeImage     uint32
	biXPelsPerMeter int32
	biYPelsPerMeter int32
	biClrUsed       uint32
	biClrImportant  uint32
}

// createLabelDC ouvre un contexte de périphérique sur l'imprimante, en
// imposant au besoin la longueur de coupe.
//
// Un rouleau CONTINU n'a pas d'étiquettes prédécoupées : la longueur du
// « papier » est celle que le pilote découpe, et rien n'oblige à garder les
// 90 mm de son réglage par défaut. On la pose donc dans le DEVMODE, puis on
// laisse le pilote valider ce qu'on lui demande (`DM_IN_BUFFER` suivi de
// `DM_OUT_BUFFER`) : s'il refuse cette longueur, il rend la sienne, et
// l'aperçu du client le montrera au lieu d'imprimer de travers.
//
// `lengthMM` à zéro ou négatif = on garde le réglage du pilote.
func createLabelDC(printerName string, lengthMM float64) (uintptr, error) {
	driver, _ := syscall.UTF16PtrFromString("WINSPOOL")
	device, err := syscall.UTF16PtrFromString(printerName)
	if err != nil {
		return 0, err
	}

	// Le tampon DEVMODE est de la mémoire Go : il doit rester vivant PENDANT
	// l'appel à CreateDC, d'où le `KeepAlive` après — pas dans le constructeur.
	var devmode []byte
	if lengthMM > 0 {
		if buf, err := buildDevmode(printerName, device, lengthMM); err == nil {
			devmode = buf
		}
		// Une erreur ici n'est pas fatale : on imprime au format du pilote.
	}

	var devmodePtr uintptr
	if len(devmode) > 0 {
		devmodePtr = uintptr(unsafe.Pointer(&devmode[0]))
	}

	hdc, _, _ := procCreateDCW.Call(
		uintptr(unsafe.Pointer(driver)),
		uintptr(unsafe.Pointer(device)),
		0,
		devmodePtr,
	)
	runtime.KeepAlive(devmode)

	if hdc == 0 {
		return 0, fmt.Errorf("imprimante inaccessible: %s", printerName)
	}
	return hdc, nil
}

func buildDevmode(printerName string, device *uint16, lengthMM float64) ([]byte, error) {
	var hPrinter syscall.Handle
	r1, _, _ := procOpenPrinterW.Call(
		uintptr(unsafe.Pointer(device)),
		uintptr(unsafe.Pointer(&hPrinter)),
		0,
	)
	if r1 == 0 {
		return nil, fmt.Errorf("ouverture impossible: %s", printerName)
	}
	defer procClosePrinter.Call(uintptr(hPrinter))

	size, _, _ := procDocumentPropertiesW.Call(
		0, uintptr(hPrinter), uintptr(unsafe.Pointer(device)), 0, 0, 0,
	)
	if int32(size) <= 0 {
		return nil, fmt.Errorf("DEVMODE indisponible sur %s", printerName)
	}

	buf := make([]byte, int32(size))
	ptr := uintptr(unsafe.Pointer(&buf[0]))

	r, _, _ := procDocumentPropertiesW.Call(
		0, uintptr(hPrinter), uintptr(unsafe.Pointer(device)), ptr, 0, dmOutBuffer,
	)
	if int32(r) < 0 {
		return nil, fmt.Errorf("lecture DEVMODE échouée sur %s", printerName)
	}

	dm := (*devmodeW)(unsafe.Pointer(&buf[0]))
	dm.dmFields |= dmPaperSize | dmPaperLength | dmOrientation
	dm.dmPaperSize = dmPaperUser
	// dmPaperLength est en DIXIÈMES de millimètre.
	dm.dmPaperLength = int16(lengthMM * 10)
	dm.dmOrientation = 1 // portrait : le sens du contenu est décidé au dessin

	r, _, _ = procDocumentPropertiesW.Call(
		0, uintptr(hPrinter), uintptr(unsafe.Pointer(device)), ptr, ptr,
		dmInBuffer|dmOutBuffer,
	)
	if int32(r) < 0 {
		return nil, fmt.Errorf("longueur refusée par le pilote de %s", printerName)
	}

	return buf, nil
}

// PrintImageGDI imprime `imgBytes` (PNG ou JPEG) sur `printerName`, mise à
// l'échelle pour tenir dans la zone imprimable en conservant les proportions,
// et centrée. `copies` exemplaires, dans une seule tâche.
//
// La taille de l'étiquette n'est PAS un paramètre : c'est le format de papier
// choisi dans le pilote qui la donne (29 mm en continu sur la QL-600). Le
// client rend son image au bon rapport, le pilote la pose sur le média.
func PrintImageGDI(printerName string, imgBytes []byte, copies int, lengthMM float64) error {
	if printerName == "" {
		return fmt.Errorf("nom d'imprimante vide")
	}
	if len(imgBytes) == 0 {
		return fmt.Errorf("image vide")
	}
	if copies < 1 {
		copies = 1
	}

	src, err := DecodeImageBytes(imgBytes)
	if err != nil {
		return fmt.Errorf("image illisible: %w", err)
	}
	bits, width, height := toBGRA(src)

	hdc, err := createLabelDC(printerName, lengthMM)
	if err != nil {
		return err
	}
	defer procDeleteDC.Call(hdc)

	pageW, _, _ := procGetDeviceCaps.Call(hdc, capHorzRes)
	pageH, _, _ := procGetDeviceCaps.Call(hdc, capVertRes)
	if pageW == 0 || pageH == 0 {
		return fmt.Errorf("zone imprimable nulle sur %s", printerName)
	}

	// Mise à l'échelle proportionnelle, centrée — comme le faisait le script
	// PowerShell d'AppPos, mais sans redimensionner l'image en amont : c'est
	// le pilote qui rééchantillonne, à sa résolution native (300 dpi sur QL).
	scale := float64(pageW) / float64(width)
	if s := float64(pageH) / float64(height); s < scale {
		scale = s
	}
	destW := int32(float64(width) * scale)
	destH := int32(float64(height) * scale)
	destX := (int32(pageW) - destW) / 2
	destY := (int32(pageH) - destH) / 2

	bmi := bitmapInfoHeader{
		biSize:      uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		biWidth:     int32(width),
		biHeight:    -int32(height), // négatif = image dans le sens de lecture
		biPlanes:    1,
		biBitCount:  32,
		biSizeImage: uint32(len(bits)),
	}

	docName, _ := syscall.UTF16PtrFromString("Étiquette produit")
	di := docInfoW{lpszDocName: docName}
	di.cbSize = int32(unsafe.Sizeof(di))

	job, _, _ := procStartDocW.Call(hdc, uintptr(unsafe.Pointer(&di)))
	if int32(job) <= 0 {
		return fmt.Errorf("impossible de démarrer l'impression sur %s", printerName)
	}

	for i := 0; i < copies; i++ {
		if r, _, _ := procStartPage.Call(hdc); int32(r) <= 0 {
			procEndDoc.Call(hdc)
			return fmt.Errorf("échec au démarrage de la page %d", i+1)
		}

		procSetStretchBltM.Call(hdc, halftone)

		r, _, _ := procStretchDIBits.Call(
			hdc,
			uintptr(destX), uintptr(destY), uintptr(destW), uintptr(destH),
			0, 0, uintptr(width), uintptr(height),
			uintptr(unsafe.Pointer(&bits[0])),
			uintptr(unsafe.Pointer(&bmi)),
			dibRGBColors,
			srcCopy,
		)
		if int32(r) == 0 {
			procEndPage.Call(hdc)
			procEndDoc.Call(hdc)
			return fmt.Errorf("échec du rendu de la page %d", i+1)
		}

		if r, _, _ := procEndPage.Call(hdc); int32(r) <= 0 {
			procEndDoc.Call(hdc)
			return fmt.Errorf("échec à la fin de la page %d", i+1)
		}
	}

	if r, _, _ := procEndDoc.Call(hdc); int32(r) <= 0 {
		return fmt.Errorf("échec à la clôture de la tâche d'impression")
	}
	return nil
}

// toBGRA aplatit l'image sur fond BLANC et la rend au format qu'attend GDI :
// 32 bits par pixel, bleu-vert-rouge-inutilisé. Le fond compte : une étiquette
// rendue par un canvas transparent sortirait noire sans lui.
func toBGRA(src image.Image) ([]byte, int, int) {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()

	flat := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(flat, flat.Bounds(), image.NewUniform(image.White), image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), src, b.Min, draw.Over)

	out := make([]byte, w*h*4)
	for i := 0; i < w*h; i++ {
		out[i*4+0] = flat.Pix[i*4+2] // B
		out[i*4+1] = flat.Pix[i*4+1] // G
		out[i*4+2] = flat.Pix[i*4+0] // R
		out[i*4+3] = 0
	}
	return out, w, h
}

// PageSizeMM est la zone imprimable telle que le pilote la déclare — donc le
// média réellement chargé, tel qu'il est réglé dans le pilote.
type PageSizeMM struct {
	WidthMM  float64 `json:"widthMm"`
	HeightMM float64 `json:"heightMm"`
	DpiX     int     `json:"dpiX"`
	DpiY     int     `json:"dpiY"`
}

// PrinterPageMM interroge le pilote au lieu de coder l'étiquette en dur : le
// client rend son image aux proportions du média en place, et changer de
// rouleau dans le pilote change l'aperçu sans toucher au code.
func PrinterPageMM(printerName string, lengthMM float64) (PageSizeMM, error) {
	var out PageSizeMM
	if printerName == "" {
		return out, fmt.Errorf("nom d'imprimante vide")
	}

	hdc, err := createLabelDC(printerName, lengthMM)
	if err != nil {
		return out, err
	}
	defer procDeleteDC.Call(hdc)

	horz, _, _ := procGetDeviceCaps.Call(hdc, capHorzRes)
	vert, _, _ := procGetDeviceCaps.Call(hdc, capVertRes)
	dpiX, _, _ := procGetDeviceCaps.Call(hdc, capLogPixelsX)
	dpiY, _, _ := procGetDeviceCaps.Call(hdc, capLogPixelsY)

	if dpiX == 0 || dpiY == 0 {
		return out, fmt.Errorf("résolution inconnue sur %s", printerName)
	}

	out.DpiX = int(dpiX)
	out.DpiY = int(dpiY)
	out.WidthMM = float64(int32(horz)) / float64(int32(dpiX)) * 25.4
	out.HeightMM = float64(int32(vert)) / float64(int32(dpiY)) * 25.4
	return out, nil
}
