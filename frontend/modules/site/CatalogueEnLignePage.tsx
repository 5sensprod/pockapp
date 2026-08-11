// frontend/modules/site/CatalogueEnLignePage.tsx

/**
 * Vue « Catalogue en ligne » — ce qui est destiné au site.
 *
 * **Coquille vide, volontairement.** Première étape : poser la navigation.
 * La vue, les filtres et l'édition viennent ensuite ; l'édition seulement
 * après que la persistance des retouches éditoriales aura été tranchée —
 * le catalogue PocketBase est une projection rechargée par purge, et une
 * saisie faite ici ne survivrait pas au prochain `catalog-import -load`.
 */
export function CatalogueEnLignePage() {
	return (
		<div className='container mx-auto px-6 py-8'>
			<h1 className='font-bold text-3xl'>Catalogue en ligne</h1>
		</div>
	)
}
