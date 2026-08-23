// frontend/modules/stats/JournalDesVentesPage.tsx
//
// « Où j'en suis de mon chiffre d'affaires ? » — la question posée par le
// commerçant, et à laquelle rien ne répondait : le rapport Z n'existe qu'après
// clôture, et 69 % de l'argent hors caisse tombe des journées sans Z.
//
// Une ligne par journée, la plus récente en tête. On déplie pour voir les
// documents. Le vocabulaire est celui du Z — les quatre lignes du contrat —
// parce que le commerçant lit les deux : deux langages, et il ne saurait plus
// lequel croire.
//
// Cet écran n'effectue AUCUN calcul. Tout vient de /api/reports/journal.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useActiveCompany } from '@/lib/ActiveCompanyProvider'
import { AlertCircle, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useState } from 'react'

import {
	type JournalJour,
	bornesDePeriode,
	useJournalDesVentes,
} from './useJournalDesVentes'

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

type Periode = 'sept-jours' | 'trente-jours' | 'mois-en-cours' | 'libre'

export function JournalDesVentesPage() {
	const { activeCompanyId } = useActiveCompany()

	const [periode, setPeriode] = useState<Periode>('trente-jours')
	const initial = bornesDePeriode('trente-jours')
	const [du, setDu] = useState(initial.du)
	const [au, setAu] = useState(initial.au)
	const [deplies, setDeplies] = useState<Set<string>>(new Set())

	const choisirPeriode = (p: Periode) => {
		setPeriode(p)
		if (p !== 'libre') {
			const bornes = bornesDePeriode(p)
			setDu(bornes.du)
			setAu(bornes.au)
		}
	}

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

	const { data, isLoading, isError, error } = useJournalDesVentes({
		ownerCompanyId: activeCompanyId ?? undefined,
		du,
		au,
	})

	const jours = data?.jours ?? []
	const totaux = data?.totaux
	const enAttente = data?.sessions_en_attente ?? []
	const ttcEnAttente = enAttente.reduce((somme, s) => somme + s.ttc, 0)

	return (
		<div className='container mx-auto px-6 py-8 space-y-6'>
			<div>
				<h1 className='text-3xl font-bold mb-1'>Journal des ventes</h1>
				<p className='text-muted-foreground'>
					Ce qui est entré en caisse, jour par jour — clôturé ou non.
				</p>
			</div>

			{/* Période */}
			<Card>
				<CardContent className='pt-6'>
					<div className='flex flex-wrap items-end gap-4'>
						<div className='flex gap-2'>
							{(
								[
									['sept-jours', '7 jours'],
									['trente-jours', '30 jours'],
									['mois-en-cours', 'Ce mois'],
								] as const
							).map(([valeur, libelle]) => (
								<Button
									key={valeur}
									size='sm'
									variant={periode === valeur ? 'default' : 'outline'}
									onClick={() => choisirPeriode(valeur)}
								>
									{libelle}
								</Button>
							))}
						</div>

						<Separator orientation='vertical' className='h-9' />

						<div className='space-y-1'>
							<Label htmlFor='du' className='text-xs'>
								Du
							</Label>
							<Input
								id='du'
								type='date'
								value={du}
								className='w-40'
								onChange={(e) => {
									setDu(e.target.value)
									setPeriode('libre')
								}}
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor='au' className='text-xs'>
								Au
							</Label>
							<Input
								id='au'
								type='date'
								value={au}
								className='w-40'
								onChange={(e) => {
									setAu(e.target.value)
									setPeriode('libre')
								}}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{isError && (
				<Card className='border-destructive'>
					<CardContent className='pt-6 flex items-center gap-2 text-destructive'>
						<AlertCircle className='h-4 w-4' />
						{(error as Error)?.message ?? 'Erreur de chargement'}
					</CardContent>
				</Card>
			)}

			{/* Les sessions fermées qui n'ont jamais eu leur Z. Volontairement
			    au-dessus du cumul, et indépendant de la période affichée : c'est le
			    seul manque réel de clôture, et il doit se voir. */}
			{enAttente.length > 0 && (
				<Card className='border-amber-300 bg-amber-50/60'>
					<CardHeader className='pb-3'>
						<CardTitle className='text-base flex items-center gap-2'>
							<AlertCircle className='h-4 w-4 text-amber-600' />
							{enAttente.length} session(s) de caisse fermée(s) sans rapport Z
						</CardTitle>
						<CardDescription>
							{euros(ttcEnAttente)} de tickets qui ne sont dans aucune clôture.
							Toutes périodes confondues, pas seulement celle affichée.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-1'>
						{enAttente.map((s) => (
							<div
								key={s.id}
								className='flex flex-wrap items-center gap-3 text-sm py-1 border-b last:border-0 border-amber-200'
							>
								<span className='text-muted-foreground'>
									ouverte le {s.ouverte_le}
									{s.fermee_le !== s.ouverte_le &&
										` → fermée le ${s.fermee_le}`}
								</span>
								<span className='font-medium'>{s.nb_tickets} ticket(s)</span>
								<span className='font-medium tabular-nums'>{euros(s.ttc)}</span>
								{s.jour_deja_clos && (
									<Badge variant='outline' className='text-xs'>
										bloquée — le {s.fermee_le} porte déjà {s.z_du_jour}
									</Badge>
								)}
							</div>
						))}
					</CardContent>
				</Card>
			)}

			{/* Cumul de la période */}
			{totaux && (
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-base'>Sur la période</CardTitle>
						<CardDescription>
							{totaux.nb_jours} journée(s) avec activité · {totaux.nb_documents}{' '}
							document(s)
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						<div className='flex items-baseline justify-between'>
							<span className='text-sm font-medium uppercase tracking-wide text-muted-foreground'>
								Encaissé
							</span>
							<span className='text-3xl font-bold tabular-nums text-emerald-600'>
								{euros(totaux.encaisse)}
							</span>
						</div>
						<Separator />
						<div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
							<Grandeur
								libelle='Ventes du jour'
								valeur={totaux.ventes_du_jour}
								precision={`dont ${euros(totaux.ventes_tva)} de TVA`}
								accent
							/>
							<Grandeur
								libelle='Règlements antérieurs'
								valeur={totaux.creances}
							/>
							<Grandeur libelle='Acomptes' valeur={totaux.acomptes} />
							<Grandeur
								libelle='Remboursements'
								valeur={totaux.remboursements}
								deduction
							/>
						</div>
						<p className='text-xs text-muted-foreground'>
							Seules les ventes du jour sont du chiffre d'affaires. Les trois
							autres lignes sont de l'argent encaissé : leur TVA a déjà été
							déclarée, ou ne leur revient pas.
						</p>
					</CardContent>
				</Card>
			)}

			{/* Les journées */}
			{isLoading ? (
				<Card>
					<CardContent className='pt-6 text-sm text-muted-foreground'>
						Chargement…
					</CardContent>
				</Card>
			) : jours.length === 0 ? (
				<Card>
					<CardContent className='pt-6 text-sm text-muted-foreground'>
						Aucun mouvement sur cette période.
					</CardContent>
				</Card>
			) : (
				<div className='space-y-2'>
					{jours.map((jour) => (
						<LigneJournee
							key={jour.date}
							jour={jour}
							deplie={deplies.has(jour.date)}
							onBasculer={() => basculer(jour.date)}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function Grandeur({
	libelle,
	valeur,
	precision,
	accent = false,
	deduction = false,
}: {
	libelle: string
	valeur: number
	precision?: string
	accent?: boolean
	deduction?: boolean
}) {
	return (
		<div>
			<div className='text-xs text-muted-foreground'>{libelle}</div>
			<div
				className={`text-lg font-semibold tabular-nums ${
					deduction && valeur > 0
						? 'text-red-600'
						: accent
							? 'text-foreground'
							: ''
				}`}
			>
				{deduction && valeur > 0 ? '−' : ''}
				{euros(valeur)}
			</div>
			{precision && (
				<div className='text-xs text-muted-foreground'>{precision}</div>
			)}
		</div>
	)
}

function LigneJournee({
	jour,
	deplie,
	onBasculer,
}: {
	jour: JournalJour
	deplie: boolean
	onBasculer: () => void
}) {
	const documents = jour.documents ?? []
	const zs = jour.z_numbers ?? []

	return (
		<Card>
			<button
				type='button'
				onClick={onBasculer}
				className='w-full text-left px-6 py-4 hover:bg-muted/40 transition-colors'
			>
				<div className='flex items-center gap-4'>
					{deplie ? (
						<ChevronDown className='h-4 w-4 shrink-0 text-muted-foreground' />
					) : (
						<ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
					)}

					<div className='min-w-0 flex-1'>
						<div className='flex flex-wrap items-center gap-2'>
							<span className='font-medium capitalize'>
								{jourLong(jour.date)}
							</span>
							{/* L'état de clôture se lit sur la SESSION des tickets, pas sur
							    la date : 42 sessions sur 65 se ferment un autre jour
							    qu'elles ne s'ouvrent. Et une journée sans ticket n'a rien à
							    clôturer — la caisse n'y était pas ouverte, l'argent est
							    arrivé par facture. */}
							{zs.map((z) => (
								<Badge key={z} variant='outline' className='gap-1 text-xs'>
									<Lock className='h-3 w-3' />
									{z}
								</Badge>
							))}
							{jour.tickets_hors_z > 0 && (
								<Badge variant='destructive' className='text-xs'>
									{jour.tickets_hors_z} ticket(s) à clôturer
								</Badge>
							)}
						</div>
						<div className='text-xs text-muted-foreground'>
							{jour.nb_documents} document(s)
							{jour.nb_tickets === 0 && ' · aucune session de caisse ce jour'}
						</div>
					</div>

					<div className='hidden md:flex items-baseline gap-6 text-sm tabular-nums'>
						<Colonne libelle='Ventes' valeur={jour.ventes_du_jour} />
						<Colonne libelle='Antérieurs' valeur={jour.creances} />
						<Colonne libelle='Acomptes' valeur={jour.acomptes} />
						<Colonne
							libelle='Rembours.'
							valeur={jour.remboursements}
							deduction
						/>
					</div>

					<div className='text-right shrink-0 w-32'>
						<div className='text-xs text-muted-foreground'>Encaissé</div>
						<div className='text-lg font-bold tabular-nums text-emerald-600'>
							{euros(jour.encaisse)}
						</div>
					</div>
				</div>
			</button>

			{deplie && (
				<CardContent className='pt-0 pb-4'>
					<Separator className='mb-3' />

					{Object.keys(jour.par_moyen ?? {}).length > 0 && (
						<div className='flex flex-wrap gap-x-6 gap-y-1 mb-3 text-sm'>
							{Object.entries(jour.par_moyen).map(([moyen, montant]) => (
								<span key={moyen}>
									<span className='text-muted-foreground'>{moyen} : </span>
									<span className='font-medium tabular-nums'>
										{euros(montant)}
									</span>
								</span>
							))}
						</div>
					)}

					{documents.length === 0 ? (
						<p className='text-sm text-muted-foreground'>Aucun document.</p>
					) : (
						<div className='space-y-1'>
							{documents.map((doc) => (
								<div
									key={doc.id}
									className='flex items-center gap-3 text-sm py-1 border-b last:border-0'
								>
									<span className='w-14 text-xs text-muted-foreground shrink-0'>
										{doc.heure}
									</span>
									<Badge variant='outline' className='text-xs shrink-0'>
										{doc.nature}
									</Badge>
									<span className='font-mono text-xs shrink-0'>
										{doc.number}
									</span>
									<span className='min-w-0 flex-1 truncate text-muted-foreground'>
										{doc.client}
									</span>
									<span className='text-xs text-muted-foreground shrink-0 hidden lg:inline'>
										{doc.ligne}
									</span>
									<span className='w-20 text-right text-xs text-muted-foreground shrink-0'>
										{doc.moyen}
									</span>
									<span
										className={`w-24 text-right font-medium tabular-nums shrink-0 ${
											doc.nature === 'avoir' ? 'text-red-600' : ''
										}`}
									>
										{doc.nature === 'avoir' ? '−' : ''}
										{euros(doc.ttc)}
									</span>
								</div>
							))}
						</div>
					)}
				</CardContent>
			)}
		</Card>
	)
}

function Colonne({
	libelle,
	valeur,
	deduction = false,
}: {
	libelle: string
	valeur: number
	deduction?: boolean
}) {
	return (
		<div className='text-right'>
			<div className='text-xs text-muted-foreground'>{libelle}</div>
			<div
				className={
					valeur === 0
						? 'text-muted-foreground'
						: deduction
							? 'text-red-600'
							: ''
				}
			>
				{deduction && valeur > 0 ? '−' : ''}
				{euros(valeur)}
			</div>
		</div>
	)
}
