// Avertissement de doublon produit, partagé par la fiche détail, la création en
// caisse et la fiche d'occasion d'un dépôt. Rien n'est bloqué : désignation,
// référence et code-barres identiques AVERTISSENT, un nom semblable aussi, le
// vendeur tranche. Règle de comparaison, ordre et seuil fort :
// `backend/routes/product_duplicates_routes.go` et `product_similarity.go`.
// L'écran ne recalcule rien : il affiche l'ordre et `strong` tels que rendus.

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DUPLICATE_LABELS,
	type ProductDuplicate,
	type ProductIdentity,
	fetchProductDuplicates,
	hasProductIdentity,
} from '@/lib/queries/product-duplicates'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { usePocketBase } from '@/lib/use-pocketbase'
import { formatCurrency } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// Une fiche, repliée : le nom et la raison. Dépliée : de quoi trancher sur
// place. Pas de lien vers la fiche — sous Wails, `target='_blank'` ouvrait une
// seconde fenêtre de l'application au milieu d'une saisie.
function MatchItem({ match }: { match: ProductDuplicate }) {
	const pb = usePocketBase()
	const { product, fields, kind } = match
	const vignette = product.image
		? pb.files.getUrl(
				{ id: product.id, collectionName: 'products' },
				product.image,
				{ thumb: '100x100' },
			)
		: ''
	const lignes: [string, string][] = [
		['Marque', product.brand],
		['Référence', product.sku],
		['Code-barres', product.barcode],
		['Prix TTC', formatCurrency(product.price_ttc ?? 0)],
		[
			'Stock',
			`${product.stock ?? 0}${product.stock_b ? ` · Stock B : ${product.stock_b}` : ''}`,
		],
		['Site', product.status === 'published' ? 'Publié' : 'Non publié'],
	]
	return (
		<li>
			<details className='group rounded-md border bg-background/70'>
				<summary className='flex cursor-pointer list-none items-baseline gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden'>
					<span className='text-muted-foreground text-xs transition-transform group-open:rotate-90'>
						▸
					</span>
					<span className='font-medium'>
						{product.designation || product.name || product.sku}
					</span>
					<span className='ml-auto shrink-0 text-muted-foreground text-xs'>
						{kind === 'similar'
							? 'Nom semblable'
							: `${fields.map((field) => DUPLICATE_LABELS[field]).join(', ')} identique${fields.length > 1 ? 's' : ''}`}
					</span>
				</summary>
				<div className='flex gap-3 px-2 pt-1 pb-2'>
					{vignette && (
						<img
							src={vignette}
							alt=''
							className='h-16 w-16 shrink-0 rounded object-cover'
						/>
					)}
					<dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs'>
						{lignes.map(([libelle, valeur]) => (
							<div key={libelle} className='contents'>
								<dt className='text-muted-foreground'>{libelle}</dt>
								<dd>{valeur || '—'}</dd>
							</div>
						))}
					</dl>
				</div>
			</details>
		</li>
	)
}

// Les identiques restent visibles ; les noms semblables sont regroupés dans un
// seul pli, fermé dans l'encadré de saisie, ouvert dans le dialogue (où ils ne
// figurent que s'ils sont forts, et sont la raison même de l'interruption).
function Matches({
	matches,
	semblablesOuverts = false,
}: {
	matches: ProductDuplicate[]
	semblablesOuverts?: boolean
}) {
	const identiques = matches.filter((match) => match.kind !== 'similar')
	const semblables = matches.filter((match) => match.kind === 'similar')
	return (
		<div className='max-h-72 space-y-2 overflow-auto text-sm'>
			{identiques.length > 0 && (
				<ul className='space-y-1'>
					{identiques.map((match) => (
						<MatchItem key={match.product.id} match={match} />
					))}
				</ul>
			)}
			{semblables.length > 0 && (
				<details open={semblablesOuverts} className='group/semblables'>
					<summary className='cursor-pointer text-muted-foreground text-xs'>
						{semblables.length} fiche{semblables.length > 1 ? 's' : ''} au nom
						semblable
					</summary>
					<ul className='mt-1 space-y-1'>
						{semblables.map((match) => (
							<MatchItem key={match.product.id} match={match} />
						))}
					</ul>
				</details>
			)}
		</div>
	)
}

/**
 * `feedback` suit la saisie (temporisé) ; `verify` relit la base à la
 * validation et, s'il trouve une autre fiche, ouvre `dialogue` et attend la
 * réponse. Une vérification impossible (route injoignable) n'empêche pas
 * d'enregistrer : elle le dit, et laisse passer.
 */
export function useProductDuplicateGuard(
	identity: ProductIdentity,
	companyId: string | undefined,
	excludeId?: string,
	enabled = true,
) {
	const pb = usePocketBase()
	const identityKey = JSON.stringify([
		identity.designation?.trim() ?? '',
		identity.sku?.trim() ?? '',
		identity.barcode?.trim() ?? '',
		identity.enteredSku?.trim() ?? '',
		identity.enteredBarcode?.trim() ?? '',
	])
	const [settledKey, setSettledKey] = useState(identityKey)
	useEffect(() => {
		const timer = setTimeout(() => setSettledKey(identityKey), 350)
		return () => clearTimeout(timer)
	}, [identityKey])
	const settled = settledKey === identityKey
	const active = enabled && !!companyId && hasProductIdentity(identity)
	const query = useQuery({
		queryKey: ['catalog-product-duplicates', companyId, settledKey, excludeId],
		queryFn: () =>
			fetchProductDuplicates(pb, companyId as string, identity, excludeId),
		enabled: active && settled,
		staleTime: 10_000,
	})
	const matches = active && settled ? (query.data ?? []) : []

	const [review, setReview] = useState<ProductDuplicate[] | null>(null)
	const resolver = useRef<((accepted: boolean) => void) | null>(null)
	useEffect(
		() => () => {
			resolver.current?.(false)
		},
		[],
	)
	const finish = (accepted: boolean) => {
		resolver.current?.(accepted)
		resolver.current = null
		setReview(null)
	}

	const verify = async (
		values: ProductIdentity,
		currentId = excludeId,
	): Promise<boolean> => {
		if (!enabled || !companyId || !hasProductIdentity(values)) return true
		let fresh: ProductDuplicate[]
		try {
			fresh = await fetchProductDuplicates(pb, companyId, values, currentId)
		} catch (error) {
			toast.warning(`Doublons non vérifiés : ${pocketbaseErrorMessage(error)}`)
			return true
		}
		// Seuls les identiques et les ressemblances FORTES interrompent la
		// validation ; les autres sont restés dans l'encadré de saisie. Un
		// dialogue ouvert à chaque nom vaguement proche finirait cliqué sans
		// être lu.
		const forts = fresh.filter((match) => match.strong)
		if (!forts.length) return true
		setReview(forts)
		return new Promise((resolve) => {
			resolver.current = resolve
		})
	}

	const feedback = active ? (
		<div aria-live='polite' className='col-span-full space-y-2 text-sm'>
			{!settled || query.isFetching ? (
				<p className='text-muted-foreground text-xs'>
					Vérification des doublons…
				</p>
			) : query.isError ? (
				<p className='text-destructive text-xs'>
					Impossible de vérifier les doublons. Une nouvelle vérification sera
					faite à la validation.
				</p>
			) : matches.length > 0 ? (
				<div className='space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3'>
					<p className='font-medium'>
						{matches.some((match) => match.kind === 'identical')
							? 'Produit déjà présent ? Vérifiez ces fiches avant de continuer.'
							: 'Des fiches portent un nom semblable. Vérifiez avant de continuer.'}
					</p>
					<Matches matches={matches} />
				</div>
			) : null}
		</div>
	) : null

	const dialogue = (
		<Dialog
			open={review !== null}
			onOpenChange={(open) => {
				if (!open) finish(false)
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Doublon possible</DialogTitle>
					<DialogDescription>
						Ces produits existent déjà. Vérifiez leurs fiches avant de confirmer
						qu’il s’agit bien d’un autre produit.
					</DialogDescription>
				</DialogHeader>
				{review && <Matches matches={review} semblablesOuverts />}
				<DialogFooter>
					<Button type='button' variant='outline' onClick={() => finish(false)}>
						Revenir à la saisie
					</Button>
					<Button type='button' onClick={() => finish(true)}>
						Il s’agit d’un autre produit
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)

	return { verify, feedback, dialogue }
}
