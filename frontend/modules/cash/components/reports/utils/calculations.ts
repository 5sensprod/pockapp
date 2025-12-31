// frontend/modules/cash/components/reports/utils/calculations.ts

/**
 * Calcule le résultat net par méthode de paiement (ventes - remboursements)
 */
export function computeNetByMethod(
	sales: Record<string, number> | undefined,
	refunds: Record<string, number> | undefined,
): Record<string, number> {
	const result: Record<string, number> = {}
	const keys = new Set([
		...Object.keys(sales ?? {}),
		...Object.keys(refunds ?? {}),
	])

	for (const k of keys) {
		result[k] = (sales?.[k] ?? 0) - (refunds?.[k] ?? 0)
	}

	return result
}

/**
 * Calcule les totaux à partir d'un dictionnaire de montants par méthode
 */
export function computeTotal(amounts: Record<string, number> | undefined): number {
	if (!amounts) return 0
	return Object.values(amounts).reduce((sum, amount) => sum + amount, 0)
}

/**
 * Vérifie si un écart de caisse est significatif
 */
export function isCashDifferenceSignificant(
	difference: number,
	threshold = 10,
): boolean {
	return Math.abs(difference) > threshold
}
