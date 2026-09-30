# Contour vectoriel des lettres — étude et mesures (30 septembre 2026)

Lot 3 de [`06-reprise-ui.md`](06-reprise-ui.md). Décisions prises : voie B
(le Go sert les TTF), `opentype.js`, mesurer avant de s'engager. **Branché
dans l'éditeur le 30 septembre 2026** : menu « Contour stylisé → Contour à
main levée » d'un texte (voir « Implémentation » en fin de fichier).

## Principe retenu : ne pas refaire la mise en page

Konva garde la mise en page — lignes (`textArr`), alignement, justification,
interlettrage, courbure (`texteCourbe.js`). La position de chaque lettre vient
d'une mesure du canvas faite comme Konva la fait ; la police ne fournit que le
**dessin** de chaque lettre. Règle : `utils/contourLettres.js`.

Piège trouvé à la mesure : une lettre se place à **la largeur du texte qui la
contient, moins la sienne** — pas à la largeur de ce qui la précède, qui
oublie l'approche entre elle et la lettre d'avant (« AV », « VA »). Arial
40 px : écart moyen 0,385 px avant, 0,076 px après.

## Ce qui existe

| Pièce | Où |
|---|---|
| Fichiers TTF (système : `%WINDIR%\Fonts` ; Google : téléchargés une fois, gardés dans `pb_data/polices/`) | `backend/polices/polices.go`, `GET /api/fonts/file` (`backend/routes/polices_routes.go`) — point 9 de CLAUDE.md |
| Chargement opentype.js, à la demande | `labels/utils/policesVectorielles.js` |
| Position des lettres, chemins, comparaison de masques | `labels/utils/contourLettres.js` (+ tests) |
| Outil de mesure, **dev seulement** | `labels/utils/mesureContourLettres.js` — `await __mesureContourLettres()` dans la console de `/stick` |

`opentype.js` 2.0.0 : 245 Ko minifié, **67 Ko gzip** (mesuré sur le fichier).
Google sert du TTF à l'agent `PocketApp/1.0 (polices)` (constaté par `curl`).

## Mesures (navigateur du panneau, dev, 30/09/2026)

Écart moyen = épaisseur moyenne de la bande où le dessin natif et le dessin
calculé diffèrent, en pixels du document, rastérisé à 4 px par unité. L'IoU
est sévère sur les petits corps : l'écart moyen est le chiffre qui compte.

| Texte | Police | IoU | Écart moyen (px) |
|---|---|---|---|
| Guitare électrique AVANTAGE | Arial 40 | 0,956 | 0,076 |
| PROMO -30 % | Roboto gras 56 | 0,987 | 0,046 |
| 1 299,00 € | Anton 72 | 0,985 | 0,095 |
| SOLDES | Bebas Neue gras 64 (**gras fabriqué**, ép. 2,13 = taille/30) | 0,980 | 0,087 |
| Élégance et finesse | Playfair italique 44 (**italique fabriqué**, pente 0,25) | 0,969 | 0,042 |
| ESPACEMENT LARGE | Montserrat 30, interlettrage 8 | 0,944 | 0,062 |
| Corps en épicéa… (justifié, 3 lignes) | Open Sans 16 | 0,905 | 0,062 |
| Le spécialiste musique (courbe 40, centré) | Lobster 36 | 0,958 | 0,092 |
| Réf. CDP-110 · EAN… | Segoe UI 14 | 0,909 | 0,054 |
| Aligné à droite (2 lignes) | Merriweather 24 | 0,973 | 0,028 |
| WAVE Tempo Yoga | Times New Roman 40 | 0,976 | 0,031 |
| Nouveauté | Pacifico 40 | 0,945 | **0,144** |
| fi fl office | Lato 40 | 0,876 | **0,215** — ligatures |
| Gras et italique | Arial gras italique 36 | 0,743 | **0,638** |

Catalogue entier (72 familles × 2 graisses, 148 couples) — largeur de chaque
lettre d'un échantillon, navigateur contre TTF servi, à 100 px :
**129 identiques** (≤ 0,05 px), 11 à 0,1–0,9 px (arrondis, négligeables), et
**4 familles réellement divergentes** :

- **Pacifico, Lobster** : le navigateur reçoit une AUTRE version du fichier
  (WOFF2 servi aux navigateurs ≠ TTF servi aux autres agents) — jusqu'à 4 et
  6,6 px de largeur sur une lettre.
- **Arvo, Squada One** : pas de « € » dans le fichier ; le navigateur le prend
  dans une police de repli, nous dessinerions le glyphe vide.

Coût : position + chemins de 306 lettres (14 textes) = **1,4 ms**, sans
perfect-freehand (non mesuré, il vient après).

## Écarts connus et leur remède

1. **Italique d'une police SYSTÈME** : Windows a un vrai fichier italique
   (`arialbi.ttf`…), le navigateur l'utilise ; la route ne sert que le droit.
   Remède : servir `ital` pour les polices système. (Les polices Google, elles,
   ne sont chargées qu'en 400/700 : italique fabriqué, pente 0,25 mesurée.)
2. **Gras fabriqué** (famille sans 700, signalé par `X-Font-Weight`) :
   épaississement de taille/30 mesuré sur Bebas Neue.
3. **Ligatures** (« fi », « fl », « ffi ») : le navigateur les forme sans
   interlettrage ; nous dessinons les lettres séparées. Écart de forme, pas de
   position.
4. **Glyphe absent** (`glyph.index === 0`) : retomber sur le contour Konva
   pour cette lettre, ou ne rien dessiner — à décider.
5. **Pacifico, Lobster** : version différente. Remède possible : obtenir le
   même fichier que le navigateur — le WOFF2 — ce qui ramène le décompresseur
   écarté par la voie B ; ou accepter l'écart sur ces deux familles.

## Pièges de l'outil (corrigés)

- Deux canevas de même cadre n'ont pas forcément la même largeur au pixel :
  Konva arrondit à sa façon. Comparés à des largeurs différentes, les masques
  se décalent d'un pixel par ligne (IoU 0,14 sur un texte pourtant juste).
- Recharger la page efface la session PocketBase (`main.tsx`) ; et modifier un
  module que Vite ne sait pas remplacer à chaud recharge la page.

## Implémentation (30 septembre 2026)

- **Menu** : le même `MenuContourStylise` que les formes, avec `texte` —
  sans effilements (sur un contour fermé, ils amincissent le trait n'importe
  où dans la lettre), et « Densité des ondes » : les ondes d'un contour sont
  proportionnelles à sa longueur rapportée à la taille de police
  (`ondesDuContour`), un « i » et un « W » ondulent au même rythme.
- **Moteur** : `styliserContour`, extrait de `contourStylise.js` et partagé
  avec les formes. Un trait par contour de lettre, trous compris.
- **Rendu** : `utils/texteContourStylise.js`, une `sceneFunc` posée sur le
  MÊME `Konva.Text` (comme le texte courbé) — trait stylisé, puis contour
  ordinaire des lettres absentes, puis remplissage natif. Une seule ombre, de
  la silhouette (`utils/ombreSilhouette.js`, partagé avec les formes). Même
  règle à l'écran (`TextNode`) et à l'export planche (`exportPdfSheet.js`,
  police chargée avant le dessin). `installerContourLettres` pose le cadre réel
  avant la mise en cache des effets.
- **Repli** : tant que la police n'est pas chargée, ou si elle ne peut pas
  l'être (hors ligne), le contour Konva ordinaire reste. `contourStyle` absent
  = rien ne change.
- **Remèdes appliqués** : vrai fichier italique des polices système
  (`X-Font-Italic`) ; italique fabriqué = pente 0,25 ; gras fabriqué =
  épaisseur + taille/30 ; lettre absente = contour ordinaire. Pacifico et
  Lobster : écart ACCEPTÉ (autre version du fichier chez le navigateur).
- **Texture de contour** : un motif sans répétition, calé désormais sur le
  cadre RÉEL du trait stylisé (`degradeCanvas2D(…, cadre)`) — calé sur le cadre
  de la forme, il s'arrêtait là où le trait ondulé débordait. Formes et lettres.

Le même jour, hors lot : une forme redimensionnée enregistre sa nouvelle
**taille** et une échelle de 1 (`handleTransformEnd`, `KonvaCanvas.jsx`).
Garder l'échelle étirait épaisseur de contour, texture et contour stylisé.
