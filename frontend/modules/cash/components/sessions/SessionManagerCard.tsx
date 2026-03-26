// frontend/modules/cash/components/session/SessionManagerCard.tsx
import { ModuleCard, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useNavigate } from '@tanstack/react-router'
import { Clock3, Receipt } from 'lucide-react'

interface Register {
	id: string
	name: string
	code?: string | null
}

interface SessionManagerCardProps {
	registers?: Register[]
	selectedRegisterId?: string
	onRegisterChange: (registerId: string) => void
	isRegistersLoading?: boolean
	isSessionOpen: boolean
	selectedRegisterName?: string
	openingFloat?: number
	sessionLabel: string
	canToggleSession: boolean
	onToggleSession: () => void
	onOpenTerminal?: () => void
	onShowRapportX?: () => void
	onShowMovement?: () => void
	selectedStore: string
}

export function SessionManagerCard({
	registers,
	selectedRegisterId,
	onRegisterChange,
	isRegistersLoading = false,
	isSessionOpen,
	selectedRegisterName,
	openingFloat,
	canToggleSession,
	onToggleSession,
	onOpenTerminal,
	onShowRapportX,
	onShowMovement,
	selectedStore,
}: SessionManagerCardProps) {
	const navigate = useNavigate()

	const handleOpenTerminal = () => {
		if (onOpenTerminal) {
			onOpenTerminal()
		} else if (selectedRegisterId) {
			navigate({
				to: '/cash/terminal/$cashRegisterId',
				params: { cashRegisterId: selectedRegisterId },
			})
		}
	}

	return (
		<ModuleCard
			icon={Clock3}
			title='Session de caisse'
			headerRight={
				<div className='flex items-center gap-2'>
					<span className='text-[11px] text-muted-foreground'>Caisse</span>
					<select
						className='h-7 rounded-md border bg-card px-2 text-[11px]'
						value={selectedRegisterId || ''}
						onChange={(e) => onRegisterChange(e.target.value || '')}
						disabled={
							isRegistersLoading || !registers || registers.length === 0
						}
					>
						{isRegistersLoading && <option value=''>Chargement...</option>}
						{!isRegistersLoading && (!registers || registers.length === 0) && (
							<option value=''>Aucune caisse</option>
						)}
						{registers?.map((reg) => (
							<option key={reg.id} value={reg.id}>
								{reg.code ? `${reg.code} — ${reg.name}` : reg.name}
							</option>
						))}
					</select>
				</div>
			}
		>
			<div className='space-y-4 text-sm'>
				{/* Caisse active + statut */}
				<div className='flex items-center justify-between'>
					<div className='space-y-1'>
						<div className='text-xs text-muted-foreground'>Caisse active</div>
						<div className='font-medium text-foreground'>
							{selectedRegisterName || 'Aucune caisse sélectionnée'}
						</div>
						<div className='text-xs text-muted-foreground'>
							{isSessionOpen
								? `Ouverte · fond ${openingFloat?.toFixed(2) ?? '0.00'} €`
								: 'Aucune session ouverte'}
						</div>
					</div>
					<StatusBadge label={selectedStore} variant='closed' />
				</div>

				<Separator />

				{/* Fond de caisse */}
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>Fond de caisse (espèces)</span>
					<span className='font-medium text-foreground'>
						{openingFloat !== undefined && openingFloat !== null
							? `${openingFloat.toFixed(2)} €`
							: '—'}
					</span>
				</div>

				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>Espèces théoriques en caisse</span>
					<span className='font-medium text-foreground'>—</span>
				</div>

				{/* Bouton principal */}
				<Button
					variant={isSessionOpen ? 'outline' : 'default'}
					size='sm'
					className='w-full'
					onClick={onToggleSession}
					disabled={!canToggleSession}
				>
					{isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
				</Button>

				{/* Actions session ouverte */}
				{isSessionOpen && selectedRegisterId && (
					<>
						<Button
							onClick={handleOpenTerminal}
							size='sm'
							className='w-full'
							variant='default'
						>
							<Receipt className='h-4 w-4 mr-2' />
							Ouvrir le terminal
						</Button>

						<div className='space-y-2'>
							<Button
								variant='outline'
								size='sm'
								className='w-full'
								onClick={onShowRapportX}
							>
								📊 Rapport X (Lecture intermédiaire)
							</Button>
							<Button
								variant='outline'
								size='sm'
								className='w-full'
								onClick={onShowMovement}
							>
								💰 Enregistrer un mouvement de caisse
							</Button>
						</div>
					</>
				)}
			</div>
		</ModuleCard>
	)
}
