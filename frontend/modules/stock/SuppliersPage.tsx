// frontend/modules/stock/SuppliersPage.tsx
//
// TROISIÈME ET DERNIÈRE ENTITÉ ANNEXE BRANCHÉE SUR POCKETBASE — 13 août 2026.
// Les produits, eux, restent sur AppPos : c'est l'étape 3.
//
// Écran de GESTION des fournisseurs : lit et écrit `suppliers` dans PocketBase,
// et nulle part ailleurs (docs/DECISIONS.md, 2026-08-13).
//
// ⚠️ C'est l'entité dont le formulaire était le plus faux : il décrivait le
// schéma v1 (`email`, `phone`, `address`, `contact`, `notes`, `active`), dont
// aucun champ n'existe dans la collection installée. Refait le 13 août 2026 sur
// `supplier_code`, `siren`, `contact_*` et `brands` — §6bis.2 du rituel. C'est
// donc l'écran à regarder de plus près : sa saisie n'a jamais été vue à l'œuvre.

import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Truck } from 'lucide-react'

import { SupplierList } from './components/SupplierList'

export function SuppliersPage() {
	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Truck className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Fournisseurs</h1>
				</div>
				<p className='text-muted-foreground'>
					Les fournisseurs du catalogue <strong>PocketBase</strong>, pas
					d’AppPos. Un fournisseur porte les marques qu’il distribue : c’est ce
					lien qui les relie au catalogue, et non le produit.
				</p>
			</div>

			<Card className='mb-6 border-amber-500/40'>
				<CardContent className='flex items-start gap-3 pt-6'>
					<AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
					<div className='text-sm'>
						<p className='font-medium'>
							Un rechargement du catalogue efface ces saisies
						</p>
						<p className='text-muted-foreground'>
							<code>catalog-import -load</code> purge les collections et les
							réécrit depuis NeDB. Tant que l’import n’est pas définitif, ce qui
							est modifié ici est un essai.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Deux champs de la collection ne sont PAS dans le formulaire —
			    `banking` et `payment_terms`, JSON libres sans forme contrainte. Le
			    dire ici évite qu'on les croie perdus : une mise à jour PocketBase est
			    partielle, ils restent en place. */}
			<p className='mb-4 text-muted-foreground text-xs'>
				Les coordonnées bancaires et les conditions de règlement ne sont pas
				éditables ici : ce sont des champs libres, sans forme définie au schéma.
				Elles sont conservées telles quelles à l’enregistrement.
			</p>

			<SupplierList />
		</div>
	)
}
