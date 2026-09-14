import type PocketBase from 'pocketbase'

export async function generateProductBarcode(pb: PocketBase): Promise<string> {
	const response: { barcode?: string } = await pb.send(
		'/api/catalog/products/barcode/generate',
		{ method: 'POST', requestKey: null },
	)
	if (!response.barcode) {
		throw new Error('Le serveur n’a retourné aucun code-barres')
	}
	return response.barcode
}
