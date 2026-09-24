// frontend/modules/stock/components/pdf/SuppliersDirectoryPDF.tsx
// ═══════════════════════════════════════════════════════════════════════════
// LE PDF « FOURNISSEURS ET MARQUES » — UN REPÈRE POUR LE VENDEUR
// ═══════════════════════════════════════════════════════════════════════════
// Fabriqué sur le poste par `@react-pdf/renderer`, comme le rapport Z et le
// rapport de stock : aucune route Go ne produit de PDF hors du ticket.
//
// Trois parties, dans l'ordre où on s'en sert :
//   1. l'INDEX DES MARQUES, de A à Z — la marque est l'entrée, le fournisseur la
//      réponse. C'est la page qu'on consulte au comptoir ;
//   2. les FOURNISSEURS, avec leurs coordonnées et toutes leurs marques ;
//   3. les marques SANS fournisseur — un trou à combler, pas à apprendre.
//
// Ce composant ne calcule rien : tout vient de `construireRepertoire`
// (`../../lib/suppliers-directory.ts`), qui écarte aussi les coordonnées
// bancaires. Le document est fait pour circuler.
//
// ⚠️ Helvetica, la police standard de `@react-pdf/renderer`, ne couvre que le
// latin de base : pas de flèche, pas de puce fantaisie. Les libellés ci-dessous
// n'utilisent que des tirets et des virgules.

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { RepertoireFournisseurs } from '../../lib/suppliers-directory'

const styles = StyleSheet.create({
	page: {
		paddingTop: 36,
		paddingBottom: 44,
		paddingHorizontal: 36,
		fontSize: 9,
		fontFamily: 'Helvetica',
		color: '#111',
	},
	entete: {
		borderBottom: '2pt solid #111',
		paddingBottom: 8,
		marginBottom: 14,
	},
	titre: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
	sousTitre: { fontSize: 8, color: '#555', marginTop: 4 },
	consigne: {
		fontSize: 8,
		color: '#333',
		backgroundColor: '#f3f3f3',
		padding: 6,
		marginBottom: 12,
	},
	titreSection: {
		fontSize: 12,
		fontFamily: 'Helvetica-Bold',
		marginBottom: 6,
		paddingBottom: 3,
		borderBottom: '1pt solid #999',
	},
	lettre: {
		fontSize: 10,
		fontFamily: 'Helvetica-Bold',
		backgroundColor: '#111',
		color: '#fff',
		paddingVertical: 2,
		paddingHorizontal: 6,
		marginTop: 8,
		marginBottom: 2,
	},
	ligne: {
		flexDirection: 'row',
		paddingVertical: 2.5,
		borderBottom: '0.5pt solid #ddd',
	},
	colMarque: { width: '42%', fontFamily: 'Helvetica-Bold', paddingRight: 8 },
	colFournisseurs: { width: '58%' },
	fournisseur: {
		marginBottom: 9,
		paddingBottom: 6,
		borderBottom: '0.5pt solid #ccc',
	},
	nomFournisseur: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
	code: { fontSize: 8, color: '#555', fontFamily: 'Helvetica' },
	contact: { fontSize: 8.5, color: '#333', marginTop: 2 },
	marques: { fontSize: 8.5, marginTop: 3, lineHeight: 1.35 },
	libelleMarques: { fontFamily: 'Helvetica-Bold' },
	vide: { fontSize: 8.5, color: '#777', marginTop: 2 },
	sansFournisseur: { fontSize: 8.5, lineHeight: 1.4 },
	pied: {
		position: 'absolute',
		bottom: 20,
		left: 36,
		right: 36,
		fontSize: 7.5,
		color: '#777',
		textAlign: 'center',
	},
})

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

export function SuppliersDirectoryPDF({
	repertoire,
	genereLe = new Date(),
	entreprise,
}: {
	repertoire: RepertoireFournisseurs
	genereLe?: Date
	/** Le nom de l'entreprise, en sous-titre. Facultatif. */
	entreprise?: string
}) {
	const { fournisseurs, index, marquesSansFournisseur, totaux } = repertoire
	const date = genereLe.toLocaleDateString('fr-FR')

	return (
		<Document title='Fournisseurs et marques' author={entreprise}>
			<Page size='A4' style={styles.page}>
				<View style={styles.entete}>
					<Text style={styles.titre}>Fournisseurs et marques</Text>
					<Text style={styles.sousTitre}>
						{[
							entreprise,
							`Édité le ${date}`,
							pluriel(totaux.fournisseurs, 'fournisseur'),
							`${pluriel(totaux.marquesRattachees, 'marque')} rattachée${
								totaux.marquesRattachees > 1 ? 's' : ''
							} sur ${totaux.marques}`,
						]
							.filter(Boolean)
							.join('  -  ')}
					</Text>
				</View>

				<Text style={styles.consigne}>
					Pour savoir chez qui commander : cherchez la marque dans l&apos;index
					ci-dessous, le fournisseur est en face. Une marque peut avoir
					plusieurs fournisseurs, ils sont alors tous cités.
				</Text>

				{/* ── 1. L'index des marques ─────────────────────────────── */}
				<Text style={styles.titreSection}>Index des marques, de A à Z</Text>
				{index.length === 0 ? (
					<Text style={styles.vide}>
						Aucune marque n&apos;est encore rattachée à un fournisseur.
					</Text>
				) : (
					index.map((groupe) => (
						// Le groupe NE PEUT PAS être insécable : une lettre très fournie
						// dépasserait la page. On garde seulement l'initiale avec ses
						// premières lignes (`minPresenceAhead`), pour qu'elle ne finisse pas
						// seule en bas de page.
						<View key={groupe.lettre}>
							<Text style={styles.lettre} minPresenceAhead={40}>
								{groupe.lettre}
							</Text>
							{groupe.entrees.map((entree) => (
								<View key={entree.marque} style={styles.ligne} wrap={false}>
									<Text style={styles.colMarque}>{entree.marque}</Text>
									<Text style={styles.colFournisseurs}>
										{entree.fournisseurs.join(', ')}
									</Text>
								</View>
							))}
						</View>
					))
				)}

				<Text
					style={styles.pied}
					render={({ pageNumber, totalPages }) =>
						`Fournisseurs et marques - édité le ${date} - page ${pageNumber} sur ${totalPages}`
					}
					fixed
				/>
			</Page>

			{/* ── 2. Les fournisseurs ────────────────────────────────────── */}
			<Page size='A4' style={styles.page}>
				<Text style={styles.titreSection}>Les fournisseurs</Text>
				{fournisseurs.length === 0 ? (
					<Text style={styles.vide}>Aucun fournisseur.</Text>
				) : (
					fournisseurs.map((fournisseur) => {
						const coordonnees = [
							fournisseur.contact,
							fournisseur.telephone,
							fournisseur.email,
						].filter(Boolean)
						return (
							<View
								key={fournisseur.id}
								style={styles.fournisseur}
								wrap={false}
							>
								<Text style={styles.nomFournisseur}>
									{fournisseur.nom}
									{fournisseur.code ? (
										<Text
											style={styles.code}
										>{`   (${fournisseur.code})`}</Text>
									) : null}
								</Text>
								{coordonnees.length > 0 && (
									<Text style={styles.contact}>
										{coordonnees.join('  -  ')}
									</Text>
								)}
								{fournisseur.marques.length > 0 ? (
									<Text style={styles.marques}>
										<Text style={styles.libelleMarques}>
											{`${pluriel(fournisseur.marques.length, 'marque')} : `}
										</Text>
										{fournisseur.marques.join(', ')}
									</Text>
								) : (
									<Text style={styles.vide}>Aucune marque rattachée.</Text>
								)}
							</View>
						)
					})
				)}

				{/* ── 3. Les marques sans fournisseur ───────────────────────── */}
				{marquesSansFournisseur.length > 0 && (
					<View style={{ marginTop: 10 }}>
						<Text style={styles.titreSection}>
							{`Marques sans fournisseur (${marquesSansFournisseur.length})`}
						</Text>
						<Text style={styles.sansFournisseur}>
							{marquesSansFournisseur.join(', ')}
						</Text>
					</View>
				)}

				<Text
					style={styles.pied}
					render={({ pageNumber, totalPages }) =>
						`Fournisseurs et marques - édité le ${date} - page ${pageNumber} sur ${totalPages}`
					}
					fixed
				/>
			</Page>
		</Document>
	)
}
