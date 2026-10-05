# 14 — Reprise de la retouche par IA : état

*5 octobre 2026. **Écrit et testé (`reprise-retouche.test.ts`, 556 tests du module
stick), lancé dans l'application par le propriétaire : ça fonctionne.** Le mini-SaaS
n'est pas touché : aucun champ ni route ne s'ajoute au contrat.*

Six décisions du propriétaire, toutes retenues sauf le point 4 (rien à ajouter) et
le point 6 (garder « remplace, Ctrl+Z rend »). Tout passe par le trajet unique
`lancerTraitement` : une `TacheIA` gagne `memoire` et `depart`, `poser` reçoit la
mémoire en troisième argument.

## 1. Mémoire de la consigne

`MemoireIA` (`lib/detourage.ts`) : `tache`, `consigne`, `qualite`, `format` et
`definition` si la tâche en a, `rangee` (le nom de l'image dans « Génération »).

| Où | Quoi |
|---|---|
| `el.ia` | écrit AVEC `src`, dans le même pas d'historique (retouche, composition, embellissement) ; une génération la porte quand on la pose depuis « Génération » |
| « Génération » (IndexedDB) | `ia` sur l'image rangée, et `departSrc` (l'image d'AVANT) pour une retouche |
| Grille de la bibliothèque | `ia` seulement, jamais `departSrc` ; la consigne est dans l'infobulle de la vignette |

- **La consigne est un texte du vendeur écrit sur le poste** : dans le template
  (IndexedDB) et dans la bibliothèque. Elle ne part qu'avec la requête ; les
  templates n'ont aucun stockage serveur (`templateApiService` est inerte).
- **Un `.json` exporté le dit** : `contientConsignesIA` (toujours présent) et, s'il
  est vrai, `noteConsignesIA` (`templateService.exportTemplate`). L'import les
  écarte. La consigne n'est pas retirée de l'export : c'est le fichier qui prévient.
- **`lancerRetouche` n'écrit que `src`, comme avant** (un test existant le garde) ;
  la mémoire est activée par `memoriser`, que passent `lancerRetoucheSuivie` (le
  bouton) et « Refaire ».
- Une image de plus de ~3 Mo de texte ne garde pas son départ
  (`DEPART_MAX_CARACTERES`) : mieux vaut un résultat rangé sans départ qu'un
  rangement refusé par le quota. « Refaire » n'est alors pas proposé.

## 2. Refaire

`lib/refaire.ts`. Même consigne, même qualité, un nouveau tirage ; **le résultat
remplace la `src`** (Ctrl+Z rend l'ancien, qui reste rangé). Un clic, un tirage
facturé au prix plein, aucun prix affiché, aucun second essai automatique.

- `retouche` : repart du **départ** gardé, jamais du résultat (retoucher une
  retouche dérive). Départ perdu : refusé et dit, rien ne part.
- `generation` : un texte seul, rien à retrouver.
- **Pas pour une composition ni un embellissement** — leurs ingrédients ne sont
  pas gardés — ni pour une retouche de forme seule (voir §3) : « Reprendre la
  consigne » reste proposé.
- `el.ia` d'un `.json` importé n'est pas digne de confiance : qualité, format et
  définition sont revalidés, la consigne repasse par les refus habituels.
- ⚠️ « Refaire » après « Détourer ensuite » repart de l'original : la transparence
  est perdue, il faut détourer de nouveau.

## 3. Une forme ou un dessin seul

`lib/retouche-seul.ts`, `templates/RetoucherElement.jsx`. Rendu seul
(`rendreElement`, qui rend maintenant le cadre par `surZone`), même porte, même
trajet. **Le résultat est un NOUVEAU calque image juste au-dessus de l'élément**,
au cadre rendu, montré entier ; l'élément reste dessous, intact. Un pas
d'historique. Jamais en planche. Le rendu n'est pas gardé : pas de « Refaire ».

## 4. Ajouter un ingrédient à une image générée

Rien de dédié : sélection multiple + « Composer » suffit.

## 5. Détourer ensuite

Interrupteur décoché au départ (`DetournerEnsuite`, `useReglagesRetouche.detourerEnsuite`),
sur « Modifier par IA » d'une image **et** d'une forme. Si la retouche a posé son
image, `detourerApres` lance un détourage sur ce même élément : **deux requêtes,
deux facturations, deux pas d'historique**. Pas de détourage si la retouche a
échoué ou n'a pas pu poser. Un échec du détourage ne défait pas la retouche.

## 6. Avant / après

Écarté : « remplace, Ctrl+Z rend » ; l'image retouchée est déjà rangée.

## Où

| Quoi | Où |
|---|---|
| Bloc « Reprendre la consigne » / « Refaire » (toute image portant `el.ia`) | `ReglagesImage.jsx`, `MemoireImage`, sous « Modifier par IA » |
| « Modifier par IA » d'une forme ou d'un dessin | `RetoucherElement.jsx`, monté par `ReglagesPanel.jsx` |
| Mémoire rangée / départ lu à la demande | `presetImageService` (`ajouterGeneree`, `lireDepart`) |

## Ce qui n'a pas pu être vérifié

- **L'interface a été lancée et fonctionne** (constat du propriétaire, 5 octobre
  2026) ; le détail clair / sombre n'est pas consigné. `rendreElement` avec
  `surZone` n'a pas de test (pas de canvas sous Node).
- Le cadre exact du calque d'une forme tournée ou ombrée : il suit
  `getClientRect`, 2 px de marge, borné à la page.
- `exportTemplate` (téléchargement navigateur) : non testé, seule sa logique est lue.
- Aucun appel réel : un tirage Runware et l'enchaînement retouche → détourage.
