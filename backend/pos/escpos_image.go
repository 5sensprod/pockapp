// backend/pos/escpos_image.go
package pos

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"math"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type RasterMode byte

const (
	RasterNormal RasterMode = 0 // GS v 0 m=0
)

func maxLogoWidthDots(paperWidth int) int {
	// Valeurs usuelles (à ajuster selon ton modèle)
	// 58mm: 384 dots ; 80mm: 576 dots
	if paperWidth == 80 {
		return 576
	}
	return 384
}

func DecodeImageBytes(data []byte) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	return img, err
}

func ResizeToWidth(img image.Image, maxWidth int) image.Image {
	b := img.Bounds()
	w := b.Dx()
	h := b.Dy()
	if w <= 0 || h <= 0 || maxWidth <= 0 || w <= maxWidth {
		return img
	}
	scale := float64(maxWidth) / float64(w)
	newW := maxWidth
	newH := int(math.Round(float64(h) * scale))
	if newH < 1 {
		newH = 1
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)
	return dst
}

func toGray(img image.Image) *image.Gray {
	b := img.Bounds()
	g := image.NewGray(image.Rect(0, 0, b.Dx(), b.Dy()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			r, gg, bb, a := img.At(b.Min.X+x, b.Min.Y+y).RGBA()

			// Traiter les pixels transparents ou semi-transparents comme blancs
			// Seuil à 50% de transparence (32768 sur 65535)
			if a < 32768 {
				g.SetGray(x, y, color.Gray{Y: 255})
				continue
			}

			// Pour les pixels opaques ou quasi-opaques, appliquer l'alpha blending sur fond blanc
			alphaF := float64(a) / 65535.0
			rF := float64(r>>8) * alphaF
			gF := float64(gg>>8) * alphaF
			bF := float64(bb>>8) * alphaF

			// Fond blanc (255) avec alpha blending
			rFinal := rF + 255.0*(1.0-alphaF)
			gFinal := gF + 255.0*(1.0-alphaF)
			bFinal := bF + 255.0*(1.0-alphaF)

			// Luma approx
			y8 := uint8((299.0*rFinal + 587.0*gFinal + 114.0*bFinal) / 1000.0)
			g.SetGray(x, y, color.Gray{Y: y8})
		}
	}
	return g
}

// Floyd–Steinberg (1-bit), retourne un tableau bool (true=noir)
func ditherFloydSteinberg(g *image.Gray, threshold uint8) ([]bool, int, int) {
	w := g.Bounds().Dx()
	h := g.Bounds().Dy()
	out := make([]bool, w*h)

	// erreur en float
	errBuf := make([]float64, w*h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			i := y*w + x
			v := float64(g.GrayAt(x, y).Y) + errBuf[i]
			var newV float64
			if v < float64(threshold) {
				out[i] = true // noir
				newV = 0
			} else {
				out[i] = false // blanc
				newV = 255
			}
			e := v - newV

			// diffusion
			if x+1 < w {
				errBuf[i+1] += e * 7.0 / 16.0
			}
			if x-1 >= 0 && y+1 < h {
				errBuf[i+w-1] += e * 3.0 / 16.0
			}
			if y+1 < h {
				errBuf[i+w] += e * 5.0 / 16.0
			}
			if x+1 < w && y+1 < h {
				errBuf[i+w+1] += e * 1.0 / 16.0
			}
		}
	}
	return out, w, h
}

// Pack en raster bytes (MSB first) pour GS v 0
func packRaster(bits []bool, w, h int) []byte {
	rowBytes := (w + 7) / 8
	data := make([]byte, rowBytes*h)

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if !bits[y*w+x] {
				continue
			}
			byteIndex := y*rowBytes + (x / 8)
			bit := uint(7 - (x % 8))
			data[byteIndex] |= 1 << bit
		}
	}
	return data
}

// Trim whitespace (white/transparent) around the bitmap.
// bits: true = black, false = white
func trimBits(bits []bool, w, h int) ([]bool, int, int) {
	if w <= 0 || h <= 0 {
		return bits, w, h
	}

	top := 0
	for top < h {
		allWhite := true
		rowOff := top * w
		for x := 0; x < w; x++ {
			if bits[rowOff+x] {
				allWhite = false
				break
			}
		}
		if !allWhite {
			break
		}
		top++
	}

	bottom := h - 1
	for bottom >= top {
		allWhite := true
		rowOff := bottom * w
		for x := 0; x < w; x++ {
			if bits[rowOff+x] {
				allWhite = false
				break
			}
		}
		if !allWhite {
			break
		}
		bottom--
	}

	left := 0
	for left < w {
		allWhite := true
		for y := top; y <= bottom; y++ {
			if bits[y*w+left] {
				allWhite = false
				break
			}
		}
		if !allWhite {
			break
		}
		left++
	}

	right := w - 1
	for right >= left {
		allWhite := true
		for y := top; y <= bottom; y++ {
			if bits[y*w+right] {
				allWhite = false
				break
			}
		}
		if !allWhite {
			break
		}
		right--
	}

	newW := right - left + 1
	newH := bottom - top + 1
	if newW <= 0 || newH <= 0 {
		// nothing black => keep original to avoid empty image command
		return bits, w, h
	}

	out := make([]bool, newW*newH)
	for y := 0; y < newH; y++ {
		srcY := top + y
		copy(out[y*newW:(y+1)*newW], bits[srcY*w+left:srcY*w+left+newW])
	}
	return out, newW, newH
}

func RasterImageCmdFromBytes(imgBytes []byte, paperWidth int, threshold uint8, dither bool) ([]byte, error) {
	if len(imgBytes) == 0 {
		return nil, errors.New("empty image")
	}
	img, err := DecodeImageBytes(imgBytes)
	if err != nil {
		return nil, err
	}

	maxW := maxLogoWidthDots(paperWidth)
	img = ResizeToWidth(img, maxW)

	g := toGray(img)
	var bits []bool
	w := g.Bounds().Dx()
	h := g.Bounds().Dy()

	if dither {
		bits, w, h = ditherFloydSteinberg(g, threshold)
	} else {
		bits = make([]bool, w*h)
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				bits[y*w+x] = g.GrayAt(x, y).Y < threshold
			}
		}
	}

	// 🔴 TRIM ICI : suppression des lignes/colonnes 100% blanches
	bits, w, h = trimBits(bits, w, h)

	// Sécurité : si tout est blanc, on évite une commande image vide
	if w == 0 || h == 0 {
		return nil, errors.New("image contains no printable pixels")
	}

	raster := packRaster(bits, w, h)
	rowBytes := (w + 7) / 8

	xL := byte(rowBytes & 0xFF)
	xH := byte((rowBytes >> 8) & 0xFF)
	yL := byte(h & 0xFF)
	yH := byte((h >> 8) & 0xFF)

	// GS v 0 m xL xH yL yH [data]
	cmd := make([]byte, 0, 8+len(raster))
	cmd = append(cmd, 0x1D, 0x76, 0x30, byte(RasterNormal), xL, xH, yL, yH)
	cmd = append(cmd, raster...)
	return cmd, nil
}

func DecodeBase64Image(b64 string) ([]byte, error) {
	// accepte data:image/...;base64,XXX ou base64 brut
	if i := bytes.IndexByte([]byte(b64), ','); i > 0 && bytes.Contains([]byte(b64[:i]), []byte("base64")) {
		b64 = b64[i+1:]
	}
	return base64.StdEncoding.DecodeString(b64)
}
