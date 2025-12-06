// frontend/modules/connect/components/InvoiceDownloadButton.tsx

import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { InvoiceResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { InvoicePdfDocument } from './InvoicePdf'

interface InvoiceDownloadButtonProps {
	invoice: InvoiceResponse
	variant?: 'default' | 'outline' | 'ghost' | 'secondary'
	size?: 'default' | 'sm' | 'lg' | 'icon'
	showLabel?: boolean
	className?: string
}

// Même helper que dans InvoicesPage (si tu préfères, tu peux l'extraire dans un util commun)
async function toPngDataUrl(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = img.naturalWidth || img.width
				canvas.height = img.naturalHeight || img.height
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					reject(new Error('Impossible de créer un contexte 2D'))
					return
				}
				ctx.drawImage(img, 0, 0)
				const dataUrl = canvas.toDataURL('image/png')
				resolve(dataUrl)
			} catch (err) {
				reject(err)
			}
		}
		img.onerror = (err) => reject(err)
		img.src = url
	})
}

export function InvoiceDownloadButton({
	invoice,
	variant = 'outline',
	size = 'sm',
	showLabel = true,
	className,
}: InvoiceDownloadButtonProps) {
	const pb = usePocketBase() as any
	const { activeCompanyId } = useActiveCompany()
	const [isGenerating, setIsGenerating] = useState(false)

	const handleDownload = async () => {
		if (!activeCompanyId) {
			toast.error('Aucune entreprise sélectionnée')
			return
		}

		setIsGenerating(true)

		try {
			// Récupérer la société
			let company: any
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée :', err)
			}

			// Récupérer le client (si pas déjà dans expand)
			let customer = invoice.expand?.customer
			if (!customer && invoice.customer) {
				try {
					customer = await pb.collection('customers').getOne(invoice.customer)
				} catch (err) {
					console.warn('Client non trouvé :', err)
				}
			}

			// Logo éventuel
			let logoDataUrl: string | null = null
			if (company?.logo) {
				const fileUrl = pb.files.getUrl(company, company.logo)
				try {
					logoDataUrl = await toPngDataUrl(fileUrl)
				} catch (err) {
					console.warn('Erreur conversion logo', err)
				}
			}

			const blob = await pdf(
				<InvoicePdfDocument
					invoice={invoice}
					customer={customer as any}
					company={company || undefined}
					companyLogoUrl={logoDataUrl}
				/>,
			).toBlob()

			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `${invoice.number}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast.success('Facture téléchargée')
		} catch (error) {
			console.error('Erreur génération PDF :', error)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsGenerating(false)
		}
	}

	// Variante bouton icône uniquement
	if (size === 'icon' || !showLabel) {
		return (
			<Button
				variant={variant}
				size='icon'
				onClick={handleDownload}
				disabled={isGenerating}
				className={className}
				title='Télécharger le PDF'
			>
				{isGenerating ? (
					<Loader2 className='h-4 w-4 animate-spin' />
				) : (
					<Download className='h-4 w-4' />
				)}
			</Button>
		)
	}

	// Bouton texte + icône
	return (
		<Button
			variant={variant}
			size={size}
			onClick={handleDownload}
			disabled={isGenerating}
			className={className}
		>
			{isGenerating ? (
				<>
					<Loader2 className='h-4 w-4 animate-spin mr-2' />
					Génération...
				</>
			) : (
				<>
					<Download className='h-4 w-4 mr-2' />
					Télécharger PDF
				</>
			)}
		</Button>
	)
}
