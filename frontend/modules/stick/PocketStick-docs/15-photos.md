# 15 — Mini-chat « Photos » : état

*5 octobre 2026. **Écrit et testé hors réseau** (`photos_routes_test.go`,
`photos.test.ts`, `tests/photos-test.php` du mini-SaaS ; `pnpm build:client`
passe). **Rien n'a été lancé** : ni l'interface, ni un appel réel à Gemini, ni
un appel réel à la banque d'images, et `photos.php` n'est pas encore déposé.*

Médias gagne un quatrième sous-onglet, « Photos » : le vendeur écrit « une
photo de forêt avec un lac gelé », l'assistant répond d'une phrase et de
quatre photos, il raffine (« plus sombre », « 4 autres »), il télécharge ou
range. Rien n'est posé sur l'affiche sans un clic.

## 1. Le trajet

```
PhotosChat.jsx ── lib/photos.ts ──► POST /api/ai/photos-chat      (Go, authentifiée)
                                        │  1. Gemini, un outil : chercher_photos
                                        │  2. POST photos.php  action=recherche   (mini-SaaS)
                                        │        └─► la banque d'images (l'adaptateur seul la connaît)
                                        │  3. Gemini : une phrase
                                        ◄── { texte, resultats ×4, recherche, suite }
« Afficher plus » ─────────────────► POST /api/ai/photos-suite     { requete, orientation, page }
                                        └─► POST photos.php  action=recherche   (SANS Gemini : gratuit)
vignette, Télécharger, Ajouter ───► POST /api/ai/photos-fichier   { ref }
                                        └─► POST photos.php  action=fichier ──► octets
```

| Ce qui sort du poste | Vers | Journalisé |
|---|---|---|
| La demande du vendeur (500 car. au plus), les 12 derniers tours, l'orientation et la taille de la page en mm | Gemini | non |
| Une requête courte en anglais (120 car. au plus), une orientation, une page | mini-SaaS, puis la banque | non |
| Une référence opaque | mini-SaaS | non |
| Les jetons de la discussion (`photos chat`) | `usage.php` | oui, c'est le décompte |

Ce qui entre : du JSON (quatre photos au plus) et des octets d'image. **Aucune
adresse du fournisseur n'arrive sur le poste.**

## 2. Le mini-SaaS **[LU, écrit ici]** (`I:\pocketApp_minisaas`)

| Fichier | Rôle |
|---|---|
| `api/photos.php` | point d'entrée : POST seul, `X-API-Key` en en-tête seul, deux actions |
| `api/photos-lib.php` | réglages, transport borné, **adaptateur du fournisseur**, références signées, cache, recherche, fichier |
| `tests/photos-test.php`, `tests/fake-photos.php` | 48 vérifications contre une fausse banque (`php -S`) |
| `.htaccess` | `photos-lib.php` interdit en accès direct |

- **Contrat interne** : `{ id, miniature, image, largeur, hauteur, couleur?,
  description? }`, quatre au plus, plus `page` et `suite`.
- **Références** : `miniature` et `image` sont `charge.signature` — l'adresse
  et une expiration (12 h), signées par un HMAC dérivé de la clé de la banque.
  `action=fichier` ne rapatrie que ce qu'une recherche a rendu, et vérifie
  encore l'hôte (`PHOTOS_HOTES_IMAGES`), en https, sans suivre de redirection.
- **Quota** : 12 résultats demandés par appel, 4 rendus ; les pages 1 à 3 du
  poste viennent du même appel. Cache de 15 minutes dans le dossier temporaire,
  fichiers nommés par empreinte. Un échec n'est pas mis en cache.
- **L'image rangée** : 2400 px au plus sur le grand côté, JPEG qualité 85
  (`PHOTOS_COTE_IMAGE`) — assez pour un A4, sans originaux de 20 Mio en
  IndexedDB. La miniature fait 400 px de large.
- **Codes** : `quota_atteint` (429), `fournisseur_en_echec` (502),
  `aucun_resultat` (404), `reference_invalide` (400), et les refus de forme
  (`requete_absente`, `requete_trop_longue`, `orientation_inconnue`,
  `page_inconnue`, `action_inconnue`).
- **Rien n'est décompté** par cette porte. Les échecs vont au journal du
  détourage sous `photos_<code>`, sans jamais la requête.
- **Adaptateur actuel : l'API d'Unsplash**, d'après `I:\PocketStick\server.js`
  (`/search/photos`, `Authorization: Client-ID`). Décision du propriétaire :
  ni attribution rendue, ni appel de déclaration de téléchargement.

## 3. Les routes Go **[LU, écrit ici]** (`backend/routes/photos_routes.go`)

- `posterPhotos` : les gardes de `relaisImage`, pour du JSON — clé présente,
  HTTPS seul, `User-Agent`, délai de 40 s, lecture bornée, codes connus sinon
  `fournisseur_en_echec`, un seul envoi. `relaisImage` n'est pas touché : il
  envoie du multipart et exige un PNG.
- **L'outil** : `chercher_photos(requete_en, orientation, page?)`.
  `rechercheDemandee` borne ce que Gemini propose : requête de 120 caractères
  au plus, orientation inventée ramenée à celle de la page, `libre` = sans
  filtre, page de 1 à 15.
- **La boucle** : trois appels à Gemini et deux recherches au plus par message.
  Après des photos trouvées, l'outil est fermé et Gemini ne fait que répondre.
  `aucun_resultat` est rendu à Gemini, qui peut réessayer une fois ; les autres
  échecs sortent avec leur code. Une phrase manquante n'efface pas des photos
  trouvées.
- **Le contenu de Gemini repart brut** au tour suivant (`json.RawMessage`).
- **« Afficher plus » est gratuit** (décision du propriétaire, après le premier
  essai réel : une demande coûte environ 3 centimes au tarif de `billing.php`).
  `traiterPhotosSuite` rend la page suivante de la dernière recherche sans
  appeler Gemini ni `usage.php` ; côté poste, `afficherPlus` ne prend pas
  `useEtatDetourage`. Raffiner (« plus sombre ») reste une demande, décomptée
  comme la première. « 4 autres » TAPÉ dans le champ passe par le chat, donc
  payant : le bouton est le chemin gratuit.
- **Les deux clés sont vérifiées avant tout appel**, et les jetons dépensés sont
  déclarés même quand la recherche échoue.
- Les types de `gemini_routes.go` ne sont pas modifiés.

## 4. L'éditeur **[LU, écrit ici]**

| Quoi | Où |
|---|---|
| Logique : orientation, conversation, envoi, octets, rangement, téléchargement | `lib/photos.ts` |
| Le chat et la grille de résultats | `templates/PhotosChat.jsx` |
| Quatrième sous-onglet ; « Photos gardées » sous le chat | `MediasPanel.jsx`, `UploadTemplate.jsx` (`origine="photo"`) |
| `ajouterPhoto`, origine `photo`, filtre par origine exacte | `services/presetImageService.js` |
| Tâche `photos` | `lib/detourage.ts` (`NomTache`) |
| `proportions` (cadre non carré) ; `entreeValide` (Entrée envoie) | `ui/Vignette.jsx`, `ui/ChampTexte.jsx` |

- **Orientation** (`orientationDeLaPage`) : carrée à 10 % près, sinon paysage
  ou portrait, depuis `canvasSize`. Elle part nommée, avec la taille en
  millimètres pour le contexte.
- **Cadres** : les proportions de la page, bornées entre 0,6 et 2. La photo y
  est recadrée à l'affichage ; l'image rangée est la photo entière.
- **Une requête d'IA à la fois** : le chat prend `useEtatDetourage` (tâche
  `photos`, sans étape, donc sans jauge) et se refuse pendant une autre tâche.
  Les miniatures et les fichiers ne sont pas des requêtes d'IA.
- **Un échec est un message de l'assistant**, pas une alerte ; « Réessayer »
  n'est proposé que pour une panne passagère.
- **Photos gardées** : leur propre liste. Décidé contre l'affichage dans « Mes
  images », qui est ce que le vendeur a importé lui-même.
- **Conversation** : `useConversationPhotos`, en mémoire. Elle survit à un
  changement d'onglet, pas à un rechargement.

## 5. À déposer à la main

Aucun SQL. Dans cet ordre :

1. Dans `pocketapp-secrets.php` : `define('UNSPLASH_ACCESS_KEY', '…');`
2. `api/photos-lib.php`
3. `api/photos.php`
4. `.htaccess` (un bloc `<Files "photos-lib.php">` de plus)

Vérification : `https://pocketapp.5sensprod.com/api/photos-lib.php` doit
répondre 403, et un GET sur `photos.php` un 405 `methode_refusee`.

## 6. Ce qui n'a pas pu être vérifié

- **L'interface n'a pas été vue.** En particulier : quatre onglets dans 311 px
  (« PocketStock » et « Génération » sont longs), la hauteur du chat au-dessus
  de « Photos gardées », deux boutons sous une vignette de 151 px, le sombre.
- **Aucun appel réel à Gemini.** Trois inconnues : `gemini-3.1-flash-lite`
  accepte-t-il `thinkingLevel: minimal` AVEC un outil ; exige-t-il la signature
  de pensée (le contenu est renvoyé brut dans les deux cas) ; accepte-t-il
  `mode: NONE` au second tour avec un `functionResponse` dans l'historique. Un
  refus donnera `gemini_en_echec`.
- **Aucun appel réel à la banque d'images.** Le contrat vient de
  `I:\PocketStick\server.js`, pas d'une réponse relue aujourd'hui. À confirmer :
  la forme du refus de quota (403 « Rate Limit Exceeded » supposé), le plafond
  réel de la clé (50 par heure supposé pour une clé de démonstration), et que
  `urls.raw` accepte bien `w`, `h`, `fit`, `q`, `fm`.
- **`sys_get_temp_dir()` sur le mutualisé** : inscriptible ? Sinon le cache ne
  s'écrit pas — chaque recherche coûte un appel, rien d'autre ne casse.
  `PHOTOS_CACHE_DIR` le déplace.
- **« Télécharger » sous Wails** : un lien `download`, comme les PDF du dépôt.
  Non essayé avec une image.
- **`fabriquerVignette`** n'a pas de canvas sous Node : la vignette d'une photo
  gardée n'est testée que par le chemin de rattrapage existant.
