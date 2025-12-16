// frontend/modules/cash/CashPage.tsx
import { Link } from '@tanstack/react-router'
import {
	Banknote,
	CalendarDays,
	Clock3,
	CreditCard,
	Printer,
	Receipt,
	Settings,
	Store,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { PosPrinterConfigCard } from './components/PosPrinterConfigCard'
import { manifest } from './index'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	useActiveCashSession,
	useCashRegisters,
	useCloseCashSession,
	useCreateCashRegister,
	useOpenCashSession,
} from '@/lib/queries/cash'
import { useAuth } from '@/modules/auth/AuthProvider'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

export function CashPage() {
	const navigate = useNavigate()
	const Icon = manifest.icon
	const { isAuthenticated, user } = useAuth()
	const { activeCompanyId } = useActiveCompany()

	const ownerCompanyId = activeCompanyId ?? undefined
	const [isPrinterDialogOpen, setIsPrinterDialogOpen] = React.useState(false)
	// =========================
	// CAISSES DISPONIBLES
	// =========================
	const {
		data: registers,
		isLoading: isRegistersLoading,
		isError: isRegistersError,
	} = useCashRegisters(ownerCompanyId)

	const [selectedRegisterId, setSelectedRegisterId] = React.useState<
		string | undefined
	>(undefined)

	React.useEffect(() => {
		if (!selectedRegisterId && registers && registers.length > 0) {
			setSelectedRegisterId(registers[0].id)
		}
	}, [registers, selectedRegisterId])

	const selectedRegister = React.useMemo(
		() => registers?.find((r) => r.id === selectedRegisterId),
		[registers, selectedRegisterId],
	)

	// =========================
	// SESSION ACTIVE
	// =========================
	const {
		data: activeSession,
		isLoading: isSessionLoading,
		isFetching: isSessionFetching,
	} = useActiveCashSession(selectedRegisterId)

	const openSessionMutation = useOpenCashSession()
	const closeSessionMutation = useCloseCashSession()

	const isMutatingSession =
		openSessionMutation.isPending || closeSessionMutation.isPending

	const isSessionOpen = !!activeSession && activeSession.status === 'open'

	// =========================
	// CRÉATION DE CAISSE
	// =========================
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
	const [newRegisterName, setNewRegisterName] = React.useState('')
	const [newRegisterCode, setNewRegisterCode] = React.useState('')

	const createRegister = useCreateCashRegister()

	const [selectedStore] = React.useState('Axe Musique — Centre-ville')

	const today = new Date().toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
	})

	// =========================
	// DIALOG OUVERTURE (FOND DE CAISSE)
	// =========================
	const [isOpenSessionDialogOpen, setIsOpenSessionDialogOpen] =
		React.useState(false)
	const [openingFloatInput, setOpeningFloatInput] = React.useState('')

	const openSessionDialog = () => {
		setOpeningFloatInput('')
		setIsOpenSessionDialogOpen(true)
	}

	const submitOpenSession = () => {
		if (!isAuthenticated) {
			toast.error('Vous devez être connecté pour gérer la caisse.')
			return
		}
		if (!ownerCompanyId) {
			toast.error("Impossible de déterminer l'entreprise (owner_company).")
			return
		}
		if (!selectedRegisterId) {
			toast.error('Aucune caisse sélectionnée.')
			return
		}

		const v = Number(openingFloatInput)
		if (!Number.isFinite(v) || v < 0) {
			toast.error('Fond de caisse invalide.')
			return
		}

		openSessionMutation.mutate(
			{
				ownerCompanyId,
				cashRegisterId: selectedRegisterId,
				openingFloat: v,
				openedBy: user?.id,
			},
			{
				onSuccess: () => {
					setIsOpenSessionDialogOpen(false)
					toast.success('Session ouverte.')
				},
				onError: (err: any) => {
					toast.error(
						err?.message ?? "Erreur lors de l'ouverture de la session.",
					)
				},
			},
		)
	}

	// =========================
	// OUVERTURE / FERMETURE
	// =========================
	const handleToggleSession = () => {
		if (!isAuthenticated) {
			toast.error('Vous devez être connecté pour gérer la caisse.')
			return
		}

		if (!ownerCompanyId) {
			toast.error("Impossible de déterminer l'entreprise (owner_company).")
			return
		}

		if (!selectedRegisterId) {
			toast.error('Aucune caisse sélectionnée.')
			return
		}

		if (isSessionOpen && activeSession) {
			// fermeture
			closeSessionMutation.mutate({
				sessionId: activeSession.id,
				cashRegisterId: selectedRegisterId,
				// TODO : countedCashTotal à saisir plus tard
			})
		} else {
			// ✅ ouverture -> demander fond de caisse
			openSessionDialog()
		}
	}

	const handleCreateRegister = async () => {
		if (!newRegisterName.trim()) {
			toast.error('Le nom de la caisse est obligatoire.')
			return
		}

		if (!ownerCompanyId) {
			toast.error("Impossible de déterminer l'entreprise.")
			return
		}

		try {
			const reg = await createRegister.mutateAsync({
				name: newRegisterName.trim(),
				code: newRegisterCode.trim() || undefined,
				ownerCompanyId,
			})

			toast.success('Caisse créée.')
			setSelectedRegisterId(reg.id)
			setIsCreateDialogOpen(false)

			setNewRegisterName('')
			setNewRegisterCode('')
		} catch (err: any) {
			toast.error(err?.message ?? 'Erreur lors de la création de la caisse.')
		}
	}

	const sessionLabel = React.useMemo(() => {
		if (!isAuthenticated) return 'Utilisateur non connecté'
		if (isRegistersLoading) return 'Chargement des caisses...'
		if (isRegistersError) return 'Erreur chargement caisses'
		if (!registers || registers.length === 0) return 'Aucune caisse configurée'
		if (isSessionLoading || isSessionFetching)
			return 'Chargement de la session...'
		if (isSessionOpen) return 'Session en cours'
		return 'Aucune session ouverte'
	}, [
		isAuthenticated,
		isRegistersLoading,
		isRegistersError,
		registers,
		isSessionLoading,
		isSessionFetching,
		isSessionOpen,
	])

	const sessionPillColor =
		!registers || registers.length === 0
			? 'bg-amber-400'
			: isSessionOpen
				? 'bg-emerald-500'
				: 'bg-slate-400'

	const sessionTextColor =
		!registers || registers.length === 0
			? 'text-amber-700'
			: isSessionOpen
				? 'text-emerald-700'
				: 'text-slate-600'

	const canToggleSession =
		isAuthenticated &&
		!isRegistersLoading &&
		!!selectedRegisterId &&
		!isMutatingSession &&
		!isSessionLoading

	// =========================
	// EARLY RETURN : AUCUNE CAISSE
	// =========================
	if (!isRegistersLoading && (!registers || registers.length === 0)) {
		return (
			<>
				<div className='container mx-auto px-6 py-8'>
					<Card>
						<CardHeader>
							<CardTitle>Aucune caisse configurée</CardTitle>
							<CardDescription>
								Aucune caisse n&apos;a encore été créée pour cette entreprise.
							</CardDescription>
						</CardHeader>
						<CardContent className='flex justify-end'>
							<Button onClick={() => setIsCreateDialogOpen(true)}>
								Créer une caisse
							</Button>
						</CardContent>
					</Card>
				</div>

				{/* Dialog création caisse */}
				<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Créer une caisse</DialogTitle>
						</DialogHeader>

						<div className='space-y-3'>
							<div>
								<label htmlFor='register-name' className='text-xs'>
									Nom
								</label>
								<Input
									id='register-name'
									placeholder='Caisse principale'
									value={newRegisterName}
									onChange={(e) => setNewRegisterName(e.target.value)}
								/>
							</div>

							<div>
								<label htmlFor='register-code' className='text-xs'>
									Code (optionnel)
								</label>
								<Input
									id='register-code'
									placeholder='POS-001'
									value={newRegisterCode}
									onChange={(e) => setNewRegisterCode(e.target.value)}
								/>
							</div>
						</div>

						<div className='flex justify-end gap-2 pt-4'>
							<Button
								variant='outline'
								onClick={() => setIsCreateDialogOpen(false)}
							>
								Annuler
							</Button>
							<Button
								onClick={handleCreateRegister}
								disabled={createRegister.isPending}
							>
								Enregistrer
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</>
		)
	}

	return (
		<>
			{/* Dialog ouverture session (fond de caisse) */}
			<Dialog
				open={isOpenSessionDialogOpen}
				onOpenChange={(v) => {
					if (!openSessionMutation.isPending) setIsOpenSessionDialogOpen(v)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Ouvrir une session de caisse</DialogTitle>
					</DialogHeader>

					<div className='space-y-2'>
						<label htmlFor='opening-float' className='text-xs'>
							Fond de caisse (espèces)
						</label>
						<Input
							id='opening-float'
							type='number'
							inputMode='decimal'
							min={0}
							step='0.01'
							placeholder='Ex: 150.00'
							value={openingFloatInput}
							onChange={(e) => setOpeningFloatInput(e.target.value)}
						/>
					</div>

					<div className='flex justify-end gap-2 pt-4'>
						<Button
							variant='outline'
							onClick={() => setIsOpenSessionDialogOpen(false)}
							disabled={openSessionMutation.isPending}
						>
							Annuler
						</Button>
						<Button
							onClick={submitOpenSession}
							disabled={openSessionMutation.isPending}
						>
							{openSessionMutation.isPending ? 'Ouverture...' : 'Ouvrir'}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<div className='container mx-auto flex flex-col gap-6 px-6 py-8'>
				{/* Header module */}
				<header className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
					<div className='flex items-center gap-3'>
						<div className='flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white'>
							<Icon className='h-5 w-5' />
						</div>
						<div>
							<h1 className='text-2xl font-semibold tracking-tight'>
								{manifest.name}
							</h1>
							<p className='text-sm text-muted-foreground'>
								Configuration de la caisse, des sessions et du point de vente.
							</p>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-3 text-xs'>
						<div className='flex items-center gap-2 rounded-full bg-emerald-500/5 px-3 py-1'>
							<span className={`h-2 w-2 rounded-full ${sessionPillColor}`} />
							<span className={`font-medium ${sessionTextColor}`}>
								{sessionLabel}
							</span>
						</div>

						<div className='flex items-center gap-2 text-muted-foreground'>
							<CalendarDays className='h-3.5 w-3.5' />
							<span className='font-medium'>{today}</span>
						</div>
					</div>
				</header>

				{/* Ligne de cartes principales */}
				<section className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
					{/* Session de caisse */}
					<Card className='border-slate-200'>
						<CardHeader className='pb-3'>
							<CardTitle className='flex items-center justify-between gap-2 text-sm'>
								<span className='flex items-center gap-2'>
									<Clock3 className='h-4 w-4 text-slate-500' />
									Session de caisse
								</span>

								<div className='flex items-center gap-2'>
									<span className='text-[11px] text-muted-foreground'>
										Caisse
									</span>
									<select
										className='h-7 rounded-md border bg-white px-2 text-[11px]'
										value={selectedRegisterId || ''}
										onChange={(e) =>
											setSelectedRegisterId(e.target.value || undefined)
										}
										disabled={
											isRegistersLoading || !registers || registers.length === 0
										}
									>
										{isRegistersLoading && (
											<option value=''>Chargement...</option>
										)}
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
							<div className='flex items-center justify-between'>
								<div className='space-y-1'>
									<div className='text-xs text-muted-foreground'>
										Caisse active
									</div>
									<div className='font-medium text-slate-900'>
										{selectedRegister?.name || 'Aucune caisse sélectionnée'}
									</div>
									<div className='text-xs text-muted-foreground'>
										{isSessionOpen
											? `Ouverte • fond ${
													activeSession?.opening_float?.toFixed(2) ?? '0.00'
												} €`
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

							<div className='flex items-center justify-between text-xs text-muted-foreground'>
								<span>Fond de caisse (espèces)</span>
								<span className='font-medium text-slate-900'>
									{activeSession?.opening_float !== undefined &&
									activeSession?.opening_float !== null
										? `${activeSession.opening_float.toFixed(2)} €`
										: '—'}
								</span>
							</div>
							<div className='flex items-center justify-between text-xs text-muted-foreground'>
								<span>Espèces théoriques en caisse</span>
								<span className='font-medium text-slate-900'>—</span>
							</div>

							<Button
								variant={isSessionOpen ? 'outline' : 'default'}
								size='sm'
								className='mt-2 w-full'
								onClick={handleToggleSession}
								disabled={!canToggleSession}
							>
								{isSessionOpen ? 'Clôturer la session' : 'Ouvrir une session'}
							</Button>

							{isSessionOpen && selectedRegisterId && (
								<Button
									onClick={() =>
										navigate({
											to: '/cash/terminal/$cashRegisterId',
											params: { cashRegisterId: selectedRegisterId },
										})
									}
									size='sm'
									className='mt-2 w-full'
									variant='default'
								>
									<Receipt className='h-4 w-4 mr-2' />
									Ouvrir le terminal
								</Button>
							)}
						</CardContent>
					</Card>

					{/* Point de vente */}
					<Card className='border-slate-200'>
						<CardHeader className='pb-3'>
							<CardTitle className='flex items-center gap-2 text-sm'>
								<Store className='h-4 w-4 text-slate-500' />
								Point de vente
							</CardTitle>
							<CardDescription>
								Sélectionnez le magasin et paramétrez ses options.
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-4 text-sm'>
							<div className='space-y-1'>
								<div className='text-xs text-muted-foreground'>
									Magasin sélectionné
								</div>
								<div className='font-medium text-slate-900'>
									{selectedStore}
								</div>
								<div className='text-xs text-muted-foreground'>
									ID interne : POS-001 • multi-caisses activé
								</div>
							</div>

							<Separator />

							<div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
								<div>
									<div className='font-medium text-slate-900'>
										Profil fiscal
									</div>
									<div>France • TVA 20 %</div>
								</div>
								<div>
									<div className='font-medium text-slate-900'>
										Ticket par défaut
									</div>
									<div>Format simplifié</div>
								</div>
							</div>

							<div className='flex gap-2 pt-1'>
								<Button variant='outline' size='sm' className='flex-1'>
									Gérer les magasins
								</Button>
								<Button variant='outline' size='sm' className='flex-1'>
									Paramètres POS
								</Button>
							</div>
						</CardContent>
					</Card>
					{/* Imprimantes */}
					<Card className='border-slate-200'>
						<CardHeader className='pb-3'>
							<CardTitle className='flex items-center gap-2 text-sm'>
								<Printer className='h-4 w-4 text-slate-500' />
								Imprimante POS
							</CardTitle>
							<CardDescription>
								Sélectionnez l’imprimante ticket et la largeur.
							</CardDescription>
						</CardHeader>

						<CardContent className='space-y-3'>
							<Button
								variant='outline'
								size='sm'
								className='w-full'
								onClick={() => setIsPrinterDialogOpen(true)}
							>
								Configurer l’imprimante
							</Button>
						</CardContent>
					</Card>

					<Dialog
						open={isPrinterDialogOpen}
						onOpenChange={setIsPrinterDialogOpen}
					>
						<DialogContent className='sm:max-w-lg'>
							<DialogHeader>
								<DialogTitle>Configuration imprimante POS</DialogTitle>
							</DialogHeader>

							<PosPrinterConfigCard />

							<div className='flex justify-end pt-2'>
								<Button onClick={() => setIsPrinterDialogOpen(false)}>
									Fermer
								</Button>
							</div>
						</DialogContent>
					</Dialog>

					{/* Moyens de paiement */}
					<Card className='border-slate-200 md:col-span-2 xl:col-span-1'>
						<CardHeader className='pb-3'>
							<CardTitle className='flex items-center gap-2 text-sm'>
								<CreditCard className='h-4 w-4 text-slate-500' />
								Moyens de paiement
							</CardTitle>
							<CardDescription>
								Activez les types d&apos;encaissement disponibles en caisse.
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-3 text-sm'>
							<div className='flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2'>
								<div className='flex items-center gap-2'>
									<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white'>
										<CreditCard className='h-3.5 w-3.5' />
									</div>
									<div>
										<div className='text-sm font-medium'>Carte bancaire</div>
										<div className='text-xs text-muted-foreground'>
											Terminal CB connecté
										</div>
									</div>
								</div>
								<Badge
									variant='outline'
									className='border-0 bg-emerald-50 text-[11px] text-emerald-700'
								>
									Activé
								</Badge>
							</div>

							<div className='flex items-center justify-between rounded-md border px-3 py-2'>
								<div className='flex items-center gap-2'>
									<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700'>
										<Banknote className='h-3.5 w-3.5' />
									</div>
									<div>
										<div className='text-sm font-medium'>Espèces</div>
										<div className='text-xs text-muted-foreground'>
											Rendue monnaie calculée automatiquement
										</div>
									</div>
								</div>
								<Badge
									variant='outline'
									className='border-0 bg-slate-50 text-[11px]'
								>
									Activé
								</Badge>
							</div>

							<div className='flex items-center justify-between rounded-md border px-3 py-2'>
								<div className='flex items-center gap-2'>
									<div className='flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700'>
										<Receipt className='h-3.5 w-3.5' />
									</div>
									<div>
										<div className='text-sm font-medium'>Autres</div>
										<div className='text-xs text-muted-foreground'>
											Chèques, avoirs, etc.
										</div>
									</div>
								</div>
								<Badge
									variant='outline'
									className='border-0 bg-slate-50 text-[11px]'
								>
									Partiel
								</Badge>
							</div>

							<Button
								variant='ghost'
								size='sm'
								className='mt-1 w-full justify-start gap-2 text-xs text-muted-foreground'
							>
								<Settings className='h-3.5 w-3.5' />
								Configurer les moyens de paiement
							</Button>
						</CardContent>
					</Card>
				</section>

				<section className='grid gap-4 lg:grid-cols-3'>
					<Card className='border-slate-200 lg:col-span-2'>
						<CardHeader className='pb-3'>
							<CardTitle className='text-sm'>Raccourcis caisse</CardTitle>
							<CardDescription>
								Actions fréquentes liées aux ventes et tickets.
							</CardDescription>
						</CardHeader>
						<CardContent className='grid gap-2 text-sm md:grid-cols-3'>
							<Button
								asChild
								variant='outline'
								size='sm'
								className='flex w-full items-center justify-between'
							>
								<Link to='/cash/terminal'>
									<span className='flex items-center gap-2'>
										<Receipt className='h-4 w-4' />
										Ouvrir l&apos;interface de caisse
									</span>
								</Link>
							</Button>

							<Button
								asChild
								variant='outline'
								size='sm'
								className='flex w-full items-center justify-between'
							>
								<Link to='/cash/tickets'>
									<span className='flex items-center gap-2'>
										<Receipt className='h-4 w-4' />
										Derniers tickets
									</span>
								</Link>
							</Button>

							<Button
								asChild
								variant='outline'
								size='sm'
								className='flex w-full items-center justify-between'
							>
								<Link to='/cash/products'>
									<span className='flex items-center gap-2'>
										<Store className='h-4 w-4' />
										Catalogue produits
									</span>
								</Link>
							</Button>
						</CardContent>
					</Card>

					<Card className='border-slate-200'>
						<CardHeader className='pb-3'>
							<CardTitle className='text-sm'>Journal rapide</CardTitle>
							<CardDescription>
								Dernières actions liées à la caisse.
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-2 text-xs text-muted-foreground'>
							<div>
								<span className='font-medium text-slate-900'>09:02</span> —
								Session ouverte par <span>Alexis</span>.
							</div>
							<div>
								<span className='font-medium text-slate-900'>08:59</span> — Fond
								de caisse déclaré : 150,00 €.
							</div>
							<div>
								<span className='font-medium text-slate-900'>Hier</span> —
								Session clôturée avec écart de 0,20 €.
							</div>
						</CardContent>
					</Card>
				</section>
			</div>
		</>
	)
}
