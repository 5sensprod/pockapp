import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const htmlContentStyles =
	'max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:mb-3 [&_h1]:font-bold [&_h1]:text-2xl [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:font-semibold [&_h2]:text-xl [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-lg [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6'

/**
 * Le catalogue publie ses descriptions comme HTML. La chaîne d'origine reste
 * intacte tant que l'utilisateur ne l'édite pas, mais son rendu dans PocketApp
 * neutralise le code exécutable et les chargements réseau automatiques.
 */
function renderableHtml(value: string) {
	const document = new DOMParser().parseFromString(value, 'text/html')
	for (const element of document.querySelectorAll(
		'script, style, iframe, object, embed, svg, math, form, input, button, textarea, select, link, meta, base, video, audio, source, picture, img',
	)) {
		element.remove()
	}

	for (const element of document.body.querySelectorAll('*')) {
		for (const attribute of [...element.attributes]) {
			const name = attribute.name.toLowerCase()
			const unsafeLink =
				name === 'href' &&
				!(
					/^(https?:|mailto:|tel:|\/|#)/i.test(attribute.value.trim()) ||
					attribute.value.trim() === ''
				)
			if (
				name.startsWith('on') ||
				name === 'src' ||
				name === 'srcset' ||
				name === 'srcdoc' ||
				name === 'formaction' ||
				unsafeLink
			) {
				element.removeAttribute(attribute.name)
			}
		}

		// Les classes WordPress descriptives restent utiles ; les classes
		// utilitaires arbitraires ne doivent pas pouvoir sortir du cadre du champ.
		if (element.hasAttribute('class')) {
			const safeClasses = (element.getAttribute('class') ?? '')
				.split(/\s+/)
				.filter((className) => /^wc-[a-z0-9_-]+$/i.test(className))
			if (safeClasses.length)
				element.setAttribute('class', safeClasses.join(' '))
			else element.removeAttribute('class')
		}

		const style = element.getAttribute('style')
		if (
			style &&
			(/url\s*\(|expression\s*\(|@import|position\s*:|z-index\s*:/i.test(
				style,
			) ||
				/(^|;)\s*(top|right|bottom|left|inset)\s*:/i.test(style))
		) {
			element.removeAttribute('style')
		}
	}

	return document.body.innerHTML
}

export function HtmlContentPreview({
	value,
	className,
	collapsible = false,
	collapsedHeight = 240,
}: {
	value: string
	className?: string
	collapsible?: boolean
	collapsedHeight?: number
}) {
	const preview = useRef<HTMLDivElement>(null)
	const html = useMemo(() => renderableHtml(value), [value])
	const [expanded, setExpanded] = useState(false)
	const [overflowing, setOverflowing] = useState(false)

	useLayoutEffect(() => {
		if (!preview.current) return
		setExpanded(false)
		preview.current.innerHTML = html
		setOverflowing(preview.current.scrollHeight > collapsedHeight + 4)
	}, [html, collapsedHeight])

	return (
		<div>
			<div className='relative'>
				<div
					ref={preview}
					className={cn(
						htmlContentStyles,
						collapsible && !expanded && 'overflow-hidden',
						className,
					)}
					style={
						collapsible && !expanded
							? { maxHeight: collapsedHeight }
							: undefined
					}
				/>
				{collapsible && overflowing && !expanded && (
					<div className='pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent' />
				)}
			</div>
			{collapsible && overflowing && (
				<button
					type='button'
					className='mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 font-medium text-primary text-xs hover:bg-muted'
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? (
						<>
							<ChevronUp className='h-3.5 w-3.5' /> Réduire
						</>
					) : (
						<>
							<ChevronDown className='h-3.5 w-3.5' /> Lire la suite
						</>
					)}
				</button>
			)}
		</div>
	)
}

export function HtmlContentEditor({
	id,
	value,
	onChange,
	onBlur,
	maxLength,
	maxHeight,
	className,
	ariaLabel = 'Contenu HTML mis en forme',
	placeholder = 'Saisissez le texte visible sur le site…',
}: {
	id?: string
	value: string
	onChange: (value: string) => void
	onBlur?: () => void
	maxLength?: number
	maxHeight?: number
	className?: string
	ariaLabel?: string
	placeholder?: string
}) {
	const editor = useRef<HTMLDivElement>(null)
	const [empty, setEmpty] = useState(!value.trim())
	const html = useMemo(() => renderableHtml(value), [value])

	// `contentEditable` reste volontairement non contrôlé pendant la frappe :
	// réinjecter `innerHTML` à chaque caractère déplacerait le curseur. Une
	// proposition Gemini, un changement de fiche ou une annulation arrive hors
	// focus et peut en revanche remplacer proprement son contenu.
	useLayoutEffect(() => {
		if (!editor.current || document.activeElement === editor.current) return
		if (editor.current.innerHTML !== html) editor.current.innerHTML = html
		setEmpty(!editor.current.textContent?.trim())
	}, [html])

	return (
		<div className='relative'>
			{empty && (
				<span className='pointer-events-none absolute top-3 left-3 text-muted-foreground text-sm'>
					{placeholder}
				</span>
			)}
			<div
				id={id}
				ref={editor}
				contentEditable
				suppressContentEditableWarning
				role='textbox'
				tabIndex={0}
				aria-multiline='true'
				aria-label={ariaLabel}
				className={cn(
					htmlContentStyles,
					'min-h-52 overflow-y-auto rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
					className,
				)}
				style={maxHeight ? { maxHeight } : undefined}
				onInput={(event) => {
					const next = event.currentTarget.innerHTML
					if (maxLength && next.length > maxLength) {
						event.currentTarget.innerHTML = html
						setEmpty(!event.currentTarget.textContent?.trim())
						return
					}
					setEmpty(!event.currentTarget.textContent?.trim())
					onChange(next === '<br>' ? '' : next)
				}}
				onBlur={onBlur}
			/>
		</div>
	)
}
