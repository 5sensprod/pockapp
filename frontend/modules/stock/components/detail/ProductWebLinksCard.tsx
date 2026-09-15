import { GripVertical, Link2, Plus, Trash2, Youtube } from 'lucide-react'
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

import { NativeSelect } from './detail-primitives'
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
	const { fields, append, remove, move } = useFieldArray({
		control: form.control,
		name: 'web_links',
	})

	const liens = form.watch('web_links') ?? []
	const plein = fields.length >= MAX_LIENS

	return (
		<div className='grid gap-3'>
			{fields.length === 0 && (
				<p className='text-muted-foreground text-sm'>
					Aucun lien. Ajoutez la fiche du constructeur, une notice, un test ou
					une vidéo de démonstration : ils s'affichent sur la page du site.
				</p>
			)}

			{fields.map((field, index) => {
				const lien = liens[index]
				const video = lien?.kind === 'video'
				// Une vidéo dont l'adresse n'est pas YouTube ne s'intégrera pas :
				// l'icône passe en sourdine avant même la validation.
				const videoReconnue = video && estUrlYouTube(lien?.url ?? '')

				return (
					<div
						key={field.id}
						className='grid items-start gap-2 sm:grid-cols-[auto_130px_minmax(0,1fr)_minmax(0,200px)_auto]'
					>
						<div className='flex items-center gap-0.5 pt-2'>
							<GripVertical
								className='text-muted-foreground/40 size-4'
								aria-hidden='true'
							/>
							<div className='flex flex-col'>
								<button
									type='button'
									onClick={() => move(index, index - 1)}
									disabled={index === 0}
									className='text-muted-foreground hover:text-foreground px-1 text-[10px] leading-none disabled:opacity-30'
									aria-label='Monter ce lien'
								>
									▲
								</button>
								<button
									type='button'
									onClick={() => move(index, index + 1)}
									disabled={index === fields.length - 1}
									className='text-muted-foreground hover:text-foreground px-1 text-[10px] leading-none disabled:opacity-30'
									aria-label='Descendre ce lien'
								>
									▼
								</button>
							</div>
						</div>

						<FormField
							control={form.control}
							name={`web_links.${index}.kind`}
							render={({ field: champ }) => (
								<FormItem>
									<FormControl>
										<NativeSelect {...champ}>
											<option value='link'>Lien</option>
											<option value='video'>Vidéo</option>
										</NativeSelect>
									</FormControl>
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name={`web_links.${index}.url`}
							render={({ field: champ }) => (
								<FormItem>
									<FormControl>
										<div className='relative'>
											{video ? (
												<Youtube
													className={`absolute top-2.5 left-2 size-4 ${
														videoReconnue
															? 'text-red-600'
															: 'text-muted-foreground/40'
													}`}
													aria-hidden='true'
												/>
											) : (
												<Link2
													className='text-muted-foreground/60 absolute top-2.5 left-2 size-4'
													aria-hidden='true'
												/>
											)}
											<Input
												{...champ}
												type='url'
												inputMode='url'
												placeholder={
													video
														? 'https://www.youtube.com/watch?v=…'
														: 'https://…'
												}
												className='pl-8'
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

			<div className='flex items-center gap-2'>
				<Button
					type='button'
					variant='outline'
					size='sm'
					disabled={plein}
					onClick={() => append({ kind: 'link', url: '', label: '' })}
				>
					<Plus className='mr-1 size-4' />
					Lien
				</Button>
				<Button
					type='button'
					variant='outline'
					size='sm'
					disabled={plein}
					onClick={() => append({ kind: 'video', url: '', label: '' })}
				>
					<Youtube className='mr-1 size-4' />
					Vidéo YouTube
				</Button>
				{plein && (
					<span className='text-muted-foreground text-xs'>
						{MAX_LIENS} liens au maximum.
					</span>
				)}
			</div>
		</div>
	)
}
