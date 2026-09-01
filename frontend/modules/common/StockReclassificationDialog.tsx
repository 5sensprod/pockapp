// frontend/modules/common/StockReclassificationDialog.tsx
// Dialog de reclassification du stock après un remboursement.
// S'ouvre après validation financière (ticket ou facture).

import {
	AlertTriangle,
	Archive,
	CheckCircle2,
	Loader2,
	Package,
	PackageX,
	SkipForward,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

import { createProductEvent } from '@/lib/product-events/product-events-pocketbase'
import {
	type ReturnDestination as StockReturnDestination,
	applyStockMovements,
} from '@/lib/queries/stock-adjust'
import { useStockSync } from '@/lib/sync/stock-sync'
import { usePocketBase } from '@/lib/use-pocketbase'

// ============================================================================
// TYPES
// ============================================================================

export interface StockReclassificationItem {
	/** Identifiant du produit — clé PocketBase ou clé stable NeDB, résolue par
	 *  `applyStockMovements`. */
	product_id: string
	name: string
	quantity: number
	sku?: string
}

interface ItemChoice {
	destination: StockReturnDestination | 'skip'
}

export interface StockReclassificationDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Items remboursés portant un identifiant de produit */
	items: StockReclassificationItem[]
	/** Numéro du ticket ou de la facture, pour affichage et journalisation */
	documentNumber?: string
	/** ID du ticket ou de la facture source (pour product_events.source_id) */
	documentId?: string
	/** Appelé quand le traitement est terminé (succès ou ignoré) */
	onComplete?: () => void
}

// ============================================================================
// CONFIG DES DESTINATIONS
// ============================================================================

const DESTINATIONS: {
	value: StockReturnDestination | 'skip'
	label: string
	description: string
	icon: React.ComponentType<{ className?: string }>
	color: string
	badgeClass: string
}[] = [
	{
		value: 'restock',
		label: 'Remise en stock',
		description: 'Article en parfait état — retour en rayon',
		icon: Package,
		color: 'text-emerald-600',
		badgeClass: 'bg-emerald-50 border-emerald-200 text-emerald-700',
	},
	{
		value: 'sav',
		label: 'SAV / Défectueux',
		description: 'Article abîmé ou en panne — hors stock vendable',
		icon: PackageX,
		color: 'text-red-500',
		badgeClass: 'bg-red-50 border-red-200 text-red-700',
	},
	{
		value: 'stock_b',
		label: 'Stock B / Outlet',
		description: 'Fonctionnel mais ouvert — revente à prix réduit',
		icon: Archive,
		color: 'text-amber-500',
		badgeClass: 'bg-amber-50 border-amber-200 text-amber-700',
	},
	{
		value: 'skip',
		label: 'Ignorer',
		description: 'Ne pas modifier le stock pour cet article',
		icon: SkipForward,
		color: 'text-muted-foreground',
		badgeClass: 'bg-muted border-border text-muted-foreground',
	},
]

// ============================================================================
// COMPONENT
// ============================================================================

export function StockReclassificationDialog({
	open,
	onOpenChange,
	items,
	documentNumber,
	documentId,
	onComplete,
}: StockReclassificationDialogProps) {
	const pb = usePocketBase()
	// Un retour remis en stock change un chiffre que le site affiche : même
	// toast qu'après une vente, avec le mot juste.
	const { proposerApresMouvement } = useStockSync()

	const [choices, setChoices] = useState<Record<string, ItemChoice>>({})
	const [isProcessing, setIsProcessing] = useState(false)
	const [done, setDone] = useState(false)
	const [results, setResults] = useState<
		{ name: string; destination: StockReturnDestination | 'skip' }[]
	>([])

	useEffect(() => {
		if (open && items.length > 0) {
			setChoices(
				Object.fromEntries(
					items.map((it) => [
						it.product_id,
						{ destination: 'restock' as const },
					]),
				),
			)
			setDone(false)
			setResults([])
		}
	}, [open, items])

	const setDestination = (
		productId: string,
		destination: StockReturnDestination | 'skip',
	) => {
		setChoices((prev) => ({
			...prev,
			[productId]: { destination },
		}))
	}

	const handleConfirm = async () => {
		setIsProcessing(true)

		try {
			// Articles à traiter (tout sauf 'skip')
			const toProcess = items.filter(
				(it) => choices[it.product_id]?.destination !== 'skip',
			)

			if (toProcess.length > 0) {
				// Seul « restock » remet la marchandise en vente : SAV et Stock B la
				// sortent du stock vendable. Les trois se journalisent, mais un seul
				// bouge le stock — c'était déjà la règle côté AppPos, elle est
				// désormais lisible ici plutôt que dans l'API distante.
				const aRemettreEnStock = toProcess.filter(
					(it) => choices[it.product_id]?.destination === 'restock',
				)

				const resultats = await applyStockMovements(
					pb,
					aRemettreEnStock.map((it) => ({
						productId: it.product_id,
						delta: it.quantity,
						productName: it.name,
						productSku: it.sku ?? '',
						metadata: {
							destination: 'restock',
							quantity_returned: it.quantity,
						},
					})),
					{
						reason: 'return',
						sourceId: documentId ?? documentNumber ?? undefined,
						metadata: {
							ticket_id: documentId ?? documentNumber ?? '',
							document_number: documentNumber ?? '',
						},
					},
				)

				// Un produit introuvable ne doit pas passer inaperçu : 53 produits
				// vivent dans NeDB sans exister dans PocketBase (mesuré le 18 août
				// 2026), et la caisse en crée encore.
				const echecs = resultats.filter((r) => r.error)
				if (echecs.length > 0) {
					console.error('[retour] produits non retrouvés en base', echecs)
					toast.error(
						`${echecs.length} produit(s) introuvable(s) : stock non remis`,
					)
				}

				// ⚠️ SEUL « restock » est proposé au site. SAV et Stock B sortent la
				// marchandise du stock vendable : ils se journalisent, mais ne
				// changent aucun chiffre que la page publique affiche — proposer
				// l'envoi pour eux ferait repartir une fiche inchangée.
				//
				// Et on écarte les échecs : un produit dont le mouvement a été
				// refusé n'a pas de nouveau stock à exporter.
				const enEchec = new Set(echecs.map((r) => r.productId).filter(Boolean))
				const aProposer = aRemettreEnStock.filter(
					(it) => !enEchec.has(it.product_id),
				)
				if (aProposer.length > 0) {
					// Sans `await` : la journalisation SAV / Stock B suit juste après,
					// et elle ne s'attend pas derrière une lecture du site.
					void proposerApresMouvement(
						aProposer.map((it) => ({
							productId: it.product_id,
							productName: it.name,
						})),
						{
							reference: documentId ?? documentNumber ?? undefined,
							motif: 'retour',
						},
					)
				}

				// SAV et Stock B ne changent pas le stock vendable ; ils laissent
				// quand même une trace, sans quoi la marchandise disparaîtrait du
				// journal en même temps que du stock.
				const now = new Date().toISOString()
				for (const item of toProcess) {
					const destination = choices[item.product_id]
						.destination as StockReturnDestination
					if (destination === 'restock') continue

					try {
						await createProductEvent(pb, {
							product_id: item.product_id,
							product_name_snapshot: item.name,
							product_sku_snapshot: item.sku ?? '',
							event_type: 'stock_return',
							source: 'return',
							source_id: documentId ?? documentNumber ?? null,
							operator: '',
							occurred_at: now,
							before: null,
							after: null,
							delta: { stock: 0 },
							metadata: {
								ticket_id: documentId ?? documentNumber ?? '',
								document_number: documentNumber ?? '',
								destination,
								quantity_returned: item.quantity,
							},
						})
					} catch (journalErr: any) {
						console.warn(
							`[product_events] Échec journalisation retour ${item.product_id}:`,
							journalErr?.message ?? journalErr,
						)
					}
				}
			}

			// Résumé pour affichage
			const summary = items.map((it) => ({
				name: it.name,
				destination: choices[it.product_id]?.destination ?? 'skip',
			}))
			setResults(summary)
			setDone(true)

			const restocked = summary.filter(
				(r) => r.destination === 'restock',
			).length
			const sav = summary.filter((r) => r.destination === 'sav').length
			const stockB = summary.filter((r) => r.destination === 'stock_b').length

			const parts: string[] = []
			if (restocked > 0) parts.push(`${restocked} remis en stock`)
			if (sav > 0) parts.push(`${sav} en SAV`)
			if (stockB > 0) parts.push(`${stockB} en Stock B`)

			toast.success('Stock mis à jour', {
				description: parts.join(' · ') || 'Aucune modification de stock',
			})
		} catch (error: any) {
			toast.error('Erreur mise à jour stock', {
				description: error?.message || 'Une erreur est survenue',
			})
		} finally {
			setIsProcessing(false)
		}
	}

	const handleClose = () => {
		onComplete?.()
		onOpenChange(false)
	}

	if (items.length === 0) return null

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
			<DialogContent className='max-w-2xl'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Package className='h-5 w-5 text-orange-500' />
						Reclassification du stock
					</DialogTitle>
					<DialogDescription>
						{documentNumber ? (
							<>
								Remboursement{' '}
								<span className='font-medium text-foreground'>
									{documentNumber}
								</span>{' '}
								— que faire des articles retournés ?
							</>
						) : (
							'Définissez le devenir de chaque article retourné.'
						)}
					</DialogDescription>
				</DialogHeader>

				{!done ? (
					<>
						<div className='space-y-3 max-h-[60vh] overflow-y-auto pr-1'>
							{items.map((item) => {
								const current =
									choices[item.product_id]?.destination ?? 'restock'
								return (
									<div
										key={item.product_id}
										className='rounded-lg border bg-card p-4 space-y-3'
									>
										<div className='flex items-start justify-between gap-3'>
											<div>
												<div className='font-medium text-sm leading-tight'>
													{item.name}
												</div>
												<div className='text-xs text-muted-foreground mt-0.5'>
													{item.sku && (
														<span className='mr-2'>SKU: {item.sku}</span>
													)}
													<span>
														Qté retournée :{' '}
														<span className='font-semibold text-foreground'>
															{item.quantity}
														</span>
													</span>
												</div>
											</div>
											{(() => {
												const dest = DESTINATIONS.find(
													(d) => d.value === current,
												)
												return dest ? (
													<Badge
														variant='outline'
														className={cn('text-xs shrink-0', dest.badgeClass)}
													>
														{dest.label}
													</Badge>
												) : null
											})()}
										</div>

										<div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
											{DESTINATIONS.map((dest) => {
												const Icon = dest.icon
												const selected = current === dest.value
												return (
													<button
														key={dest.value}
														type='button'
														onClick={() =>
															setDestination(item.product_id, dest.value)
														}
														disabled={isProcessing}
														className={cn(
															'flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-center transition-all',
															'hover:bg-muted/60 cursor-pointer',
															selected
																? 'border-primary bg-primary/5 ring-1 ring-primary'
																: 'border-border bg-card',
															isProcessing && 'opacity-50 cursor-not-allowed',
														)}
													>
														<Icon
															className={cn(
																'h-4 w-4',
																selected ? 'text-primary' : dest.color,
															)}
														/>
														<span
															className={cn(
																'text-xs font-medium leading-tight',
																selected
																	? 'text-primary'
																	: 'text-muted-foreground',
															)}
														>
															{dest.label}
														</span>
													</button>
												)
											})}
										</div>

										<div className='text-xs text-muted-foreground italic'>
											{DESTINATIONS.find((d) => d.value === current)
												?.description ?? ''}
										</div>
									</div>
								)
							})}
						</div>

						{Object.values(choices).some(
							(c) => c.destination === 'sav' || c.destination === 'stock_b',
						) && (
							<div className='flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800'>
								<AlertTriangle className='h-4 w-4 shrink-0 mt-0.5 text-amber-500' />
								<span>
									Les articles SAV et Stock B ne modifient pas le stock vendable
									standard. Leur traitement physique doit être géré séparément.
								</span>
							</div>
						)}

						<DialogFooter>
							<Button
								variant='outline'
								onClick={handleClose}
								disabled={isProcessing}
							>
								Ignorer tout
							</Button>
							<Button onClick={handleConfirm} disabled={isProcessing}>
								{isProcessing ? (
									<>
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										Traitement…
									</>
								) : (
									'Confirmer la reclassification'
								)}
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<div className='flex flex-col items-center gap-4 py-4'>
							<CheckCircle2 className='h-12 w-12 text-emerald-500' />
							<div className='text-center'>
								<div className='font-semibold text-lg'>Stock mis à jour</div>
								<div className='text-sm text-muted-foreground mt-1'>
									Reclassification terminée pour {results.length} article
									{results.length > 1 ? 's' : ''}
								</div>
							</div>
						</div>

						<Separator />

						<div className='space-y-2 max-h-[40vh] overflow-y-auto'>
							{results.map((r) => {
								const dest = DESTINATIONS.find((d) => d.value === r.destination)
								const Icon = dest?.icon ?? Package
								return (
									<div
										key={`${r.name}-${r.destination}`}
										className='flex items-center justify-between text-sm py-1.5'
									>
										<span className='text-muted-foreground truncate mr-4'>
											{r.name}
										</span>
										<Badge
											variant='outline'
											className={cn('shrink-0 text-xs', dest?.badgeClass)}
										>
											<Icon className='h-3 w-3 mr-1' />
											{dest?.label ?? r.destination}
										</Badge>
									</div>
								)
							})}
						</div>

						<DialogFooter>
							<Button onClick={handleClose} className='w-full sm:w-auto'>
								Fermer
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
