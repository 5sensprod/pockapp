# Rituel — réparer la régression du 20 mai 2026 sur les rapports Z

**Ouvert le 22 août 2026.** Point d'entrée pour reprendre le sujet dans une
session neuve. Tout ce qu'il faut savoir est ici ; l'audit complet du module est
dans [`00-audit-ergonomie-cloture.md`](00-audit-ergonomie-cloture.md), l'outil de
mesure dans [`01-verifier-les-totaux-z.md`](01-verifier-les-totaux-z.md).

---

## 1. En une phrase

Les rapports Z ont d'abord **oublié les factures B2B** (janvier → mai), puis, la
correction du 20 mai ayant introduit une régression, ont annoncé un chiffre
d'affaires **doublé** sur trois lignes de leur en-tête (mai → août) — leurs
ventilations restant justes dans les deux cas. **32 rapports étaient concernés au total.** Aucun document n'a été transmis au comptable (confirmé par le propriétaire le 23 août) : la réparation peut donc se faire dans les documents eux-mêmes.

## 2. Ce qui est établi — ne pas le redémontrer

**La cause.** Commit **`156692e`, 20 mai 2026, « fix b2b to facture »**. Il a
introduit `aggregateInvoiceIntoTotals` pour partager l'agrégation entre tickets
POS et factures B2B, **sans retirer** le `totalTTC += sessionTTC` qui suivait la
boucle des sessions. Chaque ticket POS était donc versé deux fois dans les
totaux journaliers. Régression purement additive, les deux écritures étant à
cinquante lignes d'écart.

**La portée, mesurée sur la base de dév le 22 août 2026 :**

| | |
|---|---|
| Rapports Z en base | 45 (7 janvier → 21 août 2026) |
| Rapports faux | **24 — Z-2026-000022 à Z-2026-000045**, contigus, sans trou |
| Premier faux | Z-022, 22 mai 2026 |
| Dernier faux | Z-045, 21 août 2026 |
| TTC annoncé en trop, cumulé | **10 236,15 €** |
| TVA annoncée en trop, cumulée | **1 640,22 €** |

**Seul le bloc « Résumé de la journée » est faux. Tout ce qui est en dessous est
juste.** C'est la clé de tout le reste, et c'est exactement quatre nombres :

| Champ | Où il s'affiche | État |
|---|---|---|
| `daily_totals.total_ht` | résumé, en-tête | ❌ doublé sur la part POS |
| `daily_totals.total_tva` | résumé, en-tête | ❌ doublé sur la part POS |
| `daily_totals.total_ttc` | résumé, en-tête | ❌ doublé sur la part POS |
| `daily_totals.net_ttc` | résumé, en-tête | ❌ dérivé du précédent |
| `daily_totals.vat_by_rate` | tableau TVA par taux | ✅ juste |
| `daily_totals.by_customer_type` | bloc e-reporting B2C/B2B | ✅ juste |
| `daily_totals.by_method` / `net_by_method` / `refunds_by_method` | moyens de paiement | ✅ justes |
| `sessions[].total_ht / total_tva / total_ttc` | détail des sessions | ✅ justes |
| `invoice_count`, espèces attendues / comptées / écart, remises | résumé et espèces | ✅ justes |

**Conséquence, et c'est ce qui rend la réparation légère : le rapport porte sa
propre correction, écrite trois fois sous l'erreur.** Sur `Z-2026-000045`,
l'en-tête annonce 1 648,06 / 311,56 / 1 959,62, tandis que

- la somme de `vat_by_rate` donne 824,03 HT et 155,78 TVA,
- `by_customer_type` donne le triplet complet 824,03 / 155,78 / 979,81,
- la somme des `sessions[]` donne le même triplet,
- la somme de `by_method` donne 979,81 TTC.

Un lecteur attentif du PDF — un comptable qui revérifie — voit d'ailleurs la
contradiction sans qu'on la lui signale.

⚠️ **Mais ne pas s'arrêter là.** Ces ventilations sont justes *vis-à-vis du
double comptage* ; elles ne prouvent pas que le Z soit complet. La
réconciliation avec les documents sources (étape 2) a montré que **10 rapports
oublient des encaissements** — voir §2 bis. Recalculer le résumé depuis les
seules ventilations reproduirait cet oubli. **Les documents sources font foi,
pas le rapport.**

## 2 bis. La chronologie complète — deux anomalies, une seule lignée

Découverte le 22 août 2026 en réconciliant les 46 Z avec les documents sources,
et **confirmée par le propriétaire** : les deux anomalies ne sont pas
indépendantes. Au début les factures B2B n'étaient pas prises en compte ; la
modification du 20 mai qui règle ce problème a introduit le double comptage.
C'est une seule histoire, en trois temps.

| Période | Rapports | État | Écart |
|---|---|---|---|
| 7 → 22 jan | Z-001 → Z-009 | justes — aucune facture B2B encaissée ces jours-là | — |
| 24 jan → 16 mai | Z-010 → Z-021 | **incomplets** : le B2B existe mais n'est pas agrégé | −6 110,80 € sur 8 rapports |
| 22 mai → 21 août | Z-022 → Z-045 | **doublés** : le B2B est agrégé, mais les tickets POS comptent deux fois | +10 236,15 € sur 24 rapports |
| depuis le 22 août | Z-046 → | justes, sous tests | — |

Le piège est classique et mérite d'être nommé, car il conditionne la manière de
relire ce genre de correctif : le commit du 20 mai a **ajouté** le chemin
d'agrégation partagé sans **retirer** l'ancien. Un refactor purement additif, où
les deux écritures se retrouvent à cinquante lignes d'écart — rien ne signale le
doublon, ni à la compilation, ni à la lecture, ni à l'exécution.

### Ce qui ne relève PAS de cette lignée — et reste actif

Deux rapports d'après le 20 mai, **Z-025 et Z-027**, oublient malgré tout des
factures B2B : **1 147,45 €**. La cause est différente et le mécanisme est
toujours en place.

**Preuve :**
`Z-2026-000027` a été généré le 3 juin à **07:40:40** ; les factures B2B de ce
jour ont été réglées à 09:02, 14:49, 14:52 et 16:55 — **toutes après**. Elles ne
sont donc dans aucun Z, et ne peuvent plus y entrer : la journée a déjà son Z, et
un Z ne se rejoue pas.

C'est la démonstration concrète du risque signalé au §6 de l'audit : **générer un
Z trop tôt fait perdre définitivement des encaissements.** Cela pèse directement
sur la conception du rappel de fin de journée (tickets D1/D2 de l'audit) — un
rappel qui pousserait à générer tôt aggraverait ce défaut.

**Ce qui reste à décider ici :** faut-il empêcher la génération d'un Z tant que la
journée n'est pas finie, ou avertir quand des factures du jour ne sont pas encore
réglées ? Question ouverte, hors périmètre du présent rituel, mais à ne pas
perdre.

## 3. Ce qui est déjà fait

- **Le calcul est corrigé** — `backend/reports/cash_reports.go:913`, les trois
  lignes `totalHT/TVA/TTC += session*` retirées, avec un commentaire qui explique
  la régression pour que personne ne les remette.
- **Deux tests de non-régression** — `backend/reports/cash_reports_test.go` :
  `TestLesTicketsNeSontComptesQuUneFoisDansLeZ` et
  `TestLesTotauxDuZEgalentLeursVentilations`. Écrits **avant** le correctif et
  vérifiés rouges (`total TTC = 120.00, attendu 60.00`), verts après. Ils montent
  une PocketBase en mémoire, sans dépendre d'aucune base réelle — même patron que
  `backend/routes/stock_atomic_test.go`.
- `go build ./...` et `go test ./backend/...` passent.

**Tout Z généré à partir de maintenant est juste.** Ce qui reste ne concerne que
le passé.


## 3 bis. La réparation — outil livré le 23 août 2026

**Décision du propriétaire :** aucun document n'ayant été transmis, on répare les
rapports eux-mêmes plutôt que d'ajouter un état rectificatif. **Le découpage est
conservé** — chaque Z garde ses sessions et sa date ; seules ses valeurs sont
refaites, puis la chaîne de hachage est reconstruite.

```bash
go run ./backend/cmd/z-repair                # simulation, n'écrit rien
go run ./backend/cmd/z-repair -apply         # applique
go run ./backend/cmd/z-repair -data <chemin> # sur une autre base
```

- `backend/reports/z_repair.go` — la logique.
- `backend/cmd/z-repair/` — la commande.
- L'agrégation passe par **`aggregateZ`**, extraite de `GenerateRapportZ` le
  23 août et désormais partagée : l'historique réparé et les Z futurs suivent les
  mêmes règles **par construction**. C'est la réponse directe à la cause de la
  régression de mai — deux implémentations des mêmes règles qui divergent.
- `generated_at` est relu dans `full_report`, **pas** dans la colonne SQL : le
  hash d'origine a été calculé en heure locale, la colonne stocke l'UTC.

**Résultat mesuré sur une copie de la production (23 août 2026) :**

| | |
|---|---|
| Rapports examinés | 46 |
| **Montants corrigés** | **32** |
| Enrichis (argent inchangé, champs récents ajoutés) | 13 |
| Simplement rechaînés | 1 |
| Erreurs | 0 |
| Correction cumulée du TTC | **−2 271,13 €** |

Les 32 recoupent exactement l'analyse SQL indépendante : 24 doublés + 8 sans B2B.

**Vérifications passées sur la copie réparée :**

- 0 rapport dont le TTC diffère de ses moyens de paiement (46 avant : 24) ;
- 0 rapport dont la TVA diffère de sa ventilation ;
- **0 maillon de chaîne rompu** ;
- **idempotence** : relancer la commande ne change plus rien.

**Un cas de données, pas de calcul, découvert au passage :** `FAC-2026-000165`
(499 €, payée le 3 juin) ne porte **aucun moyen de paiement** — les deux champs
sont vides. Son montant entrait dans le total sans pouvoir se ranger dans une
colonne de ventilation. Un repli **« Non précisé »** a été posé
(`libelleMoyenPaiement`, `cash_reports.go`) : sans lui, l'invariant « total =
somme des ventilations » — celui sur lequel repose toute la vérification —
restait faux à jamais sur ce rapport. Le rapport X garde son ancien
comportement ; c'est délibéré, il est hors périmètre.

### ✅ APPLIQUÉ EN PRODUCTION le 23 août 2026

PocketApp fermé, sauvegarde prise, `-apply` lancé sur
`%LOCALAPPDATA%\PocketReact\pb_data`.

```
46 rapports examinés · 32 aux MONTANTS corrigés · 13 enrichis · 1 rechaîné · 0 erreur
Correction cumulée du TTC : -2271.13 €
46 rapports réécrits, chaîne de hachage reconstruite.
```

**Vérifications passées sur la base réelle, après application :**

| Contrôle | Avant | Après |
|---|---|---|
| Rapports dont le TTC diffère de ses moyens de paiement | 24 | **0** |
| Rapports dont la TVA diffère de sa ventilation | — | **0** |
| Rapports dont le HT diffère de ses bases ventilées | — | **0** |
| Maillons de chaîne rompus | — | **0** |
| Genesis incorrects | — | **0** |
| Désaccords colonne SQL ↔ `full_report` | — | **0** |
| **Rapports conformes aux documents sources** | **36 / 46** | **46 / 46** |
| Idempotence (relancer la commande) | — | **aucun changement** |

Sauvegarde de sécurité prise avant l'opération, en plus de celle du
propriétaire : `scratchpad/backup-pb_data-20260823-191905/`. Elle vit dans un
dossier temporaire — **la recopier ailleurs si elle doit durer.**

**Le passé est réparé.** Ce qui suit ne concerne plus les valeurs des rapports.

## 4. Ce qui reste à faire

### ~~Étape 1 — vérifier le correctif sur une vraie génération~~ ✅ FAIT

**Validé le 22 août 2026 à 10:23**, sur la base de dév : session ouverte,
3 tickets espèces, clôture, génération de `Z-2026-000046`.

| | Annoncé par le Z | Ventilations du Z | Somme des 3 tickets |
|---|---|---|---|
| HT | 71,64 € | 71,64 € | 71,64 € |
| TVA | 8,16 € | 8,16 € | 8,16 € |
| TTC | 79,80 € | 79,80 € | 79,80 € |

Écarts nuls sur les trois lignes. Le contrôle de cohérence du §5 rend toujours
**24** rapports incohérents, désormais sur 46 — `Z-2026-000046` n'y figure pas.

Et c'est une preuve, pas une coïncidence : sous l'ancien code, ces mêmes tickets
auraient donné 143,28 € HT. Obtenir 71,64 € établit que le binaire qui a généré
ce Z portait bien le correctif.

**Le calcul est réparé, vérifié de bout en bout. Tout Z généré désormais est
juste.**

### Étape 2 — réconcilier chaque Z avec ses documents sources *(moyen)*

**À faire AVANT de recalculer quoi que ce soit.** Les ventilations d'un Z sont
justes vis-à-vis du double comptage, mais elles ne font pas foi : ce sont les
**tickets, factures, avoirs et acomptes** qui font foi. Reconstruire chaque
période de Z depuis ces documents est la seule vérification qui tienne — et elle
a déjà mis au jour une **seconde anomalie**, en sens inverse (§2 bis).

**Le périmètre exact d'un Z — attention, ce n'est pas « la journée » :**

| Composant | Règle de rattachement | Code |
|---|---|---|
| Tickets POS | rattachés aux **sessions** du Z (`session_ids`), quelle que soit leur date | `cash_reports.go:782` |
| Avoirs POS | idem, par session | `cash_reports.go:802` |
| Factures et acomptes B2B | `is_paid = true` et **`paid_at` dans la journée civile** | `cash_reports.go:517` |
| Avoirs B2B | par **date d'émission** dans la journée civile | `cash_reports.go:527` |

Le piège : une session peut rester ouverte des jours — jusqu'à **17 jours**
mesurés (§1.4 de l'audit). Un Z du 21 août peut donc contenir des tickets du
4 août. Toute réconciliation doit passer par `session_ids`, **jamais** par la
date des tickets.

La requête de réconciliation est au §5 bis.

### Étape 3 — rendre le résumé exact à l'affichage et à l'impression *(moyen)*

**C'est désormais le seul développement qui reste, et il règle tout le reste.**

Le principe tient en une phrase : **recalculer le bloc « Résumé de la journée »
à partir des ventilations du rapport lui-même**, au moment de l'afficher, sans
jamais toucher au document scellé.

C'est possible parce que le rapport porte sa propre correction (§2) :
`Σ vat_by_rate` donne le HT et la TVA, `Σ by_method` donne le TTC, et
`by_customer_type` les trois d'un coup. Aucun accès aux factures, aucune écriture
en base, aucune atteinte au hash ni à la chaîne.

Trois points d'application :

1. **Détecter** — un rapport est touché si `total_ttc ≠ Σ by_method` (tolérance
   1 centime). Règle unique, calculée à l'affichage, valable pour les 24 comme
   pour tout rapport futur.
2. **Écran** — `RapportZPage.tsx:475-487` : afficher le résumé recalculé, et
   signaler en clair que les totaux d'origine du document étaient erronés.
3. **PDF** — `ZReportPDF.tsx:213-232` : même chose, plus une mention explicite
   du type « Résumé rectifié le … — les ventilations ci-dessous sont celles du
   document d'origine, inchangées ». C'est ce PDF qui devient le **Z corrigé**
   à transmettre au comptable.

**Ce que cela remplace :** l'état rectificatif séparé envisagé au départ devient
inutile. Plutôt qu'un tableau annexe de 24 lignes que le comptable devrait
rapprocher à la main de ses PDF, il reçoit les mêmes documents avec un résumé
juste et une mention datée. Le détail, lui, n'a jamais bougé — et il pourra le
vérifier, puisqu'il revérifie.

**Ce que cela ne fait pas, volontairement :** aucun `UPDATE` sur `z_reports`. Les
documents restent tels qu'émis, hash intact ; seule leur *restitution* est
corrigée. C'est la seule voie compatible NF525 (§6).

### Étape 4 — transmettre les Z corrigés au comptable *(petit)*

Une fois l'étape 3 faite, réimprimer les rapports concernés depuis `/cash/rapport-z` et
les lui transmettre. La liste exacte est donnée par la requête du §5 :
`Z-2026-000022` → `Z-2026-000045`.

**Non bloquant, et sans urgence fiscale :** le comptable revérifie les documents
qu'il reçoit (confirmé par le propriétaire le 22 août 2026), et chaque PDF déjà
envoyé contenait de toute façon les bons chiffres sous l'en-tête erroné. Il n'y a
donc pas de raison de penser qu'une déclaration ait été faussée — mais cela reste
à lui confirmer, et c'est à lui, pas à PocketApp, de le dire.

Pour mémoire, si la question se pose : l'écart cumulé annoncé en trop sur la
période est de **10 236,15 € TTC** et **1 640,22 € de TVA**.

## 5. Le contrôle de cohérence — l'outil de toutes les étapes

Autonome : il ne lit que `z_reports`, jamais `invoices`. Travailler **sur une
copie** de la base, jamais sur le fichier servi par PocketBase.

**Les trois fichiers, pas seulement `data.db`** — en mode WAL, les écritures
récentes vivent dans `data.db-wal`. Copier `data.db` seul donne une photo
périmée : mesuré le 22 août 2026, un Z généré deux heures plus tôt était absent
de la copie.

```bash
for e in "" "-wal" "-shm"; do
  cp "$LOCALAPPDATA/PocketReact/pb_data/data.db$e" "$TEMP/audit_ro.db$e" 2>/dev/null
done
```

```sql
WITH v AS (
  SELECT z.number, substr(z.date,1,10) jour,
         json_extract(z.full_report,'$.daily_totals.total_ht')  ht_annonce,
         json_extract(z.full_report,'$.daily_totals.total_tva') tva_annonce,
         json_extract(z.full_report,'$.daily_totals.total_ttc') ttc_annonce,
         (SELECT ROUND(SUM(json_extract(value,'$.base_ht')),2)
            FROM json_each(json_extract(z.full_report,'$.daily_totals.vat_by_rate'))) ht_reel,
         (SELECT ROUND(SUM(json_extract(value,'$.vat_amount')),2)
            FROM json_each(json_extract(z.full_report,'$.daily_totals.vat_by_rate'))) tva_reel,
         (SELECT ROUND(SUM(value),2)
            FROM json_each(json_extract(z.full_report,'$.daily_totals.by_method'))) ttc_reel
  FROM z_reports z
)
SELECT number, jour,
       ht_annonce,  ht_reel,  ROUND(ht_annonce  - ht_reel, 2)  AS ecart_ht,
       tva_annonce, tva_reel, ROUND(tva_annonce - tva_reel, 2) AS ecart_tva,
       ttc_annonce, ttc_reel, ROUND(ttc_annonce - ttc_reel, 2) AS ecart_ttc
FROM v
WHERE ABS(ttc_annonce - ttc_reel) > 0.02
ORDER BY jour;
```

Sur la base de dév au 22 août 2026, elle rend exactement 24 lignes,
`Z-2026-000022` → `Z-2026-000045`. **Après l'étape 1, un Z fraîchement généré ne
doit pas y apparaître** — c'est le critère de réussite.

## 5 bis. La réconciliation avec les documents sources

Le contrôle du §5 compare un Z **à lui-même**. Celui-ci le compare **aux
tickets, factures, avoirs et acomptes** — c'est lui qui fait foi, et c'est lui
qui a révélé le §2 bis.

```sql
WITH z AS (
  SELECT id zid, number, substr(date,1,10) j, owner_company oc, session_ids sids,
         json_extract(full_report,'$.daily_totals.total_ttc') entete,
         (SELECT ROUND(SUM(value),2)
            FROM json_each(json_extract(full_report,'$.daily_totals.by_method'))) ventil
  FROM z_reports
),
src AS (
  SELECT z.zid,
    -- tickets POS : par SESSION, jamais par date
    ROUND(COALESCE((SELECT SUM(i.total_ttc)
       FROM json_each(z.sids) s
       JOIN invoices i ON i.session = s.value
        AND i.is_pos_ticket = 1 AND i.status <> 'draft'
        AND i.invoice_type IN ('invoice','deposit')),0),2) pos,
    -- factures et acomptes B2B : par paid_at dans la journée civile
    ROUND(COALESCE((SELECT SUM(i.total_ttc)
       FROM invoices i
       WHERE i.is_pos_ticket = 0 AND i.is_paid = 1 AND i.status <> 'draft'
         AND i.invoice_type IN ('invoice','deposit')
         AND COALESCE(i.original_invoice_id,'') = ''
         AND i.owner_company = z.oc
         AND i.paid_at >= z.j || ' 00:00:00'
         AND i.paid_at <  date(z.j,'+1 day') || ' 00:00:00'),0),2) b2b
  FROM z
)
SELECT z.number, z.j, src.pos, src.b2b,
       ROUND(src.pos + src.b2b, 2) AS sources,
       z.ventil, z.entete,
       ROUND(z.ventil - (src.pos + src.b2b), 2) AS ecart_ventilation,
       ROUND(z.entete - (src.pos + src.b2b), 2) AS ecart_entete
FROM z JOIN src ON src.zid = z.zid
ORDER BY z.j;
```

**Résultat au 22 août 2026, sur 46 rapports :** 36 ventilations égalent les
sources, **10 non** (§2 bis) ; 14 en-têtes seulement sont justes.

**Pour aller plus loin**, cette requête ne couvre pas encore les **avoirs**
(`invoice_type = 'credit_note'`, rattachés par session pour le POS et par date
d'émission pour le B2B) ni le rapprochement HT/TVA. Les étendre est le premier
geste de l'étape 2 — le squelette et les règles de rattachement sont ci-dessus.

## 6. Garde-fous — à ne pas franchir

- **Ne pas régénérer les 24 rapports.** Ils sont scellés par un hash
  (`cash_reports.go:1375-1377`) chaîné au précédent (`:1055`), et leurs sessions
  portent un `z_report_id` qui les rend non rejouables (`:1150`). Les effacer pour
  rejouer casserait la chaîne, renumérerait la série, et reviendrait à nier que
  ces documents ont existé — alors que leurs PDF sont dehors. **C'est un système
  NF525 : un document scellé ne se réécrit pas, on émet un correctif à côté.**
- **Ne pas modifier `z_reports` en base**, même les seules colonnes fausses : le
  `full_report` et le hash deviendraient incohérents entre eux.
- **Ne jamais ouvrir `pb_data/data.db` directement** — copie systématique, sinon
  risque de corruption du WAL par accès concurrent.
- **La base de dév reste le domaine de travail** le temps de cette réparation.
  Les volumes ci-dessus sont ceux du dév ; s'ils doivent un jour être établis sur
  la base du client, c'est la même requête (§5) qui le fera, dans le chantier A.

## 7. Ordre recommandé

**1** ✅ fait → **2** (réconcilier avec les documents sources) → **3** (résumé
recalculé à l'affichage et au PDF) → **4** (transmettre les Z corrigés).

**L'étape 2 commande tout le reste** : tant que le montant juste de chaque
période n'est pas établi depuis les tickets, factures, avoirs et acomptes, on ne
sait pas quoi afficher à l'étape 3. Le §2 bis montre pourquoi — se fier aux
ventilations du rapport aurait reconduit l'oubli de 7 258,25 € d'encaissements.

## 8. Ce que je n'ai pas tranché

- **Le comptable a-t-il reporté ces chiffres ailleurs** — déclaration de TVA,
  liasse, export ? Rien dans le dépôt ne consomme `z_reports` en dehors de
  l'écran et du PDF, mais l'usage aval est hors du code. C'est l'objet de
  l'étape 2.
- ~~Les rapports antérieurs au 20 mai n'agrègent pas les factures B2B.~~
  **Chiffré le 22 août : 6 110,80 € sur 8 rapports** (§2 bis). Reste à décider
  s'ils doivent être rectifiés au même titre que les 24 autres — ils relèvent
  d'une anomalie différente, et de périodes de TVA probablement déjà closes.
