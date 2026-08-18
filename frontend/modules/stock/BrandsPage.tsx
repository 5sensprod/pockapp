// frontend/modules/stock/BrandsPage.tsx
//
// LA PREMIÈRE ENTITÉ BRANCHÉE SUR POCKETBASE — 13 août 2026.
//
// Écran de GESTION des marques : il lit et écrit `brands` dans PocketBase, et
// nulle part ailleurs. C'est l'application de la décision « source explicite,
// par entité » (docs/DECISIONS.md, 2026-08-13) : rien ici ne dépend d'un
// drapeau d'environnement, la source est celle des hooks importés et elle se
// lit dans le code.
//
// Ne pas confondre avec le panneau « Marques » du catalogue produits
// (`components/BrandFilterPanel.tsx`), qui n'est PAS le même besoin : celui-là
// filtre une liste de produits venus d'AppPos, et il reçoit ses marques en
// props. Deux rôles distincts, donc deux composants — le §4 du rituel de
// migration autorise ce cas, à condition de le dire, et c'est ce paragraphe.

import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Building2 } from 'lucide-react'

import { BrandList } from './components/BrandList'

export function BrandsPage() {
	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Building2 className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Marques</h1>
				</div>
				<p className='text-muted-foreground'>
					Les marques du catalogue <strong>PocketBase</strong>, pas d’AppPos. Le
					nom et la description sont ceux que le site affichera ; le slug, lui,
					est figé au premier envoi et ne s’édite pas.
				</p>
			</div>

			{/* Le même avertissement que dans l'éditeur du site, et pour la même
			    raison : tant que le catalogue est une projection rechargée par purge,
			    une saisie est un essai. Le taire ici et le dire là-bas n'aurait aucun
			    sens — c'est la même base. */}
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

			<BrandList />
		</div>
	)
}
