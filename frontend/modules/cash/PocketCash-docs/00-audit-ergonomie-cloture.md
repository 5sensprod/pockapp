# Audit du module `cash` — parcours de fin de journée

**Date :** 21 août 2026, complété le 22 · **Périmètre :** `frontend/modules/cash/`,
`frontend/lib/queries/cash.ts`, `backend/routes/cash_routes.go`,
`backend/reports/cash_reports.go`, `backend/hooks/cash_session_hooks.go`,
`backend/migrations/{cash_sessions,cash_movements,z_reports}.go`.

**Convention de lecture.** Tout ce qui porte un `chemin:ligne` a été LU dans le
code de ce dépôt à cette date. Ce qui est déduit, supposé ou non vérifiable
depuis le code seul est annoncé comme tel, en toutes lettres.

Ce document a été écrit comme un **audit**, sans modifier le code. Une seule
exception depuis : le ticket **A1** a été traité le 22 août 2026 — c'était le
seul défaut comptable avéré. Tous les autres tickets restent à faire.

---

## 1. Cartographie de l'existant

### 1.1 Les écrans et où ils vivent

Le module n'a pas d'écran « caisse » central : tout le parcours de session est
porté par le **shell**, `CashModuleShell.tsx:60`, qui est monté par chacune des
pages (terminal, tickets, config). Les quatre dialogues de session y sont montés
en permanence (`CashModuleShell.tsx:224-253`) et pilotés par `useCashModule.ts`.

| Écran | Fichier | Nature |
|---|---|---|
| Barre de session (badge, Caisse/CA, boutons) | `CashModuleShell.tsx:96-211` | header, toutes pages |
| Ouvrir une session | `components/sessions/OpenSessionDialog.tsx` | dialogue |
| Terminal de vente | `CashTerminalPage.tsx` (`/cash/terminal/`) | page |
| Mouvement de caisse | `components/movements/CashMovementDialog.tsx` | dialogue |
| Rapport X | `components/reports/RapportXDialog.tsx` | dialogue |
| Fermer la session | `components/sessions/CloseSessionDialog.tsx` | dialogue |
| Rapport Z + historique | `RapportZPage.tsx` (`/cash/rapport-z`) | page, 2 onglets |
| Tickets | `TicketsPage.tsx` (`/cash/tickets`) | page |
| Configuration | `CashPage.tsx` → `CashView.tsx` (`/cash/config`) | page |

Le menu latéral (`manifest.ts:29-58`) n'expose que **Terminal, Tickets,
Rapport Z, Configuration**. Il n'y a **aucune entrée « Journal de caisse »**, ni
« Sessions », ni « Rapport X » : le X et les mouvements ne sont atteignables que
par les boutons du header, et **seulement quand une session est ouverte**
(`CashModuleShell.tsx:138`).

### 1.2 Le parcours, étape par étape

**① Ouvrir une session** — bouton « Ouvrir » (`CashModuleShell.tsx:202`) →
`OpenSessionDialog` → `useOpenCashSession` (`lib/queries/cash.ts:454`) →
`POST /api/cash/session/open` (`cash_routes.go:209`).
Refus s'il existe déjà une session `open` sur la caisse (`cash_routes.go:223`).
Persisté : `cash_sessions` avec `status='open'`, `opened_at`, `opening_float`,
`opened_by`. Le fond proposé par défaut est le dernier comptage connu
(`useSessionManager.ts:54-63`, dans l'ordre `counted_cash_total` →
`expected_cash_total` → `opening_float` de la dernière session fermée).

**② Vendre** — `CashTerminalPage.tsx` → `PaymentDialog` → route POS
(`backend/routes/pos_routes.go`). Le ticket est écrit dans `invoices`
(`is_pos_ticket=true`, `session=<id>`, hash + `sequence_number`, verrouillé,
`pos_routes.go:364-386`). **Puis, pour chaque ligne de paiement de catégorie
comptable `cash`, un `cash_movements` de type `cash_in` est créé**
(`pos_routes.go:395-441`), avec `amount = p.Amount` (le dû, pas le reçu ; le
reçu et la monnaie ne vivent que dans `meta`, `pos_routes.go:429-437`).
Une vente en espèces est donc **journalisée**, ce qui est le point clé de la
section 2.

Les paiements **B2B** (factures, acomptes, avoirs hors caisse) passent par
`backend/cash_movement_helper.go:36`, appelé depuis `pay.go:122`,
`deposit.go:265` et `refund.go:277` : si le règlement est en `especes`, un
mouvement est créé **sur la session ouverte de l'entreprise**
(`cash_movement_helper.go:84-91` — n'importe quelle session `open` de la
company, pas nécessairement celle de la caisse concernée). Non fatal : sans
session ouverte, le mouvement est **perdu** avec un simple `log`
(`cash_movement_helper.go:44`).

**③ Mouvement de caisse** — bouton « Mouvement » → `CashMovementDialog` →
`useCreateCashMovement` → `POST /api/cash/movements` (`cash_routes.go:316`).
Quatre types offerts à l'utilisateur (`CashMovementDialog.tsx:52-77`) :
`cash_in`, `cash_out`, `safe_drop`, `adjustment`.

**④ Rapport X** — bouton « Rapport X » → `useXReport` (`cash.ts:274`) →
`GET /api/cash/reports/x` → `reports.GenerateRapportX`
(`cash_reports.go:179-491`). **Tout est calculé en Go**, rien n'est persisté :
le X est une lecture volatile, recalculée à chaque appel (et rafraîchie toutes
les 30 s, `cash.ts:296`). Il agrège les tickets POS de la session
(`cash_reports.go:199`) **et** les factures/avoirs B2B tombés dans la fenêtre
`[opened_at, closed_at|maintenant]` (`cash_reports.go:216-233`).

**⑤ Fermer la session** — bouton « Clôturer » → `CloseSessionDialog` → comptage
par dénominations (`components/types/denominations.ts`) →
`POST /api/cash/session/:id/close` (`cash_routes.go:277`).
Persisté : `closed_at`, `status='closed'`, `closed_by`, et `counted_cash_total`
**seulement si le total compté est strictement supérieur à 0**
(`cash_routes.go:297`).

**⑥ Rapport Z** — `/cash/rapport-z` → `useZReportGenerator` → `useZReport`
(`cash.ts:341`) → `GET /api/cash/reports/z` → `reports.GenerateRapportZ`
(`cash_reports.go:649-1161`). Calculé en Go, **persisté** dans `z_reports`
(`cash_reports.go:1415`), haché en chaîne (`computeZReportHash`,
`cash_reports.go:1367` ; chaînage `previous_hash` via `getNextZSequence`,
`cash_reports.go:1340`), et les sessions consommées sont **marquées**
`z_report_id` (`cash_reports.go:1150-1155`) — c'est ce marquage qui rend le Z
non rejouable.

### 1.3 Le hook de fermeture ne s'exécute jamais — mesuré

`backend/hooks/cash_session_hooks.go` enregistre
`OnRecordBeforeUpdateRequest("cash_sessions")` (ligne 81), qui dans PocketBase
ne se déclenche **que sur l'API REST des records**. Or la fermeture passe par une
route Go custom qui appelle `dao.SaveRecord` (`cash_routes.go:304`), lequel ne
passe pas par ce handler.

**Vérifié sur la base de développement** (`%LOCALAPPDATA%\PocketReact\pb_data`,
copie en lecture seule, 21 août 2026) : sur **toutes** les sessions de la table,
fermées comprises et jusqu'à la plus récente,

```
expected_cash_total = 0   ·   cash_difference = 0   ·   invoice_count = 0
```

alors que `counted_cash_total`, écrit par la route (`cash_routes.go:298`), est
bien renseigné. **Le hook 3 est donc mort** : ses écritures
(`cash_session_hooks.go:206-231`) n'ont jamais eu lieu.

Trois conséquences :

1. La **troisième formule** du montant attendu (§2.4), celle qui double compte,
   est inerte aujourd'hui — mais toujours présente.
2. Le repli n°2 de `CloseSessionDialog.tsx:150` (`session.expected_cash_total`)
   **ne peut que valoir 0** : il n'est pas un filet de sécurité, c'est un piège.
   Si le rapport X échoue, l'attendu affiché tombe directement sur
   `opening_float`, sans que rien ne le signale.
3. La protection « modification interdite d'une session clôturée »
   (`cash_session_hooks.go:86`) **n'existe pas non plus**. La route de fermeture
   refait le contrôle pour elle-même (`cash_routes.go:287`), mais rien ne
   protège une session fermée d'une écriture par l'API REST.

### 1.4 Ce que la base réelle dit de l'usage

Deux observations de la même lecture, qui pèsent sur les recommandations :

- **Les sessions restent ouvertes plusieurs jours.** Durées mesurées sur les dix
  dernières : 17,2 j · 5,0 j · 3,4 j · 3,4 j · 3,4 j · 3,0 j · 2,0 j · 0,4 j ·
  0,0 j · 0,0 j. Une « session de caisse » ici n'est **pas** une journée : c'est
  une période entre deux comptages. Cela invalide en grande partie le rappel
  « session ouverte depuis N heures » du §6.2 (voir la note ajoutée au ticket D1).
- **14 sessions fermées ne portent aucun `z_report_id`** — 14 journées fermées
  sans Z. Le grief « rien ne rappelle de faire le Z » n'est pas une crainte :
  c'est un fait constaté dans la donnée. Le ticket **D2** est donc le plus
  justifié des deux rappels.

---

## 2. D'où vient le « Montant attendu » — le point central

### 2.1 La formule effectivement affichée à la fermeture

`CloseSessionDialog.tsx:146-158` prend, dans cet ordre :

1. `rapportX.expected_cash.total` — **la source réelle en pratique** ;
2. sinon `session.expected_cash_total` (champ probablement jamais écrit, §1.3) ;
3. sinon `session.opening_float` ;
4. sinon `0`.

Donc, en fonctionnement normal, le nombre affiché est celui du rapport X, calculé
en `cash_reports.go:411-413` :

```
movementsTotal = Σ cash_in − Σ cash_out − Σ refund_out − Σ safe_drop
expectedCash   = opening_float + movementsTotal
```

Terme par terme, avec l'origine de la donnée :

| Terme | Où c'est calculé | D'où vient la donnée |
|---|---|---|
| `opening_float` | `cash_reports.go:412` | `cash_sessions.opening_float`, saisi à l'ouverture (`cash_routes.go:237`) |
| `cash_in` | `cash_reports.go:390-391` | `cash_movements` : ventes POS espèces (`pos_routes.go:417`), encaissements B2B espèces (`cash_movement_helper.go:57`), entrées manuelles (`cash_routes.go:340`) |
| `cash_out` | `cash_reports.go:392-393` | sorties manuelles |
| `refund_out` | `cash_reports.go:394-395` | remboursements POS espèces (`cash_routes.go:169`), avoirs B2B espèces (`refund.go:277`) |
| `safe_drop` | `cash_reports.go:396-397` | dépôts coffre manuels |

### 2.2 Réponse aux deux questions posées

**Les ventes réglées en espèces entrent-elles dans l'attendu ?** **Oui — mais
indirectement**, par les `cash_in` créés à la vente (`pos_routes.go:417`), pas
par un terme « ventes espèces ». C'est correct et non redondant.

**Les factures/acomptes réglés en espèces ?** **Oui**, par le même canal
(`cash_movement_helper.go`), **à une condition** : qu'une session ait été
ouverte au moment de l'encaissement. Sinon le mouvement n'existe pas et
l'argent est physiquement dans le tiroir sans être attendu
(`cash_movement_helper.go:43-46`).

**Les mouvements manuels ?** **Oui**, tous — sauf `adjustment` (§2.3).

### 2.3 Trois défauts lus dans le code, par ordre de gravité

**(a) `adjustment` est ignoré par le X.** Le `switch` de
`cash_reports.go:389-398` ne connaît que `cash_in`, `cash_out`, `refund_out`,
`safe_drop`. Or le dialogue **propose** `adjustment`
(`CashMovementDialog.tsx:74`). Un ajustement saisi par l'utilisateur ne bouge
donc **pas** le montant attendu affiché à la fermeture — alors que le Z, lui, le
compte (`cash_reports.go:896-897`). L'écran de comptage et le Z divergeront.

**(b) `refund_out` est ignoré par le Z.** Symétriquement, le `switch` du Z
(`cash_reports.go:891-898`) ne connaît **pas** `refund_out`. Un remboursement en
espèces est donc déduit de l'attendu du X (`:394`) mais **pas** de l'attendu du
Z. Un jour avec un avoir espèces de 200 € affichera un « manque » de 200 € au Z,
sans cause visible.

**(c) Un comptage à zéro n'est pas enregistré.** `cash_routes.go:297` n'écrit
`counted_cash_total` que si `> 0`. Et le Z, s'il lit `counted == 0`, **remplace
le compté par l'attendu et force l'écart à 0** (`cash_reports.go:908-911`). Un
tiroir vidé, ou une clôture faite sans comptage, produit donc un Z
**silencieusement équilibré**. C'est le contraire de ce qu'un contrôle de caisse
doit faire.

### 2.4 Les trois formules concurrentes du dépôt

| Où | Formule |
|---|---|
| Rapport X — `cash_reports.go:413` | `float + (cash_in − cash_out − refund_out − safe_drop)` |
| Rapport Z — `cash_reports.go:905` | `float + (cash_in − cash_out − safe_drop + adjustment)` |
| Hook de fermeture — `cash_session_hooks.go:195` | `float + ventes_espèces + (cash_in − cash_out − safe_drop + adjustment)` |

La troisième **double compte les ventes en espèces**, puisque celles-ci sont
déjà des `cash_in`. Si le hook est mort (§1.3), c'est sans conséquence
aujourd'hui — mais c'est une bombe à retardement : le jour où une fermeture
passera par l'API REST, l'attendu doublera. La fonction `isCashInFromSale`
(`cash_reports.go:1535`), **jamais appelée**, est le vestige d'une tentative de
dédoublonnage : elle témoigne que la question a été posée puis abandonnée.

### 2.5 Pourquoi le nombre est vécu comme opaque

Ce n'est pas seulement un manque de détail : **le détail existe et il est faux**.
`ExpectedCashCard.tsx:30-50` affiche exactement deux lignes — « Fonds de caisse »
et « Impact caisse (journal) » — puis un total. La composition de « impact
caisse » (ventes espèces, encaissements de factures, entrées/sorties manuelles,
remboursements, coffre) n'est nulle part additionnée à l'écran.

Pire, le bloc optionnel juste dessous (`ExpectedCashCard.tsx:55-75`, activé dans
le X par `showSalesInfo={true}`, `RapportXDialog.tsx:172`) affiche « Ventes
espèces (info) » avec la note : *« Il peut être inclus dans l'impact caisse si
les ventes espèces sont journalisées en mouvements. »* **Elles le sont**
(`pos_routes.go:417`) : le code hésite là où l'utilisateur a besoin d'une
certitude. Cette phrase est probablement la source directe du grief.

Et surtout, **l'écran de fermeture n'affiche aucun de ces deux blocs** : il
n'affiche que « Espèces attendues » (`CloseSessionDialog.tsx:376-379`), un
nombre nu, sans même le fonds de caisse à côté.

---

## 3. Journal de caisse

**La donnée existe.** `cash_movements` (`backend/migrations/cash_movements.go:37`)
porte `session`, `movement_type`, `amount`, `reason`, `meta`, `related_invoice`,
`created_by`, `created`. La suppression est interdite par hook
(`cash_session_hooks.go:290`). Chaque vente espèces, chaque remboursement, chaque
encaissement B2B espèces y laisse une ligne.

**Il est affiché à un seul endroit.** `CashMovementsCard.tsx:180-234` rend un
journal ligne par ligne (icône, libellé, horodatage, montant signé), alimenté par
`rapport.movements.details` (`RapportXDialog.tsx:159`), lui-même construit en
`cash_reports.go:400-408`. C'est donc **un onglet du rapport X**, atteignable
uniquement par le bouton « Rapport X » du header, **uniquement session ouverte**
(`CashModuleShell.tsx:138`).

**Conséquence : il est introuvable, et il disparaît.** Aucune entrée de menu
(`manifest.ts:29-58`). Session fermée, le bouton « Rapport X » n'existe plus, et
comme aucun autre écran ne lit les mouvements, **le journal d'une journée passée
n'est consultable nulle part**. Le rapport Z, lui, n'affiche **aucun mouvement** :
`RapportZPage.tsx` montre des totaux de session, jamais le détail (§4.3).

**Ce qui manque, précisément :**

- **Donnée :** rien. Elle est complète et protégée.
- **Route :** il en existe même une inutilisée —
  `GET /api/cash/session/:id/report` (`cash_routes.go:517`) renvoie session +
  mouvements triés, et **n'a aucun appelant** : `useSessionReport`
  (`cash.ts:249`) n'est importé nulle part, pas plus que `useCashMovements`
  (`cash.ts:224`). Le Z ne charge pas non plus les mouvements dans son rendu.
- **Écran :** c'est le seul vrai manque. Un journal autonome, filtrable par
  session ou par jour, atteignable session fermée.

---

## 4. Pertinence, écran par écran

### 4.1 Barre de session (`CashModuleShell.tsx:113-136`)

| Élément | Verdict |
|---|---|
| Badge session + horloge | utile |
| « Caisse : X € » (`:119`) | **le chiffre le plus utile de l'app** — l'attendu temps réel. Mais non cliquable, et son libellé ne dit pas s'il s'agit du théorique ou du compté |
| « CA : X € » (`:128`) | utile, mais c'est le **net** (`useCashModule.ts:90`) sans que rien ne le dise |
| Sélecteur de caisse | **bruit ici** : mono-caisse. Il est déjà caché sauf si `registers.length > 1` (`:172`) — correct |

### 4.2 Rapport X (`RapportXDialog.tsx`)

| Bloc | Verdict |
|---|---|
| Info session | utile |
| Ventes (`:110`) | utile |
| TVA ventilée (`:130`) | utile mais **prématuré ici** : la TVA se lit au Z, pas en cours de journée |
| Remboursements (`:140`) | utile, conditionné à `> 0` — bien |
| Mouvements + journal (`:153`) | **le meilleur écran du module**, et le plus mal placé |
| Espèces attendues (`:166`) | à corriger (§2.5) — le bloc « info ventes » est **à supprimer** |
| E-reporting B2C/B2B (`:181`, `:218`) | **bruit en X.** Une échéance de septembre 2027 n'a rien à faire dans une lecture intermédiaire de milieu de journée. Sa place est le Z |

### 4.3 Fermeture (`CloseSessionDialog.tsx`)

| Élément | Verdict |
|---|---|
| Grille de dénominations (`:301-371`) | **juste** — c'est exactement ce que font les caisses modernes |
| Bouton « Ouvrir tiroir » (`:263`) | utile |
| « Espèces attendues » (`:376`) | **le grief n°1** : nombre nu, sans décomposition, sans lien vers le journal |
| « Écart / Montant attendu » (`:388`) | le basculement tant qu'on n'a rien compté est un bon geste (commit `61dc048`) |
| Seuil d'alerte 10 € en dur (`:169`) | **devrait être un réglage** ; 10 € sur un magasin d'instruments n'a pas le même sens qu'en boulangerie |
| Alerte « Z déjà généré / sessions ouvertes » (`:414`) | **excellent** et correctement expliqué |
| Deux boutons « Fermer » / « Clôturer et générer le Z » (`:446`, `:461`) | **c'est la bonne réponse au grief n°4**, mais elle est invisible tant qu'on n'a pas ouvert le dialogue |

### 4.4 Rapport Z (`RapportZPage.tsx`)

| Bloc | Verdict |
|---|---|
| Onglet Générer / Historique (`:180-193`) | utile |
| Résumé HT/TVA/TTC (`:475-487`) | utile — **mais suspect de double compte, §4.6** |
| Par moyen / net par moyen (`:575`, `:600`) | utile |
| Espèces attendues / comptées / écart / remises (`:625-659`) | utile ; « Remises » est le seul chiffre de la grille qui ne parle pas d'espèces — **mal rangé** |
| Avoirs (`:661`) | utile |
| E-reporting (`:692`) | **à sa place ici** |
| Détail des sessions (`:755`) | utile en multi-session ; en mono-caisse mono-session c'est **la redondance du bloc précédent** |
| Note de verrouillage + hash (`:882`) | utile, rassure |
| **Absent : le journal des mouvements** | **le manque le plus grave du Z** |

### 4.5 Redondances X / Z / fermeture

- L'attendu est **recalculé trois fois** par trois formules différentes (§2.4).
- Le détail par moyen de paiement apparaît en X, en Z global et en Z par session.
- L'écart de caisse apparaît à la fermeture, puis au Z global, puis au Z par
  session — sans qu'aucun des trois ne renvoie vers les mouvements qui
  l'expliquent.

### 4.6 Les totaux du Z sont doublés — confirmé sur les données

**Le mécanisme.** `cash_reports.go:828-830` accumule `sessionHT/TVA/TTC` pour
chaque ticket. Puis `cash_reports.go:852-858` appelle
`aggregateInvoiceIntoTotals`, qui ajoute **les mêmes montants** à
`totalHT/totalTVA/totalTTC` (`:557-559`). Puis `cash_reports.go:914-916` fait
`totalHT += sessionHT`. Les tickets POS sont donc comptés **deux fois** dans
`DailyTotals`, alors que `totalsByMethod` (`:566`) et `globalVATByRate` (`:571`)
ne le sont **qu'une fois**.

**La mesure.** Rapport `Z-2026-000045` du 21 août 2026, choisi parce qu'aucune
facture B2B n'a été encaissée ce jour-là (vérifié : 0) — le cas est donc pur.

| | Tickets réellement en base | Stocké dans `z_reports` |
|---|---|---|
| Nombre de tickets | 21 | 21 ✅ |
| Total HT | 824,03 € | **1 648,06 €** (×2) |
| Total TVA | 155,78 € | **311,56 €** (×2) |
| Total TTC | 979,81 € | **1 959,62 €** (×2) |

Le document se contredit **lui-même** : sa propre ventilation TVA stockée
(`vat_breakdown`) donne `152,34 + 3,44 = 155,78 €`, soit la moitié du
`total_tva` qu'il annonce ; et ses bases HT ventilées (`761,67 + 62,36`) font
`824,03 €` contre un `total_ht` de `1 648,06 €`. La somme des moyens de paiement
(`912,56 + 67,25 = 979,81 €`) vaut également la moitié du `total_ttc`.

**Portée, et une régression datée.** La base porte **45 rapports Z**, du
7 janvier au 21 août 2026, et l'audit complet (méthode et requête :
[`01-verifier-les-totaux-z.md`](01-verifier-les-totaux-z.md)) montre une rupture
nette :

| Période | Rapports | Verdict |
|---|---|---|
| Z-001 → Z-021 (7 jan → 16 mai) | 21 | sains — tickets comptés une fois |
| Z-022 → Z-045 (22 mai → 21 août) | 24 | **doublés** |

La bascule tombe entre le 16 et le 22 mai, et l'historique la nomme : le commit
**156692e du 20 mai 2026**, « fix b2b to facture », a ajouté
`aggregateInvoiceIntoTotals` pour partager l'agrégation avec les factures B2B
**sans retirer** le `totalTTC += sessionTTC` qui suivait la boucle. Régression
purement additive, invisible en relecture parce que les deux écritures sont à
cinquante lignes d'écart. Ce n'est donc pas un défaut d'origine : le Z a été
juste pendant quatre mois.

Le facteur n'est pas toujours exactement 2 : les factures B2B ne sont agrégées
qu'une fois (`:1013`), donc l'erreur varie avec la part du B2B dans la journée.

**État : corrigé le 22 août 2026** — les trois lignes redondantes sont retirées
(`cash_reports.go:913`), sous deux tests qui échouaient avant et passent après
(`backend/reports/cash_reports_test.go`). **Les 24 rapports déjà générés restent
faux** : voir la décision à prendre au §7.5.

**C'est un défaut comptable, pas ergonomique, et il prime sur tout le reste de
ce document.** `total_ht/tva/ttc` entrent dans le **hash**
(`cash_reports.go:1375-1377`) et le hash chaîne les rapports entre eux
(`:1055`) : les 45 Z existants sont figés avec des totaux faux, et corriger le
calcul ne les corrigera pas. C'est ce qui rend le ticket A1 lourd — le code se
répare en quelques lignes, l'historique non.

### 4.7 Code mort — inventaire vérifié

**Méthode.** Deux passes, et non un `grep` : (a) atteignabilité transitive des
fichiers depuis les points d'entrée réels — `frontend/routes/**` et `main.tsx` —
en résolvant l'alias `@/` et les barrels ; (b) recherche, pour chaque symbole
exporté, d'un consommateur **hors barrel et hors son propre fichier**. Les
fichiers de route s'appellant eux aussi `index.tsx`, ils sont explicitement
exclus de la définition « barrel », sans quoi `RapportZPage` et `TicketsPage`
ressortent faussement morts.

**Résultat global :** sur 70 fichiers du module, **2 seulement** sont
inatteignables ; sur 126 symboles exportés analysés (module `cash` +
`lib/queries/cash.ts`), **22** n'ont aucun consommateur. Le module n'est donc
pas un cimetière — mais le mort est concentré exactement là où porte cet audit.

**① Le mort qui compte — le journal et les sessions**

| Symbole | Fichier | Constat |
|---|---|---|
| `useCashMovements` | `lib/queries/cash.ts:224` | aucun appelant |
| `useSessionReport` | `lib/queries/cash.ts:249` | aucun appelant |
| `useZReportById` | `lib/queries/cash.ts:417` | aucun appelant |
| `GET /api/cash/session/:id/report` | `cash_routes.go:517` | son seul appelant est `useSessionReport`, mort |
| `GET /api/cash/reports/z/:id` | `cash_routes.go:436` | son seul appelant est `useZReportById`, mort |

**Ce n'est pas du déchet : c'est la moitié du ticket C1 déjà écrite.** Une route
Go qui renvoie session + mouvements triés, un hook qui lit `cash_movements`, un
hook qui relit un Z archivé — exactement les trois briques dont la page
« Journal de caisse » a besoin. Quelqu'un a construit la plomberie du journal et
n'a jamais branché l'écran.

**② Le mort résiduel — à supprimer sans réfléchir**

| Symbole | Fichier |
|---|---|
| `computeTotal` | `components/reports/utils/calculations.ts:26` |
| `cashKeys` | `lib/queries/cash.ts:25` — utilisé **dans** son fichier, jamais importé ailleurs ; l'invalidation externe n'existe pas |
| `ReportHeader` | `components/reports/components/ReportHeader.tsx` |
| `TerminalHeader` | `components/terminal/layout/TerminalHeader.tsx` — et il est le seul importeur de `components/layout/CashPageHeader.tsx`, qui meurt avec lui |
| `useTicketStats`, `useTicketFilters` | `components/reports/hooks/` — `TicketsPage` refait les deux en ligne |
| `getLineAmounts` | `components/terminal/utils/calculations.ts:27` — usage interne seul |
| `getMultiPaymentLabel`, `getDefaultPaymentMethod`, `getPaymentMethodCode` | `components/terminal/types/payment.ts` |
| `PosPrinterConfigCard.tsx` | `components/hardware/` — **fichier entier inatteignable**, importé par personne, pas même un barrel |
| `components/ticket-detail/index.ts` | barrel inatteignable |
| `isCashInFromSale`, `getMetaMap`, `abs` | `backend/reports/cash_reports.go:1535, 1524, 494` — `getMetaMap` ne sert qu'à `isCashInFromSale`, tous deux vestiges de la tentative de dédoublonnage (§2.4) |

**③ Correction à l'inventaire initial de ce document.** `computeNetByMethod`
(`components/reports/utils/calculations.ts:6`) avait été listée comme morte à
tort : elle est bien consommée par `RapportZPage.tsx:410`. Seule `computeTotal`
l'est.

**④ La collection `closures`.** `backend/migrations/closures.go` crée une
collection référencée uniquement par deux hooks d'interdiction
(`invoice_hooks.go:1035,1039`). Aucune route, aucun écran, aucun hook ne l'écrit
ni ne la lit. C'est une clôture périodique conçue puis abandonnée — sans doute
au profit de `z_reports`.

---

## 5. Ce que font les caisses modernes

Observations d'usage sur les produits cités, pertinentes pour un mono-caisse.
Ce sont des pratiques établies du métier, pas des lectures de code.

**Le comptage de caisse.** Square, Zettle et Lightspeed ouvrent tous la clôture
sur la même page : la grille de dénominations à gauche, et à droite un **encart
permanent** qui empile *fonds de caisse → ventes espèces → encaissements →
retraits → attendu*, avec le compté qui se met à jour à chaque saisie et l'écart
qui n'apparaît qu'ensuite. PocketApp a déjà la grille et déjà le basculement de
l'écart : **il ne manque que l'empilement**.

**Le détail derrière un total.** La règle du métier est simple : *un total
d'argent est cliquable et mène aux lignes qui le composent*. Square fait
descendre de « Espèces attendues » jusqu'à la liste des paiements. Hiboutik place
un lien « détail » à côté de chaque agrégat. Personne n'affiche un attendu sans
chemin vers son détail — c'est exactement le grief remonté.

**Le journal des mouvements.** Chez tous, c'est une **page à part entière**, dans
le menu, avec un filtre par date et par type, consultable **même caisse fermée**.
Il n'est jamais enfoui dans un rapport. Zettle et Lightspeed y mélangent
délibérément les ventes espèces et les mouvements manuels, dans un flux
chronologique unique : c'est le seul moyen de retrouver *où* les 40 € sont
partis.

**La clôture de journée.** Deux gestes séparés partout : **fermer le tiroir**
(compter, un geste par personne, plusieurs fois par jour possible) et **clôturer
la journée** (le Z, un seul par jour, verrouillé). Ce que les bons produits
soignent, c'est le **passage de l'un à l'autre** : après la fermeture, un écran
propose la clôture si c'est la dernière session du jour, et l'explique si ce
n'est pas possible. **PocketApp fait déjà exactement cela**
(`CloseSessionDialog.tsx:461`, `:414`) — c'est plus abouti que la moyenne du
marché, mais rien à l'écran ne le laisse deviner avant d'avoir ouvert le
dialogue.

**Ce qu'on ne reprend pas.** Multi-tiroirs, clôtures par vendeur, rapports
comparatifs, écarts par plage horaire : suite d'entreprise, hors sujet ici.

---

## 6. Le rappel du Z en fin de journée

### 6.1 Ce que la contrainte NF525 autorise

Lu dans le code, deux verrous qui commandent tout le reste :

1. **Le Z consomme les sessions.** Une fois généré, chaque session porte
   `z_report_id` (`cash_reports.go:1150-1155`), et le filtre de génération exclut
   les sessions déjà marquées (`cash_reports.go:696`). Une session fermée **après**
   le Z du jour ne pourra donc **jamais** y entrer.
2. **Un seul Z par caisse et par date** (`cash_reports.go:656-667` : un second
   appel renvoie l'existant au lieu de régénérer) et il est haché en chaîne
   (`:1055`, `:1130`).

**Conséquence directe : oui, un rappel automatique risque de pousser à générer un
Z trop tôt.** Si le rappel se déclenche à 19 h et que le patron rouvre la caisse
à 19 h 30 pour un dernier client, cette vente est **définitivement hors du Z du
jour**. Elle ne disparaît pas de la comptabilité — la session restera sans
`z_report_id` — mais elle n'aura pas de Z, et aucun écran ne signale aujourd'hui
une session orpheline.

Le code s'en protège déjà en amont (`CloseSessionDialog.tsx:177-191` bloque
« Clôturer et générer le Z » si un Z existe ou si une autre session est ouverte),
mais **cette protection ne vaut que pour l'ordre inverse**. Rien ne protège
contre un Z généré trop tôt.

### 6.2 Ce qu'on peut se permettre

**À proscrire :** tout déclencheur qui *génère* un Z sans geste humain — horaire,
inactivité, fermeture de l'application. Générer un Z est un acte fiscal
irréversible ; l'automatiser est le seul vrai risque de ce chantier.

**Recommandé — un rappel qui ne fait rien d'autre que rappeler :**

- **Où l'accrocher :** dans le shell, `CashModuleShell.tsx` — il est monté sur
  toutes les pages du module et possède déjà la session active et la caisse
  sélectionnée. Un bandeau discret sous le header, pas une modale.
- **Quel déclencheur :** la conjonction, évaluée à l'affichage et non par une
  minuterie —
  (a) session ouverte depuis plus de N heures (N réglable, 10 h par défaut)
  **ou** heure locale après une heure de fermeture réglée ; **et**
  (b) au moins une vente dans la session.
  Le bandeau dit *« Session ouverte depuis 11 h — pensez à la clôturer »*, et
  son bouton **ouvre le dialogue de fermeture**. Il ne génère rien.
- **Le second cas, plus important et jamais traité :** **une session fermée hier
  sans Z**. C'est le vrai oubli, et il est détectable sans ambiguïté — une
  session `status='closed'`, `closed_at` sur une date passée, `z_report_id` vide.
  Un bandeau *« Le Z du 20 août n'a pas été généré »* avec un lien vers
  `/cash/rapport-z?date=…` est sans risque : la journée est finie, aucune vente
  ne peut plus y entrer. **Il n'existe aujourd'hui aucune route pour poser cette
  question** — `/api/cash/reports/z/check` (`cash_routes.go:463`) ne répond que
  pour une date qu'on lui donne.
- **Fermeture de l'application :** techniquement possible sous Wails, mais à
  écarter. Un avertissement au moment où l'on ferme est le moment où l'on est le
  moins disponible pour agir, et il ne couvre pas le poste navigateur
  (déploiement multi-postes, `CLAUDE.md`).

---

## 7. Flux cible et plan par tickets

### 7.1 Le parcours recommandé

```
Ouvrir  →  Vendre  →  [Mouvements]  →  Fermer le tiroir  →  Clôturer la journée (Z)
                            ↑                  ↑                      ↑
                    Journal de caisse    l'attendu est      proposé après la
                    (page, au menu)      dépliable ici      dernière fermeture
```

Trois principes, et rien de plus :

1. **Un seul attendu, une seule formule**, calculée en Go, servie à tous les
   écrans.
2. **Tout total d'espèces se déplie** vers les lignes qui le composent.
3. **Le journal est une page**, pas un onglet de rapport, et il survit à la
   fermeture de la session.

### 7.2 Ce qui change, écran par écran

| Écran | Changement |
|---|---|
| **Fermeture** | Sous la grille, un encart dépliable : *Fonds · Ventes espèces · Encaissements factures · Entrées · Sorties · Coffre · Remboursements = Attendu*. Replié par défaut, chaque ligne cliquable vers le journal filtré. Le seuil d'alerte devient un réglage |
| **Rapport X** | On retire le bloc « Ventes espèces (info) » et sa phrase hésitante ; on retire l'e-reporting ; le journal reste mais devient un **lien** vers la page journal |
| **Journal (nouveau)** | Page au menu, filtres date + type, colonne « lié à » vers le ticket, total en pied. Lit `cash_movements` |
| **Rapport Z** | On ajoute le journal de la journée ; on regroupe la grille espèces ; « Remises » sort du bloc espèces |
| **Shell** | Bandeau de rappel (§6.2), deux cas : session trop longue, et journée fermée sans Z |

### 7.3 Les tickets

**Groupe A — calcul et schéma. À faire en premier, indépendamment de l'UI.**

| # | Ticket | Fichiers | Coût |
|---|---|---|---|
| **A1** | ✅ **Calcul corrigé le 22/08/2026** — accumulation redondante retirée, deux tests de non-régression ajoutés. ⏳ **Reste à décider : le sort des 24 Z déjà émis** avec des totaux faux, qui ne peuvent pas être recalculés sans casser la chaîne de hachage (§7.5) | `backend/reports/cash_reports.go:913`, `backend/reports/cash_reports_test.go` | code : petit · décision : **grosse** |
| **A2** | **Une seule fonction `computeExpectedCash`**, partagée par X et Z, traitant les cinq types : `cash_in +`, `cash_out −`, `refund_out −`, `safe_drop −`, `adjustment ±`. Corrige (a) et (b) de §2.3 | `backend/reports/cash_reports.go:385-413, 878-905` | moyen |
| **A3** | **Enregistrer un comptage nul** : distinguer « non compté » de « compté à zéro ». Retirer le `> 0` de la route et le repli `counted==0 ⇒ écart 0` du Z | `backend/routes/cash_routes.go:297`, `cash_reports.go:908-911` | petit |
| **A4** | **Démonter le hook 3 de `cash_session_hooks.go`** — mort, mesuré (§1.3). Retirer sa formule divergente, **reporter sa protection** « session fermée non modifiable » dans la route, et retirer le repli n°2 de `CloseSessionDialog.tsx:150` qui ne peut que valoir 0 | `backend/hooks/cash_session_hooks.go`, `backend/routes/cash_routes.go:277`, `components/sessions/CloseSessionDialog.tsx:146-158` | moyen |
| **A5** | **Route « journées non clôturées »** : sessions fermées, `z_report_id` vide, `closed_at` antérieur à aujourd'hui. **14 cas existent déjà en base** (§1.4). Prérequis du ticket D2 | `backend/routes/cash_routes.go` | petit |
| **A6** | **Exposer la décomposition de l'attendu** dans `RapportX.expected_cash` : un tableau `{libellé, montant, type}` plutôt que le seul `movements`. Prérequis de B1 | `backend/reports/cash_reports.go:481-486`, `frontend/lib/types/cash.types.ts` | moyen |

**Groupe B — affichage. Aucun calcul touché.**

| # | Ticket | Fichiers | Coût |
|---|---|---|---|
| **B1** | **Encart dépliable de l'attendu** à la fermeture (consomme A6) | `components/sessions/CloseSessionDialog.tsx:373-412`, `components/reports/components/ExpectedCashCard.tsx` | moyen |
| **B2** | **Nettoyer `ExpectedCashCard`** : supprimer le bloc « info ventes » et sa phrase hésitante ; réécrire la note explicative | `components/reports/components/ExpectedCashCard.tsx:54-75`, `RapportXDialog.tsx:166-174` | petit |
| **B3** | **Déplacer l'e-reporting du X vers le Z seul** | `components/reports/RapportXDialog.tsx:176-183, 218-284` | petit |
| **B4** | **Libeller les chiffres du header** : « Caisse (attendu) », « CA net » | `CashModuleShell.tsx:113-136` | petit |
| **B5** | **Seuil d'écart réglable** au lieu de 10 € en dur | `components/sessions/CloseSessionDialog.tsx:169`, module `settings` | petit |

**Groupe C — le journal.**

| # | Ticket | Fichiers | Coût |
|---|---|---|---|
| **C1** | **Page « Journal de caisse »** : route, entrée de menu, filtres date/type/session, total en pied. **La plomberie existe déjà et n'attend qu'un écran** (§4.7 ①) : `useCashMovements` (`cash.ts:224`), la route `session/:id/report` (`cash_routes.go:517`) et `useSessionReport` (`cash.ts:249`) sont écrits, fonctionnels et sans appelant. Le coût est celui de l'écran seul | `frontend/routes/cash/journal/`, nouveau `JournalPage.tsx`, `manifest.ts:29-58` | moyen (revu à la baisse) |
| **C2** | **Journal de la journée dans le Z** | `RapportZPage.tsx`, `components/reports/ZReportPDF.tsx` | moyen |
| **C3** | **Rendre les lignes de l'encart B1 cliquables** vers le journal filtré | `CloseSessionDialog.tsx`, `JournalPage.tsx` | petit |

**Groupe D — rappels. Après A5.**

| # | Ticket | Fichiers | Coût |
|---|---|---|---|
| **D1** | **Bandeau « session ouverte depuis N heures »**, N réglable, sans génération automatique. ⚠️ **À reconsidérer avant de le faire** : la mesure du §1.4 montre des sessions ouvertes 3, 5, 17 jours. Ce n'est pas un oubli, c'est l'usage — une session est ici une période entre deux comptages, pas une journée. Un tel bandeau serait allumé en permanence, donc ignoré. **D2 couvre le vrai besoin ; D1 est probablement à abandonner** | `CashModuleShell.tsx`, module `settings` | moyen |
| **D2** | **Bandeau « journée fermée sans Z »** (consomme A5), lien vers `/cash/rapport-z` préfiltré | `CashModuleShell.tsx`, `lib/queries/cash.ts` | moyen |

**Groupe E — nettoyage. À tout moment, sans dépendance.**

| # | Ticket | Fichiers | Coût |
|---|---|---|---|
| **E1** | Supprimer le **groupe ② du §4.7** uniquement (mort résiduel : `computeTotal`, `cashKeys`, `ReportHeader`, `TerminalHeader` + `CashPageHeader`, `useTicketStats`, `useTicketFilters`, `getLineAmounts`, les trois helpers de `payment.ts`, `PosPrinterConfigCard.tsx`, le barrel `ticket-detail/index.ts`, et côté Go `isCashInFromSale`/`getMetaMap`/`abs`). **Ne pas toucher au groupe ①** : C1 le récupère | voir §4.7 ② | petit |
| **E2** | Statuer sur la collection `closures`, jamais lue ni écrite | `backend/migrations/closures.go`, `backend/hooks/invoice_hooks.go:1035-1039` | petit |

### 7.4 Ordre recommandé

**A1 d'abord, et seul** — c'est le seul défaut comptable avéré du module, et la
décision sur les 45 Z existants conditionne la suite. Puis **A3 → A2 → A4**,
puis **B2 → B4 → B3 → B5**, puis **A6 → B1**, puis **C1 → C2 → C3**, puis
**A5 → D2**. **E1/E2** s'intercalent où l'on veut ; **D1 est à trancher avant
d'être planifié**.

Les groupes A et C sont les seuls à porter un vrai risque. B et E sont sans
danger et régleraient déjà, à eux seuls, une bonne partie des griefs de
lisibilité.

### 7.5 A1 — ce qui est fait, et ce qui reste à décider

**Fait le 22 août 2026 :** le calcul est corrigé (`cash_reports.go:913`) et
gardé par deux tests (`backend/reports/cash_reports_test.go`) qui échouaient
avant le correctif. Tout Z généré désormais est juste.

**Non fait, et ce n'est pas une décision technique :** les **24 rapports Z du
22 mai au 21 août 2026 portent des totaux faux**, et ils sont hachés
(`cash_reports.go:1375-1377`) puis chaînés les uns aux autres (`:1055`). Trois
voies, aucune n'est neutre :

1. **Ne rien toucher, documenter.** Les Z restent tels qu'émis ; une note écrite
   recense les 24 rapports, la cause et la période. C'est le comportement
   attendu d'un système NF525 — un document scellé ne se réécrit pas, on émet
   un correctif à côté. **C'est ce que je recommande**, mais la décision revient
   au propriétaire, et probablement à son comptable.
2. **Régénérer.** Il faudrait effacer les `z_report_id` des sessions, supprimer
   les 24 rapports et rejouer — donc **casser la chaîne de hachage** et
   renuméroter. Cela revient à nier que ces documents ont existé. À écarter sauf
   instruction contraire explicite.
3. **Émettre un état rectificatif.** Un document annexe, non scellé, qui donne
   pour chaque journée le total réel recalculé. Coût réel, mais c'est la seule
   voie qui corrige l'information sans toucher aux documents.

**Ce qu'il faut savoir avant de choisir :** les chiffres ci-dessus viennent de
la base de **développement**. Le nombre de rapports touchés chez le client est
inconnu et se mesure avec la requête de
[`01-verifier-les-totaux-z.md`](01-verifier-les-totaux-z.md). Cette mesure est à
faire **avant** d'arbitrer, et elle appartient au chantier A.

Question ouverte que je n'ai pas tranchée : ces totaux ont-ils été **reportés
ailleurs** — déclaration de TVA, export comptable, transmission à un tiers ? Si
oui, la portée dépasse PocketApp et la voie 3 devient probablement obligatoire.
Rien dans le dépôt ne consomme `z_reports` en dehors de l'écran et du PDF
(`RapportZPage.tsx`, `ZReportPDF.tsx`), mais un export manuel ne laisserait
aucune trace dans le code.

---

## 8. Note de méthode sur les mesures

Les chiffres des §1.3, §1.4 et §4.6 viennent d'une **copie en lecture seule** de
`%LOCALAPPDATA%\PocketReact\pb_data\data.db`, prise le 21 août 2026. La base
d'origine n'a pas été ouverte en écriture.

**C'est la base de développement, pas celle du client** — le chantier A du
`CLAUDE.md` rappelle qu'elle a divergé. Cela ne retire rien aux trois constats,
qui portent sur le **comportement du code** et non sur les montants :
un `expected_cash_total` à zéro partout démontre qu'un hook ne s'exécute pas ;
un `total_ttc` égal au double de la somme de ses propres moyens de paiement
démontre une erreur d'agrégation. Les deux se reproduiront à l'identique sur la
base de production, avec d'autres nombres.

En revanche, les **volumes** cités — 45 rapports Z, 14 sessions sans Z, les
durées de session — sont ceux du dév et devront être remesurés sur la base
client lors de la reprise (chantier A).
