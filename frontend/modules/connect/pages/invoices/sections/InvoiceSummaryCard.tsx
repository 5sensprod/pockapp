// frontend/modules/connect/pages/invoices/sections/InvoiceSummaryCard.tsx
//
// La synthèse financière du dossier. Un bloc de LECTURE, et rien d'autre :
// aucune action, aucun bouton, aucun dépliage, aucun calcul. Il rend les lignes
// que `computeInvoiceSummary` lui donne, avec les libellés qu'elle porte.
//
// Il remplace le bloc « Acomptes / Versés / Solde restant », qui disait
// « Versés » pour des acomptes seulement ÉMIS, et dont le « Solde restant »
// ignorait les avoirs. Les deux chiffres étaient faux, sur un document que le
// vendeur lit devant le client.
//
// L'encaissement, lui, reste gouverné par la zone « prochaine action ».
//
// Voir frontend/modules/connect/PocketConnect-docs/01-audit-detail-facture.md
// §12 et §16-3.

import { Card, CardContent } from '@/components/ui/card'
import type { InvoiceFinancialSummary } from '@/lib/invoices/dossier-summary'
import { formatCurrency } from '../../../utils/formatters'

interface Props {
	summary: InvoiceFinancialSummary
}

export function InvoiceSummaryCard({ summary }: Props) {
	// Un dossier qui n'a pas répondu ne se rend pas comme un dossier vide : un
	// zéro affiché est indiscernable d'une facture soldée.
	if (!summary.isResolved) {
		return (
			<Card>
				<CardContent className='p-6 space-y-3'>
					<div className='h-4 w-32 rounded bg-muted animate-pulse' />
					<div className='h-4 w-full rounded bg-muted animate-pulse' />
					<div className='h-6 w-40 rounded bg-muted animate-pulse' />
				</CardContent>
			</Card>
		)
	}

	const auDessus = summary.lines.filter((l) => !l.belowLine)
	const enDessous = summary.lines.filter((l) => l.belowLine)

	return (
		<Card>
			<CardContent className='p-6'>
				<div className='space-y-2 text-sm'>
					{auDessus.map((ligne) => {
						const estTotal = ligne.key === 'remaining'
						return (
							<div
								key={ligne.key}
								className={
									estTotal
										? 'flex justify-between items-baseline border-t pt-2 mt-2'
										: 'flex justify-between items-baseline'
								}
							>
								<span
									className={
										estTotal
											? 'font-semibold'
											: 'text-muted-foreground flex items-baseline gap-1.5'
									}
								>
									{ligne.label}
									{ligne.count != null && (
										<span className='text-xs text-muted-foreground/70'>
											({ligne.count})
										</span>
									)}
								</span>
								<span
									className={
										estTotal ? 'text-lg font-bold tabular-nums' : 'tabular-nums'
									}
								>
									{ligne.sign === '-' ? '−' : ''}
									{formatCurrency(ligne.amount, summary.currency)}
								</span>
							</div>
						)
					})}
				</div>

				{/* Sous le trait, sans signe : ces acomptes sont émis, pas encaissés.
				    Leur position dit qu'ils n'entrent pas dans le calcul. */}
				{enDessous.map((ligne) => (
					<div
						key={ligne.key}
						className='flex justify-between items-baseline text-xs text-muted-foreground mt-3 pt-3 border-t border-dashed'
					>
						<span className='flex items-baseline gap-1.5'>
							{ligne.label}
							{ligne.count != null && <span>({ligne.count})</span>}
						</span>
						<span className='tabular-nums'>
							{formatCurrency(ligne.amount, summary.currency)}
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	)
}
