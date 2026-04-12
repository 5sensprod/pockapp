// frontend/modules/connect/pages/orders/OrderCreatePage.tsx
//
// Supports deux origines :
//   - manuelle (paramètre URL ?customerId=xxx optionnel)
//   - depuis un devis accepté (?sourceQuoteId=xxx) → pré-remplit les lignes

import { ModulePageShell } from '@/components/module-ui/ModulePageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { manifest } from '../../manifest'
import {
	type OrderLine,
	computeOrderTotals,
	generateOrderReference,
} from '../../types/order'

// ── Ligne vide par défaut ─────────────────────────────────────────────────
function emptyLine(): OrderLine {
	return {
		id: crypto.randomUUID(),
		description: '',
		quantity: 1,
		unitPrice: 0,
		vatRate: 0.2,
		totalHT: 0,
		totalTTC: 0,
	}
}

function computeLine(line: Omit<OrderLine, 'totalHT' | 'totalTTC'>): OrderLine {
	const totalHT = line.quantity * line.unitPrice
	return {
		...line,
		totalHT,
		totalTTC: totalHT * (1 + line.vatRate),
	}
}

export function OrderCreatePage() {
	const navigate = useNavigate()
	// Récupère les query params si appelé depuis un devis
	// ex: /connect/orders/new?sourceQuoteId=xxx&customerId=yyy
	const search = useSearch({ strict: false }) as {
		sourceQuoteId?: string
		customerId?: string
	}

	const [lines, setLines] = useState<OrderLine[]>([emptyLine()])
	const [paymentConditions, setPaymentConditions] = useState('30 jours net')
	const [deliveryConditions, setDeliveryConditions] = useState('')
	const [notes, setNotes] = useState('')
	const [isSaving, setIsSaving] = useState(false)

	// TODO: charger le client et les lignes du devis si sourceQuoteId est présent
	const isFromQuote = !!search.sourceQuoteId

	const { totalHT, totalTVA, totalTTC } = computeOrderTotals(lines)

	const reference = generateOrderReference(42) // TODO: séquence réelle

	const formatAmount = (amount: number) =>
		new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(amount)

	// ── Handlers lignes ───────────────────────────────────────────────────
	const updateLine = (
		id: string,
		field: keyof OrderLine,
		value: string | number,
	) => {
		setLines((prev) =>
			prev.map((l) => {
				if (l.id !== id) return l
				const updated = { ...l, [field]: value }
				return computeLine(updated)
			}),
		)
	}

	const addLine = () => setLines((prev) => [...prev, emptyLine()])

	const removeLine = (id: string) =>
		setLines((prev) => prev.filter((l) => l.id !== id))

	// ── Sauvegarde ────────────────────────────────────────────────────────
	const handleSave = async (_asDraft: boolean) => {
		setIsSaving(true)
		try {
			// TODO: appel API createOrder({ lines, status: asDraft ? 'draft' : 'confirmed', paymentConditions, ... })
			await new Promise((r) => setTimeout(r, 600)) // simulation
			navigate({ to: '/connect/orders' })
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<ModulePageShell
			manifest={manifest}
			headerLeft={
				<Button
					variant='ghost'
					size='sm'
					onClick={() => navigate({ to: '/connect/orders' })}
				>
					<ArrowLeft className='h-4 w-4 mr-1.5' />
					Bons de commande
				</Button>
			}
		>
			<div className='max-w-4xl mx-auto space-y-6'>
				{/* ── En-tête ────────────────────────────────────────────── */}
				<div className='flex items-start justify-between gap-4'>
					<div>
						<h2 className='text-lg font-semibold'>Nouveau bon de commande</h2>
						<p className='text-sm text-muted-foreground mt-0.5'>
							Référence : <span className='font-mono'>{reference}</span>
							{isFromQuote && (
								<span className='ml-2 text-blue-600'>
									· Depuis devis #{search.sourceQuoteId}
								</span>
							)}
						</p>
					</div>
				</div>

				<div className='rounded-lg border bg-card divide-y'>
					{/* ── Client ──────────────────────────────────────────── */}
					<section className='p-5 space-y-3'>
						<h3 className='text-sm font-semibold text-foreground'>Client</h3>
						<div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
							<div className='space-y-1.5'>
								<Label htmlFor='customer'>Client *</Label>
								<Input
									id='customer'
									placeholder='Sélectionner ou saisir un client…'
									defaultValue={search.customerId ?? ''}
									// TODO: remplacer par un CustomerCombobox
								/>
							</div>
						</div>
					</section>

					{/* ── Lignes ─────────────────────────────────────────── */}
					<section className='p-5 space-y-3'>
						<h3 className='text-sm font-semibold text-foreground'>Lignes</h3>

						<div className='space-y-2'>
							{/* En-tête colonnes */}
							<div className='hidden sm:grid grid-cols-[1fr_80px_100px_80px_100px_36px] gap-2 text-xs text-muted-foreground font-medium px-1'>
								<span>Description</span>
								<span className='text-right'>Qté</span>
								<span className='text-right'>PU HT</span>
								<span className='text-right'>TVA</span>
								<span className='text-right'>Total HT</span>
								<span />
							</div>

							{lines.map((line, idx) => (
								<div
									key={line.id}
									className='grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_80px_100px_36px] gap-2 items-center'
								>
									<Input
										placeholder={`Article ou prestation ${idx + 1}`}
										value={line.description}
										onChange={(e) =>
											updateLine(line.id, 'description', e.target.value)
										}
									/>
									<Input
										type='number'
										min={0}
										step={1}
										className='text-right'
										value={line.quantity}
										onChange={(e) =>
											updateLine(line.id, 'quantity', Number(e.target.value))
										}
									/>
									<Input
										type='number'
										min={0}
										step={0.01}
										className='text-right'
										placeholder='0,00'
										value={line.unitPrice || ''}
										onChange={(e) =>
											updateLine(line.id, 'unitPrice', Number(e.target.value))
										}
									/>
									<Input
										type='number'
										min={0}
										max={1}
										step={0.01}
										className='text-right'
										placeholder='0.20'
										value={line.vatRate}
										onChange={(e) =>
											updateLine(line.id, 'vatRate', Number(e.target.value))
										}
									/>
									<div className='text-right text-sm font-medium py-2'>
										{formatAmount(line.totalHT)}
									</div>
									<Button
										variant='ghost'
										size='icon'
										className='h-8 w-8 text-muted-foreground hover:text-destructive'
										onClick={() => removeLine(line.id)}
										disabled={lines.length === 1}
									>
										<Trash2 className='h-4 w-4' />
									</Button>
								</div>
							))}
						</div>

						<Button
							variant='outline'
							size='sm'
							onClick={addLine}
							className='mt-2'
						>
							<Plus className='h-4 w-4 mr-1.5' />
							Ajouter une ligne
						</Button>
					</section>

					{/* ── Conditions ─────────────────────────────────────── */}
					<section className='p-5 grid grid-cols-1 sm:grid-cols-2 gap-4'>
						<div className='space-y-1.5'>
							<Label htmlFor='payment'>Conditions de paiement</Label>
							<Input
								id='payment'
								value={paymentConditions}
								onChange={(e) => setPaymentConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5'>
							<Label htmlFor='delivery'>Conditions de livraison</Label>
							<Input
								id='delivery'
								value={deliveryConditions}
								onChange={(e) => setDeliveryConditions(e.target.value)}
							/>
						</div>
						<div className='space-y-1.5 sm:col-span-2'>
							<Label htmlFor='notes'>Notes internes</Label>
							<Textarea
								id='notes'
								rows={2}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder='Remarques, informations complémentaires…'
							/>
						</div>
					</section>

					{/* ── Totaux ─────────────────────────────────────────── */}
					<section className='p-5'>
						<div className='flex justify-end'>
							<dl className='w-full max-w-xs space-y-1.5 text-sm'>
								<div className='flex justify-between'>
									<dt className='text-muted-foreground'>Total HT</dt>
									<dd className='font-medium'>{formatAmount(totalHT)}</dd>
								</div>
								<div className='flex justify-between'>
									<dt className='text-muted-foreground'>TVA</dt>
									<dd className='font-medium'>{formatAmount(totalTVA)}</dd>
								</div>
								<Separator />
								<div className='flex justify-between text-base font-semibold'>
									<dt>Total TTC</dt>
									<dd>{formatAmount(totalTTC)}</dd>
								</div>
							</dl>
						</div>
					</section>
				</div>

				{/* ── Actions ────────────────────────────────────────────── */}
				<div className='flex items-center justify-end gap-3'>
					<Button
						variant='outline'
						onClick={() => handleSave(true)}
						disabled={isSaving}
					>
						Enregistrer en brouillon
					</Button>
					<Button onClick={() => handleSave(false)} disabled={isSaving}>
						Confirmer le bon de commande
					</Button>
				</div>
			</div>
		</ModulePageShell>
	)
}
