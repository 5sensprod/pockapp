# Les tâches éditoriales : ce qu'on attend, et ce qu'elles coûtent

État au 4 septembre 2026. Écrit pour préparer **une grille tarifaire** et le
choix des **API de repli** quand le niveau gratuit de Google est épuisé.

Ce document dit deux choses, et rien d'autre : ce qu'on demande à l'agent pour
chaque tâche (donc le degré d'intelligence nécessaire), et ce que cette tâche
coûte en jetons aujourd'hui.

---

## 0. D'où viennent les chiffres

| Nature | Source |
|---|---|
| Instructions système, prompts, plafonds de sortie | **Lus dans `backend/routes/gemini_routes.go`** et comptés caractère par caractère |
| Conversion caractères → jetons | Doc Google : ~4 caractères par jeton. Le français accentué est plus dense : les estimations ci-dessous utilisent **3,7** |
| Images | Doc Google : **258 jetons** si ≤ 384 px, sinon 258 par tuile de 768×768 |
| Jetons réellement consommés | **`usageMetadata` de chaque réponse**, déjà remonté à `usage.php` par PocketApp (`reportPocketAppUsage`) |

⚠️ **Les plafonds ne sont pas des consommations.** `maxOutputTokens` borne la
sortie ; le modèle rend en général la moitié. Et une chose n'est PAS mesurable
depuis le code : **ce que le grounding injecte dans le prompt**. Google renvoie
des extraits de pages qui entrent dans les jetons d'entrée facturés, en volume
variable. **Seul `usage.php` connaît le vrai chiffre** — c'est lui qui doit
fonder la grille, pas ce document.

---

## 1. Les cinq tâches

### T1 — Proposer un titre de fiche

*Route* `/api/ai/product-title` · *modèle* `gemini-3.1-flash-lite` · sans
recherche.

**Ce qu'on attend** : reformuler un nom existant en un titre lisible de 70
caractères maximum, en conservant marques, modèles et références à l'identique,
sans rien inventer.

**Intelligence requise : faible.** Aucune connaissance du monde n'est
nécessaire — la matière est fournie. Ce qui est exigé est du respect de
contrainte : longueur, aucune invention, pas de superlatif, JSON en sortie.
Un petit modèle instruit fait l'affaire ; le critère de choix est la
**fidélité**, pas la culture.

| Poste | Jetons |
|---|---|
| Instruction système | ~195 |
| Contexte produit (nom, désignation, SKU, marque, catégories) | ~60 à 150 |
| Description actuelle, tronquée à 1 500 signes | 0 à ~405 |
| **Entrée totale** | **~300 à 750** |
| **Sortie** | **≤ 120** (plafond) |

---

### T2 — Fiche COURTE

*Route* `/api/ai/product-sheet`, `descriptionFormat: "short"`.

**Ce qu'on attend** : deux ou trois phrases factuelles. Aucune section, aucune
liste, aucun tableau, aucun conseil.

**Intelligence requise : faible à moyenne.** L'exercice est la retenue : ne
pas dépasser, ne pas meubler, n'affirmer que ce qui est sourcé.

| Poste | Jetons |
|---|---|
| Instruction système | ~346 |
| Contexte produit + description actuelle | ~60 à 555 |
| Consigne de format | ~59 |
| Consigne de source (web ~122, documents ~30) | ~30 à 122 |
| **Entrée hors sources** | **~500 à 1 080** |
| **Sortie** | **≤ 350** (plafond) |

---

### T3 — Fiche DÉTAILLÉE

*Même route*, `descriptionFormat: "detailed"`.

**Ce qu'on attend** : introduction, paragraphe d'usage, jusqu'à 6 points forts,
jusqu'à 10 caractéristiques `nom/valeur`, conseils — le tout en JSON strict, et
**sans jamais compléter une caractéristique manquante**. C'est la règle la plus
difficile à tenir : un modèle veut remplir un tableau.

**Intelligence requise : moyenne.** Extraction + structuration + refus de
combler les trous. C'est de la fidélité sous contrainte de forme, pas du
raisonnement.

| Poste | Jetons |
|---|---|
| Entrée, hors sources | **~520 à 1 100** (comme T2, consigne de format ~74) |
| **Sortie** | **≤ 1 400** (documents) · **≤ 2 400** (web) |

---

### T4 — Les deux sources, et ce qu'elles ajoutent

Le mode change le modèle, le coût et le fournisseur de repli. C'est la
distinction structurante de la grille.

#### T4a — « Mes documents » — `gemini-3.1-flash-lite`

**Ce qu'on attend** : lire un PDF ou une photo de notice et n'en tirer que ce
qui y est écrit. **Multimodalité obligatoire.**

| Poste | Jetons |
|---|---|
| Texte collé, plafonné à 12 000 signes | 0 à **~3 240** |
| Fichiers : 3 au maximum, 2 Mio chacun | 258 par image ou par page de PDF — **une notice de 8 pages ≈ 2 064** |
| **Entrée typique (1 PDF de 8 pages, sans texte collé)** | **~2 600 à 3 200** |
| **Entrée maximale plausible** | **~10 000** |

**Aucun appel au grounding** : cette voie ne consomme pas le quota de 500
recherches par jour. C'est l'issue quand il est épuisé.

#### T4b — « Le web » — `gemini-2.5-flash-lite` + Google Search

**Ce qu'on attend** : trouver le bon article, puis n'écrire que ce qui a été
lu. Le facteur limitant **n'est pas l'intelligence du modèle, c'est la qualité
de la recherche** — d'où le GTIN placé en tête de requête.

- entrée propre au prompt : identique à T2/T3 ;
- **plus les extraits injectés par Google**, non mesurables ici, et de loin le
  premier poste ;
- **plus une requête groundée** : 500/jour offertes au niveau gratuit
  (partagées entre Flash et Flash-Lite), puis **35 $ / 1 000** au niveau payant.

⚠️ Ce modèle **n'accepte pas le schéma de sortie avec l'outil de recherche** :
le JSON est exigé par le prompt, d'où un plafond de sortie plus large
(2 400 contre 1 400) — de la marge, pas de la consommation.

---

### T5 — Chercher des photos

*Route* `/api/ai/product-images` · `gemini-2.5-flash-lite` + Google Search.

**Ce qu'on attend** : jusqu'à 6 adresses d'images du produit, avec leur page
d'origine. Rien n'est téléchargé.

**Intelligence requise : faible — et le LLM est le mauvais outil.** Une URL
d'image est ce qu'un modèle invente le mieux. Le vrai besoin est un **index
d'images** (Bing Image Search, Brave, SerpAPI), pas un modèle plus intelligent.
C'est la tâche qu'il faut **sortir du LLM en priorité** au moment du repli.

| Poste | Jetons |
|---|---|
| Instruction système | ~155 |
| Contexte + consigne | ~150 à 250 |
| **Entrée hors sources** | **~300 à 400** |
| **Sortie** | **≤ 1 200** (plafond) |

**Consomme le même quota de 500 recherches/jour que T4b.** C'est ce qui a
épuisé le quota le 4 septembre 2026.

---

## 2. Coût d'une fiche complète, aujourd'hui

Une fiche « bien faite » au comptoir, c'est rarement un seul appel :

| Geste | Appels | Entrée hors sources | Sortie (plafond) |
|---|---|---|---|
| Titre proposé | 1 × T1 | ~300–750 | ≤ 120 |
| Fiche détaillée depuis le web | 1 × T3/T4b | ~600–1 100 **+ extraits Google** | ≤ 2 400 |
| Deux sections réécrites | 2 × T3 | 2 × (~600–1 100 **+ extraits**) | 2 × ≤ 2 400 |
| Recherche de photos | 1 × T5 | ~400 **+ extraits** | ≤ 1 200 |
| **Total** | **5 appels**, dont **4 groundés** | | |

⚠️ **Le poste le plus cher n'est pas dans ce tableau.** Régénérer une section
**coûte une fiche entière** : `/api/ai/product-sheet` ne sait produire qu'une
fiche complète, dont on ne retient qu'un bloc (`blocCorrespondant`). Une route
« une seule section » diviserait ce poste par trois ou quatre — c'est
l'optimisation la plus rentable du lot, et elle n'est pas écrite.

Et : **4 des 5 appels consomment le quota de recherche**. À 500 par jour, cela
plafonne autour de **125 fiches par jour** dans ce scénario — bien avant toute
limite de jetons.

---

## 3. Ce qu'un repli doit savoir faire, tâche par tâche

| Tâche | Besoin réel | Ce qu'un repli doit avoir | Peut descendre en gamme ? |
|---|---|---|---|
| T1 titre | Reformuler sous contrainte | Sortie JSON fiable | **Oui**, franchement |
| T2 fiche courte | Résumer sans broder | Sortie JSON fiable | **Oui** |
| T3 fiche détaillée | Structurer sans combler les trous | Schéma de sortie **respecté**, bonne tenue en français | **Prudemment** — c'est ici que l'invention coûte cher : la page est publique |
| T4a documents | **Lire un PDF / une image** | **Multimodal**, 10 000 jetons d'entrée | Non : la multimodalité n'est pas négociable |
| T4b web | **Chercher**, puis rédiger | Un accès recherche (natif ou API séparée) | Le modèle oui, la recherche non |
| T5 photos | **Un index d'images** | Une API d'images, pas un LLM | **À sortir du LLM** |

Deux conséquences pour la suite :

1. **Séparer la recherche du modèle.** Aujourd'hui les deux sont liés parce que
   Gemini fait les deux. Un repli sérieux les découple : une API de recherche
   d'un côté, un modèle bon marché de l'autre, à qui on donne les extraits.
2. **Le quota qui saute en premier est celui des recherches, pas des jetons.**
   Une grille tarifaire qui ne compte que les jetons se trompera de contrainte.

---

## 4. Prompt pour l'agent qui construira la grille

> Tu construis la grille tarifaire de l'assistant éditorial de PocketApp.
>
> **Les faits à ne pas re-deviner** sont dans
> `frontend/modules/site/PocketSite-docs/19-cout-taches-editoriales.md` : cinq
> tâches (titre, fiche courte, fiche détaillée, source documents, source web,
> recherche de photos), leurs plafonds de sortie, leur entrée déterministe
> mesurée dans `backend/routes/gemini_routes.go`, et le degré d'intelligence
> attendu de chacune.
>
> **Ta première source de chiffres est `usage.php`**, sur
> `pocketapp.5sensprod.com` : PocketApp y déclare déjà les jetons réels de
> chaque appel (`reportPocketAppUsage`), étiquetés `product title`,
> `product sheet documents`, `product sheet web` et `product images web`.
> Pars des mesures, pas des estimations — en particulier pour le mode web, dont
> l'entrée dépend de ce que Google injecte et qu'aucune lecture de code ne peut
> donner.
>
> **Deux contraintes à modéliser séparément** : les jetons, et les **500
> requêtes groundées par jour** du niveau gratuit (35 $ / 1 000 ensuite,
> partagées entre toutes les recherches du projet, photos comprises). C'est la
> seconde qui sature en premier.
>
> **Livrable attendu** : un coût par fiche selon le chemin choisi (courte/
> détaillée × web/documents), le point de bascule où le niveau gratuit ne suffit
> plus, et pour chaque tâche un fournisseur de repli avec son prix — en
> distinguant ce qui a besoin d'un modèle multimodal (T4a), ce qui a besoin d'un
> accès recherche (T4b), et ce qui devrait sortir du LLM (T5).
>
> Ne propose pas de réduire la qualité de T3 pour économiser : la page est
> publique et l'invention y coûte plus cher qu'un jeton.
