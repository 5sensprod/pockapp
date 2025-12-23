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

import {
	type RefundInvoiceInput,
	useRefundInvoice,
} from '@/lib/queries/invoices'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'

type RefundMethod = 'especes' | 'cb' | 'cheque' | 'autre'
type RefundType = 'full' | 'partial'

type ItemRefundInfo = {
	index: number
	originalQty: number
	refundedQty: number
	remainingQty: number
}

type UiLine = {
	selected: boolean
	quantity: number
	reason?: string
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

function getItemQty(item: any) {
	// compatible anciennes données (quantités négatives)
	const q = toNumber(item?.quantity ?? item?.qty ?? item?.qte, 0)
	return abs(q)
}

function computeLineAmounts(item: any, qty: number) {
	const qOrig = Math.max(1, getItemQty(item))
	const ratio = qty / qOrig

	const itemTotalTTC = toNumber(item?.total_ttc, Number.NaN)
	const itemTotalHT = toNumber(item?.total_ht, Number.NaN)
	const itemTotalTVA = toNumber(item?.total_tva, Number.NaN)

	if (Number.isFinite(itemTotalTTC)) {
		const ttc = abs(itemTotalTTC) * ratio
		const ht = Number.isFinite(itemTotalHT)
			? abs(itemTotalHT) * ratio
			: Number.NaN
		const tva = Number.isFinite(itemTotalTVA)
			? abs(itemTotalTVA) * ratio
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
		const ttc = abs(unitTTC) * qty
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
		const ht = abs(unitHT) * qty
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

type Props = {
	open: boolean
	onClose: () => void
	invoice: InvoiceResponse | null
	onSuccess?: () => void
}

export function RefundInvoiceDialog({
	open,
	onClose,
	invoice,
	onSuccess,
}: Props) {
	const pb = usePocketBase() as any
	const refundMutation = useRefundInvoice()

	const [mode, setMode] = useState<RefundType>('full')
	const [refundMethod, setRefundMethod] = useState<RefundMethod>('autre')
	const [globalReason, setGlobalReason] = useState<string>('')
	const [lines, setLines] = useState<Record<number, UiLine>>({})

	const [itemsRefundInfo, setItemsRefundInfo] = useState<
		Record<number, ItemRefundInfo>
	>({})
	const [loadingRefundInfo, setLoadingRefundInfo] = useState(false)

	const items = (invoice?.items || []) as any[]
	const currency = invoice?.currency || 'EUR'

	const invoiceTotal = abs(toNumber(invoice?.total_ttc, 0))
	const refundedAlready = abs(toNumber((invoice as any)?.credit_notes_total, 0))
	const remaining = Math.max(
		0,
		toNumber(
			(invoice as any)?.remaining_amount,
			invoiceTotal - refundedAlready,
		),
	)
	const disabledAll = !invoice || remaining <= 0

	// Charger infos "déjà remboursé" (par original_item_index)
	useEffect(() => {
		if (!open || !invoice?.id) {
			setItemsRefundInfo({})
			return
		}

		let cancelled = false

		const loadRefundInfo = async () => {
			setLoadingRefundInfo(true)
			try {
				const creditNotes = await pb.collection('invoices').getFullList({
					filter: `invoice_type = "credit_note" && original_invoice_id = "${invoice.id}"`,
				})

				const refundedByIndex: Record<number, number> = {}

				for (const cn of creditNotes) {
					const cnItems = (cn.items || []) as any[]
					for (const it of cnItems) {
						const idx = it.original_item_index
						if (typeof idx === 'number') {
							refundedByIndex[idx] =
								(refundedByIndex[idx] || 0) + getItemQty(it)
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
				console.error('Erreur chargement infos remboursement facture:', err)
			} finally {
				if (!cancelled) setLoadingRefundInfo(false)
			}
		}

		void loadRefundInfo()
		return () => {
			cancelled = true
		}
	}, [open, invoice?.id, invoice?.items, pb])

	// Init lignes au open
	useEffect(() => {
		if (!open) return

		setMode('full')
		setRefundMethod('autre')
		setGlobalReason('')

		const initial: Record<number, UiLine> = {}
		for (let i = 0; i < items.length; i++) {
			const maxQty = itemsRefundInfo[i]?.remainingQty ?? getItemQty(items[i])
			initial[i] = {
				selected: false,
				quantity: Math.min(1, maxQty),
				reason: '',
			}
		}
		setLines(initial)
	}, [open, invoice?.items, itemsRefundInfo])

	const partialSelection = useMemo(() => {
		const selected: { index: number; quantity: number; reason?: string }[] = []
		let totalTTC = 0

		for (let i = 0; i < items.length; i++) {
			const st = lines[i]
			if (!st?.selected) continue

			const maxQty = itemsRefundInfo[i]?.remainingQty ?? getItemQty(items[i])
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
		const maxQty =
			itemsRefundInfo[index]?.remainingQty ?? getItemQty(items[index])
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

	const handleSubmit = async () => {
		if (!invoice) return

		const base: RefundInvoiceInput = {
			originalInvoiceId: invoice.id,
			refundType: mode,
			refundMethod,
			reason: globalReason.trim(),
		}

		if (mode === 'partial') {
			base.refundedItems = partialSelection.selected.map((x) => ({
				original_item_index: x.index,
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
				description: `Avoir de ${formatMoney(amountToRefund, currency)} créé pour ${invoice.number}`,
			})

			onClose()
			onSuccess?.()
		} catch (error: any) {
			toast.error('Erreur lors du remboursement', {
				description: error?.message || 'Une erreur est survenue',
			})
		}
	}

	if (!invoice) return null

	const hasRemaining = Object.values(itemsRefundInfo).some(
		(x) => x.remainingQty > 0,
	)

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className='max-w-4xl'>
				<DialogHeader>
					<DialogTitle>Remboursement facture</DialogTitle>
				</DialogHeader>

				<div className='rounded-lg border p-3'>
					<div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
						<div className='space-y-1'>
							<div className='text-sm font-medium'>
								{invoice.number || 'Facture'}{' '}
								<span className='text-muted-foreground'>
									• Total {formatMoney(invoiceTotal, currency)}
								</span>
							</div>
							<div className='text-xs text-muted-foreground'>
								Déjà remboursé: {formatMoney(refundedAlready, currency)} •
								Restant: {formatMoney(remaining, currency)}
							</div>
						</div>
					</div>
				</div>

				<div className='flex flex-wrap gap-2'>
					<Button
						variant={mode === 'full' ? 'default' : 'outline'}
						onClick={() => setMode('full')}
						disabled={loadingRefundInfo}
					>
						Remboursement total
					</Button>
					<Button
						variant={mode === 'partial' ? 'default' : 'outline'}
						onClick={() => setMode('partial')}
						disabled={!hasRemaining || loadingRefundInfo}
					>
						Remboursement partiel
					</Button>
				</div>

				<div className='grid gap-2'>
					<Label>Mode de remboursement</Label>
					<Select
						value={refundMethod}
						onValueChange={(v) => setRefundMethod(v as RefundMethod)}
					>
						<SelectTrigger>
							<SelectValue placeholder='Choisir…' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='especes'>Espèces</SelectItem>
							<SelectItem value='cb'>Carte</SelectItem>
							<SelectItem value='cheque'>Chèque</SelectItem>
							<SelectItem value='autre'>Autre</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className='grid gap-2'>
					<Label>Motif global</Label>
					<Textarea
						value={globalReason}
						onChange={(e) => setGlobalReason(e.target.value)}
					/>
				</div>

				{mode === 'partial' && (
					<div className='space-y-2'>
						<Separator />
						<div className='text-sm font-medium'>Sélection des lignes</div>

						{items.map((item: any, idx: number) => {
							const info = itemsRefundInfo[idx]
							const line = lines[idx]
							const label = getItemLabel(item, idx)

							const remainingQty = info?.remainingQty ?? getItemQty(item)
							const disabled = remainingQty <= 0

							return (
								<div
									key={`${invoice.id}-item-${idx}`}
									className='rounded-md border p-2'
								>
									<div className='flex items-center justify-between gap-3'>
										<div className='flex items-center gap-2'>
											<Checkbox
												checked={!!line?.selected}
												onCheckedChange={(v) => onToggleLine(idx, !!v)}
												disabled={disabled}
											/>
											<div className={disabled ? 'opacity-60' : ''}>
												<div className='text-sm font-medium'>{label}</div>
												<div className='text-xs text-muted-foreground'>
													Restant: {remainingQty}
												</div>
											</div>
										</div>

										<div className='flex items-center gap-2'>
											<Input
												className='w-24'
												type='number'
												min={0}
												step={1}
												value={line?.quantity ?? 0}
												onChange={(e) => onChangeQty(idx, e.target.value)}
												disabled={disabled}
											/>
										</div>
									</div>

									<div className='mt-2'>
										<Input
											placeholder='Motif ligne (optionnel)'
											value={line?.reason ?? ''}
											onChange={(e) => onChangeLineReason(idx, e.target.value)}
											disabled={disabled}
										/>
									</div>
								</div>
							)
						})}
					</div>
				)}

				<DialogFooter className='flex items-center justify-between gap-2'>
					<div className='text-sm'>
						Montant à rembourser: <b>{formatMoney(amountToRefund, currency)}</b>
					</div>

					<div className='flex gap-2'>
						<Button variant='outline' onClick={onClose}>
							Annuler
						</Button>
						<Button
							onClick={handleSubmit}
							disabled={!canSubmit || refundMutation.isPending}
						>
							Valider
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
