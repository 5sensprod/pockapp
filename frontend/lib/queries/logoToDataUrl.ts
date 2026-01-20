// frontend/lib/pos/logoToDataUrl.ts
export async function fetchAsDataUrl(url: string): Promise<string> {
	const res = await fetch(url)
	if (!res.ok) throw new Error('Logo fetch failed')
	const blob = await res.blob()
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () => reject(new Error('Logo read failed'))
		reader.onload = () => resolve(String(reader.result))
		reader.readAsDataURL(blob)
	})
}
