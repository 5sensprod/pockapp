// frontend/modules/cash/components/hardware/DisplaySettingsCard.tsx
import {
	Lock,
	LockOpen,
	Monitor,
	Settings,
	Trash2,
	Wifi,
	WifiOff,
	Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toast } from 'sonner'

import {
	clearDisplay,
	configureDisplay,
	getDisplayStatus,
	releaseControl,
	takeControl,
	testDisplay,
	useDisplay,
} from '@/lib/pos/display'
import {
	type DisplayWelcomeSettings,
	loadDisplayWelcomeSettings,
	saveDisplayWelcomeSettings,
} from '@/lib/pos/displaySettings'

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
	// État du display via WebSocket + contrôle
	const {
		currentLine1,
		currentLine2,
		isConnected,
		hasControl,
		isControlled,
		deviceID,
	} = useDisplay()
	// Status depuis l'API
	const [status, setStatus] = useState<{
		active: boolean
		portName: string
		baudRate: number
		protocol: string
		subscribers: number
		controllerID: string
	} | null>(null)

	// Dialog configuration
	const [showConfigDialog, setShowConfigDialog] = useState(false)
	const [configForm, setConfigForm] = useState({
		portName: 'COM3',
		baudRate: '9600',
		protocol: 'EPSON_D101',
	})

	// ✅ NOUVEAU : Messages de bienvenue
	const [welcomeSettings, setWelcomeSettings] =
		useState<DisplayWelcomeSettings>(() => loadDisplayWelcomeSettings())

	// Loading states
	const [isConfiguring, setIsConfiguring] = useState(false)
	const [isTesting, setIsTesting] = useState(false)
	const [isClearing, setIsClearing] = useState(false)
	const [isTogglingControl, setIsTogglingControl] = useState(false)

	// Charger le status au montage
	useEffect(() => {
		loadStatus()
		const interval = setInterval(loadStatus, 2000) // Rafraîchir toutes les 2s
		return () => clearInterval(interval)
	}, [])

	const loadStatus = async () => {
		try {
			const data = await getDisplayStatus()
			setStatus(data)
		} catch (err) {
			console.error('[DisplaySettingsCard] Erreur chargement status:', err)
		}
	}

	const handleConfigure = async () => {
		setIsConfiguring(true)
		try {
			await configureDisplay(
				configForm.portName,
				configForm.baudRate,
				configForm.protocol,
			)
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

	// ✅ NOUVEAU : Sauvegarder les messages de bienvenue
	const handleWelcomeChange = (line1: string, line2: string) => {
		const newSettings = { welcomeLine1: line1, welcomeLine2: line2 }
		setWelcomeSettings(newSettings)
		saveDisplayWelcomeSettings(newSettings)
	}

	return (
		<>
			<Card>
				<CardHeader className='pb-3'>
					<div className='flex items-center justify-between'>
						<CardTitle className='flex items-center gap-2 text-base font-medium'>
							<Monitor className='h-4 w-4' />
							Afficheur Client
						</CardTitle>
						<div className='flex gap-2'>
							{/* Badge contrôle */}
							{isControlled && (
								<Badge
									variant={hasControl ? 'default' : 'secondary'}
									className={hasControl ? 'bg-purple-500' : ''}
								>
									{hasControl ? (
										<>
											<Lock className='mr-1 h-3 w-3' /> Vous contrôlez
										</>
									) : (
										<>
											<LockOpen className='mr-1 h-3 w-3' /> Contrôlé
										</>
									)}
								</Badge>
							)}
							{/* Badge status config */}
							<Badge
								variant={status?.active ? 'default' : 'secondary'}
								className={status?.active ? 'bg-blue-500' : ''}
							>
								{status?.active ? 'Configuré' : 'Non configuré'}
							</Badge>
							{/* Badge WebSocket */}
							<Badge
								variant={isConnected ? 'default' : 'secondary'}
								className={isConnected ? 'bg-emerald-500' : ''}
							>
								{isConnected ? (
									<>
										<Wifi className='mr-1 h-3 w-3' /> Sync
									</>
								) : (
									<>
										<WifiOff className='mr-1 h-3 w-3' /> Hors ligne
									</>
								)}
							</Badge>
						</div>
					</div>
				</CardHeader>

				<CardContent className='space-y-4'>
					{/* Info config actuelle */}
					{status?.active && (
						<div className='rounded-md bg-muted/50 p-3 text-sm'>
							<div className='grid grid-cols-2 gap-2 text-xs'>
								<div>
									<span className='text-muted-foreground'>Port:</span>
									<p className='font-medium'>{status.portName}</p>
								</div>
								<div>
									<span className='text-muted-foreground'>Baudrate:</span>
									<p className='font-medium'>{status.baudRate}</p>
								</div>
								<div className='col-span-2'>
									<span className='text-muted-foreground'>Protocole:</span>
									<p className='font-medium'>{status.protocol}</p>
								</div>
							</div>
						</div>
					)}

					{/* Affichage actuel */}
					<div className='rounded-lg border-2 border-dashed border-slate-300 bg-slate-900 p-4 font-mono text-green-400 dark:border-slate-700'>
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

					{/* Info contrôle */}
					{isControlled && !hasControl && (
						<div className='rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
							Un autre appareil contrôle l'afficheur. Prenez le contrôle pour
							envoyer des commandes.
						</div>
					)}

					{hasControl && (
						<div className='rounded-md bg-purple-50 p-3 text-sm text-purple-700 dark:bg-purple-950/20 dark:text-purple-400'>
							✓ Vous contrôlez l'afficheur. Les autres appareils ne peuvent pas
							envoyer de commandes.
						</div>
					)}

					{/* Info synchronisation */}
					{!status?.active && (
						<div className='rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'>
							Configurez le port série pour activer la synchronisation de
							l'afficheur entre appareils.
						</div>
					)}

					{/* Boutons */}
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
								className={`h-2 w-2 rounded-full ${status?.active ? 'bg-blue-500' : 'bg-gray-400'}`}
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
								<span className='h-2 w-2 rounded-full bg-purple-500' />
								{status.subscribers} appareil{status.subscribers > 1 ? 's' : ''}
							</div>
						)}
						{isControlled && (
							<div className='flex items-center gap-1'>
								<span className='h-2 w-2 rounded-full bg-purple-500' />
								{hasControl ? 'Vous' : 'Autre'} contrôle
							</div>
						)}
					</div>

					{/* Device ID (debug) */}
					<div className='text-center text-xs text-muted-foreground'>
						Device: {deviceID.slice(-8)}
					</div>
				</CardContent>
			</Card>

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
							<Label htmlFor='portName'>Port série</Label>
							<Input
								id='portName'
								placeholder='COM3'
								value={configForm.portName}
								onChange={(e) =>
									setConfigForm({ ...configForm, portName: e.target.value })
								}
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='baudRate'>Vitesse (baud rate)</Label>
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
							<Label htmlFor='protocol'>Protocole</Label>
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
									type='text'
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
									type='text'
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
