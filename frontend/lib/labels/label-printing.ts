// frontend/lib/labels/label-printing.ts
//
// Le transport : la liste des imprimantes, le format du média, l'envoi.
//
// L'accès au matériel appartient au processus Go — un poste au navigateur n'a
// pas d'étiqueteuse à lui (le déploiement est multi-postes depuis le 19 août
// 2026). Le client dessine, le serveur imprime.
//
// Pas de nouvelle sortie réseau : `pb.send` parle au PocketBase local
// (point 1 de CLAUDE.md).

import { queryOptions, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { usePocketBase } from '@/lib/use-pocketbase'
import type { LabelPageSize } from './render-product-label'

const STORAGE_KEY = 'label_printer_name'

/** L'étiqueteuse choisie, par poste : c'est un réglage de matériel local, pas
 *  une donnée d'entreprise — même raison que `pos_printer_settings_v2`. */
export function loadLabelPrinter(): string {
	try {
		return localStorage.getItem(STORAGE_KEY) || ''
	} catch {
		return ''
	}
}

export function saveLabelPrinter(name: string) {
	try {
		localStorage.setItem(STORAGE_KEY, name)
	} catch {
		/* poste en navigation privée : le choix vaut pour la session */
	}
}

export const labelKeys = {
	all: ['labels'] as const,
	pageSize: (printer: string, lengthMm: number) =>
		[...labelKeys.all, 'page-size', printer, lengthMm] as const,
}

/** La longueur de coupe par défaut, en millimètres. Le rouleau est CONTINU :
 *  rien n'impose les 90 mm du réglage d'usine du pilote, et une étiquette de
 *  prix n'en demande pas la moitié. */
export const DEFAULT_LABEL_LENGTH_MM = 50

type PocketBaseClient = ReturnType<typeof usePocketBase>

export function labelPageSizeQueryOptions(
	pb: PocketBaseClient,
	printerName: string,
	lengthMm: number,
) {
	return queryOptions({
		queryKey: labelKeys.pageSize(printerName, lengthMm),
		queryFn: async (): Promise<LabelPageSize> => {
			// C'est le PILOTE qui dit la zone imprimable pour cette longueur —
			// il en retire ses marges d'entraînement (~6 mm sur la QL-600).
			// La deviner ici, c'est imprimer à côté.
			const res = await pb.send<LabelPageSize & { dpiX: number; dpiY: number }>(
				`/api/labels/page-size?printer=${encodeURIComponent(printerName)}&lengthMm=${lengthMm}`,
				{ method: 'GET' },
			)
			return { widthMm: res.widthMm, heightMm: res.heightMm }
		},
		enabled: printerName.length > 0,
		staleTime: 1000 * 60 * 5,
		retry: false,
	})
}

type PrintLabelInput = {
	image: string
	printerName: string
	copies: number
	lengthMm: number
}

export function usePrintLabelMutation() {
	const pb = usePocketBase()

	return useMutation({
		mutationFn: async (input: PrintLabelInput) => {
			return pb.send<{ success: boolean; copies: number }>(
				'/api/labels/print',
				{
					method: 'POST',
					body: input,
				},
			)
		},
		onSuccess: (result) => {
			toast.success(
				result.copies > 1
					? `${result.copies} étiquettes envoyées`
					: 'Étiquette envoyée',
			)
		},
		onError: (error: Error) => {
			toast.error(`Impression impossible : ${error.message}`)
		},
	})
}
