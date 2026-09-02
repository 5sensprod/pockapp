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
	useBackupStatus,
	useDeleteBackupKey,
	useDeleteNotificationKey,
	useDeleteRemoteSnapshot,
	useDeleteSiteCatalogKey,
	useDeleteSitePublishKey,
	useNotificationKeyStatus,
	useCancelRestore,
	useDeclareBaseline,
	useMirrorStats,
	useDeleteSuperKey,
	usePrepareRestore,
	usePullStorage,
	useRemoteSnapshots,
	useRestoreStatus,
	useStorageLocal,
	useRevealEncryptionKey,
	useRunBackup,
	useSetBackupSettings,
	useSetNotificationKey,
	useSetSiteCatalog,
	useSetSitePublish,
	useSiteCatalogStatus,
	useSitePublishStatus,
} from '@/lib/queries/secrets'
import {
	AlertCircle,
	CheckCircle2,
	Database,
	Eye,
	EyeOff,
	Globe,
	HardDriveDownload,
	Key,
	Loader2,
	Play,
	History,
	Images,
	Power,
	RefreshCw,
	Settings2,
	ShieldAlert,
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
			<Separator />
			<SiteCatalogSection />

			<Separator />

			<BackupSection />
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

// ═══════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANT - EXPORT DU CATALOGUE
// ═══════════════════════════════════════════════════════════════════════════
//
// Distinct de la publication du menu, et pas par symétrie décorative : cette
// clé-là écrit dans la BASE DE DONNÉES du catalogue, l'autre dépose un fichier
// JSON. Côté serveur ce sont `catalog_api_key` et `api_key`, deux entrées de
// config.php. Réutiliser la même valeur des deux côtés ferait d'une révocation
// de menu une panne d'export.
//
// Contrat : frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md

const DEFAULT_CATALOG_URL =
	'https://axemusique.shop/server/api/products-sync.php'

// Le miroir d'images est un SECOND script, et pas un caprice de rangement :
// le lot d'entités plafonne à 1 Mio (§6 du contrat) quand une seule image de
// catégorie pèse 1 Mo en moyenne et 2,7 Mo au pire (mesuré le 19 août 2026).
// Les octets ne peuvent pas voyager par la route qui porte les entités.
// Mécanisme : PocketSite-docs/16-conception-images.md.
const DEFAULT_IMAGES_URL = 'https://axemusique.shop/server/api/images-sync.php'

function SiteCatalogSection() {
	const [apiKey, setApiKey] = useState('')
	const [showKey, setShowKey] = useState(false)
	const [endpointUrl, setEndpointUrl] = useState('')
	const [urlTouched, setUrlTouched] = useState(false)
	const [imagesUrl, setImagesUrl] = useState('')
	const [imagesUrlTouched, setImagesUrlTouched] = useState(false)

	const { data: status, isLoading: statusLoading } = useSiteCatalogStatus()
	const save = useSetSiteCatalog()
	const deleteKey = useDeleteSiteCatalogKey()

	useEffect(() => {
		if (urlTouched || !status) return
		setEndpointUrl(status.endpoint_url || DEFAULT_CATALOG_URL)
	}, [status, urlTouched])

	useEffect(() => {
		if (imagesUrlTouched || !status) return
		setImagesUrl(status.images_url || DEFAULT_IMAGES_URL)
	}, [status, imagesUrlTouched])

	const urlChanged = endpointUrl.trim() !== (status?.endpoint_url ?? '')
	const imagesUrlChanged = imagesUrl.trim() !== (status?.images_url ?? '')
	const hasSomethingToSave = !!apiKey.trim() || urlChanged || imagesUrlChanged

	const handleSave = async () => {
		const url = endpointUrl.trim()

		if (!url) {
			toast.error("L'URL de l'endpoint est obligatoire")
			return
		}
		if (!/^https?:\/\//.test(url)) {
			toast.error("L'URL doit commencer par http:// ou https://")
			return
		}

		const images = imagesUrl.trim()
		if (images && !/^https?:\/\//.test(images)) {
			toast.error(
				"L'URL du miroir d'images doit commencer par http:// ou https://",
			)
			return
		}

		try {
			await save.mutateAsync({
				apiKey: apiKey.trim() || undefined,
				endpointUrl: urlChanged ? url : undefined,
				imagesUrl: imagesUrlChanged ? images : undefined,
			})
			toast.success("Paramètres d'export du catalogue enregistrés")
			setApiKey('')
			setShowKey(false)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	const handleDelete = async () => {
		if (!confirm("Supprimer la clé d'export du catalogue ?")) return

		try {
			await deleteKey.mutateAsync()
			toast.success("Clé d'export supprimée")
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Database className='h-5 w-5' />
					Export du catalogue
				</CardTitle>
				<CardDescription>
					Clé et adresse de l'endpoint qui écrit les produits dans la base SQL
					d'axemusique.shop.{' '}
					<strong>Elle ne doit pas être celle du menu</strong> : celle-ci donne
					accès en écriture à la base de données du catalogue.
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

				<div className='space-y-2'>
					<Label htmlFor='site-catalog-url'>URL de l'endpoint</Label>
					<Input
						id='site-catalog-url'
						type='url'
						value={endpointUrl}
						onChange={(e) => {
							setUrlTouched(true)
							setEndpointUrl(e.target.value)
						}}
					/>
					<p className='text-xs text-muted-foreground'>
						Lue en GET pour connaître ce que le site contient déjà, écrite en
						POST pour y pousser un lot. Le schéma SQL doit avoir été créé au
						préalable (<code>server/sql/schema.sql</code>).
						{!statusLoading && !status?.endpoint_url && (
							<span className='block text-amber-600'>
								Valeur par défaut proposée, pas encore enregistrée — «
								Enregistrer » la validera.
							</span>
						)}
					</p>
				</div>

				<div className='space-y-2'>
					<Label htmlFor='site-images-url'>URL du miroir d'images</Label>
					<Input
						id='site-images-url'
						type='url'
						value={imagesUrl}
						onChange={(e) => {
							setImagesUrlTouched(true)
							setImagesUrl(e.target.value)
						}}
					/>
					<p className='text-xs text-muted-foreground'>
						Second script, MÊME clé : les octets des images ne tiennent pas dans
						le lot d'entités, plafonné à 1 Mio. Les colonnes{' '}
						<code>image_*</code> doivent avoir été ajoutées au préalable (
						<code>server/sql/images.sql</code>).
					</p>
				</div>

				<div className='space-y-2'>
					<Label htmlFor='site-catalog-key'>
						{status?.configured
							? "Nouvelle clé (remplacera l'actuelle)"
							: 'Clé X-API-Key'}
					</Label>
					<div className='relative'>
						<Input
							id='site-catalog-key'
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
						Celle de <code>catalog_api_key</code> dans le{' '}
						<code>config.php</code> du serveur. Enregistrée chiffrée, jamais
						réaffichée.
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

// ═══════════════════════════════════════════════════════════════════════════
// SAUVEGARDE DE LA BASE
// ═══════════════════════════════════════════════════════════════════════════
// Conception : docs/SAUVEGARDE.md.
//
// ─── Pourquoi la configuration est repliée ─────────────────────────────────
// Une sauvegarde bien réglée se règle UNE FOIS et ne se retouche jamais. Ce
// qu'on vient voir ici, cent fois sur cent, c'est « est-ce que ça tourne
// encore » — pas l'URL de l'endpoint. La première version montrait les trois
// champs, deux paragraphes d'avertissement et cinq boutons en permanence ;
// l'information utile s'y noyait.
//
// Deux règles conservées de cette version, et elles ne sont pas décoratives :
//
//  1. la clé de chiffrement se FOURNIT plutôt qu'elle ne se génère sur le
//     poste — une clé qu'on saisit est une clé qu'on détient déjà ailleurs ;
//  2. la clé API et la clé de chiffrement n'ont RIEN à voir. La première
//     identifie le poste auprès du serveur ; la seconde protège le contenu
//     DU serveur. Les confondre reviendrait à donner la seconde au serveur.

const DEFAULT_BACKUP_URL = 'https://pocketapp.5sensprod.com/api/backup.php'

/**
 * Une ligne du miroir, par client.
 *
 * Composant à part parce qu'il porte SON hook : React interdit d'appeler un
 * hook dans une boucle, et l'état du miroir se lit client par client.
 */
function LigneMiroirClient({
	clientId,
	clientNom,
	actif,
	onDeclarer,
	onRapatrier,
	declarationEnCours,
	rapatriementEnCours,
}: {
	clientId: string
	clientNom: string
	actif: boolean
	onDeclarer: () => void
	onRapatrier: () => void
	declarationEnCours: boolean
	rapatriementEnCours: boolean
}) {
	const miroir = useMirrorStats(clientId, actif)
	const socleDeclare = (miroir.data?.baseline ?? 0) > 0

	return (
		<div className='flex flex-wrap items-center justify-between gap-2 border-t pt-3'>
			<div className='text-sm'>
				<div>{clientNom}</div>
				<div className='text-xs text-muted-foreground'>
					{miroir.isLoading ? (
						'…'
					) : miroir.error ? (
						'état du miroir indisponible'
					) : socleDeclare ? (
						<>
							socle déclaré ({miroir.data?.baseline} fichiers) ·{' '}
							{miroir.data?.with_bytes ?? 0} image(s) sur le serveur
						</>
					) : (
						<span className='text-amber-600'>
							socle NON déclaré — ce poste téléverserait tout
						</span>
					)}
				</div>
			</div>
			<div className='flex gap-2'>
				<Button
					variant={socleDeclare ? 'ghost' : 'outline'}
					size='sm'
					onClick={onDeclarer}
					disabled={declarationEnCours}
				>
					{declarationEnCours && (
						<Loader2 className='mr-2 h-4 w-4 animate-spin' />
					)}
					{socleDeclare ? 'Redéclarer le socle' : 'Déclarer le socle'}
				</Button>
				<Button
					variant='outline'
					size='sm'
					onClick={onRapatrier}
					disabled={rapatriementEnCours}
				>
					{rapatriementEnCours && (
						<Loader2 className='mr-2 h-4 w-4 animate-spin' />
					)}
					Rapatrier les images
				</Button>
			</div>
		</div>
	)
}

function BackupSection() {
	const [configOuverte, setConfigOuverte] = useState(false)
	const [apiKey, setApiKey] = useState('')
	const [showApiKey, setShowApiKey] = useState(false)
	const [encryptionKey, setEncryptionKey] = useState('')
	const [showEncryptionKey, setShowEncryptionKey] = useState(false)
	const [endpointUrl, setEndpointUrl] = useState('')
	const [urlTouched, setUrlTouched] = useState(false)
	const [revealedKey, setRevealedKey] = useState('')
	const [superKey, setSuperKey] = useState('')
	const [showSuperKey, setShowSuperKey] = useState(false)

	const {
		data: status,
		isLoading: statusLoading,
		error: statusError,
	} = useBackupStatus()
	const distants = useRemoteSnapshots(!!status?.super_configured)
	const supprimerSuperKey = useDeleteSuperKey()
	const supprimerDistant = useDeleteRemoteSnapshot()
	const restauration = useRestoreStatus()
	const preparerRestauration = usePrepareRestore()
	const annulerRestauration = useCancelRestore()
	const storageLocal = useStorageLocal()
	const declarerSocle = useDeclareBaseline()
	const rapatrier = usePullStorage()
	const save = useSetBackupSettings()
	const deleteKey = useDeleteBackupKey()
	const run = useRunBackup()
	const reveal = useRevealEncryptionKey()

	useEffect(() => {
		if (urlTouched || !status) return
		setEndpointUrl(status.endpoint_url || DEFAULT_BACKUP_URL)
	}, [status, urlTouched])

	// Rien de configuré : la configuration s'ouvre d'elle-même. Sinon l'écran
	// n'afficherait qu'un bouton grisé sans dire quoi faire.
	//
	// Conditionné à `status` reçu, et pas à son absence : sur une erreur, on ne
	// sait pas si c'est configuré, et ouvrir le panneau inviterait à ressaisir
	// des clés qui sont déjà là.
	useEffect(() => {
		if (status && !status.configured) setConfigOuverte(true)
	}, [status])

	const urlChanged = endpointUrl.trim() !== (status?.endpoint_url ?? '')
	const hasSomethingToSave =
		!!apiKey.trim() || !!encryptionKey.trim() || !!superKey.trim() || urlChanged

	const handleSave = async () => {
		const url = endpointUrl.trim()

		if (!url) {
			toast.error("L'URL de sauvegarde est obligatoire")
			return
		}
		// Refusé ici AUSSI, pour dire pourquoi tout de suite : le corps est
		// chiffré, mais la clé API voyage en clair dans un en-tête.
		if (!/^https:\/\//.test(url)) {
			toast.error("L'URL de sauvegarde doit être en HTTPS")
			return
		}

		const cle = encryptionKey.trim()
		if (cle && !/^[0-9a-fA-F]{64}$/.test(cle)) {
			toast.error('La clé de chiffrement doit faire 64 caractères hexadécimaux')
			return
		}

		const superCle = superKey.trim()
		if (superCle && !/^[0-9a-fA-F]{64}$/.test(superCle)) {
			toast.error('La clé super-admin doit faire 64 caractères hexadécimaux')
			return
		}

		try {
			await save.mutateAsync({
				apiKey: apiKey.trim() || undefined,
				encryptionKey: cle || undefined,
				superKey: superCle || undefined,
				endpointUrl: urlChanged ? url : undefined,
			})
			toast.success('Paramètres de sauvegarde enregistrés')
			setApiKey('')
			setEncryptionKey('')
			setSuperKey('')
			setShowApiKey(false)
			setShowEncryptionKey(false)
			setShowSuperKey(false)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la sauvegarde')
		}
	}

	const handleGenerate = () => {
		// Générée DANS LE NAVIGATEUR, par le générateur cryptographique de la
		// plateforme, et affichée pour être copiée AVANT enregistrement : c'est
		// tout l'intérêt de la fournir plutôt que de la laisser naître sur le
		// poste, où elle n'existerait qu'à un seul exemplaire.
		const octets = new Uint8Array(32)
		crypto.getRandomValues(octets)
		setEncryptionKey(
			Array.from(octets)
				.map((o) => o.toString(16).padStart(2, '0'))
				.join(''),
		)
		setShowEncryptionKey(true)
		toast.info("Copiez la clé AVANT d'enregistrer")
	}

	const handleReveal = async () => {
		try {
			const res = await reveal.mutateAsync()
			setRevealedKey(res.encryption_key)
		} catch (error: any) {
			toast.error(error.message || 'Clé introuvable')
		}
	}

	const handleEffacerSuperKey = async () => {
		if (
			!confirm(
				"Effacer la clé super-admin de ce poste ?\n\nÀ faire systématiquement en repartant d'une intervention : cette clé ouvre les sauvegardes de TOUS vos clients.",
			)
		)
			return
		try {
			await supprimerSuperKey.mutateAsync()
			toast.success('Clé super-admin effacée de ce poste')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	const handleSupprimerDistant = async (snap: any) => {
		// L'identifiant est retapé, pas juste confirmé : c'est le seul geste
		// qui distingue « je supprime CELUI-CI » de « j'ai cliqué ».
		const saisi = prompt(
			`Supprimer définitivement ce snapshot ?\n\n${snap.client_name} — ${snap.origin || 'poste inconnu'}\n\nRetapez son identifiant pour confirmer :`,
		)
		if (saisi !== snap.snapshot_id) {
			if (saisi !== null) toast.error('Identifiant incorrect, rien supprimé')
			return
		}
		try {
			await supprimerDistant.mutateAsync({
				clientId: snap.client_id,
				snapshotId: snap.snapshot_id,
			})
			toast.success('Snapshot supprimé')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	const handleRestaurer = async (snap: any) => {
		// L'identifiant est RETAPÉ. C'est le geste le plus destructeur de
		// l'application — il remplace la base du magasin — et il ne doit pas
		// pouvoir être fait par un clic distrait.
		const saisi = prompt(
			`RESTAURER cette sauvegarde ?\n\n` +
				`${snap.client_name} — ${snap.origin || 'poste inconnu'}\n` +
				`base du ${snap.created_at} (UTC), ${Math.round(snap.plain_size / 1024)} Kio\n\n` +
				`⚠️ La base ACTUELLE sera remplacée. Tout ce qui a été saisi depuis ce snapshot sera perdu.\n` +
				`(l'ancienne base est archivée à côté, jamais effacée)\n\n` +
				`Retapez l'identifiant du snapshot pour confirmer :`,
		)
		if (saisi !== snap.snapshot_id) {
			if (saisi !== null) toast.error('Identifiant incorrect, rien préparé')
			return
		}
		try {
			await preparerRestauration.mutateAsync(snap)
			toast.success("Restauration préparée — redémarrez l'application")
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la préparation')
		}
	}

	const handleAnnulerRestauration = async () => {
		if (!confirm('Annuler la restauration préparée ?')) return
		try {
			await annulerRestauration.mutateAsync()
			toast.success('Restauration annulée')
		} catch (error: any) {
			toast.error(error.message || "Erreur lors de l'annulation")
		}
	}

	const handleDeclarerSocle = async (clientId: string, clientNom: string) => {
		const nb = storageLocal.data?.count ?? 0
		if (
			!confirm(
				`Déclarer les ${nb} fichiers de CE poste comme déjà détenus, pour « ${clientNom} » ?\n\n` +
					`Aucun octet ne part : seulement les chemins.\n\n` +
					`Effet : le poste de ce client n'enverra JAMAIS ces fichiers-là. ` +
					`Ne le faites que si vous détenez vraiment ces images.`,
			)
		)
			return
		try {
			const res = await declarerSocle.mutateAsync({ clientId })
			toast.success(res.message)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la déclaration')
		}
	}

	const handleRapatrier = async (clientId: string, clientNom: string) => {
		if (
			!confirm(
				`Rapatrier les images de « ${clientNom} » dans le storage de ce poste ?\n\n` +
					`Les fichiers déjà présents ne sont pas retéléchargés, et aucun n'est écrasé.`,
			)
		)
			return
		try {
			const { result } = await rapatrier.mutateAsync({ clientId })
			toast.success(
				`${result.Ecrits} images écrites, ${result.DejaLa} déjà présentes` +
					(result.Echecs ? `, ${result.Echecs} échecs` : ''),
			)
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors du rapatriement')
		}
	}

	const handleRun = async () => {
		try {
			await run.mutateAsync()
			toast.success('Sauvegarde lancée')
		} catch (error: any) {
			toast.error(error.message || 'Impossible de lancer la sauvegarde')
		}
	}

	const handleDelete = async () => {
		if (!confirm('Supprimer la clé API de sauvegarde ?')) return
		try {
			await deleteKey.mutateAsync()
			toast.success('Clé API supprimée (la clé de chiffrement est conservée)')
		} catch (error: any) {
			toast.error(error.message || 'Erreur lors de la suppression')
		}
	}

	const etat = status?.state
	const pret = !!status?.configured && !!status?.encryption_configured

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<HardDriveDownload className='h-5 w-5' />
					Sauvegarde de la base
				</CardTitle>
				<CardDescription>
					Copie chiffrée de la base, envoyée chaque jour au mini-SaaS. Sans les
					images ni les journaux.
				</CardDescription>
			</CardHeader>

			<CardContent className='space-y-4'>
				{/* ── Restauration armée : le bandeau le plus important de l'écran
				    ───────────────────────────────────────────────────────────────
				    Il est EN PREMIER et en rouge parce que l'application tourne
				    encore sur l'ancienne base : tout ce qui sera saisi d'ici au
				    redémarrage sera emporté par l'échange. */}
				{restauration.data?.pending && (
					<div className='space-y-3 rounded-md border-2 border-destructive bg-destructive/5 p-4'>
						<p className='flex items-center gap-2 font-medium text-destructive'>
							<Power className='h-5 w-5' />
							Redémarrez l'application pour appliquer la restauration
						</p>
						<p className='text-sm'>
							La base sera remplacée par le snapshot{' '}
							<code className='text-xs'>
								{restauration.data.pending.snapshot_id}
							</code>{' '}
							({restauration.data.pending.client_name} —{' '}
							{restauration.data.pending.origin || 'poste inconnu'}, base du{' '}
							{restauration.data.pending.created_at}).
						</p>
						<p className='text-sm text-destructive'>
							<strong>
								Tout ce qui sera saisi d'ici au redémarrage sera perdu.
							</strong>{' '}
							L'échange a lieu au lancement, avant l'ouverture de la base —
							c'est le seul moment où le fichier n'est pas verrouillé. La base
							actuelle sera archivée à côté, jamais effacée.
						</p>
						<Button
							variant='outline'
							size='sm'
							onClick={handleAnnulerRestauration}
							disabled={annulerRestauration.isPending}
						>
							{annulerRestauration.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Trash2 className='mr-2 h-4 w-4' />
							)}
							Annuler la restauration
						</Button>
					</div>
				)}

				{/* ── La seule chose qu'on vient voir : où ça en est ──────────── */}
				<div className='flex flex-wrap items-center justify-between gap-3'>
					<div className='text-sm'>
						{statusLoading ? (
							<Loader2 className='h-4 w-4 animate-spin' />
						) : statusError ? (
							/* Sans ce cas, une requête d'état en échec faisait dire à
							   l'écran « Non configurée » — c'est-à-dire exactement le
							   contraire de la vérité, puisqu'on ne sait rien. La session
							   PocketBase étant effacée à chaque démarrage (main.tsx),
							   c'était le message vu au lancement, avant connexion. */
							<span className='flex items-center gap-2 text-amber-600'>
								<AlertCircle className='h-4 w-4' />
								Configuration illisible :{' '}
								{(statusError as any).message || 'erreur inconnue'}
							</span>
						) : etat?.running ? (
							<span className='flex items-center gap-2 text-blue-600'>
								<Loader2 className='h-4 w-4 animate-spin' />
								Sauvegarde en cours…
							</span>
						) : etat?.last_success ? (
							<span className='flex items-center gap-2 text-green-600'>
								<CheckCircle2 className='h-4 w-4' />
								Dernière sauvegarde le{' '}
								{new Date(etat.last_success).toLocaleString('fr-FR')}
								{etat.last_plain_size
									? ` — ${Math.round(etat.last_plain_size / 1024)} Kio`
									: ''}
							</span>
						) : (
							<span className='flex items-center gap-2 text-amber-600'>
								<AlertCircle className='h-4 w-4' />
								{pret ? 'Aucune sauvegarde encore' : 'Non configurée'}
							</span>
						)}
					</div>

					<div className='flex gap-2'>
						{pret && (
							<Button
								variant='outline'
								size='sm'
								onClick={handleRun}
								disabled={run.isPending || etat?.running}
							>
								{run.isPending || etat?.running ? (
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								) : (
									<Play className='mr-2 h-4 w-4' />
								)}
								Sauvegarder maintenant
							</Button>
						)}
						<Button
							variant='ghost'
							size='sm'
							onClick={() => setConfigOuverte(!configOuverte)}
						>
							<Settings2 className='mr-2 h-4 w-4' />
							{configOuverte ? 'Masquer' : 'Configurer'}
						</Button>
					</div>
				</div>

				{/* La présence de la super-clé est SIGNALÉE en permanence, sans
				    avoir à déplier : elle est normale sur le poste de l'éditeur,
				    et c'est un oubli à réparer sur celui d'un client. */}
				{status?.super_configured && (
					<div className='flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400 bg-amber-50 p-3'>
						<span className='flex items-center gap-2 text-sm text-amber-900'>
							<ShieldAlert className='h-4 w-4' />
							Clé super-admin présente sur ce poste — à effacer après une
							intervention.
						</span>
						<Button
							variant='outline'
							size='sm'
							onClick={handleEffacerSuperKey}
							disabled={supprimerSuperKey.isPending}
						>
							{supprimerSuperKey.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Trash2 className='mr-2 h-4 w-4' />
							)}
							Effacer
						</Button>
					</div>
				)}

				{/* Un échec est la seule autre chose qui mérite d'être vue sans
				    déplier : c'est le cas où il faut agir. */}
				{!etat?.running && etat?.last_error && (
					<p className='text-sm text-amber-600'>
						Dernier échec
						{etat.last_failure
							? ` le ${new Date(etat.last_failure).toLocaleString('fr-FR')}`
							: ''}{' '}
						: {etat.last_error}
					</p>
				)}

				{/* ── Tout le reste, replié ──────────────────────────────────── */}
				{configOuverte && (
					<div className='space-y-4 rounded-md border p-4'>
						<div className='flex flex-wrap items-center gap-4'>
							{/* `loading` couvre AUSSI le cas d'erreur : un badge qui
							    annonce « manquante » quand la réponse n'est pas arrivée
							    envoie corriger une configuration qui va très bien. */}
							<ConfiguredBadge
								loading={statusLoading || !!statusError}
								configured={!!status?.configured}
								labels={['Clé API enregistrée', 'Clé API manquante']}
							/>
							<ConfiguredBadge
								loading={statusLoading || !!statusError}
								configured={!!status?.encryption_configured}
								labels={['Chiffrement actif', 'Clé de chiffrement manquante']}
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='backup-url'>URL de l'endpoint</Label>
							<Input
								id='backup-url'
								type='url'
								value={endpointUrl}
								onChange={(e) => {
									setUrlTouched(true)
									setEndpointUrl(e.target.value)
								}}
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='backup-api-key'>
								{status?.configured ? 'Remplacer la clé API' : 'Clé X-API-Key'}
							</Label>
							<div className='relative'>
								<Input
									id='backup-api-key'
									type={showApiKey ? 'text' : 'password'}
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
									onClick={() => setShowApiKey(!showApiKey)}
								>
									{showApiKey ? (
										<EyeOff className='h-4 w-4' />
									) : (
										<Eye className='h-4 w-4' />
									)}
								</Button>
							</div>
							<p className='text-xs text-muted-foreground'>
								Celle de la ligne <code>clients</code> du mini-SaaS : c'est elle
								qui détermine l'espace de dépôt.
							</p>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='backup-encryption-key'>
								{status?.encryption_configured
									? 'Remplacer la clé de chiffrement'
									: 'Clé de chiffrement'}
							</Label>
							<div className='relative'>
								<Input
									id='backup-encryption-key'
									type={showEncryptionKey ? 'text' : 'password'}
									placeholder='64 caractères hexadécimaux'
									value={encryptionKey}
									onChange={(e) => setEncryptionKey(e.target.value)}
									className='pr-10 font-mono'
									autoComplete='off'
								/>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='absolute right-0 top-0 h-full px-3'
									onClick={() => setShowEncryptionKey(!showEncryptionKey)}
								>
									{showEncryptionKey ? (
										<EyeOff className='h-4 w-4' />
									) : (
										<Eye className='h-4 w-4' />
									)}
								</Button>
							</div>

							<div className='flex flex-wrap gap-2'>
								<Button
									type='button'
									variant='outline'
									size='sm'
									onClick={handleGenerate}
								>
									<Key className='mr-2 h-4 w-4' />
									Générer
								</Button>
								{status?.encryption_configured && (
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={handleReveal}
										disabled={reveal.isPending}
									>
										{reveal.isPending ? (
											<Loader2 className='mr-2 h-4 w-4 animate-spin' />
										) : (
											<Eye className='mr-2 h-4 w-4' />
										)}
										Afficher celle de ce poste
									</Button>
								)}
							</div>

							{revealedKey && (
								<div className='space-y-2 rounded-md border border-amber-400 bg-amber-50 p-3'>
									<code className='block break-all font-mono text-xs'>
										{revealedKey}
									</code>
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={() => {
											navigator.clipboard.writeText(revealedKey)
											toast.success('Clé copiée')
										}}
									>
										Copier
									</Button>
								</div>
							)}

							<p className='text-xs text-amber-600'>
								Le serveur ne l'a pas —{' '}
								<strong>la perdre perd toutes les sauvegardes</strong>. À
								conserver hors de ce poste.
							</p>
						</div>

						{/* ── Clé super-admin ─────────────────────────────────
						    Rien à voir avec les deux précédentes : celles-là
						    concernent CE poste, celle-ci est la clé de
						    l'ÉDITEUR et vaut pour tous les clients. */}
						<div className='space-y-2 border-t pt-4'>
							<Label htmlFor='backup-super-key'>
								Clé super-admin{' '}
								<span className='font-normal text-muted-foreground'>
									(optionnelle)
								</span>
							</Label>
							<div className='relative'>
								<Input
									id='backup-super-key'
									type={showSuperKey ? 'text' : 'password'}
									placeholder='64 caractères hexadécimaux'
									value={superKey}
									onChange={(e) => setSuperKey(e.target.value)}
									className='pr-10 font-mono'
									autoComplete='off'
								/>
								<Button
									type='button'
									variant='ghost'
									size='icon'
									className='absolute right-0 top-0 h-full px-3'
									onClick={() => setShowSuperKey(!showSuperKey)}
								>
									{showSuperKey ? (
										<EyeOff className='h-4 w-4' />
									) : (
										<Eye className='h-4 w-4' />
									)}
								</Button>
							</div>
							<p className='text-xs text-muted-foreground'>
								Créée dans le mini-SaaS, onglet « Clés super-admin ». Elle
								permet de <strong>lire et supprimer</strong> les sauvegardes de
								tous les clients — jamais d'en déposer. Sa présence fait
								apparaître l'inventaire distant ci-dessous.
							</p>
						</div>

						<div className='flex items-center justify-between gap-2'>
							{status?.configured ? (
								<Button
									variant='ghost'
									size='sm'
									onClick={handleDelete}
									disabled={deleteKey.isPending}
									className='text-destructive hover:text-destructive'
								>
									{deleteKey.isPending ? (
										<Loader2 className='mr-2 h-4 w-4 animate-spin' />
									) : (
										<Trash2 className='mr-2 h-4 w-4' />
									)}
									Supprimer la clé API
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
					</div>
				)}
				{/* ── Ce que le serveur détient ───────────────────────────────
				    N'apparaît qu'avec la clé super-admin : c'est ce qu'elle
				    débloque, et sa seule raison d'être sur un poste. */}
				{status?.super_configured && (
					<div className='space-y-3 rounded-md border p-4'>
						<div className='flex items-center justify-between gap-2'>
							<h4 className='text-sm font-medium'>
								Sauvegardes sur le serveur
							</h4>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => distants.refetch()}
								disabled={distants.isFetching}
							>
								<RefreshCw
									className={`mr-2 h-4 w-4 ${distants.isFetching ? 'animate-spin' : ''}`}
								/>
								Actualiser
							</Button>
						</div>

						{distants.isLoading ? (
							<Loader2 className='h-4 w-4 animate-spin' />
						) : distants.error ? (
							<p className='text-sm text-amber-600'>
								{(distants.error as any).message || 'Inventaire indisponible'}
							</p>
						) : !distants.data?.snapshots?.length ? (
							<p className='text-sm text-muted-foreground'>
								Aucune sauvegarde sur le serveur.
							</p>
						) : (
							<div className='overflow-x-auto'>
								<table className='w-full text-sm'>
									<thead>
										<tr className='text-left text-xs text-muted-foreground'>
											<th className='pb-2 pr-3'>Identifiant</th>
											<th className='pb-2 pr-3'>Client</th>
											<th className='pb-2 pr-3'>Poste</th>
											<th className='pb-2 pr-3'>Taille</th>
											<th className='pb-2 pr-3'>Créé le (UTC)</th>
											<th className='pb-2' />
										</tr>
									</thead>
									<tbody>
										{distants.data.snapshots.map((snap) => (
											<tr key={snap.snapshot_id} className='border-t'>
												{/* Affiché en entier et sélectionnable : c'est ce
												    qu'il faut retaper pour confirmer une
												    restauration ou une suppression. Le cacher
												    rendait les deux gestes impossibles. */}
												<td className='py-2 pr-3 font-mono text-xs select-all'>
													{snap.snapshot_id}
												</td>
												<td className='py-2 pr-3'>{snap.client_name}</td>
												<td className='py-2 pr-3 text-muted-foreground'>
													{snap.origin || '—'}
												</td>
												<td className='py-2 pr-3'>
													{Math.round(snap.plain_size / 1024)} Kio
												</td>
												<td className='py-2 pr-3 font-mono text-xs'>
													{snap.created_at}
												</td>
												<td className='py-2 text-right whitespace-nowrap'>
													<Button
														variant='ghost'
														size='sm'
														onClick={() => handleRestaurer(snap)}
														disabled={
															preparerRestauration.isPending ||
															!!restauration.data?.pending
														}
														title={
															restauration.data?.pending
																? 'Une restauration est déjà préparée'
																: 'Restaurer cette sauvegarde'
														}
													>
														{preparerRestauration.isPending ? (
															<Loader2 className='h-4 w-4 animate-spin' />
														) : (
															<History className='h-4 w-4' />
														)}
													</Button>
													<Button
														variant='ghost'
														size='sm'
														className='text-destructive hover:text-destructive'
														onClick={() => handleSupprimerDistant(snap)}
														disabled={supprimerDistant.isPending}
													>
														<Trash2 className='h-4 w-4' />
													</Button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}

						<p className='text-xs text-muted-foreground'>
							L'icône <History className='inline h-3 w-3' /> prépare une{' '}
							<strong>restauration</strong> : le snapshot est téléchargé,
							déchiffré et son empreinte vérifiée, puis déposé à côté de la
							base. Le remplacement a lieu <strong>au redémarrage</strong> — une
							base ouverte ne se remplace pas. L'ancienne est archivée, jamais
							effacée.
						</p>
					</div>
				)}

				{/* ── Miroir des images ───────────────────────────────────────
				    Le snapshot ne porte AUCUN octet d'image. Ce bloc gère le
				    complément : déclarer ce qu'on détient déjà, et rapatrier
				    ce qu'on n'a pas. */}
				{status?.super_configured && (
					<div className='space-y-3 rounded-md border p-4'>
						<h4 className='flex items-center gap-2 text-sm font-medium'>
							<Images className='h-4 w-4' />
							Images (miroir différentiel)
						</h4>

						<p className='text-sm text-muted-foreground'>
							{storageLocal.isLoading ? (
								<Loader2 className='h-4 w-4 animate-spin' />
							) : storageLocal.error ? (
								'Inventaire local indisponible'
							) : (
								<>
									Ce poste détient{' '}
									<strong>{storageLocal.data?.count ?? 0} fichiers</strong> (
									{Math.round((storageLocal.data?.bytes ?? 0) / 1048576)} Mio).
								</>
							)}
						</p>

						{/* Un client par ligne, déduit de l'inventaire des snapshots :
						    ce sont exactement ceux dont on détient quelque chose. */}
						{Array.from(
							new Map(
								(distants.data?.snapshots ?? []).map((snap) => [
									snap.client_id,
									snap.client_name,
								]),
							).entries(),
						).map(([clientId, clientNom]) => (
							<LigneMiroirClient
								key={clientId}
								clientId={clientId}
								clientNom={clientNom}
								actif={!!status?.super_configured}
								declarationEnCours={declarerSocle.isPending}
								rapatriementEnCours={rapatrier.isPending}
								onDeclarer={() => handleDeclarerSocle(clientId, clientNom)}
								onRapatrier={() => handleRapatrier(clientId, clientNom)}
							/>
						))}

						<p className='text-xs text-muted-foreground'>
							<strong>Déclarer le socle</strong> annonce au serveur que vous
							détenez déjà ces fichiers : aucun octet ne part, seulement les
							chemins, et le poste de ce client ne les enverra jamais. À faire{' '}
							<strong>avant</strong> sa première sauvegarde, sinon il
							téléversera tout. <strong>Rapatrier</strong> descend les images
							que le serveur détient et que ce poste n'a pas — sans jamais
							écraser un fichier existant.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
