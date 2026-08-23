# 03 — Audit : intégrité de hachage, « B2B », tickets convertis

*23 août 2026. Diagnostic seul, aucune écriture. Base de production copiée
(`data.db` + `-wal` + `-shm`) depuis `%LOCALAPPDATA%\PocketReact\pb_data`
vers le scratchpad, lue en lecture seule.*

Convention : **[lu]** = chemin et ligne dans le dépôt, ou requête sur la copie
de production. **[supposé]** = non démontré, dit comme tel.

---

## 0. Périmètre mesuré sur la production

1205 documents dans `invoices`, une seule entreprise (`468mpen5lhg6u0v`).

| Type | Nombre |
|---|---|
| Tickets POS (`is_pos_ticket = 1`) | 829 |
| Factures et acomptes hors caisse | 333 |
| Avoirs | 43 |

Recalcul du hash de chaque document **selon les règles exactes de
`ComputeDocumentHash`** (`backend/hash/hash.go:44`), reproduites champ par champ
sur la copie :

| Critère | Documents en échec |
|---|---|
| **hash recalculé ≠ hash stocké** | **0** |
| **rupture de chaîne** (`previous_hash` ≠ `hash` du `sequence_number - 1`) | **0** |
| **discontinuité de séquence** (prédécesseur inexistant) | **1** — `FAC-2025-000004`, `sequence_number = 5` |
| **document non chaîné** (`sequence_number = 0` ou `hash` vide) | **6** |

Détail :

- Les **1199 documents chaînés** portent des `sequence_number` de 1 à 1201,
  **sans doublon**, avec **deux valeurs manquantes : 3 et 4**.
- `FAC-2025-000004` (seq 5) a `previous_hash = GENESIS`, pas le hash de seq 4.
  Sa numérotation (`000004`) indique que trois factures et un avoir l'ont
  précédé : les documents 3 et 4 **ont existé puis ont disparu**. Seuls les
  brouillons non verrouillés sont supprimables
  (`backend/hooks/invoice_hooks.go:810-820`), ce qui n'explique pas qu'ils
  aient consommé une séquence. **[fil perdu]** — je ne sais pas dire depuis le
  code pourquoi ce document est reparti du hash de genèse ; c'est antérieur au
  10 décembre 2025 et sans trace exploitable.
- Les **6 documents non chaînés sont les 6 brouillons** : `status = 'draft'`,
  `number` vide, `hash` vide, `sequence_number = 0`, du 13/02/2026 au
  17/07/2026.

**Il n'y a donc aucune altération de document en production.** La chaîne est
saine sur 1197 documents consécutifs.

---

## 1. D'où vient l'erreur affichée, et comment la corriger

### 1.1 Ce n'est pas une divergence Go / TypeScript

Les deux implémentations ont été comparées champ par champ :

| Point | Go `backend/hash/hash.go` | TS `frontend/lib/queries/closures.ts` | Verdict |
|---|---|---|---|
| Champs et champ optionnel | `:62-81` | `:648-665` | identiques |
| Ordre des clés | `sort.Strings` `:147-152` | `Object.keys().sort()` `:668` | identiques |
| JSON construit à la main | `:154-167` | `:671-677` | identiques |
| Date | 10 premiers caractères `:120-133` | `substring(0,10)` `:623-627` | identique |
| Montant | `math.Round(x*100)/100` `:140` | `Math.round(x*100)/100` `:613-615` | **divergent en théorie**, voir ci-dessous |

Le seul écart réel est l'arrondi des **valeurs négatives** : Go arrondit la
demie **à l'opposé de zéro** (`math.Round(-0.5) = -1`), JavaScript
**vers +∞** (`Math.round(-0.5) = -0`). Les avoirs portant des totaux négatifs,
c'est un piège armé. **Mesuré sur les 1205 documents (3615 montants) : zéro
divergence aujourd'hui.** Le risque est latent, pas actif.

Deuxième écart latent, non déclenché en production : Go écrit `""` pour un
champ absent (`record.GetString`), tandis que `JSON.stringify(undefined)` rend
`undefined` et produirait un JSON invalide. Tous les documents ont `customer`
et `previous_hash` renseignés — **[lu]** : `customer <> ''` sur 1205/1205.

### 1.2 Ce n'est pas non plus le filtrage par type

La piste du filtre par type était plausible mais **est infirmée** : dans
`useVerifyInvoiceChain` (`closures.ts:259`), la liste est bien filtrée par type
(`:272-282`), mais la recherche du prédécesseur (`:347` et `:356`) interroge
`owner_company` **sans filtre de type**. Le maillon cherché est donc le vrai
maillon. La séquence est bien commune à tous les types — confirmé côté
création : `getLastInvoice` (`invoice_hooks.go:1330`) trie sur
`-sequence_number` pour toute l'entreprise, sans distinguer ticket, facture ou
avoir, et `invoice_hooks.go:456-459` incrémente à partir de là.

### 1.3 La cause racine : les brouillons entrent dans le contrôle d'intégrité

Les hooks **refusent délibérément** de numéroter et de hacher un brouillon :

> `invoice_hooks.go:441` — « CAS 1 : Brouillon → pas de numéro, pas de hash »

C'est la bonne règle : un brouillon n'est pas un document fiscal. Mais **aucune
des trois vérifications côté client n'exclut `status = 'draft'`** :

- `useIntegritySummary` (`closures.ts:427-429`) : filtre `owner_company` seul.
- `useVerifyInvoiceChain` (`closures.ts:284-287`) : filtre le type, pas le statut.
- `useVerifyInvoiceIntegrity` (`closures.ts:209`) : document unique.

Un brouillon tombe donc dans la branche « non chaîné » (`closures.ts:317-325`,
`:465-469`) et est compté **invalide**. Le badge rouge de
`frontend/modules/connect/pages/invoices/InvoicesPage.tsx:653-656` affiche
`integritySummary.invalidDocuments`.

**En production, l'erreur affichée vaut 6 brouillons — plus 1 selon l'écran.**

### 1.4 Deux écrans qui ne comptent pas pareil

Sur la discontinuité de séquence, les deux fonctions divergent :

- `useIntegritySummary` (`closures.ts:481-484`) : prédécesseur introuvable →
  `chainValid = false`. `FAC-2025-000004` est donc **invalide**.
- `useVerifyInvoiceChain` (`closures.ts:356-363`) : si la recherche ne rend
  rien, `chainValid` **reste à `true`** (initialisé `:315`). Le même document
  est **valide**.

Le badge global annonce donc **7 documents invalides**, et le rapport détaillé
lancé depuis le même écran en annonce **6**. Ce n'est pas un bug de hachage,
c'est deux copies d'une même règle qui ont divergé.

### 1.5 Les outils Go existants

- `VerifyChainIntegrity` (`backend/hash/migrate.go:140`) et
  `VerifyInvoicesChain` (`backend/hash/migrate_invoices_only.go:373`) existent
  et s'appuient sur `hash.ComputeDocumentHash` — donc sur la bonne source. Ils
  ne sont exposés par aucune route ni aucun bouton **[lu : aucun appelant en
  dehors de `backend/hash/`]**.
- **Recommandation : ne pas écrire un quatrième vérificateur.** Il en existe
  déjà trois côté client et deux côté Go, tous des copies partielles les uns
  des autres. Voir tickets I2 / I3.

### 1.6 Correction proposée

Aucune donnée à réparer : la chaîne est intacte. Ce qui doit changer est le
**contrôle**, pas les documents. Trois remèdes distincts, à ne pas confondre :

| Cause | Remède | Nature |
|---|---|---|
| 6 brouillons | les exclure du contrôle, ou les afficher dans une catégorie « non applicable » | **affichage** |
| Discontinuité seq 3–4 | l'admettre comme fait historique daté et documenté, et l'afficher en « avertissement », pas en « rupture » | **affichage + doc** |
| Divergence Go/TS latente | une seule implémentation, côté Go, exposée par une route | **calcul** |

---

## 2. « Facture B2B » est un nom impropre

### 2.1 Deux sens sous un mot

**Sens 1 — « B2B » dans `backend/reports/cash_reports.go`** : le mot désigne
`is_pos_ticket = false`, c'est-à-dire **un document qui n'est pas passé par la
caisse**. Rien d'autre. Voir les filtres `:218` et `:518`, les commentaires
`:208`, `:507-513`, et les journaux `:231`, `:539`.

**Sens 2 — la ventilation e-reporting** : elle repose sur `customer_type` du
client (`cash_reports.go:264`, `:701`), traduit en B2C/B2B par
`CUSTOMER_TYPE_EREPORTING` (`frontend/lib/types/cash.types.ts:349-353`) :

- `individual` → B2C
- `professional`, `administration`, `association` → B2B

Ce sens-là est le bon au sens fiscal. Il en existe donc **quatre** valeurs, et
non deux.

### 2.2 Les deux sens ne se recouvrent pas — mesuré

| `is_pos_ticket` | `customer_type` | Documents | TTC |
|---|---|---|---|
| 0 (« B2B » du code) | individual | **341** | 78 274,71 € |
| 0 | association | 19 | 5 424,48 € |
| 0 | administration | 5 | 1 046,60 € |
| 0 | professional | 11 | 1 564,45 € |
| 1 (caisse) | individual | 829 | 35 995,48 € |

**91 % de ce que le code appelle « B2B » sont des particuliers.** Le mot est
donc faux dans le code — mais **il ne fuit pas jusqu'à l'utilisateur** : aucun
composant d'interface n'affiche le sens 1.

**[lu]** Les composants n'emploient que le sens 2 : `ZReportPDF.tsx:178`,
`:662-690`, `RapportXDialog.tsx:118`, `:219`, `RapportZPage.tsx:398`, `:691`,
`SalesCard.tsx` — tous partent de `by_customer_type`, jamais de
`is_pos_ticket`. La distinction montrée à l'utilisateur **correspond donc bien
à quelque chose de réel** : le type de client déclaré.

Réserve : tous les tickets POS pointent un client « comptoir » unique
(`dcamrb8w3565jm9`, 844 documents, typé `individual`). La ventilation
e-reporting des tickets est donc entièrement portée par ce client par défaut,
pas par une saisie réelle. La branche « ticket sans client → individual par
défaut » (`cash_reports.go:325`) **ne se déclenche jamais** : `customer` est
renseigné sur 1205/1205.

### 2.3 Vocabulaire proposé

| Notion | Nom actuel | Nom proposé |
|---|---|---|
| `is_pos_ticket = false` | « facture B2B » | **« document hors caisse »** (`hors_caisse`, `offCounter`) |
| `is_pos_ticket = true` | « POS » | **« ticket de caisse »** |
| `customer_type ∈ {professional, administration, association}` | B2B | **« client professionnel »** — garder « B2B » **uniquement** dans le bloc e-reporting, où c'est le terme réglementaire |

Règle : le mot « B2B » ne doit plus apparaître à moins d'un mètre de
`is_pos_ticket`. Renommer `b2bInvoices`, `b2bFilter`, `loadB2BInvoicesForDay`,
`b2bInvoiceCount`, `b2bCreditNotesTotal` et les commentaires associés.

---

## 3. Que deviennent les tickets convertis en factures

Point d'entrée : `frontend/modules/cash/ConvertTicketToInvoicePage.tsx:160-229`.
**Il n'y a pas de route serveur dédiée** : la conversion est un
`pb.collection('invoices').create()` fait depuis le client (`:192`).

### 3.1 Ce qui se passe, lu dans le code

- **Le ticket d'origine est conservé intact.** Aucune écriture dessus dans la
  mutation. Son `hash`, son `sequence_number`, son `number`, ses totaux et son
  rattachement de session ne bougent pas. **Son hash survit.**
- **La facture produite est un document neuf et complet** : `is_pos_ticket:
  false`, `session: null`, `cash_register: null` (`:207-209`), items et totaux
  **recopiés** du ticket (`:201-204`). Les hooks lui attribuent un **nouveau
  `number`** et une **nouvelle place dans la séquence commune**
  (`invoice_hooks.go:447-479`), et calculent son propre hash.
- **Le lien est tracé deux fois**, dans les deux sens :
  - sens facture → ticket : `original_invoice_id: ticketId` (`:206`) ;
  - sens ticket → facture : posé **par un hook**, pas par la page —
    `invoice_hooks.go:514-520` écrit `converted_to_invoice = true` et
    `converted_invoice_id` sur le ticket, après création, en refusant une
    seconde conversion (`:515-516`).
- Une garde côté client empêche aussi la double conversion (`:167-176`).

**Mesuré en production : 35 conversions**, 6 581,36 € TTC, cohérentes des deux
côtés (35 tickets marqués `converted_to_invoice`, 35 factures pointant un
ticket).

### 3.2 Le risque de double comptage

**Oui, il existe. Il est couvert dans les rapports de caisse, pas dans la
clôture journalière.**

- **Rapports X et Z — protégés.** Les filtres `cash_reports.go:218` et `:518`
  ajoutent `original_invoice_id = ''`, ce qui exclut les factures de
  conversion. Le chiffre d'affaires est compté une fois, sur le ticket, dans sa
  session.
- **Clôture journalière — non protégée.** `closures.ts:131-143` charge
  `is_pos_ticket = false` sur la journée, **sans exclure `original_invoice_id`
  ni `status = 'draft'`**, et somme `total_ht/tva/ttc`. Les factures de
  conversion y entrent, alors que leur montant est déjà dans le Z du jour du
  ticket. Les brouillons y entrent aussi, et leur `hash` vide est concaténé
  dans le `cumulative_hash` (`:145-146`).

### 3.3 Un effet de bord du garde-fou

`original_invoice_id` porte **trois significations** — mesuré :

| Document | Cible de `original_invoice_id` | Nombre |
|---|---|---|
| avoir | le document annulé | 43 |
| **acompte** | la facture rattachée | **20** |
| facture | le ticket converti | 35 |
| facture | une autre facture hors caisse | 6 |

Or les filtres X/Z acceptent `invoice_type = 'deposit'` **et** exigent
`original_invoice_id = ''`. Comme **les 20 acomptes ont tous un
`original_invoice_id` non vide**, aucun acompte n'est jamais compté dans un X
ni dans un Z.

### 3.4 Vérification du parcours d'acompte — l'exclusion est correcte

*Ajouté après vérification. La réserve du §3.3 est levée : le chiffre d'affaires
des acomptes n'est pas perdu, et le ticket C1 tel que formulé était faux.*

Le modèle, lu dans `backend/deposit.go` :

- **La facture parente porte le montant total**, et son `original_invoice_id`
  est vide — elle est donc bien éligible aux X/Z. Mesuré : 19 factures
  parentes, **19 avec `original_invoice_id = ''`**, 7 752,81 € TTC au total.
- **L'acompte** (`CreateDepositInvoice`, `deposit.go:59`) est un document à part
  (`invoice_type = 'deposit'`, `:209`) qui pointe la parente (`:228`) et met à
  jour `deposits_total_ttc` et `balance_due` sur elle (`:290-291`).
- **La facture de solde** (`CreateBalanceInvoice`, `deposit.go:309`) est une
  facture (`invoice_type = 'invoice'`, `:444`) qui ne porte que le **reste à
  payer** (`total_ttc = balanceDue`, `:459`), avec une ligne déductive par
  acompte (`:387-397`), et qui pointe la parente (`:464`). Ce sont les
  **6 « factures pointant une autre facture »** du tableau ci-dessus.

Compté sur un cas réel : parente `FAC-2026-000076` 750 €, acompte
`ACC-2026-000001` 225 €, solde `FAC-2026-000079` 525 €, les trois soldés le
16/03/2026. Le filtre X/Z retient **la seule parente, 750 €** ; l'acompte et le
solde sont écartés par `original_invoice_id = ''`. **Le compte est juste, une
seule fois.** Vérifié sur les 6 dossiers menés à leur terme.

**Exclure acomptes et factures de solde des X/Z est donc la bonne règle**, pas
un bug. Deux remarques subsistent, plus petites :

1. **Trésorerie, pas chiffre d'affaires.** Quand la parente n'est pas encore
   soldée, l'argent est encaissé sans qu'aucun rapport de caisse ne le montre.
   Mesuré : **5 acomptes encaissés pour 1 062,73 € dont la facture parente
   n'est pas marquée payée** — 717,31 € en CB, 205,42 € en chèque et
   **140 € en espèces**. Le CA n'est pas perdu (il tombera avec la parente),
   mais le fond de caisse du jour porte 140 € que le Z n'annonce pas. C'est un
   écart de caisse, pas une erreur de TVA. **[supposé]** que le comptage
   physique s'en accommode : non vérifié.
### 3.5 Vérification du point 1 ci-dessus — [supposé] levé le 23 août 2026

*Ajouté après mesure. La réserve « le comptage physique s'en accommode : non
vérifié » est tranchée, et sa portée était plus large que formulée.*

Les encaissements espèces **hors caisse** créent un `cash_movements` via
`CreateCashMovementIfEspeces` (`backend/cash_movement_helper.go:36`), appelé
depuis `pay.go:122`, `deposit.go:265` et `refund.go:277`. Ils entrent donc dans
les espèces attendues, qui valent `opening_float + (cash_in − cash_out −
refund_out − safe_drop)`.

**Mais ce helper a été créé le 20 mai 2026**, commit `bd8500c` « fix espece
facture to caisse » — le même jour que la régression des Z, sans lien avec elle.
Mesuré sur la production :

| Période | Documents espèces hors caisse | TTC | Avec mouvement de caisse |
|---|---|---|---|
| Avant le 20/05/2026 | 11 (8 factures, 3 acomptes) | **1 826,45 €** | **0** |
| Depuis le 20/05/2026 | 16 factures | 5 498,63 € | **16 — tous** |

**Le mécanisme fonctionne**, vérifié sur 16 cas réels. **Avant le 20 mai,
1 826,45 € d'espèces sont entrés dans le tiroir sans aucune écriture au
journal** : les espèces attendues de ces sessions étaient sous-évaluées
d'autant, et le comptage a dû faire apparaître des excédents inexpliqués. Ce
n'est pas un défaut de session (des sessions étaient bien ouvertes à ces dates,
vérifié) : le code n'existait pas encore.

Deux conséquences pour la lecture de ce document :

- Le chiffrage « 1 062,73 € dont 140 € en espèces » du point 1 mesurait les
  acomptes sur parente non soldée. **Le vrai périmètre est plus large** et ne
  tient pas aux acomptes : c'est tout l'encaissement espèces hors caisse
  antérieur au 20 mai, acomptes compris (415 € sur les 1 826,45 €).
- **Sans effet sur le CA ni sur la TVA** — uniquement sur le rapprochement de
  caisse, et uniquement pour le passé. Aucun acompte espèces n'a été encaissé
  depuis le 20 mai : le chemin acompte → mouvement reste donc **non éprouvé en
  production**, même s'il est identique à celui des factures, éprouvé 16 fois.

---

**Reprise du §3.4 :**

2. **`invoice_type = 'deposit'` dans les filtres `cash_reports.go:218` et
   `:518` est du code mort** : combiné à `original_invoice_id = ''`, aucun
   acompte ne peut le satisfaire. Par conséquent `DepositsCount` et
   `DepositsTTC` (`cash_reports.go:311-313`, `:466-467`) **valent toujours
   zéro** dans un rapport X, et le bloc « Acomptes séparés » ne montrera jamais
   rien. **[lu]** : les 20 acomptes ont tous `is_pos_ticket = 0` et un
   `original_invoice_id` non vide.

Écart de cohérence relevé au passage, sans effet sur les rapports :
`balance_due` n'est pas remis à jour au paiement — sur 5 factures parentes
soldées, il vaut 0 alors que `total_ttc - deposits_total_ttc` ne l'est pas
(`FAC-2026-000165`, `000134`, `000118`, `000107`, `000076`). Champ d'affichage
seulement, il n'entre ni dans le hash ni dans les agrégats.

---

## 4. Plan par tickets

Ordonnés. La colonne « nature » sépare ce qui se voit, ce qui se calcule et ce
qui se déclare.

| # | Ticket | Nature | Pourquoi maintenant |
|---|---|---|---|
| **I1** | ~~Exclure `status = 'draft'` des trois vérifications d'intégrité~~ — **appliqué le 23/08/2026, voir §7** | **affichage** | Supprime 6 des 7 alertes, sans toucher une donnée |
| **I2** | ~~Aligner `useIntegritySummary` et `useVerifyInvoiceChain` sur le cas « prédécesseur absent »~~ — **appliqué le 23/08/2026, voir §7** | **affichage** | Deux écrans ne peuvent pas donner deux chiffres |
| **I3** | Exposer `VerifyInvoicesChain` (`migrate_invoices_only.go:373`) par une route authentifiée et faire consommer cette route par l'écran ; retirer `computeDocumentHash` de `closures.ts` | **calcul** | Une seule implémentation ; ferme la divergence d'arrondi négatif |
| **I4** | Consigner la discontinuité seq 3–4 (documents supprimés avant le 10/12/2025, `FAC-2025-000004` reparti du hash de genèse) dans `docs/DECISIONS.md`, et l'admettre comme exception connue | **doc** | Sinon elle sera rediagnostiquée tous les six mois |
| ~~**C1**~~ | ~~Trancher le sort des 20 acomptes exclus des X/Z~~ — **annulé, vérifié §3.4** : la facture parente porte le montant total et n'est pas exclue ; le compte est juste | — | — |
| **C1bis** | Retirer `invoice_type = 'deposit'` des filtres `cash_reports.go:218` et `:518`, ou retirer `DepositsCount`/`DepositsTTC` du rapport X : la condition est inatteignable et les deux compteurs valent toujours zéro | **calcul** (code mort) | Un bloc « Acomptes » vide en permanence laisse croire qu'il n'y a pas eu d'acompte |
| **C1ter** | Décider si les acomptes encaissés sur facture non soldée doivent apparaître au Z en trésorerie (hors CA) — 1 062,73 € aujourd'hui, dont 140 € en espèces | **affichage ou calcul, à trancher** | Écart possible entre le fond de caisse compté et le Z ; sans effet sur la TVA |
| **C2** | ~~Ajouter à `closures.ts:131` l'exclusion `status != 'draft'` **et** l'exclusion des factures de conversion~~ — **appliqué le 23/08/2026, voir §6** | **calcul** | 6 581,36 € comptés deux fois dans les clôtures journalières |
| **S1** | Séparer les rôles de `original_invoice_id` : un champ par relation (`credit_note_of`, `deposit_of`, `converted_from_ticket`), ou un `relation_kind` à côté | **schéma** | Un champ **haché** qui porte trois sens est une bombe à retardement ; par migration, sans réécrire les hash existants |
| **S2** | Renommer le vocabulaire « B2B » → « hors caisse » dans `cash_reports.go` (§2.3) ; ne garder « B2B » que dans le bloc e-reporting | **doc + code sans effet fonctionnel** | Aucun risque : le sens 1 n'atteint pas l'interface |
| **S3** | Vérifier la double inscription de `OnRecordBeforeCreateRequest("invoices")` — `RegisterInvoiceHooks:274` et `RegisterClosureHooks:908` implémentent tous deux numérotation, chaînage et hachage | **calcul** | Deux hooks concurrents sur la même création ; non éclairci ici **[fil perdu]** |

**Ordre recommandé :** I1, I2 (l'alerte rouge disparaît) → C2 (seul double
comptage réel) → C1ter (trésorerie, décision métier) → I3, I4 → S1 → C1bis,
S2, S3.

Note sur S3 : `deposit.go:419-431` porte **une troisième** implémentation du
chaînage (`getLastInvoiceForDeposit`, `deposit.go:505`, et sa propre constante
`genesisHashDeposit`), en plus des deux hooks. Elle produit des hash corrects —
les 20 acomptes et les 6 factures de solde se recalculent à l'identique — mais
c'est le même problème que I3, côté serveur.

---

## 5. Ce qui a été écarté

- **La réécriture de `z_reports` du 23/08/2026** (`backend/cmd/z-repair`) :
  sans rapport, la table `invoices` n'a pas été touchée. Vérifié : les 1199
  hash stockés se recalculent tous à l'identique.
- **Une altération de document** : aucune. Zéro hash faux sur 1199.
- **Le filtrage par type dans `useVerifyInvoiceChain`** : la recherche du
  prédécesseur ignore le type, la piste est infirmée (§1.2).
- **L'exclusion des acomptes des X/Z** : c'est la bonne règle, la parente porte
  le total (§3.4).

---

## 6. Ticket C2 — appliqué le 23 août 2026

Seule modification de code de cette session. `usePerformDailyClosure`
(`frontend/lib/queries/closures.ts`) charge désormais :

1. `status != "draft"` **dans le filtre PocketBase** — les brouillons n'ont ni
   numéro, ni séquence, ni hash (`invoice_hooks.go:441`) ; les agréger revenait
   à sommer des montants non fiscalisés et à concaténer une chaîne vide dans le
   `cumulative_hash`.
2. **Un second filtre, côté client, sur les factures issues d'un ticket.**
   `original_invoice_id` est une colonne `TEXT`, pas une relation : le filtre
   PocketBase ne peut pas déréférencer vers `is_pos_ticket`. Une seconde
   requête résout donc les `original_invoice_id` des factures candidates et ne
   retient comme conversions que celles dont l'origine est un ticket de caisse.

Ce second point est volontairement **plus étroit que `original_invoice_id = ''`**
des X/Z : les avoirs, les acomptes et les factures de solde **restent** dans la
clôture. Seules les conversions de ticket en sortent.

### Simulation sur la base de production

Recalcul jour par jour de ce que la clôture aurait compté, avant et après :

| | Documents hors caisse | TTC |
|---|---|---|
| Avant | 376 | 86 310,24 € |
| Retirés — brouillons | 6 | 1 640,20 € |
| Retirés — conversions de ticket | 35 | 6 581,36 € |
| **Après** | **335** | **78 088,68 €** |

**34 journées** voient leur clôture changer. Exemple : le 10/01/2026 passait de
2 documents / 541,30 € à **0 document**, ces deux factures étant des
conversions de tickets déjà comptés dans le Z du jour.

Aucune écriture en base : la collection `closures` ne contient **qu'une seule
clôture** (`daily`, 2026-02-17), créée sous l'ancienne règle et **non
recalculée**. Elle annonce 2 documents / 212,20 € là où la nouvelle règle en
compterait 1 / 158,40 € — la différence étant une conversion de ticket. À
traiter séparément si cette clôture a une valeur, ce dont je doute
**[supposé]** : elle est unique et isolée.

`tsc --noEmit` passe, `biome check` appliqué.


---

## 7. Tickets I1 et I2 — appliqués le 23 août 2026

### La règle est désormais unique

`frontend/lib/queries/closures.ts` expose `evaluateDocumentIntegrity`, seule
implémentation du verdict, consommée par les **trois** vérifications :
`useVerifyInvoiceIntegrity`, `useVerifyInvoiceChain` et `useIntegritySummary`.
Elle distingue trois issues qui n'avaient pas le même remède et qui étaient
mélangées :

| Constat | Verdict | Compteur |
|---|---|---|
| hash recalculé ≠ hash stocké | **invalide** | `invalidCount` |
| `previous_hash` ≠ hash du précédent | **invalide** | `chainBreaks` |
| précédent inexistant | **avertissement** | `sequenceGaps` |
| brouillon | **hors contrôle** | `draftsSkipped` |

Le cas « précédent inexistant » ne bascule plus `chainValid` à `false` : rien ne
prouve qu'un document ait été altéré parce qu'un autre a disparu, et son propre
hash peut être — et est — intact. Il est **signalé**, jamais compté invalide.
C'est le point sur lequel les deux fonctions divergeaient.

### I1 — les brouillons sortent du contrôle

`status != "draft"` est passé **dans le filtre PocketBase** des deux listes, et
`useVerifyInvoiceIntegrity` rend un résultat `notApplicable` pour un brouillon
plutôt qu'un échec. Ils ne disparaissent pas en silence : `draftsSkipped` les
compte et l'écran les nomme.

### Ce que l'écran affiche maintenant, sur la production

| | Avant | Après |
|---|---|---|
| Badge rouge « Vérifier intégrité » | **7** (synthèse) / **6** (rapport détaillé) | **aucun badge** |
| Documents contrôlés | 1205 | **1199** |
| Invalides | 7 ou 6 selon l'écran | **0** |
| Ruptures de chaîne | 1 (synthèse seule) | **0** |
| Discontinuités de numérotation | non distinguées | **1** — `FAC-2025-000004` |
| Brouillons hors contrôle | comptés invalides | **6** |

Les deux écrans donnent désormais le même chiffre. La mention
« 1 discontinuité de numérotation — document supprimé par le passé, sans
altération de la chaîne » et « 6 brouillons hors contrôle » apparaissent en
texte secondaire dans `InvoicesPage.tsx`, sous la synthèse.

### Effet de bord favorable

`useVerifyInvoiceChain` faisait **une requête par document** pour retrouver le
prédécesseur — 1205 allers-retours sur la production. Un index de la séquence
est maintenant construit en une requête. Le double appel à
`computeDocumentHash` par document (une fois pour le verdict, une fois pour
l'affichage) est également supprimé, ainsi que les `console.log` de débogage
laissés dans la boucle.

### Gardien

`frontend/lib/queries/integrity-verdict.test.ts` — 9 tests. Le plus important
tient la règle qui a causé la divergence :

> « AVERTIT sans invalider quand le prédécesseur n'existe plus » —
> `expect(verdict.chainValid).toBe(true)`, à ne jamais passer à `false`.

`tsc --noEmit` passe, `biome check` appliqué, **128 tests au vert** sur
`frontend/lib`.
