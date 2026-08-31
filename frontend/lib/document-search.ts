export type DocumentSearchTextField =
	| 'number'
	| 'notes'
	| 'items'
	| 'customer_name'

export type DocumentFilterFormatter = (
	expression: string,
	params: Record<string, unknown>,
) => string

interface BuildDocumentSearchFilterOptions {
	term: string
	textFields?: readonly DocumentSearchTextField[]
	customerIds?: readonly string[]
	formatFilter: DocumentFilterFormatter
}

export const DEFAULT_DOCUMENT_SEARCH_FIELDS: readonly DocumentSearchTextField[] =
	['number', 'notes', 'items']

/** Accepte notamment `1250`, `1250.50`, `1 250,50` et `1 250,50 €`. */
export function parseDocumentSearchAmount(term: string): number | undefined {
	let normalized = term.trim().replace(/[€\s\u00a0\u202f]/g, '')

	if (normalized.includes(',')) {
		normalized = normalized.replace(/\./g, '').replace(',', '.')
	}
	if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined

	const amount = Number(normalized)
	return Number.isFinite(amount) ? amount : undefined
}

export function buildDocumentSearchFilter({
	term,
	textFields = DEFAULT_DOCUMENT_SEARCH_FIELDS,
	customerIds = [],
	formatFilter,
}: BuildDocumentSearchFilterOptions): string | undefined {
	const normalizedTerm = term.trim()
	if (!normalizedTerm) return undefined

	const alternatives: string[] = []
	if (textFields.length > 0) {
		alternatives.push(
			formatFilter(
				`(${textFields
					.map((field) =>
						field === 'items' ? `${field} ?~ {:term}` : `${field} ~ {:term}`,
					)
					.join(' || ')})`,
				{ term: normalizedTerm },
			),
		)
	}

	const amount = parseDocumentSearchAmount(normalizedTerm)
	if (amount !== undefined) {
		alternatives.push(
			formatFilter('(total_ttc = {:amount} || total_ttc = {:oppositeAmount})', {
				amount,
				oppositeAmount: -amount,
			}),
		)
	}

	for (const [index, customerId] of customerIds.entries()) {
		alternatives.push(
			formatFilter(`customer = {:customer${index}}`, {
				[`customer${index}`]: customerId,
			}),
		)
	}

	return alternatives.length > 0 ? `(${alternatives.join(' || ')})` : undefined
}
