# Créer un acompte n'encaisse pas — arbitrage du 30 août 2026

**Arbitrage rendu, et lecture A APPLIQUÉE le 30 août 2026.** Les §1 et §2
décrivent l'état d'AVANT le correctif — ils expliquent pourquoi il a eu lieu et
restent la référence du raisonnement ; les lignes qu'ils citent ont bougé.
Le §5 dit ce qui a changé. Ce qui est déduit est annoncé comme tel.

---

## 1. L'état réel, lu dans le code

### 1.1 Ce que fait la création d'un acompte

`CreateDepositInvoice` (`backend/deposit.go`) :

| Lu à | Ce qui est écrit |
|---|---|
| `backend/deposit.go:235` | `is_paid = false`, sans condition — aucune branche ne le met à `true` dans cette fonction |
| `backend/deposit.go:236` | `is_locked = true` : le document est scellé à la création |
| `backend/deposit.go:238-244` | `total_ht`, `total_tva`, `total_ttc` — l'acompte porte de la TVA (`effectiveTvaRate`) |
| `backend/deposit.go:252-257` | `payment_method` / `payment_method_label` écrits **si l'entrée en fournit** |
| `backend/deposit.go:267-269` | `previous_hash`, `sequence_number`, puis `hash` (chaîne ISCA) |
| `backend/deposit.go:286` | `CreateCashMovementIfEspeces(dao, input.PaymentMethod, …)` — `movement_type: "cash_in"` |

`paid_at` n'est **jamais** écrit par cette fonction (aucune occurrence dans
`CreateDepositInvoice`).

### 1.2 Personne n'alimente `payment_method` à la création

Suivi des appelants, de bout en bout :

- Route : `backend/routes/deposit_routes.go:55`, DTO `DepositCreateInput`
  (`:34-40`) — le champ `payment_method` **existe** et est recopié dans
  `backend.DepositInput` (`:88-89`). La route est ouverte à tout utilisateur
  authentifié (`apis.RequireRecordAuth()`, `:125`).
- Client : `frontend/lib/queries/deposits.ts:81-85` n'ajoute `payment_method`
  au corps que si `input.paymentMethod` est fourni.
- Appelant 1 : `frontend/modules/connect/components/InvoicePaymentDialog.tsx:220-223`
  — construit `{ parentId, percentage }` ou `{ parentId, amount }`. Rien d'autre.
- Appelant 2 : `frontend/modules/cash/components/ticket-detail/useTicketActions.tsx:257`
  — `{ parentId: invoice.id, percentage }`. Rien d'autre.

**Conclusion (lue, pas déduite)** : dans l'application, un acompte naît toujours
`is_paid = false`, sans moyen de paiement, et `CreateCashMovementIfEspeces` est
appelé avec la chaîne vide — donc sort immédiatement
(`backend/cash_movement_helper.go:36-38`). Le chemin « acompte encaissé à la
création » est du **code mort côté application**, mais il reste **atteignable par
la route HTTP**, avec `{"parent_id":…, "percentage":…, "payment_method":"especes"}`.

### 1.3 Par où un acompte passe à `is_paid`

`RecordPayment` (`backend/pay.go:48`), appelée par `POST /api/invoices/:id/pay`.
Elle n'exclut pas les acomptes : elle refuse les tickets POS (`pay.go:59-61`),
les brouillons (`pay.go:65-67`), les avoirs (`pay.go:70-72`) et les factures
déjà payées (`pay.go:75-77`). Elle pose `is_paid` et `paid_at` (`pay.go:90-91`)
puis crée le mouvement de caisse (`pay.go:122`).

Côté écran, c'est déjà le geste attendu :
`frontend/lib/invoices/next-action.ts:199-207` donne à un acompte non réglé
l'action **primaire** « Encaisser » (état 8), et `canMarkAsPaid` accepte
explicitement `invoice_type === 'deposit'`
(`frontend/lib/types/invoice.types.ts:392-399`).

**Le geste en deux temps est donc déjà celui de l'interface.**

### 1.4 Pourquoi payer après coup ne casse rien

`is_paid`, `paid_at`, `payment_method` et `payment_method_label` sont dans
`allowedInvoiceUpdates` (`backend/hooks/invoice_hooks.go:32-45`) et hors du champ
haché (`backend/hash/hash.go:44`). Encaisser un document scellé ne touche donc
**ni le hash ni la chaîne ISCA** — c'est écrit, pas supposé.

### 1.5 Ce que le Z fait d'un acompte

- Sélection des documents hors caisse :
  `is_paid = true && paid_at ∈ [début, fin]` — `backend/reports/cash_reports.go:653`
  (Z) et `:243` (X).
- Classement : `backend/reports/z_lignes.go:212-214` — `invoice_type == "deposit"`
  ⇒ **ligne 3**, en TTC seul.
- Le montant entre dans `collected_ttc` et dans `collected_by_method`.

Donc, **aujourd'hui** : un acompte créé n'entre nulle part dans le Z tant qu'il
n'est pas encaissé, et il y entre à la date de son encaissement. C'est cohérent.

`CreateBalanceInvoice` refuse par ailleurs de générer le solde tant qu'un acompte
non remboursé porte `is_paid = false` (`backend/deposit.go:402-407`). Le dossier
est bloqué au bon endroit : à l'encaissement, pas à l'émission.

---

## 2. Les deux lectures

### A — La création n'encaisse pas

Le serveur perd `PaymentMethod` / `PaymentMethodLabel` de `DepositInput` et du
DTO de la route, et l'appel de `deposit.go:286` disparaît. Le geste reste en deux
temps : émettre, puis encaisser par `POST /api/invoices/:id/pay`.

**Fiscalement.** L'acompte est un document numéroté et scellé à l'émission ; la
TVA sur acompte est exigible à l'**encaissement** (CGI art. 269-2-c). La lecture
A fait porter la date d'exigibilité par `paid_at`, écrit au moment où l'argent
arrive — un champ, une date, un fait. Un acompte émis et non encaissé n'est alors
jamais compté comme encaissé, ce qui est exactement la règle.

**Sur le Z.** Rien ne change : le Z sélectionne déjà sur `is_paid`/`paid_at`
(`cash_reports.go:653`), et le mouvement `cash_in` naît en même temps que
`is_paid` (`pay.go:90-122`). Document et tiroir ne peuvent pas diverger, parce
qu'un seul chemin les écrit.

**Acomptes déjà en base.** Aucun effet : tous portent `is_paid = false` à la
création, et ceux qui sont réglés le sont passés par `pay.go`.

**Migration.** Aucune. C'est la suppression d'un code que l'application
n'atteint pas.

*Déduit, non mesuré :* si un acompte en base porte un `payment_method` non vide
avec `is_paid = false`, c'est la trace d'un appel HTTP direct. La suppression ne
le répare pas — elle empêche le suivant. Requête au §6.

### B — La création encaisse quand un moyen est fourni

Il faudrait alors poser `is_paid = true` et `paid_at` **en même temps** que le
mouvement de caisse.

**Fiscalement.** Défendable en soi : au comptoir, le client verse 30 % et repart
— émission et encaissement coïncident réellement, et la TVA sur acompte devient
exigible ce jour-là. Mais la forme **actuelle** de B est fausse : elle écrit un
`cash_in` au tiroir (`deposit.go:286`) sans poser `is_paid`. Le document dit
« non encaissé », le tiroir dit « argent entré ».

**Sur le Z, dans l'état actuel du code.** Ce déséquilibre est chiffrable :
l'acompte n'entre pas dans `collected_ttc` (filtre `is_paid = true`,
`cash_reports.go:653`), mais le mouvement, lui, est bien un mouvement de vente au
sens de `estMouvementDeVente` (`backend/reports/journal_especes.go:115-118` — il
porte `related_invoice`). Il entre donc dans le journal des espèces et dans le
fonds reporté (`backend/reports/fonds_reporte.go`). Sur un Z v3, qui ne rapproche
plus le tiroir, l'écart ne serait **pas signalé** : il se propagerait en silence
dans le fonds de la journée suivante.

**Acomptes déjà en base.** B corrigée ne changerait rien au passé — on ne touche
pas aux documents scellés — mais créerait **deux générations d'acomptes** dont la
sémantique de `is_paid` diffère selon la date de création, sans champ pour les
distinguer. C'est précisément ce que `schema_version` résout pour le Z
(`04-refonte-du-z.md`) et qui n'existe pas ici.

**Migration.** Aucune migration de données, mais un besoin de versionner le
contrat de l'acompte — donc plus de travail que A, pour un geste que l'interface
ne demande pas.

---

## 3. Recommandation — A

**Retenir A : la création d'un acompte n'encaisse pas.** Concrètement : retirer
`PaymentMethod` et `PaymentMethodLabel` de `backend.DepositInput` et du DTO de la
route, et supprimer l'appel de `deposit.go:286`.

Trois motifs, tous lus dans le code :

1. **C'est déjà le comportement de l'application.** Les deux appelants n'envoient
   pas de moyen de paiement, et l'écran offre « Encaisser » comme action primaire
   sur un acompte non réglé (`next-action.ts:199-207`). A supprime du code mort,
   elle ne change aucun geste au comptoir.
2. **Un seul chemin écrit l'encaissement.** `pay.go` pose ensemble `is_paid`,
   `paid_at` et le mouvement de caisse. Garder un second chemin qui pose le
   mouvement sans les deux autres relève de la même famille de faute que la
   régression du 20 mai 2026 : deux implémentations de la même règle.
3. **Rien à réparer dans le passé.** A ne demande aucune migration et ne touche
   aucun document scellé.

**Pourquoi B est écartée.** Non parce qu'elle serait fiscalement fausse — un
acompte encaissé au comptoir est un fait réel — mais parce qu'elle demande de
versionner la sémantique de `is_paid` sur les acomptes pour un gain nul : le même
résultat s'obtient aujourd'hui en enchaînant les deux gestes, et le dialogue
d'encaissement existe déjà. Si le comptoir réclame un jour un geste unique, la
bonne forme est **une route qui appelle `CreateDepositInvoice` puis
`RecordPayment`**, dans cet ordre — pas une seconde écriture de l'encaissement
dans `deposit.go`.

**Migration nécessaire : aucune.**
**Sort des acomptes déjà en base : inchangé**, aucun `is_paid` rétroactif.

---

## 4. Point 3 — le test `"especes"` contre les codes réels

**Verdict : le test fonctionne encore, mais par un adaptateur côté client, et il
est fragile.**

`CreateCashMovementIfEspeces` compare littéralement à `"especes"`
(`backend/cash_movement_helper.go:36`). La collection `payment_methods` stocke
bien le code `cash`, de nom « Espèces »
(`backend/migrations/payment_methods_migration.go:211-213`,
`backend/migrations/ensure_payment_methods.go:106-108`). Mais le front **traduit
avant d'envoyer** : `getPaymentMethodCode` mappe `cash → especes`, `card → cb`,
`check → cheque`, `transfer → virement`, et **tout le reste → `autre`**
(`frontend/modules/cash/components/terminal/types/payment.ts:150-168`) ;
`getMainPaymentMethodCode` (`:186-192`) rend `multi` au-delà d'une entrée.

Ses trois appelants reçoivent donc bien `"especes"` pour un règlement espèces :

- `pay.go:122` — via `InvoicePaymentDialog.tsx:150,164`.
- `refund.go:277` — `RefundMethod`, typé `'especes' | 'cb' | 'cheque' | 'autre'`
  (`frontend/lib/queries/invoices.ts:41,120`).
- `deposit.go:286` — jamais alimenté (§1.2).

**Deux angles morts, lus dans le code, hors périmètre — non corrigés :**

1. **Un moyen personnalisé ne peut pas produire de mouvement de caisse.**
   `getPaymentMethodCode` rend `'autre'` dès que `method.type !== 'default'`
   (`payment.ts:153,167`). Un moyen créé par l'utilisateur avec
   `accounting_category = "cash"` réglerait la facture sans jamais toucher le
   tiroir. Les codes réservés interdits à la création sont `card`, `cash`,
   `check`, `transfer` (`backend/routes/payment_methods_routes.go:88-92`) — rien
   n'interdit la **catégorie** `cash` sur un moyen personnalisé.
2. **Le libellé prime sur le code dans le Z.** `libelleMoyenPaiement` rend
   `payment_method_label` s'il existe, sinon `payment_method`
   (`backend/reports/cash_reports.go:2050-2057`). Or le ticket POS stocke
   `payment_method = "cash"` et `payment_method_label = "Espèces"`
   (`backend/routes/pos_routes.go:289-290,342-345`, alimentés par
   `paymentEntriesToApiPayload`, `payment.ts:62-64`). Les clés de
   `collected_by_method` sont donc des **libellés** (« Espèces », « CB »), et le
   test `method == "especes"` de `cash_reports.go:401` et `:1051` — qui alimente
   `cashFromSales`, exposé en `ExpectedCash.SalesCash` du **rapport X** (`:555`)
   — ne peut pas matcher pour ces documents. *Déduit du code, non mesuré en
   base :* `SalesCash` du X vaut vraisemblablement 0 pour les ventes POS en
   espèces. `collected_by_method` n'en est pas faux pour autant, il est
   simplement clé par libellé ; et le Z v3 ne rapproche plus le tiroir.

Ces deux points ne touchent pas l'arbitrage ci-dessus et ne sont **pas** corrigés
ici, conformément à la consigne.

---

## 5. Ce qui a été appliqué (30 août 2026)

Lecture A, en quatre endroits, plus un gardien :

| Fichier | Changement |
|---|---|
| `backend/deposit.go` | `PaymentMethod` / `PaymentMethodLabel` retirés de `DepositInput` ; l'écriture de `payment_method` et l'appel à `CreateCashMovementIfEspeces` supprimés. Un commentaire dit pourquoi, à côté du type |
| `backend/routes/deposit_routes.go` | `payment_method` / `payment_method_label` retirés de `DepositCreateInput` — la route ne les accepte plus, même en appel direct |
| `frontend/lib/queries/deposits.ts` | `paymentMethod` / `paymentMethodLabel` retirés de `CreateDepositInput` et du corps envoyé |
| `backend/deposit_guard_test.go` | `TestCreerUnAcompteNEncaissePas` : un acompte naît `is_paid = false`, sans `paid_at`, sans moyen de paiement, et **sans aucun `cash_movement`** |

Aucun autre appelant à corriger : les deux écrans n'envoyaient déjà rien (§1.2).

**Aucune migration, aucune écriture sur un document existant.** Le comportement
observable de l'application est inchangé — c'est du code mort qui disparaît, plus
la fermeture de la route HTTP qui permettait de l'atteindre.

Vérifié : `go test ./backend/...` passe en entier (dont
`TestCreerUnAcompteNEncaissePas`, neuf), et `pnpm build:client` construit sans
erreur.

---

## 6. Ce qui n'a pas pu être vérifié

- **L'état de la base.** Aucune requête n'a été exécutée. En particulier :
  existe-t-il des acomptes portant `payment_method` non vide, ou `is_paid = true`
  sans passage par `pay.go` ? Le §1.2 montre qu'aucun écran ne peut en produire,
  mais la route HTTP le permettait jusqu'au correctif du §5. Requête à passer
  sur la base du client : `invoice_type = "deposit" && payment_method != ""`.
  Si elle rend des lignes, elles ne sont **pas** réparées par ce correctif — il
  ferme la porte, il ne relit pas le passé.
- **Les mouvements de caisse orphelins.** Si un tel acompte existe, un `cash_in`
  de source `b2b_deposit` (`deposit.go:296`) peut exister sans document encaissé.
  Non recherché.
- **`SalesCash` du rapport X en production** : la conclusion du §4.2 est déduite
  de la lecture, pas mesurée.
- **Le poste du client tourne sur un build plus ancien** ; ce document décrit le
  dépôt au 30 août 2026, pas ce que ce poste exécute.
