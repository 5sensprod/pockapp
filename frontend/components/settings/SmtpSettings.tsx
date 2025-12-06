import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
// frontend/components/settings/SmtpSettings.tsx
import { usePocketBase } from '@/lib/use-pocketbase'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

interface SmtpConfig {
	enabled: boolean
	host: string
	port: number
	username: string
	password: string
	senderName: string
	senderEmail: string
}

interface SmtpResponse {
	enabled: boolean
	host: string
	port: number
	username: string
	hasPassword: boolean
	senderName: string
	senderEmail: string
}

export default function SmtpSettings() {
	const pb = usePocketBase()

	const [config, setConfig] = useState<SmtpConfig>({
		enabled: false,
		host: '',
		port: 587,
		username: '',
		password: '',
		senderName: '',
		senderEmail: '',
	})
	const [hasExistingPassword, setHasExistingPassword] = useState(false)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [testing, setTesting] = useState(false)
	const [testEmail, setTestEmail] = useState('')

	const loadConfig = useCallback(async () => {
		try {
			const response = await fetch('/api/settings/smtp', {
				headers: {
					Authorization: pb.authStore.token || '',
				},
			})

			if (response.ok) {
				const data = (await response.json()) as SmtpResponse
				setConfig({
					enabled: data.enabled,
					host: data.host || '',
					port: data.port || 587,
					username: data.username || '',
					password: '',
					senderName: data.senderName || '',
					senderEmail: data.senderEmail || '',
				})
				setHasExistingPassword(data.hasPassword)
			} else {
				toast.error('Erreur lors du chargement de la configuration')
			}
		} catch (error) {
			console.error('Erreur chargement config SMTP:', error)
			toast.error('Erreur lors du chargement de la configuration')
		} finally {
			setLoading(false)
		}
	}, [pb.authStore.token])

	useEffect(() => {
		void loadConfig()
	}, [loadConfig])

	const handleSave = async () => {
		setSaving(true)

		try {
			const response = await fetch('/api/settings/smtp', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token || '',
				},
				body: JSON.stringify(config),
			})

			const data = (await response.json()) as { message?: string }

			if (response.ok) {
				toast.success('Configuration SMTP sauvegardée')
				if (config.password) {
					setHasExistingPassword(true)
					setConfig((prev) => ({ ...prev, password: '' }))
				}
			} else {
				toast.error(data.message ?? 'Erreur lors de la sauvegarde')
			}
		} catch {
			toast.error('Erreur de connexion')
		} finally {
			setSaving(false)
		}
	}

	const handleTest = async () => {
		if (!testEmail) {
			toast.error('Veuillez entrer une adresse email pour le test')
			return
		}

		setTesting(true)

		try {
			const response = await fetch('/api/settings/smtp/test', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token || '',
				},
				body: JSON.stringify({ email: testEmail }),
			})

			const data = (await response.json()) as { message?: string }

			if (response.ok) {
				toast.success(`Email de test envoyé à ${testEmail}`)
			} else {
				toast.error(data.message ?? 'Échec du test')
			}
		} catch {
			toast.error('Erreur de connexion')
		} finally {
			setTesting(false)
		}
	}

	if (loading) {
		return (
			<div className='flex items-center justify-center p-8'>
				<Loader2
					className='h-8 w-8 animate-spin text-muted-foreground'
					aria-label='Chargement de la configuration SMTP'
				/>
			</div>
		)
	}

	return (
		<div className='max-w-2xl mx-auto p-6'>
			<Card>
				<CardHeader>
					<CardTitle>Configuration SMTP</CardTitle>
					<CardDescription>
						Configurez le serveur d&apos;envoi des emails (devis, factures,
						etc.).
					</CardDescription>
				</CardHeader>

				<CardContent className='space-y-6'>
					{/* Activer/Désactiver */}
					<div className='flex items-center justify-between'>
						<div className='space-y-1'>
							<Label htmlFor='smtp-enabled' className='text-base'>
								Activer l&apos;envoi d&apos;emails
							</Label>
							<p className='text-sm text-muted-foreground'>
								Permet d&apos;envoyer des devis et factures par email.
							</p>
						</div>
						<Switch
							id='smtp-enabled'
							checked={config.enabled}
							onCheckedChange={(checked) =>
								setConfig((prev) => ({ ...prev, enabled: checked }))
							}
						/>
					</div>

					{config.enabled && (
						<>
							<Separator />

							{/* Serveur SMTP */}
							<div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='smtp-host'>Serveur SMTP</Label>
									<Input
										id='smtp-host'
										type='text'
										value={config.host}
										onChange={(e) =>
											setConfig((prev) => ({ ...prev, host: e.target.value }))
										}
										placeholder='smtp.example.com'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='smtp-port'>Port</Label>
									<select
										id='smtp-port'
										value={config.port}
										onChange={(e) =>
											setConfig((prev) => ({
												...prev,
												port: Number.parseInt(e.target.value, 10),
											}))
										}
										className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
									>
										<option value={587}>587 (STARTTLS - recommandé)</option>
										<option value={465}>465 (SSL)</option>
										<option value={25}>25 (non sécurisé)</option>
									</select>
								</div>
							</div>

							{/* Identifiants */}
							<div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='smtp-username'>Nom d&apos;utilisateur</Label>
									<Input
										id='smtp-username'
										type='text'
										value={config.username}
										onChange={(e) =>
											setConfig((prev) => ({
												...prev,
												username: e.target.value,
											}))
										}
										placeholder='user@example.com'
									/>
								</div>
								<div className='space-y-2'>
									<div className='flex items-center justify-between'>
										<Label htmlFor='smtp-password'>Mot de passe</Label>
										{hasExistingPassword && (
											<span className='text-xs text-green-600'>
												déjà configuré
											</span>
										)}
									</div>
									<Input
										id='smtp-password'
										type='password'
										value={config.password}
										onChange={(e) =>
											setConfig((prev) => ({
												...prev,
												password: e.target.value,
											}))
										}
										placeholder={
											hasExistingPassword ? '••••••••' : 'Mot de passe SMTP'
										}
									/>
								</div>
							</div>

							{/* Expéditeur */}
							<div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
								<div className='space-y-2'>
									<Label htmlFor='smtp-sender-name'>
										Nom de l&apos;expéditeur
									</Label>
									<Input
										id='smtp-sender-name'
										type='text'
										value={config.senderName}
										onChange={(e) =>
											setConfig((prev) => ({
												...prev,
												senderName: e.target.value,
											}))
										}
										placeholder='Mon Entreprise'
									/>
								</div>
								<div className='space-y-2'>
									<Label htmlFor='smtp-sender-email'>
										Email de l&apos;expéditeur
									</Label>
									<Input
										id='smtp-sender-email'
										type='email'
										value={config.senderEmail}
										onChange={(e) =>
											setConfig((prev) => ({
												...prev,
												senderEmail: e.target.value,
											}))
										}
										placeholder='contact@monentreprise.com'
									/>
								</div>
							</div>

							{/* Aide pour les fournisseurs courants */}
							<div className='rounded-md bg-muted p-4 text-sm space-y-1'>
								<p className='font-medium'>Configurations courantes :</p>
								<ul className='space-y-1 text-muted-foreground'>
									<li>
										<strong>Gmail :</strong> smtp.gmail.com:587 (mot de passe
										d&apos;application recommandé)
									</li>
									<li>
										<strong>Outlook :</strong> smtp.office365.com:587
									</li>
									<li>
										<strong>OVH :</strong> ssl0.ovh.net:587
									</li>
								</ul>
							</div>

							<Separator />

							{/* Test */}
							<div className='space-y-2'>
								<Label htmlFor='smtp-test-email'>Tester la configuration</Label>
								<div className='flex flex-col gap-2 sm:flex-row'>
									<Input
										id='smtp-test-email'
										type='email'
										value={testEmail}
										onChange={(e) => setTestEmail(e.target.value)}
										placeholder='votre@email.com'
										className='flex-1'
									/>
									<Button
										type='button'
										onClick={handleTest}
										disabled={testing || !config.host}
										variant='secondary'
									>
										{testing ? 'Envoi...' : 'Envoyer un test'}
									</Button>
								</div>
							</div>
						</>
					)}
				</CardContent>

				<CardFooter className='flex justify-end'>
					<Button type='button' onClick={handleSave} disabled={saving}>
						{saving ? 'Sauvegarde...' : 'Sauvegarder'}
					</Button>
				</CardFooter>
			</Card>
		</div>
	)
}
