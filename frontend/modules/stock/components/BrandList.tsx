import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
	Table as UiTable,
	TableBody as UiTableBody,
	TableCell as UiTableCell,
	TableHead as UiTableHead,
	TableHeader as UiTableHeader,
	TableRow as UiTableRow,
} from '@/components/ui/table'
import {
	Copy,
	Globe,
	ImageIcon,
	Package,
	Pencil,
	Plus,
	Search,
	Trash2,
	Truck,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands, useDeleteBrand } from '@/lib/queries/brands'
import type { CatalogBrandShape } from '@/lib/queries/catalog-shapes'
import { useProductCountsByBrand } from '@/lib/queries/products'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { toast } from 'sonner'
import { BrandDialog } from './BrandDialog'

export function BrandList() {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase()
	const {
		data: brands,
		isLoading,
		refetch,
	} = useBrands({ companyId: activeCompanyId ?? undefined })
	// Le décompte porte sur TOUT le catalogue, pas sur une page de produits —
	// voir le commentaire de `useProductCountsByBrand`.
	const { data: productCountByBrand } = useProductCountsByBrand(
		activeCompanyId ?? undefined,
	)
	const { data: suppliers } = useSuppliers({
		companyId: activeCompanyId ?? undefined,
	})
	const deleteBrand = useDeleteBrand()

	const [search, setSearch] = useState('')
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editBrand, setEditBrand] = useState<CatalogBrandShape | null>(null)

	const [confirmOpen, setConfirmOpen] = useState(false)
	const [brandToDelete, setBrandToDelete] = useState<CatalogBrandShape | null>(
		null,
	)

	// ── LE TRI, ET POURQUOI IL EST REFAIT ICI ────────────────────────────────
	//
	// `useBrands` demande `sort: 'name'` à PocketBase, qui trie en SQLite avec la
	// collation BINAIRE : toutes les majuscules passent avant toutes les
	// minuscules. `CORDOBA` se retrouve donc rang 53 et `Cordoba` rang 62, dans
	// deux blocs séparés de la liste — et un doublon de casse devient invisible
	// alors qu'on regarde exactement au bon endroit. Mesuré le 21 août 2026 sur
	// les 288 marques ; c'est ce qui a fait conclure à tort que l'écran cachait
	// des lignes.
	//
	// Un tri insensible à la casse rend les jumelles ADJACENTES. Il se fait ici,
	// pas dans la requête : PocketBase n'expose pas de collation par champ, et
	// 288 lignes déjà chargées se trient localement pour rien du tout.
	const sortedBrands = useMemo(() => {
		return [...(brands ?? [])].sort(
			(a, b) =>
				a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) ||
				(a.slug ?? '').localeCompare(b.slug ?? ''),
		)
	}, [brands])

	/** Les noms portés par PLUSIEURS marques, à la casse près. Sept paires au
	 *  21 août 2026, héritées de l'import NeDB. Le doublon est un fait de la
	 *  base : l'écran le SIGNALE, il ne le corrige pas et n'en cache aucune. */
	const duplicateNames = useMemo(() => {
		const seen = new Map<string, number>()
		for (const brand of sortedBrands) {
			const key = brand.name.trim().toLowerCase()
			seen.set(key, (seen.get(key) ?? 0) + 1)
		}
		return new Set(
			[...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key),
		)
	}, [sortedBrands])

	/** La recherche porte sur le nom ET le slug — c'est le slug qui distingue
	 *  deux marques homonymes (`cordoba` / `cordoba-2`), le nom ne le peut pas. */
	const visibleBrands = useMemo(() => {
		const needle = search.trim().toLowerCase()
		if (!needle) return sortedBrands
		return sortedBrands.filter(
			(brand) =>
				brand.name.toLowerCase().includes(needle) ||
				(brand.slug ?? '').toLowerCase().includes(needle),
		)
	}, [sortedBrands, search])

	// Refetch quand l'entreprise change
	useEffect(() => {
		if (activeCompanyId) {
			refetch()
		}
	}, [activeCompanyId, refetch])

	// Trouver les fournisseurs par marque
	const suppliersByBrand = useMemo(() => {
		const map: Record<string, string[]> = {}
		if (suppliers) {
			for (const supplier of suppliers) {
				if (supplier.brands?.length) {
					for (const brandId of supplier.brands) {
						if (!map[brandId]) map[brandId] = []
						map[brandId].push(supplier.name)
					}
				}
			}
		}
		return map
	}, [suppliers])

	const handleAdd = () => {
		setEditBrand(null)
		setDialogOpen(true)
	}

	const handleEdit = (brand: CatalogBrandShape) => {
		setEditBrand(brand)
		setDialogOpen(true)
	}

	const askDelete = (brand: CatalogBrandShape) => {
		setBrandToDelete(brand)
		setConfirmOpen(true)
	}

	const confirmDelete = async () => {
		if (!brandToDelete) return
		try {
			await deleteBrand.mutateAsync(brandToDelete.id)
			toast.success(`Marque "${brandToDelete.name}" supprimée`)
		} catch (error) {
			toast.error('Erreur lors de la suppression')
		} finally {
			setConfirmOpen(false)
			setBrandToDelete(null)
		}
	}

	if (isLoading) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				Chargement...
			</div>
		)
	}

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div className='flex items-baseline gap-3'>
					{/* Le décompte dit TOUJOURS le total chargé, et le filtre s'affiche
					    en plus. Un écran qui n'annonce que ce qu'il montre laisse
					    croire qu'il montre tout. */}
					<h2 className='font-semibold text-lg'>
						Marques ({brands?.length ?? 0})
					</h2>
					{search.trim() !== '' && (
						<span className='text-muted-foreground text-sm'>
							{visibleBrands.length} affichée(s)
						</span>
					)}
					{duplicateNames.size > 0 && (
						<button
							type='button'
							onClick={() => setSearch('')}
							className='text-amber-600 text-sm hover:underline'
						>
							{duplicateNames.size} nom(s) en double
						</button>
					)}
				</div>
				<div className='flex items-center gap-2'>
					<div className='relative'>
						<Search className='-translate-y-1/2 absolute top-1/2 left-2 h-4 w-4 text-muted-foreground' />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder='Nom ou slug…'
							className='w-56 pl-8'
						/>
					</div>
					<Button onClick={handleAdd}>
						<Plus className='mr-2 h-4 w-4' />
						Nouvelle marque
					</Button>
				</div>
			</div>

			{!visibleBrands.length ? (
				<div className='py-12 text-center text-muted-foreground'>
					{brands?.length ? 'Aucune marque ne correspond' : 'Aucune marque'}
				</div>
			) : (
				<div className='rounded-md border'>
					<UiTable>
						<UiTableHeader>
							<UiTableRow>
								<UiTableHead className='w-[64px]' />
								<UiTableHead>Marque</UiTableHead>
								<UiTableHead>Slug</UiTableHead>
								<UiTableHead>Description</UiTableHead>
								<UiTableHead className='w-[100px]'>Actions</UiTableHead>
							</UiTableRow>
						</UiTableHeader>
						<UiTableBody>
							{visibleBrands.map((brand) => {
								const productCount = productCountByBrand?.[brand.id] ?? 0
								const isDuplicate = duplicateNames.has(
									brand.name.trim().toLowerCase(),
								)
								const brandSuppliers = suppliersByBrand[brand.id] || []

								// `image` est un nom de fichier ; PocketBase le sert.
								// 225 des 287 marques en portent un — jamais affiché avant le
								// 18 août 2026.
								const logoUrl = brand.image
									? pb.files.getUrl(brand, brand.image)
									: null

								return (
									<UiTableRow key={brand.id}>
										<UiTableCell>
											<div className='flex h-10 w-10 items-center justify-center overflow-hidden rounded-md bg-muted'>
												{logoUrl ? (
													<img
														src={logoUrl}
														alt={brand.name}
														className='h-full w-full object-contain'
													/>
												) : (
													<ImageIcon className='h-4 w-4 text-muted-foreground' />
												)}
											</div>
										</UiTableCell>
										<UiTableCell>
											<div className='space-y-0.5'>
												<div className='flex items-center gap-2'>
													<span className='font-medium'>{brand.name}</span>
													{/* Deux marques homonymes ne se distinguent QUE par
													    leur slug — et le nom seul est ce qu'on lit
													    partout ailleurs (pastilles fournisseur, menu
													    marque du dialogue produit). Le dire ici évite
													    d'agir sur la mauvaise. */}
													{isDuplicate && (
														<Badge
															variant='outline'
															className='border-amber-500/50 text-amber-600 text-xs'
														>
															<Copy className='mr-1 h-3 w-3' />
															doublon
														</Badge>
													)}
												</div>
												<div className='flex items-center gap-3 text-xs'>
													<div className='flex items-center gap-1 text-muted-foreground'>
														<Package className='h-3 w-3' />
														<span>
															{productCount}{' '}
															{productCount > 1 ? 'produits' : 'produit'}
														</span>
													</div>
													{brandSuppliers.length > 0 && (
														<div className='flex items-center gap-1 text-orange-600'>
															<Truck className='h-3 w-3' />
															<span>{brandSuppliers.join(', ')}</span>
														</div>
													)}
												</div>
											</div>
										</UiTableCell>
										{/* `website` n'existe plus au schéma — la colonne montre
										    désormais le SLUG, qui est ce que la marque devient dans
										    une URL du site. Le logo, lui, est en première colonne
										    depuis le 18 août 2026. */}
										<UiTableCell>
											{brand.slug ? (
												<span className='flex items-center gap-1 font-mono text-muted-foreground text-xs'>
													<Globe className='h-3 w-3' />
													{brand.slug}
												</span>
											) : (
												<span className='text-muted-foreground'>-</span>
											)}
										</UiTableCell>
										<UiTableCell className='max-w-[300px] truncate'>
											{brand.description || (
												<span className='text-muted-foreground'>-</span>
											)}
										</UiTableCell>
										<UiTableCell>
											<div className='flex gap-1'>
												<Button
													variant='ghost'
													size='icon'
													onClick={() => handleEdit(brand)}
												>
													<Pencil className='h-4 w-4' />
												</Button>
												<Button
													variant='ghost'
													size='icon'
													className='text-red-600'
													onClick={() => askDelete(brand)}
												>
													<Trash2 className='h-4 w-4' />
												</Button>
											</div>
										</UiTableCell>
									</UiTableRow>
								)
							})}
						</UiTableBody>
					</UiTable>
				</div>
			)}

			<BrandDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				brand={editBrand}
			/>

			<Dialog
				open={confirmOpen}
				onOpenChange={(open) => {
					setConfirmOpen(open)
					if (!open) setBrandToDelete(null)
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Supprimer cette marque ?</DialogTitle>
						<DialogDescription>
							{brandToDelete ? `"${brandToDelete.name}" sera supprimée.` : ''}
						</DialogDescription>
					</DialogHeader>
					<div className='flex justify-end gap-2 pt-4'>
						<Button variant='outline' onClick={() => setConfirmOpen(false)}>
							Annuler
						</Button>
						<Button variant='destructive' onClick={confirmDelete}>
							Supprimer
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
