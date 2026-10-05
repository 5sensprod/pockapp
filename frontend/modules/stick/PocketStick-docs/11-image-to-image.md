# 11 — Modifier par IA (image-to-image) : état

*5 octobre 2026. **Écrit et testé, pas encore vu dans l'application ni essayé
contre le vrai Runware** : voir §9. Build (`pnpm build:client`) et tests verts.
Rien n'est déposé sur le serveur : §8.*

Notation : **[LU]** = lu dans le code, chemin donné ; **[RAPPORTÉ]** = dit par le
propriétaire ou par la documentation de Runware, non mesuré ici.

Le vendeur écrit une consigne (« fond blanc uni »), choisit une qualité, et
l'image de l'affiche est remplacée par ce que le service rend. C'est le trajet
du détourage ([`10-detourage-ia.md`](10-detourage-ia.md)), par les mêmes
fonctions ; ce document ne dit que ce qui diffère.

---

## 1. Décisions du propriétaire (5 octobre 2026)

| Qualité (identifiant) | Modèle Runware | Prix décompté |
|---|---|---|
| Rapide (`rapide`) | `runware:400@4` FLUX.2 klein 4B | 0,05 € |
| Équilibrée (`equilibree`) | `runware:400@2` FLUX.2 klein 9B | 0,10 € |
| Soignée (`soignee`) | `google:nano-banana@2-lite` Nano Banana 2 Lite | 0,15 € |

- Le vendeur **choisit la qualité**. Le poste envoie son identifiant, jamais un
  modèle : la table ne vit que sur le mini-SaaS (`RETOUCHE_QUALITES_DEFAUT`,
  `api/retouche-lib.php`).
- Grand côté demandé à Runware plafonné à **1536 px** (`RETOUCHE_MAX_SIDE`).
- Aucun appel réel à Runware pendant ce chantier.

Choisi par défaut, **à confirmer** : les noms Rapide / Équilibrée / Soignée, et
**aucun prix affiché** (comme le détourage) — la réponse sur l'affichage disait
seulement que le vendeur choisit la qualité.

## 2. Ce que dit la documentation de Runware **[RAPPORTÉ]**

Pages lues le 5 octobre 2026, à travers un outil qui les résume : à contrôler
sur la page avant de toucher à un tarif.

| Modèle | Prix | Unité | Latence | Dimensions | Références |
|---|---|---|---|---|---|
| klein 4B | 0,0006 $ | temps de calcul | ~4 s (1 à 6) | 128–2048, pas de 16 | 4, `inputs.referenceImages` |
| klein 9B | 0,00078 $ (1024², 4 pas) | temps de calcul | ~4 s (2 à 7) | 128–2048, pas de 16 | 4, `inputs.referenceImages` |
| Nano Banana 2 Lite | 0,0336 $ en sortie + 0,000337 $ par image en entrée | par image | ~5 s (4 à 7) | **liste fixe** (1024², 1376×768, 1264×848, 848×1264, 1200×896, 896×1200, « et 8 autres ») | 14, `inputs.referenceImages` |

Sources : `runware.ai/docs/models/bfl-flux-2-klein-4b`, `…/bfl-flux-2-klein-9b`,
`…/google-nano-banana-2-lite`, `runware.ai/docs/platform/errors`. Écartés et
pourquoi : `google:4@1` (annoncé désactivé le 2 octobre 2026), Qwen Edit Plus
(0,0166 $, pas 0,006 $), FLUX.2 dev (~0,03 $ avec une référence), Kontext pro
(0,04 $), FLUX.2 pro (au mégapixel, entrée comprise).

- **Le prix des klein dépend de la taille** (temps de calcul). À 1536 px le coût
  reste de l'ordre de 0,001 à 0,002 $ **[extrapolé]** ; le plafond et l'alerte
  du §4 tiennent le reste.
- **Modération : le code d'un refus n'est pas documenté.** La page des erreurs
  ne décrit que `invalidApiKey` et prévient que les codes varient d'un modèle à
  l'autre. Ce qui est documenté : `safety.checkContent` et un drapeau
  `NSFWContent` dans une réponse *réussie*.

## 3. La grille appliquée (taux `DETOURAGE_USD_EUR` = 0,92)

| Qualité | Coût Runware | En euros | Prix | Marge |
|---|---|---|---|---|
| Rapide | 0,0006 à ~0,0015 $ | ≤ 0,0014 € | 0,05 € | ≥ 0,048 € |
| Équilibrée | 0,0008 à ~0,002 $ | ≤ 0,0018 € | 0,10 € | ≥ 0,098 € |
| Soignée | 0,034 $ (fixe) | 0,031 € | 0,15 € | 0,119 € |

Le coût réel de chaque image revient dans `gemini_usage.provider_cost_usd`.

## 4. Le mini-SaaS (`I:\pocketApp_minisaas`)

`POST /api/retouche.php`, multipart : `image`, `prompt`, `qualite`. Succès et
échecs comme `detourage.php`, **même en-tête de durée `X-Detourage-Ms`** (un
seul nom pour les deux portes).

| Règle | Où **[LU]** |
|---|---|
| Ordre : qualité → consigne → crédit AU PRIX DE LA QUALITÉ → image → Runware → débit atomique | `traiterRetouche` |
| Qualité inconnue ou absente : 400 `qualite_inconnue`, jamais un repli | idem |
| Un champ `model`, `width`, `height` reçu n'est jamais lu | idem ; gardé par un test |
| Consigne : contrôles retirés, 500 caractères au plus (`prompt_trop_long`, pas de troncature), **jamais journalisée ni écrite en base** | `consigneNettoyee` |
| Le serveur ajoute « Keep every text… identical » (repris tel quel de PocketStick) | `RETOUCHE_PROMPT_SUFFIX` |
| Dimensions calculées depuis l'image reçue : proportions gardées, grand côté de 1024 à 1536, multiples de 16 ; pour la Soignée, le format imposé le plus proche | `dimensionsRetouche` |
| Prix absent, nul ou négatif dans les secrets : le défaut, jamais « gratuit » | `qualitesRetouche` |
| Refus de modération : erreur dont le code ou le message le dit, ou `NSFWContent` → 422 `contenu_refuse`, rien décompté | `estRefusDeContenu`, `appelerRunwareRetouche` |
| Coût Runware converti > prix décompté : ligne `cout_superieur_au_prix` au journal | `traiterRetouche` |
| Usage : `recordImageUsage(…, 'retouche')` — **aucune colonne SQL** (`request_label` existait) | `billing.php:221` |
| Durée de chaque succès au journal commun, 9ᵉ colonne `retouche:<qualité>` ; `php-limits.php` rend `par_tache` et `qualites_retouche` | `journaliserDureeDetourage`, `statsDureesDetourage` |

**Partagé avec le détourage, sans changer son contrat** : `lireImageRecue`,
`plafondOctetsImage`, le journal, `recordImageUsage`, et l'appel curl, sorti
d'`appelerRunware` dans `requeteRunware` + `pngDepuisItemRunware`.
`tests/detourage-test.php` reste vert (87) sans retouche de ses assertions ;
seul son harnais est passé dans `tests/harnais.php`.

## 5. La route Go

`POST /api/ai/image-to-image` (`backend/routes/retouche_routes.go`), session
PocketBase requise. Le relais est celui du détourage, devenu `relaisImage`
(`detourage_routes.go`) : HTTPS exigé, `X-API-Key`, `User-Agent` explicite,
type lu sur les octets, réponse vérifiée PNG, codes relayés, un seul envoi.
Propres à la retouche : l'adresse, les champs `prompt` et `qualite` (seuls
relayés), ses messages. La qualité n'est pas comparée à une liste : c'est le
mini-SaaS qui la connaît.

**Délais, inchangés** : Runware 75 s (`RUNWARE_TIMEOUT`) < poste 90 s
(`detourageTimeout`) ; PHP se laisse 120 s d'exécution (`set_time_limit`), qui
n'est pas un délai de réponse. Justifié par la documentation (4 à 7 s
annoncées), **non mesuré** — le détourage, annoncé à 5 s, a été mesuré à une
minute.

## 6. L'éditeur

- **Où** : le noyau d'une image, sous « Détourer » — atome `Retoucher`
  (`templates/ReglagesImage.jsx`) : un champ de consigne (`ui/ChampTexte.jsx`,
  nouveau), huit idées, `Segments` pour la qualité, un `Bouton` secondaire.
- **Repris de PocketStick** (`src/topbar/postprocess.jsx`) : les huit consignes
  prédéfinies, sans leurs emojis ; un clic remplit le champ. **Pas repris** : la
  fenêtre avant/après, le sélecteur de modèle et son coût en dollars, la taille
  forcée à 1024², le pourcentage simulé, les crédits locaux et Stripe.
- **Un seul trajet** : `lancerTraitement(el, nombre, deps, tache)`
  (`lib/detourage.ts`) ; `lancerDetourage` et `lancerRetouche`
  (`lib/retouche.ts`) n'en sont que deux `TacheIA`. Ranger avant de poser, pose
  sur l'`id` capturé si la `src` n'a pas changé, un pas d'historique.
- **Une requête d'IA à la fois** : les deux tâches partagent `useEtatDetourage`,
  qui porte maintenant `tache`. Mêmes refus que `peutDetourer`, plus la consigne.
- **Cadre, recadrage, ajustement : seule `src` est écrite.** Le résultat n'a pas
  toujours les proportions de l'original (surtout en Soignée) et n'est jamais
  transparent. Rien ne se déforme : en Contenir l'image est entière ; en
  Remplir, `visibleCrop` (`utils/crop.js:91`) ramène la partie affichée aux
  proportions du cadre. `crop.js` n'est pas modifié. ⚠️ Retoucher une image
  détourée lui fait perdre sa transparence.
- **Image envoyée réduite à 2048 px** (`COTE_MAX_RETOUCHE`), la sortie étant
  plafonnée à 1536.
- **Jauge** : `ui/JaugeDetourage.jsx` sert aux deux (`libellesDe`, « Envoi et
  retouche »). **Un historique de durées par qualité**
  (`pocketstick.retouche.durees.<qualité>`), distinct de celui du détourage.
- **La consigne** reste après un échec et d'une image à l'autre
  (`useReglagesRetouche`, en mémoire) ; elle disparaît à la fermeture.
- **L'image d'origine** n'est gardée nulle part au-delà de Ctrl+Z, comme pour le
  détourage. Si elle venait de « Mes images », elle y est toujours.
- Solde de l'en-tête relu à la livraison (`rafraichirCreditsPocketApp`).

## 7. Tests

| Fichier | Cas |
|---|---|
| `tests/retouche-test.php` (mini-SaaS) | 83 : crédit par qualité, qualité inconnue, consigne, modèle et dimensions ignorés, débit unique au bon prix, concurrence, délai, modération, alerte de coût, consigne absente du journal |
| `tests/detourage-test.php` | 87, inchangés |
| `backend/routes/retouche_routes_test.go` | champs relayés, refus avant envoi, codes, délai du poste, gardes communes |
| `labels/lib/retouche.test.ts` | 26 : refus, appel, trajet commun, proportions, une requête à la fois, historique par qualité |
| `labels/lib/detourage.test.ts` | 62, inchangés |

## 8. Déploiement du mini-SaaS

Aucun SQL. Déposer, dans cet ordre :

1. `api/detourage-lib.php` (les nouvelles fonctions partagées, avant qui les appelle)
2. `api/retouche-lib.php`
3. `api/retouche.php`
4. `api/admin/php-limits.php`

Puis ouvrir `api/admin/php-limits.php` et lire `qualites_retouche`.

**Changer un prix ou un modèle sans redéployer** : dans `pocketapp-secrets.php`,

```php
define('RETOUCHE_QUALITES', ['soignee' => ['prix' => 0.18]]);
```

Seules les trois qualités connues se surchargent. Changer le modèle d'une
qualité retire ses formats imposés : les redonner (`formats`) si le nouveau
modèle n'accepte qu'une liste. Aussi : `RETOUCHE_MAX_SIDE`,
`RETOUCHE_CHECK_CONTENT`.

## 9. Ce qui n'a pas pu être vérifié

- **L'interface n'a pas été vue** : place de l'atome dans le noyau, hauteur du
  panneau, huit idées sur deux lignes, sombre et clair.
- **Aucun appel réel.** Trois inconnues, par ordre de risque :
  1. `safety.checkContent` est-il accepté par les TROIS modèles ? S'il est
     refusé, toutes les retouches échouent : poser
     `define('RETOUCHE_CHECK_CONTENT', false);` dans les secrets.
  2. Le code d'un refus de modération. Celui du faux Runware est **inventé** ;
     le vrai sera au journal (`derniers_echecs_detourage`) dès le premier refus.
  3. Les formats de la Soignée : six lus sur quatorze annoncés. Un format refusé
     donnera `fournisseur_en_echec` avec le code de Runware au journal.
- Les délais (§5) et la tenue des textes d'une image, qualité par qualité.

## 10. Embellir la page entière (6 octobre 2026)

Demande du propriétaire : pouvoir embellir **toute la page**, pas seulement une
image. **Écrit et testé, pas vu dans l'application.**

### Ce que faisait PocketStick, et ce qui change **[LU]**

`src/editor/topbar/Publish.jsx` rend la page en PNG et ouvre la fenêtre de
retouche, qui l'envoie **toujours en 1024×1024** (`postprocess.jsx:123`) et ne
propose que de **télécharger** le résultat. Ici : le format suit la page ou se
choisit, et l'image revient sur la page.

### Décisions du propriétaire

- **Deux modes.** *Décor seul* : la page est rendue sans ses éléments
  « vivants » — textes, QR, codes-barres, fiches, tout ce qui porte un
  `dataBinding` — et l'image revient se glisser **sous** eux : prix et codes
  restent les vrais calques. *Page entière* : tout part, l'image revient à plat
  **au-dessus** de tout ; l'IA peut y avoir réécrit un texte.
- **Jamais en planche** : le bloc n'est pas affiché (`formatTirage === 'planche'`
  ou `lockCanvasToSheetCell`), et `peutEmbellir` refuse.
- **Le résultat est un NOUVEAU CALQUE sur la même page**, et il est rangé dans
  « Génération ». Rien de la page n'est modifié ni supprimé ; Ctrl+Z retire le
  calque, l'image reste dans la bibliothèque.
- **Tous les formats** : page, 1:1, 4:3, 3:4, 3:2, 2:3, 16:9, 9:16.
- **Deux définitions** : 1536 px (`standard`) et 2048 px (`haute`).

### Où **[LU]**

| Quoi | Où |
|---|---|
| Bloc « Embellir par IA », sous le fond, dans l'onglet « Page » | `templates/EmbellirPage.jsx`, monté par `PagePanel.jsx` |
| Consigne, idées et qualité, **partagées** avec « Modifier par IA » | `templates/ConsigneIA.jsx` |
| Modes, formats, définitions, calques cachés, rang de pose, refus | `lib/embellir.ts` |
| Rendu de la page : clone du groupe du document hors écran, fond blanc, comme `exportPdf.js` | `utils/renduPage.js` |
| Le trajet : toujours `lancerTraitement`, avec une `TacheIA` qui porte sa `source` (le rendu) et sa `poser` (un calque) | `lib/detourage.ts` |
| `addElement(element, { index })` : un calque inséré à un rang, en un pas d'historique | `store/useLabelStore.js` |

- **Le rang est calculé à l'arrivée** (`rangDePose`) : décor = juste sous le
  premier élément vivant ; page entière = au-dessus de tout.
- **En décor, le format est toujours celui de la page** (`formatEffectif`) : un
  décor carré ne tomberait plus sous les textes. Le calque **couvre** la page
  (`fit: 'cover'`) ; en page entière il est montré **entier** (`contain`), donc
  un carré sur une A4 laisse des marges.
- **Même porte, mêmes qualités, mêmes prix** : `retouche.php` reçoit deux champs
  facultatifs, `format` et `definition` — des identifiants, jamais des pixels
  (`RETOUCHE_FORMATS`, `RETOUCHE_MAX_SIDE_HAUTE`). Inconnus : 400
  `format_inconnu`, sans repli. Absents : les défauts, donc « Modifier par IA »
  n'a pas changé.
- **Durées par qualité ET par définition**
  (`pocketstick.embellir.durees.<qualité>.<définition>`) ; la jauge dit « Rendu
  de la page » puis « Envoi et embellissement ».
- La bibliothèque nomme l'image selon ce que l'IA en a fait : « (détourée) »,
  « (modifiée) », « (décor) », « (embellie) » — `ajouterGeneree({ suffixe })`.
  Avant, une image modifiée aurait été rangée sous « (détourée) ».

### Limites, à connaître

- **Le prix ne dépend pas de la définition** : à 2048 px le coût Runware des
  klein est d'environ ×1,8 **[extrapolé]**, toujours très sous le prix décompté.
- **La qualité Soignée ignore la définition et n'a que six formats** : elle rend
  le format connu le plus proche (un 9:16 revient en 2:3), autour de 1 Mpx.
- **2048 px sur une A4, c'est environ 175 dpi** : net pour une affiche vue à
  distance, pas pour de petits caractères — une raison de plus de préférer le
  mode décor, où les textes restent vectoriels.
- En décor, un élément de décor placé AU-DESSUS d'un texte reste au-dessus du
  nouveau calque : il apparaît deux fois (dans l'image et en vrai).
- `store/useLabelStore.js` portait des modifications non committées d'un autre
  chantier (ordre des calques) : le changement d'`addElement` est un bloc
  distinct, plus haut dans le fichier.

### Tests

`lib/embellir.test.ts` (18 cas), `retouche-test.php` (83, dont format et
définition), `retouche_routes_test.go` (`TestRetoucheFormatEtDefinition`).
**Non couvert** : `utils/renduPage.js` — pas de canvas sous Node.
