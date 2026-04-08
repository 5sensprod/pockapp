// frontend/modules/connect/utils/statusConfig.ts
//
// Source unique de vérité pour tous les mappings de statuts du module Connect.
// Remplace les redéfinitions locales dans :
//   CustomerDetailPage, QuoteDetailPage, InvoiceDetailPage
//
// ─── Utilisation ────────────────────────────────────────────────────────────
//   import {
//     getInvoiceStatus, getQuoteStatus,
//     getCustomerTypeDisplay, getConsignmentStatus,
//   } from '../utils/statusConfig'

import type { BadgeProps } from '@/components/ui/badge'
import { Building2, Landmark, type LucideIcon, User, Users } from 'lucide-react'

// ── Types partagés ───────────────────────────────────────────────────────────

export interface StatusConfig {
	label: string
	variant: BadgeProps['variant']
}

export interface CustomerTypeConfig {
	label: string
	/** Classes Tailwind pour le badge (bg + text) */
	className: string
	icon: LucideIcon
}

export interface ConsignmentStatusConfig {
	label: string
	/** Classes Tailwind pour le badge */
	className: string
}

// ── Factures ─────────────────────────────────────────────────────────────────

const INVOICE_STATUS: Record<string, StatusConfig> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	validated: { label: 'Validée', variant: 'default' },
	sent: { label: 'Envoyée', variant: 'default' },
	cancelled: { label: 'Annulée', variant: 'destructive' },
}

export function getInvoiceStatus(status?: string): StatusConfig {
	return INVOICE_STATUS[status ?? 'draft'] ?? INVOICE_STATUS.draft
}

// ── Devis ─────────────────────────────────────────────────────────────────────

const QUOTE_STATUS: Record<string, StatusConfig> = {
	draft: { label: 'Brouillon', variant: 'secondary' },
	sent: { label: 'Envoyé', variant: 'outline' },
	accepted: { label: 'Accepté', variant: 'default' },
	rejected: { label: 'Refusé', variant: 'destructive' },
}

export function getQuoteStatus(status?: string): StatusConfig {
	return QUOTE_STATUS[status ?? 'draft'] ?? QUOTE_STATUS.draft
}

// ── Type de client ────────────────────────────────────────────────────────────

const CUSTOMER_TYPE: Record<string, CustomerTypeConfig> = {
	individual: {
		label: 'Particulier',
		className: 'bg-blue-100 text-blue-800',
		icon: User,
	},
	professional: {
		label: 'Professionnel',
		className: 'bg-purple-100 text-purple-800',
		icon: Building2,
	},
	administration: {
		label: 'Administration',
		className: 'bg-green-100 text-green-800',
		icon: Landmark,
	},
	association: {
		label: 'Association',
		className: 'bg-orange-100 text-orange-800',
		icon: Users,
	},
}

export function getCustomerTypeDisplay(
	type?: string | null,
): CustomerTypeConfig {
	return CUSTOMER_TYPE[type ?? 'individual'] ?? CUSTOMER_TYPE.individual
}

// ── Dépôt-vente ───────────────────────────────────────────────────────────────

const CONSIGNMENT_STATUS: Record<string, ConsignmentStatusConfig> = {
	available: { label: 'Disponible', className: 'bg-green-100 text-green-800' },
	sold: { label: 'Vendu', className: 'bg-blue-100 text-blue-800' },
	returned: { label: 'Rendu', className: 'bg-gray-100 text-gray-800' },
}

export function getConsignmentStatus(
	status?: string | null,
): ConsignmentStatusConfig {
	return (
		CONSIGNMENT_STATUS[status ?? 'available'] ?? CONSIGNMENT_STATUS.available
	)
}

// ── Tags clients ──────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
	vip: 'bg-yellow-100 text-yellow-800',
	prospect: 'bg-blue-100 text-blue-800',
	actif: 'bg-green-100 text-green-800',
	inactif: 'bg-gray-100 text-gray-800',
}

/**
 * Retourne la classe Tailwind d'un tag client, ou '' si inconnu.
 */
export function getTagClassName(tag: string): string {
	return TAG_COLORS[tag] ?? ''
}

/**
 * Normalise les tags bruts PocketBase en string[].
 * PocketBase peut renvoyer un tableau ou une chaîne JSON selon le schéma.
 */
export function normalizeTags(raw: unknown): string[] {
	if (Array.isArray(raw)) return raw as string[]
	if (typeof raw === 'string' && raw.length > 0) return [raw]
	return []
}
