// frontend/modules/connect/components/SendOrderEmailDialog.tsx

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
import { usePocketBase } from '@/lib/use-pocketbase'
import { pdf } from '@react-pdf/renderer'
import { AlertCircle, Loader2, Mail, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { OrderPdfDocument } from '../pdf/OrderPdf'
import { toPngDataUrl } from '../utils/images'

interface SendOrderEmailDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	order: any | null
	onSuccess?: () => void
}

export function SendOrderEmailDialog({
	open,
	onOpenChange,
	order,
	onSuccess,
}: SendOrderEmailDialogProps) {
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any
	const updateCustomer = useUpdateCustomer()

	const [recipientEmail, setRecipientEmail] = useState('')
	const [recipientName, setRecipientName] = useState('')
	const [subject, setSubject] = useState('')
	const [message, setMessage] = useState('')
	const [isSending, setIsSending] = useState(false)
	const [saveEmailToCustomer, setSaveEmailToCustomer] = useState(true)

	// Pre-remplissage
	useEffect(() => {
		if (!order || !open) return

		const customer = order.expand?.customer
		setRecipientEmail(customer?.email || '')
		setRecipientName(customer?.name || order.customer_name || '')
		setSubject(`Bon de commande ${order.number}`)

		const totalText = new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(order.total_ttc)

		setMessage(
			`Bonjour${customer?.name ? ` ${customer.name}` : ''},\n\nVeuillez trouver ci-joint notre bon de commande ${order.number} d'un montant de ${totalText}.\n\nN'hésitez pas à nous contacter pour toute question.\n\nCordialement`,
		)
	}, [order, open])

	const handleSubmit = async () => {
		if (!order || !activeCompanyId) return

		if (!recipientEmail.trim()) {
			toast.error('Veuillez saisir une adresse email')
			return
		}
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(recipientEmail)) {
			toast.error('Adresse email invalide')
			return
		}

		setIsSending(true)
		try {
			// 1. Charger company + logo
			let company: any = null
			try {
				company = await pb.collection('companies').getOne(activeCompanyId)
			} catch (err) {
				console.warn('Entreprise non trouvee:', err)
			}

			let logoDataUrl: string | null = null
			if (company?.logo) {
				try {
					logoDataUrl = await toPngDataUrl(
						pb.files.getUrl(company, company.logo),
					)
				} catch (err) {
					console.warn('Erreur logo:', err)
				}
			}

			// 2. Charger customer si non expand
			let customer = order.expand?.customer ?? null
			if (!customer && order.customer) {
				try {
					customer = await pb.collection('customers').getOne(order.customer)
				} catch (err) {
					console.warn('Client non trouve:', err)
				}
			}

			// 3. Generer le PDF
			const pdfBlob = await pdf(
				<OrderPdfDocument
					order={order}
					customer={customer}
					company={company}
					companyLogoUrl={logoDataUrl}
				/>,
			).toBlob()

			const pdfBase64 = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader()
				reader.onloadend = () =>
					resolve((reader.result as string).split(',')[1])
				reader.onerror = reject
				reader.readAsDataURL(pdfBlob)
			})

			const pdfFilename = `BonDeCommande_${order.number.replace(/\//g, '-')}.pdf`

			// 4. POST /api/orders/send-email
			const response = await fetch('/api/orders/send-email', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: pb.authStore.token
						? `Bearer ${pb.authStore.token}`
						: '',
				},
				body: JSON.stringify({
					orderId: order.id,
					recipientEmail: recipientEmail.trim(),
					recipientName: recipientName.trim() || undefined,
					subject: subject.trim() || undefined,
					message: message.trim() || undefined,
					pdfBase64,
					pdfFilename,
				}),
			})

			if (!response.ok) {
				const err = await response.json().catch(() => ({}))
				throw new Error(err.message || "Erreur lors de l'envoi de l'email")
			}

			toast.success('Bon de commande envoyé par email')

			// 5. Sauvegarder l'email client si absent
			const customerId = order.customer
			const customerEmail = order.expand?.customer?.email
			if (
				saveEmailToCustomer &&
				!customerEmail &&
				customerId &&
				recipientEmail.trim()
			) {
				try {
					await updateCustomer.mutateAsync({
						id: customerId,
						data: { email: recipientEmail.trim() },
					})
					toast.success('Email du client mis à jour')
				} catch (err) {
					console.error('Erreur mise a jour email client:', err)
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
			setIsSending(false)
		}
	}

	const customerHasNoEmail = order?.customer && !order.expand?.customer?.email

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Mail className='h-5 w-5' />
						Envoyer le bon de commande par email
					</DialogTitle>
					<DialogDescription>
						Envoyez le bon de commande {order?.number} au client par email.
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

						<div className='flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm'>
							<Paperclip className='h-4 w-4 shrink-0' />
							<div>
								<p className='font-medium'>Pièce jointe</p>
								<p className='text-blue-600 text-xs'>
									BonDeCommande_{order?.number.replace(/\//g, '-')}.pdf
								</p>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant='outline'
						onClick={() => onOpenChange(false)}
						disabled={isSending}
					>
						Annuler
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isSending || !recipientEmail.trim()}
					>
						{isSending ? (
							<>
								<Loader2 className='h-4 w-4 animate-spin mr-2' />
								Envoi en cours...
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
