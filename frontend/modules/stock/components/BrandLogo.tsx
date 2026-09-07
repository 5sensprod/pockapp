import { cn } from '@/lib/utils'
import { Building2 } from 'lucide-react'
import { useState } from 'react'

// Extrait de `ProductCategoryFilterTree` le 7 septembre 2026, quand les marques
// distribuées ont pris la forme de pastilles dans `SupplierDialog` aussi : deux
// vignettes de marque ayant le même repli, la même gestion d'image cassée et
// les deux mêmes tailles n'ont pas à exister en double.
//
// `url` est une URL DÉJÀ COMPOSÉE, pas un nom de fichier : `image` est un nom
// dans PocketBase, seul `pb.files.getUrl` sait en faire une adresse. La
// composition reste chez l'appelant, qui a le `pb` sous la main.

interface BrandLogoProps {
	name: string
	url: string | null
	/** `row` : la vignette d'une ligne de liste. `tag` : celle d'une pastille. */
	size?: 'row' | 'tag'
	/**
	 * Le fond derrière la vignette. `muted` s'accorde aux surfaces claires de
	 * l'application ; `contrast` est fait pour une pastille pleine — `bg-primary`
	 * —, où le carré `bg-muted` faisait une tache pâle et où un logo sombre sur
	 * fond transparent devenait illisible. Les logos du catalogue sont des
	 * visuels de marque, dessinés pour du blanc : on leur donne du blanc, dans
	 * les deux thèmes.
	 */
	tone?: 'muted' | 'contrast'
}

export function BrandLogo({
	name,
	url,
	size = 'row',
	tone = 'muted',
}: BrandLogoProps) {
	const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
	const compact = size === 'tag'

	return (
		<div
			className={cn(
				'flex shrink-0 items-center justify-center overflow-hidden rounded',
				tone === 'contrast' ? 'bg-white ring-1 ring-black/5' : 'bg-muted',
				compact ? 'h-4 w-4' : 'h-7 w-7',
			)}
		>
			{url && brokenUrl !== url ? (
				<img
					src={url}
					alt={`Logo ${name}`}
					loading='lazy'
					decoding='async'
					className='h-full w-full object-contain'
					onError={() => setBrokenUrl(url)}
				/>
			) : (
				<Building2
					className={cn(
						tone === 'contrast' ? 'text-neutral-400' : 'text-muted-foreground',
						compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5',
					)}
				/>
			)}
		</div>
	)
}
