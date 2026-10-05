# 10 — Détourage IA : état

*5 octobre 2026. **Branché** dans l'éditeur et en production ; build
(`pnpm build:client`) et tests du module verts. Le même jour : durée des succès
mesurée, jauge par étapes, code `delai_depasse` — §10 à §13. **La jauge n'a pas été
vue dans l'application** : voir §8.*

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
| 5 | Succès : `200 image/png`, en-tête `X-Detourage-Ms` (durée de l'appel au fournisseur, mesurée par le mini-SaaS). Échec : JSON `{ error, code }` | route, `erreursDetourage` **[LU]** |
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

Le plafond de corps du mini-SaaS est de 8 Mio (`DETOURAGE_MAX_BYTES` ; l'hébergeur
accepte 128 Mio) **[RAPPORTÉ]**. D'où :

- côté ≤ `COTE_MAX` = 4096 px (une A4 à 300 dpi fait 2480 × 3508 : rien n'est
  perdu à l'impression) ;
- JPEG qualité `QUALITE_ENVOI` = 0,9 : le détourage rend un PNG de toute façon, et
  l'élément garde sa photo d'origine tant que le résultat n'est pas revenu ;
- **WebP** si la source porte de la transparence (sondée sur une copie de 256 px) ;
- tant que le fichier dépasse **`SEUIL_ENVOI_OCTETS` = 6 Mio**, réduction du côté
  par paliers de 15 % (`PALIER_REDUCTION`), jusqu'à `COTE_MIN` = 512 px, puis
  refus local `image_trop_lourde`.

Ni la dimension ni le format de retour n'ont été réduits le 5 octobre : §12.

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
  | service | `fournisseur_en_echec`, `delai_depasse` (504), `service_indisponible`, `reponse_invalide`, réseau coupé | oui |
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

- **La jauge** (§11) : son aspect dans le panneau et dans la barre du haut, en clair
  et en sombre ; la largeur de la barre du haut quand un produit au nom long est
  sélectionné ; le solde de l'en-tête qui se relit à la livraison.
- **L'en-tête `X-Detourage-Ms`** n'arrive que si le mini-SaaS est redéposé ; le
  journal de debug affiche `serveur: null` d'ici là.

## 9. Hors périmètre, à ne pas oublier

- Le mini-SaaS décompte les crédits ; **aucun coût n'est lu ni affiché** ici
  (`X-Billed-Cost` est relayé par la route, ignoré par le renderer).
- Les gabarits enregistrés gardent vraisemblablement le PNG détouré en data URL, donc leur poids augmente **[SUPPOSÉ]** : `templateService.js` n'a pas été relu pour ce chantier.

## 10. Mesurer : où passe l'attente

Mesuré le 5 octobre 2026 **[RAPPORTÉ]** : un détourage sur deux échouait, le
journal du serveur disant « transport (curl 28) — image image/jpeg 0.08 Mio, 25 s ».
Le poids de l'image n'est donc pas la cause. Le délai a été porté à 75 s
(`RUNWARE_TIMEOUT`) et les détourages aboutissent, parfois en une minute.

**L'hypothèse du démarrage à froid n'est pas confirmée, et la documentation de
Runware ne la soutient pas** : elle annonce « ~5 s » par requête pour les trois
modèles au même prix et des démarrages à froid « sous la seconde »
(`runware.ai/docs/models/birefnet-general`, `…/rembg-v1-4`,
`…/birefnet-portrait`, `runware.ai/sonic-inference-engine`, lus le 5 octobre
2026). Elle ne dit rien d'une file d'attente ni d'un délai maximal. C'est la
mesure qui tranchera — d'où :

| Où | Quoi | Lecture |
|---|---|---|
| mini-SaaS, `journaliserDureeDetourage` | chaque SUCCÈS : durée de l'appel, délai avant le premier octet, poids envoyé et reçu, modèle, coût Runware | `api/admin/php-limits.php`, clé `durees_detourage` : médiane, maximum, part au-delà de 20 s — au total et **par modèle** |
| mini-SaaS | les délais dépassés, sous le code `delai_depasse` | même page, `delais_depasses` et `derniers_echecs_detourage` |
| route Go | relaie `X-Detourage-Ms` (un entier, sinon rien) | — |
| renderer, `ChronoDetourage` | source, préparation, aller-retour, serveur, réception, rangement, pose, total, octets envoyés et reçus, dimensions | console, niveau « Verbose », filtre `DETOURAGE` |

Comment lire : `allerRetour − serveur` est le temps des **transferts** (poste ↔
mini-SaaS) ; `serveur` est le temps **chez Runware**. Et comme Runware facture au
temps de calcul, une attente longue pour un coût ordinaire (0,0006 $) dit que le
temps est passé à attendre le modèle, pas à calculer.

Aucune colonne SQL : les durées vont dans le journal des échecs
(`pocketapp-detourage.log`, déjà interdit en HTTP et borné), sous le code `ok`.

## 11. La jauge

Le serveur ne rend aucun avancement pendant le calcul : **pas de pourcentage**.
`ui/JaugeDetourage.jsx` montre l'ÉTAPE en cours, en quatre segments :

| Étape (`EtapeDetourage`) | Ce qu'elle couvre |
|---|---|
| `preparation` | lecture de la source, réduction, réencodage |
| `detourage` — « Envoi et détourage » | de l'envoi à l'arrivée des en-têtes de la réponse |
| `reception` | lecture des octets, conversion en data URL |
| `rangement` | écriture dans « Génération », puis pose |

**L'envoi et le calcul ne sont pas deux étapes**, et c'est voulu : le renderer
envoie à la route Go locale (instantané), qui relaie et attend. Il ne peut pas
savoir quand l'envoi réel finit ; les séparer serait inventer.

Pendant `detourage` seulement, un temps restant **estimé** (`estimerRestant`,
`messageJauge`) :

| Situation | Affichage |
|---|---|
| pas d'historique | l'étape seule |
| pas d'historique, 15 s passées | « L'attente peut aller jusqu'à une minute. Vous pouvez continuer à travailler. » |
| historique, durée habituelle pas atteinte | « environ 10 s », par pas de 5 s |
| durée habituelle juste passée (marge : la moitié, 5 s au moins) | « encore quelques secondes » |
| au-delà | « Le service met plus de temps que d'habitude : l'attente peut aller jusqu'à une minute. Vous pouvez continuer à travailler. » — jamais de compte à rebours négatif |

La durée habituelle est la **médiane** des 10 derniers aller-retour RÉUSSIS de ce
poste (`localStorage`, clé `pocketstick.detourage.durees`) : un appel lent isolé
ne la déplace pas. Un échec n'y entre pas.

La jauge est montée deux fois sur le même état (`useEtatDetourage`) : sous le
bouton « Détourer », et dans la **barre du haut** (`TopToolbar.jsx`, `compact`),
qui reste visible quand la sélection change et que le panneau est remplacé.

**On peut continuer à travailler pendant l'attente** **[LU]** : `lancerDetourage`
n'attend rien de bloquant, la pose écrit sur l'`id` capturé et seulement si
l'élément porte encore la même `src`, et elle n'ajoute qu'UN pas d'historique
après ceux du vendeur — gardé par un test. Seul un second détourage est refusé.

À la livraison, le solde de l'en-tête est relu (`rafraichirCreditsPocketApp`,
`frontend/lib/credits.ts`) : il ne se rafraîchissait que toutes les 5 minutes.

### Le délai dépassé n'est plus une « panne »

| Qui a cessé d'attendre | Code | Message |
|---|---|---|
| le mini-SaaS (Runware muet pendant `RUNWARE_TIMEOUT`, connexion établie) | `delai_depasse`, 504 | « … n'a pas répondu à temps. Réessaie : rien n'a été décompté. » |
| le poste (délai de 90 s de la route Go) | `delai_depasse`, 504 | « … n'a pas répondu à temps. Réessaie dans un instant. » — **sans promesse** : le serveur a pu finir, et décompter, après que le poste a cessé d'attendre |

Compatibilité : un poste ancien qui reçoit `delai_depasse` ne le connaît pas et
retombe sur `fournisseur_en_echec` (`relayerDetourage`, repli sur code inconnu) ;
un mini-SaaS ancien ne l'émet pas et le poste récent affiche la panne générique.

## 12. Ce qui a été écarté, et pourquoi

- **Changer le modèle par défaut.** La documentation donne la même latence aux
  trois modèles au même prix ; rien ne dit qu'un autre répond plus vite. Le modèle
  reste un réglage du serveur (`DETOURAGE_MODEL`, fichier de secrets), et les
  durées sont ventilées par modèle pour que le propriétaire compare.
- **La livraison asynchrone** (`deliveryMethod: "async"` puis `getResponse`, que la
  documentation décrit). Elle ne raccourcit rien : elle rend seulement l'attente
  interrogeable. Coût : une table des tâches en cours côté mini-SaaS, deux actions
  au lieu d'une, une boucle d'interrogation côté Go, et surtout un décompte à
  rendre **idempotent** (aujourd'hui « livré = décompté » tient en une requête).
  À reprendre seulement si la mesure montre des attentes au-delà de 75 s.
- **Le second essai automatique.** Aucune mesure ne dit qu'il aboutit vite, un
  appel coupé peut être facturé par Runware, et 75 s + un second essai dépassent
  les 90 s du poste. Gardé par les tests : un délai dépassé = un seul appel.
- **Réduire l'image à sa taille utile sur la page.** L'image détourée est rangée
  dans « Génération » pour être REPOSÉE ailleurs, à une autre taille : la tailler
  sur l'élément du moment se verrait à l'impression suivante. Et le poids n'est
  pas la cause mesurée.
- **Le retour en WebP.** Il touche trois côtés du contrat pour un gain que rien
  n'a mesuré. `chrono.reception` et `octetsRecus` diront s'il vaut la peine.

## 13. Tests de ce chantier

`detourage.test.ts` (62 cas) : estimation sans historique, avec, dépassée ; étapes
de la jauge dans l'ordre et retour au repos après un échec ; `delai_depasse` ;
historique du poste ; solde relu une fois à la livraison ; travail pendant
l'attente. `detourage_routes_test.go` : durée relayée ou écartée, délai du
mini-SaaS, délai du poste contre un faux serveur lent. Mini-SaaS :
`tests/detourage-test.php`, faux Runware en modes `tiede` et `lent`.
