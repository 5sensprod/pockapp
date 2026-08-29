# 05 — Le Z v3 : sortir les mouvements de caisse, sans perdre le tiroir

*Contrat, mesures, questions ouvertes. **Aucune écriture** — ni en base, ni dans
`backend/reports/`.*

*27 août 2026. Base de production copiée (`data.db` + `-wal` + `-shm`) depuis
`%LOCALAPPDATA%\PocketReact\pb_data` vers le scratchpad, WAL fusionné, lue en
lecture seule. La base porte aujourd'hui **60 rapports Z**, tous en
`schema_version = 2` — les 46 du contrat précédent, plus ceux émis par
`z-clotures` (voir `04-refonte-du-z.md`, §7).*

Convention, reprise de `04-refonte-du-z.md` : **[lu]** = chemin et ligne dans le
dépôt, ou requête sur la copie de production. **[supposé]** = non démontré, dit
comme tel. **[à trancher]** = ambiguïté que le code ne permet pas de lever ; elle
est posée, pas résolue.

> **Décision du propriétaire, en amont de ce document (27 août 2026) :** le
> rapport Z **n'a pas à connaître les mouvements de caisse** — un apport de fonds
> n'est ni une vente, ni un encaissement de vente. Ces mouvements relèveront d'un
> **journal espèces** distinct, dans le module `stats`.
>
> Ce document ne rediscute pas cette décision. Il mesure ce qu'elle coûte, dit ce
> qui peut partir sans dommage et ce qui ne le peut pas, et pose les points
> restant à trancher.

---

## 0. Le résultat en une ligne

**Les mouvements de caisse ne touchent déjà aucune des quatre lignes du Z**
— ni le total encaissé, ni la TVA, ni le chiffre d'affaires. **[lu]** Ils ne
servent qu'à **une** chose : les espèces attendues du rapprochement.

Les retirer du calcul des lignes est donc un **non-événement** : il n'y a rien à
retirer. Les retirer du **rapprochement**, en revanche, creuse un écart de caisse
fictif de **7 686,14 € sur 17 rapports**. La suite le démontre.

---

## 1. Question 1 — ce que portent les mouvements dans le Z v2

### 1.1 Ce que le code en fait — **[lu]**

Un seul point de lecture dans l'agrégation du Z :
`backend/reports/cash_reports.go:991` — les mouvements d'une session, réduits à
**un scalaire** :

```go
expectedCash := openingFloat + movementsTotal      // :1032
```

`movementsTotal` = `+cash_in` `−cash_out` `−refund_out` `−safe_drop`
`+adjustment` (`:1000-1030`). Ce scalaire alimente `totalCashExpected`
(`:1052`) et rien d'autre. **Il n'entre ni dans `totalTTC`, ni dans
`collectedTTC`** : ce dernier vaut, mot pour mot,
`totalTTC + ligneCreances.TTC + ligneAcomptes.TTC − creditNotesTotal`
(`cash_reports.go:1241-1243`). Aucun mouvement dedans.

### 1.2 Ce que le Z **stocke** des mouvements — **[lu]** : rien

`saveZReport` (`cash_reports.go:1705-1755`) ne pose **aucun** champ de mouvement
sur `z_reports`. `SessionSummary` (`:735-750`) n'en porte pas non plus — donc
même le `full_report` JSON n'en garde pas la trace. Le Z ne conserve que les
**trois** chiffres du rapprochement : `total_cash_expected`,
`total_cash_counted`, `total_cash_difference`.

Le détail ligne à ligne (`MovementDetail`, `MovementsSummaryX`) n'existe que dans
le **rapport X** (`cash_reports.go:422-460`, structures `:147-190`), et n'est
affiché que par lui : `CashMovementsCard` et `ExpectedCashCard` n'ont qu'un seul
appelant, `RapportXDialog.tsx:189` et `:202` — **[lu]**, `grep` sur
`frontend/modules/cash`.

**Conséquence, et elle est confortable :** le Z v2 n'a pas de « ligne
mouvements » à supprimer. Il n'en a jamais eu.

### 1.3 Effet sur `collected_ttc` — **[lu]** : aucun, et c'est structurel

`z_lignes.go` — le classificateur partagé — ne mentionne ni `cash_movements`, ni
`cash_in`, ni `safe_drop` : il classe des **documents**, pas des mouvements.
Un mouvement ne peut donc pas, par construction, entrer dans une des quatre
lignes.

### 1.4 Ce que porte le tiroir, mesuré

193 mouvements en base. Ventilés selon qu'ils sont **liés à une vente**
(`related_invoice` non vide, ou `meta.invoice_id` / `meta.invoice_number`) ou
**libres** :

| Type | Origine | Nombre | Montant |
|---|---|---|---|
| `cash_in` | **lié à une vente** | 160 | 10 728,01 € |
| `refund_out` | **lié à une vente** | 10 | 500,40 € |
| `cash_in` | libre | 2 | 13,86 € |
| `cash_out` | libre | 20 | 8 000,00 € |
| `safe_drop` | libre | 1 | 500,00 € |

**Deux populations, nettement séparées : 170 mouvements de vente, 23 mouvements
de tiroir.** Aucun mouvement n'est ambigu — aucun `cash_out` lié à une vente,
aucun `cash_in` de vente sans référence de document.

Le détail des 23 libres, net de −8 486,14 € :

| Nature | Nombre | Montant |
|---|---|---|
| Remise en banque / dépôt (`cash_out`, plus le `safe_drop` « pOUR LA BANQUE ») | 18 | 8 210,00 € |
| Achat de marchandise en espèces (« Rachat pédale effet guitare M. Jouault », « Règlement Especes Guitare electrique Lag et ampli blackstar v3 ») | 2 | 190,00 € |
| Frais divers (« Eau Carrefour », « Crédit IA ») | 2 | 50,00 € |
| Apport / monnaie rendue (`cash_in`) | 2 | 13,86 € |

**79 % des mouvements libres, en nombre, sont des remises en banque.** Le
journal espèces sera d'abord un **journal de remises en banque**.

> **Il existe déjà un discriminant dans le code, et il est mort.**
> `isCashInFromSale` (`cash_reports.go:1831`) lit exactement
> `meta.invoice_id` / `meta.invoice_number` — et **aucun appelant** :
> `grep -rn "isCashInFromSale" backend/` ne rend que sa définition. **[lu]** La
> règle a été écrite, jamais branchée. Le v3 est l'occasion de la brancher, ou de
> la supprimer.

---

## 2. Question 2 — ce qui reste dans le Z, ce qui part au journal

### 2.1 Ce qui part — sans discussion

- **Le détail des mouvements libres** : qui, quand, combien, pourquoi. Le Z n'en
  porte rien aujourd'hui (§1.2) : le journal ne lui **retire** donc rien, il
  **crée** une vue qui n'existait pas.
- **Le journal ligne à ligne du rapport X** : à terme, `MovementsSummaryX` fait
  double emploi avec le journal espèces. **[à trancher]** — voir §6, question C.

### 2.2 Ce qui reste — et pourquoi il n'a pas le choix

- **Les mouvements liés à une vente** (170 mouvements, 10 728,01 € entrés,
  500,40 € sortis). Ce ne sont pas des « mouvements de caisse » au sens de la
  décision : ce sont les **espèces des ventes elles-mêmes**, matérialisées par
  `pos_routes.go` à raison d'un mouvement par ligne espèces
  (`04-refonte-du-z.md`, §2, **[lu]**). Les sortir du Z reviendrait à ne plus
  savoir combien d'espèces les ventes ont apporté au tiroir.
- **Le fonds d'ouverture.** Il n'est pas un mouvement — c'est un champ de
  session, `opening_float` (`cash_reports.go:882`). Il ne part **pas** au
  journal, et il ne faut pas le confondre avec un `cash_in` d'apport.
  `04-refonte-du-z.md` §7 dit ce que coûte l'erreur inverse : deux sessions dont
  le fonds saisi était déjà **net** de la remise en banque, la remise
  retranchant une seconde fois, et des espèces attendues à −154,04 € et
  −170,24 €. **Un tiroir négatif n'existe pas.**
- **Le solde net des mouvements libres**, dans le rapprochement — et c'est
  l'objet de la question 3.

### 2.3 Le piège du fonds d'ouverture, reformulé pour le v3

Le fonds d'ouverture est un **solde**, les mouvements sont des **flux**. Le
journal espèces devra présenter le fonds comme un **solde d'ouverture**, jamais
comme une entrée : sinon il compterait comme un apport l'argent qui était déjà
dans le tiroir la veille, chaque jour. **[à trancher]**, question B du §6 : le
journal espèces raisonne-t-il par **session** (comme le Z) ou par **journée**
(comme le journal des ventes) ? Les deux ne donnent pas le même solde
d'ouverture quand une journée porte deux sessions.

Signal d'alerte mesuré : **7 des 60 Z portent un `total_cash_expected` négatif.**
La même anomalie de saisie que §7 du contrat v2, non encore reprise sur ces
sept-là. Le journal espèces les rendra visibles ; il ne doit pas les créer.

---

## 3. Question 3 — le rapprochement espèces survit-il ?

**Non, pas si le Z cesse de compter les mouvements libres dans ses espèces
attendues.** C'est la mesure décisive de cette session.

Simulation : espèces attendues recalculées sans les 23 mouvements libres, face au
**comptage réel** du tiroir, qui, lui, ne changera jamais — l'argent est
physiquement sorti.

| | Sur les 17 rapports concernés |
|---|---|
| Écart de caisse cumulé aujourd'hui (v2) | **2 930,08 €** |
| Écart de caisse cumulé sans les mouvements libres | **10 616,22 €** |
| **Écart fictif créé** | **+7 686,14 €** |

Détail des rapports les plus touchés :

| Rapport | Jour | Écart v2 | Mouvements libres | Écart si retirés |
|---|---|---|---|---|
| Z-2026-000058 | 2026-08-20 | 1 239,60 | −1 090,00 | **2 329,60** |
| Z-2026-000053 | 2026-07-23 | 787,40 | −610,00 | **1 397,40** |
| Z-2026-000048 | 2026-07-04 | −35,27 | −1 040,00 | **1 004,73** |
| Z-2026-000042 | 2026-06-19 | −0,79 | −1 000,00 | **999,21** |
| Z-2026-000057 | 2026-08-19 | −230,48 | −1 150,00 | **919,52** |
| Z-2026-000051 | 2026-07-18 | 430,71 | −280,00 | 710,71 |
| Z-2026-000055 | 2026-08-01 | 209,36 | −420,00 | 629,36 |
| Z-2026-000045 | 2026-07-01 | 15,60 | −580,00 | 595,60 |
| Z-2026-000036 | 2026-06-05 | 160,86 | −430,00 | 590,86 |
| Z-2026-000034 | 2026-06-03 | **1,35** | −300,00 | **301,35** |

La dernière ligne est la plus parlante : `Z-2026-000034` est le rapport que
l'opération du 24 août a ramené à **1,35 €** d'écart, au prix de trois outils et
d'une sauvegarde (`04-refonte-du-z.md`, §7). Le priver des mouvements le
renverrait à 301,35 €.

**Deux rapports parmi les 19 touchés échappent au calcul** : leur session porte
un comptage à zéro, et `cash_reports.go:1035-1038` force alors
`countedCash = expectedCash`, écart nul. Ils absorberaient le changement en
silence — ce qui est pire, pas mieux.

### 3.1 Ce que dit cette mesure

Le rapprochement espèces n'est **pas** une affaire de chiffre d'affaires : c'est
une équation de tiroir.

```
fonds d'ouverture + espèces des ventes − remboursements espèces
                  + apports − sorties − remises en banque
                  = ce qui doit être dans le tiroir
```

Chacun des termes est indispensable, quelle que soit sa nature comptable. **Un
apport de fonds n'est pas une vente — mais il est bien dans le tiroir.** La
décision « le Z n'a pas à connaître les mouvements de caisse » est juste au
niveau des **lignes** ; elle est intenable au niveau du **tiroir**.

### 3.2 La proposition

**Le Z v3 garde le rapprochement, et une seule ligne de plus.** Il ne montre
aucun détail, ne nomme aucun motif, ne donne aucun horaire : il montre le
**solde net** des mouvements de tiroir, et renvoie au journal espèces pour le
détail.

```
RAPPROCHEMENT ESPÈCES
  Fonds d'ouverture .........................    145,96 €
  Espèces des ventes ........................  + 746,46 €
  Mouvements de tiroir (détail au journal) ..  − 300,00 €
  ─────────────────────────────────────────
  Attendu ...................................    592,42 €
  Compté ....................................    593,77 €
  Écart .....................................      1,35 €
```

Ce que le v3 **ajoute** par rapport au v2, c'est la **décomposition** : le v2
n'affiche que `attendu / compté / écart`, en laissant `movementsTotal` invisible.
Le commerçant qui voit 592,42 € ne sait pas d'où ils sortent. Ici, la ligne
« mouvements de tiroir » est précisément celle qui, une fois nommée, dit *« va
voir le journal espèces »*.

C'est aussi la seule présentation qui rende le piège du §7 visible **avant** de
faire des dégâts : un fonds d'ouverture faux se voit à l'œil sur une
décomposition en quatre termes, jamais sur un total unique.

**Deux champs neufs sur `z_reports`**, tous deux hachés :

| Champ | Contenu |
|---|---|
| `cash_from_sales` | espèces des ventes — mouvements liés à un document |
| `cash_drawer_movements` | solde net des mouvements libres (apports − sorties − remises) |

`total_cash_expected` reste **exactement ce qu'il est aujourd'hui**, et vaut
désormais, par identité vérifiable :
`opening_float + cash_from_sales + cash_drawer_movements`. C'est un **invariant
de test**, au même titre que « le total égale la somme de ses quatre lignes ».

> `cash_from_sales` existe déjà, calculé, dans le rapport **X** :
> `SalesCash` (`cash_reports.go:547`), alimenté par `cashFromSales` (`:393`).
> Dans le Z il est calculé (`:904` et `:960`) mais **jamais restitué** —
> **[lu]**. Le v3 n'invente rien, il expose.

---

## 4. Question 4 — `schema_version = 3` et le prédicat de relecture

`ZSchemaVersionCourante` passe de 2 à 3 (`cash_reports.go`, constante déclarée
juste après `DailyTotalsSummary`). Les 60 Z existants restent en 2 : **un
document scellé se relit sous la règle qui l'a produit.**

Le prédicat se lit dans `frontend/lib/types/cash.types.ts:287`. Celui de la v2
est un **seuil** (`>= 2`), volontairement, et c'est cette forme qu'il faut
garder : une v3 est *aussi* un Z à quatre lignes.

```ts
/**
 * estZQuatreLignes dit si un rapport suit le contrat du 23 août 2026.
 * Un seuil, pas une égalité : une v3 est aussi un Z à quatre lignes.
 */
export function estZQuatreLignes(totals: { schema_version?: number }): boolean {
	return (totals.schema_version ?? 1) >= 2
}

/**
 * estZTiroirDetaille dit si le rapprochement espèces est décomposé.
 *
 * Contrat du 27 août 2026 : le Z ne porte plus les mouvements de caisse, dont
 * le détail vit au journal espèces ; il porte en revanche `cash_from_sales` et
 * `cash_drawer_movements`, et son attendu est leur somme avec le fonds
 * d'ouverture.
 *
 * ⚠️ Ne PAS l'écrire `=== 3`. Un prédicat par égalité oblige à repasser sur
 * l'écran, le PDF et le dialogue X à chaque version — et le premier oublié
 * affichera un rapport v4 comme un rapport v1, sans erreur.
 */
export function estZTiroirDetaille(totals: { schema_version?: number }): boolean {
	return (totals.schema_version ?? 1) >= 3
}
```

Trois branchements, et **les mêmes trois que la v2** — c'est la règle qui compte
plus que le code : `RapportZPage.tsx:411`, `ZReportPDF.tsx:195`,
`RapportXDialog.tsx:118`. Un quatrième appelant du même prédicat ailleurs serait
une seconde implémentation déguisée.

**Les champs neufs sont optionnels côté TypeScript**, comme les `collected_*` :
un rapport v2 relu ne les porte pas, et l'affichage doit retomber sur le
rapprochement en trois chiffres — pas afficher des zéros, qui se liraient comme
« aucune espèce de vente ce jour-là ».

---

## 5. Question 5 — simulation sur les 60 rapports

**Aucune écriture.** Recalcul sur la copie de production.

| | Effet du contrat v3 |
|---|---|
| Rapports dont le **total encaissé** change | **0** |
| Rapports dont une des **quatre lignes** change | **0** |
| Rapports dont `total_ht` / `total_tva` / `total_ttc` changent | **0** |
| Rapports dont l'**écart de caisse** change | **0** |
| Rapports dont l'**attendu** change | **0** |
| Rapports gagnant deux champs et un `schema_version` | **60** |
| Rapports dont le **hash** change | **60** — mécanique, les champs neufs entrent dans le hash |

**Le v3 ne déplace pas un centime.** C'est le résultat attendu et il est
cohérent avec le §1 : les mouvements ne touchaient déjà que l'attendu, et
l'attendu ne change pas — il est seulement **décomposé**.

Le seul travail de reprise est donc un **rejeu de la chaîne de hachage** :
`z-repair -apply`, 60 rapports, sauvegarde préalable, application fermée. Même
geste que le 24 août, sans risque de montant.

> **Contre-simulation, pour mémoire — l'option écartée.** Si le v3 retirait
> vraiment les mouvements libres de l'attendu : **17 rapports** changeraient
> d'écart, pour **+7 686,14 €** d'écart fictif cumulé, dont cinq au-dessus de
> 900 €. C'est le §3. Cette option n'est pas retenue.

---

## 6. Ce qui reste à trancher — questions au propriétaire

### Question A — la ligne « mouvements de tiroir » est-elle acceptable dans le Z ?

Le §3 démontre que le **nombre** doit rester dans le calcul. Reste à décider
s'il doit **s'afficher**.

- **Affiché** (recommandé, §3.2) : le commerçant comprend son attendu, et un
  fonds d'ouverture faux se voit.
- **Caché** : le Z ne montre qu'`attendu / compté / écart`, exactement comme
  aujourd'hui, et le nombre reste dans le calcul sans être nommé. Plus fidèle à
  la lettre de la décision, mais rend l'attendu inexplicable sans ouvrir un
  autre écran.

### Question B — le journal espèces raisonne-t-il par journée ou par session ?

Le journal des **ventes** lit les documents **jour par jour**, et non les
`z_reports`, parce que 69 % de l'argent hors caisse tombe de journées sans
clôture (`CLAUDE.md`, module `stats`). Mais un mouvement de caisse porte une
`session` — **et aujourd'hui, les 23 mouvements libres sont tous dans une
session rattachée à un Z** ; aucun n'est orphelin (**[lu]**, mesuré).

`CreateCashMovementIfEspeces` **abandonne en silence** s'il ne trouve pas de
session ouverte (`04-refonte-du-z.md`, §2) : un mouvement hors session n'existe
pas, il est **perdu**. Un journal par journée les verrait tout de même — mais
il n'y en a aucun à voir.

- **Par journée** : cohérent avec le journal des ventes, et robuste si la règle
  de session change un jour.
- **Par session** : le solde d'ouverture est alors `opening_float`, un chiffre
  **lu**, et non reconstruit. Une journée à deux sessions se lit sans ambiguïté.

Recommandation : **par journée en présentation, par session en calcul du
solde** — le journal groupe les sessions d'une journée, et le solde d'ouverture
de la journée est l'`opening_float` de la **première** session. À valider.

### Question C — le rapport X garde-t-il son journal de mouvements ?

Le X est l'aperçu d'une session en cours ; son journal ligne à ligne
(`CashMovementsCard`) est utile **pendant** le service, quand le journal espèces
ne sera pas ouvert. Recommandation : **le garder**, et ne pas le considérer
comme un doublon. Mais c'est bien une seconde vue des mêmes données — elle doit
lire **la même sélection** que le journal, jamais recalculer une règle
(`CLAUDE.md`, « un seul chemin d'agrégation »).

### Question D — que fait-on de `isCashInFromSale` ?

Elle est morte (`cash_reports.go:1831`, aucun appelant). Deux issues, pas trois :
la **brancher** comme discriminant unique des deux populations du §1.4 — le v3 en
a besoin pour séparer `cash_from_sales` de `cash_drawer_movements` —, ou la
**supprimer**. La laisser morte une version de plus, c'est garder une règle
plausible qui ne s'applique nulle part.

À noter : elle ne lit que `meta`, alors que les mouvements de vente portent aussi
`related_invoice`. **[à trancher]** : le discriminant est-il `meta` seul,
`related_invoice` seul, ou l'un **ou** l'autre ? Les trois donnent le même
résultat sur les données d'aujourd'hui — mesuré, aucun mouvement n'est classé
différemment selon le critère —, ce qui rend le choix gratuit **maintenant** et
coûteux plus tard.

### Question E — le ticket C-4, toujours ouvert

`CreateDepositInvoice` crée un `cash_movements` sur un document `is_paid = false`
(`04-refonte-du-z.md`, §2). Le chemin reste non éprouvé : **aucun des 20 acomptes
ne porte de mouvement**. Le v3 ne le règle pas, mais le journal espèces le rendra
visible le jour où il se produira — un mouvement de vente sans document payé.

---

## 7. Plan par tickets

> ### État au 27 août 2026 — arbitré, implémenté, **APPLIQUÉ EN PRODUCTION**
>
> **Les questions du §6 sont tranchées** par le propriétaire :
>
> | # | Réponse | Effet |
> |---|---|---|
> | **A** | **Le rapprochement espèces SORT du Z entièrement** — « on simplifie le Z, la fiscalité n'en a pas besoin » | va plus loin que le §3.2, qui proposait de l'afficher décomposé |
> | **B** | Journal espèces **par journée seule** | ticket B-1, hors de cette session |
> | **C** | Le rapport X **garde** son journal ligne à ligne | inchangé |
> | **D** | `isCashInFromSale` branchée, critère **`meta` OU `related_invoice`** | **sans objet en l'état — voir ci-dessous** |
> | **E** | Ticket C-4 **laissé ouvert** | inchangé |
> | — | `schema_version` → **3**, avec rejeu des 60 | |
> | — | **V-1 abandonné** : ni migration, ni champ neuf | |
>
> **La réponse A change le plan de ce document.** Le §3 démontrait qu'il ne faut
> pas *fausser* l'attendu en lui retirant les mouvements libres (+7 686,14 €
> d'écart fictif). Le retirer entièrement de l'AFFICHAGE ne fausse rien : le
> calcul reste intact, seul le document cesse de le montrer. Deux lectures ont
> confirmé que le rapprochement ne disparaît de nulle part — **[lu]**
> `CloseSessionDialog.tsx:376-408` l'affiche au moment du comptage du tiroir en
> lisant le rapport X comme source de vérité (`:71`, `:147`), et
> `ExpectedCashCard` (`RapportXDialog.tsx:202`) porte **déjà** la décomposition
> en quatre termes que le §3.2 proposait d'ajouter au Z.
>
> **V-1 tombe, et avec lui la moitié du plan.** `cash_from_sales` et
> `cash_drawer_movements` n'avaient qu'un objet : décomposer un attendu
> **affiché**. Sans affichage, ils n'ont aucun lecteur — et le journal espèces,
> décidé par journée, lira les `cash_movements` directement. Aucune migration
> n'est nécessaire : `schema_version` existe déjà (`z_reports_collected.go:69`).
>
> **Fait :**
>
> - `ZSchemaVersionCourante` = **3** (`cash_reports.go`).
> - `estZSansRapprochementEspeces` (`cash.types.ts`), **seuil `>= 3`**, deux
>   branchements — `RapportZPage.tsx` et `ZReportPDF.tsx`, bloc global **et**
>   bloc par session. Le dialogue X n'en est pas un : il n'est pas un document
>   scellé. Les remises (`total_discounts`), qui ne sont pas du tiroir, restent.
> - Trois gardiens dans `cash_reports_test.go` : une remise en banque ne touche
>   aucune des quatre lignes mais sort bien du tiroir ; l'attendu vaut
>   `opening_float + mouvements` et une vente espèces n'est comptée qu'une fois ;
>   la version courante vaut au moins 3 et deux rapports de versions
>   différentes n'ont pas le même hash. `go test ./backend/reports/...` : **ok**.
> - Le gardien de version existant compare désormais à `ZSchemaVersionCourante`
>   au lieu de la constante littérale `2`.
>
> **Simulation V-7, sur copie de la base de production** (`z-repair`, sans
> `-apply`) :
>
> | | |
> |---|---|
> | rapports examinés | **60** |
> | aux **montants** corrigés | **0** |
> | enrichis (argent inchangé) | **60** |
> | en erreur | **0** |
> | correction cumulée de l'argent encaissé | **+0,00 €** |
> | lignes équilibrées | **60 / 60** |
>
> Cumul encaissé **95 216,85 €**, identique au §7 de `04-refonte-du-z.md`. Les
> **60 hash changent** — `schema_version` est haché : la colonne « 0 rechaînés »
> est un artefact du `switch` en cascade de `z-repair/main.go:86-101`, qui range
> un rapport dans « enrichi » avant d'atteindre « hash rechaîné ». Les 60 lignes
> sont affichées, et `main.go:121` ne les affiche que si le hash diffère.
>
> **V-7 appliqué en production le 27 août 2026**, application fermée (processus
> `PocketReact-dev` arrêté, port 8090 libre), après sauvegarde complète dans
> `%LOCALAPPDATA%\PocketReact\pb_data-sauvegarde-avant-V7-20260827-195539`
> (1,7 Go, `data.db` + WAL + SHM + `storage`).
>
> `z-repair -apply` : **60 rapports réécrits, 0 aux montants corrigés**,
> correction cumulée **+0,00 €**, chaîne de hachage reconstruite. Un **second
> passage en simulation ne trouve plus rien** — 0 enrichis, 0 rechaînés : le
> rejeu est idempotent, c'est le meilleur contrôle qu'on puisse en faire.
>
> Relu en base, en lecture seule, après l'opération :
>
> | | |
> |---|---|
> | rapports en `schema_version` 3 | **60 / 60** |
> | cumul encaissé | **95 216,85 €** — identique à l'avant |
> | cumul ligne 1 (ventes du jour) | 88 882,29 € |
> | écart de caisse cumulé, **toujours stocké** | 3 257,92 € |
> | rapports portant encore un `total_cash_expected` | **54** — le rapprochement est caché, pas effacé |
> | maillons de hachage rompus | **0** |
> | hash vides | **0** |
>
> **Reste à faire :**
> - **Question D sans objet en l'état.** `isCashInFromSale` n'a **pas** été
>   branchée, et c'est délibéré : V-1 tombé, elle n'a plus rien à alimenter dans
>   `aggregateZ` — `expectedCash` ne change pas de valeur et aucun champ neuf
>   n'est restitué. L'y écrire produirait du code mort, exactement ce que la
>   question D cherchait à éviter. **[lu]** : dans `aggregateZ` comme dans
>   `GenerateRapportX`, `cashFromSales` se calcule depuis les **factures**
>   (`method == "especes"` → `+= ttc`), jamais depuis les mouvements, et
>   `movementsTotal` agrège **tous** les mouvements sans discriminer.
>   Le seul endroit où elle produirait un effet visible est le **rapport X** :
>   `ExpectedCashCard` y affiche « Fonds + Impact caisse (journal) = Total
>   attendu », en reléguant les ventes espèces dans un encadré dont le texte dit
>   qu'elles « peuvent être incluses dans l'impact caisse **si** les ventes
>   espèces sont journalisées en mouvements ». **Elles le sont** — mesuré au
>   §1.4 : 160 `cash_in` liés à une vente, 10 728,01 €. Brancher le discriminant
>   là ferait de cette carte une vraie addition. À décider séparément : c'est un
>   changement d'affichage du X, que l'arbitrage n'a pas demandé.
> - ~~**B-1**, le journal espèces, par journée.~~ **Fait le 28 août 2026** :
>   `backend/reports/journal_especes.go`, route
>   `GET /api/reports/journal-especes`, écran `/stats/especes`. Il lit TOUS les
>   mouvements du tiroir, par journée, décompose le solde et présente le fonds
>   d'ouverture comme un solde. Trois gardiens
>   (`journal_especes_test.go`) : le solde est la somme de ses flux, le fonds
>   n'est jamais compté comme un apport, et le discriminant lit `meta` **et**
>   `related_invoice`.
> - **Question D refermée** : `isCashInFromSale` est SUPPRIMÉE, la règle vit
>   dans `estMouvementDeVente`, branchée par le journal. En la branchant, un
>   défaut jamais vu est apparu : `getMetaMap` ne décodait pas `types.JsonRaw`
>   et rendait toujours nil — la règle aurait classé TOUS les mouvements comme
>   « pas une vente ». Corrigé, voir `docs/DECISIONS.md` du 28 août.



| # | Ticket | Nature | Dépend de |
|---|---|---|---|
| **V-0** | **Trancher les questions A à D** (§6) | décision | — |
| **V-1** | Migration `AddCashBreakdownToZReports` : `cash_from_sales`, `cash_drawer_movements`, `schema_version` à 3. **Inscrite dans `RunMigrations`** — sans quoi elle ne s'exécute jamais, sans erreur | **schéma** | V-0 |
| **V-2** | Brancher (ou retirer) `isCashInFromSale`, et l'utiliser comme **unique** discriminant des deux populations, dans `aggregateZ` **et** dans `GenerateRapportX` | **calcul** | V-0 (question D) |
| **V-3** | `aggregateZ` restitue `cash_from_sales` et `cash_drawer_movements`. `expectedCash` **ne change pas de valeur** | **calcul** | V-1, V-2 |
| **V-4** | Les deux champs et `schema_version = 3` entrent dans le hash | **calcul** | V-3 |
| **V-5** | Gardiens (`cash_reports_test.go`) : l'attendu égale `opening_float + cash_from_sales + cash_drawer_movements` ; une remise en banque **ne touche aucune des quatre lignes** ; une vente espèces entre dans `cash_from_sales` et **pas** dans `cash_drawer_movements` ; un rapport v2 relu ne prétend pas porter les champs neufs | **calcul** | V-3, V-4 |
| **V-6** | `estZTiroirDetaille` et les trois branchements — écran, PDF, dialogue X. **Rien ne se recalcule côté React** | **affichage** | V-4 |
| **V-7** | `z-repair -apply` : 60 rapports, aucun montant modifié, chaîne rechaînée. Sauvegarde, application fermée | exploitation | V-5, V-6 |
| **B-1** | **Le journal espèces dans `/stats`** — mission B, dépend du §6 question B. Modèle : le journal des ventes, `/api/reports/journal` | **module** | V-0 |

**Ordre :** V-0 → V-1, V-2 → V-3 → V-4 → V-5 → V-6 → V-7. B-1 après V-0, en
parallèle du reste.

---

## 8. Ce qui n'est pas touché

- **Les quatre lignes** et le total encaissé : aucun centime, aucun rapport (§5).
- **`invoices`** : aucune écriture. Rien de ce contrat ne regarde les documents.
- **La sélection des sessions d'un Z** : `z_report_id` et le découpage par
  journée restent tels quels.
- **`aggregateZ` reste le chemin unique**, partagé avec `z-repair`, et
  `z_lignes.go` reste le classificateur partagé avec le X. Le v3 ajoute deux
  sorties à la fonction existante ; il n'en crée pas une seconde.
