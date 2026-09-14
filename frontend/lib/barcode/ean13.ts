/** Calcule la clé EAN-13 depuis les douze premiers chiffres. */
export function calculateEAN13CheckDigit(code12: string): number {
	if (!/^\d{12}$/.test(code12)) {
		throw new Error('Le code doit contenir exactement 12 chiffres')
	}

	let sum = 0
	for (let i = 0; i < code12.length; i++) {
		sum += Number(code12[i]) * (i % 2 === 0 ? 1 : 3)
	}
	return (10 - (sum % 10)) % 10
}

export function validateEAN13(code: string): boolean {
	if (!/^\d{13}$/.test(code)) return false
	return Number(code[12]) === calculateEAN13CheckDigit(code.slice(0, 12))
}

export function formatEAN13(code: string): string {
	if (!/^\d{13}$/.test(code)) return code
	return `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}`
}
