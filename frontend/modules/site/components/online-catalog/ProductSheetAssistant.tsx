import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
	AlignLeft,
	Bot,
	Check,
	ExternalLink,
	FileText,
	Globe2,
	Loader2,
	Paperclip,
	Send,
	Sparkles,
	TableProperties,
	Trash2,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import {
	type ProductSheetFile,
	useGenerateProductSheet,
} from '../../hooks/use-ai-product-title'

const MAX_FILES = 3
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 5 * 1024 * 1024
const SOURCE_TEXT_MAX = 12000
const INSTRUCTIONS_MAX = 600

const ACCEPTED_MIME_TYPES = new Set([
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
])

type SourceMode = 'documents' | 'web'
type DescriptionFormat = 'short' | 'detailed'

type AssistantProduct = {
	id: string
	name: string
	designation?: string
	sku?: string
	brand?: string
	categories?: string[]
}

type Props = {
	product: AssistantProduct
	currentName: string
	currentDescription: string
	disabled?: boolean
	onApply: (description: string) => void
	onPendingChange: (pending: boolean) => void
}

function fileMIMEType(file: File): string {
	if (file.type) return file.type.toLowerCase()
	const extension = file.name.split('.').pop()?.toLowerCase()
	if (extension === 'pdf') return 'application/pdf'
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
	if (extension === 'png') return 'image/png'
	if (extension === 'webp') return 'image/webp'
	return ''
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () =>
			reject(new Error(`Lecture de ${file.name} impossible.`))
		reader.onload = () => {
			const result = String(reader.result ?? '')
			const comma = result.indexOf(',')
			if (comma < 0) {
				reject(new Error(`Contenu de ${file.name} invalide.`))
				return
			}
			resolve(result.slice(comma + 1))
		}
		reader.readAsDataURL(file)
	})
}

function descriptionPreview(value: string): string {
	const document = new DOMParser().parseFromString(value, 'text/html')
	for (const row of document.body.querySelectorAll('tr')) {
		const cells = [...row.querySelectorAll('th, td')]
		row.textContent = cells.map((cell) => cell.textContent?.trim()).join(' : ')
	}
	for (const item of document.body.querySelectorAll('li')) {
		item.prepend('• ')
	}
	for (const element of document.body.querySelectorAll('h2, p, li, tr')) {
		element.append('\n')
	}
	return (document.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

export function ProductSheetAssistant({
	product,
	currentName,
	currentDescription,
	disabled,
	onApply,
	onPendingChange,
}: Props) {
	const generate = useGenerateProductSheet()
	const fileInput = useRef<HTMLInputElement>(null)
	const [mode, setMode] = useState<SourceMode>('documents')
	const [descriptionFormat, setDescriptionFormat] =
		useState<DescriptionFormat | null>(null)
	const [instructions, setInstructions] = useState('')
	const [sourceText, setSourceText] = useState('')
	const [files, setFiles] = useState<
		Array<ProductSheetFile & { size: number }>
	>([])
	const [applied, setApplied] = useState(false)

	const addFiles = async (selected: FileList | null) => {
		if (!selected?.length) return
		const candidates = [...selected]
		if (files.length + candidates.length > MAX_FILES) {
			toast.error(`Tu peux joindre au maximum ${MAX_FILES} fichiers.`)
			return
		}
		const nextTotal =
			files.reduce((sum, file) => sum + file.size, 0) +
			candidates.reduce((sum, file) => sum + file.size, 0)
		if (nextTotal > MAX_TOTAL_BYTES) {
			toast.error('Les pièces jointes ne doivent pas dépasser 5 Mo au total.')
			return
		}
		for (const file of candidates) {
			const mimeType = fileMIMEType(file)
			if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
				toast.error(
					`${file.name} : utilise une image JPG, PNG, WebP ou un PDF.`,
				)
				return
			}
			if (file.size === 0 || file.size > MAX_FILE_BYTES) {
				toast.error(`${file.name} doit peser moins de 2 Mo.`)
				return
			}
		}

		try {
			const encoded = await Promise.all(
				candidates.map(async (file) => ({
					name: file.name,
					mimeType: fileMIMEType(file),
					data: await fileToBase64(file),
					size: file.size,
				})),
			)
			setFiles((current) => [...current, ...encoded])
		} catch (cause) {
			toast.error(
				cause instanceof Error
					? cause.message
					: 'Lecture du fichier impossible.',
			)
		} finally {
			if (fileInput.current) fileInput.current.value = ''
		}
	}

	const askAssistant = () => {
		if (!descriptionFormat) {
			toast.error('Choisis une description courte ou une fiche détaillée.')
			return
		}
		setApplied(false)
		onPendingChange(true)
		generate.mutate(
			{
				name: currentName,
				designation: product.designation,
				sku: product.sku,
				brand: product.brand,
				categories: product.categories,
				currentDescription,
				descriptionFormat,
				instructions: instructions.trim() || undefined,
				sourceText:
					mode === 'documents' ? sourceText.trim() || undefined : undefined,
				files:
					mode === 'documents'
						? files.map(({ name, mimeType, data }) => ({
								name,
								mimeType,
								data,
							}))
						: undefined,
				webSearch: mode === 'web',
			},
			{
				onSettled: () => onPendingChange(false),
			},
		)
	}

	const result = generate.data
	const searchTerms = [
		product.brand,
		product.designation,
		currentName,
		product.sku,
		product.categories?.[0],
	]
		.filter((value): value is string => Boolean(value?.trim()))
		.filter(
			(value, index, values) =>
				values.findIndex(
					(candidate) => candidate.toLowerCase() === value.toLowerCase(),
				) === index,
		)

	return (
		<section className='flex min-h-0 flex-col overflow-hidden rounded-xl border bg-muted/20'>
			<div className='flex items-start gap-3 border-b bg-background/80 p-4'>
				<div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
					<Bot className='h-5 w-5' />
				</div>
				<div className='min-w-0'>
					<div className='flex items-center gap-2'>
						<h3 className='font-semibold'>Assistant fiche produit</h3>
						<Badge variant='secondary' className='font-normal'>
							{mode === 'web'
								? 'Gemini 2.5 Flash-Lite'
								: 'Gemini 3.1 Flash-Lite'}
						</Badge>
					</div>
					<p className='mt-1 text-muted-foreground text-xs'>
						Choisis une source. La proposition reste un brouillon tant que tu ne
						l’appliques pas.
					</p>
				</div>
			</div>

			<div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-4'>
				<div className='max-w-[92%] rounded-2xl rounded-tl-sm border bg-background px-4 py-3 text-sm shadow-sm'>
					Je peux créer la description depuis tes documents, ou rechercher le
					produit sur le Web si tu n’as rien sous la main.
				</div>

				<div className='space-y-1.5'>
					<Label>Longueur de la description</Label>
					<div className='grid grid-cols-2 gap-2'>
						<Button
							type='button'
							variant={descriptionFormat === 'short' ? 'default' : 'outline'}
							className='h-auto justify-start whitespace-normal px-3 py-2.5 text-left'
							onClick={() => setDescriptionFormat('short')}
							disabled={generate.isPending}
						>
							<AlignLeft className='mt-0.5 self-start' />
							<span>
								<span className='block font-semibold'>Description courte</span>
								<span className='block text-xs opacity-80'>
									2–3 phrases, sans tableau
								</span>
							</span>
						</Button>
						<Button
							type='button'
							variant={descriptionFormat === 'detailed' ? 'default' : 'outline'}
							className='h-auto justify-start whitespace-normal px-3 py-2.5 text-left'
							onClick={() => setDescriptionFormat('detailed')}
							disabled={generate.isPending}
						>
							<TableProperties className='mt-0.5 self-start' />
							<span>
								<span className='block font-semibold'>Fiche détaillée</span>
								<span className='block text-xs opacity-80'>
									Points forts, tableau et conseils
								</span>
							</span>
						</Button>
					</div>
					{!descriptionFormat && (
						<p className='text-amber-600 text-xs'>
							Choisis un format pour continuer.
						</p>
					)}
				</div>

				<Tabs
					value={mode}
					onValueChange={(value) => setMode(value as SourceMode)}
				>
					<TabsList className='grid w-full grid-cols-2'>
						<TabsTrigger value='documents' className='gap-2'>
							<FileText className='h-4 w-4' /> Mes sources
						</TabsTrigger>
						<TabsTrigger value='web' className='gap-2'>
							<Globe2 className='h-4 w-4' /> Recherche Web
						</TabsTrigger>
					</TabsList>

					<TabsContent value='documents' className='space-y-3'>
						<div className='space-y-1.5'>
							<Label htmlFor='assistant-source'>Texte à analyser</Label>
							<Textarea
								id='assistant-source'
								value={sourceText}
								onChange={(event) => setSourceText(event.target.value)}
								maxLength={SOURCE_TEXT_MAX}
								rows={4}
								placeholder='Colle ici la documentation, les caractéristiques ou un texte technique…'
							/>
						</div>
						<div className='flex flex-wrap items-center gap-2'>
							<input
								ref={fileInput}
								type='file'
								className='hidden'
								accept='.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
								multiple
								onChange={(event) => void addFiles(event.target.files)}
							/>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={() => fileInput.current?.click()}
								disabled={files.length >= MAX_FILES || generate.isPending}
							>
								<Paperclip /> Joindre une photo ou un PDF
							</Button>
							<span className='text-muted-foreground text-xs'>
								3 fichiers · 2 Mo chacun
							</span>
						</div>
						{files.length > 0 && (
							<div className='flex flex-wrap gap-2'>
								{files.map((file, index) => (
									<Badge
										key={`${file.name}-${index}`}
										variant='outline'
										className='gap-1 pr-1'
									>
										{file.name}
										<button
											type='button'
											className='rounded-full p-0.5 hover:bg-muted'
											onClick={() =>
												setFiles((current) =>
													current.filter((_, i) => i !== index),
												)
											}
											aria-label={`Retirer ${file.name}`}
										>
											<Trash2 className='h-3 w-3' />
										</button>
									</Badge>
								))}
							</div>
						)}
					</TabsContent>

					<TabsContent value='web'>
						<div className='rounded-lg border border-sky-500/25 bg-sky-500/5 p-3'>
							<div className='flex items-center gap-2 font-medium text-sm'>
								<Globe2 className='h-4 w-4 text-sky-600' /> Recherche ciblée
							</div>
							<p className='mt-1 text-muted-foreground text-xs'>
								L’assistant commence avec les termes connus et évite une seconde
								recherche sauf si le produit est ambigu.
							</p>
							<div className='mt-2 flex flex-wrap gap-1.5'>
								{searchTerms.map((term) => (
									<Badge
										key={term}
										variant='outline'
										className='bg-background font-normal'
									>
										{term}
									</Badge>
								))}
							</div>
						</div>
					</TabsContent>
				</Tabs>

				<div className='space-y-1.5'>
					<Label htmlFor='assistant-instructions'>
						Demande à l’assistant (facultatif)
					</Label>
					<Input
						id='assistant-instructions'
						value={instructions}
						onChange={(event) => setInstructions(event.target.value)}
						maxLength={INSTRUCTIONS_MAX}
						placeholder='Ex. insiste sur la facilité de transport'
						onKeyDown={(event) => {
							if (
								event.key === 'Enter' &&
								!event.shiftKey &&
								!generate.isPending
							) {
								event.preventDefault()
								askAssistant()
							}
						}}
					/>
				</div>

				<Button
					type='button'
					className='w-full'
					onClick={askAssistant}
					disabled={disabled || generate.isPending || !descriptionFormat}
				>
					{generate.isPending ? (
						<>
							<Loader2 className='animate-spin' /> Analyse en cours…
						</>
					) : mode === 'web' ? (
						<>
							<Globe2 /> Rechercher et créer la fiche
						</>
					) : (
						<>
							<Send /> Créer la fiche
						</>
					)}
				</Button>

				{generate.isError && (
					<div className='rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm'>
						{generate.error.message}
					</div>
				)}

				{result && (
					<div className='ml-auto max-w-[96%] space-y-3 rounded-2xl rounded-tr-sm border border-primary/20 bg-primary/5 p-4'>
						<div className='flex items-center gap-2 text-primary text-xs font-medium'>
							<Sparkles className='h-4 w-4' /> Proposition prête
						</div>
						<div className='flex items-center gap-2'>
							<p className='font-semibold'>{currentName}</p>
							<Badge variant='outline'>Titre inchangé</Badge>
						</div>
						<div className='max-h-64 whitespace-pre-wrap overflow-y-auto rounded-md border bg-background p-3 text-sm leading-relaxed'>
							{descriptionPreview(result.description)}
						</div>

						{result.searchQueries.length > 0 && (
							<p className='text-muted-foreground text-xs'>
								Recherche : {result.searchQueries.join(' · ')}
							</p>
						)}
						{result.sources.length > 0 && (
							<div className='space-y-1.5'>
								<p className='text-xs font-medium'>Sources consultées</p>
								<div className='flex flex-wrap gap-1.5'>
									{result.sources.map((source) => (
										<a
											key={source.url}
											href={source.url}
											target='_blank'
											rel='noreferrer'
											className='inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted'
										>
											{source.title} <ExternalLink className='h-3 w-3' />
										</a>
									))}
								</div>
							</div>
						)}
						{result.searchEntryPointHtml && (
							<iframe
								title='Suggestions Google Search'
								className='h-12 w-full overflow-hidden rounded-md border-0 bg-background'
								sandbox='allow-popups allow-popups-to-escape-sandbox'
								srcDoc={result.searchEntryPointHtml}
							/>
						)}

						<Button
							type='button'
							size='sm'
							className='w-full'
							variant={applied ? 'secondary' : 'default'}
							onClick={() => {
								onApply(result.description)
								setApplied(true)
							}}
							disabled={applied}
						>
							{applied ? (
								<>
									<Check /> Proposition appliquée
								</>
							) : (
								<>
									<Sparkles /> Appliquer la description
								</>
							)}
						</Button>
					</div>
				)}
			</div>
		</section>
	)
}
