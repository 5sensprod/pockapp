// frontend/modules/connect/components/SendQuoteEmailDialog.tsx

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
import { useUpdateCustomer } from '@/lib/queries/customers'
import { useSendQuoteEmail } from '@/lib/queries/quotes'
import type { QuoteResponse } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { AlertCircle, Loader2, Mail, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { QuotePdfDocument } from './QuotePdf'

interface SendQuoteEmailDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	quote: QuoteResponse | null
	onSuccess?: () => void
}

export function SendQuoteEmailDialog({
	open,
	onOpenChange,
	quote,
	onSuccess,
}: SendQuoteEmailDialogProps) {
	const sendEmail = useSendQuoteEmail()
	const updateCustomer = useUpdateCustomer()
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const [recipientEmail, setRecipientEmail] = useState('')
	const [recipientName, setRecipientName] = useState('')
	const [subject, setSubject] = useState('')
	const [message, setMessage] = useState('')
	const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
	const [saveEmailToCustomer, setSaveEmailToCustomer] = useState(true)

	// Pré-remplir avec les infos du client
	useEffect(() => {
		if (quote && open) {
			const customer = quote.expand?.customer
			setRecipientEmail(customer?.email || '')
			setRecipientName(customer?.name || '')
			setSubject(`Devis ${quote.number}`)
			setMessage(
				`Bonjour${customer?.name ? ` ${customer.name}` : ''},\n\nVeuillez trouver ci-joint notre devis ${quote.number}.\n\nCe devis est valide jusqu'au ${quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('fr-FR') : 'date non précisée'}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement`,
			)
		}
	}, [quote, open])

	const handleSubmit = async () => {
		if (!quote || !activeCompanyId) return

		if (!recipientEmail.trim()) {
			toast.error('Veuillez saisir une adresse email')
			return
		}

		// Validation basique de l'email
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(recipientEmail)) {
			toast.error('Adresse email invalide')
			return
		}

		setIsGeneratingPdf(true)

		try {
			// 1️⃣ Générer le PDF
			let company: any
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvée:', err)
			}

			let customer = quote.expand?.customer
			if (!customer && quote.customer) {
				try {
					customer = await pb.collection('customers').getOne(quote.customer)
				} catch (err) {
					console.warn('Client non trouvé:', err)
				}
			}

			let companyLogoUrl: string | null = null
			if (company?.logo) {
				companyLogoUrl = pb.files.getUrl(company, company.logo)
			}

			const pdfBlob = await pdf(
				<QuotePdfDocument
					quote={quote}
					customer={customer}
					company={company}
					companyLogoUrl={companyLogoUrl}
				/>,
			).toBlob()

			// 2️⃣ Convertir en base64
			const pdfBase64 = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onloadend = () => {
					const base64 = (reader.result as string).split(',')[1]
					resolve(base64)
				}
				reader.onerror = reject
				reader.readAsDataURL(pdfBlob)
			})

			// 3️⃣ Envoyer l'email avec le PDF en pièce jointe
			await sendEmail.mutateAsync({
				quoteId: quote.id,
				recipientEmail: recipientEmail.trim(),
				recipientName: recipientName.trim() || undefined,
				subject: subject.trim() || undefined,
				message: message.trim() || undefined,
				pdfBase64,
				pdfFilename: `Devis_${quote.number.replace(/\//g, '-')}.pdf`,
			})

			toast.success('Devis envoyé par email')

			// 4️⃣ Mettre à jour l'email du client si demandé
			const customerId = quote.customer
			const customerEmail = quote.expand?.customer?.email
			const shouldSaveEmail =
				saveEmailToCustomer &&
				!customerEmail &&
				customerId &&
				recipientEmail.trim()

			console.log('📧 Save email check:', {
				saveEmailToCustomer,
				customerId,
				customerEmail,
				recipientEmail: recipientEmail.trim(),
				shouldSaveEmail,
			})

			if (shouldSaveEmail) {
				try {
					console.log(
						'📧 Updating customer email...',
						customerId,
						recipientEmail.trim(),
					)
					await updateCustomer.mutateAsync({
						id: customerId,
						data: { email: recipientEmail.trim() },
					})
					console.log('📧 Customer email updated successfully')
					toast.success('Email du client mis à jour')
				} catch (err) {
					console.error('📧 Erreur mise à jour email client:', err)
					toast.error("Erreur lors de la mise à jour de l'email client")
				}
			}

			onOpenChange(false)
			onSuccess?.()
		} catch (error) {
			console.error('Erreur envoi email:', error)
			toast.error(
				error instanceof Error
					? error.message
					: "Erreur lors de l'envoi de l'email",
			)
		} finally {
			setIsGeneratingPdf(false)
		}
	}

	const customerHasNoEmail = quote?.customer && !quote.expand?.customer?.email

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Mail className='h-5 w-5' />
						Envoyer le devis par email
					</DialogTitle>
					<DialogDescription>
						Envoyez le devis {quote?.number} au client par email.
					</DialogDescription>
				</DialogHeader>

				<div className='space-y-4'>
					{customerHasNoEmail && (
						<div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm'>
							<AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
							<div className='flex-1'>
								<p className='font-medium'>Email client non renseigné</p>
								<p className='text-amber-700 mb-2'>
									Le client n'a pas d'adresse email enregistrée.
								</p>
								<div className='flex items-center gap-2'>
									<Checkbox
										id='saveEmail'
										checked={saveEmailToCustomer}
										onCheckedChange={(checked) =>
											setSaveEmailToCustomer(checked === true)
										}
									/>
									<Label
										htmlFor='saveEmail'
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
								<Label htmlFor='recipientEmail'>
									Email du destinataire <span className='text-red-500'>*</span>
								</Label>
								<Input
									id='recipientEmail'
									type='email'
									placeholder='client@example.com'
									value={recipientEmail}
									onChange={(e) => setRecipientEmail(e.target.value)}
								/>
							</div>
							<div>
								<Label htmlFor='recipientName'>Nom du destinataire</Label>
								<Input
									id='recipientName'
									placeholder='Nom du client'
									value={recipientName}
									onChange={(e) => setRecipientName(e.target.value)}
								/>
							</div>
						</div>

						<div>
							<Label htmlFor='subject'>Objet de l'email</Label>
							<Input
								id='subject'
								placeholder='Objet'
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
							/>
						</div>

						<div>
							<Label htmlFor='message'>Message</Label>
							<Textarea
								id='message'
								placeholder='Votre message...'
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								rows={6}
							/>
						</div>

						{/* Indicateur pièce jointe */}
						<div className='flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm'>
							<Paperclip className='h-4 w-4 shrink-0' />
							<div>
								<p className='font-medium'>Pièce jointe</p>
								<p className='text-blue-600 text-xs'>
									Devis_{quote?.number.replace(/\//g, '-')}.pdf
								</p>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						disabled={sendEmail.isPending || isGeneratingPdf}
					>
						Annuler
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={
							sendEmail.isPending || isGeneratingPdf || !recipientEmail.trim()
						}
					>
						{sendEmail.isPending || isGeneratingPdf ? (
							<>
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
								{isGeneratingPdf ? 'Génération PDF...' : 'Envoi en cours...'}
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
