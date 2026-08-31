import { beforeEach, describe, expect, it, vi } from 'vitest'

const customerUpdates: Array<{ id: string; data: { tags: string[] } }> = []
const invalidatedKeys: unknown[][] = []
let customerTags: string[] = []
let customerUpdateError: Error | null = null

vi.mock('@tanstack/react-query', () => ({
	useMutation: (options: unknown) => options,
	useQuery: () => ({ data: undefined }),
	useQueryClient: () => ({
		invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
			invalidatedKeys.push(queryKey)
		},
	}),
}))

vi.mock('@/lib/use-pocketbase', () => ({
	usePocketBase: () => ({
		collection: (collection: string) => ({
			create: async (data: Record<string, unknown>) => ({
				id: 'consignment_1',
				...data,
			}),
			getOne: async () => ({ tags: customerTags }),
			update: async (id: string, data: { tags: string[] }) => {
				if (collection === 'customers' && customerUpdateError) {
					throw customerUpdateError
				}
				if (collection === 'customers') customerUpdates.push({ id, data })
				return { id, ...data }
			},
		}),
	}),
}))

import { useCreateConsignmentItem, withDepositorTag } from './consignmentItems'

const payload = {
	description: 'Guitare',
	seller_price: 400,
	store_price: 500,
	customer: 'customer_1',
	owner_company: 'company_1',
}

beforeEach(() => {
	customerTags = []
	customerUpdateError = null
	customerUpdates.length = 0
	invalidatedKeys.length = 0
})

describe('tag déposant à la création d’un dépôt', () => {
	it('conserve les tags présents et ajoute déposant une seule fois', async () => {
		customerTags = ['prospect']
		const mutation = useCreateConsignmentItem() as any

		const result = await mutation.mutationFn(payload)
		mutation.onSuccess(result, payload)

		expect(result.customerTagUpdateFailed).toBe(false)
		expect(customerUpdates).toEqual([
			{
				id: 'customer_1',
				data: { tags: ['prospect', 'déposant'] },
			},
		])
		expect(invalidatedKeys).toContainEqual([
			'consignment_items',
			'customer',
			'customer_1',
		])
		expect(invalidatedKeys).toContainEqual(['customers'])
	})

	it('ne réécrit pas le client si le tag déposant est déjà présent', async () => {
		customerTags = ['prospect', 'déposant']

		const result = await (useCreateConsignmentItem() as any).mutationFn(payload)

		expect(result.customerTagUpdateFailed).toBe(false)
		expect(customerUpdates).toHaveLength(0)
		expect(withDepositorTag(customerTags)).toEqual(['prospect', 'déposant'])
	})

	it('garde le dépôt réussi et signale un échec de pose du tag', async () => {
		customerTags = ['prospect']
		customerUpdateError = new Error('mise à jour refusée')
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		const mutation = useCreateConsignmentItem() as any

		const result = await mutation.mutationFn(payload)
		mutation.onSuccess(result, payload)

		expect(result.item.id).toBe('consignment_1')
		expect(result.customerTagUpdateFailed).toBe(true)
		expect(customerUpdates).toHaveLength(0)
		expect(invalidatedKeys).toContainEqual([
			'consignment_items',
			'customer',
			'customer_1',
		])
		expect(invalidatedKeys).toContainEqual(['customers'])
		consoleError.mockRestore()
	})
})
