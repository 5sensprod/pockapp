import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useProductStockHistory } from '@/lib/queries/product-stock-history'
import { cn } from '@/lib/utils'

import { FormDetailCard } from './detail-primitives'

const PAR_PAGE = 20

const dateCourte = new Intl.DateTimeFormat('fr-FR', {
	dateStyle: 'short',
	timeStyle: 'short',
})

function formaterDate(iso: string) {
	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? '—' : dateCourte.format(date)
}

function Compteur({
	prefixe = '',
	delta,
	before,
	after,
}: {
	prefixe?: string
	delta: number | null
	before: number | null
	after: number | null
}) {
	return (
		<>
			<p
				className={cn(
					'font-semibold',
					delta === null || delta === 0
						? 'text-muted-foreground'
						: delta > 0
							? 'text-emerald-700'
							: 'text-destructive',
				)}
			>
				{prefixe}
				{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
			</p>
			{before !== null && after !== null && (
				<p className='text-muted-foreground text-xs'>
					{prefixe}
					{before} → {after}
				</p>
			)}
		</>
	)
}

// Lecture seule : le journal est append-only, et ce qui s'y lit est ce que le
// serveur a appliqué — jamais un stock recalculé ici.
export function ProductStockHistory({
	productId,
	legacyId,
}: {
	productId: string
	legacyId?: string
}) {
	const [limite, setLimite] = useState(PAR_PAGE)
	const historique = useProductStockHistory(productId, legacyId, limite)
	const lignes = historique.data?.lines ?? []
	const total = historique.data?.total ?? 0

	return (
		<FormDetailCard
			title='Historique du stock'
			dirty={false}
			contentClassName='p-0'
		>
			{historique.isLoading ? (
				<p className='px-6 py-5 text-muted-foreground text-sm'>
					Lecture de l’historique…
				</p>
			) : historique.isError ? (
				<p className='px-6 py-5 text-destructive text-sm'>
					Historique illisible : {String(historique.error)}
				</p>
			) : lignes.length === 0 ? (
				<p className='px-6 py-5 text-muted-foreground text-sm'>
					Aucun mouvement de stock enregistré.
				</p>
			) : (
				<>
					<ul className='divide-y'>
						{lignes.map((ligne) => (
							<li
								key={ligne.id}
								className='grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-4 px-6 py-3 text-sm'
							>
								<span className='text-muted-foreground text-xs tabular-nums'>
									{formaterDate(ligne.occurredAt)}
								</span>
								<div className='min-w-0'>
									<p className='font-medium'>{ligne.label}</p>
									{ligne.detail && (
										<p
											className='truncate text-muted-foreground text-xs'
											title={ligne.detail}
										>
											{ligne.detail}
										</p>
									)}
								</div>
								<div className='text-right tabular-nums'>
									{/* Le neuf, sauf quand seul le Stock B a bougé. */}
									{(ligne.delta !== 0 || !ligne.deltaB) && (
										<Compteur
											delta={ligne.delta}
											before={ligne.before}
											after={ligne.after}
										/>
									)}
									{!!ligne.deltaB && (
										<Compteur
											prefixe='B '
											delta={ligne.deltaB}
											before={ligne.beforeB}
											after={ligne.afterB}
										/>
									)}
								</div>
							</li>
						))}
					</ul>
					{total > lignes.length && (
						<div className='border-t px-6 py-3'>
							<Button
								type='button'
								variant='ghost'
								size='sm'
								onClick={() => setLimite((n) => n + PAR_PAGE)}
								disabled={historique.isFetching}
							>
								{historique.isFetching && (
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								)}
								Voir plus ({total - lignes.length} restants)
							</Button>
						</div>
					)}
				</>
			)}
		</FormDetailCard>
	)
}
