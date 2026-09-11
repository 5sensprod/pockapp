import { beforeEach, describe, expect, it, vi } from 'vitest'

// Petit hôte de hooks : les états et refs survivent aux rendus, sans serveur ni DOM.
const h = vi.hoisted(() => ({
	slots: [] as any[],
	cursor: 0,
	form: null as any,
	values: {} as any,
	create: vi.fn(),
	update: vi.fn(),
	promote: vi.fn(),
	stock: vi.fn(),
	sync: vi.fn(),
	verify: vi.fn(),
}))
vi.mock('react', () => ({
	useEffect: () => {},
	useRef: (initial: any) => {
		const index = h.cursor++
		h.slots[index] ??= { current: initial }
		return h.slots[index]
	},
	useState: (initial: any) => {
		const index = h.cursor++
		if (!(index in h.slots)) h.slots[index] = initial
		return [
			h.slots[index],
			(next: any) => {
				h.slots[index] =
					typeof next === 'function' ? next(h.slots[index]) : next
			},
		]
	},
}))
vi.mock('react-hook-form', () => ({
	useForm: (options: any) => {
		if (!h.form) {
			h.values = { ...options.defaultValues }
			h.form = {
				formState: { isDirty: false, defaultValues: options.defaultValues },
				setError: vi.fn(),
				reset: (values: any) => {
					h.values = { ...values }
					h.form.formState = { isDirty: false, defaultValues: values }
				},
				resetField: (key: string, { defaultValue }: any) => {
					h.form.formState.defaultValues = {
						...h.form.formState.defaultValues,
						[key]: defaultValue,
					}
				},
				handleSubmit: (callback: any) => async () => {
					const result = await options.resolver(
						h.values,
						{},
						{ fields: {}, shouldUseNativeValidation: false },
					)
					if (Object.keys(result.errors).length === 0)
						await callback(result.values)
				},
			}
		}
		return h.form
	},
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/lib/use-pocketbase', () => ({ usePocketBase: () => ({}) }))
vi.mock('@/lib/ActiveCompanyProvider', () => ({
	useActiveCompany: () => ({ activeCompanyId: 'company1' }),
}))
vi.mock('sonner', () => ({
	toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/lib/sync/SyncAfterSaveDialog', () => ({
	useSyncAfterSave: () => ({ proposer: h.sync, dialogue: null }),
}))
vi.mock('@/lib/queries/stock-adjust', () => ({ setStockManually: h.stock }))
vi.mock('@/components/catalog/ProductDuplicateGuard', () => ({
	useProductDuplicateGuard: () => ({
		verify: h.verify,
		feedback: null,
		dialogue: null,
	}),
}))
vi.mock('@/lib/queries/catalog-products', () => ({
	invalidateCatalog: vi.fn(),
	useCreateCatalogProduct: () => ({ mutateAsync: h.create }),
	useUpdateCatalogProduct: () => ({ mutateAsync: h.update }),
	usePromoteProductImage: () => ({ mutateAsync: h.promote }),
	useRemoveProductMainImage: () => ({ mutateAsync: vi.fn() }),
}))

import { EMPTY_PRODUCT_DETAIL_VALUES } from './product-detail-form'
import { useProductDetailEditor } from './useProductDetailEditor'

const draft = {
	...EMPTY_PRODUCT_DETAIL_VALUES,
	id: '',
	collectionId: '',
	collectionName: 'products',
	legacy_id: '',
	name: 'Guitare',
	designation: 'Guitare',
}
const saved = {
	...draft,
	id: 'created1',
	price_ttc: 120,
	gallery: [] as string[],
}
const render = () => {
	h.cursor = 0
	return useProductDetailEditor(draft)
}

beforeEach(() => {
	vi.clearAllMocks()
	h.slots = []
	h.form = null
	h.create.mockResolvedValue(saved)
	h.update.mockResolvedValue(saved)
	h.stock.mockResolvedValue({ applied: true, stockAfter: 5 })
	h.promote.mockResolvedValue({ image: 'photo_pb.jpg', gallery: [] })
	h.verify.mockResolvedValue(true)
})

describe('création depuis la fiche détail', () => {
	it('ouvre sans écrire et refuse Enregistrer sans prix', async () => {
		const editor = render()
		expect(h.create).not.toHaveBeenCalled()
		expect(await editor.saveNow()).toBe(false)
		expect(h.create).not.toHaveBeenCalled()
	})
	it('valide le motif avant la première écriture', async () => {
		const editor = render()
		h.values.price_ttc = 120
		h.values.stock = 5
		expect(await editor.saveNow()).toBe(false)
		expect(h.create).not.toHaveBeenCalled()
	})
	it('envoie la galerie, promeut le fichier retourné puis ajuste le stock avec son motif', async () => {
		let editor = render()
		const photo = new File(['image'], 'photo.jpg', { type: 'image/jpeg' })
		editor.setGallery([photo])
		editor = render()
		h.values.price_ttc = 120
		h.values.stock = 5
		h.values.stock_reason = 'restock'
		h.create.mockResolvedValue({ ...saved, gallery: ['photo_pb.jpg'] })
		expect(await editor.saveNow()).toBe(true)
		expect(h.create.mock.calls[0][0]).toMatchObject({
			gallery: [photo],
			company: 'company1',
		})
		expect(h.create.mock.calls[0][0]).not.toHaveProperty('stock')
		expect(h.promote).toHaveBeenCalledWith({
			productId: 'created1',
			filename: 'photo_pb.jpg',
		})
		expect(h.stock).toHaveBeenCalledWith(
			expect.anything(),
			'created1',
			5,
			expect.objectContaining({ reason: 'restock' }),
		)
		expect(render().createdId).toBe('created1')
		expect(h.sync).not.toHaveBeenCalled()
	})
	it('reprend sur le même produit après un refus de stock, sans renvoyer la galerie', async () => {
		let editor = render()
		editor.setGallery([new File(['image'], 'photo.jpg')])
		editor = render()
		h.values.price_ttc = 120
		h.values.stock = 5
		h.values.stock_reason = 'restock'
		h.create.mockResolvedValue({ ...saved, gallery: ['photo_pb.jpg'] })
		h.stock.mockResolvedValueOnce({ applied: false, error: 'Refus du journal' })
		expect(await editor.saveNow()).toBe(false)
		editor = render()
		expect(await editor.saveNow()).toBe(true)
		expect(h.create).toHaveBeenCalledTimes(1)
		expect(h.update).toHaveBeenCalledWith({
			id: 'created1',
			data: expect.objectContaining({ gallery: undefined }),
		})
	})
	it('vérifie les doublons avant la première écriture, et renoncer n’écrit rien', async () => {
		const editor = render()
		h.values.price_ttc = 120
		h.values.sku = 'GF-01'
		h.verify.mockResolvedValueOnce(false)
		expect(await editor.saveNow()).toBe(false)
		expect(h.verify).toHaveBeenCalledWith(
			expect.objectContaining({ designation: 'Guitare', sku: 'GF-01' }),
			undefined,
		)
		expect(h.create).not.toHaveBeenCalled()
		// Le verrou est rendu : confirmer ensuite enregistre.
		expect(await render().saveNow()).toBe(true)
		expect(h.create).toHaveBeenCalledTimes(1)
	})
	it('ignore un deuxième enregistrement pendant une création en cours', async () => {
		const editor = render()
		h.values.price_ttc = 120
		let finish!: (value: typeof saved) => void
		h.create.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve
				}),
		)
		const first = editor.submit(h.values)
		expect(await editor.submit(h.values)).toBe(false)
		finish(saved)
		expect(await first).toBe(true)
		expect(h.create).toHaveBeenCalledTimes(1)
	})
})
