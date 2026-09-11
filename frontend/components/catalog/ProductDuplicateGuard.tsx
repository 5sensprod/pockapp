// Avertissement de doublon produit, partagé par la fiche détail, la création en
// caisse et la fiche d'occasion d'un dépôt. Rien n'est bloqué : désignation,
// référence et code-barres identiques AVERTISSENT, le vendeur tranche.
// Règle de comparaison : `backend/routes/product_duplicates_routes.go`.

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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

function Matches({ matches }: { matches: ProductDuplicate[] }) {
	return (
		<ul className='max-h-56 space-y-2 overflow-auto text-sm'>
			{matches.map(({ product, fields }) => (
				<li key={product.id}>
					<Link
						to='/stock/produits/$productId'
						params={{ productId: product.id }}
						target='_blank'
						rel='noopener noreferrer'
						className='font-medium underline'
					>
						{product.designation || product.name || product.sku} — ouvrir la
						fiche ↗
					</Link>
					<p className='text-muted-foreground'>
						{fields.map((field) => DUPLICATE_LABELS[field]).join(', ')}{' '}
						identique{fields.length > 1 ? 's' : ''} ·{' '}
						{product.status === 'published' ? 'Publié' : 'Non publié'}
						{product.sku ? ` · Réf. ${product.sku}` : ''}
						{product.barcode ? ` · ${product.barcode}` : ''}
					</p>
				</li>
			))}
		</ul>
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
		if (!fresh.length) return true
		setReview(fresh)
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
						Produit déjà présent ? Vérifiez ces fiches avant de continuer.
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
				{review && <Matches matches={review} />}
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
