// frontend/components/layout/help-content.ts
//
// CONTENU DU PANNEAU « AIDE » (en-tête, à droite). Des données, pas du JSX :
// pour étoffer l'aide, ajouter une entrée ici. Rien n'y est décrit qui n'existe
// dans le code — chaque section dit quoi, et où cliquer.
//
// Pour l'instant, seulement les nouveautés récentes de l'interface.

export interface RubriqueAide {
	id: string
	titre: string
	/** Une phrase : ce que c'est. */
	resume: string
	/** Nom d'un fichier de `frontend/assets/aide/` (ex. `raccourcis.png`).
	 *  Absent ou introuvable : la rubrique s'affiche sans capture. */
	capture?: string
	/** Où cliquer, étape par étape. */
	ouCliquer: string[]
	/** Précisions courtes (règles, limites). */
	details?: string[]
}

export interface SectionAide {
	id: string
	titre: string
	rubriques: RubriqueAide[]
	/** Section annoncée mais encore vide. */
	aVenir?: boolean
}

export const SECTIONS_AIDE: SectionAide[] = [
	{
		id: 'nouveautes',
		titre: 'Nouveautés de l’interface',
		rubriques: [
			{
				id: 'themes',
				capture: 'themes.jpg',
				titre: 'Thèmes d’affichage',
				resume:
					'L’écran était jugé trop clair : un menu de thèmes permet de choisir Clair, Sombre ou l’un des trois thèmes contrastés.',
				ouCliquer: [
					'En haut à droite de l’en-tête, cliquer sur l’icône de contraste.',
					'Choisir le thème dans le menu.',
				],
			},
			{
				id: 'raccourcis',
				capture: 'raccourcis.jpg',
				titre: 'Raccourcis « Caisse » et « Créer »',
				resume:
					'Au milieu de la barre du haut, deux boutons ouvrent directement la caisse ou une création, depuis n’importe quel écran.',
				ouCliquer: [
					'« Caisse » : ouvre le terminal de vente.',
					'« + Créer » : menu avec Bon de commande, Facture, Devis, Client et Produit.',
					'Chaque entrée affiche le module concerné ; l’icône prend la couleur de ce module (bleu PocketConnect, orange PocketStock).',
				],
				details: [
					'Le bouton « Caisse » suit la couleur du thème choisi.',
					'Sur petit écran, seules les icônes s’affichent ; sur mobile, ils sont remplacés par la barre du bas.',
				],
			},
			{
				id: 'stock-alert',
				capture: 'stock-alert.jpg',
				titre: 'Bouton « Stock alert »',
				resume:
					'Un triangle d’alerte dans l’en-tête signale les produits arrivés au seuil de stock minimum.',
				ouCliquer: [
					'En haut à droite, cliquer sur le triangle d’alerte : le badge indique le nombre de produits concernés.',
					'La liste montre les plus bas (stock / stock minimum) ; cliquer une ligne ouvre la fiche du produit.',
					'« Ouvrir le catalogue » en bas du menu renvoie à la liste complète.',
				],
			},
			{
				id: 'stock-minimum',
				capture: 'stock-minimum.jpg',
				titre: 'Stock minimum',
				resume:
					'Chaque produit peut avoir un seuil ; c’est lui qui alimente le bouton « Stock alert ».',
				ouCliquer: [
					'Fiche produit : carte « Stock », champ « Stock minimum ».',
					'Création rapide d’un produit : champ « Stock minimum ».',
				],
				details: [
					'0 veut dire « pas d’alerte ».',
					'Les services sont exclus : ils n’ont pas de stock.',
				],
			},
			{
				id: 'filtre-alerte',
				capture: 'filtre-alerte.jpg',
				titre: 'Filtre « Alerte stock » du catalogue',
				resume:
					'Le catalogue peut n’afficher que les produits au seuil, et la pastille de stock signale l’alerte.',
				ouCliquer: [
					'Stock > Produits, panneau des filtres : « Alerte stock ».',
				],
				details: [
					'Le badge de stock est entouré d’orange en alerte, rouge quand le stock est à 0.',
				],
			},
			{
				id: 'creer-produit-document',
				capture: 'creer-produit-document.jpg',
				titre: 'Créer un produit depuis un document',
				resume:
					'Dans un bon de commande, une facture ou un devis, on peut créer un produit sans quitter le document.',
				ouCliquer: [
					'Dans le sélecteur de produit du document, ouvrir la modale « Créer un produit ».',
					'Valider avec « Créer et ajouter » : le produit est créé puis ajouté à la ligne.',
				],
				details: [
					'Le produit est créé en brouillon (il n’est pas en ligne sur le site).',
					'La modale propose aussi le champ « Stock minimum ».',
				],
			},
			{
				id: 'assistant-catalogue',
				capture: 'assistant-catalogue.jpg',
				titre: 'Assistant du catalogue',
				resume:
					'Un champ « Demander » au-dessus de la liste des produits : on écrit une demande, l’assistant règle les filtres de l’écran ou compte.',
				ouCliquer: [
					'Stock > Produits : champ avec l’icône étincelle, au-dessus de la liste.',
					'Exemples : « les guitares classiques Prodipe entre 0 et 500 € », « combien de Yamaha ? ».',
					'« Annuler » rend les filtres d’avant la demande.',
				],
				details: [
					'Il ne fait que régler les filtres existants (recherche, publication, marque, catégorie, état, tarif, manques, prix, tri) : il ne modifie rien.',
					'Le nombre affiché est compté par la liste elle-même, jamais dit par l’IA.',
					'Si plusieurs marques ou catégories correspondent, il pose une question avec des boutons à cliquer, sans choisir à votre place.',
					'Seule la demande (500 caractères) et les réglages précédents partent vers l’IA : ni produits, ni prix, ni stock.',
					'La conversation n’est pas conservée : quitter l’écran l’efface.',
				],
			},
			{
				id: 'fiche-compacte',
				capture: 'fiche-compacte.jpg',
				titre: 'Fiche produit plus compacte',
				resume:
					'La fiche produit a été resserrée pour montrer davantage d’informations sans défiler.',
				ouCliquer: ['Stock > Produits, ouvrir un produit.'],
			},
		],
	},
	{
		id: 'a-venir',
		titre: 'À venir',
		aVenir: true,
		rubriques: [],
	},
]
