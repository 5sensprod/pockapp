// frontend/lib/utils.ts
// ✅ Fonctions utilitaires de formatage

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Fonction utilitaire pour fusionner les classes Tailwind
 * (probablement déjà présente si vous utilisez shadcn/ui)
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * ✅ Formater un montant en euros
 * @param amount - Montant à formater
 * @returns Montant formaté (ex: "1 234,56 €")
 */
export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(amount)
}

/**
 * ✅ Formater une date avec l'heure
 * @param dateStr - Date ISO string ou Date
 * @returns Date formatée (ex: "17/12/2025 à 14:30")
 */
export function formatDateTime(dateStr: string | Date): string {
	const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

	return new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date)
}

/**
 * Formater une date seulement (sans l'heure)
 * @param dateStr - Date ISO string ou Date
 * @returns Date formatée (ex: "17/12/2025")
 */
export function formatDate(dateStr: string | Date): string {
	const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

	return new Intl.DateTimeFormat('fr-FR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(date)
}

/**
 * Formater l'heure seulement
 * @param dateStr - Date ISO string ou Date
 * @returns Heure formatée (ex: "14:30")
 */
export function formatTime(dateStr: string | Date): string {
	const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr

	return new Intl.DateTimeFormat('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	}).format(date)
}
