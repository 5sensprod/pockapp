# 06 — Le Z v4 : sortir le détail des sessions, compter les documents

*28 août 2026. Contrat implémenté et **rejoué en production** (v4 et v5 d'un
seul geste).*

Convention, reprise des documents précédents : **[lu]** = chemin et ligne dans
le dépôt. **[rapporté]** = dit par le propriétaire, non vérifié ici.
**[à faire]** = reste à exécuter.

> **Aucune mesure sur la base dans cette session.** Le propriétaire a demandé
> qu'on cesse de copier `pb_data` — il fait les vérifications lui-même. Les
> chiffres cités ici viennent donc du **code** ou des documents antérieurs,
> jamais d'une requête passée aujourd'hui.

---

## 1. Ce que le v4 change

| | v3 (27 août) | v4 (28 août) |
|---|---|---|
| Bloc « Détail des sessions » | affiché | **retiré de l'écran et du PDF** |
| `sessions_count` | affiché | **retiré de l'affichage** |
| Nombre de tickets de caisse | noyé dans `invoice_count` | **affiché** |
| Nombre de factures hors caisse | noyé dans `invoice_count` | **affiché** |
| `schema_version` | 3 | **4** |

Rien d'autre. Aucune ligne, aucun total, aucun centime.

## 2. Pourquoi le détail des sessions part

Un Z couvre la **période écoulée depuis la clôture précédente**, et non sa seule
date — `04-refonte-du-z.md` §7, et le commentaire de `GenerateRapportZ`
**[lu]**. Une session peut donc s'étendre sur plusieurs journées : le bloc
donnait à lire un découpage qui n'est pas celui du document.

La donnée n'est pas fausse ; elle est **hors sujet dans un document fiscal**, et
le PDF du Z part chez le comptable. Elle aura sa statistique dans `/stats`, où
**[rapporté]** un Z étalé sur trois jours se relira en trois journées — c'est ce
redécoupage qui rend le retrait sans perte.

**On cache, on n'efface pas.** `SessionSummary` (`cash_reports.go:732`) reste
calculée, reste dans `full_report`, et `sessions_count` reste stocké et haché.
Même geste que les `total_cash_*` du v3.

## 3. Ce que comptent les deux compteurs

| Champ | Contenu |
|---|---|
| `pos_ticket_count` | tickets de caisse des sessions du Z |
| `external_invoice_count` | factures hors caisse **émises ET encaissées le jour** (`LigneVentesDuJour`) |

**Invariant, testé :** `pos_ticket_count + external_invoice_count =
invoice_count`.

`invoice_count` ne change **ni de nom ni de valeur** : il mêlait déjà les deux
populations — `totalInvoiceCount` accumulé par session (`cash_reports.go:1047`)
puis fusionné avec `b2bInvoiceCount` (`:1198`) **[lu]**. Le v4 le **scinde**, il
ne le corrige pas. `posTicketCount` est figé **avant** la fusion : après, la
scission ne serait plus reconstructible.

N'entrent dans aucun des trois : les avoirs (ligne 4), les créances (ligne 2),
les acomptes (ligne 3), et les **conversions de ticket** que
`estConversionDeTicket` (`z_lignes.go:139-145`) range en `LigneAucune`. Le
ticket d'origine, lui, reste une vente du jour et est compté une fois — c'est ce
que vérifie le gardien.

### « Créées dans connect » — pourquoi ce n'est pas ce qui est compté

Le module `frontend/modules/connect` **n'écrit aucun marqueur d'origine** sur
`invoices` ; le seul discriminant est `is_pos_ticket`
(`backend/hooks/invoice_hooks.go:402-409`) **[lu]**. Compter littéralement « ce
qui vient de connect » aurait demandé un champ neuf et une reprise des 1204
documents existants, qui n'en portent aucun : une donnée inventée
rétroactivement sur un document fiscal. Arbitré par le propriétaire : **hors
caisse, ligne 1**.

## 4. Ce qui a été écrit

| Ticket | Fait | Où |
|---|---|---|
| S-1 | migration `AddSalesCountsToZReports`, **inscrite dans `RunMigrations`** | `backend/migrations/z_reports_sales_counts.go`, `migrations.go` |
| S-2 | `aggregateZ` restitue les deux compteurs — **une sortie de plus, pas une seconde fonction** | `cash_reports.go` |
| S-3 | les deux compteurs et `schema_version = 4` dans `computeZReportHash` ; colonnes écrites par `saveZReport` **et** par `ecrireRapport` (`z_repair.go`) | idem |
| S-4 | trois gardiens | `cash_reports_test.go` |
| S-5 | `estZSansDetailSessions` / `estZCompteLesDocuments`, **seuil `>= 4`**, deux branchements | `cash.types.ts`, `RapportZPage.tsx`, `ZReportPDF.tsx` |
| S-6 | rejeu `z-repair -apply` | **fait** — voir §5 |

Les gardiens, dans l'ordre : la scission ne perd ni n'invente rien sur un cas à
six documents (deux tickets, une facture du jour, un avoir, une conversion, une
créance) ; un rapport de version antérieure ne prétend pas porter les compteurs ;
deux rapports au même `invoice_count` mais à la scission différente n'ont pas le
même hash. `go test ./backend/reports/...` : **ok** **[lu]**.

## 5. Le rejeu — fait le 28 août 2026

Application fermée, sauvegarde préalable **[rapporté]**. Le rejeu a porté v4 et
v5 ensemble : le v4 n'avait pas encore été appliqué quand le v5 a été écrit.

Simulation **avant** :

| | |
|---|---|
| rapports examinés | **60** |
| aux **montants** corrigés | **0** |
| enrichis (argent inchangé) | **60** |
| en erreur | **0** |
| correction cumulée de l'argent encaissé | **+0,00 €** |
| lignes équilibrées | **60 / 60** |
| cumul ligne 1 | 88 882,29 € |
| cumul encaissé | **95 216,85 €** — identique au 27 août |

Simulation de contrôle **après** : **0 enrichis, 0 rechaînés, aucune ligne
affichée**, cumuls identiques. C'est la preuve du rejeu, et elle est indirecte :
`entry.Change` compare les hash (`z_repair.go`) et `main.go:121` n'affiche un
rapport que si le sien diffère. Une base restée en v3 aurait affiché ses 60
lignes, `schema_version` étant haché. Le rejeu est donc **idempotent**.

**[rapporté]**, non lu : la sortie de `-apply` elle-même. La conclusion vient de
la différence entre les deux simulations.

## 6. Ce qui n'est pas touché

- **Les quatre lignes**, le total encaissé, la TVA : rien.
- **Le rapport X** : il garde son détail de session, son journal de mouvements
  et son rapprochement. Ce n'est pas un document scellé.
- **La liste des rapports Z** (`RapportZPage.tsx`, colonne « Sessions ») : c'est
  un index, pas le document, et ses lignes ne portent pas `schema_version`.
- **`aggregateZ` reste le chemin unique**, partagé avec `z-repair`, et
  `z_lignes.go` reste le classificateur partagé avec le X.

## 7. v5 — la liste des documents, et le libellé TVA

*Même jour, après le rejeu du v4.*

**`sales_documents`** porte les pièces de la ligne 1 : `id`, `number`, `kind`
(`ticket` / `invoice`), `issued_at`, `method`, HT, TVA, TTC. Stockée dans le
document, **dans le hash**, triée (date, numéro, id) — le tri est du calcul :
`FindRecordsByFilter` ne promet aucun ordre, et sans lui deux rejeux du même
rapport donneraient deux hash.

Elle remplace la liste que le PDF rechargeait à l'impression depuis
`/api/pos/session/:id/tickets` (`usePrintReport.tsx`) **[lu]** : celle-là était
l'état d'aujourd'hui et non ce qui avait été compté, ignorait les factures hors
caisse, et échappait au hash. Ce chargement est supprimé.

| Ticket | Fait | Où |
|---|---|---|
| L-1 | migration `AddSalesDocumentsToZReports`, **inscrite** | `z_reports_sales_counts.go`, `migrations.go` |
| L-2 | `aggregateZ` construit et trie la liste ; hash, `saveZReport`, `ecrireRapport` | `cash_reports.go`, `z_repair.go` |
| L-3 | deux gardiens : la liste est le détail exact des compteurs et sa somme égale la ligne 1 ; elle est triée et réécrire une pièce change le hash | `cash_reports_test.go` |
| L-4 | `estZListeLesDocuments` (**seuil `>= 5`**), bloc écran + PDF, chargement mort retiré | `cash.types.ts`, `RapportZPage.tsx`, `ZReportPDF.tsx`, `usePrintReport.tsx` |
| L-5 | rejeu `z-repair -apply` — même passage que S-6 | **fait** — voir §5 |

**Le libellé TVA.** « Leur TVA a déjà été déclarée à l'émission » est vrai pour
une livraison de biens, **faux pour une prestation de services** sans option
pour les débits (CGI art. 269-2). Remplacé par « leur TVA relève de la période
d'exigibilité du document d'origine », vrai dans les deux régimes, sur l'écran
du Z, le PDF, le journal des ventes et le commentaire de `aggregateZ`.

Le **calcul** n'a pas bougé : la ligne 2 est en TTC seul, ce qui est la position
prudente sous les deux régimes. **Question ouverte au comptable** : si des
prestations sont concernées, la ligne 2 devra porter une TVA que le Z ne calcule
pas aujourd'hui — ce serait une révision du contrat du 23 août, pas un correctif.

## 7 bis. v6 — la liste au format du journal des ventes

*Même jour, après le rejeu du v5. **Non encore rejoué**.*

La liste couvre désormais les **quatre lignes** et chaque pièce porte `heure`,
`kind` (nature), `line`, `customer`, `method`, HT / TVA / TTC. Présentation
alignée sur `JournalDesVentesPage` — même colonnes, même ordre, avoirs en rouge
avec un signe moins — à l'écran **et dans le PDF**.

**Un seul vocabulaire :** `natureDe` et `heureDe` (`journal.go`),
`LigneZ.String()` (`z_lignes.go`) étaient déjà partagés. La seule règle en
double était le nom du client : `resolveurNomClient` a été extraite de
`journal.go` et est appelée par `aggregateZ`.

**Deux règles portées par la liste, et gardées :**

- le montant listé est celui **compté dans sa ligne**, pas le total du document
  (une parente entre déduite de ses acomptes) ;
- les pièces des lignes 2 à 4 n'ont **ni HT ni TVA** — les lignes en TTC seul le
  restent jusque dans le détail.

Gardiens ajoutés : la liste couvre les quatre lignes, une conversion de ticket
n'y figure pas, chaque pièce porte une heure, et une pièce de ligne 4 sans base
HT. `go test ./backend/...` : **ok** **[lu]**.

**Reste :** rejeu `z-repair -apply` pour le v6.

## 8. Suite — ticket C

La **statistique des sessions** dans `/stats`, à côté du journal espèces
(ticket B-1 de `05-…`, toujours ouvert). Elle recueille ce que ce contrat
retire, redécoupé **par journée**. Non commencée.
