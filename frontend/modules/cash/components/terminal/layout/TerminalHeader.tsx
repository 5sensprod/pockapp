// frontend/modules/cash/components/terminal/layout/TerminalHeader.tsx
import { Button } from '@/components/ui/button'
import { useOpenCashDrawerMutation } from '@/lib/pos/printerQueries'
import { ArrowLeft, Loader2, RefreshCw, Vault } from 'lucide-react' // ✅ AJOUTER RefreshCw

interface TerminalHeaderProps {
	registerName: string
	sessionIdShort: string
	today: string
	onBack: () => void
	onRefresh?: () => void // ✅ AJOUTER cette prop optionnelle
}

export function TerminalHeader({
	registerName,
	sessionIdShort,
	today,
	onBack,
	onRefresh, // ✅ AJOUTER dans la déstructuration
}: TerminalHeaderProps) {
	const openDrawer = useOpenCashDrawerMutation()

	const handleOpenDrawer = () => {
		openDrawer.mutate()
	}

	return (
		<header className='flex items-center justify-between gap-4'>
			{/* Partie gauche - Bouton retour et infos */}
			<div className='flex items-center gap-3'>
				<Button variant='ghost' size='sm' onClick={onBack}>
					<ArrowLeft className='h-4 w-4 mr-2' />
					Retour
				</Button>
				<div>
					<h1 className='text-2xl font-semibold tracking-tight'>
						{registerName}
					</h1>
					<p className='text-sm text-muted-foreground'>
						Session {sessionIdShort} — {today}
					</p>
				</div>
			</div>

			{/* Partie droite - Boutons et tag session */}
			<div className='flex items-center gap-4 text-xs text-muted-foreground'>
				{/* ✅ NOUVEAU : Bouton Rafraîchir (conditionnel) */}
				{onRefresh && (
					<Button
						variant='outline'
						size='sm'
						onClick={onRefresh}
						className='h-8'
					>
						<RefreshCw className='h-3.5 w-3.5 mr-2' />
						Rafraîchir stock
					</Button>
				)}

				{/* ✅ CONSERVÉ : Bouton Ouvrir tiroir */}
				<Button
					variant='outline'
					size='sm'
					onClick={handleOpenDrawer}
					disabled={openDrawer.isPending}
					className='h-8'
				>
					{openDrawer.isPending ? (
						<>
							<Loader2 className='h-3.5 w-3.5 mr-2 animate-spin' />
							Ouverture...
						</>
					) : (
						<>
							<Vault className='h-3.5 w-3.5 mr-2' />
							Ouvrir tiroir
						</>
					)}
				</Button>

				{/* ✅ CONSERVÉ : Tag Session ouverte */}
				<div className='flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1'>
					<span className='h-2 w-2 rounded-full bg-emerald-500' />
					<span className='font-medium text-emerald-700'>Session ouverte</span>
				</div>
			</div>
		</header>
	)
}
