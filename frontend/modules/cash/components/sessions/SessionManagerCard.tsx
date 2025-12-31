import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
// frontend/modules/cash/components/session/SessionManagerCard.tsx
import { useNavigate } from '@tanstack/react-router'
import { Clock3, Receipt } from 'lucide-react'

interface Register {
	id: string
	name: string
	code?: string | null
}

interface SessionManagerCardProps {
	// Caisses
	registers?: Register[]
	selectedRegisterId?: string
	onRegisterChange: (registerId: string) => void
	isRegistersLoading?: boolean

	// Session
	isSessionOpen: boolean
	selectedRegisterName?: string
	openingFloat?: number
	sessionLabel: string
	canToggleSession: boolean

	// Actions
	onToggleSession: () => void
	onOpenTerminal?: () => void
	onShowRapportX?: () => void
	onShowMovement?: () => void

	// Données statiques (MOCK)
	selectedStore: string
}

/**
 * Carte principale de gestion de la session de caisse
 * Affiche le sélecteur de caisse, le statut de la session et les actions disponibles
 */
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
		<Card className='border-slate-200'>
			<CardHeader className='pb-3'>
				<CardTitle className='flex items-center justify-between gap-2 text-sm'>
					<span className='flex items-center gap-2'>
						<Clock3 className='h-4 w-4 text-slate-500' />
						Session de caisse
					</span>

					{/* Sélecteur de caisse */}
					<div className='flex items-center gap-2'>
						<span className='text-[11px] text-muted-foreground'>Caisse</span>
						<select
							className='h-7 rounded-md border bg-white px-2 text-[11px]'
							value={selectedRegisterId || ''}
							onChange={(e) => onRegisterChange(e.target.value || '')}
							disabled={
								isRegistersLoading || !registers || registers.length === 0
							}
						>
							{isRegistersLoading && <option value=''>Chargement...</option>}
							{!isRegistersLoading &&
								(!registers || registers.length === 0) && (
									<option value=''>Aucune caisse</option>
								)}
							{registers?.map((reg) => (
								<option key={reg.id} value={reg.id}>
									{reg.code ? `${reg.code} — ${reg.name}` : reg.name}
								</option>
							))}
						</select>
					</div>
				</CardTitle>
				<CardDescription>
					Gérez l&apos;ouverture, la fermeture et le fond de caisse.
				</CardDescription>
			</CardHeader>

			<CardContent className='space-y-4 text-sm'>
				{/* Informations de la caisse active */}
				<div className='flex items-center justify-between'>
					<div className='space-y-1'>
						<div className='text-xs text-muted-foreground'>Caisse active</div>
						<div className='font-medium text-slate-900'>
							{selectedRegisterName || 'Aucune caisse sélectionnée'}
						</div>
						<div className='text-xs text-muted-foreground'>
							{isSessionOpen
								? `Ouverte • fond ${openingFloat?.toFixed(2) ?? '0.00'} €`
								: 'Aucune session ouverte'}
						</div>
					</div>
					<Badge
						variant='outline'
						className='border-0 bg-slate-100 text-[11px]'
					>
						{selectedStore}
					</Badge>
				</div>

				<Separator />

				{/* Informations du fond de caisse */}
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>Fond de caisse (espèces)</span>
					<span className='font-medium text-slate-900'>
						{openingFloat !== undefined && openingFloat !== null
							? `${openingFloat.toFixed(2)} €`
							: '—'}
					</span>
				</div>

				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>Espèces théoriques en caisse</span>
					<span className='font-medium text-slate-900'>—</span>
				</div>

				{/* Bouton principal : Ouvrir/Clôturer */}
				<Button
					variant={isSessionOpen ? 'outline' : 'default'}
					size='sm'
					className='mt-2 w-full'
					onClick={onToggleSession}
					disabled={!canToggleSession}
				>
					{isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
				</Button>

				{/* Actions supplémentaires (visibles uniquement si session ouverte) */}
				{isSessionOpen && selectedRegisterId && (
					<>
						<Button
							onClick={handleOpenTerminal}
							size='sm'
							className='mt-2 w-full'
							variant='default'
						>
							<Receipt className='h-4 w-4 mr-2' />
							Ouvrir le terminal
						</Button>

						<div className='mt-2 space-y-2'>
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
			</CardContent>
		</Card>
	)
}
