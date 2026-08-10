// frontend/components/settings/SecretsSettings.tsx
// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANT - GESTION DES CLÉS API ET SECRETS
// ═══════════════════════════════════════════════════════════════════════════
// Deux clés, deux services sans rapport :
//   - Notifications : le mini-SaaS pocketapp.5sensprod.com (télémétrie)
//   - Publication du site : l'endpoint PHP d'axemusique.shop (ticket 5)
// Elles ne doivent PAS porter la même valeur — voir backend/secrets/secrets.go.
//
// Retirées au ticket 5b : « Secret Webhook » (signait des webhooks sortants qui
// n'existent pas) et « Secrets personnalisés » (formulaire libre permettant
// d'écraser une clé nommée par erreur).
// ═══════════════════════════════════════════════════════════════════════════

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
	useDeleteSitePublishKey,
	useNotificationKeyStatus,
	useSetNotificationKey,
	useSetSitePublish,
	useSitePublishStatus,
} from '@/lib/queries/secrets'
import {
	AlertCircle,
	CheckCircle2,
	Eye,
	EyeOff,
	Globe,
	Key,
	Loader2,
	Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
			<SitePublishSection />
		</div>
	)
}

// ═══════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT - INDICATEUR D'ÉTAT
// ═══════════════════════════════════════════════════════════════════════════

function ConfiguredBadge({
	loading,
	configured,
	labels,
}: {
	loading: boolean
	configured: boolean
	labels: [string, string]
}) {
	if (loading) {
		return <Loader2 className='h-4 w-4 animate-spin' />
	}

	return configured ? (
		<>
			<CheckCircle2 className='h-4 w-4 text-green-500' />
			<span className='text-sm text-green-600'>{labels[0]}</span>
		</>
	) : (
		<>
			<AlertCircle className='h-4 w-4 text-amber-500' />
			<span className='text-sm text-amber-600'>{labels[1]}</span>
		</>
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
					Clé du mini-SaaS PocketApp — notifications, crédits IA. Sans rapport
					avec la publication du site.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='flex items-center gap-2'>
					<ConfiguredBadge
						loading={statusLoading}
						configured={!!status?.configured}
						labels={['Configurée', 'Non configurée']}
					/>
				</div>

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
// SECTION - PUBLICATION DU SITE
// ═══════════════════════════════════════════════════════════════════════════
// Deux valeurs de nature différente, réglées ensemble parce qu'aucune ne sert
// sans l'autre : la clé X-API-Key (chiffrée) et l'URL de l'endpoint (en clair,
// ce n'est pas un secret).
//
// La clé n'est jamais relue : ce formulaire l'écrit, et sait seulement si elle
// existe. Au ticket 6, c'est le Go qui la lira pour poser l'en-tête.

/**
 * URL de publication en production. Sert de **valeur par défaut réelle**, pas
 * de placeholder.
 *
 * La première version de cette section l'affichait en `placeholder` : le champ
 * paraissait rempli alors qu'il était vide, la clé partait seule, et la
 * publication échouait en `412` sans que rien à l'écran ne l'explique. Un
 * réglage obligatoire ne se suggère pas en gris.
 */
const DEFAULT_PUBLISH_URL =
	'https://axemusique.shop/server/api/publish-menu.php'

function SitePublishSection() {
	const [apiKey, setApiKey] = useState('')
	const [showKey, setShowKey] = useState(false)
	const [endpointUrl, setEndpointUrl] = useState('')
	const [urlTouched, setUrlTouched] = useState(false)

	const { data: status, isLoading: statusLoading } = useSitePublishStatus()
	const save = useSetSitePublish()
	const deleteKey = useDeleteSitePublishKey()

	// L'URL n'est pas un secret : on affiche celle enregistrée pour qu'elle se
	// relise et se corrige, et la valeur par défaut quand il n'y en a aucune.
	// `urlTouched` empêche l'arrivée tardive du statut d'écraser une saisie en
	// cours. La clé, elle, part toujours d'un champ vide.
	useEffect(() => {
		if (urlTouched || !status) return
		setEndpointUrl(status.endpoint_url || DEFAULT_PUBLISH_URL)
	}, [status, urlTouched])

	const urlChanged = endpointUrl.trim() !== (status?.endpoint_url ?? '')
	const hasSomethingToSave = !!apiKey.trim() || urlChanged

	const handleSave = async () => {
		const url = endpointUrl.trim()

		// L'URL n'est pas facultative : sans elle, la clé seule ne publie rien.
		if (!url) {
			toast.error("L'URL de l'endpoint est obligatoire")
			return
		}
		if (!/^https?:\/\//.test(url)) {
			toast.error("L'URL doit commencer par http:// ou https://")
			return
		}

		try {
			await save.mutateAsync({
				apiKey: apiKey.trim() || undefined,
				endpointUrl: urlChanged ? url : undefined,
			})
			toast.success('Paramètres de publication enregistrés')
			setApiKey('')
			setShowKey(false)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	const handleDelete = async () => {
		if (!confirm('Supprimer la clé de publication du site ?')) return

		try {
			await deleteKey.mutateAsync()
			toast.success('Clé de publication supprimée')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Globe className='h-5 w-5' />
					Publication du site
				</CardTitle>
				<CardDescription>
					Clé et adresse de l'endpoint qui reçoit le menu publié sur
					axemusique.shop. La clé se lit dans le fichier de configuration du
					serveur — elle ne doit pas être celle des notifications.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='flex items-center gap-2'>
					<ConfiguredBadge
						loading={statusLoading}
						configured={!!status?.configured}
						labels={['Clé enregistrée', 'Clé non enregistrée']}
					/>
				</div>

				{/* URL de l'endpoint — pas un secret, affichée en clair */}
				<div className='space-y-2'>
					<Label htmlFor='site-publish-url'>URL de l'endpoint</Label>
					<Input
						id='site-publish-url'
						type='url'
						value={endpointUrl}
						onChange={(e) => {
							setUrlTouched(true)
							setEndpointUrl(e.target.value)
						}}
					/>
					<p className='text-xs text-muted-foreground'>
						L'adresse du script de réception, en POST. Le fichier publié est
						ensuite lu par le site à <code>/data/menu.json</code>.
						{!statusLoading && !status?.endpoint_url && (
							<span className='block text-amber-600'>
								Valeur par défaut proposée, pas encore enregistrée — «
								Enregistrer » la validera.
							</span>
						)}
					</p>
				</div>

				{/* Clé X-API-Key */}
				<div className='space-y-2'>
					<Label htmlFor='site-publish-key'>
						{status?.configured
							? "Nouvelle clé (remplacera l'actuelle)"
							: 'Clé X-API-Key'}
					</Label>
					<div className='relative'>
						<Input
							id='site-publish-key'
							type={showKey ? 'text' : 'password'}
							placeholder='64 caractères hexadécimaux'
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							className='pr-10'
							autoComplete='off'
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
					<p className='text-xs text-muted-foreground'>
						Enregistrée chiffrée. Elle n'est jamais réaffichée : en cas de
						doute, on en met une nouvelle des deux côtés.
					</p>
				</div>

				<div className='flex items-center justify-between gap-2'>
					{status?.configured ? (
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
							Supprimer la clé
						</Button>
					) : (
						<span />
					)}

					<Button
						onClick={handleSave}
						disabled={save.isPending || !hasSomethingToSave}
					>
						{save.isPending && (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						)}
						Enregistrer
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
