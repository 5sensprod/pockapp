# 04 — Le Z simplifié : un total, quatre lignes

*Contrat, cas limites, reprise des 46 rapports.*

*23 août 2026. **Conception et mesures seules — aucune écriture, ni en base, ni
dans `backend/reports/`.** Base de production copiée (`data.db` + `-wal` +
`-shm`) depuis `%LOCALAPPDATA%\PocketReact\pb_data` vers le scratchpad, WAL
fusionné, lue en lecture seule.*

Convention, reprise de `03-audit-integrite-hash.md` : **[lu]** = chemin et
fonction dans le dépôt, ou requête sur la copie de production. **[supposé]** =
non démontré, dit comme tel. **[à trancher]** = ambiguïté que le code ne permet
pas de lever ; elle est posée, pas résolue.

> **État au 24 août 2026 — le contrat est EN PRODUCTION.** Les tickets Z-1 à
> Z-10 sont faits. Le calcul, le hachage, le rejeu et l'affichage suivent les
> quatre lignes ; les 46 rapports ont été rejoués en production le 24 août, et
> relus après coup : **46 sur 46 en `schema_version` 2, aucun déséquilibre entre
> le total et ses lignes, aucun maillon de hachage rompu.** Cumul encaissé
> 46 599,84 € — ligne 1 : 43 090,81 · ligne 2 : 1 341,28 · ligne 3 : 3 026,60 ·
> ligne 4 : 858,85. Sauvegarde préalable dans
> `%LOCALAPPDATA%\PocketReact\pb_data-sauvegarde-avant-Z10-20260824-005135`.
> Restent ouverts, et ils sont indépendants : **N-1** (nature bien / service),
> **C-4** (`CreateDepositInvoice`), **S-2** (renommer « B2B »), et la
> **décision 3**, qui se pose au comptable.

> **Réserve fiscale, à porter jusqu'au comptable.** Le rattachement de la TVA —
> à la livraison ou à l'encaissement, selon qu'il s'agit de biens ou de
> prestations — dépend du régime de l'entreprise et **doit être confirmé avant
> d'arrêter la structure définitive**. Ce document ne tranche pas ce point. La
> séparation entre chiffre d'affaires et encaissements, elle, ne dépend d'aucun
> régime : c'est la distinction entre deux grandeurs qui ne s'additionnent pas.

---

## 0. Ce que le Z doit dire — et la correction du 23 août

> **Le Z présente l'argent entré dans la caisse ce jour-là, en un seul total.
> Le comptable ventile ensuite comme il l'entend.**

Ce document proposait d'abord un modèle en **trois blocs séparés** dont deux
« ne devaient jamais s'additionner ». **Ce modèle est abandonné**, et la raison
est une mesure, pas une préférence.

### La mesure qui change tout

**91,3 % des factures hors caisse sont réglées le jour même de leur émission**
— 240 sur 263. En magasin, la facture n'est pas un instrument de crédit : c'est
un **ticket avec le nom du client dessus**, établi pour la garantie. La vente et
l'encaissement tombent le même jour, exactement comme pour un ticket.

| Délai entre émission et règlement | Factures | TTC |
|---|---|---|
| **Le jour même** | **240 (91,3 %)** | 65 973,86 € |
| 1 à 7 jours | 13 (4,9 %) | 5 674,37 € |
| 8 à 30 jours | 5 (1,9 %) | 651,55 € |
| Plus de 30 jours | 5 (1,9 %) | 809,90 € |

### La conséquence, et une correction à ce document

La première version affirmait que **42 % du CA annoncé par les Z n'était pas du
CA de caisse** (20 018,98 € sur 47 508,69 €). **C'est faux, et il faut le dire
clairement** : ce chiffre confondait deux choses très différentes. Ventilé :

| Sur les 20 018,98 € hors caisse présents dans les 46 Z | Documents | TTC |
|---|---|---|
| **Ventes du jour** — émises et payées le même jour | 54 | **16 127,66 €** |
| **Règlements de factures antérieures** — le seul vrai mélange | **9** | **3 891,32 €** |

Le mélange réel représente donc **3 891,32 €, soit 8 % du total, sur neuf
documents en huit mois** — pas 42 %. Une architecture en trois blocs pour neuf
documents serait disproportionnée, et surtout illisible pour un commerçant dont
l'ancienne caisse enregistreuse affichait un seul total.

**Ce qui reste vrai de l'analyse initiale**, et qui justifie quand même une
refonte : le double comptage des tickets (corrigé le 23 août), l'exclusion
accidentelle des acomptes, les conversions de ticket comptées deux fois, et le
fait qu'un règlement de facture antérieure ne soit pas du chiffre d'affaires du
jour. Ce sont des corrections **de contenu**, pas un changement d'architecture.

---

## 1. Contrat du Z

**Un total en tête. Quatre lignes qui l'expliquent. Le rapprochement espèces en
dessous.** Rien d'autre.

```
ENCAISSÉ AUJOURD'HUI ........................  1 240,50 €

  Ventes du jour ............................    890,00 €
  Règlements de factures antérieures ........    300,00 €
  Acomptes ..................................     80,50 €
  Remboursements ............................   − 30,00 €

  par moyen de paiement : espèces, CB, chèque…

TVA collectée sur les ventes du jour ........    148,33 €
  ventilée par taux : 20 %, 5,5 %

RAPPROCHEMENT ESPÈCES
  Fonds de caisse + mouvements = attendu ....    412,00 €
  Compté ....................................    412,00 €
  Écart .....................................      0,00 €
```

### Ligne 1 — Ventes du jour

**Tickets de caisse des sessions du Z**, *et* **factures hors caisse émises et
payées le même jour**. Les deux sont la même chose commercialement : une vente
de magasin encaissée sur-le-champ. Les séparer n'aurait aucun sens pour le
commerçant, et la mesure ci-dessus montre que c'est le cas courant.

**C'est la seule ligne qui porte du chiffre d'affaires** : HT, TVA ventilée par
taux, TTC. C'est elle que le comptable reprend.

Retenus : `status != 'draft'`, `invoice_type != 'credit_note'`, tickets par
session et factures par `paid_at = date` d'émission. **Hors conversions de
ticket** (§2).

### Ligne 2 — Règlements de factures antérieures

Documents hors caisse payés ce jour mais **émis un jour antérieur**. TTC seul,
sur une **ligne nommée**.

Deux raisons de la nommer plutôt que de la fondre dans la ligne 1 :

1. **Leur TVA a déjà été déclarée** à l'émission — pour des biens. La confondre
   avec les ventes du jour la ferait déclarer deux fois.
2. C'est la seule ligne qui explique qu'un jour le total encaissé dépasse les
   ventes du jour.

Volume réel : **9 documents, 3 891,32 €** sur les 46 Z existants. Une ligne
suffit.

> ⚠️ **Réserve à lever auprès du comptable** — voir §3 : pour une **prestation
> de services** (réparation), la TVA est en principe exigible à
> l'**encaissement**, sauf option pour les débits. Si l'option n'a pas été
> prise, cette ligne devra un jour porter sa propre TVA sur la part services.
> **Aucune réparation n'est facturée dans le système à ce jour** — mesuré, zéro
> ligne — la question n'est donc pas encore actuelle.

### Ligne 3 — Acomptes

`invoice_type = 'deposit'` encaissés ce jour, et factures de solde. TTC seul :
un acompte n'est pas du chiffre d'affaires, sa facture parente porte le total.
Règle anti-doublon parente / acompte / solde au §2.

### Ligne 4 — Remboursements

Avoirs POS de la session et avoirs hors caisse effectivement remboursés ce
jour, **en déduction**. Les avoirs sans moyen de remboursement sont des
annulations : ils n'entrent pas (§2).

### Total encaissé, et rapprochement espèces

Le total est la somme des quatre lignes, **ventilé par moyen de paiement**.
C'est le nombre que le commerçant reconnaît : celui qui doit correspondre à son
tiroir et à sa banque.

Le **rapprochement espèces** est **inchangé** — fonds de caisse + `cash_in`
− `cash_out` − `refund_out` − `safe_drop`, face au comptage. Il ne se déduit pas
du total encaissé et ne doit pas l'être : tout n'est pas payé en espèces.

---

## 2. Tableau des cas limites

> **Lecture des colonnes.** Ce tableau a été écrit sous le modèle en trois
> blocs, abandonné (§0). Il reste valable en lisant : **« Bloc 1 » = ligne 1
> (ventes du jour)**, **« Bloc 2 » = lignes 2 à 4 (règlements, acomptes,
> remboursements)**, **« Bloc 3 » = rapprochement espèces**. Une seule ligne
> change de colonne, elle est ajoutée en tête ci-dessous.

Chaque ligne dit où le document entre, et pourquoi.

| Cas ajouté le 23/08 | Ligne 1 | Lignes 2-4 | Espèces | Justification |
|---|---|---|---|---|
| **Facture hors caisse émise ET payée le même jour** | **oui — ventes du jour** | non | oui si espèces | **Le cas courant : 240 factures sur 263 (91,3 %).** Vente de magasin encaissée sur-le-champ, la facture servant de garantie. Commercialement identique à un ticket |

| Cas | Bloc 1 | Bloc 2 | Bloc 3 | Justification |
|---|---|---|---|---|
| **Ticket de caisse** payé CB | oui | oui (ligne a) | non | CA de caisse ; argent reçu ; pas d'espèces |
| **Ticket de caisse** payé espèces | oui | oui (ligne a) | oui | `pos_routes.go` crée un `cash_movements` par ligne espèces — **[lu]**, 144 mouvements, 5 229,38 € |
| **Avoir POS** de la session | oui, en déduction | oui, en déduction (d) | oui si espèces | `refund_out`, 10 mouvements, 500,40 € — **[lu]** |
| **Facture hors caisse émise ce jour, non payée** | **non** | **non** | non | Le Z voit l'argent, pas la créance. Son CA appartient au journal de facturation, à sa date d'émission |
| **Facture hors caisse antérieure, payée à la caisse** | **non** | **oui, ligne b** | oui si espèces | C'est le cœur de la refonte : encaissement, jamais CA de caisse |
| **Acompte encaissé** | non | oui, ligne c | oui si espèces | Trésorerie pure : l'acompte n'est pas du CA, sa parente porte le total |
| **Facture de solde** | non | oui, ligne c | oui si espèces | Elle porte le reste à payer (`deposit.go`, `CreateBalanceInvoice`) ; c'est un encaissement |
| **Facture parente porteuse d'acomptes** | non | **oui, mais amputée** — voir la règle anti-doublon ci-dessous | — | Sinon 100 % + acompte + solde |
| **Conversion ticket → facture** | **non** | **non** | **non** | Son CA est déjà dans le ticket (bloc 1) et son règlement n'a pas eu lieu à la caisse ce jour-là. **Confirmé [lu]** : `ConvertTicketToInvoicePage.tsx` crée le document par `pb.collection('invoices').create()` avec `is_paid` et `paid_at` **recopiés du ticket**, sans passer par `pay.go` — donc **aucun `cash_movements` n'est créé**. Le document n'appartient à aucun des trois blocs |
| **Avoir hors caisse sans moyen de remboursement** | non | **non** | non | 20 documents, 7 061,51 € **[lu]**, `refund_method` vide : ce sont des annulations, aucun argent n'est sorti du tiroir. Les faire entrer au bloc 2 creuserait un trou fictif |
| **Avoir hors caisse remboursé en espèces** | non | oui, en déduction (d) | oui | 10 documents, 500,40 €, **tous** porteurs d'un `cash_movements` — **[lu]**, `refund.go` |
| **Brouillon** (`status = 'draft'`) | non | non | non | Ni numéro, ni séquence, ni hash (`invoice_hooks.go`, « CAS 1 : Brouillon ») |

### La règle anti-doublon des acomptes

Le modèle acompte/solde de `deposit.go` produit **trois documents pour un seul
encaissement possible** : la parente (montant total), le ou les acomptes, la
facture de solde. Les trois peuvent porter `is_paid = true`. Un bloc 2 naïf les
sommerait tous.

**Mesuré : 7 factures parentes sont dans ce cas, pour 2 523,70 € qui seraient
comptés deux fois.**

Règle proposée, vérifiée sur les 7 :

1. **Si une facture de solde existe** pour la parente, la **parente n'entre pas
   au bloc 2** ; ses acomptes et son solde y entrent. Vérifié sur 5 dossiers :
   `FAC-2026-000076` (225 + 525 = 750), `000107` (50 + 398 = 448), `000118`
   (10 + 5,90 = 15,90), `000134` (50 + 453 = 503), `000165` (249 + 250 = 499).
   **Le compte est juste, une seule fois, dans les cinq cas.**
2. **Sinon**, la parente entre au bloc 2 pour `total_ttc − Σ acomptes déjà
   encaissés`, et chaque acompte entre pour lui-même à sa propre date.
   Vérifié sur `FAC-2026-000092` : 277,80 − 257,80 = 20, plus l'acompte
   257,80, le même jour → 277,80. Juste.

**Une seule exception résistait, et c'était une anomalie de données, pas de
règle — TRANCHÉE le 24 août 2026 :**

`FAC-2026-000023`, 974 €, marquée **payée en totalité le 19/06/2026** (elle est
le hors-caisse du `Z-2026-000034`), porte un acompte `ACC-2026-000012` de 50 €
marqué **payé le 23/07/2026**, un mois plus tard. Les deux ne peuvent pas être
vrais : soit la parente n'a encaissé que 924 €, soit l'acompte n'a jamais été
un encaissement distinct. Le code ne permettait pas de trancher.

**Arbitrage du propriétaire : l'acompte de 50 € est réel.** La parente entre
donc amputée, et le `Z-2026-000034` passe de 1 224,05 € à **1 174,05 €**, dont
924,00 € en ligne 3. C'est le seul rapport des 46 dont l'argent ne se conserve
pas au rejeu, et c'est voulu. **Appliqué en production le 24 août 2026**, aucune
écriture dans `invoices` : la règle suffit, la donnée n'a pas été retouchée.

### Deux divergences bloc 2 ↔ bloc 3, structurelles et à assumer

1. **L'acompte espèces entre au tiroir sans être « payé ».**
   `CreateDepositInvoice` (`deposit.go`) pose `is_paid = false` sur l'acompte
   **et appelle malgré tout `CreateCashMovementIfEspeces`** juste après. Un
   bloc 2 fondé sur `is_paid && paid_at` ne verrait donc pas l'argent que le
   bloc 3 voit. **[lu]**. En production le cas ne s'est **jamais** produit
   depuis que le helper existe : **aucun des 20 acomptes ne porte de
   `cash_movements`**, et les trois acomptes espèces (225 + 140 + 50 =
   **415 €**) sont tous antérieurs au 20/05/2026, date de création du helper
   (`03-audit-integrite-hash.md`, §3.5). Le chemin reste **non éprouvé**.
   → **Ticket C-4** : soit `CreateDepositInvoice` pose `is_paid`/`paid_at`
   quand un moyen de paiement est fourni, soit il ne crée pas de mouvement.
   Les deux ensemble sont incohérents.

2. **L'argent reçu hors session n'entre nulle part.**
   `CreateCashMovementIfEspeces` cherche une session ouverte et **abandonne en
   silence** s'il n'en trouve pas (« cash_movement ignoré : aucune session
   ouverte »). Symétriquement, un bloc 2 rattaché à un Z ne peut rien dire
   d'un jour sans Z. **Mesuré : 163 encaissements hors caisse, 46 010,34 €,
   tombent des journées sans aucun rapport Z** — contre 65 encaissements,
   20 517,98 €, des journées avec Z. **69 % de l'argent hors caisse est reçu un
   jour où la caisse n'a pas été clôturée.** Ce n'est pas une régression de la
   refonte : c'est vrai aujourd'hui. Mais **le bloc 2 ne doit pas se présenter
   comme « tout l'argent encaissé par l'entreprise »** — il est « l'argent
   encaissé **à cette caisse, ce jour-là** ». Le reste relève du journal de
   facturation, dont la clôture sera annuelle.

### Symptômes qui disparaissent d'eux-mêmes

Aucun correctif dédié n'est nécessaire : le nouveau modèle les supprime.

- **Le filtre `original_invoice_id = ''`** disparaît, remplacé par une
  exclusion **nommée** des seules conversions de ticket (résolution de
  `original_invoice_id` vers `is_pos_ticket`, comme déjà fait dans
  `closures.ts` — ticket C2 de `03-audit-integrite-hash.md`). Les acomptes
  cessent d'être exclus par accident.
- **`DepositsCount` / `DepositsTTC`**, structurellement à zéro aujourd'hui
  (condition inatteignable, `03-…`, §3.4-2), deviennent la ligne c du bloc 2 et
  portent enfin une valeur.
- **Les 415 € d'acomptes espèces** trouvent leur place : ligne c du bloc 2 et
  mouvement au bloc 3 (une fois le ticket C-4 traité).
- **Les conversions ticket → facture** sortent explicitement des trois blocs,
  au lieu d'être écartées par effet de bord d'un filtre qui voulait dire autre
  chose.

---

## 3. Les décisions à prendre

### Décision 1 — Que portent `total_ht / total_tva / total_ttc` ?

Ces trois champs sont **hachés** (`computeZReportHash`, avec `vat_by_rate` et
`by_method`). Changer ce qu'ils contiennent change le hash — ce qui est accepté,
les 46 Z étant rejoués.

**Recommandation : ils portent la ligne 1, les ventes du jour** — tickets et
factures encaissées le jour de leur émission. C'est la seule grandeur du Z qui
soit du chiffre d'affaires, et la seule qui ait une base HT.

Champs neufs pour le reste du total encaissé :

| Champ | Contenu |
|---|---|
| `collected_ttc` | total encaissé, net des remboursements |
| `collected_by_method` | ventilation du total par moyen de paiement |
| `collected_from_receivables_ttc` | ligne 2 — règlements de factures antérieures |
| `collected_deposits_ttc` | ligne 3 — acomptes |
| `refunds_ttc` | ligne 4 — remboursements |
| `schema_version` | 2 |

**`schema_version` reste indispensable** et entre dans le hash : sans lui, un Z
relu dans six mois ne dira pas sous quelle règle son `total_ht` a été produit.
`1` = règle d'origine, `2` = ce contrat.

Migration : **une nouvelle migration inscrite dans `RunMigrations`**
(`backend/migrations/migrations.go`). `ensureZReportsCollection` sort si la
collection existe déjà — la modifier ne changerait rien sur une base installée.

### Décision 2 — L'e-reporting B2C/B2B — **résolue par le nouveau contrat**

La première version de ce document redoutait que, réduit aux seuls tickets,
`by_customer_type` devienne **mono-valué à 100 % B2C**, les 829 tickets pointant
tous le client « comptoir ».

**Le contrat simplifié lève l'objection** : la ligne 1 comprend aussi les
factures hors caisse encaissées le jour même — **54 documents, 16 127,66 €
présents dans les 46 Z** — et celles-là portent de **vrais clients**, dont des
professionnels, des associations et des administrations. La ventilation garde
donc du sens.

**L'e-reporting suit la ligne 1, et elle seule.** Les lignes 2 à 4 n'ont ni HT
ni TVA : la question ne s'y pose pas.

### Décision 3 — La TVA des réparations *(à poser au comptable)*

Une question, une seule :

> **Avons-nous opté pour la TVA sur les débits pour les prestations de
> services ?**

- **Oui** → la TVA des réparations sera exigible à la facturation, comme pour
  les produits. La ligne 2 ne portera jamais de TVA, et ce contrat est
  définitif.
- **Non** → la TVA d'une réparation sera exigible à l'encaissement. La ligne 2
  devra alors porter sa propre TVA **sur la part services uniquement**.

**Ce n'est pas bloquant aujourd'hui : aucune réparation n'est facturée dans le
système** — mesuré, zéro ligne contenant « réparation », « main d'œuvre » ou
« révision », et les seules lignes de saisie libre sont des lignes d'acompte.

**Mais une lacune de schéma l'est, et elle est indépendante du Z :** une ligne
de facture porte `name`, `product_id`, `quantity`, `total_ht`, `tva_rate`,
`unit_price_ht` — **rien ne dit si c'est un bien ou un service**. Le jour où une
réparation sera facturée ici, rien ne la distinguera d'une paire de baguettes.
→ **Ticket N-1**, à traiter avant la première réparation facturée, pas après.

### Décision 4 — L'anomalie `FAC-2026-000023` — **tranchée**

Facture de 974 € marquée **payée en totalité le 19/06/2026**, portant un acompte
de 50 € marqué **payé le 23/07/2026**. Les deux ne peuvent pas être vrais.

**Arbitrage du 24 août 2026 : l'acompte est réel.** La règle anti-doublon
s'applique donc sans exception, et le `Z-2026-000034` porte 1 174,05 € au lieu
de 1 224,05 €. Rien n'a été corrigé dans `invoices` — les 1199 hash restent
intacts.

---

## 4. Simulation de la reprise des 46 Z

**Aucune écriture.** Recalcul sur la copie de production de ce que porteraient
les blocs 1 et 2 sous le contrat du §1.

### Vue d'ensemble — recalculée sous le contrat simplifié

*La première version de ce tableau chiffrait le modèle en trois blocs, où la
ligne 1 n'aurait porté que les tickets. Sous le contrat du §1, elle porte aussi
les factures encaissées le jour de leur émission. Les chiffres ci-dessous sont
donc ceux qui comptent.*

| | TTC cumulé sur les 46 Z |
|---|---|
| **Ligne 1 — Ventes du jour** | **43 617,37 €** |
|   dont tickets de caisse (624 documents) | 27 489,71 € |
|   dont factures encaissées le jour de leur émission (54 documents) | 16 127,66 € |
| **Ligne 2 — Règlements de factures antérieures** (9 documents) | **3 891,32 €** |
| **Total** | **47 508,69 €** |

**Ce total est exactement celui que les 46 Z portent aujourd'hui.**
43 617,37 + 3 891,32 = 47 508,69 € — au centime.

C'est le résultat le plus important de cette simulation : **le nombre affiché en
tête du Z ne bouge pas.** La refonte ne retire ni n'ajoute d'argent, elle
**nomme** ce qu'il y a dedans. Le commerçant retrouvera le même total qu'avant ;
ce qu'il gagne, c'est de savoir qu'il contient 3 891,32 € qui ne sont pas des
ventes du jour.

Deux nuances :

- Le **total encaissé** du contrat comprend en plus les **acomptes** (ligne 3),
  aujourd'hui exclus par accident, et déduit les **remboursements** (ligne 4).
  Il différera donc légèrement du total actuel — dans le bon sens : l'argent
  réellement entré cessera d'être invisible.
- Les valeurs par rapport changent pour **31 des 46 Z** : c'est la répartition
  entre lignes 1 et 2 qui bouge, pas la somme.

### Détail des 31 rapports modifiés

*Tableau conservé de la première version. Il se lit avec la clé du §0 : la
colonne « Bloc 1 TTC » ne porte que les tickets ; sous le contrat simplifié, la
ligne 1 y ajoute les factures encaissées le jour de leur émission, et seule la
part réellement antérieure passe en ligne 2.*

| Rapport | Date | TTC stocké | Bloc 1 TTC | Tickets | Bloc 2 — ligne b |
|---|---|---|---|---|---|
| Z-2026-000010 | 2026-01-24 | 652,60 | 224,80 | 7 | 427,80 |
| Z-2026-000011 | 2026-02-06 | 3 495,73 | 2 832,93 | 38 | 662,80 |
| Z-2026-000012 | 2026-02-07 | 410,56 | 80,76 | 4 | 329,80 |
| Z-2026-000013 | 2026-02-10 | 580,30 | 411,30 | 3 | 169,00 |
| Z-2026-000014 | 2026-02-28 | 1 065,81 | 1 025,01 | 31 | 40,80 |
| Z-2026-000015 | 2026-03-14 | 2 605,80 | 1 743,80 | 41 | 862,00 |
| Z-2026-000019 | 2026-05-12 | 3 681,90 | 1 434,00 | 35 | 2 247,90 |
| Z-2026-000020 | 2026-05-15 | 2 152,55 | 781,85 | 17 | 1 370,70 |
| Z-2026-000022 | 2026-05-22 | 1 402,26 | 957,71 | 12 | 444,55 |
| Z-2026-000023 | 2026-05-23 | 715,50 | 166,50 | 11 | 549,00 |
| Z-2026-000024 | 2026-05-26 | 583,70 | 147,70 | 4 | 436,00 |
| Z-2026-000025 | 2026-05-28 | 834,76 | 166,76 | 7 | 668,00 |
| Z-2026-000026 | 2026-05-30 | 637,90 | 247,90 | 7 | 390,00 |
| **Z-2026-000027** | 2026-06-03 | 1 393,96 | 415,51 | 8 | **978,45** — voir ci-dessous |
| Z-2026-000028 | 2026-06-04 | 921,60 | 44,80 | 3 | 876,80 |
| Z-2026-000029 | 2026-06-05 | 1 428,25 | 489,35 | 11 | 938,90 |
| Z-2026-000030 | 2026-06-06 | 688,61 | 384,71 | 14 | 303,90 |
| Z-2026-000031 | 2026-06-11 | 1 081,75 | 503,75 | 18 | 578,00 |
| Z-2026-000032 | 2026-06-17 | 803,80 | 224,80 | 4 | 579,00 |
| Z-2026-000033 | 2026-06-18 | 1 183,43 | 76,70 | 3 | 1 106,73 |
| Z-2026-000034 | 2026-06-19 | 1 224,05 | 250,05 | 6 | 974,00 |
| Z-2026-000036 | 2026-07-01 | 1 376,89 | 494,63 | 13 | 882,26 |
| Z-2026-000037 | 2026-07-02 | 884,90 | 401,60 | 7 | 483,30 |
| Z-2026-000038 | 2026-07-03 | 1 105,61 | 955,61 | 7 | 150,00 |
| Z-2026-000039 | 2026-07-04 | 1 008,12 | 330,12 | 9 | 678,00 |
| Z-2026-000040 | 2026-07-11 | 493,20 | 42,30 | 3 | 450,90 |
| Z-2026-000041 | 2026-07-18 | 1 660,77 | 461,67 | 15 | 1 199,10 |
| Z-2026-000042 | 2026-07-21 | 558,92 | 399,92 | 12 | 159,00 |
| Z-2026-000043 | 2026-07-28 | 1 186,28 | 438,24 | 19 | 748,04 |
| Z-2026-000044 | 2026-08-01 | 944,24 | 638,89 | 20 | 305,35 |
| Z-2026-000045 | 2026-08-19 | 301,94 | 273,04 | 19 | 28,90 |

Les 15 inchangés : Z-000001 à 000009, 000016, 000017, 000018, 000021, 000035,
000046. Leur bloc 1 égale au centime le `total_ttc` stocké.

**Vérification importante : dans tous les cas sauf un, `bloc 1 + ligne b` égale
exactement le `total_ttc` stocké aujourd'hui.** Autrement dit, la refonte ne
découvre ni ne perd d'argent : elle **sépare** ce qui était additionné. C'est
le meilleur contrôle que l'on puisse faire d'un tel changement.

**Le seul cas d'écart est `Z-2026-000027` (03/06/2026)**, et il est instructif.
Sous le contrat du §1 sans la règle anti-doublon, la ligne b passerait de
978,45 € à **1 477,45 €** — un excédent de **499 €**, produit exactement par le
dossier `FAC-2026-000165` : parente 499 €, acompte `ACC-2026-000010` 249 € et
solde `FAC-2026-000001` 250 €, les trois marqués payés le même jour. **La règle
anti-doublon du §2 le ramène à 978,45 €** : la parente est écartée, l'acompte
et le solde comptent. C'est le seul dossier acompte/solde tombant sur une
journée porteuse d'un Z.

### Ce que la simulation ne dit pas

- Elle porte sur **les montants TTC**. Les ventilations par taux de TVA et par
  moyen de paiement suivront mécaniquement le même découpage, mais n'ont pas
  été recalculées ici **[non mesuré]**.
- Le **bloc 3 est inchangé** : `total_cash_expected`, `total_cash_counted` et
  `total_cash_difference` ne bougent d'aucun centime dans aucun des 46
  rapports. C'était le but.
- Les **encaissements hors caisse des jours sans Z** — 163 documents,
  46 010,34 € — n'apparaîtront toujours nulle part. Ce n'est pas un effet de
  la refonte (§2).

---

## 5. Plan par tickets

Plus court que la première version : le modèle simplifié supprime des tickets au
lieu d'en ajouter.

| # | Ticket | Nature | Dépend de |
|---|---|---|---|
| **Z-0** | **Trancher les décisions 1 et 4** (§3). La décision 3 se pose au comptable en parallèle, elle ne bloque pas | décision | — |
| **Z-1** | Migration `AddCollectedToZReports` : `collected_*`, `refunds_ttc`, `schema_version`. **Inscrite dans `RunMigrations`** | **schéma** | Z-0 |
| **Z-2** | Refondre `aggregateZ` : ligne 1 = tickets **+ factures encaissées le jour de leur émission** ; lignes 2 à 4 séparées. Un seul chemin, partagé avec `z-repair` | **calcul** | Z-1 |
| **Z-3** | Exclure les conversions de ticket par une résolution **nommée** vers `is_pos_ticket`, au lieu du filtre `original_invoice_id = ''` qui excluait les acomptes par accident | **calcul** | Z-2 |
| **Z-4** | Règle anti-doublon parente / acompte / solde (§2), avec son gardien | **calcul** | Z-2 |
| **Z-5** | `schema_version` et les champs `collected_*` entrent dans le hash | **calcul** | Z-1, Z-2 |
| **Z-6** | Aligner `GenerateRapportX` : c'est l'aperçu du Z, même structure. `DepositsCount`/`DepositsTTC`, aujourd'hui structurellement à zéro, deviennent la ligne 3 | **calcul** | Z-2 |
| **Z-7** | Gardiens (`cash_reports_test.go`) : une facture encaissée le jour de son émission entre en **ligne 1** ; une facture antérieure entre en **ligne 2 et jamais en ligne 1** ; un acompte espèces entre en ligne 3 **et** au rapprochement ; une conversion de ticket n'entre **nulle part** | **calcul** | Z-2 à Z-6 |
| **Z-8** | `backend/cmd/z-repair` : rejeu sous `schema_version = 2`. **Simulation d'abord, résultats présentés** | **calcul** | Z-7 |
| **Z-9** | Affichage : un total en tête, quatre lignes, la TVA sous la ligne 1, le rapprochement espèces en dessous. `RapportZPage.tsx`, `ZReportPDF.tsx`, `RapportXDialog.tsx` | **affichage** | Z-5, Z-6 |
| **Z-10** | `z-repair -apply` en production, PocketApp fermé, après sauvegarde | exploitation | Z-8, Z-9 |
| **N-1** | **Poser une nature `bien` / `service` sur les lignes de facture** — indépendant du Z, à faire avant la première réparation facturée (§3, décision 3) | **schéma** | indépendant |
| **C-4** | `CreateDepositInvoice` crée un `cash_movements` sur un document `is_paid = false` : choisir un des deux comportements (§2) | **calcul** | indépendant |
| **S-2** | Renommer « B2B » → « hors caisse » dans `cash_reports.go` | doc + code | Z-2 |

**Ordre :** Z-0 → Z-1 → Z-2, Z-3, Z-4 → Z-5 → Z-6 → Z-7 → Z-8 *(simulation
présentée)* → Z-9 → Z-10. N-1, C-4 et S-2 quand on veut.

---

## 6. Ce qui n'est pas touché

- **`invoices`** : aucune écriture. Les 1199 hash sont sains et vérifiés
  (`03-audit-integrite-hash.md`, §0).
- **Le bloc 3** : le rapprochement espèces ne change pas d'un centime.
- **La sélection des sessions d'un Z** : `z_report_id` et le découpage par
  journée restent tels quels. La refonte change ce qu'on calcule sur ces
  sessions, pas lesquelles on prend.
- **AppPos** : hors sujet, aucun rapport avec la caisse PocketBase.

---

## 7. Les sessions que la clôture a manquées — 24 août 2026

`z-clotures` a émis les Z des journées jamais clôturées, mais il en restait
**deux qu'il déclare « BLOQUÉES »** : leur journée porte déjà un Z, et
`GenerateRapportZ` rend alors le rapport existant sans rien y ajouter
(`cash_reports.go:1286`). Leur argent restait hors clôture indéfiniment, et le
bandeau ambre du journal des ventes le signalait sans fin.

**Ce ne sont pas des sessions à supprimer.** Leurs trois tickets sont en MILIEU
de chaîne de hachage (séquences 791, 792, 794) — `facture-supprimer` les
refuserait, et à raison ; leurs deux mouvements totalisent 600 € de remises en
banque ; et supprimer les sessions seules orphelinerait les tickets sans les
retirer du journal, qui les compte par leur date : le bandeau s'éteindrait,
l'argent resterait dehors.

### La vraie anomalie était le fonds d'ouverture

Les deux sessions ont été ouvertes **quelques secondes après la clôture de la
précédente**, pour la seule saisie d'une remise en banque :

| | tiroir compté à la clôture précédente | fonds saisi | sortie |
|---|---|---|---|
| `d1vx…` 03/06 07:44 | 447,96 € (`fdyc…`, 07:40) | 145,96 € | 300 € à 07:45 |
| `6kih…` 06/06 18:25 | 429,56 € (`bllz…`, 18:25:00) | 129,76 € | 300 € à 18:25 |

Le fonds saisi est le tiroir **après** la remise, que le mouvement retranche une
seconde fois : les espèces attendues tombaient à −154,04 € et −170,24 €. Un
tiroir négatif n'existe pas — c'est la saisie qui était fausse, pas la règle.

**On corrige le fonds, jamais le mouvement** : la remise a réellement eu lieu,
elle doit rester tracée. Et le fonds juste est le tiroir **compté** à la clôture
précédente, un chiffre mesuré : reposer « fonds saisi + 300 » aurait donné un
écart de −0,15 € au 03/06 et masqué les **2,00 €** qui manquent réellement entre
les deux sessions.

### L'ordre des gestes, qui n'est pas négociable

```
session-fonds -apply   → le fonds redevient le tiroir réel (refusé si la session est déjà dans un Z)
z-rattacher   -apply   → la session entre dans le session_ids du Z de sa journée
z-repair      -apply   → les valeurs et la chaîne de hachage se refont, par aggregateZ
```

Aucun document n'est émis : les deux Z gardent leur numéro et leur date, seul
leur **découpage** est corrigé. Mesuré sur copie de la base de production :

| | Z-2026-000034 (03/06) | Z-2026-000037 (06/06) |
|---|---|---|
| tickets comptés | 10 → **13** | 16 → 16 |
| ventes du jour | 894,96 → **1 035,63 €** | inchangé |
| total encaissé | 1 393,96 → **1 534,63 €** | inchangé |
| espèces attendues | 444,46 → **592,42 €** | 429,56 → **559,12 €** |
| écart de caisse | 3,50 → **1,35 €** | 0,00 → 0,00 € |

Rejeu complet : 60 rapports, 2 aux montants corrigés, 25 rechaînés, 0 erreur,
tous égaux à la somme de leurs quatre lignes. Le cumul encaissé passe de
95 076,18 € à 95 216,85 € — les 140,67 € qui manquaient, rien d'autre. Sessions
fermées sans Z après l'opération : **0**.

Gardiens : `backend/reports/z_rattachement_test.go` (le lien se pose des deux
côtés, ne se pose pas deux fois, et une journée sans Z n'est pas l'affaire de
cet outil) et `backend/reports/session_fonds_test.go` (le mouvement n'est pas
altéré, et une session déjà scellée dans un Z est refusée).

---

## 8. Le solde d'un dossier d'acompte rejoint la ligne 1 — 1er septembre 2026

`schema_version` **8**. Le §1 et le §2 restent le contrat ; ce paragraphe en
corrige un point, et un seul.

**Ce qui change.** La facture de **solde** quitte la ligne 3 pour la **ligne 1**,
avec son HT et sa TVA. Elle n'a plus de traitement à part : elle emprunte le même
test de date que toute facture — émise et encaissée le même jour, vente du jour ;
émise avant, règlement de créance (ligne 2, TTC seul).

**Ce qui ne change pas.** La parente d'un dossier soldé reste **hors lignes**
(§2, règle anti-doublon). L'acompte reste en ligne 3, en TTC seul, sa TVA dans
`deposits_vat` (§7 du contrat 7). Le total encaissé, `collected_ttc`, est le
même qu'avant au centime — seul change la ligne sous laquelle le commerçant lit
une partie de cet argent.

**Pourquoi.** Sous les versions 1 à 7, le CA d'un dossier soldé n'était reconnu
nulle part : parente exclue, acompte et solde en TTC seul. Le Z du
1er septembre 2026 annonçait 0,00 € de ventes sur le dossier `FAC-2026-000286`
(acompte `ACC-2026-000021` 10,00 € + solde `FAC-2026-000287` 19,90 €), et la TVA
du solde n'était déclarée par aucun champ. Mesuré sur la production : 6 factures
de solde encaissées, 1 464,01 € HT et 187,79 € de TVA invisibles.

**Le dossier reste couvert exactement une fois**, et c'est vérifiable au centime :
le HT et la TVA d'un solde sont le complément exact de ceux des acomptes
(8,33 + 16,59 = 24,92 ; 1,67 + 3,31 = 4,98), parce que `deposit.go:455-459`
calcule le solde au prorata du reste à payer.

| | avant (v7) | après (v8) |
|---|---|---|
| Ligne 1 — ventes du jour | 0,00 | **16,59 / 3,31 / 19,90** |
| Ligne 3 — acomptes | 29,90 | **10,00** |
| `total_tva` | 0,00 | **3,31** |
| `deposits_vat` | 1,67 | 1,67 |
| `collected_ttc` | 29,90 | 29,90 |

**Limite assumée.** La ligne 1 reconnaît le CA au **prorata du reste à payer** :
la part déjà versée en acompte n'entre dans le `total_ht` d'aucun Z. La ligne 1
reste « ce qui est encaissé aujourd'hui ».

**Aucun rejeu.** Les rapports antérieurs gardent leur contenu et leur hash, et se
relisent sous leur propre règle — prédicat `estZReconnaitLeSolde`
(`frontend/lib/types/cash.types.ts`), un **seuil**. Les libellés du Z et du X
s'adaptent : sur un rapport en v8 la ligne 1 annonce « et factures de solde »,
sur un rapport antérieur elle ne le dit pas, parce que ce serait faux.

Décision, options écartées et mesures : `docs/DECISIONS.md`, bloc « Le solde
d'un dossier d'acompte est du chiffre d'affaires ».
