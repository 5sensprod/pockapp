// frontend/modules/cash/components/hardware/DisplaySettingsCard.tsx
import { ModuleCard, StatusBadge } from '@/components/module-ui'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import {
	clearDisplay,
	configureDisplay,
	getDisplayStatus,
	releaseControl,
	takeControl,
	testDisplay,
	useDisplay,
} from '@/lib/pos/display'
import { getAvailablePorts } from '@/lib/pos/displayPorts'
import {
	type DisplayPortSettings,
	type DisplayWelcomeSettings,
	loadDisplayPortSettings,
	loadDisplayWelcomeSettings,
	saveDisplayPortSettings,
	saveDisplayWelcomeSettings,
} from '@/lib/pos/displaySettings'
import {
	Edit3,
	Lock,
	LockOpen,
	Monitor,
	Settings,
	Trash2,
	Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const PROTOCOLS = [
	{ value: 'EPSON_D101', label: 'Epson D101 (défaut)' },
	{ value: 'LD220', label: 'LD220' },
	{ value: 'AEDEX', label: 'Aedex' },
	{ value: 'UTC_S', label: 'UTC-S' },
	{ value: 'UTC_P', label: 'UTC-P' },
	{ value: 'ADM788', label: 'ADM788' },
	{ value: 'DSP800', label: 'DSP800' },
	{ value: 'CD5220', label: 'CD5220' },
	{ value: 'EMAX', label: 'EMAX' },
	{ value: 'LOGIC_CONTROL', label: 'Logic Control' },
]

const BAUD_RATES = ['2400', '4800', '9600', '19200', '38400', '57600', '115200']

export function DisplaySettingsCard() {
	const {
		currentLine1,
		currentLine2,
		isConnected,
		hasControl,
		isControlled,
		deviceID,
	} = useDisplay()

	const [status, setStatus] = useState<{
		active: boolean
		portName: string
		baudRate: number
		protocol: string
		subscribers: number
		controllerID: string
	} | null>(null)

	const [showConfigDialog, setShowConfigDialog] = useState(false)
	const [configForm, setConfigForm] = useState<DisplayPortSettings>(() =>
		loadDisplayPortSettings(),
	)
	const [availablePorts, setAvailablePorts] = useState<string[]>(['COM3'])
	const [isLoadingPorts, setIsLoadingPorts] = useState(false)
	const [isManualPort, setIsManualPort] = useState(false)
	const [manualPortInput, setManualPortInput] = useState('')
	const [welcomeSettings, setWelcomeSettings] =
		useState<DisplayWelcomeSettings>(() => loadDisplayWelcomeSettings())
	const [isConfiguring, setIsConfiguring] = useState(false)
	const [isTesting, setIsTesting] = useState(false)
	const [isClearing, setIsClearing] = useState(false)
	const [isTogglingControl, setIsTogglingControl] = useState(false)

	useEffect(() => {
		loadStatus()
		const interval = setInterval(loadStatus, 2000)
		return () => clearInterval(interval)
	}, [])

	useEffect(() => {
		if (showConfigDialog) loadAvailablePorts()
	}, [showConfigDialog])

	useEffect(() => {
		if (showConfigDialog && availablePorts.length > 0) {
			const currentPort = configForm.portName
			if (
				!availablePorts.includes(currentPort) &&
				currentPort &&
				currentPort !== 'MANUAL'
			) {
				setIsManualPort(true)
				setManualPortInput(currentPort)
			}
		}
	}, [showConfigDialog, availablePorts, configForm.portName])

	const loadAvailablePorts = async () => {
		setIsLoadingPorts(true)
		try {
			const ports = await getAvailablePorts()
			if (ports.length > 0) setAvailablePorts(ports)
		} catch {
			toast.error('Impossible de charger les ports disponibles')
		} finally {
			setIsLoadingPorts(false)
		}
	}

	const handlePortChange = (value: string) => {
		if (value === 'MANUAL') {
			setIsManualPort(true)
			setManualPortInput('')
		} else {
			setIsManualPort(false)
			setConfigForm({ ...configForm, portName: value })
		}
	}

	const handleManualPortChange = (value: string) => {
		setManualPortInput(value)
		setConfigForm({ ...configForm, portName: value })
	}

	const loadStatus = async () => {
		try {
			const data = await getDisplayStatus()
			setStatus(data)
		} catch {}
	}

	const handleConfigure = async () => {
		setIsConfiguring(true)
		try {
			await configureDisplay(
				configForm.portName,
				configForm.baudRate,
				configForm.protocol,
			)
			saveDisplayPortSettings(configForm)
			toast.success('Afficheur configuré')
			setShowConfigDialog(false)
			await loadStatus()
		} catch (err: any) {
			toast.error(err.message || 'Erreur configuration')
		} finally {
			setIsConfiguring(false)
		}
	}

	const handleTest = async () => {
		setIsTesting(true)
		try {
			await testDisplay()
			toast.success('Test envoyé')
		} catch (err: any) {
			toast.error(err.message || 'Erreur test')
		} finally {
			setIsTesting(false)
		}
	}

	const handleClear = async () => {
		setIsClearing(true)
		try {
			await clearDisplay()
			toast.success('Afficheur effacé')
		} catch (err: any) {
			toast.error(err.message || 'Erreur effacement')
		} finally {
			setIsClearing(false)
		}
	}

	const handleToggleControl = async () => {
		setIsTogglingControl(true)
		try {
			if (hasControl) {
				await releaseControl()
				toast.success('Contrôle libéré')
			} else {
				await takeControl()
				toast.success('Contrôle pris')
			}
			await loadStatus()
		} catch (err: any) {
			toast.error(err.message || 'Erreur')
		} finally {
			setIsTogglingControl(false)
		}
	}

	const handleWelcomeChange = (line1: string, line2: string) => {
		const newSettings = { welcomeLine1: line1, welcomeLine2: line2 }
		setWelcomeSettings(newSettings)
		saveDisplayWelcomeSettings(newSettings)
	}

	// Badges statut pour headerRight
	const headerBadges = (
		<div className='flex items-center gap-1.5'>
			{isControlled && (
				<StatusBadge
					label={hasControl ? 'Vous contrôlez' : 'Contrôlé'}
					variant={hasControl ? 'info' : 'warning'}
				/>
			)}
			<StatusBadge
				label={status?.active ? 'Configuré' : 'Non configuré'}
				variant={status?.active ? 'info' : 'closed'}
			/>
			<StatusBadge
				label={isConnected ? 'Sync' : 'Hors ligne'}
				variant={isConnected ? 'open' : 'closed'}
			/>
		</div>
	)

	return (
		<>
			<ModuleCard
				icon={Monitor}
				title='Afficheur Client'
				headerRight={headerBadges}
			>
				<div className='space-y-4'>
					{/* Info config actuelle */}
					{status?.active && (
						<div className='rounded-md bg-muted/50 p-3'>
							<div className='grid grid-cols-2 gap-2 text-xs'>
								<div>
									<span className='text-muted-foreground'>Port :</span>
									<p className='font-medium'>{status.portName}</p>
								</div>
								<div>
									<span className='text-muted-foreground'>Baudrate :</span>
									<p className='font-medium'>{status.baudRate}</p>
								</div>
								<div className='col-span-2'>
									<span className='text-muted-foreground'>Protocole :</span>
									<p className='font-medium'>{status.protocol}</p>
								</div>
							</div>
						</div>
					)}

					{/* Affichage actuel — style terminal conservé intentionnellement */}
					<div className='rounded-lg border-2 border-dashed border-border bg-slate-900 p-4 font-mono text-green-400'>
						<div className='space-y-1 text-center'>
							<div className='text-sm tracking-wider'>
								{currentLine1 || '─'.repeat(20)}
							</div>
							<div className='text-sm tracking-wider'>
								{currentLine2 || '─'.repeat(20)}
							</div>
						</div>
						<div className='mt-2 text-center text-xs text-slate-500'>
							20 colonnes × 2 lignes
						</div>
					</div>

					{/* Alertes contrôle */}
					{isControlled && !hasControl && (
						<div className='rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400'>
							Un autre appareil contrôle l'afficheur. Prenez le contrôle pour
							envoyer des commandes.
						</div>
					)}
					{hasControl && (
						<div className='rounded-md bg-primary/5 p-3 text-sm text-primary'>
							✓ Vous contrôlez l'afficheur. Les autres appareils ne peuvent pas
							envoyer de commandes.
						</div>
					)}
					{!status?.active && (
						<div className='rounded-md bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400'>
							Configurez le port série pour activer la synchronisation de
							l'afficheur entre appareils.
						</div>
					)}

					{/* Boutons actions */}
					<div className='grid grid-cols-2 gap-2'>
						<Button
							variant='outline'
							onClick={() => setShowConfigDialog(true)}
							size='sm'
						>
							<Settings className='mr-1 h-3 w-3' />
							Config
						</Button>
						<Button
							variant={hasControl ? 'destructive' : 'default'}
							onClick={handleToggleControl}
							disabled={isTogglingControl || !status?.active}
							size='sm'
						>
							{hasControl ? (
								<>
									<LockOpen className='mr-1 h-3 w-3' />
									{isTogglingControl ? 'Libération...' : 'Libérer'}
								</>
							) : (
								<>
									<Lock className='mr-1 h-3 w-3' />
									{isTogglingControl ? 'Prise...' : 'Contrôler'}
								</>
							)}
						</Button>
						<Button
							variant='outline'
							onClick={handleTest}
							disabled={!hasControl || isTesting}
							size='sm'
						>
							<Zap className='mr-1 h-3 w-3' />
							{isTesting ? 'Test...' : 'Test'}
						</Button>
						<Button
							variant='outline'
							onClick={handleClear}
							disabled={!hasControl || isClearing}
							size='sm'
						>
							<Trash2 className='mr-1 h-3 w-3' />
							{isClearing ? '...' : 'Effacer'}
						</Button>
					</div>

					{/* Status détaillé */}
					<div className='flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground'>
						<div className='flex items-center gap-1'>
							<span
								className={`h-2 w-2 rounded-full ${status?.active ? 'bg-primary' : 'bg-muted-foreground/40'}`}
							/>
							Config {status?.active ? 'ok' : 'manquante'}
						</div>
						<div className='flex items-center gap-1'>
							<span
								className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
							/>
							WS {isConnected ? 'ok' : 'reconnect...'}
						</div>
						{status?.subscribers !== undefined && (
							<div className='flex items-center gap-1'>
								<span className='h-2 w-2 rounded-full bg-primary' />
								{status.subscribers} appareil{status.subscribers > 1 ? 's' : ''}
							</div>
						)}
					</div>

					<div className='text-center text-xs text-muted-foreground'>
						Device : {deviceID.slice(-8)}
					</div>
				</div>
			</ModuleCard>

			{/* Dialog Configuration */}
			<Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Configuration de l'afficheur</DialogTitle>
						<DialogDescription>
							Configurez le port série pour communiquer avec l'afficheur client
							VFD.
						</DialogDescription>
					</DialogHeader>

					<div className='space-y-4'>
						<div className='space-y-2'>
							<Label>Port série</Label>
							{!isManualPort ? (
								<>
									<Select
										value={
											availablePorts.includes(configForm.portName)
												? configForm.portName
												: 'MANUAL'
										}
										onValueChange={handlePortChange}
										disabled={isLoadingPorts}
									>
										<SelectTrigger>
											<SelectValue
												placeholder={
													isLoadingPorts
														? 'Chargement...'
														: 'Sélectionner un port'
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{availablePorts.map((port) => (
												<SelectItem key={port} value={port}>
													{port}
												</SelectItem>
											))}
											<SelectItem value='MANUAL'>
												<div className='flex items-center gap-2'>
													<Edit3 className='h-3.5 w-3.5' />
													Autre (saisie manuelle)...
												</div>
											</SelectItem>
										</SelectContent>
									</Select>
									<p className='text-xs text-muted-foreground'>
										{availablePorts.length} port
										{availablePorts.length > 1 ? 's' : ''} détecté
										{availablePorts.length > 1 ? 's' : ''}
									</p>
								</>
							) : (
								<>
									<div className='flex gap-2'>
										<Input
											placeholder='Ex: COM10, COM15...'
											value={manualPortInput}
											onChange={(e) => handleManualPortChange(e.target.value)}
											className='flex-1'
										/>
										<Button
											type='button'
											variant='outline'
											size='sm'
											onClick={() => {
												setIsManualPort(false)
												setConfigForm({
													...configForm,
													portName: availablePorts[0] || 'COM3',
												})
											}}
										>
											Liste
										</Button>
									</div>
									<p className='text-xs text-muted-foreground'>
										Entrez le nom du port manuellement (ex: COM10, COM15)
									</p>
								</>
							)}
						</div>

						<div className='space-y-2'>
							<Label>Vitesse (baud rate)</Label>
							<Select
								value={configForm.baudRate}
								onValueChange={(value) =>
									setConfigForm({ ...configForm, baudRate: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{BAUD_RATES.map((rate) => (
										<SelectItem key={rate} value={rate}>
											{rate} baud
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className='space-y-2'>
							<Label>Protocole</Label>
							<Select
								value={configForm.protocol}
								onValueChange={(value) =>
									setConfigForm({ ...configForm, protocol: value })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PROTOCOLS.map((proto) => (
										<SelectItem key={proto.value} value={proto.value}>
											{proto.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<Separator />

						<div className='space-y-3'>
							<Label>Message de bienvenue</Label>
							<div className='space-y-2'>
								<Input
									maxLength={20}
									placeholder='Ligne 1 (ex: Bienvenue)'
									value={welcomeSettings.welcomeLine1}
									onChange={(e) =>
										handleWelcomeChange(
											e.target.value,
											welcomeSettings.welcomeLine2,
										)
									}
								/>
								<Input
									maxLength={20}
									placeholder='Ligne 2 (ex: Axe Musique)'
									value={welcomeSettings.welcomeLine2}
									onChange={(e) =>
										handleWelcomeChange(
											welcomeSettings.welcomeLine1,
											e.target.value,
										)
									}
								/>
								<p className='text-xs text-muted-foreground'>
									Affiché quand le panier est vide (max 20 caractères par ligne)
								</p>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant='outline'
							onClick={() => setShowConfigDialog(false)}
						>
							Annuler
						</Button>
						<Button onClick={handleConfigure} disabled={isConfiguring}>
							{isConfiguring ? 'Configuration...' : 'Configurer'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
