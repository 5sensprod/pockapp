// frontend/lib/pos/listPrinters.ts

import { isWailsEnv } from '@/lib/wails'

export async function listWindowsPrinters(): Promise<string[]> {
	if (!isWailsEnv()) return []

	const { ListPrinters } = await import('@/wailsjs/go/main/App')
	return ListPrinters()
}
