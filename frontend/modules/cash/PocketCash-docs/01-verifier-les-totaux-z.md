# Vérifier les totaux d'un rapport Z contre les tickets réels

Outil d'audit, à ressortir tel quel. Il a servi à établir le double comptage du
20 mai 2026 (§4.6 de [`00-audit-ergonomie-cloture.md`](00-audit-ergonomie-cloture.md)),
et **il doit être rejoué sur la base de production du client** lors du chantier A
— les volumes cités ici sont ceux de la base de développement.

## Précautions

La base vit dans `%LOCALAPPDATA%\PocketReact\pb_data\data.db`. **Travailler sur
une copie**, jamais sur le fichier servi par PocketBase : une ouverture
concurrente en écriture peut corrompre le WAL.

**Copier les trois fichiers, pas seulement `data.db`.** PocketBase tient la base
en mode WAL : les écritures récentes vivent dans `data.db-wal` et ne sont versées
dans `data.db` qu'au checkpoint. Copier `data.db` seul donne une photo
**périmée** — mesuré le 22 août 2026 : un rapport Z généré deux heures plus tôt
était totalement absent de la copie, et la vérification concluait à tort qu'il
n'existait pas.

```bash
for e in "" "-wal" "-shm"; do
  cp "$LOCALAPPDATA/PocketReact/pb_data/data.db$e" "$TEMP/audit_ro.db$e" 2>/dev/null
done
```

SQLite rejouera le WAL à la première ouverture de la copie. Ne jamais ouvrir le
fichier d'origine : un accès concurrent en écriture peut le corrompre.

## La question posée

Un rapport Z stocke ses propres totaux (`total_ht`, `total_tva`, `total_ttc`).
On les recalcule depuis les documents d'origine et on compare :

```
attendu = Σ tickets POS des sessions du Z  +  Σ factures B2B payées ce jour-là
```

Trois verdicts possibles, et c'est leur répartition qui est parlante :

- `correct` — le stocké vaut l'attendu ;
- `DOUBLE` — le stocké vaut `2 × POS + B2B` : les tickets sont comptés deux fois ;
- `B2B ignoré` — le stocké vaut le POS seul : le bloc B2B n'existait pas encore.

## La requête

```sql
WITH d AS (
  SELECT id zid, number, substr(date,1,10) jour,
         owner_company oc, total_ttc stocke, session_ids sids
  FROM z_reports
),
pos AS (
  SELECT d.zid,
         ROUND(COALESCE(SUM(i.total_ttc),0),2) ttc,
         COUNT(i.id) n
  FROM d
  LEFT JOIN json_each(d.sids) s ON 1=1
  LEFT JOIN invoices i ON i.session = s.value
       AND i.is_pos_ticket = 1
       AND i.status <> 'draft'
       AND i.invoice_type <> 'credit_note'
  GROUP BY d.zid
),
b2b AS (
  SELECT d.zid,
         ROUND(COALESCE(SUM(i.total_ttc),0),2) ttc,
         COUNT(i.id) n
  FROM d
  LEFT JOIN invoices i ON i.is_pos_ticket = 0
       AND i.is_paid = 1
       AND i.status <> 'draft'
       AND i.invoice_type IN ('invoice','deposit')
       AND COALESCE(i.original_invoice_id,'') = ''
       AND i.owner_company = d.oc
       AND i.paid_at >= d.jour || ' 00:00:00'
       AND i.paid_at <  date(d.jour,'+1 day') || ' 00:00:00'
  GROUP BY d.zid
)
SELECT d.number, d.jour,
       pos.n AS tickets, pos.ttc AS pos_ttc,
       b2b.n AS factures, b2b.ttc AS b2b_ttc,
       d.stocke,
       CASE
         WHEN ABS(d.stocke - (2*pos.ttc + b2b.ttc)) < 0.02 THEN 'DOUBLE'
         WHEN ABS(d.stocke - (pos.ttc + b2b.ttc))   < 0.02 THEN 'correct'
         WHEN ABS(d.stocke - pos.ttc)               < 0.02 THEN 'B2B ignore'
         ELSE '???'
       END AS verdict
FROM d
JOIN pos ON pos.zid = d.zid
JOIN b2b ON b2b.zid = d.zid
ORDER BY d.jour;
```

## Ce qu'elle a donné sur la base de dév, le 21 août 2026

45 rapports Z, du 7 janvier au 21 août 2026, et une rupture nette :

| Période | Rapports | Verdict |
|---|---|---|
| Z-001 → Z-021 (7 jan → 16 mai) | 21 | `correct` ou `B2B ignoré` — les tickets comptés une fois, les factures B2B pas encore agrégées |
| Z-022 → Z-045 (22 mai → 21 août) | 24 | `DOUBLE` — tickets comptés deux fois |

La bascule tombe entre le 16 et le 22 mai. Le commit **156692e du 20 mai 2026**
(« fix b2b to facture ») a ajouté `aggregateInvoiceIntoTotals` sans retirer le
`totalTTC += sessionTTC` qui suivait la boucle : une régression purement
additive, invisible en relecture parce que les deux écritures sont à cinquante
lignes d'écart.

Cas le plus lisible, `Z-2026-000045` — aucune facture B2B ce jour-là :

| | Tickets réels | Stocké |
|---|---|---|
| Tickets | 21 | 21 ✅ |
| HT | 824,03 € | **1 648,06 €** |
| TVA | 155,78 € | **311,56 €** |
| TTC | 979,81 € | **1 959,62 €** |

## Le contrôle rapide, sans recalcul

Un Z sain ne se contredit pas lui-même. Sans toucher aux tickets, on peut
comparer un rapport à ses propres ventilations :

```sql
SELECT number, substr(date,1,10) jour, total_ttc,
       (SELECT ROUND(SUM(value),2) FROM json_each(totals_by_method)) AS somme_moyens,
       total_tva,
       (SELECT ROUND(SUM(json_extract(value,'$.vat_amount')),2)
        FROM json_each(vat_breakdown)) AS tva_ventilee
FROM z_reports
ORDER BY date DESC LIMIT 10;
```

`total_ttc` doit égaler `somme_moyens`, et `total_tva` doit égaler
`tva_ventilee`. **C'est la vérification à rejouer après le premier Z généré
post-correctif** : si les deux colonnes coïncident, le correctif tient sur des
données réelles.

Ce même invariant est gardé en Go par
`TestLesTotauxDuZEgalentLeursVentilations`
(`backend/reports/cash_reports_test.go`), qui ne dépend d'aucune base.

## Limites

- Le fenêtrage B2B recopie celui du code (`loadB2BInvoicesForDay`,
  `cash_reports.go:513`). Sur quelques journées, la requête et le code divergent
  d'une facture — un `paid_at` en bord de fenêtre, un acompte. Le verdict
  `DOUBLE` reste fiable : il porte sur le facteur 2 appliqué au POS, que
  l'écart B2B ne peut pas produire.
- La requête ne dit rien des **avoirs** ni des espèces attendues, qui suivent
  d'autres chemins (§2.3 de l'audit).
