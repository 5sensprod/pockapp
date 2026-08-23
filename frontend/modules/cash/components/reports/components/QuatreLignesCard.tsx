// frontend/modules/cash/components/reports/components/QuatreLignesCard.tsx
// Ticket Z-9 — l'affichage du contrat « un total, quatre lignes ».
// Contrat : frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md, §1.
//
//	ENCAISSÉ AUJOURD'HUI ........................  1 240,50 €
//	  Ventes du jour ............................    890,00 €
//	  Règlements de factures antérieures ........    300,00 €
//	  Acomptes ..................................     80,50 €
//	  Remboursements ............................   − 30,00 €
//
// Un seul composant pour le Z et pour le X : le X est l'aperçu du Z, les deux
// doivent présenter le même argent de la même façon. Deux rendus séparés
// finiraient par diverger — c'est la leçon du 20 mai, transposée à l'affichage.
//
// ⚠️ Ce bloc ne doit s'afficher QUE sur un rapport en schema_version ≥ 2. Sur un
// rapport antérieur, `total_ttc` est un total mêlé et les quatre lignes
// n'existent pas ; l'appelant branche avec estZQuatreLignes().

import { Separator } from '@/components/ui/separator'

import { formatCurrency } from '../utils'

export interface QuatreLignes {
	/** Ligne 1 — la seule qui porte du chiffre d'affaires. */
	ventesDuJour: number
	/** Ligne 2 — règlements de factures émises un jour antérieur. */
	creances: number
	/** Ligne 3 — acomptes, factures de solde, parentes amputées. */
	acomptes: number
	/** Ligne 4 — remboursements, en déduction. */
	remboursements: number
	/** Le total encaissé, tel que le backend l'a calculé et haché. */
	encaisse: number
}

function Ligne({
	libelle,
	montant,
	precision,
	deduction = false,
}: {
	libelle: string
	montant: number
	precision?: string
	deduction?: boolean
}) {
	// Une ligne à zéro reste AFFICHÉE : son absence se lirait comme une donnée
	// manquante, alors que zéro est une information — aucun acompte ce jour-là.
	return (
		<div className='flex items-baseline justify-between gap-4 py-1.5'>
			<div className='min-w-0'>
				<span className='text-sm'>{libelle}</span>
				{precision && (
					<span className='ml-2 text-xs text-muted-foreground'>
						{precision}
					</span>
				)}
			</div>
			<span
				className={`shrink-0 font-medium tabular-nums ${
					deduction && montant > 0 ? 'text-red-600' : ''
				}`}
			>
				{deduction && montant > 0 ? '−' : ''}
				{formatCurrency(montant)}
			</span>
		</div>
	)
}

export function QuatreLignesCard({
	lignes,
	titre = 'Encaissé aujourd’hui',
	tvaVentesDuJour,
}: {
	lignes: QuatreLignes
	titre?: string
	/** TVA de la ligne 1. Rappelée ici parce que c'est la seule ligne qui en a. */
	tvaVentesDuJour?: number
}) {
	return (
		<div>
			<div className='flex items-baseline justify-between gap-4'>
				<span className='text-sm font-medium uppercase tracking-wide text-muted-foreground'>
					{titre}
				</span>
				<span className='text-3xl font-bold tabular-nums text-emerald-600'>
					{formatCurrency(lignes.encaisse)}
				</span>
			</div>

			<Separator className='my-3' />

			<div className='pl-1'>
				<Ligne
					libelle='Ventes du jour'
					montant={lignes.ventesDuJour}
					precision='tickets et factures encaissées le jour de leur émission'
				/>
				<Ligne
					libelle='Règlements de factures antérieures'
					montant={lignes.creances}
					precision='TVA déjà déclarée à l’émission'
				/>
				<Ligne
					libelle='Acomptes'
					montant={lignes.acomptes}
					precision='trésorerie, pas du chiffre d’affaires'
				/>
				<Ligne
					libelle='Remboursements'
					montant={lignes.remboursements}
					deduction
				/>
			</div>

			{tvaVentesDuJour !== undefined && (
				<>
					<Separator className='my-3' />
					<div className='flex items-baseline justify-between gap-4'>
						<span className='text-sm'>
							TVA collectée{' '}
							<span className='text-xs text-muted-foreground'>
								sur les ventes du jour, et elles seules
							</span>
						</span>
						<span className='font-semibold tabular-nums text-blue-600'>
							{formatCurrency(tvaVentesDuJour)}
						</span>
					</div>
				</>
			)}
		</div>
	)
}
