// frontend/modules/connect/pages/invoices/InvoiceDetailPage.tsx
//
// Orchestration seule. Cette page ne calcule plus rien et ne rend plus de
// dialogue : elle lit son dossier par un hook, place sept zones, et associe
// les actions a leurs gestes.

import { EmptyState } from '@/components/module-ui'
import { Card, CardContent } from '@/components/ui/card'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import type { CompaniesResponse } from '@/lib/pocketbase-types'
import { navigationActions } from '@/lib/stores/navigationStore'
import { canCreateBalanceInvoice } from '@/lib/types/invoice.types'
import { usePocketBase } from '@/lib/use-pocketbase'
import { useNavigate, useParams } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConnectModuleShell } from '../../ConnectModuleShell'
import { useDocumentNavigation } from '../../hooks/useDocumentNavigation'
import { useInvoiceActions } from '../../hooks/useInvoiceActions'
import { useInvoiceDossier } from '../../hooks/useInvoiceDossier'
import { buildInvoiceDetailHeader } from './InvoiceDetailHeader'
import { creerExecuteurAction } from './invoice-action-dispatch'
import {
	computeDiscounts,
	computeVatBreakdown,
	getSoldByLabel,
} from './invoice-detail.presenters'
import { InvoiceCustomerCard } from './sections/InvoiceCustomerCard'
import { InvoiceDialogs } from './sections/InvoiceDialogs'
import { InvoiceDossierSections } from './sections/InvoiceDossierSections'
import { InvoiceInfoGrid } from './sections/InvoiceInfoGrid'
import { InvoiceLinesCard } from './sections/InvoiceLinesCard'
import { InvoiceNextAction } from './sections/InvoiceNextAction'
import { InvoiceSummaryCard } from './sections/InvoiceSummaryCard'

// ── Composant ─────────────────────────────────────────────────────────────────
export function InvoiceDetailPage() {
	const navigate = useNavigate()
	const { invoiceId } = useParams({ from: '/connect/invoices/$invoiceId/' })
	const { goBack, search } = useDocumentNavigation('invoice')
	const { activeCompanyId } = useActiveCompany()
	const pb = usePocketBase() as any

	const dossier = useInvoiceDossier(invoiceId)
	const { invoice, isLoading } = dossier
	const [company, setCompany] = useState<CompaniesResponse | null>(null)

	// ── Actions ───────────────────────────────────────────────────────────────
	const actions = useInvoiceActions(invoice, company)

	useEffect(() => {
		const loadCompany = async () => {
			if (!activeCompanyId) return
			try {
				const c = await pb.collection('companies').getOne(activeCompanyId)
				setCompany(c)
			} catch (err) {
				console.error(err)
			}
		}
		void loadCompany()
	}, [activeCompanyId, pb])

	// ── Helpers Locaux ────────────────────────────────────────────────────────
	const pushCurrentToStore = (label: string) => {
		navigationActions.push({
			path: `/connect/invoices/${invoiceId}`,
			label,
			params: { invoiceId },
			search:
				Object.keys(search).length > 0
					? (search as Record<string, string>)
					: undefined,
		})
	}

	// ── Guards — EN TÊTE, avant tout calcul ──────────────────────────────────
	//
	// `buildInvoiceDetailHeader` n'est plus un hook (il reçoit `navigate` en
	// paramètre) : les guards peuvent donc précéder toute la logique. À partir
	// d'ici `invoice` n'est plus optionnel, ce qui supprime les `?.` et les
	// `as any` qui en découlaient.
	const headerDeChargement = buildInvoiceDetailHeader({
		navigate,
		invoice: undefined,
		invoiceId,
		actions,
		goBack,
		isCreditNote: false,
		isDeposit: false,
		isTicket: false,
		remainingAmount: 0,
		hasCancellationCreditNote: false,
		search: search as Record<string, string>,
	}).headerLeft

	if (isLoading) {
		return (
			<ConnectModuleShell
				pageTitle='Facture'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerDeChargement}
				primaryAction={null}
			>
				<EmptyState icon={FileText} title='Chargement...' fullPage />
			</ConnectModuleShell>
		)
	}

	if (!invoice) {
		return (
			<ConnectModuleShell
				pageTitle='Facture'
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerDeChargement}
				primaryAction={null}
			>
				<EmptyState
					icon={FileText}
					title='Facture introuvable'
					description="Cette facture n'existe pas ou a été supprimée."
					actions={[
						{
							label: 'Retour aux factures',
							onClick: () => navigate({ to: '/connect/invoices' }),
							variant: 'secondary',
						},
					]}
					fullPage
				/>
			</ConnectModuleShell>
		)
	}

	// ── Données dérivées du document — après les guards ──────────────────────
	const isCreditNote = invoice.invoice_type === 'credit_note'
	const isDeposit = invoice.invoice_type === 'deposit'
	const isTicket = !!(
		invoice.is_pos_ticket || invoice.number?.startsWith('TIK-')
	)
	const originalId = invoice.original_invoice_id

	// Le dossier est résolu par useInvoiceDossier : une facture de solde
	// interroge sa PARENTE, un ticket n'interroge plus rien. La liste des
	// acomptes reste réservée au rôle 'parent', ce qui préserve le rendu
	// actuel — aujourd'hui elle est vide sur une facture de solde.
	const depositsData = dossier.depositsData
	const linkedCreditNotes = dossier.creditNotes
	const sourceOrderId = invoice.source_order_id ?? null
	const sourceOrder = dossier.sourceOrder as { number?: string } | undefined

	// ── Calculs — APRÈS les guards : `invoice` est garanti ───────────────────
	const remainingAmount =
		typeof invoice.remaining_amount === 'number'
			? invoice.remaining_amount
			: invoice.total_ttc - (invoice.credit_notes_total ?? 0)

	const hasCancellationCreditNote = !!(
		linkedCreditNotes && linkedCreditNotes.length > 0
	)

	// Appels ORDINAIRES, pas des hooks : ils viennent après les guards, et un
	// hook placé après un `return` fait varier le nombre de hooks d'un rendu à
	// l'autre — « Rendered more hooks than during the previous render ».
	// Ces deux calculs sont de toute façon des sommes sur quelques lignes ;
	// `useMemo` n'y mémoïsait rien, `invoice` changeant de référence à chaque
	// réponse de requête.
	const vatBreakdown = computeVatBreakdown(invoice.items ?? [])
	const discounts = computeDiscounts(invoice)

	// ── Header ───────────────────────────────────────────────────────────────
	// `headerRight` n'est plus rendu : les actions vivent dans la zone
	// « prochaine action », hiérarchisées, et les y laisser en double
	// recréerait les CTA concurrents que cette refonte supprime.
	const { headerLeft } = buildInvoiceDetailHeader({
		navigate,
		invoice,
		invoiceId,
		actions,
		goBack,
		isCreditNote,
		// Réservés au rôle 'parent' : le dossier étant désormais résolu sur la
		// parente, une facture de solde recevrait sinon un badge « Acompte ·
		// Solde » qu'elle n'affichait pas.
		depositsTotal:
			dossier.role === 'parent' ? depositsData?.depositsTotal : undefined,
		balanceDue:
			dossier.role === 'parent' ? depositsData?.balanceDue : undefined,
		isDeposit,
		isTicket,
		remainingAmount,
		hasCancellationCreditNote,
		search: search as Record<string, string>,
		canGenerateBalance: !!(
			canCreateBalanceInvoice(invoice) &&
			!depositsData?.balanceInvoice &&
			depositsData?.pendingCount === 0
		),
	})

	// `resolveNextAction` décide QUOI proposer ; `creerExecuteurAction` dit
	// COMMENT le faire. Les deux sont séparés pour que la première reste
	// testable sans DOM.
	const executerAction = creerExecuteurAction({
		invoice,
		invoiceId,
		balanceInvoice: dossier.balanceInvoice,
		originalId,
		actions,
		navigate,
		search: search as Record<string, string>,
		pushCurrentToStore,
	})

	// ── Données dérivées (post-guard) ─────────────────────────────────────────
	const customer = invoice.expand?.customer ?? null
	const soldByLabel = getSoldByLabel(invoice)
	const originalDocument = invoice.expand?.original_invoice_id
	const originalNumber = originalDocument?.number

	return (
		<>
			<ConnectModuleShell
				hideTitle
				hideIcon
				hideBadge
				headerLeft={headerLeft}
				primaryAction={null}
			>
				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					{/* Zone 2 — la synthèse : lecture seule, aucune action */}
					{dossier.summary && (
						<div className='lg:col-span-1'>
							<InvoiceSummaryCard summary={dossier.summary} />
						</div>
					)}

					{/* Zone 3 — la prochaine action, et elle seule */}
					{dossier.nextAction && (
						<div className='lg:col-span-2'>
							<InvoiceNextAction
								resolution={dossier.nextAction}
								onAction={executerAction}
							/>
						</div>
					)}

					{/* ── Infos générales ───────────────────────────────────────── */}
					<Card className='lg:col-span-2'>
						<CardContent className='p-6 space-y-4'>
							<InvoiceInfoGrid
								invoice={invoice}
								isCreditNote={isCreditNote}
								isTicket={isTicket}
								soldByLabel={soldByLabel}
							/>

							<InvoiceDossierSections
								invoice={invoice}
								isCreditNote={isCreditNote}
								isDeposit={isDeposit}
								isTicket={isTicket}
								estParente={dossier.role === 'parent'}
								originalId={originalId}
								originalNumber={originalNumber}
								linkedCreditNotes={linkedCreditNotes}
								depositsData={depositsData}
								sourceOrderId={sourceOrderId}
								sourceOrder={sourceOrder}
								pushCurrentToStore={pushCurrentToStore}
								onOpenInvoice={(id) =>
									navigate({
										to: '/connect/invoices/$invoiceId',
										params: { invoiceId: id },
									})
								}
								onOpenOrder={(orderId) =>
									navigate({
										to: '/connect/orders/$orderId',
										params: { orderId },
										search:
											Object.keys(search).length > 0
												? (search as Record<string, string>)
												: undefined,
									})
								}
							/>
						</CardContent>
					</Card>

					{/* Client */}
					<InvoiceCustomerCard
						customer={customer}
						onOpenCustomer={(customerId) =>
							navigate({
								to: '/connect/customers/$customerId',
								params: { customerId },
							})
						}
					/>

					{/* Lignes et totaux */}
					<InvoiceLinesCard
						invoice={invoice}
						vatBreakdown={vatBreakdown}
						discounts={discounts}
					/>
				</div>
			</ConnectModuleShell>

			<InvoiceDialogs invoice={invoice} actions={actions} />
		</>
	)
}
