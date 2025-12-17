'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { RapportX } from '@/lib/types/cash.types'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { FileText, Loader2, Printer } from 'lucide-react'

interface RapportXDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	rapport: RapportX | undefined
	isLoading?: boolean
}

export function RapportXDialog({
	open,
	onOpenChange,
	rapport,
	isLoading,
}: RapportXDialogProps) {
	const handlePrint = () => {
		window.print()
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<div>
							<DialogTitle className='flex items-center gap-2'>
								<FileText className='h-5 w-5' />
								Rapport X - Lecture Intermédiaire
							</DialogTitle>
							{rapport && (
								<DialogDescription>
									Session ouverte le {formatDateTime(rapport.session.opened_at)}
								</DialogDescription>
							)}
						</div>
						{rapport && (
							<Button variant='outline' size='sm' onClick={handlePrint}>
								<Printer className='mr-2 h-4 w-4' />
								Imprimer
							</Button>
						)}
					</div>
				</DialogHeader>

				{isLoading ? (
					<div className='flex items-center justify-center py-12'>
						<Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
					</div>
				) : !rapport ? (
					<div className='text-center py-12 text-muted-foreground'>
						Aucune donnée disponible
					</div>
				) : (
					<div className='space-y-6'>
						{/* Informations session */}
						<Card>
							<CardContent className='pt-6 space-y-2 text-sm'>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Caisse :</span>
									<span className='font-medium'>
										{rapport.session.cash_register}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Générée le :</span>
									<span className='font-medium'>
										{formatDateTime(rapport.generated_at)}
									</span>
								</div>
								<div className='flex justify-between'>
									<span className='text-muted-foreground'>Statut :</span>
									<Badge variant='default'>Session ouverte</Badge>
								</div>
							</CardContent>
						</Card>

						<Separator />

						{/* Ventes */}
						<div>
							<h4 className='font-semibold mb-3'>Ventes</h4>
							<Card>
								<CardContent className='pt-6 space-y-3'>
									<div className='flex justify-between text-sm'>
										<span>Nombre de tickets :</span>
										<span className='font-semibold'>
											{rapport.sales.invoice_count}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Total TTC :</span>
										<span className='font-bold text-lg'>
											{formatCurrency(rapport.sales.total_ttc)}
										</span>
									</div>

									{Object.keys(rapport.sales.by_method).length > 0 && (
										<>
											<Separator />
											<div>
												<div className='text-xs font-medium text-muted-foreground mb-2'>
													Répartition par mode de paiement
												</div>
												<div className='space-y-2'>
													{Object.entries(rapport.sales.by_method).map(
														([method, amount]) => (
															<div
																key={method}
																className='flex justify-between text-sm'
															>
																<span className='capitalize'>{method}</span>
																<span className='font-medium'>
																	{formatCurrency(amount)}
																</span>
															</div>
														),
													)}
												</div>
											</div>
										</>
									)}
								</CardContent>
							</Card>
						</div>

						<Separator />

						{/* Mouvements de caisse */}
						<div>
							<h4 className='font-semibold mb-3'>Mouvements de caisse</h4>
							<Card>
								<CardContent className='pt-6 space-y-2 text-sm'>
									<div className='flex justify-between'>
										<span>Entrées espèces :</span>
										<span className='text-green-600 font-medium'>
											+{formatCurrency(rapport.movements.cash_in)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Sorties espèces :</span>
										<span className='text-red-600 font-medium'>
											-{formatCurrency(rapport.movements.cash_out)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Dépôts en coffre :</span>
										<span className='text-red-600 font-medium'>
											-{formatCurrency(rapport.movements.safe_drop)}
										</span>
									</div>
									<Separator />
									<div className='flex justify-between font-semibold'>
										<span>Total mouvements :</span>
										<span>{formatCurrency(rapport.movements.total)}</span>
									</div>
								</CardContent>
							</Card>
						</div>

						<Separator />

						{/* Espèces attendues */}
						<div>
							<h4 className='font-semibold mb-3'>
								Espèces attendues en caisse
							</h4>
							<Card className='border-2 border-primary'>
								<CardContent className='pt-6 space-y-2 text-sm'>
									<div className='flex justify-between'>
										<span>Fonds de caisse :</span>
										<span className='font-medium'>
											{formatCurrency(rapport.expected_cash.opening_float)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Ventes espèces :</span>
										<span className='font-medium'>
											{formatCurrency(rapport.expected_cash.sales_cash)}
										</span>
									</div>
									<div className='flex justify-between'>
										<span>Mouvements :</span>
										<span className='font-medium'>
											{formatCurrency(rapport.expected_cash.movements)}
										</span>
									</div>
									<Separator />
									<div className='flex justify-between text-xl font-bold'>
										<span>Total attendu :</span>
										<span className='text-primary'>
											{formatCurrency(rapport.expected_cash.total)}
										</span>
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Note */}
						<div className='text-center'>
							<p className='text-sm text-muted-foreground italic'>
								{rapport.note}
							</p>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
