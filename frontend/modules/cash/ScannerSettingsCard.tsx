// frontend/modules/cash/ScannerSettingsCard.tsx
// Migré Card shadcn → ModuleCard. Logique inchangée.

import { ModuleCard, StatusBadge } from '@/components/module-ui'
import { broadcastScan, useScanner } from '@/lib/pos/scanner'
import { useBarcodeScanner } from '@/lib/pos/useBarcodeScanner'
import { cn } from '@/lib/utils'
import { isWailsEnv } from '@/lib/wails'
import { Barcode, Power, PowerOff, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export function ScannerSettingsCard() {
	const [hidEnabled, setHidEnabled] = useState(false)
	const [isTesting, setIsTesting] = useState(false)
	const [testResult, setTestResult] = useState<'success' | 'timeout' | null>(
		null,
	)
	const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isServer = isWailsEnv()

	const { lastScan, isConnected, connect, disconnect } = useScanner(
		(barcode) => {
			if (isTesting) {
				setIsTesting(false)
				setTestResult('success')
				if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current)
				toast.success(`Test réussi ! Code: ${barcode}`)
			} else {
				toast.success(`Scan reçu: ${barcode}`, { duration: 2000 })
			}
		},
	)

	const handleLocalScan = useCallback(
		async (barcode: string) => {
			if (isTesting) {
				setIsTesting(false)
				setTestResult('success')
				if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current)
				toast.success(`Test réussi ! Code: ${barcode}`)
			}
			try {
				await broadcastScan(barcode)
			} catch (err) {
				console.error('[HID] Erreur broadcast:', err)
			}
		},
		[isTesting],
	)

	useBarcodeScanner(handleLocalScan, {
		enabled: hidEnabled && isServer,
		maxDelay: 100,
		minLength: 3,
	})

	useEffect(() => {
		connect()
		return () => disconnect()
	}, [connect, disconnect])
	useEffect(
		() => () => {
			if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current)
		},
		[],
	)

	const handleToggleHID = () => {
		if (hidEnabled) {
			setHidEnabled(false)
			toast.info('Écoute scanette désactivée')
		} else {
			setHidEnabled(true)
			toast.success('Écoute scanette activée')
		}
	}

	const handleTest = () => {
		setTestResult(null)
		setIsTesting(true)
		testTimeoutRef.current = setTimeout(() => {
			setIsTesting(false)
			setTestResult('timeout')
			toast.error('Test échoué : aucun scan reçu')
		}, 10000)
	}

	const handleCancelTest = () => {
		setIsTesting(false)
		setTestResult(null)
		if (testTimeoutRef.current) clearTimeout(testTimeoutRef.current)
	}

	const headerRight = (
		<div className='flex items-center gap-1.5'>
			<span className='text-[10px] font-medium text-muted-foreground px-2 py-0.5 bg-muted rounded-full'>
				USB / BT
			</span>
			<StatusBadge
				label={isConnected ? 'Connecté' : 'Déconnecté'}
				variant={isConnected ? 'open' : 'closed'}
			/>
		</div>
	)

	return (
		<ModuleCard icon={Barcode} title='Scanette' headerRight={headerRight}>
			<div className='space-y-4'>
				{/* Mode test actif */}
				{isTesting && (
					<div className='rounded-lg border border-dashed border-amber-400 bg-amber-500/5 p-4 text-center'>
						<ScanLine className='mx-auto h-7 w-7 animate-pulse text-amber-500' />
						<p className='mt-2 text-sm font-medium text-amber-700'>
							Scannez un code-barres...
						</p>
						<p className='text-xs text-amber-600 mt-0.5'>En attente (10s)</p>
						<button
							type='button'
							onClick={handleCancelTest}
							className='inline-flex items-center h-8 px-3 mt-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all'
						>
							Annuler
						</button>
					</div>
				)}

				{/* Résultats test */}
				{testResult === 'success' && !isTesting && (
					<div className='rounded-lg bg-emerald-500/8 border border-emerald-500/20 p-3 text-center'>
						<p className='text-sm font-medium text-emerald-700'>
							✓ Test réussi !
						</p>
						<p className='font-mono text-sm text-emerald-600 mt-0.5'>
							{lastScan}
						</p>
					</div>
				)}
				{testResult === 'timeout' && !isTesting && (
					<div className='rounded-lg bg-destructive/8 border border-destructive/20 p-3 text-center'>
						<p className='text-sm font-medium text-destructive'>
							✗ Aucun scan reçu
						</p>
						<p className='text-xs text-muted-foreground mt-0.5'>
							Vérifiez que la scanette est branchée
						</p>
					</div>
				)}

				{/* Info mode */}
				{!isTesting && (
					<div className='rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground'>
						{isServer ? (
							<>
								<strong className='text-foreground'>Mode HID :</strong> La
								scanette fonctionne comme un clavier. Les scans sont partagés
								avec les appareils connectés.
							</>
						) : (
							<>
								<strong className='text-foreground'>Appareil distant :</strong>{' '}
								Les scans effectués sur le serveur seront reçus ici via
								WebSocket.
							</>
						)}
					</div>
				)}

				{/* Dernier scan */}
				{lastScan && !isTesting && !testResult && (
					<div className='rounded-lg bg-muted/30 px-3 py-2 flex items-center justify-between'>
						<span className='text-[10px] uppercase tracking-wider text-muted-foreground font-medium'>
							Dernier scan
						</span>
						<span className='font-mono text-sm font-medium'>{lastScan}</span>
					</div>
				)}

				{/* Boutons */}
				{!isTesting && (
					<div className='flex gap-2'>
						{isServer && (
							<button
								type='button'
								onClick={handleToggleHID}
								className={cn(
									'flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium transition-all',
									hidEnabled
										? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
										: 'bg-foreground text-background hover:bg-foreground/90',
								)}
							>
								{hidEnabled ? (
									<>
										<PowerOff className='h-3.5 w-3.5' />
										Désactiver
									</>
								) : (
									<>
										<Power className='h-3.5 w-3.5' />
										Activer
									</>
								)}
							</button>
						)}
						<button
							type='button'
							onClick={handleTest}
							disabled={isTesting || (isServer && !hidEnabled)}
							className={cn(
								'inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium transition-all',
								'border border-border/50 text-foreground hover:bg-muted/30 hover:border-border',
								'disabled:opacity-40 disabled:cursor-not-allowed',
								!isServer && 'flex-1',
							)}
						>
							<ScanLine className='h-3.5 w-3.5' />
							Tester
						</button>
					</div>
				)}

				{/* Statuts */}
				<div className='flex items-center justify-center gap-4 text-[10px] text-muted-foreground'>
					{isServer && (
						<span className='flex items-center gap-1'>
							<span
								className={cn(
									'h-1.5 w-1.5 rounded-full',
									hidEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/40',
								)}
							/>
							HID {hidEnabled ? 'actif' : 'inactif'}
						</span>
					)}
					<span className='flex items-center gap-1'>
						<span
							className={cn(
								'h-1.5 w-1.5 rounded-full',
								isConnected ? 'bg-emerald-500' : 'bg-amber-500',
							)}
						/>
						WebSocket {isConnected ? 'ok' : '...'}
					</span>
				</div>
			</div>
		</ModuleCard>
	)
}
