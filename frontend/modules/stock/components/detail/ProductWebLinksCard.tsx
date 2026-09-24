import { Link2, Plus, Trash2, Youtube } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MAX_LIENS, estUrlYouTube } from '@/lib/catalog/web-links'

import type { ProductDetailValues } from './product-detail-form'

// ═══════════════════════════════════════════════════════════════════════════
// LIENS ET VIDÉOS — la section de la fiche, et son ordre
// ═══════════════════════════════════════════════════════════════════════════
//
// Une ligne = un lien : son type, son adresse, son libellé. L'ORDRE DU TABLEAU
// EST L'ORDRE D'AFFICHAGE sur le site — même règle que la galerie d'images —,
// d'où les deux flèches de déplacement : sans elles, changer l'ordre voudrait
// dire tout retaper.
//
// La validité de l'adresse n'est pas jugée ici : `motifRefusLien`
// (`lib/catalog/web-links.ts`) est la règle, le schéma zod l'appelle, et le
// message atterrit sous le champ par `FormMessage`. Ce composant ne fait que
// SIGNALER, par l'icône, quand une adresse de type « vidéo » ne ressemble pas
// à YouTube — le vendeur le voit en tapant, pas à l'enregistrement.
//
// ⚠️ La liste s'envoie ENTIÈRE (`productDetailPayload`) : retirer une ligne ici
// et enregistrer, c'est supprimer le lien. Il n'y a rien à confirmer — un lien
// se retape, contrairement à une image, dont la suppression est irréversible.

export function ProductWebLinksCard({
	form,
}: {
	form: UseFormReturn<ProductDetailValues>
}) {
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: 'web_links',
	})
	const [saisie, setSaisie] = useState('')

	const liens = form.watch('web_links') ?? []
	const plein = fields.length >= MAX_LIENS

	// Le type se DÉDUIT de l'adresse : une adresse YouTube est une vidéo, le
	// reste un lien. Plus de liste à ouvrir, et plus de vidéo « non YouTube »
	// que la règle refuserait.
	const kindDe = (url: string) => (estUrlYouTube(url) ? 'video' : 'link')

	const ajouter = (brut: string) => {
		const url = brut.trim()
		if (url === '' || plein) return
		append({ kind: kindDe(url), url, label: '' })
		setSaisie('')
	}

	return (
		<div className='grid gap-2'>
			{fields.map((field, index) => {
				const video = liens[index]?.kind === 'video'

				return (
					<div
						key={field.id}
						className='grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto]'
					>
						<FormField
							control={form.control}
							name={`web_links.${index}.url`}
							render={({ field: champ }) => (
								<FormItem>
									<FormControl>
										<div className='relative'>
											{video ? (
												<Youtube
													className='absolute top-3 left-2.5 size-4 text-red-600'
													aria-hidden='true'
												/>
											) : (
												<Link2
													className='absolute top-3 left-2.5 size-4 text-muted-foreground/60'
													aria-hidden='true'
												/>
											)}
											<Input
												{...champ}
												type='url'
												inputMode='url'
												placeholder='https://…'
												className='pl-9'
												onChange={(event) => {
													champ.onChange(event)
													form.setValue(
														`web_links.${index}.kind`,
														kindDe(event.target.value),
														{ shouldDirty: true },
													)
												}}
											/>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name={`web_links.${index}.label`}
							render={({ field: champ }) => (
								<FormItem>
									<FormControl>
										<Input {...champ} placeholder='Libellé (facultatif)' />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<Button
							type='button'
							variant='ghost'
							size='icon'
							onClick={() => remove(index)}
							aria-label='Retirer ce lien'
							className='text-muted-foreground hover:text-destructive'
						>
							<Trash2 className='size-4' />
						</Button>
					</div>
				)
			})}

			{/* UN SEUL champ d'ajout : on colle l'adresse, Entrée (ou le collage
			    lui-même) crée la ligne. Aucun type à choisir, aucune ligne vide à
			    remplir après coup. */}
			<div className='flex items-center gap-2'>
				<div className='relative min-w-0 flex-1'>
					<Plus
						className='absolute top-3 left-2.5 size-4 text-muted-foreground/60'
						aria-hidden='true'
					/>
					<Input
						value={saisie}
						disabled={plein}
						inputMode='url'
						placeholder='Coller un lien ou une vidéo YouTube'
						aria-label='Ajouter un lien ou une vidéo'
						className='pl-9'
						onChange={(event) => setSaisie(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== 'Enter') return
							// Entrée ne doit pas envoyer le formulaire de la fiche.
							event.preventDefault()
							ajouter(saisie)
						}}
						onPaste={(event) => {
							const texte = event.clipboardData.getData('text').trim()
							if (/^https?:\/\/\S+$/i.test(texte)) {
								event.preventDefault()
								ajouter(texte)
							}
						}}
						onBlur={() => ajouter(saisie)}
					/>
				</div>
			</div>
			{plein && (
				<span className='text-muted-foreground text-xs'>
					{MAX_LIENS} liens au maximum.
				</span>
			)}
		</div>
	)
}
