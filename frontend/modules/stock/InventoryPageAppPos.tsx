// frontend/modules/stock/InventoryPageAppPos.tsx
// Page d'inventaire physique AppPOS
// Vues : accueil → création session → liste catégories → comptage → validation

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { useAppPosCategories } from '@/lib/apppos'
import type {
	CategoryInventorySummary,
	InventoryEntry,
	InventorySession,
} from '@/lib/inventory/inventory-types'
import {
	useActiveInventorySession,
	useCreateInventorySession,
	useInventoryHistory,
	useInventorySession,
} from '@/lib/inventory/useInventorySession'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	ChevronRight,
	ClipboardList,
	Clock,
	History,
	Loader2,
	Lock,
	MinusCircle,
	PlusCircle,
	RotateCcw,
	Sparkles,
	X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

// ============================================================================
// TYPES LOCAUX
// ============================================================================
type PageView = 'home' | 'overview' | 'counting' | 'history'

// ============================================================================
// HELPERS VISUELS
// ============================================================================
function CategoryStatusIcon({
	status,
}: { status: CategoryInventorySummary['status'] }) {
	if (status === 'validated')
		return <Lock className='h-4 w-4 text-muted-foreground' />
	if (status === 'counted')
		return <CheckCircle2 className='h-4 w-4 text-green-500' />
	if (status === 'in_progress')
		return <div className='h-4 w-4 rounded-full bg-blue-500 animate-pulse' />
	return (
		<div className='h-4 w-4 rounded-full border-2 border-muted-foreground/30' />
	)
}

function CategoryStatusBadge({
	status,
}: { status: CategoryInventorySummary['status'] }) {
	const map = {
		validated: { label: 'Validé', class: 'bg-muted text-muted-foreground' },
		counted: {
			label: 'Compté',
			class:
				'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		},
		in_progress: {
			label: 'En cours',
			class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		},
		todo: { label: 'À faire', class: 'bg-muted/50 text-muted-foreground' },
	}
	const { label, class: cls } = map[status]
	return (
		<span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', cls)}>
			{label}
		</span>
	)
}

function EcartBadge({ ecart }: { ecart: number }) {
	if (ecart === 0)
		return <span className='text-muted-foreground text-sm'>= 0</span>
	if (ecart > 0)
		return (
			<span className='flex items-center gap-0.5 text-sm font-semibold text-green-600'>
				<PlusCircle className='h-3.5 w-3.5' />
				{ecart}
			</span>
		)
	return (
		<span className='flex items-center gap-0.5 text-sm font-semibold text-red-500'>
			<MinusCircle className='h-3.5 w-3.5' />
			{Math.abs(ecart)}
		</span>
	)
}

// ============================================================================
// VUE ACCUEIL — pas de session active
// ============================================================================
function InventoryHomeView({
	onStart,
	isStarting,
}: {
	onStart: () => void
	isStarting: boolean
}) {
	return (
		<div className='flex flex-col items-center justify-center h-full min-h-[500px] gap-8'>
			<div className='text-center max-w-md'>
				<div className='w-20 h-20 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-6'>
					<ClipboardList className='h-10 w-10 text-orange-500' />
				</div>
				<h2 className='text-2xl font-bold mb-2'>Inventaire physique</h2>
				<p className='text-muted-foreground'>
					Comptez vos stocks rayon par rayon. Les écarts sont appliqués
					automatiquement dans AppPOS à la validation.
				</p>
			</div>

			<Button
				size='lg'
				className='gap-2 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 px-8'
				onClick={onStart}
				disabled={isStarting}
			>
				{isStarting ? (
					<Loader2 className='h-4 w-4 animate-spin' />
				) : (
					<Sparkles className='h-4 w-4' />
				)}
				Démarrer un inventaire
			</Button>

			<div className='flex gap-8 text-center text-sm text-muted-foreground'>
				<div>
					<div className='font-semibold text-foreground text-lg'>1</div>
					<div>Sélectionner le périmètre</div>
				</div>
				<div className='border-l' />
				<div>
					<div className='font-semibold text-foreground text-lg'>2</div>
					<div>Compter rayon par rayon</div>
				</div>
				<div className='border-l' />
				<div>
					<div className='font-semibold text-foreground text-lg'>3</div>
					<div>Valider et appliquer les écarts</div>
				</div>
			</div>
		</div>
	)
}

// ============================================================================
// DIALOG CRÉATION SESSION
// ============================================================================
function CreateSessionDialog({
	open,
	onClose,
	onConfirm,
	isLoading,
}: {
	open: boolean
	onClose: () => void
	onConfirm: (
		operator: string,
		scope: 'all' | 'selection',
		categoryIds: string[],
	) => void
	isLoading: boolean
}) {
	const [operator, setOperator] = useState('')
	const [scope, setScope] = useState<'all' | 'selection'>('all')
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

	const { data: categories = [] } = useAppPosCategories()

	const toggleCategory = (id: string) => {
		setSelectedCategoryIds((prev) =>
			prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
		)
	}

	const canConfirm =
		operator.trim().length > 0 &&
		(scope === 'all' || selectedCategoryIds.length > 0)

	const handleConfirm = () => {
		if (!canConfirm) return
		onConfirm(
			operator.trim(),
			scope,
			scope === 'all' ? [] : selectedCategoryIds,
		)
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className='max-w-lg max-h-[85vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<ClipboardList className='h-5 w-5 text-orange-500' />
						Nouvel inventaire
					</DialogTitle>
				</DialogHeader>

				<div className='flex-1 overflow-y-auto space-y-5 py-2'>
					{/* Opérateur */}
					<div className='space-y-1.5'>
						<Label>Opérateur</Label>
						<Input
							placeholder='Votre nom...'
							value={operator}
							onChange={(e) => setOperator(e.target.value)}
							autoFocus
						/>
					</div>

					<Separator />

					{/* Périmètre */}
					<div className='space-y-3'>
						<Label>Périmètre</Label>
						<div className='grid grid-cols-2 gap-3'>
							<button
								type='button'
								onClick={() => setScope('all')}
								className={cn(
									'rounded-lg border-2 p-4 text-left transition-all',
									scope === 'all'
										? 'border-orange-500 bg-orange-500/5'
										: 'border-border hover:border-muted-foreground/50',
								)}
							>
								<div className='font-medium text-sm mb-0.5'>
									Catalogue complet
								</div>
								<div className='text-xs text-muted-foreground'>
									Tous les produits AppPOS
								</div>
							</button>
							<button
								type='button'
								onClick={() => setScope('selection')}
								className={cn(
									'rounded-lg border-2 p-4 text-left transition-all',
									scope === 'selection'
										? 'border-orange-500 bg-orange-500/5'
										: 'border-border hover:border-muted-foreground/50',
								)}
							>
								<div className='font-medium text-sm mb-0.5'>Sélection</div>
								<div className='text-xs text-muted-foreground'>
									Choisir les catégories
								</div>
							</button>
						</div>
					</div>

					{/* Sélection catégories */}
					{scope === 'selection' && (
						<div className='space-y-2'>
							<Label>
								Catégories{' '}
								<span className='text-muted-foreground font-normal'>
									({selectedCategoryIds.length} sélectionnée
									{selectedCategoryIds.length > 1 ? 's' : ''})
								</span>
							</Label>
							<div className='border rounded-lg divide-y max-h-52 overflow-y-auto'>
								{categories.map((cat) => (
									<label
										key={cat.id}
										className='flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer'
									>
										<input
											type='checkbox'
											checked={selectedCategoryIds.includes(cat.id)}
											onChange={() => toggleCategory(cat.id)}
											className='rounded accent-orange-500'
										/>
										<span className='text-sm'>{cat.name}</span>
									</label>
								))}
								{categories.length === 0 && (
									<div className='px-3 py-4 text-sm text-muted-foreground text-center'>
										Chargement des catégories...
									</div>
								)}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className='pt-2'>
					<Button variant='ghost' onClick={onClose} disabled={isLoading}>
						Annuler
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!canConfirm || isLoading}
						className='bg-orange-500 hover:bg-orange-600 text-white gap-2'
					>
						{isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
						Démarrer le comptage
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ============================================================================
// VUE OVERVIEW — liste des catégories avec progression
// ============================================================================
function SessionOverviewView({
	session,
	summary,
	onSelectCategory,
	onComplete,
	onCancel,
	isCompleting,
	isCancelling,
}: {
	session: InventorySession
	summary: NonNullable<ReturnType<typeof useInventorySession>['summary']>
	onSelectCategory: (categoryId: string) => void
	onComplete: () => void
	onCancel: () => void
	isCompleting: boolean
	isCancelling: boolean
}) {
	const isValidated = (catId: string) =>
		session.validated_category_ids?.includes(catId) ?? false

	const categoriesWithValidation = summary.categories.map((c) => ({
		...c,
		status: isValidated(c.categoryId) ? ('validated' as const) : c.status,
	}))

	return (
		<div className='flex flex-col h-full'>
			{/* Header session */}
			<div className='px-6 py-4 border-b'>
				<div className='flex items-center justify-between'>
					<div>
						<div className='flex items-center gap-2 mb-0.5'>
							<h2 className='text-lg font-semibold'>
								Inventaire du{' '}
								{new Date(session.started_at).toLocaleDateString('fr-FR', {
									day: '2-digit',
									month: '2-digit',
									year: 'numeric',
								})}
							</h2>
							<Badge
								variant='outline'
								className='text-orange-600 border-orange-300 text-xs'
							>
								En cours
							</Badge>
						</div>
						<p className='text-sm text-muted-foreground'>
							Opérateur : {session.operator}
						</p>
					</div>
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={onCancel}
							disabled={isCancelling || isCompleting}
							className='text-muted-foreground hover:text-destructive gap-1.5'
						>
							{isCancelling ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<X className='h-3.5 w-3.5' />
							)}
							Annuler
						</Button>
						<Button
							size='sm'
							onClick={onComplete}
							disabled={!summary.canComplete || isCompleting || isCancelling}
							className='bg-green-600 hover:bg-green-700 text-white gap-1.5'
						>
							{isCompleting ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
							) : (
								<CheckCircle2 className='h-3.5 w-3.5' />
							)}
							Clôturer l'inventaire
						</Button>
					</div>
				</div>

				{/* Barre de progression globale */}
				<div className='mt-4'>
					<div className='flex justify-between text-xs text-muted-foreground mb-1.5'>
						<span>
							{summary.countedProducts} / {summary.totalProducts} produits
							comptés
						</span>
						<span className='font-medium text-foreground'>
							{summary.progressPercent}%
						</span>
					</div>
					<Progress value={summary.progressPercent} className='h-2' />
				</div>

				{/* Stats rapides */}
				<div className='flex gap-4 mt-3 text-sm'>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<CheckCircle2 className='h-3.5 w-3.5 text-green-500' />
						{summary.validatedCategories} validée
						{summary.validatedCategories > 1 ? 's' : ''}
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<AlertTriangle className='h-3.5 w-3.5 text-amber-500' />
						{summary.totalGaps.length} écart
						{summary.totalGaps.length > 1 ? 's' : ''} détecté
						{summary.totalGaps.length > 1 ? 's' : ''}
					</div>
					<div className='flex items-center gap-1.5 text-muted-foreground'>
						<Clock className='h-3.5 w-3.5' />
						{summary.pendingProducts} restant
						{summary.pendingProducts > 1 ? 's' : ''}
					</div>
				</div>
			</div>

			{/* Liste des catégories */}
			<div className='flex-1 overflow-y-auto divide-y'>
				{categoriesWithValidation.map((cat) => {
					const validated = cat.status === 'validated'
					return (
						<button
							key={cat.categoryId}
							type='button'
							disabled={validated}
							onClick={() => !validated && onSelectCategory(cat.categoryId)}
							className={cn(
								'w-full flex items-center gap-4 px-6 py-4 text-left transition-colors',
								validated
									? 'opacity-60 cursor-default'
									: 'hover:bg-muted/50 cursor-pointer',
							)}
						>
							<CategoryStatusIcon status={cat.status} />

							<div className='flex-1 min-w-0'>
								<div className='flex items-center gap-2 mb-0.5'>
									<span className='font-medium text-sm'>
										{cat.categoryName}
									</span>
									{cat.totalGapCount > 0 && (
										<span className='flex items-center gap-0.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full'>
											<AlertTriangle className='h-3 w-3' />
											{cat.totalGapCount} écart
											{cat.totalGapCount > 1 ? 's' : ''}
										</span>
									)}
								</div>
								<div className='text-xs text-muted-foreground'>
									{cat.countedProducts}/{cat.totalProducts} produits
								</div>
							</div>

							<div className='flex items-center gap-3'>
								{/* Mini progress par catégorie */}
								<div className='w-24 hidden sm:block'>
									<Progress
										value={
											cat.totalProducts > 0
												? (cat.countedProducts / cat.totalProducts) * 100
												: 0
										}
										className='h-1.5'
									/>
								</div>
								<CategoryStatusBadge status={cat.status} />
								{!validated && (
									<ChevronRight className='h-4 w-4 text-muted-foreground' />
								)}
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}

// ============================================================================
// COMPOSANT LIGNE DE COMPTAGE — extrait pour respecter les règles des hooks
// ============================================================================
function CountingRow({
	entry,
	isValidated,
	isCountingProduct,
	onSave,
	onReset,
}: {
	entry: InventoryEntry
	isValidated: boolean
	isCountingProduct: boolean
	onSave: (entryId: string, value: number) => void
	onReset: (entryId: string) => void
}) {
	const [localValue, setLocalValue] = useState(
		entry.status === 'counted' && entry.stock_compte !== null
			? String(entry.stock_compte)
			: '',
	)

	const isCounted = entry.status === 'counted'
	const ecart =
		isCounted && entry.stock_compte !== null
			? entry.stock_compte - entry.stock_theorique
			: null

	const handleSave = () => {
		if (localValue === '') return
		const val = Number.parseInt(localValue, 10)
		if (Number.isNaN(val) || val < 0) return
		onSave(entry.id, val)
	}

	// Sync la valeur locale si l'entry change depuis le serveur
	useEffect(() => {
		if (entry.status === 'counted' && entry.stock_compte !== null) {
			setLocalValue(String(entry.stock_compte))
		}
	}, [entry.status, entry.stock_compte])

	return (
		<tr
			className={cn(
				'transition-colors',
				isCounted ? 'bg-muted/20' : 'hover:bg-muted/30',
			)}
		>
			{/* Nom produit */}
			<td className='px-6 py-3'>
				<div className='flex items-center gap-2.5'>
					<div
						className={cn(
							'w-2 h-2 rounded-full shrink-0',
							isCounted ? 'bg-green-500' : 'bg-muted-foreground/30',
						)}
					/>
					<div className='min-w-0'>
						<div className='font-medium truncate max-w-xs'>
							{entry.product_name}
						</div>
						{entry.product_sku && (
							<div className='text-xs text-muted-foreground'>
								{entry.product_sku}
							</div>
						)}
					</div>
				</div>
			</td>

			{/* Stock théorique */}
			<td className='px-3 py-3 text-center'>
				<span className='text-muted-foreground font-mono'>
					{entry.stock_theorique}
				</span>
			</td>

			{/* Input comptage */}
			<td className='px-3 py-3 text-center'>
				{isValidated ? (
					<span className='font-mono font-medium'>
						{entry.stock_compte ?? '—'}
					</span>
				) : (
					<Input
						type='number'
						min={0}
						placeholder='—'
						value={localValue}
						onChange={(e) => setLocalValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleSave()
						}}
						onBlur={handleSave}
						className={cn(
							'w-20 h-8 text-center font-mono text-sm',
							isCounted
								? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
								: '',
						)}
						disabled={isCountingProduct}
					/>
				)}
			</td>

			{/* Écart */}
			<td className='px-3 py-3 text-center'>
				{ecart !== null ? (
					<EcartBadge ecart={ecart} />
				) : (
					<span className='text-muted-foreground/40 text-sm'>…</span>
				)}
			</td>

			{/* Reset */}
			{!isValidated && (
				<td className='px-3 py-3 text-center'>
					{isCounted && (
						<button
							type='button'
							onClick={() => onReset(entry.id)}
							className='text-muted-foreground hover:text-foreground transition-colors'
							title='Réinitialiser'
						>
							<RotateCcw className='h-3.5 w-3.5' />
						</button>
					)}
				</td>
			)}
		</tr>
	)
}

function CategoryCountingView({
	sessionId,
	session,
	categoryId,
	categoryName,
	onBack,
}: {
	sessionId: string
	session: InventorySession
	categoryId: string
	categoryName: string
	onBack: () => void
}) {
	const {
		entries,
		entriesLoading,
		countProduct,
		resetProduct,
		validateCategory,
		isCountingProduct,
		isValidatingCategory,
		validateError,
	} = useInventorySession(sessionId)

	const [showValidateDialog, setShowValidateDialog] = useState(false)
	const [lastAdjustmentResult, setLastAdjustmentResult] = useState<null | {
		adjustedCount: number
		skippedCount: number
		errors: { productId: string; productName: string; error: string }[]
	}>(null)

	const catEntries = entries.filter((e) => e.category_id === categoryId)
	const isValidated =
		session.validated_category_ids?.includes(categoryId) ?? false
	const allCounted =
		catEntries.length > 0 && catEntries.every((e) => e.status === 'counted')

	const gaps = catEntries.filter((e) => {
		if (e.status !== 'counted' || e.stock_compte === null) return false
		return e.stock_compte !== e.stock_theorique
	})

	const handleValidate = async () => {
		try {
			const result = await validateCategory(categoryId)
			setLastAdjustmentResult(result)
			setShowValidateDialog(false)
		} catch {
			// L'erreur est accessible via validateError
		}
	}

	if (entriesLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
			</div>
		)
	}

	// Résumé post-validation
	if (lastAdjustmentResult) {
		return (
			<div className='flex flex-col items-center justify-center h-full gap-6 px-6'>
				<div className='w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center'>
					<CheckCircle2 className='h-8 w-8 text-green-500' />
				</div>
				<div className='text-center'>
					<h3 className='text-lg font-semibold mb-1'>Catégorie validée</h3>
					<p className='text-muted-foreground text-sm'>
						{lastAdjustmentResult.adjustedCount} ajustement
						{lastAdjustmentResult.adjustedCount > 1 ? 's' : ''} appliqué
						{lastAdjustmentResult.adjustedCount > 1 ? 's' : ''} dans AppPOS
						{lastAdjustmentResult.skippedCount > 0 &&
							` · ${lastAdjustmentResult.skippedCount} sans écart`}
					</p>
				</div>
				{lastAdjustmentResult.errors.length > 0 && (
					<div className='w-full max-w-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400'>
						<p className='font-medium mb-1'>Erreurs lors de l'ajustement :</p>
						{lastAdjustmentResult.errors.map((e) => (
							<p key={e.productId}>
								• {e.productName} : {e.error}
							</p>
						))}
					</div>
				)}
				<Button onClick={onBack} className='gap-2'>
					<ArrowLeft className='h-4 w-4' />
					Retour aux catégories
				</Button>
			</div>
		)
	}

	return (
		<div className='flex flex-col h-full'>
			{/* Header catégorie */}
			<div className='px-6 py-4 border-b flex items-center gap-4'>
				<Button variant='ghost' size='sm' onClick={onBack} className='gap-1.5'>
					<ArrowLeft className='h-4 w-4' />
					Retour
				</Button>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2'>
						<h2 className='font-semibold text-lg truncate'>{categoryName}</h2>
						{isValidated && (
							<Badge variant='outline' className='text-xs gap-1'>
								<Lock className='h-3 w-3' />
								Validée
							</Badge>
						)}
					</div>
					<p className='text-xs text-muted-foreground'>
						{catEntries.filter((e) => e.status === 'counted').length}/
						{catEntries.length} produits comptés
						{gaps.length > 0 && (
							<span className='ml-2 text-amber-600'>
								· {gaps.length} écart{gaps.length > 1 ? 's' : ''}
							</span>
						)}
					</p>
				</div>
				{!isValidated && allCounted && (
					<Button
						size='sm'
						onClick={() => setShowValidateDialog(true)}
						className='bg-green-600 hover:bg-green-700 text-white gap-1.5 shrink-0'
					>
						<CheckCircle2 className='h-3.5 w-3.5' />
						Valider
					</Button>
				)}
			</div>

			{validateError && (
				<div className='mx-6 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400'>
					{(validateError as Error).message}
				</div>
			)}

			{/* Tableau produits */}
			<div className='flex-1 overflow-y-auto'>
				<table className='w-full text-sm'>
					<thead className='sticky top-0 bg-background border-b'>
						<tr className='text-xs text-muted-foreground'>
							<th className='text-left px-6 py-3 font-medium'>Produit</th>
							<th className='text-center px-3 py-3 font-medium w-24'>
								Théorique
							</th>
							<th className='text-center px-3 py-3 font-medium w-32'>Compté</th>
							<th className='text-center px-3 py-3 font-medium w-20'>Écart</th>
							{!isValidated && <th className='w-10 px-3 py-3' />}
						</tr>
					</thead>
					<tbody className='divide-y'>
						{catEntries.map((entry) => (
							<CountingRow
								key={entry.id}
								entry={entry}
								isValidated={isValidated}
								isCountingProduct={isCountingProduct}
								onSave={(entryId, value) => countProduct(entryId, value)}
								onReset={(entryId) => resetProduct(entryId)}
							/>
						))}
					</tbody>
				</table>
			</div>

			{/* Dialog de validation */}
			<Dialog open={showValidateDialog} onOpenChange={setShowValidateDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Valider {categoryName}</DialogTitle>
					</DialogHeader>
					<div className='py-2 space-y-3'>
						<p className='text-sm text-muted-foreground'>
							{gaps.length === 0 ? (
								<>
									Aucun écart détecté — tous les stocks sont conformes. La
									catégorie sera verrouillée.
								</>
							) : (
								<>
									<span className='font-medium text-amber-600'>
										{gaps.length} écart{gaps.length > 1 ? 's' : ''} détecté
										{gaps.length > 1 ? 's' : ''}
									</span>{' '}
									— les stocks AppPOS seront mis à jour, puis la catégorie sera
									verrouillée.
								</>
							)}
						</p>
						{gaps.length > 0 && (
							<div className='border rounded-lg divide-y max-h-48 overflow-y-auto text-sm'>
								{gaps.map((e) => {
									const ecart = (e.stock_compte ?? 0) - e.stock_theorique
									return (
										<div
											key={e.id}
											className='flex items-center justify-between px-3 py-2'
										>
											<span className='truncate text-muted-foreground'>
												{e.product_name}
											</span>
											<div className='flex items-center gap-3 shrink-0 ml-4'>
												<span className='font-mono text-xs text-muted-foreground'>
													{e.stock_theorique} → {e.stock_compte}
												</span>
												<EcartBadge ecart={ecart} />
											</div>
										</div>
									)
								})}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant='ghost'
							onClick={() => setShowValidateDialog(false)}
							disabled={isValidatingCategory}
						>
							Annuler
						</Button>
						<Button
							onClick={handleValidate}
							disabled={isValidatingCategory}
							className='bg-green-600 hover:bg-green-700 text-white gap-2'
						>
							{isValidatingCategory && (
								<Loader2 className='h-4 w-4 animate-spin' />
							)}
							Confirmer et verrouiller
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

// ============================================================================
// VUE HISTORIQUE — sessions complétées/annulées
// ============================================================================
function InventoryHistoryView({ onBack }: { onBack: () => void }) {
	const { data, isLoading } = useInventoryHistory()
	const sessions = data?.items ?? []
	const [expandedId, setExpandedId] = useState<string | null>(null)

	function formatDuration(startedAt: string, completedAt: string | null) {
		if (!completedAt) return null
		const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
		const totalMin = Math.round(ms / 60000)
		if (totalMin < 60) return `${totalMin} min`
		const h = Math.floor(totalMin / 60)
		const m = totalMin % 60
		return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`
	}

	return (
		<div className='flex flex-col h-full'>
			<div className='px-6 py-4 border-b flex items-center gap-4'>
				<Button variant='ghost' size='sm' onClick={onBack} className='gap-1.5'>
					<ArrowLeft className='h-4 w-4' />
					Retour
				</Button>
				<h2 className='font-semibold text-lg'>Historique des inventaires</h2>
				<span className='text-xs text-muted-foreground ml-auto'>
					{sessions.length} session{sessions.length > 1 ? 's' : ''}
				</span>
			</div>

			<div className='flex-1 overflow-y-auto'>
				{isLoading ? (
					<div className='flex items-center justify-center h-40'>
						<Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
					</div>
				) : sessions.length === 0 ? (
					<div className='flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground'>
						<History className='h-10 w-10 opacity-30' />
						<p className='text-sm'>Aucun inventaire complété pour l'instant</p>
					</div>
				) : (
					<div className='divide-y'>
						{sessions.map((session) => {
							const isExpanded = expandedId === session.id
							const duration = formatDuration(
								session.started_at,
								session.completed_at,
							)
							const hasStats = session.stats_total_products != null
							const categoryNames: string[] = session.stats_category_names ?? []
							const gapCount = session.stats_total_gaps ?? 0
							const totalProducts = session.stats_total_products ?? 0
							const countedProducts = session.stats_counted_products ?? 0
							const progressPct =
								totalProducts > 0
									? Math.round((countedProducts / totalProducts) * 100)
									: 0

							return (
								<div
									key={session.id}
									className='hover:bg-muted/20 transition-colors'
								>
									{/* Ligne principale */}
									<button
										type='button'
										className='w-full flex items-center gap-4 px-6 py-4 text-left'
										onClick={() =>
											setExpandedId(isExpanded ? null : session.id)
										}
									>
										{/* Icône statut */}
										<div
											className={cn(
												'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
												session.status === 'completed'
													? 'bg-green-500/10'
													: 'bg-muted',
											)}
										>
											{session.status === 'completed' ? (
												<CheckCircle2 className='h-5 w-5 text-green-500' />
											) : (
												<X className='h-5 w-5 text-muted-foreground' />
											)}
										</div>

										{/* Infos principales */}
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2 mb-1'>
												<span className='font-medium text-sm'>
													Inventaire du{' '}
													{new Date(session.started_at).toLocaleDateString(
														'fr-FR',
														{
															day: '2-digit',
															month: 'long',
															year: 'numeric',
														},
													)}
												</span>
												<span
													className={cn(
														'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
														session.status === 'completed'
															? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
															: 'bg-muted text-muted-foreground',
													)}
												>
													{session.status === 'completed'
														? 'Complété'
														: 'Annulé'}
												</span>
											</div>

											{/* Méta-infos ligne 1 */}
											<div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground'>
												<span className='flex items-center gap-1'>
													<span className='font-medium text-foreground/70'>
														{session.operator}
													</span>
												</span>
												<span>·</span>
												<span>
													{session.scope === 'all'
														? 'Catalogue complet'
														: `${session.scope_category_ids?.length ?? 0} catégorie(s) sélectionnée(s)`}
												</span>
												{duration && (
													<>
														<span>·</span>
														<span className='flex items-center gap-0.5'>
															<Clock className='h-3 w-3' />
															{duration}
														</span>
													</>
												)}
											</div>

											{/* Stats dénormalisées si disponibles */}
											{hasStats && (
												<div className='flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs mt-1'>
													<span className='text-muted-foreground'>
														<span className='font-semibold text-foreground/80'>
															{totalProducts}
														</span>{' '}
														produit{totalProducts > 1 ? 's' : ''}
													</span>
													<span className='text-muted-foreground'>·</span>
													<span className='text-muted-foreground'>
														<span className='font-semibold text-foreground/80'>
															{progressPct}%
														</span>{' '}
														compté{progressPct < 100 ? '' : ''}
													</span>
													{gapCount > 0 ? (
														<>
															<span className='text-muted-foreground'>·</span>
															<span className='flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium'>
																<AlertTriangle className='h-3 w-3' />
																{gapCount} écart{gapCount > 1 ? 's' : ''}
															</span>
														</>
													) : (
														<>
															<span className='text-muted-foreground'>·</span>
															<span className='flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium'>
																<CheckCircle2 className='h-3 w-3' />
																Aucun écart
															</span>
														</>
													)}
												</div>
											)}
										</div>

										{/* Chevron expand */}
										{(hasStats && categoryNames.length > 0) || session.notes ? (
											<ChevronRight
												className={cn(
													'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
													isExpanded && 'rotate-90',
												)}
											/>
										) : null}
									</button>

									{/* Panneau expansible — catégories + notes */}
									{isExpanded && (
										<div className='px-6 pb-4 pl-20 space-y-3'>
											{/* Catégories inventoriées */}
											{categoryNames.length > 0 && (
												<div>
													<p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'>
														Catégories inventoriées ({categoryNames.length})
													</p>
													<div className='flex flex-wrap gap-1.5'>
														{categoryNames.map((name) => (
															<span
																key={name}
																className='text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground'
															>
																{name}
															</span>
														))}
													</div>
												</div>
											)}

											{/* Notes */}
											{session.notes && (
												<div>
													<p className='text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1'>
														Notes
													</p>
													<p className='text-sm text-muted-foreground italic'>
														{session.notes}
													</p>
												</div>
											)}

											{/* Date de clôture */}
											{session.completed_at && (
												<p className='text-xs text-muted-foreground'>
													Clôturé le{' '}
													{new Date(session.completed_at).toLocaleDateString(
														'fr-FR',
														{
															day: '2-digit',
															month: '2-digit',
															year: 'numeric',
															hour: '2-digit',
															minute: '2-digit',
														},
													)}
												</p>
											)}
										</div>
									)}
								</div>
							)
						})}
					</div>
				)}
			</div>
		</div>
	)
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================
export function InventoryPageAppPos() {
	const [view, setView] = useState<PageView>('home')
	const [showCreateDialog, setShowCreateDialog] = useState(false)
	const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
	const [activeCategoryName, setActiveCategoryName] = useState('')

	// Session active
	const { data: activeSession, isLoading: sessionLoading } =
		useActiveInventorySession()

	const createSession = useCreateInventorySession()
	const { progress: creationProgress } = createSession

	const sessionId = activeSession?.id
	const {
		summary,
		entriesLoading,
		completeSession,
		cancelSession,
		isCompletingSession,
		isCancellingSession,
	} = useInventorySession(sessionId)

	// Rediriger automatiquement vers overview si une session est active
	const SESSION_VIEWS: PageView[] = ['overview', 'counting']

	useEffect(() => {
		if (activeSession && view === 'home') {
			setView('overview')
		} else if (
			!activeSession &&
			!sessionLoading &&
			SESSION_VIEWS.includes(view)
		) {
			setView('home')
		}
	}, [activeSession, sessionLoading, view])

	const handleCreateConfirm = async (
		operator: string,
		scope: 'all' | 'selection',
		categoryIds: string[],
	) => {
		await createSession.mutateAsync({
			operator,
			scope,
			scope_category_ids: categoryIds,
		})
		setShowCreateDialog(false)
		setView('overview')
	}

	const handleSelectCategory = (catId: string, catName: string) => {
		setActiveCategoryId(catId)
		setActiveCategoryName(catName)
		setView('counting')
	}

	const handleCompleteSession = async () => {
		await completeSession()
		setView('home')
	}

	const handleCancelSession = async () => {
		if (
			!confirm(
				"Annuler l'inventaire ? Les ajustements déjà appliqués ne seront pas annulés.",
			)
		)
			return
		await cancelSession()
		setView('home')
	}

	// Chargement initial
	if (sessionLoading) {
		return (
			<div className='flex items-center justify-center h-full min-h-[400px]'>
				<Loader2 className='h-6 w-6 animate-spin text-orange-500' />
			</div>
		)
	}

	return (
		<div className='flex flex-col h-full'>
			{/* Header global */}
			<div className='flex items-center gap-3 px-6 py-4 border-b shrink-0'>
				<div className='w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center'>
					<ClipboardList className='h-5 w-5 text-orange-500' />
				</div>
				<div className='flex-1'>
					<div className='flex items-center gap-2'>
						<h1 className='text-xl font-bold'>Inventaire</h1>
						{activeSession && (
							<Badge
								variant='outline'
								className='text-orange-600 border-orange-300 text-xs'
							>
								En cours
							</Badge>
						)}
					</div>
					<p className='text-xs text-muted-foreground'>
						Inventaire physique AppPOS
					</p>
				</div>
				{!activeSession && (
					<Button
						variant='outline'
						size='sm'
						className='gap-1.5'
						onClick={() => setView('history')}
					>
						<History className='h-3.5 w-3.5' />
						Historique
					</Button>
				)}
			</div>

			{/* Contenu selon la vue */}
			<div className='flex-1 overflow-hidden'>
				{/* Écran de progression lors de la création */}
				{creationProgress && (
					<div className='flex flex-col items-center justify-center h-full gap-6'>
						<div className='w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center'>
							<Loader2 className='h-8 w-8 text-orange-500 animate-spin' />
						</div>
						<div className='text-center'>
							<h3 className='text-lg font-semibold mb-1'>
								Création du snapshot en cours...
							</h3>
							<p className='text-sm text-muted-foreground mb-4'>
								{creationProgress.done} / {creationProgress.total} produits
								enregistrés
							</p>
							<div className='w-72'>
								<div className='h-2 bg-muted rounded-full overflow-hidden'>
									<div
										className='h-full bg-orange-500 rounded-full transition-all duration-300'
										style={{
											width: `${Math.round((creationProgress.done / creationProgress.total) * 100)}%`,
										}}
									/>
								</div>
								<p className='text-xs text-muted-foreground mt-1 text-right'>
									{Math.round(
										(creationProgress.done / creationProgress.total) * 100,
									)}
									%
								</p>
							</div>
						</div>
					</div>
				)}

				{view === 'home' && !creationProgress && (
					<InventoryHomeView
						onStart={() => setShowCreateDialog(true)}
						isStarting={createSession.isPending}
					/>
				)}

				{view === 'overview' &&
					activeSession &&
					summary &&
					summary.totalProducts > 0 && (
						<SessionOverviewView
							session={activeSession}
							summary={summary}
							onSelectCategory={(catId) => {
								const cat = summary.categories.find(
									(c) => c.categoryId === catId,
								)
								handleSelectCategory(catId, cat?.categoryName ?? '')
							}}
							onComplete={handleCompleteSession}
							onCancel={handleCancelSession}
							isCompleting={isCompletingSession}
							isCancelling={isCancellingSession}
						/>
					)}

				{view === 'overview' &&
					activeSession &&
					!creationProgress &&
					(entriesLoading || !summary || summary.totalProducts === 0) && (
						<div className='flex flex-col items-center justify-center h-full gap-4'>
							<Loader2 className='h-6 w-6 animate-spin text-orange-500' />
							<p className='text-sm text-muted-foreground'>
								Chargement des produits...
							</p>
							{!entriesLoading && summary?.totalProducts === 0 && (
								<Button
									variant='outline'
									size='sm'
									onClick={() => window.location.reload()}
									className='gap-2 mt-2'
								>
									<RotateCcw className='h-3.5 w-3.5' />
									Rafraîchir la page
								</Button>
							)}
						</div>
					)}

				{view === 'history' && (
					<InventoryHistoryView onBack={() => setView('home')} />
				)}

				{view === 'counting' && activeSession && activeCategoryId && (
					<CategoryCountingView
						sessionId={activeSession.id}
						session={activeSession}
						categoryId={activeCategoryId}
						categoryName={activeCategoryName}
						onBack={() => setView('overview')}
					/>
				)}
			</div>

			{/* Dialog création */}
			<CreateSessionDialog
				open={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
				onConfirm={handleCreateConfirm}
				isLoading={createSession.isPending}
			/>

			{/* Erreur création */}
			{createSession.error && (
				<div className='fixed bottom-4 right-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 shadow-lg max-w-sm'>
					{(createSession.error as Error).message}
				</div>
			)}
		</div>
	)
}
