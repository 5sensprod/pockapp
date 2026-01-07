// frontend/lib/pos/barcode.ts
// Validation + normalisation barcode (POS-friendly), y compris scan "sans Enter" côté orchestrateur.

export type BarcodeFormat = 'EAN8' | 'EAN13' | 'UPC_A' | 'UPC_E' | 'CODE128' // fallback "digits only" (ou alphanum si activé)

export type BarcodeValidationResult =
	| { ok: true; code: string; format: BarcodeFormat }
	| {
			ok: false
			code: string
			reason:
				| 'empty'
				| 'too_short'
				| 'too_long'
				| 'invalid_chars'
				| 'invalid_checksum'
	  }

export type BarcodeRules = {
	// Longueurs acceptées (POS classique)
	minLength?: number // défaut: 6
	maxLength?: number // défaut: 32

	// Autoriser lettres (Code128 peut)
	allowAlpha?: boolean // défaut: false

	// Vérifier checksum EAN/UPC si longueur correspondante
	verifyChecksum?: boolean // défaut: true

	// Accepter UPC-E (6/7/8 selon encodage). Ici: 8 seulement (version "zéro-supprimée" + check)
	acceptUpcE?: boolean // défaut: false
}

const DEFAULT_RULES: Required<BarcodeRules> = {
	minLength: 6,
	maxLength: 32,
	allowAlpha: false,
	verifyChecksum: true,
	acceptUpcE: false,
}

export function normalizeBarcode(input: string): string {
	return input.trim()
}

function isDigitsOnly(s: string) {
	return /^[0-9]+$/.test(s)
}

function isAlphaNum(s: string) {
	return /^[0-9A-Za-z]+$/.test(s)
}

function computeEanUpcCheckDigit(baseDigits: string): number {
	// baseDigits: sans dernier digit (EAN13 => 12 digits, EAN8 => 7, UPC-A => 11)
	// algorithme standard: somme pondérée, puis (10 - (sum % 10)) % 10
	let sum = 0
	const len = baseDigits.length

	// On parcourt de droite à gauche
	// Pour EAN/UPC: poids 3 et 1 alternés en partant de la droite (position 1 = poids 3)
	let pos = 1
	for (let i = len - 1; i >= 0; i--) {
		const d = baseDigits.charCodeAt(i) - 48
		sum += d * (pos % 2 === 1 ? 3 : 1)
		pos++
	}
	return (10 - (sum % 10)) % 10
}

function hasValidEan13(code: string) {
	if (code.length !== 13) return false
	const base = code.slice(0, 12)
	const check = code.charCodeAt(12) - 48
	return computeEanUpcCheckDigit(base) === check
}

function hasValidEan8(code: string) {
	if (code.length !== 8) return false
	const base = code.slice(0, 7)
	const check = code.charCodeAt(7) - 48
	return computeEanUpcCheckDigit(base) === check
}

function hasValidUpcA(code: string) {
	if (code.length !== 12) return false
	const base = code.slice(0, 11)
	const check = code.charCodeAt(11) - 48
	return computeEanUpcCheckDigit(base) === check
}

// UPC-E (optionnel) : selon vos besoins réels, sinon désactivé par défaut.
// Ici on ne l’implémente pas (car conversion UPC-E -> UPC-A dépend de la structure), on garde un simple flag.
function detectFormat(
	code: string,
	rules: Required<BarcodeRules>,
): BarcodeFormat {
	if (isDigitsOnly(code)) {
		if (code.length === 8) return 'EAN8'
		if (code.length === 12) return 'UPC_A'
		if (code.length === 13) return 'EAN13'
		if (rules.acceptUpcE && code.length === 8) return 'UPC_E'
	}
	return 'CODE128'
}

export function validateBarcode(
	raw: string,
	rules: BarcodeRules = {},
): BarcodeValidationResult {
	const r = { ...DEFAULT_RULES, ...rules }
	const code = normalizeBarcode(raw)

	if (!code) return { ok: false, code, reason: 'empty' }
	if (code.length < r.minLength) return { ok: false, code, reason: 'too_short' }
	if (code.length > r.maxLength) return { ok: false, code, reason: 'too_long' }

	if (r.allowAlpha) {
		if (!isAlphaNum(code)) return { ok: false, code, reason: 'invalid_chars' }
		return { ok: true, code, format: detectFormat(code, r) }
	}

	// digits-only
	if (!isDigitsOnly(code)) return { ok: false, code, reason: 'invalid_chars' }

	const format = detectFormat(code, r)

	if (r.verifyChecksum) {
		if (code.length === 13 && !hasValidEan13(code))
			return { ok: false, code, reason: 'invalid_checksum' }
		if (code.length === 8 && !hasValidEan8(code))
			return { ok: false, code, reason: 'invalid_checksum' }
		if (code.length === 12 && !hasValidUpcA(code))
			return { ok: false, code, reason: 'invalid_checksum' }
		// UPC-E: non vérifié ici
	}

	return { ok: true, code, format }
}
