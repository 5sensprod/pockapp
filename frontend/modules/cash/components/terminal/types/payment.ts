// frontend/modules/cash/components/terminal/types/payment.ts

export type PaymentStep = 'cart' | 'payment' | 'success'

export type BackendPaymentMethod =
	| 'especes'
	| 'cb'
	| 'cheque'
	| 'autre'
	| 'virement'

export interface PaymentMethod {
	id: string
	code: string
	name: string
	description?: string
	type: 'default' | 'custom'
	accounting_category: 'cash' | 'card' | 'check' | 'transfer' | 'other'
	enabled: boolean
	requires_session: boolean
	icon?: string
	color?: string
	text_color?: string
	display_order: number
}

export function getDefaultPaymentMethod(
	code: 'cash' | 'card' | 'check' | 'transfer',
): PaymentMethod {
	const defaults: Record<string, PaymentMethod> = {
		cash: {
			id: 'default-cash',
			code: 'cash',
			name: 'Espèces',
			type: 'default',
			accounting_category: 'cash',
			enabled: true,
			requires_session: false,
			icon: 'Banknote',
			color: '#22c55e',
			text_color: '#ffffff',
			display_order: 1,
		},
		card: {
			id: 'default-card',
			code: 'card',
			name: 'Carte bancaire',
			type: 'default',
			accounting_category: 'card',
			enabled: true,
			requires_session: false,
			icon: 'CreditCard',
			color: '#3b82f6',
			text_color: '#ffffff',
			display_order: 2,
		},
		check: {
			id: 'default-check',
			code: 'check',
			name: 'Chèque',
			type: 'default',
			accounting_category: 'check',
			enabled: true,
			requires_session: false,
			icon: 'Receipt',
			color: '#a855f7',
			text_color: '#ffffff',
			display_order: 3,
		},
		transfer: {
			id: 'default-transfer',
			code: 'transfer',
			name: 'Virement',
			type: 'default',
			accounting_category: 'transfer',
			enabled: true,
			requires_session: false,
			icon: 'ArrowRightLeft',
			color: '#f59e0b',
			text_color: '#ffffff',
			display_order: 4,
		},
	}
	return defaults[code]
}

export function getPaymentMethodCode(
	method: PaymentMethod,
): BackendPaymentMethod {
	if (method.type === 'default') {
		const mapping: Record<
			'card' | 'cash' | 'check' | 'transfer',
			BackendPaymentMethod
		> = {
			card: 'cb',
			cash: 'especes',
			check: 'cheque',
			transfer: 'virement',
		}
		return (
			mapping[method.code as 'card' | 'cash' | 'check' | 'transfer'] ?? 'autre'
		)
	}

	return 'autre'
}

export function getPaymentMethodLabel(
	method: PaymentMethod,
): string | undefined {
	return method.type === 'custom' ? method.name : undefined
}
