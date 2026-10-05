# 10 — Détourage IA : état

*5 octobre 2026. **Branché** dans l'éditeur ; build (`pnpm build:client`) et tests
du module verts. **Jamais lancé dans l'application** : voir §8.*

Notation : **[LU]** = lu dans le code, chemin donné ; **[RAPPORTÉ]** = dit par le
propriétaire ou par le contrat du mini-SaaS, non mesuré ici.

Périmètre : le détourage seul. Ni text-to-image, ni image-to-image.

---

## 1. Le trajet

Le renderer n'appelle jamais le fournisseur d'images, et le poste n'en détient
**aucune clé**. Il envoie l'image à la route Go, qui la relaie au mini-SaaS ;
celui-ci détoure, décompte les crédits IA du client et renvoie un PNG.

| # | Étape | Où |
|---|---|---|
| 1 | Bouton « Détourer », 4ᵉ rangée du noyau d'une image (après l'opacité) | `templates/ReglagesImage.jsx`, atome `Detourer` **[LU]** |
| 2 | Source : une data URL est décodée sur place, une adresse de fichier PocketBase est téléchargée par le renderer | `lib/detourage.ts`, `sourceAEnvoyer` **[LU]** |
| 3 | Préparation : 4096 px au plus, JPEG 0,9 (WebP si la source est transparente), réduction par paliers de 15 % tant que le fichier dépasse `SEUIL_ENVOI_OCTETS` | `preparerImage` **[LU]** |
| 4 | `POST /api/ai/remove-background`, multipart, champ `image`, session PocketBase requise | `appelerDetourage` ; route : `backend/routes/detourage_routes.go` **[LU]** |
| 5 | Succès : `200 image/png`. Échec : JSON `{ error, code }` | route, `erreursDetourage` **[LU]** |
| 6 | **Rangement** du PNG dans la bibliothèque du poste (« Génération »), AVANT de toucher à l'élément | `presetImageService.ajouterGeneree` **[LU]** |
| 7 | **Pose** sur l'élément, en un pas d'historique, si l'élément est encore tel qu'au lancement | `lancerDetourage` **[LU]** |

Le contrat de la route : la route Go ne fait que relayer (`X-API-Key` = la clé
des notifications, `User-Agent` explicite, HTTPS exigé, type vérifié sur les
octets, réponse vérifiée PNG). Elle n'appelle pas `usage.php`. Point 3 de
« Points d'entrée réseau » de `CLAUDE.md` : c'est la première sortie du dépôt qui
porte le **contenu** d'une image.

### Décisions du propriétaire, appliquées

- Le détourage **remplace la photo** directement, sans aperçu. Ctrl+Z rend
  l'originale sur l'affiche. Pas de « Rétablir l'original » après enregistrement.
- Toute image détourée est **gardée** dans « Génération », quoi qu'il arrive
  ensuite à l'élément : un détourage payé n'est jamais perdu.
- Un seul modèle, choisi par le serveur. Aucun sélecteur.
- Bouton désactivé, raison en infobulle (`peutDetourer`) : photo liée au produit
  (`el.dataBinding`), élément verrouillé, sélection de plusieurs éléments,
  requête en cours. Pas de bouton dans la barre du haut.
- **Aucun prix affiché**, ni en dollars, ni en euros, ni en crédits.

## 2. Comment une image d'élément est stockée

Un élément image porte `src`, une chaîne **[LU]** :

| Forme | Origine | Détourable ? |
|---|---|---|
| data URL | import « Mes images » ; **aussi le résultat d'un détourage** | oui |
| URL de fichier PocketBase | logos de marques, images de catégories, logo de l'entreprise posés en fixe | oui (téléchargée par le renderer) |
| `{{product_image}}` + `dataBinding` | photo, galerie, logo, image de catégorie liés au produit : `src` n'est qu'un **marqueur** | **non** — le bouton est désactivé |

Le résultat est toujours posé en **data URL** : aucune adresse distante ne finit
dans `src` ni dans la bibliothèque. Il part dans les gabarits IndexedDB et dans
l'historique en mémoire avec cette taille — les PNG détourés sont plus lourds
que la photo d'origine **[RAPPORTÉ]** : à surveiller à l'usage.

## 3. La préparation de l'image

Le plafond de corps du serveur n'est **pas mesuré** (8 Mio au mieux, peut-être
2 Mio selon l'hébergeur) **[RAPPORTÉ]**. D'où :

- côté ≤ `COTE_MAX` = 4096 px (une A4 à 300 dpi fait 2480 × 3508 : rien n'est
  perdu à l'impression) ;
- JPEG qualité `QUALITE_ENVOI` = 0,9 : le détourage rend un PNG de toute façon, et
  l'élément garde sa photo d'origine tant que le résultat n'est pas revenu ;
- **WebP** si la source porte de la transparence (sondée sur une copie de 256 px) ;
- tant que le fichier dépasse **`SEUIL_ENVOI_OCTETS` = 2 Mio**, réduction du côté
  par paliers de 15 % (`PALIER_REDUCTION`), jusqu'à `COTE_MIN` = 512 px, puis
  refus local `image_trop_lourde`.

`SEUIL_ENVOI_OCTETS` est une constante nommée de `lib/detourage.ts` : **à relever
après mesure** du plafond réel.

## 4. L'interface

- **Atome `Detourer`** exporté par `ReglagesImage.jsx`, `Bouton` secondaire (jamais
  principal : l'aplat bleu est pris par la validation), icône ciseaux. En attente :
  « Détourage en cours… », bouton désactivé.
- **Les messages sont dans une `Note` du panneau**, pas un message fugitif : l'erreur
  (rouge), ou ce qui s'est passé après le paiement (image non rangée, élément changé).
  Leur état vit hors du composant (`useEtatDetourage`, zustand) : le panneau est
  remplacé quand la sélection change, et « en cours » ne doit pas s'y perdre — sans
  quoi on pourrait payer deux fois.
- **Erreurs** (`traduireErreur`) — le message du serveur est repris tel quel :

  | Famille | Codes | Réessayer ? |
  |---|---|---|
  | crédit | `credit_epuise` (402) | non |
  | taille | `image_trop_lourde` (413) — message maison : « trop grande », sans proposer de réessayer à l'identique | non |
  | format | `type_refuse` (415) | non |
  | service | `fournisseur_en_echec`, `service_indisponible`, `reponse_invalide`, réseau coupé | oui |
  | configuration | `cle_absente`, `cle_invalide`, `adresse_non_securisee` (503) | non |
  | session | 401 / 403 | non |

- **Sous-onglet « Génération »** de `MediasPanel.jsx`, après « Mes images » et
  « PocketStock » : `UploadTemplate` filtré (`origine="generation"`), sans bouton
  d'import. Poser et supprimer comme dans « Mes images ». Il se relit après chaque
  rangement (compteur `rangees`). « Mes images » ne montre plus les images générées.

## 5. Le rangement et la pose

**Une image générée est rangée avant d'être posée.** `presetImageService` porte la
marque `origine: 'generation'`, `depuis` (nom de l'image de départ) et `createdAt` ;
`listerImportees()` / `listerGenerees()` filtrent, `listImages()` rend toujours tout.
Une image stockée avant le détourage n'a pas de marque : c'est une image importée.

À l'arrivée, `lancerDetourage` n'écrit que si l'élément **existe encore, n'est pas
verrouillé et porte la même `src`** — sur l'`id` capturé au lancement, jamais sur la
sélection courante. Un seul `updateElements` : un pas d'historique.

| Situation | Élément | Bibliothèque | Message |
|---|---|---|---|
| normal | posé | rangée | — |
| rangement impossible (quota IndexedDB) | posé | — | avertissement : « pas pu être rangée » |
| élément changé / verrouillé / supprimé | intact | rangée | « elle vous attend dans « Génération » » |
| élément changé **et** rangement impossible | intact | — | avertissement : à recommencer |

Ctrl+Z rend la photo d'origine ; l'image détourée **reste** dans la bibliothèque : le
rangement est indépendant de l'historique. Aucune annulation de la requête en vol
(le coût est engagé une fois partie).

## 6. Vérifié dans le code

- **Le changement de `src` invalide le cache des effets.** `cleEffets`
  (`utils/cleEffets.js:17-21`) met dans la clé TOUS les champs sauf `x`, `y`,
  `rotation`, `locked` : `src` y est. Gardien ajouté : `cleEffets.test.js`.
- **Le PNG transparent sort correctement à l'écran et dans les deux exports**, lu
  dans le code : `sceneImage` (`utils/imageForme.js`) ne fait que `drawImage` et, pour
  la découpe, un `destination-in` sur un calque hors écran — l'alpha est conservé ;
  `exportPdf.js` (`mimeType: 'image/png'`) et `exportPdfSheet.js` (`toDataURL` par
  défaut, PNG) ne convertissent jamais en JPEG — aucun `jpeg` dans le module hors
  import — ; les seuls fonds blancs sont ceux de la page (`addWhitePage` dans `exportPdf.js:66`,
  rectangle de `exportPdfSheet.js:186`), derrière les éléments. **Non vérifié à l'œil** : §8.

## 7. Tests

`labels/lib/detourage.test.ts` (39 cas : `peutDetourer`, source, préparation, chaque
famille d'erreur, pose en un pas, rangement, élément changé, échec du rangement) et
`labels/services/presetImageService.test.js` (6 cas : « Mes images » / « Génération »),
sur un IndexedDB en mémoire (`services/indexedDBFactice.js` — le dépôt n'a pas
`fake-indexeddb`). Le faux `pb.send` imite le SDK 0.21 : il lit la réponse en JSON
et lève sur un statut ≥ 400.

## 8. Ce qui reste à voir dans l'application

- **`pb.send` ne sait pas lire un PNG** (il lit toujours du JSON, le SDK 0.21 rend
  `{}`). `appelerDetourage` lui passe donc un `fetch` qui garde un clone de la
  réponse. Testé contre un faux SDK, **pas contre le vrai** : un appel réel est à faire.
- Le codec du navigateur (`codecNavigateur` : `createImageBitmap` + canvas, détection
  d'alpha, export WebP) n'est exécuté par aucun test — pas de canvas sous Node.
- Le plafond de corps du mini-SaaS (voir §3) et le temps de réponse (la route a un
  délai de 90 s).
- L'aspect d'un PNG détouré dans le canvas et dans les deux exports.
- Le message « l'image a changé… » est dans le panneau de l'image **sélectionnée** : si
  le vendeur n'a plus d'image sélectionnée à l'arrivée, il ne le voit pas (le résultat
  est quand même dans « Génération »).

## 9. Hors périmètre, à ne pas oublier

- Le mini-SaaS décompte les crédits ; **aucun coût n'est lu ni affiché** ici
  (`X-Billed-Cost` est relayé par la route, ignoré par le renderer).
- Les gabarits enregistrés gardent vraisemblablement le PNG détouré en data URL, donc leur poids augmente **[SUPPOSÉ]** : `templateService.js` n'a pas été relu pour ce chantier.
