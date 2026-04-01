/**
 * Formate une date au format français (JJ/MM/AAAA)
 */
export function formatDate(dateStr?: string | null): string {
	if (!dateStr) return '-'
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

/**
 * Formate un montant en devise (ex: 1 200,50 €)
 */
export function formatCurrency(amount: number, currency = 'EUR'): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency,
	}).format(amount)
}
