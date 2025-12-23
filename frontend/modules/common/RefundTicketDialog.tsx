// RefundTicketDialog.tsx
// import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

import { type RefundTicketInput, useRefundTicket } from '@/lib/queries/invoices'
import { usePocketBase } from '@/lib/use-pocketbase'

type RefundMethod = 'especes' | 'cb' | 'cheque' | 'autre'
type RefundType = 'full' | 'partial'

export type InvoiceResponse = {
	id: string
	number?: string
	invoice_type?: 'invoice' | 'credit_note'
	is_pos_ticket?: boolean
	currency?: string
	date?: string
	customer?: any
	items?: any[]
	total_ht?: number
	total_tva?: number
	total_ttc?: number
	credit_notes_total?: number
	remaining_amount?: number
	has_credit_note?: boolean
	[key: string]: any
}

export interface RefundTicketDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	ticket: InvoiceResponse | null
	sessionId?: string
	onSuccess: () => void
}

type UiLine = {
	selected: boolean
	quantity: number
	reason?: string
}

// 🆕 Type pour les infos de remboursement par item
type ItemRefundInfo = {
	index: number
	originalQty: number
	refundedQty: number
	remainingQty: number
}

function toNumber(v: any, fallback = 0) {
	const n = typeof v === 'number' ? v : Number(v)
	return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number) {
	return Math.min(max, Math.max(min, n))
}

function abs(n: number) {
	return n < 0 ? -n : n
}

function formatMoney(amount: number, currency?: string) {
	const cur = currency || 'EUR'
	try {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: cur,
		}).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${cur}`
	}
}

function computeLineAmounts(item: any, qty: number) {
	const qOrig = Math.max(
		1,
		toNumber(item?.quantity ?? item?.qty ?? item?.qte, 1),
	)
	const ratio = qty / qOrig

	const itemTotalTTC = toNumber(item?.total_ttc, Number.NaN)
	const itemTotalHT = toNumber(item?.total_ht, Number.NaN)
	const itemTotalTVA = toNumber(item?.total_tva, Number.NaN)

	if (Number.isFinite(itemTotalTTC)) {
		const ttc = itemTotalTTC * ratio
		const ht = Number.isFinite(itemTotalHT) ? itemTotalHT * ratio : Number.NaN
		const tva = Number.isFinite(itemTotalTVA)
			? itemTotalTVA * ratio
			: Number.NaN
		return {
			ht: Number.isFinite(ht) ? ht : Number.NaN,
			tva: Number.isFinite(tva) ? tva : Number.NaN,
			ttc,
		}
	}

	const unitTTC = toNumber(
		item?.unit_price_ttc ?? item?.price_ttc ?? item?.unit_ttc,
		Number.NaN,
	)
	if (Number.isFinite(unitTTC)) {
		const ttc = unitTTC * qty
		const vatRate = toNumber(
			item?.vat_rate ?? item?.tax_rate ?? item?.tva_rate,
			0,
		)
		const ht = vatRate ? ttc / (1 + vatRate / 100) : ttc
		const tva = ttc - ht
		return { ht, tva, ttc }
	}

	const unitHT = toNumber(
		item?.unit_price_ht ?? item?.price_ht ?? item?.unit_ht,
		Number.NaN,
	)
	if (Number.isFinite(unitHT)) {
		const ht = unitHT * qty
		const vatRate = toNumber(
			item?.vat_rate ?? item?.tax_rate ?? item?.tva_rate,
			0,
		)
		const tva = ht * (vatRate / 100)
		const ttc = ht + tva
		return { ht, tva, ttc }
	}

	return { ht: Number.NaN, tva: Number.NaN, ttc: 0 }
}

function getItemLabel(item: any, index: number) {
	return (
		item?.name ||
		item?.label ||
		item?.title ||
		item?.product_name ||
		item?.sku ||
		item?.barcode ||
		`Article #${index + 1}`
	)
}

function getItemQty(item: any) {
	const q = toNumber(item?.quantity ?? item?.qty ?? item?.qte, 1)
	return q > 0 ? q : 1
}

function getItemStableKey(item: any, index: number) {
	const k =
		item?.id ??
		item?.item_id ??
		item?.product_id ??
		item?.product ??
		item?.sku ??
		item?.barcode ??
		item?.name ??
		item?.label
	const s = typeof k === 'string' ? k.trim() : String(k ?? '').trim()
	return s ? `it:${s}` : `idx:${index}`
}

export function RefundTicketDialog(props: RefundTicketDialogProps) {
	const { open, onOpenChange, ticket, onSuccess } = props
	const pb = usePocketBase() as any

	const refundMutation = useRefundTicket()

	const [mode, setMode] = useState<RefundType>('full')
	const [refundMethod, setRefundMethod] = useState<RefundMethod>('especes')
	const [globalReason, setGlobalReason] = useState<string>('')
	const [lines, setLines] = useState<Record<number, UiLine>>({})

	// 🆕 State pour les infos de remboursement par item
	const [itemsRefundInfo, setItemsRefundInfo] = useState<
		Record<number, ItemRefundInfo>
	>({})
	const [loadingRefundInfo, setLoadingRefundInfo] = useState(false)

	const items = (ticket?.items || []) as any[]
	const currency = ticket?.currency || 'EUR'

	const ticketTotal = abs(toNumber(ticket?.total_ttc, 0))
	const refundedAlready = abs(toNumber(ticket?.credit_notes_total, 0))
	const remaining = Math.max(
		0,
		toNumber(ticket?.remaining_amount, ticketTotal - refundedAlready),
	)
	const disabledAll = !ticket || remaining <= 0

	// 🆕 Charger les avoirs existants pour calculer les items déjà remboursés
	useEffect(() => {
		if (!open || !ticket?.id) {
			setItemsRefundInfo({})
			return
		}

		let cancelled = false

		const loadRefundInfo = async () => {
			setLoadingRefundInfo(true)
			try {
				const creditNotes = await pb.collection('invoices').getFullList({
					filter: `invoice_type = "credit_note" && original_invoice_id = "${ticket.id}"`,
				})

				const refundedByIndex: Record<number, number> = {}

				for (const cn of creditNotes) {
					const cnItems = (cn.items || []) as any[]
					for (const item of cnItems) {
						const idx = item.original_item_index
						if (typeof idx === 'number') {
							const qty = getItemQty(item)
							refundedByIndex[idx] = (refundedByIndex[idx] || 0) + qty
						}
					}
				}

				const info: Record<number, ItemRefundInfo> = {}
				for (let i = 0; i < items.length; i++) {
					const originalQty = getItemQty(items[i])
					const refundedQty = refundedByIndex[i] || 0
					info[i] = {
						index: i,
						originalQty,
						refundedQty,
						remainingQty: Math.max(0, originalQty - refundedQty),
					}
				}

				if (!cancelled) setItemsRefundInfo(info)
			} catch (err) {
				console.error('Erreur chargement infos remboursement:', err)
			} finally {
				if (!cancelled) setLoadingRefundInfo(false)
			}
		}

		void loadRefundInfo()

		return () => {
			cancelled = true
		}
	}, [open, ticket?.id, pb, items])

	useEffect(() => {
		if (!open) return

		setMode('full')
		setRefundMethod('especes')
		setGlobalReason('')

		const initialLines: Record<number, UiLine> = {}
		for (let i = 0; i < items.length; i++) {
			const info = itemsRefundInfo[i]
			const maxQty = info?.remainingQty ?? getItemQty(items[i])
			initialLines[i] = {
				selected: false,
				quantity: Math.min(1, maxQty),
				reason: '',
			}
		}
		setLines(initialLines)
	}, [open, items, itemsRefundInfo])

	const partialSelection = useMemo(() => {
		const selected: { index: number; quantity: number; reason?: string }[] = []
		let totalTTC = 0

		for (let i = 0; i < items.length; i++) {
			const st = lines[i]
			if (!st?.selected) continue

			// Utiliser la quantité restante comme max
			const info = itemsRefundInfo[i]
			const maxQty = info?.remainingQty ?? getItemQty(items[i])
			const qty = clamp(toNumber(st.quantity, 0), 0, maxQty)

			if (qty <= 0) continue

			const amounts = computeLineAmounts(items[i], qty)
			totalTTC += abs(amounts.ttc)
			selected.push({
				index: i,
				quantity: qty,
				reason: st.reason?.trim() || undefined,
			})
		}
		return { selected, totalTTC: Math.min(totalTTC, remaining) }
	}, [items, lines, remaining, itemsRefundInfo])

	const amountToRefund = mode === 'full' ? remaining : partialSelection.totalTTC

	const canSubmit = useMemo(() => {
		if (disabledAll) return false
		if (!globalReason.trim()) return false
		if (mode === 'partial') {
			if (partialSelection.selected.length === 0) return false
			if (amountToRefund <= 0) return false
		}
		if (mode === 'full' && amountToRefund <= 0) return false
		return true
	}, [
		disabledAll,
		globalReason,
		mode,
		partialSelection.selected.length,
		amountToRefund,
	])

	const onToggleMode = (next: RefundType) => setMode(next)

	const onToggleLine = (index: number, checked: boolean) => {
		setLines((prev) => ({
			...prev,
			[index]: {
				...(prev[index] || { selected: false, quantity: 1, reason: '' }),
				selected: checked,
			},
		}))
	}

	const onChangeQty = (index: number, value: string) => {
		const info = itemsRefundInfo[index]
		const maxQty = info?.remainingQty ?? getItemQty(items[index])
		const n = clamp(toNumber(value, 0), 0, maxQty)

		setLines((prev) => ({
			...prev,
			[index]: {
				...(prev[index] || { selected: false, quantity: 1, reason: '' }),
				quantity: n,
				selected: n > 0,
			},
		}))
	}

	const onChangeLineReason = (index: number, value: string) => {
		setLines((prev) => ({
			...prev,
			[index]: {
				...(prev[index] || { selected: false, quantity: 1, reason: '' }),
				reason: value,
			},
		}))
	}

	// 🔧 FIX: Un seul appel à mutateAsync
	const handleSubmit = async () => {
		if (!ticket) return

		const base: RefundTicketInput = {
			originalTicketId: ticket.id,
			refundType: mode,
			refundMethod: refundMethod,
			reason: globalReason.trim(),
		}

		if (mode === 'partial') {
			base.refundedItems = partialSelection.selected.map((x) => ({
				originalItemIndex: x.index,
				quantity: x.quantity,
				reason: x.reason,
			}))
		}

		const confirmMsg =
			mode === 'full'
				? `Confirmer le remboursement total de ${formatMoney(amountToRefund, currency)} ?`
				: `Confirmer le remboursement partiel de ${formatMoney(amountToRefund, currency)} ?`

		if (!window.confirm(confirmMsg)) return

		try {
			await refundMutation.mutateAsync(base)

			toast.success('Remboursement effectué', {
				description: `Avoir de ${formatMoney(amountToRefund, currency)} créé pour ${ticket?.number}`,
			})

			onOpenChange(false)
			onSuccess()
		} catch (error: any) {
			toast.error('Erreur lors du remboursement', {
				description: error?.message || 'Une erreur est survenue',
			})
		}
	}

	const errorMsg = (refundMutation.error as any)?.message as string | undefined

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-3xl'>
				<DialogHeader>
					<DialogTitle>Remboursement ticket</DialogTitle>
				</DialogHeader>

				{!ticket ? (
					<div className='text-sm text-muted-foreground'>
						Aucun ticket sélectionné.
					</div>
				) : (
					<div className='space-y-4'>
						<div className='rounded-lg border p-3'>
							<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
								<div className='space-y-1'>
									<div className='text-sm font-medium'>
										{ticket.number || 'Ticket'}{' '}
										<span className='text-muted-foreground'>
											• Total {formatMoney(ticketTotal, currency)}
										</span>
									</div>
									<div className='text-xs text-muted-foreground'>
										Déjà remboursé: {formatMoney(refundedAlready, currency)} •
										Restant: {formatMoney(remaining, currency)}
									</div>
								</div>

								<div className='flex items-center gap-2'>
									<Button
										type='button'
										variant={mode === 'full' ? 'default' : 'outline'}
										size='sm'
										onClick={() => onToggleMode('full')}
										disabled={disabledAll}
									>
										Total
									</Button>
									<Button
										type='button'
										variant={mode === 'partial' ? 'default' : 'outline'}
										size='sm'
										onClick={() => onToggleMode('partial')}
										disabled={disabledAll}
									>
										Partiel
									</Button>
								</div>
							</div>

							{remaining <= 0 && (
								<div className='mt-2 text-sm text-destructive'>
									Ce ticket est déjà totalement remboursé.
								</div>
							)}
						</div>

						<div className='grid gap-4 sm:grid-cols-2'>
							<div className='space-y-2'>
								<Label>Méthode de remboursement</Label>
								<Select
									value={refundMethod}
									onValueChange={(v) => setRefundMethod(v as RefundMethod)}
									disabled={disabledAll}
								>
									<SelectTrigger>
										<SelectValue placeholder='Sélectionner' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='especes'>Espèces</SelectItem>
										<SelectItem value='cb'>CB</SelectItem>
										<SelectItem value='cheque'>Chèque</SelectItem>
										<SelectItem value='autre'>Autre</SelectItem>
									</SelectContent>
								</Select>
								<div className='text-xs text-muted-foreground'>
									Si espèces, une session ouverte est requise côté backend.
								</div>
							</div>

							<div className='space-y-2'>
								<Label>Motif (obligatoire)</Label>
								<Textarea
									value={globalReason}
									onChange={(e) => setGlobalReason(e.target.value)}
									placeholder='Ex: Client insatisfait, erreur de saisie...'
									disabled={disabledAll}
								/>
							</div>
						</div>

						<Separator />

						{mode === 'full' ? (
							<div className='space-y-3'>
								<div className='text-sm font-medium'>Récapitulatif</div>
								<div className='rounded-lg border p-3'>
									<div className='flex items-center justify-between text-sm'>
										<span>Montant à rembourser</span>
										<span className='font-semibold'>
											{formatMoney(amountToRefund, currency)}
										</span>
									</div>
								</div>
							</div>
						) : (
							<div className='space-y-3'>
								<div className='flex items-center justify-between'>
									<div className='text-sm font-medium'>
										Sélection des lignes
										{loadingRefundInfo && (
											<span className='ml-2 text-xs text-muted-foreground'>
												(chargement...)
											</span>
										)}
									</div>
									<div className='text-sm'>
										Montant sélectionné:{' '}
										<span className='font-semibold'>
											{formatMoney(amountToRefund, currency)}
										</span>
									</div>
								</div>

								<div className='rounded-lg border'>
									<div className='max-h-[340px] overflow-auto'>
										{items.length === 0 ? (
											<div className='p-3 text-sm text-muted-foreground'>
												Aucun item sur ce ticket.
											</div>
										) : (
											<div className='divide-y'>
												{items.map((it, idx) => {
													const st = lines[idx]
													const originalQty = getItemQty(it)

													// 🆕 Utiliser les infos de remboursement chargées
													const info = itemsRefundInfo[idx]
													const alreadyRefundedQty = info?.refundedQty ?? 0
													const remainingQtyForItem =
														info?.remainingQty ?? originalQty
													const isItemFullyRefunded = remainingQtyForItem <= 0

													const selected = !!st?.selected
													const qty = clamp(
														toNumber(st?.quantity ?? 1, 1),
														0,
														remainingQtyForItem,
													)

													const est =
														selected && qty > 0
															? computeLineAmounts(it, qty)
															: { ttc: 0 }
													const estTTC = abs(toNumber((est as any).ttc, 0))

													const key = getItemStableKey(it, idx)

													return (
														<div
															key={key}
															className={`p-3 ${isItemFullyRefunded ? 'opacity-50 bg-gray-100' : ''}`}
														>
															<div className='flex gap-3'>
																<div className='pt-1'>
																	<Checkbox
																		checked={selected}
																		onCheckedChange={(v) =>
																			onToggleLine(idx, Boolean(v))
																		}
																		disabled={
																			disabledAll || isItemFullyRefunded
																		}
																	/>
																</div>

																<div className='flex-1 space-y-2'>
																	<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
																		<div className='space-y-0.5'>
																			<div className='text-sm font-medium'>
																				{getItemLabel(it, idx)}
																				{isItemFullyRefunded && (
																					<span className='ml-2 text-xs text-red-500'>
																						(déjà remboursé)
																					</span>
																				)}
																			</div>
																			<div className='text-xs text-muted-foreground'>
																				Qté originale: {originalQty}
																				{alreadyRefundedQty > 0 && (
																					<span className='text-orange-500'>
																						{' '}
																						• Déjà remboursé:{' '}
																						{alreadyRefundedQty}
																					</span>
																				)}
																				{remainingQtyForItem > 0 &&
																					alreadyRefundedQty > 0 && (
																						<span className='text-green-600'>
																							{' '}
																							• Restant: {remainingQtyForItem}
																						</span>
																					)}
																			</div>
																		</div>

																		<div className='flex items-center gap-2'>
																			<Label className='text-xs text-muted-foreground'>
																				Qté
																			</Label>
																			<Input
																				type='number'
																				min={0}
																				step={1}
																				max={remainingQtyForItem}
																				value={qty}
																				onChange={(e) =>
																					onChangeQty(idx, e.target.value)
																				}
																				className='w-24'
																				disabled={
																					disabledAll || isItemFullyRefunded
																				}
																			/>
																		</div>
																	</div>

																	<div className='grid gap-2 sm:grid-cols-2'>
																		<div className='space-y-1'>
																			<Label className='text-xs text-muted-foreground'>
																				Motif ligne (optionnel)
																			</Label>
																			<Input
																				value={st?.reason ?? ''}
																				onChange={(e) =>
																					onChangeLineReason(
																						idx,
																						e.target.value,
																					)
																				}
																				placeholder='Ex: Article défectueux'
																				disabled={
																					disabledAll || isItemFullyRefunded
																				}
																			/>
																		</div>
																		<div className='text-xs text-muted-foreground sm:text-right sm:self-end'>
																			{selected ? (
																				<span>
																					Montant estimé ligne:{' '}
																					{formatMoney(estTTC, currency)}
																				</span>
																			) : (
																				<span>
																					{isItemFullyRefunded
																						? 'Item déjà remboursé'
																						: 'Sélectionnez pour rembourser'}
																				</span>
																			)}
																		</div>
																	</div>
																</div>
															</div>
														</div>
													)
												})}
											</div>
										)}
									</div>
								</div>
							</div>
						)}

						{errorMsg && (
							<div className='text-sm text-destructive'>{errorMsg}</div>
						)}
					</div>
				)}

				<DialogFooter className='gap-2'>
					<Button
						type='button'
						variant='outline'
						onClick={() => onOpenChange(false)}
					>
						Annuler
					</Button>

					<Button
						type='button'
						onClick={handleSubmit}
						disabled={
							!canSubmit || refundMutation.isPending || loadingRefundInfo
						}
					>
						{refundMutation.isPending
							? 'Traitement...'
							: mode === 'full'
								? 'Rembourser tout'
								: 'Rembourser la sélection'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
