# Prompt de reprise — la galerie d'images des produits

**Écrit le 19 août 2026.** À donner tel quel à la session qui traitera la
galerie, laissée hors périmètre par les sessions précédentes.

---

Tu travailles dans `I:\pockapp`, module `frontend/modules/stock` (PocketApp :
Wails, Go + React/TypeScript, PocketBase embarqué). Lis d'abord `CLAUDE.md` à la
racine, puis le §6 septies de
[`00-rituel-migration-appstock.md`](00-rituel-migration-appstock.md), qui décrit
les deux briques d'image posées le 18 août 2026 — c'est sur elles que tu vas
bâtir.

## Le constat du propriétaire, vérifié

**La galerie ne s'affiche nulle part, et on ne peut pas y ajouter d'image.**
C'est exact, et ce n'est pas un défaut : elle n'a jamais été branchée. Chaque
session l'a explicitement écartée, en le disant sur place —
`CatalogProductDialog.tsx:16` : « `gallery` — plusieurs fichiers, écran à part :
hors périmètre. »

**Elle existe pourtant, et elle est pleine.** Mesuré le 19 août 2026 dans
`%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en lecture seule :

| Mesure | Valeur |
|---|---|
| produits | 2999 |
| **avec une galerie non vide** | **747** |
| champ au schéma | `gallery`, type FICHIER, **jusqu'à 10 fichiers** (`backend/migrations/catalog_v2.go`) |
| occurrences de `gallery` dans le front | **aucune**, hors commentaires |

Autrement dit : **747 galeries importées d'AppPos dorment dans le stockage sans
qu'aucun écran ne les montre**, exactement comme les 225 logos de marque avant
le 18 août.

## Où sont rangées les images — la réponse à la question posée

**Il n'y a qu'un seul rangement, et il ne distingue pas l'origine.** PocketBase
range tout fichier sous :

```
%LOCALAPPDATA%\PocketReact\pb_data\storage\<collectionId>\<idDuProduit>\<nomDeFichier>
```

Pour les produits, `<collectionId>` vaut **`71wy9ngwa1b87sk`** (mesuré dans
`_collections`). Un produit importé et un produit créé au comptoir sont donc
rangés **au même endroit, de la même façon** :

- **importés d'AppPos** — `backend/catalog/load/loader.go:46-137` copie le
  fichier depuis `%APPDATA%\AppPOS\data\public\…` dans le stockage **par l'API
  fichier de PocketBase**, pas à la main. C'est PocketBase qui choisit le
  chemin et suffixe le nom ;
- **créés dans PocketApp** — depuis le 18 août 2026, `ImageField`
  (`components/ui/image-field.tsx`) rend un `File`, et `buildWritePayload`
  (`lib/queries/image-upload.ts`) l'envoie en `FormData`. PocketBase le range
  au même endroit, avec le même suffixe aléatoire.

**La preuve tient dans le nom du fichier.** Exemple lu en base pour le produit
`g1ay91ag40idofd` :

```
storage/71wy9ngwa1b87sk/g1ay91ag40idofd/
  photos_1738085313239_169056059_UgS5i46zUc.jpg          ← image principale
  guitare_..._1774540564549_CYTNGjOEVz.jpg               ← galerie
  guitare_..._1774540568885_0SNbZBzcfP.jpg               ← galerie
  (+ un .attrs par fichier)
```

Le suffixe (`_UgS5i46zUc`) est posé par PocketBase à l'enregistrement, quelle
que soit la provenance. **Il n'y a donc rien à « ranger ailleurs » pour les
nouveaux produits** : la question ne se pose pas, et l'URL se construit dans les
deux cas par `pb.files.getUrl(record, nomDuFichier)`.

⚠️ **Le corollaire, à connaître avant de toucher au champ :** `image` et
`gallery` partagent le même dossier. Une suppression maladroite — envoyer une
liste de galerie incomplète — retire des fichiers **sans confirmation**.

## Ta mission

**Afficher la galerie, et permettre de la composer.** Trois pièces, dans cet
ordre de risque croissant :

1. **L'afficher.** `PRODUCT_FIELDS` (`lib/queries/catalog-products.ts:79`) **ne
   demande pas `gallery`** : commence par là, sinon tu chercheras longtemps un
   champ vide. Puis une vignette-liste dans le dialogue produit, et le choix de
   ce que la table montre — probablement rien de plus qu'aujourd'hui ;
2. **Y ajouter des images.** `ImageField` gère **un** fichier. La galerie en
   porte jusqu'à dix : c'est un composant frère à écrire, pas une option à
   ajouter — ou bien `ImageField` devient multiple, et tu le prouves sur ses
   deux appelants existants (marque, catégorie) avant de le déclarer bon ;
3. **En retirer, et les réordonner.** C'est la partie délicate : PocketBase
   remplace la liste entière à chaque écriture. **La règle des trois posées le
   18 août tient toujours** — un fichier ne passe que par `FormData`, un champ
   vidé part en chaîne vide, et ne rien dire du champ le laisse en place — mais
   `buildWritePayload` ne connaît que `image`, **au singulier**. Étends-le, avec
   ses tests : il en a huit.

## Ce qui est décidé, et ne se rediscute pas

- **les images sont servies par PocketBase**, par `pb.files.getUrl` : jamais une
  URL AppPos, jamais un chemin construit à la main ;
- **la source est explicite au point d'appel, et typée** ;
- **les composants convergent** : une session qui ajoute un composant sans en
  retirer un a échoué — le module a perdu 12 fichiers en six jours ;
- **`legacy_id` est la clé stable**, générée par la couche pour toute entité
  créée ici ;
- **le slug ne s'édite nulle part** : figé au premier envoi, le serveur en est
  gardien.

## Les pièges déjà payés — ne pas les rejouer

- **un champ absent de `fields` revient vide, sans erreur.** C'est la première
  chose à vérifier quand une donnée « n'existe pas » ;
- **`getList(1, 50)` est une page, pas une liste** — ce défaut a donné « 0
  produit » sur 205 marques ;
- **`error.message` de PocketBase ne dit rien** : utilise
  `lib/queries/pb-error.ts`, qui nomme le champ refusé ;
- **une chaîne vide dans `<img src>` recharge la page courante.** `toStockRow`
  rend `null`, et un test le garde ;
- **`pocketbase-types.ts` ment** sur `brands`, `categories` et `suppliers`, et
  `pnpm typegen` reste interdit.

## Ce que tu ne dois pas faire

- **ne pas toucher au site.** L'export vers axemusique.shop **ne porte aucun
  champ image** — c'est le §7 du contrat catalogue, et il a sa propre session
  (`frontend/modules/site/PocketSite-docs/13-prompt-images-site.md`). Une
  galerie affichée dans PocketApp ne change rien au site ;
- **ne pas modifier AppPos** ;
- **ne pas relancer `catalog-import -load`** pour « retrouver » des images :
  depuis le 19 août 2026, `backend/catalog/load/guard.go` refuse la purge, et
  `-force-purge` détruirait ventes, comptages et documents.

## La règle, tranchée par le propriétaire le 19 août 2026

**Une image ne se perd pas, et la principale se désigne.**

1. **Remplacer l'image principale ne la détruit pas : l'ancienne rejoint la
   galerie.** Le geste courant est « celle-ci sera meilleure en vitrine », pas
   « supprime l'autre ». Supprimer reste possible, mais c'est un geste distinct,
   explicite ;
2. **N'importe quelle image de la galerie peut être promue principale.** C'est
   la même opération vue de l'autre côté : promouvoir B rétrograde A dans la
   galerie. Aucun fichier ne bouge sur le disque — seuls les deux champs
   changent, `image` et `gallery` vivant déjà dans le même dossier ;
3. **L'ordre de la galerie est une donnée**, pas un hasard de tri : c'est lui
   qui décidera de l'ordre des vignettes sur le site.

⚠️ **Le piège de cette règle** : promouvoir revient à écrire `image` ET
`gallery` dans la même requête. `buildWritePayload` envoie alors un `FormData`
qui doit porter **la liste complète** de la nouvelle galerie — en oublier une
entrée supprime le fichier correspondant, sans confirmation. Écris le test
avant le code.

Cette règle mérite d'être consignée : elle est dans `docs/DECISIONS.md`,
« L'image principale se désigne, elle ne s'écrase pas » (2026-08-19).

## Ce que la session suivante attendra de toi

**La synchronisation des images vers axemusique.shop est une autre session**, et
elle a son prompt :
[`../../site/PocketSite-docs/13-prompt-images-site.md`](../../site/PocketSite-docs/13-prompt-images-site.md).
Elle ne peut pas commencer avant la tienne, pour une raison simple : **le site
doit savoir quelle image est la principale et dans quel ordre viennent les
autres**, et cette information n'existe qu'une fois ton travail fait.

Deux points à ne pas casser pour elle :

- **`legacy_id` est la clé de l'export**, jamais l'identifiant PocketBase. Une
  image se rattachera à un produit par sa clé stable ;
- **le schéma distant (`server/sql/schema.sql`) n'a AUCUNE colonne d'image** —
  ni sur `ax_products`, ni ailleurs. Ce n'est pas un oubli : le §7 du contrat
  catalogue l'interdit tant que le transfert n'est pas conçu. **Tu n'as donc
  rien à y ajouter** ; contente-toi de rendre l'information disponible et
  ordonnée côté PocketBase.

## Contraintes de travail

- Français partout.
- `npx tsc -b`, `pnpm biome check --write` **sur les fichiers que tu touches** —
  viser un répertoire reformate tout le module et rend le diff illisible ;
  `pnpm test`.
- **Écris un test pour toute règle qui n'a pas d'autre gardien.**
- **Distingue ce qui est lu dans le code — chemin et ligne — de ce qui est
  rapporté.** Mesure avant d'affirmer, et dis sur quelle base.
- **Vérifie dans l'application ou dans la base**, pas en relisant ton code. La
  base est lisible en SQLite, en `-readonly`, et le stockage se liste au
  `ls` — c'est ainsi qu'a été établi le tableau ci-dessus.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Écris un résumé bref — ce que tu as lu, l'état que tu constates, ce que tu
comptes faire et dans quel ordre — puis **arrête-toi**. Ne modifie rien avant
validation.
