// frontend/components/settings/SecretsSettings.tsx
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANT - GESTION DES CLÉS API ET SECRETS
// ═══════════════════════════════════════════════════════════════════════════

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
	useDeleteNotificationKey,
	useDeleteSecret,
	useNotificationKeyStatus,
	useSetNotificationKey,
	useSetSecret,
	useSetWebhookSecret,
	useSettings,
	useWebhookSecretStatus,
} from '@/lib/queries/secrets'
import {
	AlertCircle,
	CheckCircle2,
	Eye,
	EyeOff,
	Key,
	Loader2,
	RefreshCw,
	Shield,
	Trash2,
	Webhook,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function SecretsSettings() {
	return (
		<div className='space-y-6'>
			<div>
				<h2 className='text-2xl font-bold'>Clés API & Secrets</h2>
				<p className='text-muted-foreground'>
					Gérez les clés API et secrets de l'application. Les valeurs sont
					chiffrées avant stockage.
				</p>
			</div>

			<NotificationKeySection />
			<Separator />
			<WebhookSecretSection />
			<Separator />
			<CustomSecretsSection />
		</div>
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION - CLÉ API NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

function NotificationKeySection() {
	const [apiKey, setApiKey] = useState('')
	const [showKey, setShowKey] = useState(false)

	const { data: status, isLoading: statusLoading } = useNotificationKeyStatus()
	const setKey = useSetNotificationKey()
	const deleteKey = useDeleteNotificationKey()

	const handleSave = async () => {
		if (!apiKey.trim()) {
			toast.error('Veuillez entrer une clé API')
			return
		}

		try {
			await setKey.mutateAsync(apiKey)
			toast.success('Clé API notifications sauvegardée')
			setApiKey('')
			setShowKey(false)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	const handleDelete = async () => {
		if (!confirm('Supprimer la clé API notifications ?')) return

		try {
			await deleteKey.mutateAsync()
			toast.success('Clé API supprimée')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Key className='h-5 w-5' />
					Clé API Notifications
				</CardTitle>
				<CardDescription>
					Clé API pour le service de notifications push (ex: OneSignal, Firebase
					FCM)
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				{/* Status */}
				<div className='flex items-center gap-2'>
					{statusLoading ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : status?.configured ? (
						<>
							<CheckCircle2 className='h-4 w-4 text-green-500' />
							<span className='text-sm text-green-600'>Configurée</span>
						</>
					) : (
						<>
							<AlertCircle className='h-4 w-4 text-amber-500' />
							<span className='text-sm text-amber-600'>Non configurée</span>
						</>
					)}
				</div>

				{/* Input */}
				<div className='space-y-2'>
					<Label htmlFor='notification-key'>
						{status?.configured
							? "Nouvelle clé (remplacera l'actuelle)"
							: 'Clé API'}
					</Label>
					<div className='flex gap-2'>
						<div className='relative flex-1'>
							<Input
								id='notification-key'
								type={showKey ? 'text' : 'password'}
								placeholder='sk_live_xxxxxxxxxxxxx'
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								className='pr-10'
							/>
							<Button
								type='button'
								variant='ghost'
								size='icon'
								className='absolute right-0 top-0 h-full px-3'
								onClick={() => setShowKey(!showKey)}
							>
								{showKey ? (
									<EyeOff className='h-4 w-4' />
								) : (
									<Eye className='h-4 w-4' />
								)}
							</Button>
						</div>
						<Button
							onClick={handleSave}
							disabled={setKey.isPending || !apiKey.trim()}
						>
							{setKey.isPending && (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							)}
							Sauvegarder
						</Button>
					</div>
				</div>

				{/* Actions */}
				{status?.configured && (
					<div className='flex justify-end'>
						<Button
							variant='destructive'
							size='sm'
							onClick={handleDelete}
							disabled={deleteKey.isPending}
						>
							{deleteKey.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Trash2 className='mr-2 h-4 w-4' />
							)}
							Supprimer
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION - WEBHOOK SECRET
// ═══════════════════════════════════════════════════════════════════════════

function WebhookSecretSection() {
	const [secret, setSecret] = useState('')

	const { data: status, isLoading: statusLoading } = useWebhookSecretStatus()
	const setWebhookSecret = useSetWebhookSecret()

	const handleGenerate = async () => {
		try {
			await setWebhookSecret.mutateAsync(undefined) // ✅ Passer undefined
			toast.success('Secret webhook généré')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la génération')
		}
	}
	const handleSaveCustom = async () => {
		if (!secret.trim()) {
			toast.error('Veuillez entrer un secret')
			return
		}

		try {
			await setWebhookSecret.mutateAsync(secret)
			toast.success('Secret webhook sauvegardé')
			setSecret('')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Webhook className='h-5 w-5' />
					Secret Webhook
				</CardTitle>
				<CardDescription>
					Secret utilisé pour signer et vérifier les webhooks sortants
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				{/* Status */}
				<div className='flex items-center gap-2'>
					{statusLoading ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : status?.configured ? (
						<>
							<CheckCircle2 className='h-4 w-4 text-green-500' />
							<span className='text-sm text-green-600'>Configuré</span>
						</>
					) : (
						<>
							<AlertCircle className='h-4 w-4 text-amber-500' />
							<span className='text-sm text-amber-600'>Non configuré</span>
						</>
					)}
				</div>

				{/* Actions */}
				<div className='flex flex-wrap gap-2'>
					<Button
						variant='outline'
						onClick={handleGenerate}
						disabled={setWebhookSecret.isPending}
					>
						{setWebhookSecret.isPending ? (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						) : (
							<RefreshCw className='mr-2 h-4 w-4' />
						)}
						{status?.configured ? 'Régénérer' : 'Générer automatiquement'}
					</Button>
				</div>

				{/* Custom secret input */}
				<div className='space-y-2'>
					<Label htmlFor='webhook-secret'>
						Ou définir un secret personnalisé
					</Label>
					<div className='flex gap-2'>
						<Input
							id='webhook-secret'
							type='password'
							placeholder='Votre secret personnalisé'
							value={secret}
							onChange={(e) => setSecret(e.target.value)}
						/>
						<Button
							onClick={handleSaveCustom}
							disabled={setWebhookSecret.isPending || !secret.trim()}
						>
							Sauvegarder
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION - SECRETS PERSONNALISÉS
// ═══════════════════════════════════════════════════════════════════════════

function CustomSecretsSection() {
	const [newKey, setNewKey] = useState('')
	const [newValue, setNewValue] = useState('')
	const [newDescription, setNewDescription] = useState('')
	const [showValue, setShowValue] = useState(false)

	const { data: settings, isLoading } = useSettings()
	const setSecret = useSetSecret()
	const deleteSecret = useDeleteSecret()

	const handleAdd = async () => {
		if (!newKey.trim() || !newValue.trim()) {
			toast.error('Clé et valeur obligatoires')
			return
		}

		// Validation du nom de clé (snake_case)
		if (!/^[a-z][a-z0-9_]*$/.test(newKey)) {
			toast.error('La clé doit être en snake_case (ex: my_api_key)')
			return
		}

		try {
			await setSecret.mutateAsync({
				key: newKey,
				value: newValue,
				description: newDescription || undefined,
				category: 'custom',
			})
			toast.success('Secret ajouté')
			setNewKey('')
			setNewValue('')
			setNewDescription('')
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de l'ajout")
		}
	}

	const handleDelete = async (key: string) => {
		if (!confirm(`Supprimer le secret "${key}" ?`)) return

		try {
			await deleteSecret.mutateAsync(key)
			toast.success('Secret supprimé')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	// Filtrer pour n'afficher que les secrets custom
	const customSecrets = settings?.filter(
		(s) =>
			s.encrypted &&
			!['notification_api_key', 'webhook_secret', 'smtp_password'].includes(
				s.key,
			),
	)

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Shield className='h-5 w-5' />
					Secrets personnalisés
				</CardTitle>
				<CardDescription>
					Ajoutez vos propres clés API et secrets chiffrés
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				{/* Liste des secrets existants */}
				{isLoading ? (
					<div className='flex justify-center py-4'>
						<Loader2 className='h-6 w-6 animate-spin' />
					</div>
				) : customSecrets && customSecrets.length > 0 ? (
					<div className='space-y-2'>
						{customSecrets.map((setting) => (
							<div
								key={setting.id}
								className='flex items-center justify-between rounded-lg border p-3'
							>
								<div>
									<p className='font-mono text-sm'>{setting.key}</p>
									{setting.description && (
										<p className='text-xs text-muted-foreground'>
											{setting.description}
										</p>
									)}
								</div>
								<div className='flex items-center gap-2'>
									<span className='text-xs text-muted-foreground'>
										{setting.value}
									</span>
									<Button
										variant='ghost'
										size='icon'
										onClick={() => handleDelete(setting.key)}
									>
										<Trash2 className='h-4 w-4 text-destructive' />
									</Button>
								</div>
							</div>
						))}
					</div>
				) : (
					<Alert>
						<AlertDescription>
							Aucun secret personnalisé configuré
						</AlertDescription>
					</Alert>
				)}

				<Separator />

				{/* Formulaire d'ajout */}
				<div className='space-y-3'>
					<Label>Ajouter un nouveau secret</Label>

					<div className='grid gap-3 sm:grid-cols-2'>
						<Input
							placeholder='Clé (ex: stripe_api_key)'
							value={newKey}
							onChange={(e) => setNewKey(e.target.value.toLowerCase())}
						/>
						<div className='relative'>
							<Input
								type={showValue ? 'text' : 'password'}
								placeholder='Valeur'
								value={newValue}
								onChange={(e) => setNewValue(e.target.value)}
								className='pr-10'
							/>
							<Button
								type='button'
								variant='ghost'
								size='icon'
								className='absolute right-0 top-0 h-full px-3'
								onClick={() => setShowValue(!showValue)}
							>
								{showValue ? (
									<EyeOff className='h-4 w-4' />
								) : (
									<Eye className='h-4 w-4' />
								)}
							</Button>
						</div>
					</div>

					<Input
						placeholder='Description (optionnel)'
						value={newDescription}
						onChange={(e) => setNewDescription(e.target.value)}
					/>

					<Button
						onClick={handleAdd}
						disabled={setSecret.isPending || !newKey.trim() || !newValue.trim()}
					>
						{setSecret.isPending && (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						)}
						Ajouter le secret
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
