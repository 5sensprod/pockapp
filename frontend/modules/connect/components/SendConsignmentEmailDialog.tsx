// frontend/modules/connect/components/SendConsignmentEmailDialog.tsx
// Calqué sur SendInvoiceEmailDialog.tsx

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type {
	CompaniesResponse,
	CustomersResponse,
} from '@/lib/pocketbase-types'
import type { ConsignmentItemDto } from '@/lib/queries/consignmentItems'
import { useUpdateCustomer } from '@/lib/queries/customers'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { AlertCircle, Loader2, Mail, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConsignmentPdfDocument } from './ConsignmentPdf'

interface SendConsignmentEmailDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	item: ConsignmentItemDto | null
	customer: CustomersResponse
	company: CompaniesResponse
	companyLogoUrl?: string | null
	commissionRate?: number
	referenceNumber?: string
	onSuccess?: () => void
}

const fmt = (amount: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		amount,
	)

export function SendConsignmentEmailDialog({
	open,
	onOpenChange,
	item,
	customer,
	company,
	companyLogoUrl,
	commissionRate = 20,
	referenceNumber,
	onSuccess,
}: SendConsignmentEmailDialogProps) {
	const updateCustomer = useUpdateCustomer()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const [recipientEmail, setRecipientEmail] = useState('')
	const [recipientName, setRecipientName] = useState('')
	const [subject, setSubject] = useState('')
	const [message, setMessage] = useState('')
	const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
	const [isSending, setIsSending] = useState(false)
	const [saveEmailToCustomer, setSaveEmailToCustomer] = useState(true)

	const companyName = company.trade_name || company.name || 'Votre magasin'

	const ref =
		referenceNumber ||
		(item
			? `DV-${new Date(item.created).getFullYear()}-${item.id.slice(0, 6).toUpperCase()}`
			: '')

	// Pre-remplir a l'ouverture
	useEffect(() => {
		if (!item || !open) return
		const netSeller = item.store_price * (1 - commissionRate / 100)
		setRecipientEmail(customer.email || '')
		setRecipientName(customer.name || '')
		setSubject(`Bordereau de depot-vente ${ref}`)
		setMessage(
			`Bonjour${customer.name ? ` ${customer.name}` : ''},\n\n` +
				`Veuillez trouver ci-joint votre bordereau de depot-vente (ref. ${ref}) ` +
				`pour l'article : ${item.description}.\n\n` +
				`Prix de vente en magasin : ${fmt(item.store_price)}\n` +
				`Commission magasin (${commissionRate}%) : ${fmt((item.store_price * commissionRate) / 100)}\n` +
				`Net vous revenant : ${fmt(netSeller)}\n\n` +
				`N'hesitez pas a nous contacter pour toute question.\n\nCordialement,\n${companyName}`,
		)
	}, [
		item,
		open,
		commissionRate,
		customer.email,
		customer.name,
		ref,
		companyName,
	])

	const handleSubmit = async () => {
		if (!item || !activeCompanyId) return

		if (!recipientEmail.trim()) {
			toast.error('Veuillez saisir une adresse email')
			return
		}
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(recipientEmail)) {
			toast.error('Adresse email invalide')
			return
		}

		setIsGeneratingPdf(true)
		try {
			// 1. Generer le PDF
			const pdfBlob = await pdf(
				<ConsignmentPdfDocument
					item={item}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
					commissionRate={commissionRate}
					referenceNumber={ref}
				/>,
			).toBlob()

			// 2. Convertir en base64
			const pdfBase64 = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onloadend = () => {
					const base64 = (reader.result as string).split(',')[1]
					resolve(base64)
				}
				reader.onerror = reject
				reader.readAsDataURL(pdfBlob)
			})

			setIsGeneratingPdf(false)
			setIsSending(true)

			// 3. Envoyer via l'endpoint dédié dépôt-vente (sans invoiceId)
			const response = await fetch('/api/consignment/send-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore?.token
						? `Bearer ${pb.authStore.token}`
						: '',
				},
				body: JSON.stringify({
					recipientEmail: recipientEmail.trim(),
					recipientName: recipientName.trim() || undefined,
					subject: subject.trim() || undefined,
					message: message.trim() || undefined,
					pdfBase64,
					pdfFilename: `Depot-vente_${ref}.pdf`,
				}),
			})

			if (!response.ok) {
				const err = await response.json().catch(() => ({}))
				throw new Error(err.message || "Erreur lors de l'envoi")
			}

			toast.success('Bordereau envoye par email')

			// 4. Sauvegarder l'email client si demande et absent
			const shouldSaveEmail =
				saveEmailToCustomer && !customer.email && recipientEmail.trim()

			if (shouldSaveEmail) {
				try {
					await updateCustomer.mutateAsync({
						id: customer.id,
						data: { email: recipientEmail.trim() },
					})
					toast.success('Email du client mis a jour')
				} catch (err) {
					console.error('Erreur mise a jour email client:', err)
				}
			}

			onOpenChange(false)
			onSuccess?.()
		} catch (error) {
			console.error('Erreur envoi email bordereau:', error)
			toast.error(
				error instanceof Error
					? error.message
					: "Erreur lors de l'envoi de l'email",
			)
		} finally {
			setIsGeneratingPdf(false)
			setIsSending(false)
		}
	}

	const customerHasNoEmail = !customer.email
	const isPending = isGeneratingPdf || isSending

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Mail className='h-5 w-5' />
						Envoyer le bordereau par email
					</DialogTitle>
					<DialogDescription>
						Envoyez le bordereau de depot-vente <strong>{ref}</strong> au
						deposant.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					{customerHasNoEmail && (
						<div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm'>
							<AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
							<div className='flex-1'>
								<p className='font-medium'>Email client non renseigne</p>
								<p className='text-amber-700 mb-2'>
									Ce client n'a pas d'adresse email enregistree.
								</p>
								<div className='flex items-center gap-2'>
									<Checkbox
										id='saveEmailCons'
										checked={saveEmailToCustomer}
										onCheckedChange={(checked) =>
											setSaveEmailToCustomer(checked === true)
										}
									/>
									<Label
										htmlFor='saveEmailCons'
										className='text-amber-800 font-normal cursor-pointer'
									>
										Enregistrer cet email pour ce client
									</Label>
								</div>
							</div>
						</div>
					)}

					<div className='grid gap-4'>
						<div className='grid grid-cols-2 gap-4'>
							<div>
								<Label htmlFor='cons-email'>
									Email <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='cons-email'
									type='email'
									placeholder='client@example.com'
									value={recipientEmail}
									onChange={(e) => setRecipientEmail(e.target.value)}
								/>
							</div>
							<div>
								<Label htmlFor='cons-name'>Nom</Label>
								<Input
									id='cons-name'
									placeholder='Nom du deposant'
									value={recipientName}
									onChange={(e) => setRecipientName(e.target.value)}
								/>
							</div>
						</div>

						<div>
							<Label htmlFor='cons-subject'>Objet</Label>
							<Input
								id='cons-subject'
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
							/>
						</div>

						<div>
							<Label htmlFor='cons-message'>Message</Label>
							<Textarea
								id='cons-message'
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								rows={7}
							/>
						</div>

						<div className='flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm'>
							<Paperclip className='h-4 w-4 shrink-0' />
							<div>
								<p className='font-medium'>Piece jointe</p>
								<p className='text-blue-600 text-xs'>Depot-vente_{ref}.pdf</p>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Annuler
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isPending || !recipientEmail.trim()}
					>
						{isPending ? (
							<>
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
								{isGeneratingPdf ? 'Generation PDF...' : 'Envoi en cours...'}
							</>
						) : (
							<>
								<Mail className='h-4 w-4 mr-2' />
								Envoyer
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
