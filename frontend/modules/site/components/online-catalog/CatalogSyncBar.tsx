// frontend/modules/site/components/online-catalog/CatalogSyncBar.tsx
//
// La bande de synchronisation : ce que la base SQL du site contient déjà, ce
// qui reste à envoyer, et le bouton qui envoie.
//
// Elle ne calcule rien : les états lui arrivent déjà comptés. Son seul travail
// est de rendre lisible une opération qui dure — une quinzaine d'allers-retours
// pour 2500 produits (§6 du contrat).

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
	AlertTriangle,
	CheckCircle2,
	CloudUpload,
	Loader2,
	RefreshCw,
} from 'lucide-react'

import type { ExportRejection } from '../../hooks/use-catalog-sync'

type Props = {
	/** L'inventaire distant a-t-il pu être lu ? */
	available: boolean
	loading: boolean
	error: Error | null
	counts: { absent: number; modified: number; synced: number }
	remoteCount: number | null
	exporting: boolean
	progress: { done: number; total: number }
	rejected: ExportRejection[]
	onRefresh: () => void
	onExportAll: () => void
}

export function CatalogSyncBar({
	available,
	loading,
	error,
	counts,
	remoteCount,
	exporting,
	progress,
	rejected,
	onRefresh,
	onExportAll,
}: Props) {
	// Pas d'inventaire : on ne prétend pas connaître l'état du site. Aucune
	// carte n'est grisée, et on dit pourquoi plutôt que d'afficher zéro.
	if (!available) {
		return (
			<Card className='mb-6 border-dashed'>
				<CardContent className='flex flex-wrap items-center gap-3 pt-6'>
					<AlertTriangle className='h-5 w-5 shrink-0 text-muted-foreground' />
					<div className='flex-1 text-sm'>
						<p className='font-medium'>État du site inconnu</p>
						<p className='text-muted-foreground'>
							{error
								? error.message
								: 'URL et clé d’export à renseigner dans Réglages > Clés API.'}
						</p>
					</div>
					<Button variant='outline' size='sm' onClick={onRefresh}>
						<RefreshCw className='mr-1.5 h-3.5 w-3.5' />
						Réessayer
					</Button>
				</CardContent>
			</Card>
		)
	}

	const toSend = counts.absent + counts.modified

	return (
		<Card className='mb-6'>
			<CardContent className='flex flex-wrap items-center gap-4 pt-6'>
				<div className='flex flex-1 flex-wrap items-center gap-4 text-sm'>
					<Tally
						label='Sur le site'
						value={remoteCount ?? 0}
						icon={<CheckCircle2 className='h-4 w-4 text-emerald-500' />}
					/>
					<Tally label='À jour' value={counts.synced} />
					<Tally
						label='Jamais exportés'
						value={counts.absent}
						warn={counts.absent > 0}
					/>
					<Tally
						label='Modifiés'
						value={counts.modified}
						warn={counts.modified > 0}
					/>
				</div>

				{exporting ? (
					<div className='flex items-center gap-2 text-muted-foreground text-sm'>
						<Loader2 className='h-4 w-4 animate-spin' />
						<span className='tabular-nums'>
							Lot {progress.done} / {progress.total}
						</span>
					</div>
				) : (
					<div className='flex items-center gap-2'>
						<Button
							variant='ghost'
							size='sm'
							onClick={onRefresh}
							disabled={loading}
						>
							<RefreshCw
								className={cn('h-3.5 w-3.5', loading && 'animate-spin')}
							/>
						</Button>
						<Button onClick={onExportAll} disabled={toSend === 0}>
							<CloudUpload className='mr-1.5 h-4 w-4' />
							{toSend === 0 ? 'Tout est à jour' : `Synchroniser (${toSend})`}
						</Button>
					</div>
				)}

				{/* Un refus n'annule pas le lot (§5) : il se montre sans alarmer sur
				    ce qui a bien été écrit. */}
				{rejected.length > 0 && (
					<div className='w-full rounded-md border border-amber-500/50 p-3 text-sm'>
						<p className='mb-1 font-medium'>
							{rejected.length} entité(s) refusée(s) par le serveur
						</p>
						<ul className='space-y-0.5 text-muted-foreground text-xs'>
							{rejected.slice(0, 5).map((r) => (
								<li key={`${r.kind}-${r.legacy_id}`}>
									<span className='font-mono'>{r.legacy_id}</span> — {r.reason}
								</li>
							))}
							{rejected.length > 5 && (
								<li>… et {rejected.length - 5} autres.</li>
							)}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function Tally({
	label,
	value,
	icon,
	warn,
}: {
	label: string
	value: number
	icon?: React.ReactNode
	warn?: boolean
}) {
	return (
		<div className='flex items-center gap-2'>
			{icon}
			<span className='text-muted-foreground'>{label}</span>
			<span
				className={cn('font-semibold tabular-nums', warn && 'text-amber-500')}
			>
				{value}
			</span>
		</div>
	)
}
