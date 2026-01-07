// frontend/lib/pos/posPreview.ts
export type ReceiptData = any // si tu as déjà un type ReceiptData, remplace-le

export async function fetchReceiptPreviewHtml(input: {
	width: 58 | 80
	companyId?: string
	receipt: ReceiptData
}) {
	const res = await fetch('/api/pos/preview/html', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})

	if (!res.ok) {
		const err = await res.json().catch(() => null)
		throw new Error(err?.error || 'Erreur preview ticket (html)')
	}

	const html = await res.text()
	return html
}

export async function fetchReceiptPreviewText(input: {
	width: 58 | 80
	companyId?: string
	receipt: ReceiptData
}) {
	const res = await fetch('/api/pos/preview/text', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})

	if (!res.ok) {
		const err = await res.json().catch(() => null)
		throw new Error(err?.error || 'Erreur preview ticket (text)')
	}

	return await res.text()
}

export async function openReceiptPreviewWindow(input: {
	width: 58 | 80
	companyId?: string
	receipt: ReceiptData
}) {
	const res = await fetch('/api/pos/preview/html', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})

	if (!res.ok) {
		const err = await res.json().catch(() => null)
		throw new Error(err?.error || 'Erreur preview ticket')
	}

	const html = await res.text()
	const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	window.open(url, '_blank', 'noopener,noreferrer')
}

export async function downloadReceiptPreviewHtml(
	input: {
		width: 58 | 80
		companyId?: string
		receipt: ReceiptData
	},
	filename = 'ticket-preview.html',
) {
	const html = await fetchReceiptPreviewHtml(input)
	const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
	const url = URL.createObjectURL(blob)

	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()

	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
