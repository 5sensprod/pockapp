# Travail dans AppPos — lever les 33 SKU en double

**Généré le 24 août 2026.** Ces 33 SKU bloquent la reprise du catalogue :
deux fiches réclament la même clé stable, donc le même dossier d'images sur
le site. `catalog-reprise` refuse tant qu'il en reste un.

⚠️ **On travaille dans AppPos, jamais depuis PocketApp** — PocketApp lit
AppPos, l'inverse n'existe pas. Une fois fini, je régénère les clés et
relance la simulation.

---

## A. Sept SKU à CORRIGER — ce ne sont pas des doublons

Les deux fiches sont de vrais articles différents qui partagent un SKU par
erreur. **Ne rien supprimer** : donner un SKU distinct à l'une des deux.

### `210/20` — deux TONALITÉS différentes : A mineur et E mineur
- «Penta Harp A Mineur» — 49.9 €, stock 0, published  `Tr7NXt6lwQF0bpu7`
- «Penta Harp E Mineur» — 49.9 €, stock 0, published  `VEvgsVI53Tkcbqoq`

### `730525` — la première fiche se nomme 730595 — une AUTRE référence Gewa
- «730595» — 20.9 €, stock 0, published  `bKRLZd0agFG1IllP`
- «730525» — 19 €, stock 1, published  `lLJbEA7ojWxBjptB`

### `PWGS-SM` — trois fiches, dont « taille Large » ET « taille médium »
- «Daddario Glass Slide : Son Clair & Expressif (Copie)» — 9.9 €, stock 1, published  `qc73OzNKUIjJpU8M`
- «Bottleneck verre D'Addario taille Large» — 12.9 €, stock 0, draft  `O2nrValqmHnifs9C`
- «Bottleneck verre D'Addario taille médium» — 12.9 €, stock 1, published  `SveAeJQOLH1E4Vcd`

### `PWGS-SS` — « taille Small » et un « Bottleneck D'Addario » sans taille
- «Daddario Glass Slide : Son Clair & Expressif» — 9.9 €, stock 1, published  `PpHa1t44HImCHYA8`
- «Bottleneck verre D'Addario taille Small» — 12.9 €, stock 1, published  `Z9kKBx3TwGRmjP1x`
- «Bottleneck D'Addario» — 12.9 €, stock 0, draft  `zmTSaKkmDUDIBuKm`

### `QSC CB10` — bundle avec housse (899€) contre enceinte seule (799€)
- «Bundle Enceinte QSC CB10 Nomade avec Housse de Transport Waterproof» — 899 €, stock 1, published  `CsBM5IkVxJIzezNt`
- «Enceinte Bluetooth alimentée par batterie QSC CB10» — 799 €, stock 0, published  `56erTY2MCuWNFIFG`

### `WS-S35/B5` — lot de 5 bonnettes (4,90€) contre l'unité (1,90€)
- «5 BONNETTES ANTIVENT NOIR-35mm» — 4.9 €, stock 0, published  `hbPxZHTvTVUWjze5`
- «bonette anti vent pour micros» — 1.9 €, stock 2, published  `uwHbGd875NzgbJGn`

### `X000NE768F` — « Règle Coulissante » et « Méthode guitare Impro » : deux articles
- «Règle Coulissante pour Apprendre les Gammes Facilement à la guitare - Méthode Complète de Lecture des Notes» — 44.9 €, stock 4, published  `HFbOeGZjsgvZ6q2J`
- «Méthode guitare Impro» — 44.9 €, stock 6, draft  `DySX6MoH1Mf7NgKW`

---

## B. Vingt-six fiches à SUPPRIMER — vrais doublons

**Reporter le stock d'abord.** 12 des fiches à supprimer en portent, et
aucune n'a de vente attachée. Supprimer sans reporter perdrait ces unités.

| SKU | garder | supprimer | stock à reporter |
|---|---|---|---|
| `0162` | Hohner 532/20 MS Harmo Blues Harp C | Hohner 532/20 MS Harmonica Blues Harp C | — |
| `BA-0310-00` | Peau Remo Ambassador clear 10" | BA-0310-00 | — |
| `BD22UV1` | 22" UV1 BTR CTD BD22UV1 | Peau Grosse Caisse Evans | **+1** → 1 devient 2 |
| `D-01` | Ligature et capuchon d'embouchure en cuir pour clarinette J Michaeld | D-01 | **+1** → 1 devient 2 |
| `D-03` | Ligature et capuchon d'embouchure en cuir pour Sax Alto J Michael | D-03 | — |
| `GU261` | Guitare Folk Guild Memoir DS240 Slope Shoulder | GU261 GUILD MEMOIR DS240 SLOPE SHOULDER | **+1** → 1 devient 2 |
| `GVA VC354-BK` | Guitare Classique 4/4 Noir | Valencia VC354 BK : La Classique Satinée Parfaite | — |
| `HB-30` | Clochettes de traîneau Hayman | Clochettes de poignet | — |
| `HDDB12T2` | HEAT Peau 12" - Son puissant et chaud | HEATS® - dB.series transparente - Tom 12" | — |
| `HDDB14S2` | Peau sablée Heat dB Serie tom 14" | HEATS® - dB.series sablée - Tom/Caisse Claire 14" | — |
| `HDDB16T2` | HEAT Peau 16" - Son puissant et chaud | peau HEATS dB.series transparente 2 PLIS 16'' | **+2** → 1 devient 3 |
| `HDEB22M1` | Peau HEAT Grosse Caisse Echo Black 22" | HEATS® - echo.black noir - Grosse Caisse 22" | **+1** → 0 devient 1 |
| `HDEW20M1` | Peau HEAT Grosse Caisse Echo white 20" | HEATS® - echo.white sablée - Grosse Caisse 20" | **+1** → 1 devient 2 |
| `JL500GD` | JET JL500GD Goldtop : La Légende Singlecut | Guitare Électrique JET JL 500GD Goldtop : Le Look Vintage | **+1** → 0 devient 1 |
| `MF912` | Coup de pouce Méthhode guitare ROck Débutant Vol 1 | MF912 | **+1** → 0 devient 1 |
| `MXR M108S` | Pédale  équalizer MXR - MXR M108S | MXR M108S | — |
| `P3-1322-C2` | 17 REMO P3-1322-C2 | P3-1322-C2 | — |
| `PVV206-70SS` | V206 Platinium SLIM PATCH - 0.75m S/S droit/droit | Providence V206 0.7m S/S droit/droit | **+5** → 7 devient 12 |
| `PWCBS-SS` | Daddario Bottleneck Chrome : Son Clair & Glisse Fluide | Bottleneck D'Addario | **+1** → 1 devient 2 |
| `PWGS-SL` | Daddario Glass Slide : Son Clair & Expressif | Bottleneck verre D'Addario taille Large | — |
| `PWSAL400` | Sangle D'Addario Auto Lock Polypro pour guitare, noir | sangle Daddario PWSAL400 | — |
| `RS1L` | Meinl Baton Pluie Sonic Energy L Relaxation Zen | RS1L | — |
| `RS1S` | Meinl Baton Pluie Sonic Energy L Relaxation Zen (Copie) (Copie) | RAINSTICK SONIC ENERGY BAMBOU S | — |
| `SBU600` | SINGING BOWL SONIC ENERGY UNIVER. 650G | SBU600 | — |
| `SC29B` | Meinl Chimes Sonic Energy Spiral Bronze 29" | CHIMES SONIC ENERGYSPIRAL 29", BRONZE | **+1** → 1 devient 2 |
| `VG512.280` | Ukulélé Basse Électro-Acoustique Gewa Manoa K-BS-CE E-A | UKULELE BASS K-BS-CE | **+1** → 1 devient 2 |

### Identifiants NeDB, pour retrouver les fiches

| SKU | à supprimer | _id |
|---|---|---|
| `0162` | Hohner 532/20 MS Harmonica Blues Harp C | `tMvcwgr02gccVsSp` |
| `BA-0310-00` | BA-0310-00 | `3YtGLhbnqWU6c8jC` |
| `BD22UV1` | Peau Grosse Caisse Evans | `FbWKA2dJ1lMHV4Ls` |
| `D-01` | D-01 | `EmKtuV3mwXswvt0t` |
| `D-03` | D-03 | `gwQkVVj9smPBAg3C` |
| `GU261` | GU261 GUILD MEMOIR DS240 SLOPE SHOULDER | `oag2wVSQMEXt2cfO` |
| `GVA VC354-BK` | Valencia VC354 BK : La Classique Satinée Parfaite | `RU1XP8n23VaRuega` |
| `HB-30` | Clochettes de poignet | `xwu9yEA659C6KRAR` |
| `HDDB12T2` | HEATS® - dB.series transparente - Tom 12" | `zzGGlH5aGrJgUe9R` |
| `HDDB14S2` | HEATS® - dB.series sablée - Tom/Caisse Claire 14" | `BUxzyeXSwlt3yx5h` |
| `HDDB16T2` | peau HEATS dB.series transparente 2 PLIS 16'' | `Oilek2ax0kyf1Ak1` |
| `HDEB22M1` | HEATS® - echo.black noir - Grosse Caisse 22" | `aocfambEyMBTWYQ9` |
| `HDEW20M1` | HEATS® - echo.white sablée - Grosse Caisse 20" | `3cjwrBziaZzA9vgU` |
| `JL500GD` | Guitare Électrique JET JL 500GD Goldtop : Le Look Vintage | `6MmE6nLb56S7Qj9C` |
| `MF912` | MF912 | `Oup2VetnHv0FQa5E` |
| `MXR M108S` | MXR M108S | `xAzo41GFVbmwaseE` |
| `P3-1322-C2` | P3-1322-C2 | `vnPthjJd5ugliZRL` |
| `PVV206-70SS` | Providence V206 0.7m S/S droit/droit | `Rj7ZbO8phlPSs7B5` |
| `PWCBS-SS` | Bottleneck D'Addario | `8UPzWgzFTVgw0I5P` |
| `PWGS-SL` | Bottleneck verre D'Addario taille Large | `8cLLjecefsmVxhFa` |
| `PWSAL400` | sangle Daddario PWSAL400 | `E84QDIGshfMHMeYH` |
| `RS1L` | RS1L | `7e2mxJGII4rRe1D8` |
| `RS1S` | RAINSTICK SONIC ENERGY BAMBOU S | `K29W5hMqSSdVa9kg` |
| `SBU600` | SBU600 | `QlEEcUr0V0vb8v1g` |
| `SC29B` | CHIMES SONIC ENERGYSPIRAL 29", BRONZE | `x6bLOQguZIBk9FK9` |
| `VG512.280` | UKULELE BASS K-BS-CE | `a0RGSiHLA8nz0IpB` |

---

## Trois cas où ma proposition est douteuse

Le tri privilégie la fiche dont le nom n'est pas le SKU, puis celle qui
porte un `woo_id`, une image, des ventes. Il se trompe ici :

- **`RS1S`** — je propose de garder « … **L** Relaxation Zen (Copie) (Copie) »
  pour un SKU **S**. Le nom est faux des deux côtés.
- **`MXR M108S`** — la fiche que j'écarte est la mieux rangée (catégorie
  *Pédales*, marque MXR) ; celle que je garde n'a ni l'une ni l'autre.
- **`MF912`** — la fiche gardée porte une faute (« Méthhode »), l'écartée
  porte le `woo_id` et le stock.

---

## Quand vous aurez fini

Dites-le moi : je régénère `cles-stables.json`, relance la simulation
— elle doit afficher **0 collision** — puis j'exécute la reprise **sur une
copie** de pb_data avant de vous laisser lancer la vraie.