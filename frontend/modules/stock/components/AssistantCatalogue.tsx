// frontend/modules/stock/components/AssistantCatalogue.tsx
//
// LE CHAMP DE L'ASSISTANT, au-dessus de la liste des produits (6 octobre 2026).
// Doc : ../PocketStock-docs/06-assistant-catalogue.md.
//
// Le vendeur écrit une demande ; l'assistant règle les filtres de l'écran, ou
// compte, et dit en une ligne ce qu'il a fait. Trois règles tiennent ici :
//
//   • LA CONVERSATION VIT DANS CE COMPOSANT, et nulle part ailleurs : ni
//     `localStorage`, ni cache de requêtes. Quitter l'écran l'efface ;
//   • le nombre affiché est compté par le filtre de la liste
//     (`compterProduitsDuFiltre`), jamais dit par le modèle ;
//   • l'historique renvoyé au serveur ne porte PAS la phrase affichée (elle
//     contient ce nombre) : un effet y devient « Filtres réglés. ».
//
// L'emplacement et l'allure sont provisoires (décision du propriétaire).

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	type CriteresAssistant,
	type QuestionAssistant,
	TEXTE_EFFET_HISTORIQUE,
	type TourAssistant,
	historiquePourEnvoi,
	phraseAssistant,
	queryDepuisCriteres,
} from '@/lib/catalog/assistant-catalogue'
import {
	compterProduitsDuFiltre,
	demanderAssistantCatalogue,
} from '@/lib/queries/catalog-assistant'
import type { CategoryNode } from '@/lib/queries/category-tree'
import { usePocketBase } from '@/lib/use-pocketbase'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'

const DEMANDE_MAX = 500

function messageDErreur(erreur: unknown): string {
	const reponse = (erreur as { response?: { error?: unknown } })?.response
	return typeof reponse?.error === 'string' && reponse.error
		? reponse.error
		: "L'assistant est injoignable. Réessaie dans un instant."
}

export function AssistantCatalogue({
	companyId,
	categories,
	onFiltrer,
	onAnnuler,
}: {
	companyId?: string
	categories: CategoryNode[]
	/** Pose les critères sur l'écran, à la place de tous ses filtres. */
	onFiltrer: (criteres: CriteresAssistant) => void
	/** Rend les filtres d'avant le dernier réglage. Absent : rien à annuler. */
	onAnnuler?: () => void
}) {
	const pb = usePocketBase()
	const [saisie, setSaisie] = useState('')
	const [enCours, setEnCours] = useState(false)
	const [tours, setTours] = useState<TourAssistant[]>([])
	const [derniers, setDerniers] = useState<Record<string, unknown>>()
	const [reponse, setReponse] = useState<{
		texte: string
		erreur?: boolean
		question?: QuestionAssistant
	} | null>(null)

	const demander = async (brut: string) => {
		const message = brut.trim()
		if (!message || !companyId || enCours) return
		setEnCours(true)
		setSaisie('')
		try {
			const rendu = await demanderAssistantCatalogue(pb, {
				message,
				company: companyId,
				historique: historiquePourEnvoi(tours),
				derniers,
			})
			let texte = rendu.texte
			let pourHistorique = rendu.texte
			if (rendu.effet) {
				const total = await compterProduitsDuFiltre(
					pb,
					queryDepuisCriteres(rendu.effet.criteres, categories, companyId),
				)
				if (rendu.effet.action === 'filtrer') onFiltrer(rendu.effet.criteres)
				texte = phraseAssistant(rendu.effet, total)
				pourHistorique = TEXTE_EFFET_HISTORIQUE[rendu.effet.action]
				setDerniers(rendu.effet.reglages)
			}
			setReponse({ texte, question: rendu.question })
			setTours((avant) =>
				historiquePourEnvoi([
					...avant,
					{ role: 'user', texte: message },
					{ role: 'model', texte: pourHistorique },
				]),
			)
		} catch (erreur) {
			setSaisie(message)
			setReponse({ texte: messageDErreur(erreur), erreur: true })
		} finally {
			setEnCours(false)
		}
	}

	const envoyer = (event: FormEvent) => {
		event.preventDefault()
		void demander(saisie)
	}

	return (
		<div className='mt-2 space-y-1.5'>
			<form onSubmit={envoyer} className='flex min-w-0 items-center gap-2'>
				<div className='relative min-w-0 flex-1 lg:max-w-2xl'>
					<Sparkles className='-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-primary' />
					<Input
						value={saisie}
						onChange={(event) => setSaisie(event.target.value)}
						maxLength={DEMANDE_MAX}
						disabled={enCours || !companyId}
						placeholder='Demander : « les guitares classiques Prodipe entre 0 et 500 € », « combien de Yamaha ? »'
						aria-label="Demander à l'assistant du catalogue"
						className='h-9 pl-9'
					/>
				</div>
				<Button
					type='submit'
					size='sm'
					className='h-9 shrink-0'
					disabled={enCours || !saisie.trim() || !companyId}
				>
					{enCours ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Demander'}
				</Button>
			</form>

			{reponse && (
				<div
					className='flex min-w-0 flex-wrap items-center gap-2 text-sm'
					aria-live='polite'
				>
					<span
						className={
							reponse.erreur ? 'text-destructive' : 'text-muted-foreground'
						}
					>
						{reponse.texte}
					</span>
					{reponse.question?.candidats.map((candidat) => (
						<button
							type='button'
							key={candidat.chemin}
							disabled={enCours}
							onClick={() => void demander(candidat.chemin)}
							className='inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 font-medium text-primary text-xs shadow-sm transition-colors hover:bg-accent disabled:opacity-50'
						>
							{candidat.chemin}
							<span className='text-muted-foreground tabular-nums'>
								{candidat.total}
							</span>
						</button>
					))}
					{onAnnuler && !reponse.erreur && !reponse.question && (
						<button
							type='button'
							onClick={() => {
								onAnnuler()
								setReponse({ texte: 'Filtres d’avant rétablis.' })
								setDerniers(undefined)
							}}
							className='inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-primary text-xs hover:bg-accent'
						>
							<Undo2 className='h-3.5 w-3.5' />
							Annuler
						</button>
					)}
				</div>
			)}
		</div>
	)
}
