// frontend/components/reports/TableauVendeurs.tsx
//
// Le détail PAR VENDEUR, partagé par le rapport X et le journal des ventes.
// Aucun calcul : tout vient du Go (backend/reports/vendeurs.go), qui attribue
// un document à celui qui l'a encaissé, à défaut celui qui l'a émis.

export interface VendeurTotal {
	id: string
	nom: string
	ventes_du_jour: number
	creances: number
	acomptes: number
	remboursements: number
	encaisse: number
	nb_documents: number
}

const euros = (montant: number) =>
	new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
		montant,
	)

export function TableauVendeurs({
	vendeurs,
}: {
	vendeurs: VendeurTotal[] | null | undefined
}) {
	if (!vendeurs || vendeurs.length === 0) return null
	return (
		<div className='space-y-2'>
			<div className='overflow-x-auto'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b text-left text-muted-foreground text-xs'>
							<th className='py-1.5 pr-3 font-medium'>Vendeur</th>
							<th className='py-1.5 px-2 text-right font-medium'>
								Ventes du jour
							</th>
							<th className='py-1.5 px-2 text-right font-medium'>Règlements</th>
							<th className='py-1.5 px-2 text-right font-medium'>Acomptes</th>
							<th className='py-1.5 px-2 text-right font-medium'>Rembours.</th>
							<th className='py-1.5 pl-2 text-right font-medium'>Encaissé</th>
						</tr>
					</thead>
					<tbody>
						{vendeurs.map((v) => (
							<tr key={v.id || 'non-attribue'} className='border-b last:border-0'>
								<td className='py-1.5 pr-3'>
									<span className='font-medium'>{v.nom}</span>{' '}
									<span className='text-xs text-muted-foreground'>
										· {v.nb_documents} doc.
									</span>
								</td>
								<td className='py-1.5 px-2 text-right tabular-nums'>
									{euros(v.ventes_du_jour)}
								</td>
								<td className='py-1.5 px-2 text-right tabular-nums'>
									{euros(v.creances)}
								</td>
								<td className='py-1.5 px-2 text-right tabular-nums'>
									{euros(v.acomptes)}
								</td>
								<td className='py-1.5 px-2 text-right tabular-nums text-destructive'>
									{v.remboursements > 0 ? `−${euros(v.remboursements)}` : euros(0)}
								</td>
								<td className='py-1.5 pl-2 text-right font-semibold tabular-nums'>
									{euros(v.encaisse)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className='text-xs text-muted-foreground'>
				Un document est attribué à celui qui l'a encaissé, à défaut celui qui l'a
				émis. Un avoir est retranché de celui qui rembourse. « Non attribué » :
				documents anciens sans auteur.
			</p>
		</div>
	)
}
