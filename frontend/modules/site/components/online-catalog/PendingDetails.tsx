// frontend/modules/site/components/online-catalog/PendingDetails.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LE DÉTAIL DE CE QUI ATTEND — nommé, et envoyable ligne par ligne
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le 14 septembre 2026. La bande de synchronisation dit COMBIEN ; elle ne
// disait pas QUI. Le seul geste offert était « Envoyer (14) » — tout, ou rien.
// Sur une fiche d'essai, une catégorie qu'on vient de renommer ou une marque
// dont on a corrigé le texte, c'est un bloc entier pour une ligne.
//
// Ici : un groupe par état, replié, et dans chaque groupe **le nom de chaque
// entité avec son propre bouton**. Le groupe garde son envoi global quand il en
// a un — les deux ne s'excluent pas.
//
// ── DEUX BORNES, ET ELLES SONT DANS LE CODE ────────────────────────────────
//  • Les lignes sont plafonnées (`MAX_LIGNES`). « 2412 modifiés » après une
//    campagne remplirait la page d'une liste que personne ne lit, et le rendu
//    de 2412 boutons n'est pas gratuit. Au-delà, on dit combien restent et on
//    renvoie à l'envoi global.
//  • Le contenu n'est monté qu'à l'ouverture du groupe (`<details>` natif) :
//    replié, il ne coûte rien.
// ═══════════════════════════════════════════════════════════════════════════

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CloudUpload, Loader2, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'

const MAX_LIGNES = 50

export type LigneEnAttente = {
	cle: string
	nom: string
	/** Ce qui aide à reconnaître la fiche : référence, clé stable… */
	detail?: string
	/** Absente quand la ligne ne peut PAS être envoyée — une fiche supprimée
	 *  ici, par exemple : elle n'existe plus, il n'y a rien à exporter. */
	envoyer?: () => void
	/** Retirer la ligne de la base du site. **Sans retour** : la ligne SQL et
	 *  les images partent. Réservé aux fiches qui n'existent plus ici — un
	 *  produit encore présent se retire en le dépubliant. Le bouton s'arme
	 *  avant d'agir : un clic ne suffit pas. */
	retirer?: () => void
}

export type GroupeEnAttente = {
	cle: string
	titre: string
	/** Une phrase qui dit ce que l'envoi va faire, ou pourquoi il n'y en a pas. */
	aide: string
	lignes: LigneEnAttente[]
	/** L'action qui porte sur TOUT le groupe, quand elle a un sens : envoyer
	 *  les textes, ou aller chercher les noms que le site est seul à connaître.
	 *  `lecture` change l'icône — une loupe, pas un envoi : ce bouton-là
	 *  n'écrit rien. */
	envoyerTout?: {
		label: string
		onClick: () => void
		icone?: 'envoi' | 'lecture'
		enCours?: boolean
	}
	/** Déplié d'emblée. Réservé aux états qu'AUCUN automatisme ne couvre — une
	 *  fiche qu'on vient de créer doit être sous la phrase, pas derrière un
	 *  clic. Les autres restent repliés : c'est ce qui garde l'écran lisible
	 *  quand une campagne laisse 2412 fiches modifiées. */
	ouvertParDefaut?: boolean
}

export function PendingDetails({
	groupes,
	occupe,
}: {
	groupes: GroupeEnAttente[]
	/** Un envoi est en cours : on n'en empile pas un second depuis une ligne. */
	occupe: boolean
}) {
	// La ligne dont le retrait est ARMÉ. Une seule à la fois : le second clic
	// est irréversible, il ne doit pas pouvoir tomber sur une autre ligne que
	// celle qu'on regarde.
	const [armee, setArmee] = useState<string | null>(null)
	const utiles = groupes.filter((groupe) => groupe.lignes.length > 0)
	if (utiles.length === 0) return null

	return (
		<Card className='mb-6'>
			<CardContent className='space-y-2 pt-6'>
				<p className='font-medium text-sm'>Le détail, ligne par ligne</p>
				{utiles.map((groupe) => (
					<details
						key={groupe.cle}
						open={groupe.ouvertParDefaut}
						className='rounded-md border'
					>
						<summary className='flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm'>
							<span className='font-medium'>{groupe.titre}</span>
							<span className='rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums'>
								{groupe.lignes.length}
							</span>
							<span className='text-muted-foreground text-xs'>
								{groupe.aide}
							</span>
						</summary>

						<div className='border-t px-3 py-2'>
							{groupe.envoyerTout && (
								<div className='mb-2'>
									<Button
										size='sm'
										variant='secondary'
										disabled={occupe || groupe.envoyerTout.enCours}
										onClick={groupe.envoyerTout.onClick}
									>
										{groupe.envoyerTout.enCours ? (
											<Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
										) : groupe.envoyerTout.icone === 'lecture' ? (
											<Search className='mr-1.5 h-3.5 w-3.5' />
										) : (
											<CloudUpload className='mr-1.5 h-3.5 w-3.5' />
										)}
										{groupe.envoyerTout.label}
									</Button>
								</div>
							)}

							<ul className='divide-y'>
								{groupe.lignes.slice(0, MAX_LIGNES).map((ligne) => (
									<li
										key={ligne.cle}
										className='flex items-center gap-2 py-1.5 text-sm'
									>
										<span className='min-w-0 flex-1 truncate'>
											{ligne.nom || '(sans nom)'}
											{ligne.detail && (
												<span className='ml-2 font-mono text-muted-foreground text-xs'>
													{ligne.detail}
												</span>
											)}
										</span>
										{ligne.envoyer && (
											<Button
												size='sm'
												variant='ghost'
												disabled={occupe}
												onClick={ligne.envoyer}
												title='Envoyer cette fiche au site'
											>
												<CloudUpload className='mr-1.5 h-3.5 w-3.5' />
												Envoyer
											</Button>
										)}
										{ligne.retirer &&
											(armee === ligne.cle ? (
												<>
													<Button
														size='sm'
														variant='destructive'
														disabled={occupe}
														onClick={() => {
															setArmee(null)
															ligne.retirer?.()
														}}
													>
														Confirmer le retrait
													</Button>
													<Button
														size='sm'
														variant='ghost'
														onClick={() => setArmee(null)}
													>
														Annuler
													</Button>
												</>
											) : (
												<Button
													size='sm'
													variant='ghost'
													disabled={occupe}
													onClick={() => setArmee(ligne.cle)}
													title='Retirer définitivement cette fiche de la base du site'
												>
													<Trash2 className='mr-1.5 h-3.5 w-3.5' />
													Retirer du site
												</Button>
											))}
									</li>
								))}
							</ul>

							{groupe.lignes.length > MAX_LIGNES && (
								<p className='pt-2 text-muted-foreground text-xs'>
									… et {groupe.lignes.length - MAX_LIGNES} autre(s). Au-delà de{' '}
									{MAX_LIGNES}, la liste ne s'affiche plus ligne à ligne :
									utilisez l'envoi global.
								</p>
							)}
						</div>
					</details>
				))}
			</CardContent>
		</Card>
	)
}
