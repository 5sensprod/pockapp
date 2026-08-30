# Audit — le détail d'une facture avec acomptes, avoirs et solde

*30 août 2026. Audit d'interface, aucune modification de code.*

Ce document est un **audit**, pas une décision. Ce qui porte un chemin
`fichier:ligne` est **lu dans le code** ; le reste est déduit et annoncé comme
tel. Les arbitrages restants sont au §8 et ne sont pas tranchés ici.

Fichiers audités :

- `frontend/modules/connect/pages/invoices/InvoiceDetailPage.tsx` (1066 l.)
- `frontend/modules/connect/pages/invoices/InvoiceDetailHeader.tsx` (401 l.)
- `frontend/modules/connect/hooks/useInvoiceActions.tsx` (398 l.)
- `frontend/modules/connect/components/InvoicePaymentDialog.tsx` (569 l.)
- `frontend/lib/queries/deposits.ts`, `frontend/lib/types/invoice.types.ts`
- `backend/deposit.go`, `backend/pay.go`, `backend/refund.go`

---

## 1. Le workflow réel

Un dossier « facture avec acomptes » produit **quatre natures de documents**,
toutes dans la même collection `invoices` :

| Document | `invoice_type` | Reconnaissable à |
|---|---|---|
| Facture parente | `invoice` | `original_invoice_id` vide, `deposits_total_ttc > 0` |
| Acompte | `deposit` | `original_invoice_id` = parente |
| Facture de solde | `invoice` | `original_invoice_id` = parente — **même type que la parente** |
| Avoir | `credit_note` | `original_invoice_id` = document remboursé |

Cycle :

1. Facture parente validée (`status !== 'draft'`).
2. `POST /api/invoices/deposit` crée un acompte et met à jour
   `deposits_total_ttc` et `balance_due` sur la parente
   (`backend/deposit.go:284`).
3. L'acompte est encaissé (`is_paid`).
4. Quand **tous** les acomptes sont payés, `POST /api/invoices/balance`
   génère la facture de solde (`backend/deposit.go:340`) : items d'origine
   **plus une ligne déductive par acompte**.
5. Le paiement du solde repasse la parente à `balance_due = 0` et « soldée »
   (`backend/pay.go:158`).
6. Un avoir peut frapper la parente, un acompte — `backend/refund.go:245`
   recalcule alors `deposits_total_ttc` — ou la facture de solde.

**Il n'y a pas de paiement partiel.** `handleConfirmPayment` refuse tout montant
inférieur au dû (`InvoicePaymentDialog.tsx:141`, « Montant insuffisant ») ; les
`split_payments` sont plusieurs **moyens** pour un encaissement **intégral**. Le
seul paiement partiel légitime du produit est l'acompte. C'est l'information la
plus mal transmise par l'écran actuel.

---

## 2. Les informations affichées

| Information | Emplacement actuel | Importance | Problème |
|---|---|---|---|
| Numéro + statut | header, badges | haute | Jusqu'à **4 badges** empilés (`Validée` + `Payée` + `Acompte X · Solde Y` + `Remboursé`). Le badge acompte est `hidden sm:flex` : **il disparaît sous 640 px** |
| Date, échéance, vendeur | carte 1, grille 2 colonnes | moyenne | Correct |
| Moyen de paiement, « Payée le » | carte 1, seulement si `is_paid` | moyenne | Rien n'indique quand un acompte a été encaissé au niveau du dossier |
| Acomptes : « Versés » / « Solde restant » | carte 1, **sous** notes et documents liés | haute | **Enterré.** Deux chiffres, sans le total facture — la soustraction est implicite |
| Liste des acomptes (n°, date, montant, Réglé / En attente) | carte 1, cartes bleues | haute | Bien fait, mais loin sous le pli |
| Facture de solde | même bloc, carte grise | haute | Correct |
| Avoirs associés (n°, date, montant) | carte 1, cartes rouges | haute | **Le montant est affiché, son impact ne l'est jamais** |
| `remaining_amount` (total − avoirs) | **calculé `InvoiceDetailPage.tsx:152`, jamais affiché** | haute | Sert uniquement à *gater* le bouton « Rembourser » |
| Total HT / TVA / ventilation / TTC | carte lignes, en bas à droite | moyenne | Le bloc s'arrête à `total_ttc` : **ni acomptes, ni avoirs, ni reste à payer** |
| Remises lignes et globale | même bloc | faible | Correct |
| Client | carte de droite | moyenne | Correct |
| Bon de commande source | carte 1, tout en bas | faible | Correct |
| Lien vers la parente **depuis une facture de solde** | **absent** | haute | Voir ci-dessous |
| Historique / chronologie | **inexistant** | haute | Reconstituable seulement en ouvrant chaque document |

**Le cul-de-sac de la facture de solde.** Les blocs de lien vers le document
d'origine sont conditionnés `isCreditNote && originalId`
(`InvoiceDetailPage.tsx:425`) et `isDeposit && originalId` (`:426`). Une facture
de solde est de type `invoice` : **aucun des deux ne se déclenche**. Elle affiche
des lignes déductives « Acompte … » sans aucun chemin de retour vers le dossier.

**Le problème structurel n° 1.** L'écran a **deux blocs financiers qui ne se
parlent pas** — le récap acomptes en haut à gauche, les totaux en bas à droite,
séparés par la table des lignes. Aucun des deux ne donne le reste à payer
consolidé.

---

## 3. Les actions

**Douze actions, onze dans un menu déroulant, une seule en bouton primaire :
« PDF »** (`InvoiceDetailHeader.tsx:363`).

| Action | Condition (lue) | Fréquence | Nature | Problème |
|---|---|---|---|---|
| **PDF** | toujours | moyenne | secondaire | **Seul bouton primaire.** L'affordance la plus forte va à l'action la moins engageante |
| Envoyer par email | toujours | moyenne | secondaire | Proposé même sur un brouillon ou un ticket |
| Marquer envoyée | `canTransitionTo(status,'sent')` | faible | secondaire | Redondant avec l'envoi email |
| Modifier / Valider / Supprimer brouillon | `status === 'draft'` | faible | mixte | « Valider » est l'action principale d'un brouillon, au même rang qu'« Envoyer par email » |
| Convertir en facture | ticket non converti | moyenne | **principale** | Enterrée |
| **Enregistrer paiement** | `canMarkAsPaid` (`invoice.types.ts:364`) | **haute** | **principale** | Enterrée, 6ᵉ rang du menu |
| **Générer la facture de solde** | `canGenerateBalance` | moyenne | **principale** | Enterrée. Condition composite (`InvoiceDetailPage.tsx:222-227`) : `canCreateBalanceInvoice` **et** pas de solde existant **et** `pendingCount === 0`. Fausse, **l'entrée disparaît sans dire pourquoi** |
| **Créer un acompte** | — | haute | **principale** | **Absente du menu.** C'est un onglet *à l'intérieur* du dialogue d'encaissement (`InvoicePaymentDialog.tsx:370-395`), commentaire à l'appui `InvoiceDetailHeader.tsx:257-259` |
| Créer un avoir | facture non-ticket validée | faible | exceptionnelle | `disabled` si `deposits_total_ttc > 0`, **sans explication** |
| Rembourser (facture / ticket / acompte) | 3 variantes | faible | exceptionnelle | Trois libellés pour un même geste mental |

**Problème structurel n° 2.** Aucune hiérarchie : douze actions à plat, dont
trois seulement sont « le prochain geste ». L'écran impose une découverte par
exploration là où il devrait imposer une évidence.

**Problème structurel n° 3.** « Créer un acompte » n'est atteignable qu'en
cliquant « Enregistrer paiement » puis en basculant d'onglet. Un utilisateur qui
veut *demander* un acompte sans rien encaisser n'a aucune raison de cliquer sur
« Enregistrer paiement ».

---

## 4. Frictions, classées par impact

1. **Le reste à payer réel n'est calculable par personne.** Avec un acompte
   *et* un avoir, il faut croiser `balance_due` (haut de page), le montant de
   l'avoir (carte rouge) et `total_ttc` (bas de page). `remaining_amount` existe
   en base, est chargé, et n'est jamais rendu.
2. **L'action suivante n'est jamais désignée.** Aucun CTA contextuel ; « PDF »
   occupe la place du primaire.
3. **La demande d'acompte est cachée derrière un libellé qui dit le
   contraire.**
4. **Les conditions de disponibilité sont muettes.** Solde indisponible quand un
   acompte est impayé, avoir grisé quand il y a des acomptes : deux règles justes,
   zéro explication.
5. **Le dossier n'a pas de vue d'ensemble** — 2 à 5 documents à ouvrir, avec une
   pile de navigation maison (`pushCurrentToStore`, `InvoiceDetailPage.tsx:222`).
6. **La facture de solde est un cul-de-sac** (§2).
7. **Le vocabulaire mélange trois registres.** « Solde restant », « Solde à
   régler », « Solde dû », « balance_due », « reste à payer » désignent la même
   chose ; « Versés » désigne les acomptes *créés* alors qu'un acompte peut être
   « En attente ».
8. **Pas de feedback structurel après action.** `handleCreateBalanceInvoice`
   (`useInvoiceActions.tsx:321`) affiche un toast et **ne propose pas d'ouvrir**
   la facture créée, alors que la suite logique est de l'encaisser.
9. **Le badge de synthèse disparaît en mobile** (`hidden sm:flex`).

---

## 5. Opportunités de simplification

**Affichage** — un bloc financier unique, en haut, remplaçant les deux actuels :

```
Total facture              1 200,00 €
− Acomptes encaissés         −360,00 €   (2 acomptes)
− Avoirs                     −100,00 €   (1 avoir)
= Reste à payer               740,00 €
```

Toutes les valeurs existent déjà : `total_ttc`, `deposits_total_ttc`,
`credit_notes_total`, `remaining_amount`, `balance_due`. **Rien à ajouter côté
métier.**

**Navigation** — une section « Dossier » listant parente, acomptes, avoirs et
facture de solde, document courant marqué, rendue **sur tous les types**, y
compris la facture de solde.

**Actions** — une zone « Prochaine action » avec **un seul** CTA primaire dérivé
de l'état, et une explication quand une action attendue est indisponible. Sortir
« Créer un acompte » du dialogue de paiement. Reléguer PDF et email en
secondaire, avoirs et suppression dans un menu « … ».

**Vocabulaire** — trois termes figés, un par notion : **Encaissé**, **Reste à
payer**, **Reste à facturer**. Remplacer « Versés » par « Encaissés », et
distinguer les acomptes émis non réglés.

**Incohérence métier relevée — corrigée par l'arbitrage A, voir §10.** La
première rédaction de cet audit affirmait une double protection sur
`canCreateDeposit`. **C'est faux.** `CreateDepositInvoice`
(`backend/deposit.go:80-100`) ne lit **ni `is_paid`, ni `balance_due`** sur la
parente : il n'assoit sa disponibilité que sur
`total_ttc − deposits_total_ttc`. Une seule protection existe, et elle est
côté client. Détail au §10.

---

## 6. Modèle mental cible

En moins de dix secondes :

> « Facture F-2026-0142, client Durand, 1 200 €. Il a versé 360 € en deux
> acomptes, j'ai passé 100 € d'avoir, il reste **740 €**. Les deux acomptes sont
> réglés, donc **je peux générer la facture de solde** — le bouton est là. »

Trois lectures, dans cet ordre : **identité et état**, **une soustraction
verticale**, **un bouton**.

---

## 7. Architecture cible de la page

Colonne unique, lecture verticale.

| Zone | Contenu | Justification |
|---|---|---|
| 1. Identité et état | n°, client, date, **un seul** badge | Le multi-badge actuel dilue |
| 2. Synthèse financière | la soustraction du §5 | Question n° 1, aujourd'hui insoluble |
| 3. Prochaine action | 1 CTA primaire, raison si indisponible | Les 3 actions principales sont au 6ᵉ rang d'un menu |
| 4. Dossier | parente / acomptes / avoirs / solde, courant marqué | Supprime la navigation en aveugle et le cul-de-sac |
| 5. Lignes et totaux fiscaux | table, HT / TVA / TTC | Consultation, pas décision — sous le pli, sans les montants de dossier |
| 6. Historique | événements datés | Répond à « que s'est-il passé ? » |
| 7. Actions secondaires | PDF, email, avoir, remboursement, suppression | Hors du chemin principal |

Les zones 4 et 6 se recouvrent partiellement : arbitrage au §8-3. Le client passe
de carte dédiée à ligne d'en-tête — il est déjà cliquable et rarement l'objet de
la visite.

---

## 8. Décisions à arbitrer

1. **Un acompte émis mais non réglé compte-t-il dans « encaissé » ?** Non au sens
   comptable. Faut-il alors une ligne « Acomptes en attente » informative ?
   `depositsData.pendingCount` existe déjà.
2. **Faut-il exposer « reste à facturer » ?** Le concept existe implicitement
   mais aucun champ ne le porte, et il se confond avec `balance_due`. Risque
   d'inventer une notion.
3. **Dossier et historique : une zone ou deux ?** Une chronologie datée peut
   absorber la liste des documents.
4. **Quelle synthèse pour un acompte ou un avoir ouvert isolément ?** Celle du
   dossier, ou celle du document courant ?
5. **Après création de la facture de solde, ouvre-t-on le nouveau document ?**
   Aujourd'hui : un toast, on reste sur place.
6. **Faut-il un paiement partiel hors acompte ?** Réponse par défaut : non — mais
   il faut alors le *dire* dans l'interface, car l'utilisateur essaiera.
7. **Le CTA unique supporte-t-il l'ambiguïté** — acompte payé *et* possibilité
   d'un nouvel acompte : lequel gagne ?

---

## 9. Expertises à solliciter

Quatre, et seulement celles qui apportent ce que l'audit ne couvre pas. Les
prompts autonomes correspondants sont tenus hors de ce document, dans la session
qui les commande.

| # | Expertise | Ce qu'elle tranche |
|---|---|---|
| A | Workflows de facturation | Décisions 1, 2, 6 et l'incohérence `balance_due === 0` du §5 |
| B | UX POS | La table `état → action primaire`, et le message d'indisponibilité |
| C | Microcopy français | Le lexique du §5, un terme par notion, dans toute l'application |
| D | Front-end React / TanStack | La découpe des 1066 lignes en 7 zones, sans toucher au métier |

---

## Ce que cet audit ne couvre pas

- Le comportement réel en mobile : `hidden sm:flex` est **lu dans le code**, pas
  mesuré à l'écran.
- La fréquence réelle des dossiers multi-acomptes chez le client : inconnue.
- Les écrans voisins — liste des factures, création, édition — non audités.

---

## 10. Arbitrages rendus — expertise « workflows de facturation » (30 août 2026)

### Préalable : `deposits_total_ttc` a TROIS sémantiques

| Chemin d'écriture | Ce que le champ vaut ensuite |
|---|---|
| Création d'acompte (`backend/deposit.go:278`) | acomptes **créés**, payés ou non |
| Avoir via `computeNetDepositsTotal` (`backend/refund.go:245, 299-325`) | acomptes **encaissés, nets d'avoirs** |
| Avoir via `POST /api/invoices/deposit/refund` (`backend/routes/deposit_routes.go:372-377`) | soustraction brute, `is_paid` non vérifié |

Le champ change donc de définition selon l'histoire du dossier. **Aucun montant
montré au client ne doit s'appuyer sur `deposits_total_ttc` ni sur
`balance_due`** : ce sont des garde-fous, pas des sources.

### Q1 — Un acompte émis non encaissé n'est PAS une déduction

Deux lignes distinctes ; seuls les acomptes encaissés entrent dans le reste à
payer. Calcul, à partir de `GET /api/invoices/:id/deposits`, déjà servi :

```
acomptes_encaissés  = Σ deposits[i].total_ttc  où is_paid && !has_credit_note
acomptes_en_attente = Σ deposits[i].total_ttc  où !is_paid
reste_à_payer       = total_ttc − acomptes_encaissés − credit_notes_total
```

*Précision apportée le même jour par le §14 : le terme `!has_credit_note` est
obligatoire — la route de remboursement d'acompte réellement appelée laisse
`is_paid = true` sur un acompte remboursé.*

Ne jamais additionner `credit_notes_total` et un avoir frappant un acompte :
`computeNetDepositsTotal` l'absorbe déjà — double déduction sinon.

*Fiscal :* la TVA sur acompte est exigible à l'encaissement (CGI art. 269-2-c).
Afficher « Versés » sur un acompte non réglé affirme un encaissement qui n'a pas
eu lieu, sur un document **émis, verrouillé et scellé dès sa création**
(`backend/deposit.go:208-209, 244-245`). Aucune migration.

### Q2 — « Reste à facturer » : ne pas l'exposer

La parente est émise pour son **total** avant tout acompte ; les acomptes
prélèvent, la facture de solde **retranche** (`backend/deposit.go:376-391`) sans
créer de base taxable — d'où ses lignes déductives à `tva_rate: 0`. La notion
vaut donc `total_ttc` ou `0` : c'est un booléen, déjà porté par
`DepositsForInvoice.balanceInvoice`. L'exposer en montant suggérerait une TVA
restant à collecter. **La décision §8-2 est tranchée : non.**

*À vérifier avant de dessiner le bloc TVA :* la ventilation reconstruite par
ligne côté écran (`InvoiceDetailPage.tsx:163-180`) rangera l'écart du solde au
taux 0 %. Lu dans le code, non mesuré sur un document réel.

### Q3 — Il n'y a pas deux protections, il y en a UNE

`CreateDepositInvoice` (`backend/deposit.go:80-100`) ne lit **ni `is_paid`, ni
`balance_due`**. Sa disponibilité est `total_ttc − deposits_total_ttc`. Sur une
facture de 1 200 € soldée après 360 € d'acomptes, `balanceAvailable = 840 > 0.01`
— **le test passe**. Sans acompte du tout, il autorise un acompte de 100 % sur une
facture déjà payée. Le seul rempart est `!invoice.is_paid` à
`invoice.types.ts:431`, **côté client**, contournable par appel direct à
`POST /api/invoices/deposit`.

*Gravité :* le document produit est numéroté en série continue
(`backend/deposit.go:171`), verrouillé et haché dans la chaîne ISCA **globale**
(`:209, 238-245`), déclenche un mouvement de caisse si réglé en espèces
(`:259-273`), et porte une TVA déjà collectée par la parente. La parente ressort
avec `is_paid = true` **et** `balance_due > 0`, état qu'aucun lecteur ne sait
interpréter.

*Correctif — backend, sans migration.* Trois ajouts entre `deposit.go:89` et
`:91` : refuser si `parent.GetBool("is_paid")` ; refuser si une facture de solde
existe déjà (la requête existe, `:346-352`, elle n'est pas appelée) ; asseoir
`balanceAvailable` sur `computeNetDepositsTotal`. **Corriger le seul client
donnerait l'illusion d'avoir fermé la faille.**

### Non vérifié par cette expertise

- Laquelle des deux routes d'avoir sur acompte est appelée par le front.
- La ventilation TVA d'une facture de solde réelle.
- Aucun dossier de production consulté.

---

## 11. Hiérarchie des actions — expertise « UX POS » (30 août 2026)

### La fonction de résolution

Un point de décision unique, alimenté par `invoice` + `depositsData` +
`linkedCreditNotes`, rendant `{ primaire | null, raison_absence, secondaires
(0-2), menu }`. Trois invariants :

1. `primaire === null` ⇒ `raison_absence !== null`. **Jamais d'écran muet.**
2. Un seul rang primaire. **`PDF` cesse d'être primaire.**
3. Le rang primaire ne va qu'à une action qui **fait avancer le dossier** :
   valider, convertir, encaisser, générer le solde, créer un acompte. Jamais à
   PDF, email, avoir, remboursement, suppression.

Ordre de priorité — premier prédicat vrai :

```
1. status === 'draft'                          -> Valider
2. isTicket && !converted_to_invoice           -> Convertir en facture
3. canMarkAsPaid && remainingTtc > 0           -> Encaisser   (corrigé §16-2)
4. canGenerateBalance                          -> Générer la facture de solde
5. canCreateDeposit && !balanceInvoice         -> Créer un acompte
6. sinon                                       -> aucun primaire + raison
```

### Les treize états

Libellés provisoires — le lexique relève de l'expertise C.

| # | État | Primaire | Secondaires (≤2) | Message si indisponible |
|---|---|---|---|---|
| 1 | Brouillon | **Valider** | PDF · Modifier | « Un brouillon ne s'encaisse pas : validez-le d'abord. » |
| 2 | Validée, non payée, aucun acompte | **Encaisser** | PDF · **Créer un acompte** | — |
| 3 | Validée, ≥1 acompte en attente | **Encaisser** (voir question ouverte 5) | PDF · Créer un acompte | « La facture de solde attend le règlement de N acompte(s). » |
| 4 | Acomptes tous encaissés, pas de solde émis | **Générer la facture de solde** | PDF · Encaisser le solde | — |
| 5 | Facture de solde existante, impayée | **Ouvrir la facture de solde** | PDF | « Une facture de solde a été émise : le dossier est clos à l'acompte. » |
| 6 | Entièrement soldée | *aucun* | PDF · Email | « Facture soldée le JJ/MM. Plus rien à encaisser. » |
| 7 | Avec avoir d'annulation | **Encaisser** si un reste à payer subsiste — **corrigé §16-2** | PDF · Ouvrir l'avoir | message seulement si le reste à payer est nul |
| 8 | Acompte seul, non payé | **Encaisser** | PDF · Retour à la facture | — |
| 9 | Acompte seul, payé | *aucun* | PDF · **Retour à la facture** | « Acompte réglé le JJ/MM. La suite se passe sur la facture F-…. » |
| 10 | Avoir seul | *aucun* | PDF · Retour au document remboursé | « Un avoir est un document scellé : rien à encaisser ni à modifier. » |
| 11 | Ticket non converti | **Convertir en facture** | PDF · Encaisser | « Un ticket ne porte pas d'acompte. » |
| 12 | Ticket converti | *aucun* | PDF · Ouvrir la facture issue | « Ticket déjà converti en F-…. » |
| 13 | Facture de solde ouverte seule | **Encaisser** si impayée | PDF · **Retour à la parente** | « Ce document est la facture de solde du dossier F-…. » |

### Les ambiguïtés, tranchées

**Acompte encaissé ET nouvel acompte possible (décision §8-7).** Le seul
chevauchement réel est : acomptes tous réglés, solde restant, pas de facture de
solde. Règle rendue — **fermer le dossier prime sur l'élargir** : le solde est
primaire, l'acompte descend en secondaire. Motif métier : un acompte
supplémentaire est numéroté, verrouillé et haché dès sa création ; le solde est
l'aboutissement attendu et majoritaire.

**Encaisser vs créer un acompte (état 2).** Encaisser gagne : c'est le cas
nominal, l'acompte est la dérogation. L'acompte reste **secondaire visible,
jamais dans le menu**.

**Règle générale de départage.** Celui qui rend un document irréversible plus
tard perd ; celui qui est fréquent gagne. Dans cet ordre.

### Le critère unique des indisponibilités

**La distance entre l'utilisateur et le rétablissement de l'action.**

| Traitement | Critère | Exemple |
|---|---|---|
| **Masquer** | L'action n'existe pas pour ce **type de document**, jamais. | Acompte sur un avoir, sur un ticket |
| **Désactiver + explication** | Elle **redeviendra** disponible par un geste identifiable. | « Générer le solde » quand `pendingCount>0` ; « Créer un avoir » quand des acomptes existent (`InvoiceDetailHeader.tsx:303`, aujourd'hui désactivé **muet**) |
| **Message sans bouton** | État **terminal** : rien ici ne rendra l'action possible. | Facture soldée, acompte payé, avoir, ticket converti |

Conséquence : **« Générer la facture de solde » ne doit plus disparaître** sur
`pendingCount > 0` (`InvoiceDetailPage.tsx:226`) — c'est un cas 2, pas un cas 1.

Même critère, variante préventive : le dialogue d'encaissement doit annoncer
**avant la saisie** que le seul règlement partiel est l'acompte. Aujourd'hui il
ne le refuse qu'après coup (`InvoicePaymentDialog.tsx:142-145`, « Montant
insuffisant »). C'est la réponse à la décision §8-6.

### « Créer un acompte » sort du dialogue d'encaissement

1. Action de premier niveau, **secondaire visible** aux états 2, 3 et 4, jamais
   dans le menu « … ».
2. **L'onglet disparaît** de `InvoicePaymentDialog` (`:133`, `:371-396`) : il
   impose de cliquer « Enregistrer paiement » pour faire l'inverse.
3. Restent dans le dialogue : le récap « Total / Acomptes encaissés / Solde à
   régler » (`:340-368`), qui est juste, **plus** la phrase préventive ci-dessus.
4. Le clic ouvre son propre dialogue, reprenant le mode acompte actuel — même
   mutation, mêmes bornes, aucune règle nouvelle.
5. **Condition à renforcer côté écran** : `canCreateDeposit(invoice) &&
   !depositsData?.balanceInvoice`. Le prédicat seul ne teste pas l'existence
   d'une facture de solde (`invoice.types.ts:425-437`), que l'arbitrage §10 Q3
   interdit ; la donnée est déjà chargée (`deposits.ts:165`).

### PDF et email

**PDF perd le rang primaire** (`InvoiceDetailHeader.tsx:384-396`) et devient le
secondaire permanent des treize états : c'est un point d'ancrage, pas un appel à
l'action, et l'enfouir ferait payer un clic à un geste quotidien.

**Email descend au menu**, sauf états 6 et 12 où il n'y a pas de primaire. Deux
corrections imposées : il est aujourd'hui poussé **inconditionnellement**
(`:188-196`), donc proposé sur un **brouillon** — à masquer sur
`status === 'draft'`. Et « Marquer envoyée » (`:198-205`) reste au menu
définitivement : double emploi avec l'email, aucun encaissement avancé.

### Questions ouvertes laissées par cette expertise

1. **Retour à la parente depuis une facture de solde (état 13).**
   `useDepositsForInvoice` n'est appelé qu'avec l'id du **document courant**
   (`InvoiceDetailPage.tsx:130-131`) : sur un solde, la route répond à vide.
   Décision d'implémentation, non tranchée.
2. **Avoir d'annulation vs avoir partiel.** `hasCancellationCreditNote`
   (`:158-160`) vaut vrai dès qu'**un** avoir existe, quel que soit son montant,
   et coupe l'encaissement. Savoir si un avoir partiel devrait laisser la facture
   encaissable n'est pas décidable avec ce booléen.
3. **`canCreateDeposit` accepte `balance_due === 0`** : la hiérarchie affiche ce
   que le prédicat autorise ; le rempart doit être backend (§10 Q3).
4. **Les deux autres appelants** — `InvoicesPage.tsx:1122`,
   `TicketInfoCard.tsx:355` — n'ont pas `depositsData` : le durcissement du point
   5 ne s'y transpose pas en l'état.
5. **État 3, plusieurs acomptes en attente** : désigner lequel encaisser n'a pas
   de règle. Repli retenu — primaire « Encaisser la facture », liste des acomptes
   en attente rendue à côté, sans CTA.

---

## 12. Lexique — expertise « microcopy » (30 août 2026)

### Les huit libellés qui mentent

1. **« Versés »** (`InvoiceDetailPage.tsx:544`) — acomptes **créés** présentés
   comme encaissés. Le plus grave.
2. **« Acomptes déjà versés »** (`InvoicePaymentDialog.tsx:343`) — idem.
3. **« Acomptes encaissés »** (`InvoicePaymentDialog.tsx:352`) — libellé juste,
   **montant faux** : la source est `deposits_total_ttc` (`:118`).
4. **Badge « Acompte X · Solde Y »** (`InvoiceDetailHeader.tsx:160`) — idem, et
   invisible sous 640 px.
5. **« Solde restant »** (`InvoiceDetailPage.tsx:554`) — **ignore les avoirs**.
6. **« Montant »** (`InvoicesPage.tsx:1163`) — tantôt le total, tantôt le solde
   (`:1165-1171`).
7. **Filtre « Annulée »** (`InvoicesPage.tsx:740`) — **statut inexistant** :
   `InvoiceStatus` ne vaut que `draft | validated | sent`
   (`invoice.types.ts:12`). Filtre mort.
8. **Badge « Avoir »** (`InvoicesTable.tsx:210`) — sur une facture il signifie
   « a un avoir », pas « est un avoir ».

À quoi s'ajoute le commentaire de schéma lui-même : `invoice.types.ts:124` dit
« somme des acomptes **versés** » pour un champ qui compte les créés. Le
commentaire installe la faute chez le prochain lecteur.

### Le glossaire figé

Convention : **« encaissé » = l'argent est entré** ; **« facturé / émis » = le
document existe**. Les deux registres ne se croisent jamais.

| Terme figé | Définition | Interdits |
|---|---|---|
| **Total de la facture** | Montant TTC émis, avant acompte et avoir | ~~Montant TTC~~, ~~Montant~~, ~~Total~~ |
| **Acomptes demandés** | Somme des acomptes émis, encaissés ou non. Suivi seul, **jamais soustrait** | ~~Versés~~, ~~Acomptes~~ tout court |
| **Acomptes encaissés** | Somme des acomptes dont l'argent est entré. **Seule ligne déduite** | ~~Versés~~, ~~Acomptes payés~~, ~~Déjà perçu~~ |
| **Acomptes en attente d'encaissement** | Somme des acomptes émis non encaissés. **Hors soustraction** | ~~En attente~~ seul, ~~À recevoir~~ |
| **Avoirs** | Somme des avoirs du dossier. Se déduit | ~~Remboursements~~, ~~Annulations~~ |
| **Déjà encaissé** | Acomptes encaissés + solde encaissé, si un cumul unique est nécessaire | ~~Payé~~, ~~Réglé~~, ~~Perçu~~ |
| **Reste à payer** | Total − acomptes encaissés − avoirs. **Le seul chiffre annoncé au client** | ~~Solde restant~~, ~~Solde à régler~~, ~~Solde dû~~, ~~Montant dû~~ ; **jamais assis sur `balance_due`** |

Notion volontairement **non nommée** (§10 Q2) : le « reste à facturer ».

Rendu attendu — aucune ligne à zéro n'est affichée :

```
Total de la facture                        1 200,00 €
− Acomptes encaissés  (2 acomptes)          −360,00 €
− Avoirs              (1 avoir)             −100,00 €
─────────────────────────────────────────────────────
= Reste à payer                              740,00 €

  1 acompte en attente d'encaissement         240,00 €
```

La ligne « en attente » est **sous le trait**, en gris, sans signe : sa position
montre qu'elle ne participe pas au calcul.

### Les actions

Règle de conjugaison : **« encaisser » est le geste du commerçant**, « payer »
celui du client. L'interface parle au commerçant.

| Geste | Libellé figé | Remplace |
|---|---|---|
| Encaisser | **Encaisser** | `Enregistrer paiement` (`InvoiceDetailHeader.tsx:269`), `Enregistrer un paiement` (`InvoicesPage.tsx:1110`) |
| Confirmer | **Encaisser \<montant\>** | `Confirmer le paiement` (`InvoicesPage.tsx:1291`) |
| Après action | **Encaissement enregistré** | `Paiement enregistré` (`InvoicePaymentDialog.tsx:207, 253`) |
| Tout d'un coup | **Encaisser la totalité** | `Paiement complet` (`:382`), `Paiement total` (`InvoicesPage.tsx:1130`) |
| Acompte | **Demander un acompte** | onglet `Acompte` (`:393`) ; absent du menu |
| Confirmer l'acompte | **Demander l'acompte (30 %)** | `Créer l'acompte…` (`:555`) |
| Solde | **Facturer le solde** | `Générer la facture de solde` (`InvoiceDetailHeader.tsx:286`) |
| Rembourser | **Rembourser le client** | `Rembourser` (`:324`) **et** `Rembourser ticket` (`:342`) |
| Motif | **Motif** | `Motif d'annulation` (`InvoiceDetailPage.tsx:907`) **et** `Motif du remboursement` (`:991`) |
| Fermer | **Fermer** | `Annuler` partout — collision frontale avec « avoir d'annulation » |
| Différer | **Encaisser plus tard** | `Payer plus tard` (`InvoicePaymentDialog.tsx:546`) |

### Les badges — **corrigé le 30 août 2026, voir §16**

*La règle « un seul badge » ci-dessous perdrait le statut « Envoyée », qui est
aujourd'hui affiché et n'est porté par rien d'autre. Elle est remplacée par deux
axes distincts (§16-1). La table ci-dessous reste valable pour l'axe
encaissement seul.*

### Un seul badge par document (axe encaissement)

| Nature | Badge unique |
|---|---|
| Brouillon | **Brouillon** |
| Validée, rien d'encaissé | **À encaisser**, ou **En retard** si échéance dépassée |
| Acomptes encaissés, reste positif | **Partiellement encaissée** |
| Intégralement encaissée | **Encaissée** |
| Annulée par un avoir | **Annulée par avoir** |
| Acompte | **Acompte à encaisser** / **encaissé** / **remboursé** |
| Avoir | **Avoir** |
| Ticket | **Ticket** / **Ticket converti** |

Disparaissent : `Payée` (`InvoiceDetailHeader.tsx:144`), `Non payée` (`:152`),
`Réglé` (`:126`), `Remboursé` en doublon (`:117` et `:132`), et le composite
`Acompte X · Solde Y` (`:160`) — son montant remonte dans la synthèse, où il
reste lisible en mobile.

### Messages d'indisponibilité — cause et levée

Affichés **à la place** de l'action, en gris, jamais en toast. Extraits :

- « Le solde ne se facture pas tant que les acomptes demandés ne sont pas tous
  encaissés. »
- « Une facture avec acomptes ne s'annule pas d'un avoir global — remboursez
  chaque acompte, puis la facture de solde. »
- « Aucune caisse n'est ouverte — impossible d'encaisser tant que la journée
  n'est pas commencée. » *(reformule le seul message existant de l'écran,
  `InvoicePaymentDialog.tsx:533-536`)*
- « Cette facture a été annulée par un avoir — elle ne s'encaisse plus. »
- « Le solde est déjà facturé — plus d'acompte possible sur ce dossier. »

Le relevé complet des renommages, fichier par fichier et ligne par ligne, est
tenu dans le rapport de l'expertise ; il couvre `InvoiceDetailPage`,
`InvoiceDetailHeader`, `InvoicePaymentDialog`, `invoice.types.ts`,
`InvoicesTable` et `InvoicesPage`.

### Découverte hors périmètre — un dialogue mort, vérifié

`InvoicesPage.tsx:1107-1300` est un **doublon complet** du dialogue
d'encaissement, au vocabulaire divergent sur six libellés. Il est
**inatteignable** : `setPaymentDialogOpen(true)` n'est appelé que par
`handleOpenPaymentDialog` (`:348`), dont l'unique référence est la prop
`onOpenPayment` passée à `InvoicesTable` (`:778`) — or `InvoicesTable` déclare
cette prop et neuf autres sans jamais les lire, ce que son propre commentaire
assume (`InvoicesTable.tsx:40`, « Props conservées pour compatibilité […] non
utilisées dans la table »). Environ 200 lignes mortes. **Vérifié par relecture
directe.** Le renommer serait du travail perdu : trancher entre le supprimer et
le rebrancher.

### Questions ouvertes laissées par cette expertise

1. **Le statut « Envoyée » perd son badge.** Où va l'information d'envoi ?
   Proposition : mention datée près de la date. Non tranché.
2. Décisions §8-4 et §8-7 de l'audit : le glossaire tient dans les deux cas,
   mais le choix des lignes affichées en dépend.
3. Sort du dialogue mort ci-dessus.

---

## 13. Plan d'implémentation — expertise « front-end » (30 août 2026)

**Correction de comptage :** l'écran monte **8** dialogues sans condition
(`InvoiceDetailPage.tsx:887-1063`), pas 7 comme l'annonçait le §2.

### Le point unique de calcul

Trois fichiers **de métier pur**, hors du module, testables sans React — seule
position compatible avec la culture de gardiens du dépôt (aucun `*.test.*`
n'existe aujourd'hui dans `modules/connect/`) :

```
frontend/lib/invoices/
  dossier-summary.ts   computeInvoiceSummary() — LA synthèse, un seul lieu
  next-action.ts       resolveNextAction() — les 13 états du §11, sans JSX
  dossier-id.ts        resolveDossierId() — quel id interroger pour /deposits
```

Trois règles gravées dans `computeInvoiceSummary`, dictées par le §10 :

- `depositsCollectedTtc` se somme **depuis la liste `deposits`, filtrée sur
  `is_paid && !has_credit_note`** — jamais depuis `deposits_total_ttc`. Le
  second terme est obligatoire : la route de remboursement réellement appelée
  laisse `is_paid = true` sur un acompte remboursé (§14).
- `creditNotesTtc` vient de `parent.credit_notes_total`, **pas** d'une somme des
  avoirs listés : sommer les deux double la déduction.
- **Aucun recalcul de TVA.** La fonction ne touche que du TTC.

Le hook `useInvoiceDossier(invoiceId)` agrège les quatre queries et expose
`summary` + `nextAction`. `resolveNextAction` est **pure** : la vue mappe
`id → handler` sur `useInvoiceActions`, qui n'est pas touché.

### La facture de solde — résolution, chiffrée

`deposit_routes.go:191-232` traite `:id` comme la **parente**. Une facture de
solde passe le filtre `!isCreditNote && !isDeposit`
(`InvoiceDetailPage.tsx:130-131`) et la route **répond 200 avec un dossier
vide** : pas une erreur, un mensonge silencieux.

Résolution retenue — un id de dossier dérivé, **sans double appel** :

```ts
resolveDossierId(invoice)  // solde -> original_invoice_id ; parente -> son id
```

| Document ouvert | Aujourd'hui | Après | Delta |
|---|---|---|---|
| Parente / simple | 1 appel | 1 appel, **même clé de cache** | 0 |
| Facture de solde | 1 appel **faux** | 1 appel juste | 0 |
| Acompte | 0 | 1 | **+1** |
| Avoir | 0 | 1 | **+1** |
| Ticket | 1 appel inutile | 0 | **−1** |

Le `+1` est le prix de la zone 4 sur tous les types, exigée par le §7 et par les
états 8, 9, 10 et 13 du §11 : sans lui, « Retour à la facture F-… » ne peut pas
nommer la facture. Et la clé est celle déjà chargée par la page de la parente,
d'où l'on vient : **réseau réel dans le parcours nominal, zéro**.

### Les dialogues, et une requête parasite

Les 8 dialogues sont instanciés à chaque rendu, y compris sur un avoir où cinq
sont inatteignables. `InvoicePaymentDialog` déclenche à lui seul
`useHasAnyOpenCashSession` (`:93`) : **une requête caisse à chaque ouverture de
facture**, sans intention d'encaisser. *Vérifié.*

Correctif : montage gardé par `{actions.xDialogOpen && <XDialog …/>}`. Deux
précautions lues : le dialogue de paiement fait son reset à l'ouverture
(`:98-109`) et porte son écran de succès en état local (`:76-79`) — la garde
`open === true` ne le démonte donc jamais pendant qu'il sert ; et **le
verrouillage de fermeture (`:298-313`) est à l'intérieur du composant**, le
montage conditionnel ne le touche pas. Ne pas le déplacer vers l'appelant.

### L'ordre hooks / guards

L'ordre actuel est une **conséquence** : `useInvoiceDetailHeader` est un hook, il
précède tout `return`, et il consomme les calculs — d'où les `invoice?.` et les
`as any`. Correctif : **il cesse d'être un hook** (il n'appelle que
`useNavigate`, `InvoiceDetailHeader.tsx:76`) et devient deux composants. Les
guards remontent alors devant tout, `invoice` cesse d'être optionnel, et les
`any` tombent d'eux-mêmes.

### Le typage, sans `typegen`

`typegen` reste interdit et n'est **pas nécessaire** : `InvoiceResponse` et
`InvoiceItem` sont déjà écrits à la main (`invoice.types.ts:41-126`). Quatre
champs manquent, lus dans la page — `split_payments`, `refund_method`,
`source_order_id`, `expand.sold_by`. Les ajouter suffit à supprimer **tous** les
`(invoice as any)`.

### Le plan, en huit étapes livrables seules

| # | Étape | Livrable seul | Gardien |
|---|---|---|---|
| 1 | 4 champs de type + correction du commentaire menteur `invoice.types.ts:124` | oui | `tsc` |
| 2 | `dossier-summary.ts` + `dossier-id.ts`, **sans appelant** | oui | 5 assertions, dont : une liste `deposits` incohérente avec `deposits_total_ttc` doit rendre le chiffre **de la liste** ; et un acompte remboursé (`has_credit_note`) ne compte pas comme encaissé (§14) |
| 3 | `next-action.ts` | oui | les 13 états, + invariant « primaire nul ⇒ raison non nulle » |
| 4 | `useInvoiceDossier` branché, **rendu inchangé** | oui | `resolveDossierId` sur les 4 types |
| 5 | Guards en tête, header en composants | oui | `tsc` strict + un test `grep` « plus de `as any` », à l'image de `single-source.test.ts` |
| 6 | Zones 5 et 4 extraites (les grosses, sans arbitrage) | oui | `presenters.test.ts` : `getLineDiscountLabel` sur ses 4 branches, `vatBreakdown` multi-taux |
| 7 | Zones 2 et 3 — **la seule étape visible de l'utilisateur** | oui | exhaustivité : aucune action du menu actuel absente de `primary ∪ secondary ∪ menu` |
| 8 | Suppression du dialogue mort de `InvoicesPage` | oui, **indépendante des 7 autres** | `tsc` + `grep` |

`InvoiceDetailPage.tsx` passe sous 300 lignes **dès l'étape 6**, et atterrit vers
150-180.

### Le dialogue mort : supprimer, ne pas rebrancher

Il n'a **pas** le verrouillage de fermeture (`InvoicesPage.tsx:1107`, monté
`onOpenChange={setPaymentDialogOpen}`, donc fermable par Échap et clic
extérieur). Le rebrancher remettrait en circulation la variante **sans** la
protection contre la double facturation. Si l'encaissement depuis la liste est un
besoin, il se rouvre en une ligne avec le composant partagé — ticket distinct.

### Sept refus argumentés

1. **Pas de contexte React** pour le dossier : il rendrait invisible qui consomme
   la synthèse, donc invisible le jour où une section recalcule en douce.
2. **Pas de `useMemo`** prématuré sur la synthèse : `deposits` change de
   référence à chaque réponse, le mémo ne mémoïse rien et masque le calcul.
3. **Ne pas présenter le durcissement client comme la correction de la faille**
   §10 Q3. Le rempart est backend.
4. **Ne pas toucher au verrouillage de fermeture** en passant, même pour
   « simplifier ».
5. **Ne pas fusionner zones 4 et 6** : la chronologie exige une source
   d'événements (`audit_logs`, `invoice.types.ts:237-254`) dont l'interrogation
   depuis le front n'est pas vérifiée. **La zone 6 n'est pas livrée par ce
   plan** ; son fichier est un emplacement réservé.
6. **Ne pas extraire `useInvoiceActions`** dans la même livraison : ce serait
   mêler un déplacement sûr à une réécriture.
7. **Pas de `zod`** sur `InvoiceResponse` : une seconde déclaration du même
   contrat, exactement la faute de forme qu'on supprime.

### Non vérifié par cette expertise

- La ventilation TVA d'une facture de solde réelle — `vatBreakdown` rangera les
  lignes déductives en « TVA 0 % ». L'étape 6 le **déplace à l'identique**,
  délibérément.
- ~~Laquelle des deux routes d'avoir sur acompte le front appelle.~~
  **Tranché le 30 août 2026, voir §14** : c'est la route à soustraction brute,
  et elle impose un terme de plus au filtre de la synthèse.

---

## 14. Point tranché — quelle route d'avoir sur acompte (30 août 2026)

Les §10, §12 et §13 laissaient tous cette question ouverte ; elle bloquait
l'écriture du test de l'étape 2. **Elle est résolue, par lecture directe.**

Le front appelle **`/api/invoices/deposit/refund`**
(`frontend/lib/queries/invoices.ts:960`, dans `useRefundDeposit`), servie par
`backend/routes/deposit_routes.go:241`. C'est **la route à soustraction brute** :

```go
existingTotal  := parent.GetFloat("deposits_total_ttc")
newTotal       := max(0, existingTotal - depositAmountTTC)   // deposit_routes.go:371-373
parent.Set("deposits_total_ttc", newTotal)
parent.Set("balance_due", parentTotalTTC - newTotal)         // :376-377
deposit.Set("has_credit_note", true)                          // :383
```

Elle ne vérifie **pas** `is_paid`, et ne touche **pas** `credit_notes_total` de
la parente. `computeNetDepositsTotal` (`backend/refund.go:299-325`) sert l'autre
route, `/api/invoices/refund` (`backend/routes/invoice_routes.go:32`), celle des
factures — **jamais** les acomptes.

### Ce que cela change dans la règle de synthèse du §13

La règle « sommer `deposits` filtrée sur `is_paid` » est **insuffisante en
l'état**. Un acompte remboursé conserve `is_paid = true` et reçoit
`has_credit_note = true` : il serait compté comme encaissé alors que l'argent est
ressorti. Le filtre correct est :

```
depositsCollectedTtc = Σ deposits[i].total_ttc  où is_paid && !has_credit_note
```

`has_credit_note` est déjà typé (`invoice.types.ts:119`). **Le cas 4 du test de
l'étape 2 se rédige maintenant**, et il porte sur ce prédicat, pas sur une
double déduction avec `credit_notes_total` — laquelle ne peut pas se produire,
cette route ne touchant pas ce champ.

---

## 15. Faille §10 Q3 — corrigée le 30 août 2026 (non commitée)

`CreateDepositInvoice` (`backend/deposit.go`) porte désormais trois contrôles
qui n'existaient nulle part côté serveur :

1. **Refus si `parent.is_paid`** — « impossible de créer un acompte sur une
   facture déjà réglée ».
2. **Refus si une facture de solde existe** — par `findBalanceInvoice`, la
   requête qui vivait en clair dans `CreateBalanceInvoice` et qui est désormais
   appelée par les deux : **un seul chemin pour la règle « existe-t-il un
   solde »**.
3. **La disponibilité ne s'assied plus sur `deposits_total_ttc`**, dont le §14
   confirme la sémantique instable.

### Deux notions distinctes, deux fonctions

Le premier correctif assoyait la disponibilité sur `computeNetDepositsTotal`
(acomptes **encaissés**). C'était un assouplissement : on pouvait empiler des
acomptes impayés dont la somme dépasse la facture — chacun étant un document
numéroté, scellé et haché. Corrigé le même jour.

| Fonction | Compte | Sert à |
|---|---|---|
| `computeNetDepositsTotal` (`refund.go:299`) | acomptes **encaissés**, nets d'avoirs | le reste à payer, la comptabilité (TVA exigible à l'encaissement) |
| `computeEngagedDepositsTotal` (`deposit.go`) | acomptes **engagés** — émis ET encaissés, nets d'avoirs | la disponibilité pour un **nouvel** acompte |

Un acompte remboursé libère son solde ; un acompte émis non encaissé le retient.
Les deux règles sont voisines dans le fichier et documentées l'une par l'autre.

### Gardiens — `backend/deposit_guard_test.go`

Six, tous passants, chaque refus vérifiant en plus qu'**aucun document n'a été
écrit** :

1. acompte refusé sur facture réglée (le cas 1 200 € / 360 € du §10 Q3) ;
2. acompte de 100 % refusé sur facture réglée sans acompte préalable ;
3. acompte refusé quand une facture de solde existe ;
4. **cas nominal accepté** — sinon le gardien ne prouverait rien ;
5. un acompte remboursé ne consomme pas de solde ;
6. un acompte émis non encaissé **consomme** du solde.

`go test ./backend/...` : tout passe. Contre-épreuve faite par l'agent —
`deposit.go` remis à l'état du dépôt, quatre gardiens tombent.

### Ce qui reste ouvert

- **`deposits_total_ttc` garde ses trois sémantiques.** Le correctif ne touche
  que la décision d'autorisation ; ce que la parente stocke et ce que les écrans
  lisent est inchangé. Unifier serait une seconde décision.
- **`deposit_routes.go:372-377` reste la source de la divergence** : elle
  soustrait sans vérifier `is_paid`.
- Le prédicat client `invoice.types.ts:431` reste — il n'est simplement plus le
  seul rempart.

---

## 16. Quatre vérifications imposées par le propriétaire (30 août 2026)

Demandées **avant** toute modification de comportement. Chacune a été vérifiée
dans le code ; deux corrigent une recommandation d'expertise.

### 16-1. « Envoyée » garde son badge — le §12 avait tort

**Vérifié.** Le badge de workflow est bien rendu aujourd'hui :
`InvoiceDetailHeader.tsx:138-140` affiche `displayStatus.label` dès qu'il vaut
autre chose que « Payée ». Sur une facture envoyée non réglée, l'écran porte
donc **« Envoyée » ET « Non payée »** — deux informations, deux axes.

Et `sent` est **terminal** dans le workflow
(`ALLOWED_STATUS_TRANSITIONS`, `invoice.types.ts:326-332` :
`draft → validated → sent → ∅`). Aucun autre champ ne porte l'information
d'envoi : la faire disparaître du badge la ferait disparaître tout court.

**Règle retenue — deux axes, jamais fusionnés :**

| Axe | Valeurs | Source |
|---|---|---|
| **Workflow** | Brouillon · Validée · Envoyée | `status` |
| **Encaissement** | À encaisser · Partiellement encaissée · Encaissée · En retard | `is_paid`, synthèse, `isOverdue` |

Au plus **deux** badges, un par axe — pas quatre comme aujourd'hui, pas un seul
comme le proposait le §12. Ce qui disparaît reste : le composite
« Acompte X · Solde Y » (`:154-162`, invisible en mobile, son montant remonte
dans la synthèse) et les doublons `Réglé` / `Remboursé` (`:117`, `:126`, `:132`).

**Défaut existant à corriger au passage** : `:138` masque le libellé de workflow
dès que la facture est payée. Une facture **envoyée puis encaissée** perd donc
« Envoyée » aujourd'hui. Les deux axes étant indépendants, ce masquage n'a plus
lieu d'être.

### 16-2. Un avoir ne bloque pas l'encaissement — le §11 avait tort

**Vérifié, et le blocage est purement d'interface.**

Côté serveur, `backend/pay.go:66-78` ne refuse que trois choses : un brouillon,
un document **qui est** un avoir, une facture **déjà encaissée**. Il n'existe
**aucun contrôle** refusant d'encaisser une facture qui **porte** un avoir.

Le blocage vient d'une seule ligne côté client :
`InvoiceDetailHeader.tsx:264`, `canMarkAsPaid(invoice) && !hasCancellationCreditNote`.
Et `hasCancellationCreditNote` (`InvoiceDetailPage.tsx:158-160`) vaut vrai dès
qu'**un** avoir existe, **quel que soit son montant** — la requête qui l'alimente
ne filtre que sur le type et le document d'origine
(`invoices.ts:872-874`), jamais sur une notion d'annulation totale.

**Conséquence mesurée par lecture :** un avoir de 50 € sur une facture de
1 200 € rend aujourd'hui l'encaissement des 1 150 € restants **impossible depuis
l'écran**, alors que le serveur l'accepterait.

**Règle retenue :** l'encaissement se gouverne par le **reste à payer**, pas par
l'existence d'un avoir.

```
Encaisser proposé  ⇔  canMarkAsPaid(invoice) && remainingTtc > 0
```

Le cas « annulée par avoir » n'est plus un état à part : c'est le cas particulier
`remainingTtc === 0`, où l'action tombe d'elle-même, pour la même raison qu'une
facture soldée. Le §11 état 7 est corrigé en conséquence.

**Encaissement en cours :** rien dans le flux n'interrompt un dialogue de
paiement ouvert. Il ne peut être fermé ni par Échap, ni par clic extérieur, ni
par la croix (`InvoicePaymentDialog.tsx:298-313`), et son état vit en local
(`:76-79`). *Reste à vérifier avant l'étape 7* : le temps réel invalide
`invoiceKeys.all` à chaque écriture — si la prop `invoice` change pendant que le
dialogue est ouvert, le montant à encaisser (`:113-118`) se recalcule sous les
doigts de l'utilisateur. Lu dans le code, **non observé à l'exécution**.

### 16-3. La synthèse reste en lecture

Elle a un rôle unique : **comprendre la situation en quelques secondes**. Elle
n'évolue pas au-delà de ça.

- Aucune action, aucun bouton, aucun lien d'action **dans** la synthèse.
- Aucune interaction : ni dépliage, ni filtre, ni saisie.
- Elle ne calcule rien elle-même : elle rend les lignes que
  `computeInvoiceSummary` lui donne (§13).

Cela restreint la zone 2 du §7 : c'est un **bloc de lecture**, pas un tableau de
bord.

### 16-4. L'encaissement reste gouverné depuis Invoice Details

Les actions de paiement — encaisser, demander un acompte, facturer le solde —
**restent où elles sont** : sur la page de détail, dans la zone 3 « prochaine
action ». Elles ne sont **ni déplacées dans la synthèse, ni dupliquées ailleurs**.

Deux conséquences directes sur le plan :

- La zone 2 (synthèse) et la zone 3 (actions) restent **deux blocs distincts**,
  même s'ils se touchent visuellement.
- Le §13 étape 8 — supprimer le dialogue d'encaissement mort de `InvoicesPage`
  — est **confirmé** : la liste n'a pas vocation à encaisser. Le rebrancher irait
  contre cette règle.

