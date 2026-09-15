// frontend/lib/format/date-utc.ts
// Affichage, à Paris, des horodatages de sauvegarde — qui sont en UTC.

/**
 * Formate en heure de Paris un horodatage rendu en UTC par le mini-SaaS.
 *
 * Les dates de la table des snapshots sont écrites en UTC explicite
 * (`UTC_TIMESTAMP()` côté serveur, `gmdate()` côté poste — docs/SAUVEGARDE.md
 * §7.3), mais ce sont des colonnes `DATETIME` : la valeur rendue ne porte
 * AUCUN indicateur de fuseau. Les afficher brutes montrait donc deux heures
 * de moins qu'à l'horloge du magasin, l'été.
 *
 * Le piège est de convertir naïvement : `new Date('2026-09-15 08:12:03')` est
 * interprété par le navigateur comme une heure LOCALE, ce qui décalerait la
 * date une seconde fois, dans l'autre sens. D'où le `Z` posé nous-mêmes quand
 * la chaîne n'annonce pas son fuseau.
 *
 * Le format exact rendu par `backup-admin.php` n'est pas lisible depuis ce
 * dépôt (le PHP de sauvegarde n'y est pas versionné) : on accepte donc les
 * deux écritures, et toute chaîne qui surprend est rendue telle quelle plutôt
 * que remplacée par « Invalid Date ».
 */
export function formatDateUTC(brut: string): string {
	if (!brut) return brut

	const aUnFuseau = /([Zz]|[+-]\d{2}:?\d{2})$/.test(brut)
	const normalise = aUnFuseau ? brut : `${brut.replace(' ', 'T')}Z`

	const date = new Date(normalise)
	if (Number.isNaN(date.getTime())) return brut

	return new Intl.DateTimeFormat('fr-FR', {
		timeZone: 'Europe/Paris',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date)
}
