// frontend/modules/stock/CategoriesPage.tsx
//
// DEUXIÈME ENTITÉ BRANCHÉE SUR POCKETBASE — 13 août 2026, après les marques.
//
// Écran de GESTION des catégories : lit et écrit `categories` dans PocketBase,
// et nulle part ailleurs (décision « source explicite, par entité »,
// docs/DECISIONS.md, 2026-08-13).
//
// Ne pas confondre avec `components/CategoryTreeAppPos.tsx`, qui filtre la
// liste des produits venus d'AppPos : même forme, autre rôle — comme pour les
// marques (`BrandFilterPanel`). Tant que les produits viennent d'AppPos, le
// panneau de filtre doit lire AppPos, sinon les identifiants ne correspondent
// plus et le filtre ne rend rien.

import { Card, CardContent } from '@/components/ui/card'
import { Tags } from 'lucide-react'

import { CategoryTree } from './components/CategoryTree'

export function CategoriesPage() {
	return (
		<div className='container mx-auto px-6 py-8'>
			<div className='mb-6'>
				<div className='mb-2 flex items-center gap-3'>
					<div className='flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10'>
						<Tags className='h-6 w-6 text-primary' />
					</div>
					<h1 className='font-bold text-3xl'>Catégories</h1>
				</div>
				<p className='text-muted-foreground'>
					Organisez l’arborescence du catalogue. Le compteur distingue ce qui
					est rattaché à la catégorie même de ce que toute sa branche emporte.
				</p>
			</div>

			<Card>
				<CardContent className='max-h-[70vh] overflow-y-auto p-0'>
					<CategoryTree />
				</CardContent>
			</Card>
		</div>
	)
}
