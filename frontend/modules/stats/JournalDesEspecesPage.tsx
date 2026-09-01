// frontend/modules/stats/JournalDesEspecesPage.tsx
//
// « Qu'est-ce qui est entré et sorti du tiroir ? » — la question que le rapport
// Z ne pose plus depuis le 27 août 2026, où le rapprochement espèces en est
// sorti : un apport de fonds n'est ni une vente ni un encaissement de vente, et
// le Z est un document fiscal.
//
// Une ligne par journée, la plus récente en tête, avec le solde décomposé. On
// déplie pour voir les mouvements. Le fonds d'ouverture est présenté comme un
// SOLDE et jamais comme une entrée : le confondre avec un apport compterait
// chaque jour l'argent qui était déjà là la veille.
//
// Cet écran n'effectue AUCUN calcul. Tout vient de /api/reports/journal-especes.

import { PeriodFilterCard } from '@/components/PeriodFilterCard'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import {
	PERIOD_PREFERENCE_KEYS,
	formatLocalDateInputValue,
	usePeriodFilter,
} from '@/lib/hooks/usePeriodFilter'
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import {
	type JourneeEspeces,
	type MouvementEspeces,
	libelleTypeMouvement,
	useJournalDesEspeces,
} from './useJournalDesEspeces'

const euros = (montant: number) =>
	new Intl.NumberFormat('fr-FR', {
		style: 'currency',
		currency: 'EUR',
	}).format(montant)

const jourLong = (iso: string) =>
	new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	})

/**
 * Une sortie, c'est un mouvement qui QUITTE le tiroir : `sens < 0`. C'est le
 * serveur qui l'a écrit (useJournalDesEspeces, champ `sens`) ; on le lit, on ne
 * le redéduit pas du type de mouvement.
 */
const estSortie = (mvt: MouvementEspeces) => mvt.sens < 0

/** Une journée « avec sortie » est une journée qui porte au moins un tel mouvement. */
const journeeAvecSortie = (jour: JourneeEspeces) =>
	(jour.mouvements ?? []).some(estSortie)

export function JournalDesEspecesPage() {
	const { activeCompanyId } = useActiveCompany()

	const { period, setPeriod, setDateFrom, setDateTo, dateRange } =
		usePeriodFilter('trente-jours', PERIOD_PREFERENCE_KEYS.cashJournal)
	const du = dateRange.from ?? ''
	const au = dateRange.to ?? ''
	const requeteDu = period === 'toutes' ? '0001-01-01' : du
	const requeteAu =
		period === 'toutes' ? formatLocalDateInputValue(new Date()) : au
	const [deplies, setDeplies] = useState<Set<string>>(new Set())
	const [sortiesSeules, setSortiesSeules] = useState(false)

	const basculer = (date: string) => {
		setDeplies((actuels) => {
			const suivant = new Set(actuels)
			if (suivant.has(date)) {
				suivant.delete(date)
			} else {
				suivant.add(date)
			}
			return suivant
		})
	}

	const { data, isLoading, isError, error } = useJournalDesEspeces({
		ownerCompanyId: activeCompanyId ?? undefined,
		du: requeteDu,
		au: requeteAu,
	})

	const tousLesJours = data?.jours ?? []
	// Filtre d'AFFICHAGE seulement : les totaux restent ceux de la période
	// entière, tels que la route les a calculés. Les amputer ici reviendrait à
	// recalculer côté React ce que le Go a déjà agrégé.
	const jours = sortiesSeules
		? tousLesJours.filter(journeeAvecSortie)
		: tousLesJours
	const totaux = data?.totaux

	return (
		<div className='container mx-auto px-6 py-8 space-y-6'>
			<div>
				<h1 className='text-3xl font-bold mb-1'>Journal des espèces</h1>
				<p className='text-muted-foreground'>
					Ce qui est entré et sorti du tiroir, jour par jour.
				</p>
			</div>

			<PeriodFilterCard
				period={period}
				from={du}
				to={au}
				onPeriodChange={setPeriod}
				onFromChange={setDateFrom}
				onToChange={setDateTo}
			/>

			<div className='flex items-center gap-2'>
				<Checkbox
					id='sorties-seules'
					checked={sortiesSeules}
					onCheckedChange={(coche) => setSortiesSeules(coche === true)}
				/>
				<Label htmlFor='sorties-seules' className='text-sm font-normal'>
					Seulement les journées avec une sortie
				</Label>
				{sortiesSeules && (
					<span className='text-xs text-muted-foreground'>
						{jours.length} journée{jours.length > 1 ? 's' : ''} sur{' '}
						{tousLesJours.length} — les totaux ci-dessous restent ceux de toute
						la période.
					</span>
				)}
			</div>

			{isError && (
				<Card className='border-red-200 bg-red-50'>
					<CardContent className='pt-6 flex items-start gap-3'>
						<AlertCircle className='h-5 w-5 text-red-600 mt-0.5' />
						<p className='text-sm text-red-900'>
							{error instanceof Error ? error.message : 'Erreur inconnue'}
						</p>
					</CardContent>
				</Card>
			)}

			{/* Cumul de la période */}
			{totaux && (
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-base'>Sur la période</CardTitle>
						<CardDescription>
							{totaux.nb_mouvements} mouvement
							{totaux.nb_mouvements > 1 ? 's' : ''} sur {totaux.nb_jours}{' '}
							journée
							{totaux.nb_jours > 1 ? 's' : ''}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className='grid grid-cols-2 md:grid-cols-5 gap-4'>
							<Colonne
								libelle='Espèces des ventes'
								valeur={totaux.especes_des_ventes}
							/>
							<Colonne libelle='Apports' valeur={totaux.apports} />
							<Colonne libelle='Sorties' valeur={totaux.sorties} sortie />
							<Colonne
								libelle='Remises en banque'
								valeur={totaux.remises_en_banque}
								sortie
							/>
							<Colonne
								libelle='Remboursements'
								valeur={totaux.remboursements}
								sortie
							/>
						</div>
					</CardContent>
				</Card>
			)}

			{isLoading && (
				<p className='text-sm text-muted-foreground'>Chargement…</p>
			)}

			{!isLoading && jours.length === 0 && (
				<Card>
					<CardContent className='pt-6'>
						<p className='text-sm text-muted-foreground'>
							{sortiesSeules
								? "Aucune sortie d'espèces sur cette période."
								: "Aucun mouvement d'espèces sur cette période."}
						</p>
					</CardContent>
				</Card>
			)}

			{jours.map((jour) => (
				<Journee
					key={jour.date}
					jour={jour}
					deplie={deplies.has(jour.date)}
					sortiesSeules={sortiesSeules}
					basculer={() => basculer(jour.date)}
				/>
			))}
		</div>
	)
}

function Journee({
	jour,
	deplie,
	sortiesSeules,
	basculer,
}: {
	jour: JourneeEspeces
	deplie: boolean
	sortiesSeules: boolean
	basculer: () => void
}) {
	const tousLesMouvements = jour.mouvements ?? []
	const mouvements = sortiesSeules
		? tousLesMouvements.filter(estSortie)
		: tousLesMouvements
	// Un tiroir négatif n'existe pas : c'est le signe d'un fonds d'ouverture
	// saisi déjà net d'une remise en banque (04-refonte-du-z.md, §7). L'écran le
	// montre, il ne le corrige pas.
	const soldeImpossible = jour.solde_theorique < 0
	const ecartNotable = jour.comptage_connu && Math.abs(jour.ecart) > 0.5

	return (
		<Card>
			<CardHeader className='pb-3'>
				<button
					type='button'
					onClick={basculer}
					className='flex items-center gap-2 text-left w-full'
				>
					{deplie ? (
						<ChevronDown className='h-4 w-4 shrink-0' />
					) : (
						<ChevronRight className='h-4 w-4 shrink-0' />
					)}
					<span className='font-medium capitalize'>{jourLong(jour.date)}</span>
					<span className='text-sm text-muted-foreground'>
						{sortiesSeules
							? `${mouvements.length} sortie${mouvements.length > 1 ? 's' : ''}`
							: `${jour.nb_mouvements} mouvement${jour.nb_mouvements > 1 ? 's' : ''}`}
					</span>
					<span className='ml-auto font-semibold tabular-nums'>
						{euros(jour.solde_theorique)}
					</span>
				</button>
			</CardHeader>

			<CardContent className='pt-0'>
				{/* Ce qu'on vient lire ici, c'est le MOTIF de chaque mouvement : il est
				    donc toujours à l'écran. Le rapprochement du tiroir — décomposition,
				    solde théorique, comptage, écart — se déplie, parce qu'il ne se
				    consulte qu'en cas de doute. */}
				{deplie && (
					<>
						{/* Le tiroir décomposé : fonds + ventes + apports − sorties − remises
				    − remboursements. La décomposition est le seul affichage qui rende
				    un fonds d'ouverture faux visible à l'œil. */}
						<div className='grid grid-cols-2 md:grid-cols-6 gap-3 text-sm'>
							<Colonne
								libelle='Fonds d’ouverture'
								valeur={jour.solde_ouverture}
								absent={!jour.ouverture_connue}
							/>
							<Colonne
								libelle='Espèces des ventes'
								valeur={jour.especes_des_ventes}
							/>
							<Colonne libelle='Apports' valeur={jour.apports} />
							<Colonne libelle='Sorties' valeur={jour.sorties} sortie />
							<Colonne
								libelle='Remises en banque'
								valeur={jour.remises_en_banque}
								sortie
							/>
							<Colonne
								libelle='Remboursements'
								valeur={jour.remboursements}
								sortie
							/>
						</div>

						<Separator className='my-3' />

						<div className='flex flex-wrap items-center gap-x-8 gap-y-2 text-sm'>
							<span>
								<span className='text-muted-foreground'>
									Devrait être au tiroir :{' '}
								</span>
								<span
									className={`font-semibold tabular-nums ${
										soldeImpossible ? 'text-red-600' : ''
									}`}
								>
									{euros(jour.solde_theorique)}
								</span>
							</span>
							{jour.comptage_connu ? (
								<>
									<span>
										<span className='text-muted-foreground'>Compté : </span>
										<span className='font-semibold tabular-nums'>
											{euros(jour.compte)}
										</span>
									</span>
									<span>
										<span className='text-muted-foreground'>Écart : </span>
										<span
											className={`font-semibold tabular-nums ${
												ecartNotable ? 'text-red-600' : ''
											}`}
										>
											{euros(jour.ecart)}
										</span>
									</span>
								</>
							) : (
								<span className='text-xs text-muted-foreground'>
									Tiroir non compté ce jour-là — aucun écart à lire.
								</span>
							)}
						</div>

						{soldeImpossible && (
							<p className='text-xs text-red-700 mt-2'>
								Solde négatif : un tiroir ne peut pas l'être. Le fonds
								d'ouverture a probablement été saisi déjà net d'une remise en
								banque, qui se retranche alors une seconde fois.
							</p>
						)}

						<Separator className='my-3' />
					</>
				)}

				{mouvements.length === 0 ? (
					<p className='text-sm text-muted-foreground'>
						{sortiesSeules ? 'Aucune sortie.' : 'Aucun mouvement.'}
					</p>
				) : (
					<div className='space-y-1'>
						{mouvements.map((mvt) => (
							<div
								key={mvt.id}
								className='flex items-center gap-3 text-sm py-1 border-b last:border-0'
							>
								<span className='w-14 text-xs text-muted-foreground shrink-0'>
									{mvt.heure}
								</span>
								<Badge variant='outline' className='text-xs shrink-0'>
									{libelleTypeMouvement(mvt.type)}
								</Badge>
								<Badge
									variant={mvt.nature === 'vente' ? 'secondary' : 'outline'}
									className='text-xs shrink-0'
								>
									{mvt.nature}
								</Badge>
								<span className='font-mono text-xs shrink-0'>
									{mvt.document}
								</span>
								<span
									className='min-w-0 flex-1 truncate text-muted-foreground'
									title={mvt.motif}
								>
									{mvt.motif}
								</span>
								<span className='text-xs text-muted-foreground shrink-0 hidden lg:inline'>
									{mvt.auteur}
								</span>
								<span
									className={`w-24 text-right font-medium tabular-nums shrink-0 ${
										mvt.sens < 0 ? 'text-red-600' : ''
									}`}
								>
									{mvt.sens < 0 ? '−' : ''}
									{euros(mvt.montant)}
								</span>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function Colonne({
	libelle,
	valeur,
	sortie = false,
	absent = false,
}: {
	libelle: string
	valeur: number
	sortie?: boolean
	absent?: boolean
}) {
	return (
		<div>
			<div className='text-xs text-muted-foreground'>{libelle}</div>
			{absent ? (
				<div className='text-sm text-muted-foreground'>—</div>
			) : (
				<div
					className={`font-medium tabular-nums ${sortie && valeur > 0 ? 'text-red-600' : ''}`}
				>
					{sortie && valeur > 0 ? '−' : ''}
					{euros(valeur)}
				</div>
			)}
		</div>
	)
}
