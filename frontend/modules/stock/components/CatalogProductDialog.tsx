// frontend/modules/stock/components/CatalogProductDialog.tsx
//
// L'ÉDITION D'UN PRODUIT POCKETBASE — ouverte le 13 août 2026.
//
// Écrit dans PocketBase, et nulle part ailleurs. **AppPos n'est jamais touché**
// — la caisse en dépend jusqu'à la release, et c'est ce qui rend cette écriture
// sûre (docs/DECISIONS.md, 2026-08-13 : « AppPos sort de la logique à la
// prochaine release »).
//
// Trois champs du schéma n'y figurent pas, chacun pour sa raison :
//   • `slug`      figé au premier envoi vers le site, le serveur en est le
//                 gardien (§4.5). Il est AFFICHÉ ici depuis le 20 août 2026,
//                 en lecture seule : c'est l'adresse publique du produit, et
//                 la voir avant qu'elle ne se fige vaut mieux que de la
//                 découvrir en ligne. Il n'est jamais saisi — la couche
//                 d'accès le pose (`catalog-products.ts`, `withSlug`) ;
//   • `legacy_id` il vient de NeDB, on ne l'invente pas pour un produit créé
//                 ici — il restera vide, et l'export le refusera tant qu'il
//                 l'est. C'est dit à l'écran, pas caché ;
//
// LES IMAGES, depuis le 19 août 2026 : `image` ET `gallery`, tenues ensemble
// par `GalleryField`. Elles ne sont plus deux sujets — la règle du jour dit
// qu'« une image ne se perd pas, et la principale se désigne » : tout fichier
// importé rejoint la galerie, et la principale est une DÉSIGNATION, jamais un
// écrasement. `ImageField` a donc quitté cet écran, son bouton « Changer »
// détruisant l'image en place.
//
// ⚠️ Deux temporalités dans ce dialogue, et c'est dit à l'écran : promouvoir
// et supprimer la principale partent TOUT DE SUITE ; ajouter, retirer et
// réordonner la galerie partent avec « Enregistrer ».
//
// SUPPRIMER LA PRINCIPALE NE PROMEUT RIEN, même si la galerie n'est pas vide :
// le retrait exprime « aucune principale », tandis que promouvoir est un geste
// distinct et nommé. Cela évite surtout d'envoyer implicitement la liste
// complète — possiblement périmée — de `gallery`, dont une omission détruirait
// un fichier et dont l'ordre est une donnée.

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { GalleryField } from '@/components/ui/gallery-field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { useBrands } from '@/lib/queries/brands'
import {
	type CatalogProductShape,
	resoudreSlugProduit,
	useCreateCatalogProduct,
	usePromoteProductImage,
	useRemoveProductMainImage,
	useUpdateCatalogProduct,
} from '@/lib/queries/catalog-products'
import { type GalleryEntry, memeGalerie } from '@/lib/queries/gallery-order'
import { pocketbaseErrorMessage } from '@/lib/queries/pb-error'
import { toSlug } from '@/lib/queries/slug'
import { useSuppliers } from '@/lib/queries/suppliers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { toast } from 'sonner'

import { CategoryPicker } from './CategoryPicker'

// `coerce` parce qu'un `<input type="number">` rend une CHAÎNE : sans lui, le
// prix partirait en `"59.9"` et PocketBase refuserait un champ numérique.
const money = z.coerce.number().min(0, 'Valeur négative impossible')

const productSchema = z.object({
	name: z.string().min(1, 'Le nom est requis').max(255),
	designation: z.string().max(255).optional(),
	sku: z.string().max(50).optional(),
	barcode: z.string().max(50).optional(),
	description: z.string().max(20000).optional(),
	type: z.enum(['simple', 'service']),
	status: z.enum(['draft', 'published']),
	// Vide = neuf, et c'est la valeur par défaut. Voir `CatalogCommercialState`.
	commercial_state: z.enum(['', 'used', 'rental']),
	price_ttc: money,
	purchase_price_ht: money,
	tax_rate: z.coerce.number().min(0).max(100),
	stock: z.coerce.number().int('Le stock est un entier'),
	min_stock: z.coerce.number().int().min(0),
	manage_stock: z.boolean(),
	brand: z.string().optional(),
	supplier: z.string().optional(),
	categories: z.array(z.string()),
})

type ProductFormValues = z.infer<typeof productSchema>

const EMPTY: ProductFormValues = {
	name: '',
	designation: '',
	sku: '',
	barcode: '',
	description: '',
	type: 'simple',
	status: 'draft',
	commercial_state: '',
	price_ttc: 0,
	purchase_price_ht: 0,
	tax_rate: 20,
	stock: 0,
	min_stock: 0,
	manage_stock: true,
	brand: '',
	supplier: '',
	categories: [],
}

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	product?: CatalogProductShape | null
}

export function CatalogProductDialog({ open, onOpenChange, product }: Props) {
	const isEdit = !!product
	const { activeCompanyId } = useActiveCompany()
	const createProduct = useCreateCatalogProduct()
	const updateProduct = useUpdateCatalogProduct()

	const brands = useBrands({ companyId: activeCompanyId ?? undefined })
	const suppliers = useSuppliers({ companyId: activeCompanyId ?? undefined })
	const pb = usePocketBase()

	// Hors formulaire : react-hook-form sérialise ses valeurs, un `File` n'y
	// survit pas.
	// La galerie en cours d'édition : des noms pour ce qui est en base, des
	// `File` pour ce qui arrive. Hors formulaire, comme l'image : react-hook-form
	// sérialise ses valeurs et un `File` n'y survit pas.
	const [galerie, setGalerie] = useState<GalleryEntry[]>([])
	const promote = usePromoteProductImage()
	const removeMain = useRemoveProductMainImage()

	// ⚠️ `product` est un INSTANTANÉ, pris au clic sur la ligne
	// (`ProductsPage.tsx:75`) : il ne suit ni le temps réel, ni nos propres
	// promotions ni nos suppressions. Ces états portent donc l'état courant, et
	// ils sont la vérité de cette modale tant qu'elle est ouverte.
	//
	// C'est le défaut constaté à l'usage le 19 août 2026 : la liste se mettait à
	// jour dans l'application, pas dans la modale, et « Enregistrer » renvoyait
	// ensuite une galerie périmée — « The field contains unknown filenames. »
	// `null` signifie « reprendre l'instantané reçu » ; la chaîne vide signifie
	// vraiment « supprimée ». Il faut les distinguer pour que le fichier ne
	// réapparaisse pas dans la modale après sa suppression immédiate.
	const [imageCourante, setImageCourante] = useState<string | null>(null)
	/** Le slug proposé pour un produit qui n'en a pas — RÉPARATION. Les produits
	 *  créés avant le 20 août 2026 sont partis en ligne sans adresse, et leur
	 *  page rendait « Produit introuvable ». Enregistrer la fiche la pose. */
	const [slugRepare, setSlugRepare] = useState('')
	/** La galerie telle qu'elle est EN BASE. Sert à ne rien envoyer quand
	 *  l'utilisateur n'y a pas touché. */
	const [galerieEnBase, setGalerieEnBase] = useState<GalleryEntry[]>([])

	// `product` sert de porteur d'identité pour `getUrl` : les fichiers des deux
	// champs vivent dans le même dossier, `storage/<collectionId>/<idProduit>/`.
	const urlDe = (nom: string) => (product ? pb.files.getUrl(product, nom) : '')

	const nomPrincipale = imageCourante ?? product?.image ?? ''
	const imageUrl = nomPrincipale ? urlDe(nomPrincipale) : null

	const promouvoir = async (nom: string) => {
		if (!product) return
		try {
			// La route rend l'état d'APRÈS : on le prend pour vérité plutôt que de
			// le recalculer. Sans cela, l'écran et la base divergeraient dès la
			// première promotion.
			const apres = await promote.mutateAsync({
				productId: product.id,
				filename: nom,
			})
			setImageCourante(apres.image)
			setGalerie(apres.gallery)
			setGalerieEnBase(apres.gallery)
			toast.success('Image principale mise à jour')
		} catch (error) {
			toast.error(`Promotion refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	const supprimerPrincipale = async () => {
		if (!product) return
		try {
			// IMMÉDIAT, comme la promotion. On ne joint surtout pas `gallery` : elle
			// reste intacte, dans son ordre, et aucune entrée n'est promue par
			// surprise. `removeImage` devient `image: ''` dans `image-upload.ts`.
			await removeMain.mutateAsync(product.id)
			setImageCourante('')
			toast.success('Image principale supprimée')
		} catch (error) {
			toast.error(`Suppression refusée : ${pocketbaseErrorMessage(error)}`)
		}
	}

	const form = useForm<ProductFormValues>({
		resolver: zodResolver(productSchema),
		defaultValues: EMPTY,
	})

	useEffect(() => {
		if (!open) return
		form.reset(
			product
				? {
						name: product.name ?? '',
						designation: product.designation ?? '',
						sku: product.sku ?? '',
						barcode: product.barcode ?? '',
						description: product.description ?? '',
						type: product.type ?? 'simple',
						status: product.status ?? 'draft',
						commercial_state: product.commercial_state ?? '',
						price_ttc: product.price_ttc ?? 0,
						purchase_price_ht: product.purchase_price_ht ?? 0,
						tax_rate: product.tax_rate ?? 20,
						stock: product.stock ?? 0,
						min_stock: product.min_stock ?? 0,
						manage_stock: product.manage_stock ?? true,
						brand: product.brand ?? '',
						supplier: product.supplier ?? '',
						categories: product.categories ?? [],
					}
				: EMPTY,
		)
		// La galerie repart de la base à chaque ouverture : une édition
		// abandonnée ne doit pas resurgir au produit suivant.
		setGalerie(product?.gallery ?? [])
		setGalerieEnBase(product?.gallery ?? [])
		setImageCourante(null)
		setSlugRepare('')
	}, [open, product, form])

	// La réparation ne se déclenche que pour une fiche EXISTANTE sans slug : un
	// produit qui en a un le garde, quoi qu'il arrive à son nom.
	useEffect(() => {
		if (!open || !product || (product.slug ?? '') !== '') return
		let vivant = true
		resoudreSlugProduit(pb, product.name ?? '').then((propose) => {
			if (vivant) setSlugRepare(propose)
		})
		return () => {
			vivant = false
		}
	}, [open, product, pb])

	const onSubmit = async (data: ProductFormValues) => {
		// Chaînes vides et non `undefined` : c'est ainsi qu'on efface une valeur,
		// et qu'on vide une relation. `undefined` disparaît du corps JSON et
		// laisserait l'ancienne valeur en base.
		const payload = {
			name: data.name.trim(),
			designation: data.designation ?? '',
			sku: data.sku ?? '',
			barcode: data.barcode ?? '',
			description: data.description ?? '',
			type: data.type,
			status: data.status,
			commercial_state: data.commercial_state,
			price_ttc: data.price_ttc,
			purchase_price_ht: data.purchase_price_ht,
			tax_rate: data.tax_rate,
			stock: data.stock,
			min_stock: data.min_stock,
			manage_stock: data.manage_stock,
			brand: data.brand ?? '',
			supplier: data.supplier ?? '',
			categories: data.categories,
			// LA GALERIE NE PART QUE SI ELLE A CHANGÉ. Elle part alors ENTIÈRE :
			// une entrée omise serait un fichier supprimé, sans confirmation
			// (`image-upload.ts`). Se taire quand rien n'a bougé évite de renvoyer
			// une liste périmée — c'est ce qui faisait échouer un simple
			// changement de prix après une promotion.
			//
			// On ne dit jamais rien d'`image` : elle ne se change que par
			// promotion, et la promotion est déjà partie.
			gallery: memeGalerie(galerieEnBase, galerie) ? undefined : galerie,
			// L'adresse publique n'est posée QUE si la fiche n'en a pas : §4.5,
			// un slug ne se retouche jamais. À la création, c'est la couche
			// d'accès qui s'en charge.
			...(isEdit && (product?.slug ?? '') === '' && slugRepare !== ''
				? { slug: slugRepare }
				: {}),
		}

		try {
			if (isEdit && product) {
				await updateProduct.mutateAsync({ id: product.id, data: payload })
				toast.success('Produit modifié')
			} else {
				if (!activeCompanyId) {
					toast.error('Aucune entreprise active')
					return
				}
				await createProduct.mutateAsync({
					...payload,
					company: activeCompanyId,
				})
				toast.success('Produit créé')
			}
			onOpenChange(false)
		} catch (error) {
			toast.error(`Enregistrement refusé : ${pocketbaseErrorMessage(error)}`)
			console.error(error)
		}
	}

	// L'ADRESSE PUBLIQUE, telle qu'elle sera. Trois cas, et ils se disent :
	//  • la fiche en a une  → figée, on la montre ;
	//  • la fiche n'en a pas → celle qu'enregistrer va poser (réparation) ;
	//  • création           → un APERÇU dérivé du nom saisi. L'unicité est
	//    vérifiée à l'enregistrement, pas à chaque frappe : un suffixe `-2`
	//    peut donc s'ajouter, et c'est dit.
	const nomSaisi = form.watch('name')
	const slugEnBase = product?.slug ?? ''
	const slugAffiche = isEdit ? slugEnBase || slugRepare : toSlug(nomSaisi ?? '')

	const pending =
		createProduct.isPending || updateProduct.isPending || removeMain.isPending

	// ── La marque suit le fournisseur ────────────────────────────────────────
	// Un fournisseur porte les marques qu'il distribue (`suppliers.brands`) :
	// quand il est choisi, proposer les 287 marques du catalogue n'a pas de sens,
	// on n'en attend que les siennes.
	//
	// Deux garde-fous, et ils comptent plus que le filtre lui-même :
	//
	//  • un fournisseur SANS marque déclarée — il y en a 3 sur 43 — ne doit pas
	//    vider la liste : on retombe sur le catalogue entier plutôt que de
	//    rendre le champ inutilisable ;
	//  • la marque DÉJÀ enregistrée sur le produit reste proposée même si elle
	//    n'appartient pas au fournisseur choisi. Sinon un produit hérité, dont la
	//    marque et le fournisseur ne se correspondent pas, verrait sa marque
	//    disparaître du menu — et un simple enregistrement l'effacerait sans que
	//    personne l'ait demandé.
	const selectedSupplierId = form.watch('supplier')
	const currentBrandId = form.watch('brand')

	const supplierBrandIds = (suppliers.data ?? []).find(
		(supplier) => supplier.id === selectedSupplierId,
	)?.brands

	const brandOptions = (brands.data ?? []).filter((brand) => {
		if (!selectedSupplierId) return true
		if (!supplierBrandIds?.length) return true
		return supplierBrandIds.includes(brand.id) || brand.id === currentBrandId
	})

	/** Vrai quand la liste est effectivement restreinte : sert à le DIRE. Une
	 *  liste silencieusement raccourcie ferait chercher une marque absente. */
	const brandsFilteredBySupplier =
		Boolean(selectedSupplierId) && Boolean(supplierBrandIds?.length)

	/** La marque en place n'est pas distribuée par le fournisseur choisi. Ce
	 *  n'est pas une erreur — les données héritées en portent —, mais ça se
	 *  signale. */
	const brandOutsideSupplier =
		brandsFilteredBySupplier &&
		Boolean(currentBrandId) &&
		!supplierBrandIds?.includes(currentBrandId as string)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[90vh] max-w-2xl overflow-y-auto'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Modifier le produit' : 'Nouveau produit'}
					</DialogTitle>
					<DialogDescription>
						Enregistre la fiche dans le catalogue commun à la caisse, au stock et
						au site.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
						<GalleryField
							mainUrl={imageUrl}
							value={galerie}
							onChange={setGalerie}
							urlDe={urlDe}
							// Un produit pas encore créé n'a pas d'identifiant : rien à
							// promouvoir tant qu'il n'est pas enregistré.
							onPromote={product ? promouvoir : undefined}
							promoting={promote.isPending}
							onRemoveMain={product ? supprimerPrincipale : undefined}
							removingMain={removeMain.isPending}
							disabled={
								createProduct.isPending ||
								updateProduct.isPending ||
								removeMain.isPending
							}
							// 1600 px : c'est la seule image du site que le visiteur
							// AGRANDIT — la fiche produit a une galerie, là où un logo de
							// marque (512) et une bannière de catégorie (1024) ne sont que
							// regardés. La conversion en WebP qui vient avec est aussi ce
							// qui met la galerie à l'abri des refus de MIME du serveur.
							//
							// ⚠️ Ceci optimise l'image qu'on vient de CHOISIR, à l'unité.
							// Cela ne rouvre pas la question du lot : le refus chiffré
							// d'`ImageBatchOptimizer` — 2412 produits, 1,5 Gio de ré-envoi
							// — tient toujours, et ce composant n'est toujours pas branché
							// sur les produits.
							optimize={{ maxSide: 1600 }}
						/>

						{/* L'ADRESSE PUBLIQUE. Elle ne se saisit pas — la couche d'accès
						    la pose — mais elle se VOIT : une fois partie au site, elle est
						    figée (§4.5 du contrat), et un produit créé au comptoir en
						    manquait jusqu'au 20 août 2026, ce qui rendait sa page
						    introuvable. */}
						<div className='space-y-1'>
							<span className='font-medium text-sm'>Adresse sur le site</span>
							<div className='rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm'>
								{slugAffiche ? (
									<span>/produit/{slugAffiche}</span>
								) : (
									<span className='font-sans text-muted-foreground'>
										Donnez un nom au produit pour qu'une adresse soit calculée.
									</span>
								)}
							</div>
							<p className='text-muted-foreground text-xs'>
								{slugEnBase
									? 'Figée depuis le premier envoi au site : la renommer déplacerait une page déjà indexée.'
									: isEdit
										? 'Cette fiche n’a pas encore d’adresse — enregistrer la posera, puis il faudra la ré-exporter vers le site.'
										: 'Calculée à partir du nom, posée à l’enregistrement. Un suffixe est ajouté si l’adresse est déjà prise.'}
							</p>
						</div>

						<FormField
							control={form.control}
							name='name'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Nom *</FormLabel>
									<FormControl>
										<Input placeholder='Guitare folk Alvarez' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='designation'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Désignation</FormLabel>
									<FormControl>
										<Input placeholder='Libellé court' {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='sku'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Référence</FormLabel>
										<FormControl>
											<Input placeholder='ABGS14SH' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='barcode'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Code-barres</FormLabel>
										<FormControl>
											<Input inputMode='numeric' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className='grid grid-cols-3 gap-4'>
							<FormField
								control={form.control}
								name='price_ttc'
								render={({ field }) => (
									<FormItem>
										{/* L'unité est DANS LE NOM du champ au schéma, et elle
										    reste dans le libellé : un prix sans unité est un piège
										    qui se repaie à chaque lecture. */}
										<FormLabel>Prix TTC</FormLabel>
										<FormControl>
											<Input type='number' step='0.01' min='0' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='purchase_price_ht'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Achat HT</FormLabel>
										<FormControl>
											<Input type='number' step='0.01' min='0' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='tax_rate'
								render={({ field }) => (
									<FormItem>
										<FormLabel>TVA (%)</FormLabel>
										<FormControl>
											<Input type='number' step='0.1' min='0' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className='grid grid-cols-3 gap-4'>
							<FormField
								control={form.control}
								name='stock'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Stock</FormLabel>
										<FormControl>
											<Input type='number' step='1' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='min_stock'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Stock minimum</FormLabel>
										<FormControl>
											<Input type='number' step='1' min='0' {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='type'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Type</FormLabel>
										<FormControl>
											<NativeSelect {...field}>
												<option value='simple'>Article</option>
												{/* 9 produits sont des services : sans stock, ils
												    n'ont rien à voir avec un article. */}
												<option value='service'>Service</option>
											</NativeSelect>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='brand'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Marque</FormLabel>
										<FormControl>
											<NativeSelect {...field}>
												<option value=''>— Aucune —</option>
												{brandOptions.map((brand) => (
													<option key={brand.id} value={brand.id}>
														{brand.name}
													</option>
												))}
											</NativeSelect>
										</FormControl>
										{brandsFilteredBySupplier && (
											<p className='text-muted-foreground text-xs'>
												{brandOptions.length} marque(s) distribuée(s) par ce
												fournisseur. Retirez le fournisseur pour voir tout le
												catalogue.
											</p>
										)}
										{brandOutsideSupplier && (
											<p className='text-amber-600 text-xs'>
												La marque en place n’est pas déclarée chez ce
												fournisseur. Elle est conservée telle quelle.
											</p>
										)}
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='supplier'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Fournisseur</FormLabel>
										<FormControl>
											<NativeSelect {...field}>
												<option value=''>— Aucun —</option>
												{(suppliers.data ?? []).map((supplier) => (
													<option key={supplier.id} value={supplier.id}>
														{supplier.name}
													</option>
												))}
											</NativeSelect>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name='commercial_state'
							render={({ field }) => (
								<FormItem>
									<FormLabel>État commercial</FormLabel>
									<FormControl>
										<NativeSelect {...field}>
											<option value=''>Neuf</option>
											<option value='used'>Occasion</option>
											<option value='rental'>Location</option>
										</NativeSelect>
									</FormControl>
									{/* Il vit ICI, à côté de la marque et du fournisseur, et non
									    dans les catégories : une catégorie dit ce que l'objet
									    EST, celui-ci dit comment il se VEND. C'est toute la
									    raison pour laquelle « Occasion » et « LOCATION » ont
									    cessé d'être des branches (DECISIONS, 2026-08-24). */}
									<p className='text-muted-foreground text-xs'>
										Un produit d’occasion ou de location garde son rayon
										habituel — il n’en sort pas.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='categories'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Catégories</FormLabel>
									{/* Un produit a un ENSEMBLE de catégories, sans catégorie
									    principale — c'est le modèle arrêté, pas un raccourci. */}
									<CategoryPicker
										value={field.value}
										onChange={(value) =>
											field.onChange(Array.isArray(value) ? value : [value])
										}
										multiple
										searchPlaceholder='Rechercher une catégorie…'
										maxHeight='200px'
										companyId={activeCompanyId ?? undefined}
									/>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name='description'
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											rows={4}
											placeholder='Le texte lu par le visiteur sur la page du produit.'
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className='grid grid-cols-2 gap-4'>
							<FormField
								control={form.control}
								name='status'
								render={({ field }) => (
									<FormItem>
										<FormLabel>Publication</FormLabel>
										<FormControl>
											<NativeSelect {...field}>
												<option value='draft'>Brouillon</option>
												<option value='published'>Publié sur le site</option>
											</NativeSelect>
										</FormControl>
										{/* `status` est la SEULE autorité sur ce qui part vers le
										    site (online-catalog.ts). Le dire ici évite qu'on
										    cherche un autre interrupteur — et notamment qu'on
										    prenne l'état commercial ci-dessous pour un second :
										    une occasion se publie comme le reste. */}
										<p className='text-muted-foreground text-xs'>
											Seuls les produits publiés partent vers axemusique.shop.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name='manage_stock'
								render={({ field }) => (
									<FormItem className='flex items-center justify-between rounded-lg border p-3'>
										<div>
											<FormLabel>Suivi du stock</FormLabel>
											<p className='text-muted-foreground text-xs'>
												Décoché pour un service.
											</p>
										</div>
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>

						{!isEdit && (
							<p className='rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs'>
								Une clé stable (<code>legacy_id</code>) sera attribuée
								automatiquement à la création. Elle permettra d’identifier ce produit
								dans les exports vers le site.
							</p>
						)}

						<div className='flex justify-end gap-3 pt-2'>
							<Button
								type='button'
								variant='outline'
								onClick={() => onOpenChange(false)}
								disabled={pending}
							>
								Annuler
							</Button>
							<Button type='submit' disabled={pending}>
								{isEdit ? 'Enregistrer' : 'Créer'}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

/** Un `<select>` natif, stylé comme les champs voisins. Radix aurait imposé un
 *  composant contrôlé de plus pour 287 marques ; le natif les avale sans
 *  broncher et reste navigable au clavier. */
function NativeSelect({
	children,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select
			{...props}
			className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
		>
			{children}
		</select>
	)
}
