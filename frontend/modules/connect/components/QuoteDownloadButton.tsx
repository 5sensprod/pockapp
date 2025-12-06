// frontend/modules/connect/components/QuoteDownloadButton.tsx

import { Button } from '@/components/ui/button'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { QuoteResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { QuotePdfDocument } from './QuotePdf'

interface QuoteDownloadButtonProps {
	quote: QuoteResponse
	variant?: 'default' | 'outline' | 'ghost' | 'secondary'
	size?: 'default' | 'sm' | 'lg' | 'icon'
	showLabel?: boolean
	className?: string
}

export function QuoteDownloadButton({
	quote,
	variant = 'outline',
	size = 'sm',
	showLabel = true,
	className,
}: QuoteDownloadButtonProps) {
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
			// Récupérer les infos de l'entreprise
			let company: any
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée:', err)
			}

			// Récupérer le client (si pas déjà dans expand)
			let customer = quote.expand?.customer
			if (!customer && quote.customer) {
				try {
					customer = await pb.collection('customers').getOne(quote.customer)
				} catch (err) {
					console.warn('Client non trouvé:', err)
				}
			}

			// Récupérer le logo de l'entreprise (si disponible)
			let companyLogoUrl: string | null = null
			if (company?.logo) {
				companyLogoUrl = pb.files.getUrl(company, company.logo)
			}

			// Générer le PDF
			const blob = await pdf(
				<QuotePdfDocument
					quote={quote}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
				/>,
			).toBlob()

			// Télécharger le fichier
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = `Devis_${quote.number.replace(/\//g, '-')}.pdf`
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)

			toast.success('Devis téléchargé')
		} catch (error) {
			console.error('Erreur génération PDF:', error)
			toast.error('Erreur lors de la génération du PDF')
		} finally {
			setIsGenerating(false)
		}
	}

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
