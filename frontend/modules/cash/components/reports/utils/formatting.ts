// frontend/modules/cash/components/reports/utils/formatting.ts

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

export function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
}

export function formatTime(dateStr: string): string {
	return new Date(dateStr).toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	})
}

export function formatDateTime(dateStr: string): string {
	// const date = new Date(dateStr)
	return `${formatDate(dateStr)} à ${formatTime(dateStr)}`
}

export function toYMD(value?: string): string {
	if (!value) return ''
	const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
	return m?.[1] ?? ''
}
