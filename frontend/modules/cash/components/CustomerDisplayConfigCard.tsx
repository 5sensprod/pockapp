// frontend/modules/cash/components/CustomerDisplayConfigCard.tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
	customerDisplayKeys,
	customerDisplayPortsQueryOptions,
	useTestDisplayMutation,
} from '@/lib/pos/customerDisplayQueries'
import {
	loadCustomerDisplaySettings,
	saveCustomerDisplaySettings,
} from '@/lib/pos/customerDisplaySettings'
import {
	type CustomerDisplaySettings,
	customerDisplaySettingsSchema,
} from '@/lib/pos/customerDisplaySettings.schema'
import { isWailsEnv } from '@/lib/wails'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

export function CustomerDisplayConfigCard() {
	const queryClient = useQueryClient()
	const isWails = isWailsEnv()

	// React Query pour la liste des ports
	const {
		data: ports = [],
		isLoading,
		refetch,
	} = useQuery({
		...customerDisplayPortsQueryOptions,
		enabled: isWails,
	})

	// Mutation pour le test
	const testDisplay = useTestDisplayMutation()

	// React Hook Form avec Zod
	const form = useForm<CustomerDisplaySettings>({
		resolver: zodResolver(customerDisplaySettingsSchema),
		defaultValues: loadCustomerDisplaySettings(),
	})

	const { watch, setValue } = form
	const settings = watch()

	// Sélection auto du premier port
	useEffect(() => {
		if (!settings.portName && ports.length > 0) {
			setValue('portName', ports[0])
		}
	}, [ports, settings.portName, setValue])

	// Sauvegarde automatique à chaque changement
	useEffect(() => {
		const subscription = watch((value) => {
			const validated = customerDisplaySettingsSchema.safeParse(value)
			if (validated.success) {
				saveCustomerDisplaySettings(validated.data)
			}
		})
		return () => subscription.unsubscribe()
	}, [watch])

	const handleRefresh = () => {
		queryClient.invalidateQueries({ queryKey: customerDisplayKeys.ports() })
		refetch()
	}

	const handleTestDisplay = () => {
		if (!settings.portName) return
		testDisplay.mutate({
			portName: settings.portName,
			baudRate: settings.baudRate,
			protocol: settings.protocol,
		})
	}

	return (
		<Card className='border-slate-200'>
			<CardHeader className='pb-3'>
				<div className='flex items-center justify-between'>
					<CardTitle className='text-sm flex items-center gap-2'>
						<Monitor className='h-4 w-4' />
						Afficheur Client VFD
					</CardTitle>
					{isWails && (
						<Button
							variant='ghost'
							size='sm'
							onClick={handleRefresh}
							disabled={isLoading}
							className='h-8 px-2'
						>
							<RefreshCw
								className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`}
							/>
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent className='space-y-4 text-sm'>
				{/* Activation */}
				<div className='flex items-center justify-between'>
					<div>
						<div className='font-medium'>Activer l'afficheur</div>
						<div className='text-xs text-muted-foreground'>
							20 colonnes x 2 lignes
						</div>
					</div>
					<input
						type='checkbox'
						checked={settings.enabled}
						onChange={(e) => setValue('enabled', e.target.checked)}
						className='h-4 w-4'
					/>
				</div>

				{!isWails && settings.enabled && (
					<div className='rounded-md bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800'>
						⚠️ L'afficheur client nécessite l'application desktop (Wails)
					</div>
				)}

				<Separator />

				{/* Sélection port */}
				<div className='space-y-2'>
					<Label htmlFor='port-select'>Port série</Label>
					{isLoading ? (
						<div className='flex items-center gap-2 h-9 text-muted-foreground'>
							<Loader2 className='h-4 w-4 animate-spin' />
							<span className='text-xs'>Chargement...</span>
						</div>
					) : (
						<select
							id='port-select'
							className='h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50 disabled:text-gray-500'
							value={settings.portName}
							onChange={(e) => setValue('portName', e.target.value)}
							disabled={!settings.enabled || !isWails}
						>
							<option value=''>-- Sélectionner --</option>
							{ports.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					)}
					{isWails && ports.length === 0 && !isLoading && (
						<p className='text-xs text-muted-foreground'>
							Aucun port détecté. Vérifiez la connexion USB.
						</p>
					)}
				</div>

				{/* Vitesse de communication */}
				<div className='space-y-2'>
					<Label htmlFor='baudrate-select'>Vitesse (baud rate)</Label>
					<select
						id='baudrate-select'
						className='h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50'
						value={settings.baudRate}
						onChange={(e) =>
							setValue('baudRate', e.target.value as '9600' | '19200')
						}
						disabled={!settings.enabled}
					>
						<option value='9600'>9600 bps</option>
						<option value='19200'>19200 bps</option>
					</select>
				</div>

				{/* Protocole */}
				<div className='space-y-2'>
					<Label htmlFor='protocol-select'>Protocole</Label>
					<select
						id='protocol-select'
						className='h-9 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50'
						value={settings.protocol}
						onChange={(e) => setValue('protocol', e.target.value as any)}
						disabled={!settings.enabled}
					>
						<option value='EPSON_D101'>EPSON POS D101</option>
						<option value='LD220'>LD220</option>
						<option value='AEDEX'>AEDEX</option>
						<option value='UTC_S'>UTC/S</option>
						<option value='UTC_P'>UTC/P</option>
						<option value='ADM788'>ADM788</option>
						<option value='DSP800'>DSP800</option>
						<option value='CD5220'>CD5220</option>
						<option value='EMAX'>EMAX</option>
						<option value='LOGIC_CONTROL'>LOGIC CONTROL</option>
					</select>
					<p className='text-xs text-muted-foreground'>
						Recommandé: EPSON POS D101
					</p>
				</div>

				<Separator />

				{/* Message d'accueil */}
				<div className='space-y-2'>
					<Label htmlFor='welcome-input'>Message d'accueil</Label>
					<Input
						id='welcome-input'
						type='text'
						maxLength={20}
						placeholder='Bienvenue'
						value={settings.welcomeMessage}
						onChange={(e) => setValue('welcomeMessage', e.target.value)}
						disabled={!settings.enabled}
						className='h-9'
					/>
					<p className='text-xs text-muted-foreground'>
						Max 20 caractères (ligne 1)
					</p>
				</div>

				{/* Luminosité */}
				<div className='space-y-2'>
					<Label htmlFor='brightness-slider'>
						Luminosité: {settings.brightness}%
					</Label>
					<input
						id='brightness-slider'
						type='range'
						min='0'
						max='100'
						step='10'
						value={settings.brightness}
						onChange={(e) => setValue('brightness', Number(e.target.value))}
						disabled={!settings.enabled}
						className='w-full'
					/>
				</div>

				<Separator />

				{/* Options d'affichage */}
				<div className='space-y-3'>
					<div className='flex items-center justify-between'>
						<div>
							<div className='font-medium'>Affichage automatique</div>
							<div className='text-xs text-muted-foreground'>
								Mise à jour pendant la vente
							</div>
						</div>
						<input
							type='checkbox'
							checked={settings.autoDisplay}
							onChange={(e) => setValue('autoDisplay', e.target.checked)}
							disabled={!settings.enabled}
							className='h-4 w-4'
						/>
					</div>
				</div>

				<Separator />

				{/* Test */}
				<div className='flex justify-end pt-2'>
					<Button
						variant='outline'
						size='sm'
						disabled={
							!settings.enabled ||
							!settings.portName ||
							testDisplay.isPending ||
							!isWails
						}
						onClick={handleTestDisplay}
					>
						{testDisplay.isPending ? (
							<>
								<Loader2 className='mr-2 h-3 w-3 animate-spin' />
								Test...
							</>
						) : (
							<>
								<Monitor className='mr-2 h-3 w-3' />
								Test afficheur
							</>
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
