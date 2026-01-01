import {
	Barcode,
	Monitor,
	Power,
	PowerOff,
	ScanLine,
	Wifi,
	WifiOff,
} from 'lucide-react'
// frontend/modules/cash/components/ScannerSettingsCard.tsx
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

import { broadcastScan, useScanner } from '@/lib/pos/scanner'
import { useBarcodeScanner } from '@/lib/pos/useBarcodeScanner'
import { isWailsEnv } from '@/lib/wails'

export function ScannerSettingsCard() {
	// Mode HID activé (écoute clavier locale)
	const [hidEnabled, setHidEnabled] = useState(false)

	// Mode test
	const [isTesting, setIsTesting] = useState(false)
	const [testResult, setTestResult] = useState<'success' | 'timeout' | null>(
		null,
	)
	const testTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Détecter si on est sur le PC serveur (Wails) ou un appareil distant
	const isServer = isWailsEnv()

	// Hook WebSocket pour recevoir les scans (appareils distants)
	const { lastScan, isConnected, connect, disconnect } = useScanner(
		(barcode) => {
			// Si on est en mode test, marquer comme succès
			if (isTesting) {
				setIsTesting(false)
				setTestResult('success')
				if (testTimeoutRef.current) {
					clearTimeout(testTimeoutRef.current)
				}
				toast.success(`Test réussi ! Code: ${barcode}`)
			} else {
				toast.success(`Scan reçu: ${barcode}`, { duration: 2000 })
			}
		},
	)

	// Hook clavier HID (seulement sur le serveur)
	const handleLocalScan = useCallback(
		async (barcode: string) => {
			console.log('[HID] Scan local détecté:', barcode)

			// Si on est en mode test
			if (isTesting) {
				setIsTesting(false)
				setTestResult('success')
				if (testTimeoutRef.current) {
					clearTimeout(testTimeoutRef.current)
				}
				toast.success(`Test réussi ! Code: ${barcode}`)
			}

			// Broadcaster aux autres appareils
			try {
				await broadcastScan(barcode)
				console.log('[HID] Broadcast envoyé')
			} catch (err) {
				console.error('[HID] Erreur broadcast:', err)
			}
		},
		[isTesting],
	)

	useBarcodeScanner(handleLocalScan, {
		enabled: hidEnabled && isServer,
		maxDelay: 100, // 100ms entre caractères (certaines scanettes sont lentes)
		minLength: 3,
	})

	// Auto-connecter le WebSocket au montage
	useEffect(() => {
		connect()
		return () => disconnect()
	}, [connect, disconnect])

	// Cleanup timeout au démontage
	useEffect(() => {
		return () => {
			if (testTimeoutRef.current) {
				clearTimeout(testTimeoutRef.current)
			}
		}
	}, [])

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

		// Timeout de 10 secondes
		testTimeoutRef.current = setTimeout(() => {
			setIsTesting(false)
			setTestResult('timeout')
			toast.error('Test échoué : aucun scan reçu')
		}, 10000)
	}

	const handleCancelTest = () => {
		setIsTesting(false)
		setTestResult(null)
		if (testTimeoutRef.current) {
			clearTimeout(testTimeoutRef.current)
		}
	}

	return (
		<Card>
			<CardHeader className='pb-3'>
				<div className='flex items-center justify-between'>
					<CardTitle className='flex items-center gap-2 text-base font-medium'>
						<Barcode className='h-4 w-4' />
						Scanette
					</CardTitle>
					<div className='flex gap-2'>
						{/* Badge mode */}
						<Badge variant='outline' className='text-xs'>
							<Monitor className='mr-1 h-3 w-3' />
							HID
						</Badge>
						{/* Badge status */}
						<Badge
							variant={isConnected ? 'default' : 'secondary'}
							className={isConnected ? 'bg-emerald-500' : ''}
						>
							{isConnected ? (
								<>
									<Wifi className='mr-1 h-3 w-3' /> Connecté
								</>
							) : (
								<>
									<WifiOff className='mr-1 h-3 w-3' /> Déconnecté
								</>
							)}
						</Badge>
					</div>
				</div>
			</CardHeader>

			<CardContent className='space-y-4'>
				{/* Mode test actif */}
				{isTesting && (
					<div className='rounded-lg border-2 border-dashed border-amber-500 bg-amber-50 p-4 text-center dark:bg-amber-950/20'>
						<ScanLine className='mx-auto h-8 w-8 animate-pulse text-amber-600' />
						<p className='mt-2 font-medium text-amber-700 dark:text-amber-400'>
							Scannez un code-barres...
						</p>
						<p className='text-xs text-amber-600 dark:text-amber-500'>
							En attente (10s)
						</p>
						<Button
							variant='ghost'
							size='sm'
							className='mt-2'
							onClick={handleCancelTest}
						>
							Annuler
						</Button>
					</div>
				)}

				{/* Résultat du test */}
				{testResult === 'success' && !isTesting && (
					<div className='rounded-lg border border-emerald-500 bg-emerald-50 p-3 text-center dark:bg-emerald-950/20'>
						<p className='font-medium text-emerald-700 dark:text-emerald-400'>
							✓ Test réussi !
						</p>
						<p className='font-mono text-sm'>{lastScan}</p>
					</div>
				)}

				{testResult === 'timeout' && !isTesting && (
					<div className='rounded-lg border border-red-500 bg-red-50 p-3 text-center dark:bg-red-950/20'>
						<p className='font-medium text-red-700 dark:text-red-400'>
							✗ Aucun scan reçu
						</p>
						<p className='text-xs text-red-600'>
							Vérifiez que la scanette est branchée
						</p>
					</div>
				)}

				{/* Info mode HID */}
				{!isTesting && (
					<div className='rounded-md bg-muted/50 p-3 text-sm text-muted-foreground'>
						{isServer ? (
							<p>
								<strong>Mode HID :</strong> La scanette fonctionne comme un
								clavier. Les scans sont automatiquement partagés avec les
								appareils connectés.
							</p>
						) : (
							<p>
								<strong>Appareil distant :</strong> Les scans effectués sur le
								serveur seront reçus ici via WebSocket.
							</p>
						)}
					</div>
				)}

				{/* Boutons */}
				{!isTesting && (
					<div className='flex gap-2'>
						{isServer && (
							<Button
								className='flex-1'
								variant={hidEnabled ? 'destructive' : 'default'}
								onClick={handleToggleHID}
							>
								{hidEnabled ? (
									<>
										<PowerOff className='mr-2 h-4 w-4' /> Désactiver
									</>
								) : (
									<>
										<Power className='mr-2 h-4 w-4' /> Activer
									</>
								)}
							</Button>
						)}

						{/* Bouton Test */}
						<Button
							variant='outline'
							onClick={handleTest}
							disabled={isTesting || (isServer && !hidEnabled)}
							className={!isServer ? 'flex-1' : ''}
						>
							<ScanLine className='mr-2 h-4 w-4' />
							Tester
						</Button>
					</div>
				)}

				{/* Dernier scan (hors mode test) */}
				{lastScan && !isTesting && !testResult && (
					<div className='rounded-md bg-muted p-2 text-center'>
						<span className='text-xs text-muted-foreground'>Dernier scan:</span>
						<p className='font-mono text-sm font-medium'>{lastScan}</p>
					</div>
				)}

				{/* Status détaillé */}
				{!isTesting && (
					<div className='flex items-center justify-center gap-4 text-xs text-muted-foreground'>
						{isServer && (
							<div className='flex items-center gap-1'>
								<span
									className={`h-2 w-2 rounded-full ${hidEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`}
								/>
								HID {hidEnabled ? 'actif' : 'inactif'}
							</div>
						)}
						<div className='flex items-center gap-1'>
							<span
								className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
							/>
							WebSocket {isConnected ? 'ok' : '...'}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
