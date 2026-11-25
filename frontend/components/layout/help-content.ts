// frontend/components/layout/help-content.ts
//
// CONTENU DU PANNEAU « AIDE » (en-tête, à droite). Des données, pas du JSX :
// pour étoffer l'aide, ajouter une entrée ici. Rien n'y est décrit qui n'existe
// dans le code — chaque section dit quoi, et où cliquer.
//
// Règle : toute logique modifiée ajoute ou met à jour une rubrique ici.
// Chaque phrase doit correspondre au code (le vérifier avant d'écrire) ; une
// capture n'est déclarée que si le fichier existe dans `frontend/assets/aide/`.
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
				details: [
					'Le menu de gauche, les tableaux et les pastilles (tags, statuts) suivent le thème choisi : fond légèrement teinté, survol et élément actif de la couleur du thème.',
					'Les contrastes de texte sont calculés pour rester lisibles dans les cinq thèmes.',
					'Les PDF et les tickets imprimés ne changent pas.',
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
			{
				id: 'mon-ca',
				titre: '« Mon CA » dans l’en-tête de la caisse',
				resume:
					'À côté du montant « Caisse », « Mon CA » affiche le chiffre d’affaires net de la session pour la personne connectée.',
				ouCliquer: [
					'Caisse : dans l’en-tête, lire « Mon CA » à côté de « Caisse ».',
				],
				details: [
					'C’est le CA net : les ventes du jour moins les avoirs, attribués à l’utilisateur connecté.',
					'Le calcul est fait par le serveur (rapport X), pas par l’écran.',
					'Il n’apparaît que si une session est ouverte.',
					'Si le serveur ne fournit pas le détail par utilisateur, c’est le CA net de toute la session qui s’affiche.',
				],
			},
			{
				id: 'par-vendeur',
				titre: 'Détail « Par vendeur »',
				resume:
					'Le rapport X et le Journal des ventes montrent ce que chaque vendeur a encaissé.',
				ouCliquer: [
					'Caisse > Rapport X : section « Par vendeur ».',
					'Journal des ventes : carte « Sur la période », bloc « Par vendeur » ; chaque document porte aussi le nom de son vendeur.',
				],
				details: [
					'Un document est attribué à celui qui l’a encaissé ; à défaut, à celui qui l’a émis.',
					'Un avoir est retranché de celui qui rembourse, pas du vendeur du ticket d’origine.',
					'Les anciens documents sans auteur sont rangés dans « Non attribué » : la somme des vendeurs égale toujours le total.',
				],
			},
			{
				id: 'cloture-journee',
				titre: 'Clôture de la journée réservée aux administrateurs et managers',
				resume:
					'Le bouton « Clôturer la journée » n’est actif que pour les rôles administrateur et manager.',
				ouCliquer: [
					'Caisse : bouton « Clôturer la journée » (grisé pour les autres rôles).',
				],
				details: [
					'La clôture ferme la session et émet le rapport Z pour toute la caisse, en un seul geste.',
					'Le serveur refuse aussi la clôture et l’émission du Z à tout autre rôle.',
					'Une journée clôturée ne se rouvre pas.',
					'Un autre poste voit la fermeture de la session dans les 30 secondes.',
					'Le comptage du tiroir est proposé à ce moment, mais reste facultatif.',
				],
			},
			{
				id: 'session-unique',
				titre: 'Une seule session ouverte par caisse',
				resume:
					'Tous les postes (application et navigateur) partagent la même session de caisse : elle ne peut plus être ouverte en double.',
				ouCliquer: [
					'Caisse : « Commencer la journée », ou simplement le premier encaissement du jour.',
				],
				details: [
					'Si deux postes encaissent au même instant en début de journée, une seule session est créée.',
					'La base l’interdit aussi par un index unique : deux sessions ouvertes sur la même caisse sont impossibles.',
					'Sans cela, la clôture refusait d’avancer tant qu’une autre session restait ouverte.',
				],
			},
			{
				id: 'caisses-admin',
				titre: 'Les caisses : administrateur seul, une seule active',
				resume:
					'Créer, modifier ou supprimer une caisse est réservé à l’administrateur, et le magasin n’a qu’une caisse active.',
				ouCliquer: [
					'Seul l’administrateur peut créer une caisse quand aucune n’est configurée.',
				],
				details: [
					'Une seconde caisse active est refusée.',
					'La seule caisse active ne peut pas être désactivée : plus aucun encaissement ne serait possible.',
					'Une caisse qui porte des sessions n’est jamais supprimée : les tickets et les rapports Z la désignent.',
				],
			},
			{
				id: 'adresse-reseau',
				titre: 'Adresse d’accès réseau (QR code)',
				resume:
					'Dans la barre du haut, le QR code et l’adresse IP permettent d’ouvrir l’application depuis un autre poste du réseau local.',
				ouCliquer: [
					'Barre du haut : cliquer sur le petit QR code pour l’agrandir et lire l’adresse.',
				],
				details: [
					'Seules les adresses de réseau local privées (10.x, 172.16 à 172.31, 192.168.x) sont annoncées.',
					'Les adaptateurs virtuels d’antivirus, de VPN et de machines virtuelles sont écartés.',
				],
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
