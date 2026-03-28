// frontend/modules/cash/components/hardware/DisplaySettingsCard.tsx
//
// Config afficheur VFD inline — plus de Dialog.
// Sections accordéon : statut live → preview terminal → config port → actions

import { ModuleCard, StatusBadge } from '@/components/module-ui'
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
import { cn } from '@/lib/utils'
import {
	ChevronDown,
	Edit3,
	Lock,
	LockOpen,
	Monitor,
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

	const [showConfig, setShowConfig] = useState(false)
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
		if (showConfig) loadAvailablePorts()
	}, [showConfig])

	useEffect(() => {
		if (showConfig && availablePorts.length > 0) {
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
	}, [showConfig, availablePorts, configForm.portName])

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

	const loadStatus = async () => {
		try {
			setStatus(await getDisplayStatus())
		} catch {}
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
			setShowConfig(false)
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
		const s = { welcomeLine1: line1, welcomeLine2: line2 }
		setWelcomeSettings(s)
		saveDisplayWelcomeSettings(s)
	}

	const headerRight = (
		<div className='flex items-center gap-1.5'>
			{isControlled && (
				<StatusBadge
					label={hasControl ? 'Vous contrôlez' : 'Contrôlé'}
					variant={hasControl ? 'info' : 'warning'}
				/>
			)}
			<StatusBadge
				label={isConnected ? 'Sync' : 'Hors ligne'}
				variant={isConnected ? 'open' : 'closed'}
			/>
		</div>
	)

	return (
		<ModuleCard
			icon={Monitor}
			title='Afficheur Client'
			headerRight={headerRight}
		>
			<div className='space-y-4'>
				{/* Preview terminal VFD */}
				<div className='rounded-lg bg-slate-900 px-4 py-3 font-mono text-green-400 text-center'>
					<div className='text-sm tracking-widest'>
						{currentLine1 || '· · · · · · · · · · · · · · · · · · · ·'}
					</div>
					<div className='text-sm tracking-widest mt-1'>
						{currentLine2 || '· · · · · · · · · · · · · · · · · · · ·'}
					</div>
					<div className='mt-2 text-[10px] text-slate-600 tracking-wider'>
						20 col × 2 lignes
					</div>
				</div>

				{/* Alerte contrôle */}
				{isControlled && !hasControl && (
					<div className='rounded-lg bg-amber-500/8 border border-amber-500/20 p-3 text-xs text-amber-700'>
						Un autre appareil contrôle l'afficheur.
					</div>
				)}
				{!status?.active && (
					<div className='rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground'>
						Configurez le port série pour activer la synchronisation.
					</div>
				)}

				{/* Actions principales */}
				<div className='grid grid-cols-2 gap-2'>
					<button
						type='button'
						onClick={handleToggleControl}
						disabled={isTogglingControl || !status?.active}
						className={cn(
							'inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium transition-all',
							'disabled:opacity-40 disabled:cursor-not-allowed',
							hasControl
								? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
								: 'bg-foreground text-background hover:bg-foreground/90',
						)}
					>
						{hasControl ? (
							<>
								<LockOpen className='h-3 w-3' />
								{isTogglingControl ? '...' : 'Libérer'}
							</>
						) : (
							<>
								<Lock className='h-3 w-3' />
								{isTogglingControl ? '...' : 'Contrôler'}
							</>
						)}
					</button>
					<button
						type='button'
						onClick={handleTest}
						disabled={!hasControl || isTesting}
						className='inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium
              border border-border/50 text-foreground hover:bg-muted/30 hover:border-border
              disabled:opacity-40 disabled:cursor-not-allowed transition-all'
					>
						<Zap className='h-3 w-3' />
						{isTesting ? 'Test...' : 'Tester'}
					</button>
					<button
						type='button'
						onClick={handleClear}
						disabled={!hasControl || isClearing}
						className='inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium
              border border-border/50 text-muted-foreground hover:bg-muted/30 hover:border-border
              disabled:opacity-40 disabled:cursor-not-allowed transition-all'
					>
						<Trash2 className='h-3 w-3' />
						{isClearing ? '...' : 'Effacer'}
					</button>
					<button
						type='button'
						onClick={() => setShowConfig(!showConfig)}
						className='col-span-1 flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium text-primary hover:bg-primary/5 transition-colors border border-primary/20'
					>
						Configuration
						<ChevronDown
							className={cn(
								'h-3 w-3 transition-transform',
								showConfig && 'rotate-180',
							)}
						/>
					</button>
				</div>

				{/* Section config expansible inline */}
				{showConfig && (
					<div className='space-y-4 rounded-lg bg-muted/30 p-4 border border-border/40'>
						<div className='space-y-1.5'>
							<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
								Port série
							</Label>
							{!isManualPort ? (
								<Select
									value={
										availablePorts.includes(configForm.portName)
											? configForm.portName
											: 'MANUAL'
									}
									onValueChange={handlePortChange}
									disabled={isLoadingPorts}
								>
									<SelectTrigger className='bg-card border-border/40 h-9'>
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
												Saisie manuelle...
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
							) : (
								<div className='flex gap-2'>
									<Input
										placeholder='Ex: COM10, COM15...'
										value={manualPortInput}
										onChange={(e) => handleManualPortChange(e.target.value)}
										className='flex-1 h-9 bg-card border-border/40'
									/>
									<button
										type='button'
										onClick={() => {
											setIsManualPort(false)
											setConfigForm({
												...configForm,
												portName: availablePorts[0] || 'COM3',
											})
										}}
										className='inline-flex items-center h-9 px-3 rounded-lg text-xs font-medium border border-border/50 hover:bg-muted/30 transition-all shrink-0'
									>
										Liste
									</button>
								</div>
							)}
						</div>

						<div className='grid grid-cols-2 gap-3'>
							<div className='space-y-1.5'>
								<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
									Baudrate
								</Label>
								<Select
									value={configForm.baudRate}
									onValueChange={(v) =>
										setConfigForm({ ...configForm, baudRate: v })
									}
								>
									<SelectTrigger className='bg-card border-border/40 h-9'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{BAUD_RATES.map((r) => (
											<SelectItem key={r} value={r}>
												{r} baud
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className='space-y-1.5'>
								<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
									Protocole
								</Label>
								<Select
									value={configForm.protocol}
									onValueChange={(v) =>
										setConfigForm({ ...configForm, protocol: v })
									}
								>
									<SelectTrigger className='bg-card border-border/40 h-9'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PROTOCOLS.map((p) => (
											<SelectItem key={p.value} value={p.value}>
												{p.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						<Separator className='opacity-40' />

						<div className='space-y-1.5'>
							<Label className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
								Message de bienvenue
							</Label>
							<div className='space-y-2'>
								<Input
									maxLength={20}
									placeholder='Ligne 1 (ex: Bienvenue)'
									className='h-9 bg-card border-border/40 font-mono text-sm'
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
									className='h-9 bg-card border-border/40 font-mono text-sm'
									value={welcomeSettings.welcomeLine2}
									onChange={(e) =>
										handleWelcomeChange(
											welcomeSettings.welcomeLine1,
											e.target.value,
										)
									}
								/>
							</div>
						</div>

						<div className='flex justify-end gap-2'>
							<button
								type='button'
								onClick={() => setShowConfig(false)}
								className='inline-flex items-center h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all'
							>
								Annuler
							</button>
							<button
								type='button'
								onClick={handleConfigure}
								disabled={isConfiguring}
								className='inline-flex items-center h-8 px-4 rounded-lg text-xs font-medium
                  bg-primary text-primary-foreground hover:bg-primary/90
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all'
							>
								{isConfiguring ? 'Configuration...' : 'Appliquer'}
							</button>
						</div>
					</div>
				)}

				{/* Footer statut */}
				<div className='flex items-center justify-center gap-4 text-[10px] text-muted-foreground pt-1'>
					<span className='flex items-center gap-1'>
						<span
							className={cn(
								'h-1.5 w-1.5 rounded-full',
								status?.active ? 'bg-primary' : 'bg-muted-foreground/40',
							)}
						/>
						Port {status?.active ? status.portName : '—'}
					</span>
					<span className='flex items-center gap-1'>
						<span
							className={cn(
								'h-1.5 w-1.5 rounded-full',
								isConnected ? 'bg-emerald-500' : 'bg-amber-500',
							)}
						/>
						WS {isConnected ? 'ok' : 'reconnect'}
					</span>
					<span className='text-muted-foreground/50'>
						#{deviceID.slice(-6)}
					</span>
				</div>
			</div>
		</ModuleCard>
	)
}
