// frontend/components/settings/FacebookSection.tsx
//
// « Clés API & Secrets » → la Page Facebook du magasin, pour « Publier sur
// Facebook » de l'éditeur d'affiches. Doc :
// `modules/stick/PocketStick-docs/16-publication-facebook.md`.
//
// PHASE 1 : pas de fenêtre de connexion Facebook. Un administrateur génère un
// jeton utilisateur dans les outils de Meta et le colle ici UNE fois ; le
// serveur PocketApp l'échange, lit les Pages et garde le jeton de la Page
// choisie. Le jeton collé n'est gardé nulle part — ni ici (le champ est vidé
// dès l'envoi), ni sur le poste —, et aucun jeton ne revient à cet écran.
//
// Réservé aux administrateurs, comme tout cet écran : les routes le vérifient.

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
import {
	useFacebookChoisir,
	useFacebookConnecter,
	useFacebookDeconnecter,
	useFacebookEtat,
} from '@/lib/queries/facebook'
import {
	AlertCircle,
	CheckCircle2,
	Facebook,
	Loader2,
	Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const dateLisible = (iso: string | null) => {
	const d = iso ? new Date(iso) : null
	return d && !Number.isNaN(d.getTime())
		? d.toLocaleDateString('fr-FR', {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			})
		: null
}

export default function FacebookSection() {
	const { data: etat, isLoading, error } = useFacebookEtat()
	const connecter = useFacebookConnecter()
	const choisir = useFacebookChoisir()
	const deconnecter = useFacebookDeconnecter()

	const [jeton, setJeton] = useState('')

	const handleConnecter = async () => {
		const colle = jeton.trim()
		if (!colle) return
		// Le champ est vidé AVANT la réponse : le jeton ne reste pas à l'écran
		setJeton('')
		try {
			const rendu = await connecter.mutateAsync(colle)
			toast.success(
				rendu.connecte && rendu.aChoisir.length === 0
					? `Connecté à la Page « ${rendu.page?.nom} »`
					: 'Jeton accepté : choisissez la Page',
			)
		} catch (e: any) {
			toast.error(e.message || 'La connexion à Facebook a échoué')
		}
	}

	const handleChoisir = async (id: string) => {
		try {
			const rendu = await choisir.mutateAsync(id)
			toast.success(`Les affiches seront publiées sur « ${rendu.page?.nom} »`)
		} catch (e: any) {
			toast.error(e.message || "La Page n'a pas pu être choisie")
		}
	}

	const handleDeconnecter = async () => {
		if (
			!confirm(
				'Déconnecter la Page Facebook ? Plus aucun poste ne pourra publier tant qu’un jeton ne sera pas collé de nouveau.',
			)
		)
			return
		try {
			await deconnecter.mutateAsync()
			toast.success('Page Facebook déconnectée')
		} catch (e: any) {
			toast.error(e.message || 'La déconnexion a échoué')
		}
	}

	const depuis = dateLisible(etat?.depuis ?? null)
	const occupe = connecter.isPending || choisir.isPending

	return (
		<Card>
			<CardHeader>
				<CardTitle className='flex items-center gap-2'>
					<Facebook className='h-5 w-5' />
					Page Facebook (publication des affiches)
				</CardTitle>
				<CardDescription>
					La Page sur laquelle l'éditeur d'affiches publie. La connexion se fait
					une fois, ici ; tous les postes publient ensuite, après un aperçu et
					une confirmation. Le jeton de la Page est gardé chiffré sur le serveur
					PocketApp : il ne descend jamais sur ce poste.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div className='flex items-center gap-2'>
					{isLoading ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : etat?.connecte ? (
						<>
							<CheckCircle2 className='h-4 w-4 text-green-500' />
							<span className='text-sm text-green-600'>
								Connecté à « {etat.page?.nom} »
								{depuis ? ` depuis le ${depuis}` : ''}
							</span>
						</>
					) : (
						<>
							<AlertCircle className='h-4 w-4 text-amber-500' />
							<span className='text-sm text-amber-600'>
								{error ? (error as Error).message : 'Aucune Page connectée'}
							</span>
						</>
					)}
				</div>

				{etat && !etat.configure && (
					<p className='text-xs text-amber-600'>
						Le serveur PocketApp n'a pas encore les secrets de l'application
						Facebook : la connexion sera refusée tant qu'ils n'y sont pas
						déposés.
					</p>
				)}

				{etat && etat.aChoisir.length > 0 && (
					<div className='space-y-2'>
						<Label>
							{etat.connecte
								? 'Publier sur une autre Page'
								: 'Choisissez la Page du magasin'}
						</Label>
						<ul className='space-y-1'>
							{etat.aChoisir.map((page) => (
								<li
									key={page.id}
									className='flex items-center justify-between gap-2 rounded-md border px-3 py-2'
								>
									<span className='truncate text-sm'>{page.nom}</span>
									<Button
										size='sm'
										variant='outline'
										onClick={() => handleChoisir(page.id)}
										disabled={occupe}
									>
										Choisir
									</Button>
								</li>
							))}
						</ul>
						<p className='text-xs text-muted-foreground'>
							Ce choix reste proposé un quart d'heure ; les jetons des Pages non
							retenues sont effacés.
						</p>
					</div>
				)}

				<div className='space-y-2'>
					<Label htmlFor='facebook-jeton'>
						{etat?.connecte
							? 'Nouveau jeton (pour reconnecter ou changer de Page)'
							: 'Jeton utilisateur'}
					</Label>
					<Input
						id='facebook-jeton'
						type='password'
						placeholder='EAA…'
						value={jeton}
						onChange={(e) => setJeton(e.target.value)}
						autoComplete='off'
					/>
					<p className='text-xs text-muted-foreground'>
						À générer dans l'explorateur de l'API Graph de Meta, pour
						l'application du magasin, avec les permissions{' '}
						<code>pages_show_list</code>, <code>pages_read_engagement</code> et{' '}
						<code>pages_manage_posts</code>. Il ne sert qu'une fois : il n'est
						enregistré nulle part.
					</p>
				</div>

				<div className='flex items-center justify-between gap-2'>
					{etat?.connecte || (etat?.aChoisir.length ?? 0) > 0 ? (
						<Button
							variant='destructive'
							size='sm'
							onClick={handleDeconnecter}
							disabled={deconnecter.isPending}
						>
							{deconnecter.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Trash2 className='mr-2 h-4 w-4' />
							)}
							Déconnecter
						</Button>
					) : (
						<span />
					)}

					<Button onClick={handleConnecter} disabled={occupe || !jeton.trim()}>
						{connecter.isPending && (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						)}
						Connecter
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
