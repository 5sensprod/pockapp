# 13 — Performance de l'onglet Images (5 octobre 2026)

Symptôme : les images se rechargent à chaque retour sur le menu « Images ».

## Audit

| Cause | Coût | Correctif | Risque |
|---|---|---|---|
| `ToolsSidebar.jsx` ne monte que l'outil sélectionné (`SelectedComponent`) : chaque retour sur « Images » — ou la sélection d'un élément, qui met `ReglagesPanel` à la place — **remonte tout**. `OngletsPanneau` garde bien ses onglets montés, mais seulement tant que le panneau l'est | 2 `UploadTemplate` remontés (Mes images, Génération) | Cache dans le service, grille qui part de lui | faible |
| `UploadTemplate` relit toute la bibliothèque à chaque montage et passe par « chargement » (grille vidée) | **133 Mio relus, ≈ 110 ms** pour 50 images de 2 Mio — **deux fois**, une par sous-onglet : ≈ 266 Mio. Plancher : IndexedDB factice en mémoire, le vrai disque coûte plus | Liste en cache, pas d'état « chargement » quand il est chaud | faible |
| Les originales (data URL) servent d'aperçu : chaque `<img>` de 80 px décode l'image pleine taille | 50 décodages de 2 Mio (estimé, non mesurable sous Node) | Vignette 256 px WebP, magasin `vignettes` | moyen : migration IndexedDB |
| PocketStock : logos et images de catégories par `pb.files.getUrl` sans `thumb` | non mesuré ; TanStack Query déjà chaud (`staleTime` 5 min, clés persistées), `loading="lazy"` déjà là | **Écarté** — voir « Ce qui reste » | — |

## Ce qui a été fait

- **Magasin `vignettes`** (IndexedDB v2, `services/presetImageService.js`) à côté de `images` : métadonnées de la grille + vignette. La montée de version crée le magasin s'il manque et ne touche à aucun enregistrement : rejouable. Testé sur une base v1.
- **Vignette** (`utils/vignetteImage.js`) : 256 px au plus, WebP (JPEG si WebP indisponible), fabriquée à l'import et au rangement d'une image générée ; son échec n'empêche ni l'un ni l'autre.
- **Cache en mémoire** dans le service, seul écrivain de la bibliothèque : import, suppression et image rangée le tiennent à jour et préviennent les abonnés (`abonner`). `UploadTemplate` démarre sur `lireCache` : au retour, grille immédiate, zéro lecture. « Actualiser » force une relecture.
- **Anciennes images** : la première liste lit l'originale des seules images sans vignette (affichées telles quelles), puis `rattraper` fabrique les vignettes une à une en arrière-plan. Jamais d'écriture dans `images` ; une image qui ne se décode pas n'est pas retentée dans la session.
- **Clic** : la grille ne porte que la vignette ; l'originale est lue par `getImageInfo` au clic et posée comme avant (même `src`, noms, ordre).
- `decoding="async"` sur `Vignette` (`loading="lazy"` y était).

## Avant / après (50 images de 2 Mio, IndexedDB factice)

| | Avant | Après |
|---|---|---|
| Liste à froid | 133 Mio lus, ≈ 110 ms | 0,72 Mio lus, ≈ 1 ms |
| Retour sur le menu | idem, ×2 sous-onglets | 0 lecture |
| Poids affiché par la grille | 50 × 2 Mio décodés | 50 × ≤ 256 px |

Gardien : `services/presetImageService.vignettes.test.js`. L'IndexedDB factice sait désormais plusieurs magasins, les versions, `getAllKeys` et compte les octets lus.

## Ce qui reste

- **Non vérifié en navigateur** : fabrication réelle (canvas, WebP), temps de rattrapage d'une vraie bibliothèque, ressenti. Les mesures sont celles d'un IndexedDB en mémoire.
- **Une base ancienne coûte une fois** la lecture de ses originales (une à une) au premier affichage, puis plus.
- **PocketStock** : le schéma des champs `image` / `logo` n'a pas de `thumbs`, donc PocketBase ignorerait `?thumb=`. En ajouter passe par une nouvelle migration (les `ensure*` ne mettent pas à jour une base installée) : à décider à part.
- Les vignettes orphelines (écriture interrompue) sont ignorées par la liste mais jamais effacées.
