# 12 — Composer par IA et générer une image depuis un texte : état

*6 octobre 2026. **Écrit et testé, pas vu dans l'application ni essayé contre le
vrai Runware** : voir §8. Rien n'est déposé sur le serveur : §7.*

Notation : **[LU]** = lu dans le code ; **[RAPPORTÉ]** = dit par la documentation
de Runware, lue à travers un outil qui la résume.

Deux ajouts sur le trajet de « Modifier par IA »
([`11-image-to-image.md`](11-image-to-image.md)) ; ce document ne dit que ce qui
diffère.

- **Composer par IA** : 2 à 4 éléments sélectionnés servent d'**ingrédients** à
  une nouvelle image, posée comme un nouveau calque au-dessus de tout.
- **Générer une image** : une image depuis un **texte seul**, rangée dans
  « Génération », **pas posée**.

---

## 1. Décisions du propriétaire (6 octobre 2026)

- **Une seule porte** : `api/retouche.php` et la route Go
  `POST /api/ai/image-to-image`, avec un champ `tache`. Absent = la retouche,
  contrat inchangé ; `generation` = aucune image ; `composition` = 1 à 4 images
  (`images[]`). Valeur inconnue : 400 `format_inconnu`.
- **Mêmes qualités, mêmes prix** (0,05 / 0,10 / 0,15 €) pour les deux tâches.
  Aucun prix affiché.
- **Composition** : UNE image par élément, **4 au plus quelle que soit la
  qualité**. Au-delà : bouton désactivé (raison en infobulle), refus 400
  `trop_d_images` côté serveur, **jamais de troncature**. Acceptés : images
  (une photo liée est résolue pour le produit affiché), formes, dessins.
  Refusés : textes, QR, codes-barres, fiches, éléments verrouillés. Jamais en
  planche. Les ingrédients restent sur la page.
- **Génération** : les sept formats nommés (pas « celui de la page »), défaut =
  le plus proche des proportions de la page ; le suffixe « Keep every text… »
  du serveur n'est **pas** ajouté ; des idées de **sujet**, pas de style.
- Libellés d'usage `generation` et `composition`. Aucune colonne SQL.
- Durées : un historique par tâche, par qualité et par définition.

## 2. Ce que dit la documentation de Runware **[RAPPORTÉ]**

Pages lues le 6 octobre 2026 : `runware.ai/docs/models/bfl-flux-2-klein-4b` et
`runware.ai/docs/models/google-nano-banana-2-lite`. **La page du klein 9B n'a
pas été relue** (trois pages au plus) : ses chiffres sont ceux du 5 octobre.

| Question | klein 4B | klein 9B | Nano Banana 2 Lite |
|---|---|---|---|
| `imageInference` sans `inputs.referenceImages` = text-to-image | oui (`inputs` est facultatif) | non relu, même famille | oui (« fournir des références, **ou** `width`/`height` ») |
| Références acceptées | 1 à 4 | 4 (5 octobre) | jusqu'à 14 |
| Le prix monte-t-il avec les références ? | oui, par le **temps de calcul** : 0,0006 $ en texte seul, exemple à 0,0019 $ avec référence | idem | oui, **0,000337 $ par image** en entrée |

Le plafond de 4 est donc celui des klein ; il vaut aussi pour la Soignée, par
décision.

## 3. La grille (taux `DETOURAGE_USD_EUR` = 0,92)

| Qualité | Génération (0 image) | Composition (4 images) | En euros, au pire | Prix | Marge |
|---|---|---|---|---|---|
| Rapide | 0,0006 $ | ~0,002 à 0,006 $ **[extrapolé]** | ≤ 0,006 € | 0,05 € | ≥ 0,044 € |
| Équilibrée | 0,0008 $ | ~0,003 à 0,008 $ **[extrapolé]** | ≤ 0,008 € | 0,10 € | ≥ 0,092 € |
| Soignée | 0,0336 $ | 0,0336 + 4 × 0,000337 = 0,0349 $ | 0,032 € | 0,15 € | 0,118 € |

Les coûts des klein avec plusieurs références sont **extrapolés** de l'exemple
à une référence ; l'alerte `cout_superieur_au_prix` du journal dira le reste.
Le coût réel de chaque image est dans `gemini_usage.provider_cost_usd`.

## 4. Le mini-SaaS **[LU]** (`api/retouche-lib.php`)

| Règle | Où |
|---|---|
| Ordre : qualité → format → **tâche** → consigne → nombre d'images → crédit au prix de la qualité → images → Runware → débit atomique | `traiterRetouche` |
| `tache` inconnue, `retouche` écrit en toutes lettres, ou génération sans format nommé : 400 `format_inconnu` | idem |
| Génération : aucun fichier n'est lu, même joint ; pas de clé `inputs` chez Runware ; consigne **sans** suffixe | idem, `appelerRunwareRetouche` |
| Composition : chaque image passe par `lireImageRecue` ; la première refusée refuse le tout ; poids **total** sous `plafondOctetsImage()` | `lireImagesRecues` |
| Plafond du nombre : `min(COMPOSITION_MAX_IMAGES, max_file_uploads)` ; trop = 400 `trop_d_images`, **avant** le crédit | `plafondNombreImages` |
| Champ `nombre` : les images annoncées. PHP écartant sans le dire les fichiers au-delà de `max_file_uploads`, un écart = 400 `image_illisible`, pas une composition amputée | `lireImagesRecues` |
| « page » en composition : les proportions de la **première** image (le poste envoie en fait un format nommé, §6) | `traiterRetouche` |
| Usage `recordImageUsage(…, $tache)` ; durées sous `generation:<qualité>` et `composition:<qualité>` | idem |

Crédit, débit unique, alerte de coût, délai, modération, consigne jamais
journalisée : le code de la retouche, inchangé.

## 5. La route Go **[LU]**

`relaisImage` (`detourage_routes.go`) envoie maintenant zéro, une ou plusieurs
images (`relayerImages`) : mêmes gardes — HTTPS, clé, `User-Agent`, type lu sur
les octets de **chaque** image, poids **total** borné, réponse vérifiée PNG, un
seul envoi. Le champ `tache` choisit le relais (`relaisDeLaRoute`,
`retouche_routes.go`) : ses mots et ce qu'il envoie. Une génération ne lit
aucun fichier ; une composition lit `images[]`, en refuse plus de 4
(`trop_d_images`) et **compte elle-même** le champ `nombre`.

## 6. L'éditeur **[LU]**

| Quoi | Où |
|---|---|
| Le trajet : `TacheIA` gagne `sources` (aucune ou plusieurs images), `sansPose` et `seuilOctets` | `lib/detourage.ts` |
| Générer : formats nommés, `formatProche`, idées de sujet, tâche `generation` | `lib/generer.ts` |
| Composer : ingrédients, refus, tâche `composition` | `lib/composer.ts` |
| Bloc « Générer une image », en tête du sous-onglet « Génération » | `templates/GenererImage.jsx`, `MediasPanel.jsx` |
| Bloc « Composer par IA », dans le panneau de réglages, sous les réglages communs, dès 2 éléments sélectionnés | `templates/ComposerIA.jsx`, `ReglagesPanel.jsx` |
| Un calque seul, fond transparent, cadré sur lui | `rendreElement`, `utils/renduPage.js` |
| `ConsigneIA` prend ses idées en propriété (`idees`) | `templates/ConsigneIA.jsx` |

- **Une requête d'IA à la fois** : `NomTache` porte `generation` et
  `composition` ; la jauge dit « Envoi et génération » / « Envoi et
  composition ».
- **Génération non posée** (`sansPose`) : la page et son historique ne bougent
  pas ; l'image apparaît dans la liste juste sous le bloc, un clic la pose.
- **Composition** : nouveau calque au-dessus de tout (`fit: 'contain'`), un pas
  d'historique ; rang calculé à l'arrivée ; les `id` des ingrédients sont
  capturés au clic.
- **« Celui de la page » part en format NOMMÉ** (le plus proche des proportions
  de la page) : « page » n'a de sens côté serveur que pour une image seule.
- **Le plafond d'envoi (6 Mio) se partage** entre les ingrédients ; chacun est
  réduit à 1536 px au plus.
- Consigne et qualité sont celles de « Modifier par IA » (même état) ; format
  et définition de la composition sont ceux d'« Embellir ».
- Historiques : `pocketstick.generation.durees.<qualité>.<définition>` et
  `pocketstick.composition.durees.<qualité>.<définition>`.

**Écarté** : donner à la Soignée ses quatorze formats (la page en liste
quatorze, six sont en table) — cela changerait le résultat de « Modifier par
IA » ; à faire à part. Envoyer plus de 4 images en Soignée. Poser d'office
l'image générée.

## 7. Déploiement du mini-SaaS

Aucun SQL. Déposer, dans cet ordre :

1. `api/retouche-lib.php`
2. `api/retouche.php` (seul son en-tête de commentaire change)
3. `api/admin/php-limits.php`

Puis ouvrir `php-limits.php` : `max_file_uploads` et `plafond_images_composition`
(4 attendu). `api/detourage-lib.php` n'a pas changé.

## 8. Ce qui n'a pas pu être vérifié

- **L'interface n'a pas été vue** : hauteur du bloc « Composer » dans le
  panneau, bloc « Générer » au-dessus de la liste, sombre et clair.
- **Aucun appel réel à Runware.** En plus des inconnues du document 11 :
  1. Nano Banana 2 Lite accepte-t-il `width`/`height` **avec** des références ?
     Sa page dit « l'un ou l'autre ». C'est déjà ce que « Modifier par IA »
     envoie en Soignée ; un refus donnera `fournisseur_en_echec`, code au journal.
  2. Le coût réel des klein avec 2 à 4 références (§3).
- **`rendreElement`** (rendu d'une forme ou d'un dessin seul) : pas de canvas
  sous Node, donc aucun test ; seule `dansLaPage` est pure.
- **La `src` d'une photo liée** est celle que `getProductField` rend ; qu'elle
  soit toujours téléchargeable par le renderer n'a pas été essayé.
- `max_file_uploads` de l'hébergeur (20 par défaut en PHP).

## 9. Tests

| Fichier | Cas |
|---|---|
| `tests/generation-test.php` (mini-SaaS) | 80 : tâche inconnue, consigne, crédit par qualité, trop d'images, une image refusée parmi plusieurs, poids total, débit unique, concurrence, délai, modération, alerte de coût, consigne absente du journal |
| `tests/detourage-test.php`, `tests/retouche-test.php` | 87 et 83, assertions inchangées |
| `backend/routes/generation_routes_test.go` | texte seul, plusieurs images, refus avant envoi, poids total, mots de la tâche |
| `labels/lib/composition-generation.test.ts` | 38 : formats, refus des ingrédients, trajet commun, génération non posée, une requête à la fois, historiques séparés |
